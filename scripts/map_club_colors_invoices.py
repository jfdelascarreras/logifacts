#!/usr/bin/env python3
"""Map offline UPS invoice CSV files to master charge descriptions.

Pipeline:
1) Read invoice rows from a folder (headered or headerless CSVs)
2) Normalize charge descriptions via UPS_Mapping.xlsx
3) Map to consolidated master charge descriptions via Master_Mapping_Consolidated_Updated.xlsx
4) Optional sender override: --sender-company / INVOICE_SENDER_COMPANY_NAME (else CSV Sender Company Name when headered)
5) Export consolidated rows + summary + unmapped report
"""

from __future__ import annotations

import argparse
import csv
import os
import re
import sys
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable
from zipfile import ZipFile
import xml.etree.ElementTree as ET

UPS_DEFAULT_DIR = Path(
    "/Users/jose_logifacts/Library/CloudStorage/OneDrive-Logifacts/Logifacts-Documents - Documents/Power BI Sources/Club Colors"
)
UPS_MAPPING_XLSX = Path("/Users/jose_logifacts/Bootcamp/Logifacts/Invoices skills/UPS_Mapping.xlsx")
MASTER_MAPPING_XLSX = Path(
    "/Users/jose_logifacts/Bootcamp/Logifacts/Invoices skills/Master_Mapping_Consolidated_Updated.xlsx"
)

NS = {
    "a": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}

WEIGHT_BUCKETS: list[tuple[str, int, float, float | None]] = [
    ("0-1 lbs", 1, 0.0, 1.0),
    ("2-5 lbs", 2, 2.0, 5.0),
    ("6-10 lbs", 3, 6.0, 10.0),
    ("11-20 lbs", 4, 11.0, 20.0),
    ("21-50 lbs", 5, 21.0, 50.0),
    ("51-100 lbs", 6, 51.0, 100.0),
    ("100+ lbs", 7, 100.0, None),
]


def normalize_text(value: str | None) -> str:
    text = str(value or "").strip()
    text = re.sub(r"\s+", " ", text)
    return text.upper()


def normalize_relaxed(value: str | None) -> str:
    """Aggressive normalization for fuzzy dictionary key matching."""
    text = normalize_text(value)
    text = re.sub(r"[^A-Z0-9]+", "", text)
    return text


def to_float(value: str | None, default: float = 0.0) -> float:
    raw = str(value or "").strip().replace(",", "")
    if not raw:
        return default
    try:
        return float(raw)
    except Exception:
        return default


def to_int(value: str | None, default: int = 0) -> int:
    try:
        return int(float(str(value or "").strip()))
    except Exception:
        return default


def weight_bucket_for(weight_lbs: float) -> tuple[str, int]:
    if weight_lbs <= 0:
        return ("0-1 lbs", 1)
    for label, sort_order, low, high in WEIGHT_BUCKETS:
        if high is None:
            if weight_lbs >= low:
                return (label, sort_order)
        elif low <= weight_lbs <= high:
            return (label, sort_order)
    return ("100+ lbs", 7)


def mode_from_zone(zone: int) -> str:
    if 400 <= zone < 500:
        return "Express/Special"
    if 300 <= zone < 400:
        return "Air"
    if 200 <= zone < 300:
        return "International Export"
    if 100 <= zone < 200:
        return "International Import"
    if zone < 100:
        return "Ground"
    return "Unknown"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Map UPS invoice charge descriptions to master taxonomy")
    parser.add_argument("--input-dir", default=str(UPS_DEFAULT_DIR), help="folder containing invoice CSV files")
    parser.add_argument("--ups-mapping", default=str(UPS_MAPPING_XLSX), help="path to UPS_Mapping.xlsx")
    parser.add_argument(
        "--master-mapping",
        default=str(MASTER_MAPPING_XLSX),
        help="path to Master_Mapping_Consolidated_Updated.xlsx",
    )
    parser.add_argument("--output-dir", default="./outputs/club_colors_mapping", help="output folder")
    parser.add_argument(
        "--no-dedupe",
        action="store_true",
        help="disable duplicate invoice-row removal",
    )
    parser.add_argument(
        "--sender-company",
        dest="sender_company",
        default=os.environ.get("INVOICE_SENDER_COMPANY_NAME", "").strip(),
        help='Sets Sender company_name on each row; default INVOICE_SENDER_COMPANY_NAME env. '
        'When unset/empty, uses CSV column Sender Company Name (headered files only).',
    )
    return parser.parse_args()


