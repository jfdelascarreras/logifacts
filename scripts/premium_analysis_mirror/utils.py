"""Excel + formatting helpers for parsers and export."""

from __future__ import annotations

import re

import pandas as pd


def normalize_text(series: pd.Series | str | None) -> pd.Series | str:
    if isinstance(series, pd.Series):
        return series.fillna("").astype(str).str.strip().str.replace(r"\s+", " ", regex=True).str.upper()
    text = re.sub(r"\s+", " ", str(series or "").strip())
    return text.upper()


def is_sci_notation_corrupted(value: object) -> bool:
    try:
        float(str(value).strip())
        s = str(value).strip().upper()
        return "E" in s and s.replace(".", "").replace("E+", "").replace("E-", "").isdigit()
    except ValueError:
        return False


def carrier_display_name(canonical: str) -> str:
    if canonical == "FEDEX":
        return "FedEx"
    if canonical == "WWE":
        return "WWE"
    return "UPS"


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
    return {
        col: ""
        for col in [
            "Carrier Name",
            "Source File",
            "Invoice Date",
            "Invoice Number",
            "Account Number",
            "Tracking Number",
            "Shipment Reference Number 1",
            "Lead Shipment Number",
            "Charge Description",
            "Net Amount",
            "Invoice Amount",
            "Duty Amount",
            "Package Quantity",
            "Billed Weight",
            "Entered Weight",
            "Zone",
            "Charge Classification Code",
            "Charge Category Code",
            "Original Service Description",
            "Receiver State",
            "Sender Company Name",
            "Shipment Date",
        ]
    }


def fmt_money(value: float) -> str:
    return f"${value:,.0f}"


def fmt_num(value: float) -> str:
    return f"{value:,.0f}"


def fmt_pct(value: float) -> float:
    return value


def safe_pct(numerator: float, denominator: float) -> float:
    return numerator / denominator if denominator != 0 else 0.0
