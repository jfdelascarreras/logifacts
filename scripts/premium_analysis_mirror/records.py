"""Enrich charge-line records with taxonomy + export-friendly flags."""

from __future__ import annotations

from typing import Any

import pandas as pd

from .mapping import lookup_charge_taxonomy
from .primitives import (
    SURCHARGE_CATS,
    is_accessorial_cost_row,
    mode_from_zone,
    normalize_mapping_text,
    primary_rollup_date_raw,
    shipment_package_dedupe_key,
    to_number,
)


def enrich_records(
    records: list[dict[str, Any]],
    mapping_lookup: dict[str, dict[str, str]],
) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for rec in records:
        row = dict(rec)
        charge_description = str(row.get("Charge Description") or "").strip()
        mapping = lookup_charge_taxonomy(mapping_lookup, row.get("Carrier Name"), charge_description)

        if mapping:
            row["Transportation_Mode"] = mapping.get("transportation_mode", "")
            row["Category 1"] = mapping.get("category_1", "")
            row["Category 2"] = mapping.get("category_2", "")
            row["Category 3"] = mapping.get("category_3", "")
            row["Category 4"] = mapping.get("category_4", "")
            row["Category 5"] = mapping.get("category_5", "")
            row["Standardized Charge"] = str(mapping.get("standardized_charge") or "").strip()
            row["mapped"] = True
        else:
            for col in [
                "Transportation_Mode",
                "Category 1",
                "Category 2",
                "Category 3",
                "Category 4",
                "Category 5",
                "Standardized Charge",
            ]:
                row[col] = ""
            row["mapped"] = False

        cat3 = normalize_mapping_text(row.get("Category 3"))
        cat1 = normalize_mapping_text(row.get("Category 1"))
        cc = str(row.get("Charge Classification Code") or "").strip().upper()
        ccc = str(row.get("Charge Category Code") or "").strip().upper()
        net = to_number(row.get("Net Amount"))

        row["isFuel"] = cat3 == "FUEL SURCHARGE"
        row["isSurcharge"] = cat3 in SURCHARGE_CATS
        row["isAccessorial"] = is_accessorial_cost_row(cc, ccc, cat1, cat3)
        row["costFuel"] = net if row["isFuel"] else 0.0
        row["costSurcharges"] = net if row["isSurcharge"] else 0.0
        row["costAccessorials"] = net if row["isAccessorial"] else 0.0
        row["weightGapLine"] = to_number(row.get("Billed Weight")) - to_number(row.get("Entered Weight"))
        row["Mode"] = mode_from_zone(row.get("Zone"))
        row["shipmentPackageKey"] = shipment_package_dedupe_key(row)
        date_key = primary_rollup_date_raw(row)
        row["rollupDateKey"] = date_key or ""
        out.append(row)
    return out


def records_to_dataframe(records: list[dict[str, Any]]) -> pd.DataFrame:
    return pd.DataFrame(records)


def unmapped_charge_summary(df: pd.DataFrame) -> pd.DataFrame:
    if "mapped" not in df.columns:
        return pd.DataFrame(columns=["Carrier Name", "Charge Description", "Occurrences", "Total Net Amount"])
    unmapped = df[~df["mapped"]].copy()
    if unmapped.empty:
        return pd.DataFrame(columns=["Carrier Name", "Charge Description", "Occurrences", "Total Net Amount"])
    grouped = (
        unmapped.groupby(["Carrier Name", "Charge Description"], dropna=False)
        .agg(
            Occurrences=("Charge Description", "size"),
            **{"Total Net Amount": ("Net Amount", lambda s: sum(to_number(v) for v in s))},
        )
        .reset_index()
        .sort_values(["Occurrences", "Total Net Amount"], ascending=[False, False])
    )
    return grouped