def read_xlsx_rows(path: Path) -> list[list[str]]:
    with ZipFile(path) as workbook:
        shared_strings: list[str] = []
        if "xl/sharedStrings.xml" in workbook.namelist():
            sst_root = ET.fromstring(workbook.read("xl/sharedStrings.xml"))
            for si in sst_root.findall("a:si", NS):
                text_parts = [node.text or "" for node in si.findall(".//a:t", NS)]
                shared_strings.append("".join(text_parts))

        wb_root = ET.fromstring(workbook.read("xl/workbook.xml"))
        first_sheet = wb_root.find("a:sheets/a:sheet", NS)
        if first_sheet is None:
            return []
        rel_id = first_sheet.attrib.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id")
        if not rel_id:
            return []

        rels_root = ET.fromstring(workbook.read("xl/_rels/workbook.xml.rels"))
        rel_to_target = {rel.attrib["Id"]: rel.attrib["Target"] for rel in rels_root}
        target = rel_to_target.get(rel_id)
        if not target:
            return []

        sheet_root = ET.fromstring(workbook.read(f"xl/{target}"))
        rows_out: list[list[str]] = []
        for row in sheet_root.findall(".//a:sheetData/a:row", NS):
            cells: list[str] = []
            for cell in row.findall("a:c", NS):
                cell_type = cell.attrib.get("t")
                raw_value_node = cell.find("a:v", NS)
                if raw_value_node is None:
                    value = ""
                else:
                    raw = raw_value_node.text or ""
                    if cell_type == "s":
                        try:
                            value = shared_strings[int(raw)]
                        except Exception:
                            value = raw
                    else:
                        value = raw
                cells.append(str(value).strip())
            rows_out.append(cells)
        return rows_out


def detect_header_row(rows: list[list[str]], required_header: str) -> tuple[int, list[str]]:
    required_norm = normalize_text(required_header)
    for idx, row in enumerate(rows):
        normalized = [normalize_text(x) for x in row]
        if required_norm in normalized:
            return idx, [str(x).strip() for x in row]
    raise ValueError(f"Could not find header row with '{required_header}'")


def rows_to_dicts(rows: list[list[str]], header_idx: int, headers: list[str]) -> list[dict[str, str]]:
    width = len(headers)
    out: list[dict[str, str]] = []
    for row in rows[header_idx + 1 :]:
        if not any(str(v).strip() for v in row):
            continue
        padded = list(row) + [""] * max(0, width - len(row))
        row_values = padded[:width]
        out.append({headers[i]: str(row_values[i]).strip() for i in range(width)})
    return out


@dataclass(frozen=True)
class MappingRow:
    charge_description: str
    transportation_mode: str
    category_1: str
    category_2: str
    category_3: str
    category_4: str
    category_5: str


def load_ups_mapping(path: Path) -> dict[str, MappingRow]:
    rows = read_xlsx_rows(path)
    header_idx, headers = detect_header_row(rows, "Charge Description")
    row_dicts = rows_to_dicts(rows, header_idx, headers)

    result: dict[str, MappingRow] = {}
    for row in row_dicts:
        charge = str(row.get("Charge Description", "")).strip()
        if not charge:
            continue
        mapped = MappingRow(
            charge_description=charge,
            transportation_mode=str(row.get("Transportation_Mode", "")).strip(),
            category_1=str(row.get("Category1", "")).strip(),
            category_2=str(row.get("Category2", "")).strip(),
            category_3=str(row.get("Category3", "")).strip(),
            category_4=str(row.get("Category4", "")).strip(),
            category_5=str(row.get("Category5", "")).strip(),
        )
        result[normalize_text(charge)] = mapped
    return result


