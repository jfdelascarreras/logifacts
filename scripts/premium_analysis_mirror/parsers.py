"""Carrier detection and invoice parsers — mirrors lib/invoices/parsers/*."""

from __future__ import annotations

import re
from pathlib import Path

import pandas as pd

from .constants import UPS_CRITICAL_COLUMNS, UPS_HEADERS
from .utils import (
    carrier_display_name,
    empty_standard_row,
    excel_cell_num,
    excel_cell_str,
    is_sci_notation_corrupted,
    normalize_text,
)

FEDEX_HEADER_RE = re.compile(r"tracking\s*id\s*charge\s*description", re.I)
EXPRESS_GROUND_TRACKING_RE = re.compile(r"express\s*or\s*ground\s*tracking\s*id$", re.I)
WWE_HEADER_RE = re.compile(r"airbill", re.I)
# WWE exports: 260308W096716.xls or legacy numeric-only 2411098346.xls
WWE_INVOICE_FILENAME_RE = re.compile(r"^\d{6,12}(?:W\d{4,})?\.xls$", re.I)

WWE_CHARGE_TYPE_COLS = [39, 41, 43, 45, 47, 49, 51, 53]
WWE_CHARGE_AMT_COLS = [40, 42, 44, 46, 48, 50, 52, 54]


def is_excel_file(path: Path) -> bool:
    suffix = path.suffix.lower()
    return suffix in {".xls", ".xlsx", ".xlsm"}


def detect_carrier_from_filename(filename: str) -> str | None:
    name = filename.lower()
    if any(k in name for k in ("wwe", "worldwide", "world_wide", "swiftpause")):
        return "WWE"
    if WWE_INVOICE_FILENAME_RE.match(name):
        return "WWE"
    if any(k in name for k in ("fedex", "fdx")):
        return "FedEx"
    return None


def read_excel_raw(path: Path) -> pd.DataFrame:
    engine = "xlrd" if path.suffix.lower() == ".xls" else "openpyxl"
    return pd.read_excel(path, header=None, dtype=object, engine=engine)


def detect_excel_carrier(path: Path) -> str | None:
    try:
        raw = read_excel_raw(path)
    except Exception:
        return None
    if raw.empty:
        return None

    header = raw.iloc[0]
    scan_end = min(len(header), 250)
    has_fedex = False
    has_wwe = False

    for col in range(scan_end):
        val = excel_cell_str(header, col)
        if not val:
            continue
        if FEDEX_HEADER_RE.search(val):
            has_fedex = True
            break
        if WWE_HEADER_RE.search(val):
            has_wwe = True

    if has_fedex:
        return "FedEx"
    if has_wwe:
        return "WWE"
    return None


def detect_carrier(path: Path) -> str:
    if not is_excel_file(path):
        return "UPS"

    from_content = detect_excel_carrier(path)
    if from_content:
        return from_content

    from_name = detect_carrier_from_filename(path.name)
    if from_name:
        return from_name

    raise ValueError(f"Could not detect carrier for Excel file: {path.name}")


def fedex_header_column(header_row: pd.Series, pattern: re.Pattern[str], fallback: int, scan_from: int = 0) -> int:
    scan_end = min(len(header_row), 240)
    for col in range(scan_from, scan_end):
        val = excel_cell_str(header_row, col)
        if pattern.search(val):
            return col
    return fallback


def fedex_tracking_pair_start(header_row: pd.Series) -> int:
    return fedex_header_column(header_row, FEDEX_HEADER_RE, 107, 70)


def fedex_tracking_id_column(header_row: pd.Series) -> int:
    return fedex_header_column(header_row, EXPRESS_GROUND_TRACKING_RE, 9)


def parse_fedex_file(path: Path) -> pd.DataFrame:
    raw = read_excel_raw(path)
    if raw.shape[0] < 2:
        return pd.DataFrame()

    header = raw.iloc[0]
    pair_start = fedex_tracking_pair_start(header)
    tracking_col = fedex_tracking_id_column(header)
    rows: list[dict[str, object]] = []

    for idx in range(1, len(raw)):
        row = raw.iloc[idx]
        invoice_date = excel_cell_str(row, 2)
        invoice_number = excel_cell_str(row, 3)
        transportation_amount = excel_cell_num(row, 10)
        net_charge_amount = excel_cell_num(row, 11)
        service_type = excel_cell_str(row, 12)
        shipment_date = excel_cell_str(row, 14)
        recipient_state = excel_cell_str(row, 38)
        zone_code = excel_cell_str(row, 64)

        if not invoice_date or re.match(r"^(invoice|date)\b", invoice_date, re.I):
            continue
        if is_sci_notation_corrupted(invoice_number):
            continue

        tracking_id = excel_cell_str(row, tracking_col)

        def push_line(charge_desc: str, amount: float) -> None:
            if not charge_desc:
                return
            rec = empty_standard_row()
            rec.update({
                "Carrier Name": "FedEx",
                "Source File": path.name,
                "Invoice Date": invoice_date,
                "Invoice Number": invoice_number,
                "Tracking Number": tracking_id,
                "Shipment Reference Number 1": tracking_id,
                "Charge Description": charge_desc,
                "Net Amount": amount,
                "Invoice Amount": amount,
                "Package Quantity": 1,
                "Zone": zone_code,
                "Original Service Description": service_type,
                "Receiver State": recipient_state,
                "Shipment Date": shipment_date,
            })
            rows.append(rec)

        if service_type:
            push_line(service_type, transportation_amount or net_charge_amount)

        for i in range(25):
            desc_col = pair_start + i * 2
            amt_col = pair_start + 1 + i * 2
            desc = excel_cell_str(row, desc_col)
            amt = excel_cell_num(row, amt_col)
            push_line(desc, amt)

    return pd.DataFrame(rows)


