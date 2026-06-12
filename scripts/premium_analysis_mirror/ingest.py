"""Folder ingest — aligned with lib/premium-analysis ingest + Club Colors date gate."""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import pandas as pd

from .constants import UPS_HEADERS
from .parsers import (
    detect_carrier,
    excel_to_ups_shape,
    is_excel_file,
    parse_excel_to_standard,
    parse_ups_file,
)
from .primitives import filter_rows_like_club_colors, is_sci_notation_corrupted
from .ingest_dedupe import dedupe_records_stable


def detect_csv_delimiter(line: str) -> str:
    in_quotes = False
    commas = semis = 0
    i = 0
    while i < len(line):
        ch = line[i]
        if ch == '"':
            if in_quotes and i + 1 < len(line) and line[i + 1] == '"':
                i += 1
            else:
                in_quotes = not in_quotes
        elif not in_quotes:
            if ch == ",":
                commas += 1
            elif ch == ";":
                semis += 1
        i += 1
    return ";" if semis >= commas else ","


def split_csv_line(line: str, delimiter: str) -> list[str]:
    result: list[str] = []
    current: list[str] = []
    in_quotes = False
    i = 0
    while i < len(line):
        ch = line[i]
        if ch == '"':
            if in_quotes and i + 1 < len(line) and line[i + 1] == '"':
                current.append('"')
                i += 1
            else:
                in_quotes = not in_quotes
        elif ch == delimiter and not in_quotes:
            result.append("".join(current))
            current = []
        else:
            current.append(ch)
        i += 1
    result.append("".join(current))
    return result


def parse_ups_csv_text(csv_text: str) -> list[dict[str, Any]]:
    text = csv_text.lstrip("\ufeff")
    lines = [ln for ln in re.split(r"\r\n|\n|\r", text) if ln.strip()]
    if not lines:
        return []
    delimiter = detect_csv_delimiter(lines[0])
    first_cols = [c.strip().lower() for c in split_csv_line(lines[0], delimiter)]
    has_header = "version" in first_cols and "invoice number" in first_cols and "charge description" in first_cols
    data_lines = lines[1:] if has_header else lines
    if not data_lines and lines:
        data_lines = lines
    records: list[dict[str, Any]] = []
    for line in data_lines:
        cols = split_csv_line(line, delimiter)
        rec = {h: None for h in UPS_HEADERS}
        for idx, name in enumerate(UPS_HEADERS):
            raw = cols[idx] if idx < len(cols) else None
            rec[name] = raw.strip() if raw is not None else None
        records.append(rec)
    return records


def parse_ups_csv_file(path: Path) -> list[dict[str, Any]]:
    return parse_ups_csv_text(path.read_text(encoding="utf-8", errors="replace"))


@dataclass
class IngestResult:
    records: list[dict[str, Any]]
    file_structure_log: list[dict[str, object]] = field(default_factory=list)
    files_loaded: int = 0
    rows_dropped_sci: int = 0
    rows_dropped_charge_dedupe: int = 0
    rows_dropped_date_gate: int = 0


def collect_invoice_files(folder: Path, recursive: bool = True) -> list[Path]:
    patterns = ["*.csv", "*.CSV", "*.xls", "*.XLS", "*.xlsx", "*.XLSX"]
    files: list[Path] = []
    for pattern in patterns:
        files.extend(folder.rglob(pattern) if recursive else folder.glob(pattern))
    return sorted({p.resolve() for p in files})


def file_sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def _dataframe_to_records(df: pd.DataFrame) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for _, row in df.iterrows():
        rec = {h: None for h in UPS_HEADERS}
        for col in row.index:
            if col in rec:
                val = row[col]
                if val is None or (isinstance(val, float) and pd.isna(val)):
                    rec[col] = None
                else:
                    rec[col] = str(val).strip()
        records.append(rec)
    return records


def ingest_folder(folder: Path, *, recursive: bool = True) -> IngestResult:
    if not folder.exists():
        raise FileNotFoundError(f"Folder does not exist: {folder}")

    invoice_files = collect_invoice_files(folder, recursive=recursive)
    frames: list[pd.DataFrame] = []
    file_structure_log: list[dict[str, object]] = []
    seen_hashes: dict[str, str] = {}

    print(f"\nScanning {len(invoice_files)} invoice file(s) in {folder}...\n")

    for path in invoice_files:
        name = path.name
        if "upstrackresults" in name.lower():
            print(f"  [SKIP] {name}  (upstrackresults)")
            file_structure_log.append({"File": name, "Status": "SKIPPED - upstrackresults"})
            continue

        sha = file_sha256(path)
        if sha in seen_hashes:
            print(f"  [SKIP] {name}  (duplicate of {seen_hashes[sha]})")
            file_structure_log.append({"File": name, "Status": f"SKIPPED - Duplicate of {seen_hashes[sha]}"})
            continue
        seen_hashes[sha] = name

        try:
            if is_excel_file(path):
                carrier = detect_carrier(path)
                df_file, log = parse_excel_to_standard(path, carrier)
                if df_file.empty:
                    print(f"  [SKIP] {name}  ({log.get('Status')})")
                    file_structure_log.append(log)
                    continue
                df_file = excel_to_ups_shape(df_file)
            else:
                df_file, log = parse_ups_file(path)
                if df_file.empty:
                    print(f"  [SKIP] {name}  ({log.get('Status')})")
                    file_structure_log.append(log)
                    continue
        except Exception as exc:
            print(f"  [SKIP] {name}  (error: {exc})")
            file_structure_log.append({"File": name, "Status": f"SKIPPED - {exc}"})
            continue

        frames.append(df_file)
        print(f"  [OK]   {name}  ({len(df_file):,} rows, carrier={log.get('Carrier', 'UPS')})")
        file_structure_log.append(log)

    print(f"\n  Total files loaded: {len(frames)}\n")
    if not frames:
        raise RuntimeError("No usable invoice files loaded")

    combined = pd.concat(frames, ignore_index=True)
    records = _dataframe_to_records(combined)
    before_sci = len(records)

    sci_dropped: list[dict[str, Any]] = []
    kept: list[dict[str, Any]] = []
    for rec in records:
        inv = str(rec.get("Invoice Number") or "")
        acc = str(rec.get("Account Number") or "")
        if is_sci_notation_corrupted(inv) or is_sci_notation_corrupted(acc):
            sci_dropped.append(rec)
        else:
            kept.append(rec)
    rows_dropped_sci = before_sci - len(kept)
    if rows_dropped_sci:
        print(f"  [WARN] Dropped {rows_dropped_sci} row(s) with sci-notation-corrupted IDs")

    before_date = len(kept)
    filtered = filter_rows_like_club_colors(kept)
    rows_dropped_date_gate = before_date - len(filtered)

    filtered, rows_dropped_charge_dedupe = dedupe_records_stable(filtered)

    return IngestResult(
        records=filtered,
        file_structure_log=file_structure_log,
        files_loaded=len(frames),
        rows_dropped_sci=rows_dropped_sci,
        rows_dropped_charge_dedupe=rows_dropped_charge_dedupe,
        rows_dropped_date_gate=rows_dropped_date_gate,
    )