def load_master_mapping(path: Path) -> dict[str, MappingRow]:
    rows = read_xlsx_rows(path)
    header_idx, headers = detect_header_row(rows, "Charge Description")
    row_dicts = rows_to_dicts(rows, header_idx, headers)

    result: dict[str, MappingRow] = {}
    for row in row_dicts:
        charge = str(row.get("Charge Description", "")).strip()
        if not charge:
            continue
        mapped = MappingRow(
            charge_description=charge,
            transportation_mode=str(row.get("Transportation_Mode", "")).strip(),
            category_1=str(row.get("Category 1", "")).strip(),
            category_2=str(row.get("Category 2", "")).strip(),
            category_3=str(row.get("Category 3", "")).strip(),
            category_4=str(row.get("Category 4", "")).strip(),
            category_5=str(row.get("Category 5", "")).strip(),
        )
        result[normalize_text(charge)] = mapped
    return result


def load_csv_rows(path: Path) -> list[list[str]]:
    encodings = ("utf-8-sig", "utf-8", "latin-1")
    last_exc: Exception | None = None
    for enc in encodings:
        try:
            with path.open("r", newline="", encoding=enc) as f:
                return [row for row in csv.reader(f)]
        except Exception as exc:
            last_exc = exc
    if last_exc is not None:
        raise last_exc
    return []


def looks_like_header_row(row: list[str]) -> bool:
    normalized = {normalize_text(v) for v in row if str(v).strip()}
    expected = {"CHARGE DESCRIPTION", "INVOICE NUMBER", "TRACKING NUMBER", "SENDER COMPANY NAME"}
    return len(normalized & expected) >= 2


def infer_charge_description(row: list[str], valid_ups_charges: set[str]) -> str:
    for value in row:
        if normalize_text(value) in valid_ups_charges:
            return str(value).strip()
    # Fallback pattern observed in UPS exports: code, 3-digit code, description
    # e.g. FRT,003,Ground or ACC,RES,Residential Surcharge
    for idx in range(len(row) - 2):
        part_a = str(row[idx]).strip()
        part_b = str(row[idx + 1]).strip()
        part_c = str(row[idx + 2]).strip()
        if re.fullmatch(r"[A-Z]{3}", part_a) and re.fullmatch(r"[A-Z0-9]{3}", part_b):
            if part_c and not re.fullmatch(r"[A-Z0-9]{1,8}", part_c):
                return part_c
    return ""


def infer_charge_codes(row: list[str]) -> tuple[str, str, int]:
    for idx in range(len(row) - 2):
        code1 = str(row[idx]).strip().upper()
        code2 = str(row[idx + 1]).strip().upper()
        if re.fullmatch(r"[A-Z]{3}", code1) and re.fullmatch(r"[A-Z0-9]{3}", code2):
            return code1, code2, idx
    return "", "", -1


def infer_net_amount_from_row(row: list[str], start_idx: int) -> float:
    if start_idx < 0:
        return 0.0
    candidates: list[float] = []
    search_end = min(len(row), start_idx + 20)
    for token in row[start_idx:search_end]:
        value = to_float(token, default=-1.0)
        if value >= 0:
            candidates.append(value)
    # Heuristic: row-level charge is usually the largest nearby positive value.
    positives = [v for v in candidates if v > 0]
    return max(positives) if positives else 0.0


def infer_weight_lbs_from_row(row: list[str]) -> float:
    for idx in range(len(row) - 1):
        unit = str(row[idx + 1]).strip().upper()
        if unit in {"L", "LB", "LBS"}:
            weight = to_float(row[idx], default=-1.0)
            if weight >= 0:
                return weight
    return 0.0


def infer_zone_from_row(row: list[str]) -> int:
    # Heuristic for headerless rows: first plausible 3-digit zone token.
    for token in row:
        text = str(token).strip()
        if re.fullmatch(r"\d{3}", text):
            zone = int(text)
            if 0 <= zone < 500:
                return zone
    return -1


def infer_invoice_number(row: list[str], source_file_name: str) -> str:
    # Prefer filename pattern for reliability across headerless exports.
    # Examples:
    # - Invoice_2054533994_011526.csv
    # - UTF-8'Invoice_000000376E74425_101825_1Club_Colors.csv
    m = re.search(r"Invoice_([A-Za-z0-9]+)_", source_file_name, flags=re.IGNORECASE)
    if m:
        return m.group(1).strip()

    for value in row:
        token = str(value).strip()
        if re.fullmatch(r"\d{10}", token):
            return token
        if re.fullmatch(r"0{3,}[A-Z0-9]{4,}", token):
            return token
    return ""


