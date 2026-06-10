"""Excel workbook export — invoice lines + mapping in one sheet."""

from __future__ import annotations

from pathlib import Path

import pandas as pd

from .analyze import AnalysisResult

# Invoice fields to export when present / non-empty (WWE, FedEx, UPS).
INVOICE_DETAIL_COLUMNS = [
    "Source File",
    "Carrier Name",
    "Invoice Date",
    "Invoice Number",
    "Account Number",
    "Tracking Number",
    "Shipment Reference Number 1",
    "Lead Shipment Number",
    "Shipment Date",
    "Charge Description",
    "Net Amount",
    "Invoice Amount",
    "Duty Amount",
    "Package Quantity",
    "Billed Weight",
    "Entered Weight",
    "Zone",
    "Receiver State",
    "Original Service Description",
    "Sender Company Name",
    "Charge Classification Code",
    "Charge Category Code",
]

MAPPING_DETAIL_COLUMNS = [
    "mapped",
    "Transportation_Mode",
    "Category 1",
    "Category 2",
    "Category 3",
    "Category 4",
    "Category 5",
    "Standardized Charge",
]

MEASURE_DETAIL_COLUMNS = [
    "isFuel",
    "isAccessorial",
    "isSurcharge",
    "costFuel",
    "costAccessorials",
    "costSurcharges",
    "weightGapLine",
    "Mode",
    "MonthYear",
]


def _column_has_values(df: pd.DataFrame, col: str) -> bool:
    if col not in df.columns:
        return False
    series = df[col]
    if pd.api.types.is_numeric_dtype(series):
        return series.fillna(0).ne(0).any()
    return series.astype(str).str.strip().replace("nan", "").ne("").any()


def build_invoice_mapped_detail(df: pd.DataFrame) -> pd.DataFrame:
    """One row per charge line: invoice fields + master mapping + KPI flags."""
    invoice_cols = [c for c in INVOICE_DETAIL_COLUMNS if _column_has_values(df, c)]
    mapping_cols = [c for c in MAPPING_DETAIL_COLUMNS if c in df.columns]
    measure_cols = [c for c in MEASURE_DETAIL_COLUMNS if c in df.columns]

    ordered = invoice_cols + mapping_cols + measure_cols
    out = df[ordered].copy()

    if "Invoice Date" in out.columns:
        out["Invoice Date"] = pd.to_datetime(out["Invoice Date"], errors="coerce")
    if "Shipment Date" in out.columns:
        out["Shipment Date"] = pd.to_datetime(out["Shipment Date"], errors="coerce")
    if "MonthYear" in out.columns:
        out["MonthYear"] = out["MonthYear"].astype(str)

    return out.sort_values(
        by=[c for c in ["Invoice Date", "Invoice Number", "Source File", "Charge Description"] if c in out.columns],
        na_position="last",
    ).reset_index(drop=True)


def export_combined_invoice_mapped(df: pd.DataFrame, output_path: Path) -> Path:
    """Single-sheet workbook: all invoice rows with mapped taxonomy columns."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    detail = build_invoice_mapped_detail(df)
    with pd.ExcelWriter(output_path, engine="openpyxl") as writer:
        detail.to_excel(writer, sheet_name="Invoice Lines Mapped", index=False)
    return output_path


def export_workbook(result: AnalysisResult, file_structure_df: pd.DataFrame, output_path: Path) -> Path:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    detail = build_invoice_mapped_detail(result.df)

    with pd.ExcelWriter(output_path, engine="openpyxl") as writer:
        detail.to_excel(writer, sheet_name="Invoice Lines Mapped", index=False)
        result.summary_totals_table.to_excel(writer, sheet_name="Summary Totals", index=False)
        result.cost_by_carrier_display.to_excel(writer, sheet_name="Cost by Carrier", index=False)
        result.cost_by_file_display.to_excel(writer, sheet_name="Cost by Source File", index=False)
        result.monthly_display_table.to_excel(writer, sheet_name="Monthly Totals Display", index=False)
        result.monthly_totals.to_excel(writer, sheet_name="Monthly Totals Raw", index=False)
        result.invoice_display_table.to_excel(writer, sheet_name="Invoice Totals Display", index=False)
        result.invoice_totals.to_excel(writer, sheet_name="Invoice Totals Raw", index=False)
        result.unmapped_table.to_excel(writer, sheet_name="Unmapped Charges", index=False)
        file_structure_df.to_excel(writer, sheet_name="File Structure", index=False)
        result.diagnostics_table.to_excel(writer, sheet_name="Ingest Diagnostics", index=False)

    return output_path
