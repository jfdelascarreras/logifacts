"""CLI entry point for offline invoice analysis."""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

import pandas as pd

from .analyze import build_analysis
from .constants import DEFAULT_MAPPING_FILE, DEFAULT_OUTPUT_DIR
from .dashboard import create_dashboard
from .export import export_combined_invoice_mapped, export_workbook
from .ingest import ingest_folder
from .mapping import apply_mapping, build_taxonomy_lookup, load_master_mapping, unmapped_charge_summary


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Offline multi-carrier invoice analysis and charge mapping (UPS, FedEx, WWE)",
    )
    parser.add_argument(
        "--input-dir",
        required=True,
        help="Folder containing invoice CSV (UPS) and Excel (FedEx/WWE) files",
    )
    parser.add_argument(
        "--mapping-file",
        default=str(DEFAULT_MAPPING_FILE),
        help=f"Master mapping workbook (default: {DEFAULT_MAPPING_FILE})",
    )
    parser.add_argument(
        "--output-dir",
        default=str(DEFAULT_OUTPUT_DIR),
        help=f"Output folder for Excel workbook (default: {DEFAULT_OUTPUT_DIR})",
    )
    parser.add_argument(
        "--output-name",
        default="invoice_kpi_dashboard.xlsx",
        help="Excel output filename",
    )
    parser.add_argument(
        "--title",
        default="Invoice KPI Analysis",
        help="Dashboard / report title",
    )
    parser.add_argument(
        "--no-recursive",
        action="store_true",
        help="Only scan the input folder, not subfolders",
    )
    parser.add_argument(
        "--combined-file",
        default="",
        help="Write a single-sheet xlsx (invoice data + mapped columns only) to this filename under --output-dir",
    )
    parser.add_argument(
        "--dashboard",
        action="store_true",
        help="Launch local Dash dashboard after export (http://127.0.0.1:8050)",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=8050,
        help="Dash server port (default: 8050)",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    start_time = time.time()

    input_dir = Path(args.input_dir).expanduser().resolve()
    mapping_file = Path(args.mapping_file).expanduser().resolve()
    output_dir = Path(args.output_dir).expanduser().resolve()
    output_file = output_dir / args.output_name

    if not mapping_file.exists():
        print(f"[ERROR] Mapping file does not exist:\n{mapping_file}", file=sys.stderr)
        return 1

    print("=" * 52)
    print(" LOGIFACTS — OFFLINE INVOICE ANALYSIS")
    print("=" * 52)
    print(f"Input folder : {input_dir}")
    print(f"Mapping file : {mapping_file}")
    print(f"Output file  : {output_file}")
    print("=" * 52)

    ingest = ingest_folder(input_dir, recursive=not args.no_recursive)
    mapping_df = load_master_mapping(mapping_file)
    lookup = build_taxonomy_lookup(mapping_df)

    rows_before_merge = len(ingest.df)
    df = apply_mapping(ingest.df, lookup)
    rows_after_merge = len(df)
    unmapped_table = unmapped_charge_summary(df)

    result = build_analysis(
        df,
        files_loaded=ingest.files_loaded,
        file_structure_log=ingest.file_structure_log,
        rows_dropped_sci=ingest.rows_dropped_sci,
        rows_dropped_charge_dedupe=ingest.rows_dropped_charge_dedupe,
        rows_before_merge=rows_before_merge,
        rows_after_merge=rows_after_merge,
        unmapped_table=unmapped_table,
    )

    file_structure_df = pd.DataFrame(ingest.file_structure_log)
    export_workbook(result, file_structure_df, output_file)

    combined_file = str(args.combined_file).strip()
    if combined_file:
        combined_path = output_dir / combined_file
        export_combined_invoice_mapped(result.df, combined_path)
        print(f"Combined file   : {combined_path} ({len(result.df):,} rows)")

    print("\n" + "-" * 52)
    print(" COST BY SOURCE FILE")
    print("-" * 52)
    for _, row in result.cost_by_file.iterrows():
        print(f"  {str(row['Source File']):<55}  ${row['totalCost']:>12,.0f}  ({int(row['rowCount']):,} rows)")
    print("-" * 52)

    elapsed = round(time.time() - start_time, 2)
    print("\n" + "=" * 52)
    print(" ANALYSIS COMPLETE")
    print("=" * 52)
    print(f"Execution time : {elapsed}s")
    print(f"Workbook       : {output_file}")
    print(f"Rows analyzed  : {len(result.df):,}")
    print(f"Unmapped lines : {(~result.df['mapped']).sum():,}")
    print("=" * 52)

    if args.dashboard:
        app = create_dashboard(
            result,
            title=args.title,
            files_loaded=ingest.files_loaded,
            rows_dropped_sci=ingest.rows_dropped_sci,
            rows_dropped_charge_dedupe=ingest.rows_dropped_charge_dedupe,
        )
        print(f"\nOpen browser: http://127.0.0.1:{args.port}\n")
        app.run(debug=True, port=args.port)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