def process_invoice_file(
    file_path: Path,
    ups_mapping: dict[str, MappingRow],
    master_mapping: dict[str, MappingRow],
    sender_company_override: str = "",
) -> tuple[list[dict[str, str]], Counter[str]]:
    rows = load_csv_rows(file_path)
    if not rows:
        return [], Counter()

    valid_ups_charges = set(ups_mapping.keys())
    ups_mapping_relaxed = {normalize_relaxed(k): v for k, v in ups_mapping.items()}
    master_mapping_relaxed = {normalize_relaxed(k): v for k, v in master_mapping.items()}

    # Temporary alias normalization pass for known invoice variants.
    alias_to_master = {
        normalize_text("FREIGHT"): "Base transportation service",
        normalize_text("GROUND"): "Ground Commercial",
        normalize_text("WW SAVER"): "Worldwide Saver",
        normalize_text("3-DAY SELECT"): "3 Day Select",
        normalize_text("CUSTOMS GST"): "Brokerage GST",
        normalize_text("CA CUSTOMS HST"): "Ca Customs Hst",
        normalize_text("DUTY AMOUNT"): "Duty Amount",
        normalize_text("DOCUMENT INTEGRITY"): "Document Integrity Fee",
        normalize_text("PGA DISCLAIM FEE"): "PGA Disclaim Fee",
    }
    has_headers = looks_like_header_row(rows[0])

    out_rows: list[dict[str, str]] = []
    unmapped_counter: Counter[str] = Counter()

    for row in (rows[1:] if has_headers else rows):
        if not row or not any(str(v).strip() for v in row):
            continue

        csv_sender_company = ""
        if has_headers:
            # Headered variant support.
            header = rows[0]
            record = {
                str(header[i]).strip(): str(row[i]).strip() if i < len(row) else ""
                for i in range(len(header))
            }
            charge_raw = str(record.get("Charge Description", "")).strip()
            invoice_number = str(record.get("Invoice Number", "")).strip()
            charge_class_code = str(record.get("Charge Classification Code", "")).strip().upper()
            charge_category_code = str(record.get("Charge Category Code", "")).strip().upper()
            net_amount = to_float(record.get("Net Amount", "0"), default=0.0)
            billed_weight_lbs = to_float(record.get("Billed Weight", "0"), default=0.0)
            volume_units = to_int(record.get("Package Quantity", "1"), default=1)
            zone = to_int(record.get("Zone", "-1"), default=-1)
            csv_sender_company = str(record.get("Sender Company Name", "")).strip()
        else:
            charge_raw = infer_charge_description(row, valid_ups_charges)
            invoice_number = infer_invoice_number(row, file_path.name)
            charge_class_code, charge_category_code, code_idx = infer_charge_codes(row)
            net_amount = infer_net_amount_from_row(row, code_idx)
            billed_weight_lbs = infer_weight_lbs_from_row(row)
            volume_units = 1
            zone = infer_zone_from_row(row)

        ov = sender_company_override.strip()
        sender_company_name = ov if ov else csv_sender_company

        normalized_ups_key = normalize_text(charge_raw)
        ups_row = ups_mapping.get(normalized_ups_key)
        if ups_row is None:
            ups_row = ups_mapping_relaxed.get(normalize_relaxed(charge_raw))
        ups_charge_normalized = ups_row.charge_description if ups_row else charge_raw

        normalized_master_key = normalize_text(ups_charge_normalized)
        master_row = master_mapping.get(normalized_master_key)
        if master_row is None:
            # Direct relaxed match against consolidated master values.
            master_row = master_mapping_relaxed.get(normalize_relaxed(ups_charge_normalized))
        if master_row is None:
            alias_target = alias_to_master.get(normalized_master_key)
            if alias_target:
                master_row = master_mapping.get(normalize_text(alias_target))
        if master_row:
            master_charge = master_row.charge_description
            status = "MAPPED"
        else:
            master_charge = "UNMAPPED"
            status = "UNMAPPED"
            if charge_raw:
                unmapped_counter[charge_raw] += 1

        weight_bucket, weight_bucket_sort = weight_bucket_for(billed_weight_lbs)
        mode = mode_from_zone(zone)

        out_rows.append(
            {
                "source_file": file_path.name,
                "invoice_number": invoice_number,
                "Sender company_name": sender_company_name,
                "Charge Classification Code": charge_class_code,
                "Charge Category Code": charge_category_code,
                "Net Amount": f"{net_amount:.6f}",
                "Volume Units": str(max(volume_units, 1)),
                "Billed Weight Lbs": f"{billed_weight_lbs:.6f}",
                "Zone": str(zone if zone >= 0 else ""),
                "Mode": mode,
                "Weight Bucket": weight_bucket,
                "Weight Bucket Sort": str(weight_bucket_sort),
                "charge_description_raw": charge_raw,
                "charge_description_ups": ups_charge_normalized,
                "Charge Description": master_charge,
                "mapping_status": status,
                "transportation_mode": master_row.transportation_mode if master_row else "",
                "category_1": master_row.category_1 if master_row else "",
                "category_2": master_row.category_2 if master_row else "",
                "category_3": master_row.category_3 if master_row else "",
                "category_4": master_row.category_4 if master_row else "",
                "category_5": master_row.category_5 if master_row else "",
            }
        )

    return out_rows, unmapped_counter


