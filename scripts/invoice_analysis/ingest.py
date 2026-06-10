"""Folder ingest with file-level dedupe and row cleaning."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import pandas as pd

from .constants import UPS_HEADERS
from .parsers import (
    detect_carrier,
    excel_to_ups_shape,
    is_excel_file,
    parse_excel_to_standard,
    parse_ups_file,
)
from .utils import file_sha256, is_sci_notation_corrupted, normalize_text, to_number


@dataclass
class IngestResult:
    df: pd.DataFrame
    file_structure_log: list[dict[str, object]] = field(default_factory=list)
    files_loaded: int = 0
    rows_dropped_sci: int = 0
    rows_dropped_charge_dedupe: int = 0


def collect_invoice_files(folder: Path, recursive: bool = True) -> list[Path]:
    patterns = ["*.csv", "*.CSV", "*.xls", "*.XLS", "*.xlsx", "*.XLSX"]
    files: list[Path] = []
    for pattern in patterns:
        files.extend(folder.rglob(pattern) if recursive else folder.glob(pattern))
    return sorted({p.resolve() for p in files})


def ingest_folder(folder: Path, recursive: bool = True) -> IngestResult:
    if not folder.exists():
        raise FileNotFoundError(f"Folder does not exist:\n{folder}")

    invoice_files = collect_invoice_files(folder, recursive=recursive)
    all_frames: list[pd.DataFrame] = []
    file_structure_log: list[dict[str, object]] = []
    seen_hashes: dict[str, str] = {}

    print(f"\nScanning {len(invoice_files)} invoice file(s) in {folder}...\n")

    for path in invoice_files:
        file_name = path.name
        file_name_lower = file_name.lower()

        if "upstrackresults" in file_name_lower:
            print(f"  [SKIP] {file_name}  (upstrackresults file)")
            file_structure_log.append({"File": file_name, "Status": "SKIPPED - upstrackresults"})
            continue

        sha = file_sha256(path)
        if sha in seen_hashes:
            print(f"  [SKIP] {file_name}  (duplicate of {seen_hashes[sha]})")
            file_structure_log.append({
                "File": file_name,
                "Status": f"SKIPPED - Duplicate of {seen_hashes[sha]}",
            })
            continue
        seen_hashes[sha] = file_name

        try:
            if is_excel_file(path):
                carrier = detect_carrier(path)
                df_file, log = parse_excel_to_standard(path, carrier)
                if df_file.empty:
                    print(f"  [SKIP] {file_name}  ({log.get('Status')})")
                    file_structure_log.append(log)
                    continue
                df_file = excel_to_ups_shape(df_file)
            else:
                df_file, log = parse_ups_file(path)
                if df_file.empty:
                    print(f"  [SKIP] {file_name}  ({log.get('Status')})")
                    file_structure_log.append(log)
                    continue
        except Exception as exc:
            print(f"  [SKIP] {file_name}  (error: {exc})")
            file_structure_log.append({"File": file_name, "Status": f"SKIPPED - {exc}"})
            continue

        all_frames.append(df_file)
        print(f"  [OK]   {file_name}  ({len(df_file):,} rows, carrier={log.get('Carrier', 'UPS')})")
        file_structure_log.append(log)

    print(f"\n  Total files loaded: {len(all_frames)}\n")

    if not all_frames:
        raise RuntimeError("No usable invoice files loaded")

    combined = pd.concat(all_frames, ignore_index=True)

    combined = combined[combined["Invoice Date"].notna()]
    combined = combined[combined["Invoice Date"] != "Invoice Date"]
    combined["Invoice Date"] = pd.to_datetime(combined["Invoice Date"], errors="coerce")

    for col in ["Net Amount", "Invoice Amount", "Duty Amount", "Package Quantity", "Billed Weight", "Entered Weight"]:
        if col in combined.columns:
            combined[col] = to_number(combined[col])

    combined["Charge Classification Code"] = normalize_text(combined.get("Charge Classification Code", ""))
    combined["Charge Category Code"] = normalize_text(combined.get("Charge Category Code", ""))

    sci_mask = (
        combined["Invoice Number"].astype(str).apply(is_sci_notation_corrupted)
        | combined.get("Account Number", pd.Series([""] * len(combined))).astype(str).apply(is_sci_notation_corrupted)
    )
    rows_dropped_sci = int(sci_mask.sum())
    if rows_dropped_sci > 0:
        print(f"  [WARN] Dropped {rows_dropped_sci} row(s) with sci-notation-corrupted IDs")
    combined = combined[~sci_mask].copy()

    charge_dedupe_key = ["Invoice Number", "Tracking Number", "Charge Description", "Net Amount", "Invoice Date", "Carrier Name"]
    before_dedupe = len(combined)
    combined = combined.drop_duplicates(subset=charge_dedupe_key, keep="first")
    rows_dropped_charge_dedupe = before_dedupe - len(combined)
    if rows_dropped_charge_dedupe > 0:
        print(f"  [INFO] Dropped {rows_dropped_charge_dedupe} duplicate charge line(s)")

    combined.loc[combined["Carrier Name"].astype(str).str.strip() == "", "Carrier Name"] = "UPS"

    return IngestResult(
        df=combined,
        file_structure_log=file_structure_log,
        files_loaded=len(all_frames),
        rows_dropped_sci=rows_dropped_sci,
        rows_dropped_charge_dedupe=rows_dropped_charge_dedupe,
    )
