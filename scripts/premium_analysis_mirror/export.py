"""Excel export — same sheet layout as legacy invoice_analysis export."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pandas as pd

from .utils import fmt_money, fmt_num, safe_pct

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
    "rollupDateKey",
    "shipmentPackageKey",
]


def _column_has_values(df: pd.DataFrame, col: str) -> bool:
    if col not in df.columns:
        return False
    series = df[col]
    if pd.api.types.is_numeric_dtype(series):
        return series.fillna(0).ne(0).any()
    return series.astype(str).str.strip().replace("nan", "").ne("").any()


def build_invoice_mapped_detail(df: pd.DataFrame) -> pd.DataFrame:
    invoice_cols = [c for c in INVOICE_DETAIL_COLUMNS if _column_has_values(df, c)]
    mapping_cols = [c for c in MAPPING_DETAIL_COLUMNS if c in df.columns]
    measure_cols = [c for c in MEASURE_DETAIL_COLUMNS if c in df.columns]
    ordered = invoice_cols + mapping_cols + measure_cols
    out = df[ordered].copy()
    sort_cols = [c for c in ["Invoice Date", "Invoice Number", "Source File", "Charge Description"] if c in out.columns]
    if sort_cols:
        out = out.sort_values(by=sort_cols, na_position="last").reset_index(drop=True)
    return out


def build_summary_tables(summary: dict[str, Any], df: pd.DataFrame, ingest: dict[str, Any]) -> dict[str, pd.DataFrame]:
    m = summary["measures"]
    t = summary["totals"]
    total_cost = m["totalCost"]
    unmapped_count = int((~df["mapped"]).sum()) if "mapped" in df.columns else 0
    mapped_count = len(df) - unmapped_count

    summary_totals = pd.DataFrame(
        {
            "KPI": [
                "Total Cost",
                "Fuel Cost",
                "Fuel % of Total",
                "Accessorials",
                "Accessorials % of Total",
                "Surcharges",
                "Surcharges % of Total",
                "Total Packages (deduped)",
                "Shipments (deduped)",
                "Weight Gap (lbs)",
                "Mapped Lines",
                "Unmapped Lines",
                "Net Amount (totals)",
            ],
            "Total": [
                fmt_money(total_cost),
                fmt_money(m["fuelCost"]),
                f"{safe_pct(m['fuelCost'], total_cost):.1%}",
                fmt_money(m["costAccessorials"]),
                f"{safe_pct(m['costAccessorials'], total_cost):.1%}",
                fmt_money(m["costSurcharges"]),
                f"{safe_pct(m['costSurcharges'], total_cost):.1%}",
                fmt_num(m["totalPackages"]),
                fmt_num(m["packageDedupeShipmentCount"]),
                fmt_num(m["weightGap"]),
                fmt_num(mapped_count),
                fmt_num(unmapped_count),
                fmt_money(t["netAmount"]),
            ],
        }
    )

    diagnostics = pd.DataFrame(
        {
            "Diagnostic": [
                "Files loaded",
                "Rows dropped (sci-notation IDs)",
                "Rows dropped (date gate)",
                "Rows dropped (duplicate charge lines)",
            ],
            "Count": [
                ingest.get("filesLoaded", 0),
                ingest.get("rowsDroppedCriticalSciCorruption", 0),
                ingest.get("rowsDroppedDateGate", 0),
                ingest.get("duplicateChargeRowsDropped", 0),
            ],
        }
    )

    monthly_display = pd.DataFrame(
        [
            {
                "Month": row["month"],
                "Total Cost": fmt_money(row["totalCost"]),
                "Fuel Cost": fmt_money(row.get("costFuel", 0)),
                "Accessorials": fmt_money(row.get("costAccessorials", 0)),
                "Surcharges": fmt_money(row.get("costSurcharges", 0)),
            }
            for row in summary.get("monthlySpend", [])
        ]
    )

    invoice_display = pd.DataFrame(
        [
            {
                "Invoice Date": row.get("invoiceDate") or "",
                "Invoice Number": row["invoiceNumber"],
                "Account": row.get("accountNumber") or "",
                "Total Cost": fmt_money(row["totalCost"]),
                "Fuel Cost": fmt_money(row.get("costFuel", 0)),
                "Accessorials": fmt_money(row.get("costAccessorials", 0)),
                "Surcharges": fmt_money(row.get("costSurcharges", 0)),
            }
            for row in summary.get("spendByInvoice", [])
        ]
    )

    carrier_rows = []
    for carrier, vals in summary.get("byCarrier", {}).items():
        carrier_rows.append(
            {
                "Carrier Name": carrier,
                "Total Cost": fmt_money(vals["totalNetAmount"]),
                "Charge Lines": fmt_num(vals["chargeLineCount"]),
            }
        )
    cost_by_carrier = pd.DataFrame(carrier_rows).sort_values("Total Cost", ascending=False) if carrier_rows else pd.DataFrame()

    from .primitives import to_number as tn

    if "Source File" in df.columns:
        by_file = (
            df.groupby("Source File", dropna=False)
            .apply(
                lambda g: pd.Series({"totalCost": sum(tn(v) for v in g["Net Amount"]), "rowCount": len(g)}),
                include_groups=False,
            )
            .reset_index()
        )
        cost_by_file = by_file.sort_values("totalCost", ascending=False)
    else:
        cost_by_file = pd.DataFrame()

    return {
        "summary_totals": summary_totals,
        "diagnostics": diagnostics,
        "monthly_display": monthly_display,
        "invoice_display": invoice_display,
        "cost_by_carrier": cost_by_carrier,
        "cost_by_file": cost_by_file,
    }


def export_workbook(
    detail_df: pd.DataFrame,
    tables: dict[str, pd.DataFrame],
    file_structure_df: pd.DataFrame,
    unmapped_df: pd.DataFrame,
    output_path: Path,
) -> Path:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    detail = build_invoice_mapped_detail(detail_df)
    with pd.ExcelWriter(output_path, engine="openpyxl") as writer:
        detail.to_excel(writer, sheet_name="Invoice Lines Mapped", index=False)
        tables["summary_totals"].to_excel(writer, sheet_name="Summary Totals", index=False)
        if not tables["cost_by_carrier"].empty:
            tables["cost_by_carrier"].to_excel(writer, sheet_name="Cost by Carrier", index=False)
        if not tables["cost_by_file"].empty:
            tables["cost_by_file"].to_excel(writer, sheet_name="Cost by Source File", index=False)
        if not tables["monthly_display"].empty:
            tables["monthly_display"].to_excel(writer, sheet_name="Monthly Totals Display", index=False)
        if not tables["invoice_display"].empty:
            tables["invoice_display"].to_excel(writer, sheet_name="Invoice Totals Display", index=False)
        unmapped_df.to_excel(writer, sheet_name="Unmapped Charges", index=False)
        file_structure_df.to_excel(writer, sheet_name="File Structure", index=False)
        tables["diagnostics"].to_excel(writer, sheet_name="Ingest Diagnostics", index=False)
    return output_path


def export_combined_invoice_mapped(detail_df: pd.DataFrame, output_path: Path) -> Path:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    build_invoice_mapped_detail(detail_df).to_excel(output_path, sheet_name="Invoice Lines Mapped", index=False)
    return output_path