def write_csv(path: Path, rows: Iterable[dict[str, str]], fieldnames: list[str]) -> None:
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def dedupe_invoice_rows(rows: list[dict[str, str]]) -> tuple[list[dict[str, str]], int]:
    """Remove duplicate invoice rows across files, keeping first seen row.

    We intentionally exclude source_file from dedupe key so duplicate exports of the same
    invoice line in different files are collapsed.
    """
    seen: set[tuple[str, ...]] = set()
    unique_rows: list[dict[str, str]] = []
    removed = 0

    for row in rows:
        invoice_number = str(row.get("invoice_number", "")).strip()
        source_file = str(row.get("source_file", "")).strip()
        key_parts = [
            invoice_number,
            str(row.get("Sender company_name", "")).strip(),
            str(row.get("charge_description_raw", "")).strip(),
            str(row.get("charge_description_ups", "")).strip(),
            str(row.get("Charge Description", "")).strip(),
            str(row.get("mapping_status", "")).strip(),
            str(row.get("transportation_mode", "")).strip(),
            str(row.get("category_1", "")).strip(),
            str(row.get("category_2", "")).strip(),
            str(row.get("category_3", "")).strip(),
            str(row.get("category_4", "")).strip(),
            str(row.get("category_5", "")).strip(),
        ]
        # If invoice number is missing, avoid collapsing across files.
        if not invoice_number:
            key_parts.insert(0, source_file)
        key = tuple(key_parts)
        if key in seen:
            removed += 1
            continue
        seen.add(key)
        unique_rows.append(row)

    return unique_rows, removed


