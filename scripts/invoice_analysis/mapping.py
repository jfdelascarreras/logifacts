"""Master mapping load + carrier-aware taxonomy lookup (mirrors buildChargeDescriptionLookup)."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import pandas as pd

from .utils import canonical_mapping_carrier, normalize_text


@dataclass(frozen=True)
class TaxonomyValue:
    transportation_mode: str
    category_1: str
    category_2: str
    category_3: str
    category_4: str
    category_5: str
    standardized_charge: str


def load_master_mapping(path: Path, skiprows: int = 1) -> pd.DataFrame:
    mapping = pd.read_excel(path, dtype=str, skiprows=skiprows)
    mapping.columns = mapping.columns.str.strip()

    charge_col = "Charge Description"
    if charge_col not in mapping.columns:
        raise ValueError(
            f"'{charge_col}' missing in mapping file. Available: {mapping.columns.tolist()}"
        )

    mapping["_charge_key"] = normalize_text(mapping[charge_col])

    for col in ["Transportation_Mode", "Category 1", "Category 2", "Category 3", "Category 4", "Category 5"]:
        if col not in mapping.columns:
            mapping[col] = ""
        mapping[col] = normalize_text(mapping[col])

    if "Standardized Charge" not in mapping.columns:
        mapping["Standardized Charge"] = ""
    mapping["Standardized Charge"] = mapping["Standardized Charge"].fillna("").astype(str).str.strip()

    if "Carrier" not in mapping.columns:
        mapping["Carrier"] = "UPS"
    mapping["_carrier_key"] = mapping["Carrier"].map(lambda x: canonical_mapping_carrier(str(x)))

    return mapping


def build_taxonomy_lookup(mapping: pd.DataFrame) -> dict[str, TaxonomyValue]:
    lookup: dict[str, TaxonomyValue] = {}

    for _, row in mapping.iterrows():
        desc_key = str(row.get("_charge_key", "")).strip()
        if not desc_key:
            continue

        payload = TaxonomyValue(
            transportation_mode=str(row.get("Transportation_Mode", "")).strip(),
            category_1=str(row.get("Category 1", "")).strip(),
            category_2=str(row.get("Category 2", "")).strip(),
            category_3=str(row.get("Category 3", "")).strip(),
            category_4=str(row.get("Category 4", "")).strip(),
            category_5=str(row.get("Category 5", "")).strip(),
            standardized_charge=str(row.get("Standardized Charge", "")).strip(),
        )

        carrier_key = str(row.get("_carrier_key", "UPS")).strip() or "UPS"
        lookup[f"{carrier_key}\t{desc_key}"] = payload

        if carrier_key == "UPS":
            lookup[desc_key] = payload

    return lookup


def lookup_taxonomy(
    lookup: dict[str, TaxonomyValue],
    carrier_raw: str,
    charge_description: str,
) -> TaxonomyValue | None:
    desc_key = normalize_text(charge_description)
    if not desc_key:
        return None

    carrier_key = canonical_mapping_carrier(carrier_raw or "UPS")

    hit = lookup.get(f"{carrier_key}\t{desc_key}")
    if hit is None and carrier_key != "UPS":
        hit = lookup.get(f"UPS\t{desc_key}")
    if hit is None:
        hit = lookup.get(desc_key)
    return hit


def apply_mapping(df: pd.DataFrame, lookup: dict[str, TaxonomyValue]) -> pd.DataFrame:
    out = df.copy()
    taxonomy_cols = {
        "Transportation_Mode": [],
        "Category 1": [],
        "Category 2": [],
        "Category 3": [],
        "Category 4": [],
        "Category 5": [],
        "Standardized Charge": [],
        "mapped": [],
    }

    for _, row in out.iterrows():
        hit = lookup_taxonomy(
            lookup,
            str(row.get("Carrier Name", "")),
            str(row.get("Charge Description", "")),
        )
        if hit:
            taxonomy_cols["Transportation_Mode"].append(hit.transportation_mode)
            taxonomy_cols["Category 1"].append(hit.category_1)
            taxonomy_cols["Category 2"].append(hit.category_2)
            taxonomy_cols["Category 3"].append(hit.category_3)
            taxonomy_cols["Category 4"].append(hit.category_4)
            taxonomy_cols["Category 5"].append(hit.category_5)
            taxonomy_cols["Standardized Charge"].append(hit.standardized_charge)
            taxonomy_cols["mapped"].append(True)
        else:
            for col in ["Transportation_Mode", "Category 1", "Category 2", "Category 3", "Category 4", "Category 5", "Standardized Charge"]:
                taxonomy_cols[col].append("")
            taxonomy_cols["mapped"].append(False)

    for col, values in taxonomy_cols.items():
        out[col] = values
    return out


def unmapped_charge_summary(df: pd.DataFrame) -> pd.DataFrame:
    unmapped = df[~df["mapped"]].copy()
    if unmapped.empty:
        return pd.DataFrame(columns=["Carrier Name", "Charge Description", "Occurrences", "Total Net Amount"])

    grouped = (
        unmapped.groupby(["Carrier Name", "Charge Description"], dropna=False)
        .agg(
            Occurrences=("Charge Description", "size"),
            **{"Total Net Amount": ("Net Amount", "sum")},
        )
        .reset_index()
        .sort_values(["Occurrences", "Total Net Amount"], ascending=[False, False])
    )
    return grouped
