"""CLI — mirrors lib/premium-analysis compute + agents layer (S1–S6 offline parity)."""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

from .agents_outputs import enrich_summary_with_agents_outputs
from .constants import DEFAULT_MAPPING_FILE, DEFAULT_OUTPUT_DIR, UPS_PARSE_VERSION
from .engine import compute_invoice_analysis_summary
from .export import build_summary_tables, export_combined_invoice_mapped, export_workbook
from .export_html import export_html_report
from .ingest import ingest_folder
from .ingest_diagnostics import build_ingest_diagnostics, empty_ingest_diagnostics
from .mapping import build_charge_description_lookup, load_master_mapping_xlsx
from .records import enrich_records, records_to_dataframe, unmapped_charge_summary
from .stale_ingest import detect_stale_ingest
from .test_golden import run_golden_test
from .utils import fmt_money


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Offline Premium Analysis (UPS / FedEx / WWE) — mirrors lib/premium-analysis",
    )
    parser.add_argument("--golden", action="store_true", help="Run synthetic parity test and exit")
    parser.add_argument("--input-dir", help="Folder of invoice CSV + Excel files")
    parser.add_argument("--csv", type=Path, help="Single UPS CSV file")
    parser.add_argument(
        "--mapping-file",
        default=str(DEFAULT_MAPPING_FILE),
        help=f"Master mapping workbook (default: {DEFAULT_MAPPING_FILE})",
    )
    parser.add_argument(
        "--output-dir",
        default=str(DEFAULT_OUTPUT_DIR),
        help=f"Output folder (default: {DEFAULT_OUTPUT_DIR})",
    )
    parser.add_argument("--output-name", default="invoice_kpi_dashboard.xlsx", help="Excel workbook filename")
    parser.add_argument(
        "--html-name",
        default="",
        help="HTML report filename under --output-dir (default: same stem as --output-name)",
    )
    parser.add_argument(
        "--combined-file",
        default="",
        help="Optional single-sheet mapped export filename under --output-dir",
    )
    parser.add_argument("--json-out", type=Path, help="Write summary JSON (dashboard-shaped)")
    parser.add_argument("--no-recursive", action="store_true", help="Do not scan subfolders")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    if args.golden:
        run_golden_test()
        return 0

    mapping_file = Path(args.mapping_file).expanduser().resolve()
    if not mapping_file.exists():
        print(f"[ERROR] Mapping file not found: {mapping_file}", file=sys.stderr)
        return 1

    start = time.time()
    import pandas as pd

    mapping_rows = load_master_mapping_xlsx(mapping_file)
    lookup = build_charge_description_lookup(mapping_rows)

    if args.csv:
        from .ingest_dedupe import dedupe_records_stable
        from .ingest import parse_ups_csv_file
        from .primitives import filter_rows_like_club_colors

        records = filter_rows_like_club_colors(parse_ups_csv_file(args.csv.expanduser().resolve()))
        for rec in records:
            rec["_parse_version"] = UPS_PARSE_VERSION
        records, dedupe_dropped = dedupe_records_stable(records)
        ingest_diag = build_ingest_diagnostics(
            records,
            {
                **empty_ingest_diagnostics(),
                "filesLoaded": 1,
                "duplicateChargeRowsDropped": dedupe_dropped,
            },
            lookup,
        )
        file_structure_log: list[dict[str, object]] = [{"File": args.csv.name, "Status": "OK", "Carrier": "UPS"}]
        input_label = str(args.csv)
    elif args.input_dir:
        input_dir = Path(args.input_dir).expanduser().resolve()
        print("=" * 52)
        print(" LOGIFACTS — PREMIUM ANALYSIS (OFFLINE MIRROR)")
        print("=" * 52)
        print(f"Input folder : {input_dir}")
        print(f"Mapping file : {mapping_file}")
        print("=" * 52)
        ingest = ingest_folder(input_dir, recursive=not args.no_recursive)
        records = ingest.records
        ingest_diag = build_ingest_diagnostics(
            records,
            {
                **empty_ingest_diagnostics(),
                "filesLoaded": ingest.files_loaded,
                "rowsDroppedCriticalSciCorruption": ingest.rows_dropped_sci,
                "rowsDroppedDateGate": ingest.rows_dropped_date_gate,
                "duplicateChargeRowsDropped": ingest.rows_dropped_charge_dedupe,
            },
            lookup,
        )
        file_structure_log = ingest.file_structure_log
        input_label = str(input_dir)
    else:
        print("[ERROR] Provide --input-dir, --csv, or --golden", file=sys.stderr)
        return 1

    enriched = enrich_records(records, lookup)
    df = records_to_dataframe(enriched)
    summary_core = compute_invoice_analysis_summary(records, lookup)
    summary = enrich_summary_with_agents_outputs(
        summary_core, records, mapping_rows, lookup, ingest_diag
    )

    carriers = list(summary.get("byCarrier", {}).keys())
    stale = detect_stale_ingest(ingest_diag.get("parseVersions") or [], carriers)
    if stale["needsReupload"]:
        summary["staleIngest"] = stale

    output_dir = Path(args.output_dir).expanduser().resolve()
    output_file = output_dir / args.output_name
    html_name = str(args.html_name).strip() or f"{output_file.stem}.html"
    html_file = output_dir / html_name
    tables = build_summary_tables(summary, df, ingest_diag)
    unmapped = unmapped_charge_summary(df)
    export_workbook(df, tables, pd.DataFrame(file_structure_log), unmapped, output_file)
    export_html_report(
        summary,
        tables,
        pd.DataFrame(file_structure_log),
        unmapped,
        ingest_diag,
        input_label=input_label,
        output_path=html_file,
        row_count=len(df),
    )

    combined_name = str(args.combined_file).strip()
    if combined_name:
        combined_path = output_dir / combined_name
        export_combined_invoice_mapped(df, combined_path)
        print(f"Combined file   : {combined_path} ({len(df):,} rows)")

    if args.json_out:
        args.json_out.parent.mkdir(parents=True, exist_ok=True)
        args.json_out.write_text(json.dumps(summary, indent=2, default=str), encoding="utf-8")
        print(f"Summary JSON    : {args.json_out}")

    m = summary["measures"]
    print("\n" + "-" * 52)
    print(" KPI SUMMARY (TS engine + agents)")
    print("-" * 52)
    print(f"  Total cost     : {fmt_money(m['totalCost'])}")
    print(f"  Fuel           : {fmt_money(m['fuelCost'])}")
    print(f"  Accessorials   : {fmt_money(m['costAccessorials'])}")
    print(f"  Packages       : {m['totalPackages']:,.0f}")
    print(f"  Shipments      : {m['packageDedupeShipmentCount']:,}")
    print(f"  Weight gap     : {m['weightGap']:,.0f} lbs (shipment grain)")
    print("-" * 52)

    diag = summary.get("ingestDiagnostics") or ingest_diag
    print(f"  Mapped lines   : {diag.get('linesMapped', 0):,} / {diag.get('linesTotal', 0):,}")
    print(f"  Unmapped spend : {fmt_money(float(diag.get('unmappedSpend') or 0))}")
    print(f"  Parse versions : {', '.join(diag.get('parseVersions') or []) or '(none)'}")

    quality = summary.get("ingestQuality") or {}
    if quality.get("reason"):
        print(f"  Quality gate   : {quality['reason']}")

    savings = summary.get("savingsEstimate")
    if savings:
        print(f"  Savings (ann.) : {fmt_money(savings['low'])} – {fmt_money(savings['high'])}")
    elif quality.get("blockSavings"):
        print("  Savings (ann.) : blocked (ingest quality gate)")

    flags = summary.get("anomalyFlags") or []
    if flags:
        print(f"  Anomaly flags  : {len(flags)}")

    if stale.get("needsReupload"):
        print("\n STALE INGEST WARNINGS")
        for reason in stale.get("reasons") or []:
            print(f"  • {reason}")

    if not tables["cost_by_file"].empty:
        print("\n COST BY SOURCE FILE")
        print("-" * 52)
        for _, row in tables["cost_by_file"].iterrows():
            print(f"  {str(row['Source File']):<55}  ${row['totalCost']:>12,.0f}  ({int(row['rowCount']):,} rows)")

    elapsed = round(time.time() - start, 2)
    print("\n" + "=" * 52)
    print(" ANALYSIS COMPLETE")
    print("=" * 52)
    print(f"Source         : {input_label}")
    print(f"Execution time : {elapsed}s")
    print(f"Workbook       : {output_file}")
    print(f"HTML report    : {html_file}")
    print(f"Rows analyzed  : {len(df):,}")
    print(f"Unmapped lines : {(~df['mapped']).sum():,}" if "mapped" in df.columns else "")
    print("=" * 52)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