def main() -> int:
    args = parse_args()
    input_dir = Path(args.input_dir).expanduser().resolve()
    output_dir = Path(args.output_dir).expanduser().resolve()
    ups_mapping_path = Path(args.ups_mapping).expanduser().resolve()
    master_mapping_path = Path(args.master_mapping).expanduser().resolve()

    if not input_dir.exists() or not input_dir.is_dir():
        print(f"Input directory not found: {input_dir}", file=sys.stderr)
        return 1
    if not ups_mapping_path.exists():
        print(f"UPS mapping file not found: {ups_mapping_path}", file=sys.stderr)
        return 1
    if not master_mapping_path.exists():
        print(f"Master mapping file not found: {master_mapping_path}", file=sys.stderr)
        return 1

    output_dir.mkdir(parents=True, exist_ok=True)

    ups_mapping = load_ups_mapping(ups_mapping_path)
    master_mapping = load_master_mapping(master_mapping_path)

    csv_files = sorted(input_dir.glob("*.csv"))
    all_rows: list[dict[str, str]] = []
    unmapped_total: Counter[str] = Counter()

    sender_ov = str(args.sender_company).strip()

    for csv_file in csv_files:
        file_rows, file_unmapped = process_invoice_file(
            csv_file, ups_mapping, master_mapping, sender_company_override=sender_ov
        )
        all_rows.extend(file_rows)
        unmapped_total.update(file_unmapped)

    dedupe_removed = 0
    if not args.no_dedupe:
        all_rows, dedupe_removed = dedupe_invoice_rows(all_rows)

    processed_path = output_dir / "club_colors_invoices_mapped.csv"
    summary_path = output_dir / "club_colors_mapping_summary.csv"
    unmapped_path = output_dir / "club_colors_unmapped_charge_descriptions.csv"
    measures_path = output_dir / "club_colors_powerbi_measures.csv"
    weight_bucket_path = output_dir / "club_colors_weight_bucket_summary.csv"
    category2_combo_path = output_dir / "club_colors_category2_volume_cpp.csv"
    mode_combo_path = output_dir / "club_colors_mode_volume_cpp.csv"

    processed_fields = [
        "source_file",
        "invoice_number",
        "Sender company_name",
        "Charge Classification Code",
        "Charge Category Code",
        "Net Amount",
        "Volume Units",
        "Billed Weight Lbs",
        "Zone",
        "Mode",
        "Weight Bucket",
        "Weight Bucket Sort",
        "charge_description_raw",
        "charge_description_ups",
        "Charge Description",
        "mapping_status",
        "transportation_mode",
        "category_1",
        "category_2",
        "category_3",
        "category_4",
        "category_5",
    ]
    write_csv(processed_path, all_rows, processed_fields)

    mapped_count = sum(1 for r in all_rows if r.get("mapping_status") == "MAPPED")
    unmapped_count = sum(1 for r in all_rows if r.get("mapping_status") == "UNMAPPED")

    # Power BI-equivalent measures.
    total_cost = sum(to_float(r.get("Net Amount"), default=0.0) for r in all_rows)
    total_volume = sum(to_float(r.get("Volume Units"), default=0.0) for r in all_rows)
    cost_accessorials = sum(
        to_float(r.get("Net Amount"), default=0.0)
        for r in all_rows
        if str(r.get("Charge Classification Code", "")).upper() == "ACC"
        and str(r.get("Charge Category Code", "")).upper() not in {"INF", "ICC"}
    )
    cost_surcharges = sum(
        to_float(r.get("Net Amount"), default=0.0)
        for r in all_rows
        if str(r.get("category_1", "")) in {"Fuel Surcharge", "Accessorial Surcharge"}
    )
    cost_fuel = sum(
        to_float(r.get("Net Amount"), default=0.0)
        for r in all_rows
        if str(r.get("category_2", "")) == "Fuel Surcharge"
    )
    total_cpp = (total_cost / total_volume) if total_volume else 0.0

    summary_rows = [
        {"metric": "input_files", "value": str(len(csv_files))},
        {"metric": "output_rows", "value": str(len(all_rows))},
        {"metric": "deduplicated_rows_removed", "value": str(dedupe_removed)},
        {"metric": "mapped_rows", "value": str(mapped_count)},
        {"metric": "unmapped_rows", "value": str(unmapped_count)},
        {"metric": "sender_company_override", "value": sender_ov or "(none — from CSV when headered)"},
        {"metric": "generated_at_utc", "value": datetime.now(timezone.utc).isoformat()},
    ]
    write_csv(summary_path, summary_rows, ["metric", "value"])

    measure_rows = [
        {"measure": "Total Cost", "value": f"{total_cost:.6f}"},
        {"measure": "Cost – Accessorials", "value": f"{cost_accessorials:.6f}"},
        {"measure": "Cost – Surcharges", "value": f"{cost_surcharges:.6f}"},
        {"measure": "Cost – Fuel", "value": f"{cost_fuel:.6f}"},
        {"measure": "Total Volume", "value": f"{total_volume:.6f}"},
        {"measure": "Total CPP", "value": f"{total_cpp:.6f}"},
    ]
    write_csv(measures_path, measure_rows, ["measure", "value"])

    bucket_totals: dict[tuple[str, str], dict[str, float]] = {}
    for row in all_rows:
        key = (str(row.get("Weight Bucket", "")), str(row.get("Weight Bucket Sort", "")))
        bucket = bucket_totals.setdefault(key, {"net_amount": 0.0, "volume_units": 0.0, "rows": 0.0})
        bucket["net_amount"] += to_float(row.get("Net Amount"), default=0.0)
        bucket["volume_units"] += to_float(row.get("Volume Units"), default=0.0)
        bucket["rows"] += 1
    bucket_rows = []
    for (bucket, sort_order), totals in sorted(bucket_totals.items(), key=lambda x: int(x[0][1] or "999")):
        cpp = (totals["net_amount"] / totals["volume_units"]) if totals["volume_units"] else 0.0
        bucket_rows.append(
            {
                "Weight Bucket": bucket,
                "Sort": sort_order,
                "Total Cost": f"{totals['net_amount']:.6f}",
                "Total Volume": f"{totals['volume_units']:.6f}",
                "Total CPP": f"{cpp:.6f}",
                "Row Count": str(int(totals["rows"])),
            }
        )
    write_csv(weight_bucket_path, bucket_rows, ["Weight Bucket", "Sort", "Total Cost", "Total Volume", "Total CPP", "Row Count"])

    # Combo visual: Category2 (column = Total Volume, line = Total CPP)
    category2_totals: dict[str, dict[str, float]] = {}
    for row in all_rows:
        key = str(row.get("category_2", "")).strip() or "UNMAPPED"
        bucket = category2_totals.setdefault(key, {"net_amount": 0.0, "volume_units": 0.0, "rows": 0.0})
        bucket["net_amount"] += to_float(row.get("Net Amount"), default=0.0)
        bucket["volume_units"] += to_float(row.get("Volume Units"), default=0.0)
        bucket["rows"] += 1
    category2_rows = []
    for category2, totals in sorted(category2_totals.items(), key=lambda kv: (-kv[1]["volume_units"], kv[0])):
        cpp = (totals["net_amount"] / totals["volume_units"]) if totals["volume_units"] else 0.0
        category2_rows.append(
            {
                "Category2": category2,
                "Total Volume": f"{totals['volume_units']:.6f}",
                "Total CPP": f"{cpp:.6f}",
                "Total Cost": f"{totals['net_amount']:.6f}",
                "Row Count": str(int(totals["rows"])),
            }
        )
    write_csv(category2_combo_path, category2_rows, ["Category2", "Total Volume", "Total CPP", "Total Cost", "Row Count"])

    # Combo visual: Mode (column = Total Volume, line = Total CPP)
    mode_totals: dict[str, dict[str, float]] = {}
    for row in all_rows:
        key = str(row.get("Mode", "")).strip() or "Unknown"
        bucket = mode_totals.setdefault(key, {"net_amount": 0.0, "volume_units": 0.0, "rows": 0.0})
        bucket["net_amount"] += to_float(row.get("Net Amount"), default=0.0)
        bucket["volume_units"] += to_float(row.get("Volume Units"), default=0.0)
        bucket["rows"] += 1
    mode_rows = []
    for mode, totals in sorted(mode_totals.items(), key=lambda kv: (-kv[1]["volume_units"], kv[0])):
        cpp = (totals["net_amount"] / totals["volume_units"]) if totals["volume_units"] else 0.0
        mode_rows.append(
            {
                "Mode": mode,
                "Total Volume": f"{totals['volume_units']:.6f}",
                "Total CPP": f"{cpp:.6f}",
                "Total Cost": f"{totals['net_amount']:.6f}",
                "Row Count": str(int(totals["rows"])),
            }
        )
    write_csv(mode_combo_path, mode_rows, ["Mode", "Total Volume", "Total CPP", "Total Cost", "Row Count"])

    unmapped_rows = [
        {"charge_description_raw": key, "occurrences": str(count)}
        for key, count in sorted(unmapped_total.items(), key=lambda kv: (-kv[1], kv[0]))
    ]
    write_csv(unmapped_path, unmapped_rows, ["charge_description_raw", "occurrences"])

    print("Done")
    print(f"- processed: {processed_path}")
    print(f"- summary:   {summary_path}")
    print(f"- unmapped:  {unmapped_path}")
    print(f"- measures:  {measures_path}")
    print(f"- buckets:   {weight_bucket_path}")
    print(f"- category2: {category2_combo_path}")
    print(f"- mode:      {mode_combo_path}")
    print(f"- files:     {len(csv_files)}")
    print(f"- rows:      {len(all_rows)}")
    print(f"- deduped:   {dedupe_removed}")
    print(f"- mapped:    {mapped_count}")
    print(f"- unmapped:  {unmapped_count}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
