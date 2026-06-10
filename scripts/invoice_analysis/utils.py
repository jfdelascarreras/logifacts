"""Shared helpers — aligned with lib/invoices/analysis-summary.ts and csv.ts."""

from __future__ import annotations

import hashlib
import re
from pathlib import Path

import numpy as np
import pandas as pd


def to_number(series: pd.Series) -> pd.Series:
    return pd.to_numeric(
        series.astype(str).str.replace(",", "", regex=False),
        errors="coerce",
    ).fillna(0)


def normalize_text(series: pd.Series | str | None) -> pd.Series | str:
    if isinstance(series, pd.Series):
        return series.fillna("").astype(str).str.strip().str.replace(r"\s+", " ", regex=True).str.upper()
    text = re.sub(r"\s+", " ", str(series or "").strip())
    return text.upper()


def safe_pct(numerator: float, denominator: float) -> float:
    return numerator / denominator if denominator != 0 else 0.0


def is_sci_notation_corrupted(value: object) -> bool:
    try:
        float(str(value).strip())
        s = str(value).strip().upper()
        return "E" in s and s.replace(".", "").replace("E+", "").replace("E-", "").isdigit()
    except ValueError:
        return False


def canonical_mapping_carrier(raw: str) -> str:
    norm = normalize_text(raw)
    if not norm or norm == "UPS":
        return "UPS"
    if "FED" in norm or norm in {"FX", "FDX"}:
        return "FEDEX"
    if "WORLD" in norm or "WWE" in norm or norm == "WORLDWIDE":
        return "WWE"
    return norm


def carrier_display_name(canonical: str) -> str:
    if canonical == "FEDEX":
        return "FedEx"
    if canonical == "WWE":
        return "WWE"
    return "UPS"


def shipment_package_dedupe_key(row: pd.Series) -> str | None:
    invoice = str(row.get("Invoice Number", "")).strip()
    for field in ("Tracking Number", "Shipment Reference Number 1", "Lead Shipment Number"):
        value = str(row.get(field, "")).strip()
        if value and value.lower() != "nan":
            return f"{invoice}::{value}"
    return None


def file_sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def fmt_money(value: float) -> str:
    return f"${value:,.0f}"


def fmt_num(value: float) -> str:
    return f"{value:,.0f}"


def fmt_pct(value: float) -> str:
    return f"{value:.1%}"


def fmt_lbs(value: float) -> str:
    return f"{value:,.0f} lbs"


def mode_from_zone(zone: object) -> str:
    try:
        raw = str(zone).strip() if zone is not None and pd.notna(zone) else ""
        z = int(float(raw)) if raw else -1
    except (ValueError, TypeError):
        z = -1
    if 400 <= z < 500:
        return "Express/Special"
    if 300 <= z < 400:
        return "Air"
    if 200 <= z < 300:
        return "International Export"
    if 100 <= z < 200:
        return "International Import"
    if 0 <= z < 100:
        return "Ground"
    return "Unknown"


def excel_cell_str(row: pd.Series, col: int) -> str:
    if col >= len(row):
        return ""
    val = row.iloc[col]
    if pd.isna(val):
        return ""
    return str(val).strip()


def excel_cell_num(row: pd.Series, col: int) -> float:
    raw = excel_cell_str(row, col).replace(",", "")
    if not raw:
        return 0.0
    try:
        return float(raw)
    except ValueError:
        return 0.0


def empty_standard_row() -> dict[str, object]:
    return {col: "" for col in [
        "Carrier Name", "Source File", "Invoice Date", "Invoice Number", "Account Number",
        "Tracking Number", "Shipment Reference Number 1", "Lead Shipment Number",
        "Charge Description", "Net Amount", "Invoice Amount", "Duty Amount",
        "Package Quantity", "Billed Weight", "Entered Weight", "Zone",
        "Charge Classification Code", "Charge Category Code", "Original Service Description",
        "Receiver State", "Sender Company Name",
    ]}