def parse_wwe_file(path: Path) -> pd.DataFrame:
    raw = read_excel_raw(path)
    if raw.shape[0] < 2:
        return pd.DataFrame()

    rows: list[dict[str, object]] = []

    for idx in range(1, len(raw)):
        row = raw.iloc[idx]
        invoice_number = excel_cell_str(row, 1)
        airbill = excel_cell_str(row, 3)
        ship_date = excel_cell_str(row, 4)
        invoice_date = excel_cell_str(row, 56)
        receiver_state = excel_cell_str(row, 21)
        service_level = excel_cell_str(row, 62)
        zone = excel_cell_str(row, 63)

        if not invoice_date and not ship_date:
            continue
        if is_sci_notation_corrupted(invoice_number):
            continue

        for type_col, amt_col in zip(WWE_CHARGE_TYPE_COLS, WWE_CHARGE_AMT_COLS):
            charge_type = excel_cell_str(row, type_col)
            charge_amt = excel_cell_num(row, amt_col)
            if not charge_type:
                continue

            rec = empty_standard_row()
            rec.update({
                "Carrier Name": "WWE",
                "Source File": path.name,
                "Invoice Date": invoice_date or ship_date,
                "Invoice Number": invoice_number,
                "Tracking Number": airbill,
                "Charge Description": charge_type,
                "Net Amount": charge_amt,
                "Invoice Amount": charge_amt,
                "Package Quantity": 1,
                "Zone": zone,
                "Original Service Description": service_level,
                "Receiver State": receiver_state,
                "Shipment Date": ship_date,
            })
            rows.append(rec)

    return pd.DataFrame(rows)


def parse_ups_file(path: Path) -> tuple[pd.DataFrame, dict[str, object]]:
    df_file = pd.read_csv(path, header=None, dtype=str, low_memory=False)
    ncols = len(df_file.columns)
    nrows = len(df_file)

    critical_indexes = {col: UPS_HEADERS.index(col) for col in UPS_CRITICAL_COLUMNS}
    missing_critical = [col for col, pos in critical_indexes.items() if pos >= ncols]
    if missing_critical:
        return pd.DataFrame(), {
            "File": path.name,
            "Rows": nrows,
            "Columns": ncols,
            "Status": "SKIPPED - Missing critical columns",
            "Missing Critical Columns": ", ".join(missing_critical),
        }

    rename_map = {i: UPS_HEADERS[i] for i in range(min(ncols, len(UPS_HEADERS)))}
    df_file = df_file.rename(columns=rename_map)
    df_file["Source File"] = path.name
    df_file["Carrier Name"] = df_file.get("Carrier Name", pd.Series(["UPS"] * len(df_file))).fillna("UPS")
    df_file.loc[df_file["Carrier Name"].astype(str).str.strip() == "", "Carrier Name"] = "UPS"

    return df_file, {
        "File": path.name,
        "Rows": nrows,
        "Columns": ncols,
        "Expected Columns": len(UPS_HEADERS),
        "Column Delta": ncols - len(UPS_HEADERS),
        "Status": "OK",
        "Carrier": "UPS",
    }


def parse_excel_to_standard(path: Path, carrier: str) -> tuple[pd.DataFrame, dict[str, object]]:
    if carrier == "FedEx":
        df = parse_fedex_file(path)
    elif carrier == "WWE":
        df = parse_wwe_file(path)
    else:
        raise ValueError(f"Unsupported Excel carrier: {carrier}")

    status = "OK" if not df.empty else "SKIPPED - No charge lines parsed"
    log = {
        "File": path.name,
        "Rows": len(df),
        "Columns": "excel",
        "Status": status,
        "Carrier": carrier,
    }
    return df, log


def excel_to_ups_shape(df: pd.DataFrame) -> pd.DataFrame:
    """Normalize FedEx/WWE standard rows into UPS-shaped columns for shared analysis."""
    if df.empty:
        return df

    out = pd.DataFrame({h: "" for h in UPS_HEADERS}, index=range(len(df)))
    for col in [
        "Carrier Name", "Source File", "Invoice Date", "Invoice Number", "Account Number",
        "Tracking Number", "Shipment Reference Number 1", "Lead Shipment Number",
        "Charge Description", "Net Amount", "Invoice Amount", "Duty Amount",
        "Package Quantity", "Billed Weight", "Entered Weight", "Zone",
        "Charge Classification Code", "Charge Category Code", "Original Service Description",
        "Receiver State", "Sender Company Name", "Shipment Date",
    ]:
        if col in df.columns:
            out[col] = df[col].values

    for col in ["Net Amount", "Invoice Amount", "Duty Amount", "Package Quantity", "Billed Weight", "Entered Weight"]:
        if col in out.columns:
            out[col] = out[col].astype(str)

    return out
