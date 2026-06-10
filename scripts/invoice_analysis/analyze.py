"""KPI aggregation — aligned with computeInvoiceAnalysisSummary."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from .constants import SURCHARGE_CATS
from .utils import (
    fmt_lbs,
    fmt_money,
    fmt_num,
    fmt_pct,
    mode_from_zone,
    safe_pct,
    shipment_package_dedupe_key,
)


@dataclass
class AnalysisResult:
    df: pd.DataFrame
    summary_totals_table: pd.DataFrame
    invoice_display_table: pd.DataFrame
    invoice_totals: pd.DataFrame
    monthly_display_table: pd.DataFrame
    monthly_totals: pd.DataFrame
    cost_by_file_display: pd.DataFrame
    cost_by_carrier_display: pd.DataFrame
    cost_by_file: pd.DataFrame
    diagnostics_table: pd.DataFrame
    unmapped_table: pd.DataFrame


def is_accessorial_cost_row(
    charge_classification: str,
    charge_category_code: str,
    category_1: str,
    category_3: str,
) -> bool:
    cc = str(charge_classification or "").strip().upper()
    cat_code = str(charge_category_code or "").strip().upper()
    if cc == "ACC" and cat_code not in {"INF", "ICC"}:
        return True
    c1 = str(category_1 or "").strip().upper()
    c3 = str(category_3 or "").strip().upper()
    return c1 == "ACCESSORIAL SURCHARGE" and c3 not in SURCHARGE_CATS


def classify_measures(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    out["isFuel"] = out["Category 3"] == "FUEL SURCHARGE"
    out["isAccessorial"] = out.apply(
        lambda r: is_accessorial_cost_row(
            r.get("Charge Classification Code", ""),
            r.get("Charge Category Code", ""),
            r.get("Category 1", ""),
            r.get("Category 3", ""),
        ),
        axis=1,
    )
    out["isSurcharge"] = out["Category 3"].isin(list(SURCHARGE_CATS))
    out["costFuel"] = np.where(out["isFuel"], out["Net Amount"], 0)
    out["costAccessorials"] = np.where(out["isAccessorial"], out["Net Amount"], 0)
    out["costSurcharges"] = np.where(out["isSurcharge"], out["Net Amount"], 0)
    out["weightGapLine"] = out["Billed Weight"] - out["Entered Weight"]
    out["shipmentPackageKey"] = out.apply(shipment_package_dedupe_key, axis=1)
    out["MonthYear"] = out["Invoice Date"].dt.to_period("M")
    out["Mode"] = out["Zone"].apply(mode_from_zone)
    return out


def build_analysis(
    df: pd.DataFrame,
    *,
    files_loaded: int,
    file_structure_log: list[dict[str, object]],
    rows_dropped_sci: int,
    rows_dropped_charge_dedupe: int,
    rows_before_merge: int,
    rows_after_merge: int,
    unmapped_table: pd.DataFrame,
) -> AnalysisResult:
    df = classify_measures(df)

    total_cost = df["Net Amount"].sum()
    fuel_cost = df["costFuel"].sum()
    cost_accessorials = df["costAccessorials"].sum()
    cost_surcharges = df["costSurcharges"].sum()
    total_volume = df["Package Quantity"].sum()
    weight_gap = df["weightGapLine"].sum()

    package_dedupe = df[df["shipmentPackageKey"].notna()].copy()
    package_by_key = (
        package_dedupe.groupby("shipmentPackageKey", as_index=False)
        .agg(
            invoiceNumber=("Invoice Number", "first"),
            invoiceDate=("Invoice Date", "min"),
            packageQuantity=("Package Quantity", "max"),
            monthYear=("MonthYear", "first"),
        )
    )
    total_packages_deduped = package_by_key["packageQuantity"].sum()
    shipment_count = package_by_key["shipmentPackageKey"].nunique()

    summary_totals_table = pd.DataFrame({
        "KPI": [
            "Total Cost", "Fuel Cost", "Fuel % of Total",
            "Accessorials", "Accessorials % of Total",
            "Surcharges", "Surcharges % of Total",
            "Total Volume", "Deduped Packages", "Shipments", "Weight Gap",
            "Mapped Lines", "Unmapped Lines",
        ],
        "Total": [
            fmt_money(total_cost), fmt_money(fuel_cost), fmt_pct(safe_pct(fuel_cost, total_cost)),
            fmt_money(cost_accessorials), fmt_pct(safe_pct(cost_accessorials, total_cost)),
            fmt_money(cost_surcharges), fmt_pct(safe_pct(cost_surcharges, total_cost)),
            fmt_num(total_volume), fmt_num(total_packages_deduped),
            fmt_num(shipment_count), fmt_lbs(weight_gap),
            fmt_num(int(df["mapped"].sum())), fmt_num(int((~df["mapped"]).sum())),
        ],
    })

    invoice_base = (
        df.groupby("Invoice Number", dropna=False)
        .agg(
            invoiceDate=("Invoice Date", "min"),
            carrier=("Carrier Name", "first"),
            totalCost=("Net Amount", "sum"),
            fuelCost=("costFuel", "sum"),
            accessorials=("costAccessorials", "sum"),
            surcharges=("costSurcharges", "sum"),
            totalVolume=("Package Quantity", "sum"),
            weightGap=("weightGapLine", "sum"),
            rowCount=("Net Amount", "size"),
        )
        .reset_index()
    )

    invoice_package = (
        package_by_key.groupby("invoiceNumber", dropna=False)
        .agg(
            dedupedPackages=("packageQuantity", "sum"),
            shipments=("shipmentPackageKey", "nunique"),
        )
        .reset_index()
        .rename(columns={"invoiceNumber": "Invoice Number"})
    )

    invoice_totals = invoice_base.merge(invoice_package, on="Invoice Number", how="left")
    invoice_totals["dedupedPackages"] = invoice_totals["dedupedPackages"].fillna(0)
    invoice_totals["shipments"] = invoice_totals["shipments"].fillna(0)

    for pct_col, num_col in [
        ("fuelPct", "fuelCost"), ("accessorialPct", "accessorials"), ("surchargePct", "surcharges"),
    ]:
        invoice_totals[pct_col] = np.where(
            invoice_totals["totalCost"] != 0,
            invoice_totals[num_col] / invoice_totals["totalCost"],
            0,
        )

    invoice_totals = invoice_totals.sort_values("invoiceDate", ascending=True)

    invoice_display_table = pd.DataFrame({
        "Invoice Date": invoice_totals["invoiceDate"].dt.date.astype(str),
        "Carrier": invoice_totals["carrier"].astype(str),
        "Invoice Name / Number": invoice_totals["Invoice Number"].astype(str),
        "Total Cost": invoice_totals["totalCost"].map(fmt_money),
        "Fuel Cost": invoice_totals["fuelCost"].map(fmt_money),
        "Fuel %": invoice_totals["fuelPct"].map(fmt_pct),
        "Accessorials": invoice_totals["accessorials"].map(fmt_money),
        "Accessorials %": invoice_totals["accessorialPct"].map(fmt_pct),
        "Surcharges": invoice_totals["surcharges"].map(fmt_money),
        "Surcharges %": invoice_totals["surchargePct"].map(fmt_pct),
        "Total Volume": invoice_totals["totalVolume"].map(fmt_num),
        "Deduped Packages": invoice_totals["dedupedPackages"].map(fmt_num),
        "Shipments": invoice_totals["shipments"].map(fmt_num),
        "Weight Gap": invoice_totals["weightGap"].map(fmt_lbs),
    })

    monthly_base = (
        df.groupby("MonthYear", dropna=False)
        .agg(
            totalCost=("Net Amount", "sum"),
            fuelCost=("costFuel", "sum"),
            accessorials=("costAccessorials", "sum"),
            surcharges=("costSurcharges", "sum"),
            totalVolume=("Package Quantity", "sum"),
            weightGap=("weightGapLine", "sum"),
        )
        .reset_index()
    )

    monthly_package = (
        package_by_key.groupby("monthYear", dropna=False)
        .agg(
            dedupedPackages=("packageQuantity", "sum"),
            shipments=("shipmentPackageKey", "nunique"),
        )
        .reset_index()
        .rename(columns={"monthYear": "MonthYear"})
    )

    monthly_totals = monthly_base.merge(monthly_package, on="MonthYear", how="left")
    monthly_totals["dedupedPackages"] = monthly_totals["dedupedPackages"].fillna(0)
    monthly_totals["shipments"] = monthly_totals["shipments"].fillna(0)

    for pct_col, num_col in [
        ("fuelPct", "fuelCost"), ("accessorialPct", "accessorials"), ("surchargePct", "surcharges"),
    ]:
        monthly_totals[pct_col] = np.where(
            monthly_totals["totalCost"] != 0,
            monthly_totals[num_col] / monthly_totals["totalCost"],
            0,
        )

    monthly_totals = monthly_totals.sort_values("MonthYear", ascending=True)

    monthly_display_table = pd.DataFrame({
        "Month": monthly_totals["MonthYear"].astype(str),
        "Total Cost": monthly_totals["totalCost"].map(fmt_money),
        "Fuel Cost": monthly_totals["fuelCost"].map(fmt_money),
        "Fuel %": monthly_totals["fuelPct"].map(fmt_pct),
        "Accessorials": monthly_totals["accessorials"].map(fmt_money),
        "Accessorials %": monthly_totals["accessorialPct"].map(fmt_pct),
        "Surcharges": monthly_totals["surcharges"].map(fmt_money),
        "Surcharges %": monthly_totals["surchargePct"].map(fmt_pct),
        "Total Volume": monthly_totals["totalVolume"].map(fmt_num),
        "Deduped Packages": monthly_totals["dedupedPackages"].map(fmt_num),
        "Shipments": monthly_totals["shipments"].map(fmt_num),
        "Weight Gap": monthly_totals["weightGap"].map(fmt_lbs),
    })

    def _cost_agg(group_col: str) -> tuple[pd.DataFrame, pd.DataFrame]:
        grouped = (
            df.groupby(group_col, dropna=False)
            .agg(
                totalCost=("Net Amount", "sum"),
                fuelCost=("costFuel", "sum"),
                accessorials=("costAccessorials", "sum"),
                surcharges=("costSurcharges", "sum"),
                rowCount=("Net Amount", "size"),
            )
            .reset_index()
            .sort_values("totalCost", ascending=False)
        )
        for pct_col, num_col in [
            ("fuelPct", "fuelCost"), ("accessorialPct", "accessorials"), ("surchargePct", "surcharges"),
        ]:
            grouped[pct_col] = np.where(grouped["totalCost"] != 0, grouped[num_col] / grouped["totalCost"], 0)

        display = pd.DataFrame({
            group_col: grouped[group_col],
            "Total Cost": grouped["totalCost"].map(fmt_money),
            "Fuel Cost": grouped["fuelCost"].map(fmt_money),
            "Fuel %": grouped["fuelPct"].map(fmt_pct),
            "Accessorials": grouped["accessorials"].map(fmt_money),
            "Accessorials %": grouped["accessorialPct"].map(fmt_pct),
            "Surcharges": grouped["surcharges"].map(fmt_money),
            "Surcharges %": grouped["surchargePct"].map(fmt_pct),
            "Row Count": grouped["rowCount"].map(fmt_num),
        })
        return grouped, display

    cost_by_file, cost_by_file_display = _cost_agg("Source File")
    _, cost_by_carrier_display = _cost_agg("Carrier Name")

    diagnostics_table = pd.DataFrame({
        "Diagnostic": [
            "Files loaded",
            "Files skipped (duplicate content)",
            "Files skipped (missing columns / parse errors)",
            "Rows dropped (sci-notation corrupted IDs)",
            "Rows dropped (duplicate charge lines)",
            "Rows after merge delta",
        ],
        "Count": [
            files_loaded,
            sum(1 for r in file_structure_log if "Duplicate" in str(r.get("Status", ""))),
            sum(1 for r in file_structure_log if str(r.get("Status", "")).startswith("SKIPPED")),
            int(rows_dropped_sci),
            int(rows_dropped_charge_dedupe),
            rows_after_merge - rows_before_merge,
        ],
    })

    return AnalysisResult(
        df=df,
        summary_totals_table=summary_totals_table,
        invoice_display_table=invoice_display_table,
        invoice_totals=invoice_totals,
        monthly_display_table=monthly_display_table,
        monthly_totals=monthly_totals,
        cost_by_file_display=cost_by_file_display,
        cost_by_carrier_display=cost_by_carrier_display,
        cost_by_file=cost_by_file,
        diagnostics_table=diagnostics_table,
        unmapped_table=unmapped_table,
    )
