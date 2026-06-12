"""master_mapping load + taxonomy lookup — mirrors buildChargeDescriptionLookup."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from .primitives import canonical_premium_carrier, normalize_mapping_text

Taxonomy = dict[str, str]
Lookup = dict[str, Taxonomy]


def build_charge_description_lookup(rows: list[dict[str, Any]] | None) -> Lookup:
    out: Lookup = {}
    for m in rows or []:
        desc_norm = normalize_mapping_text(m.get("charge_description"))
        if not desc_norm:
            continue
        raw_carrier = normalize_mapping_text(m.get("carrier") or "")
        carrier_lookup = canonical_premium_carrier("UPS" if raw_carrier == "" else raw_carrier)
        payload = {
            "transportation_mode": str(m.get("transportation_mode") or "").strip(),
            "category_1": str(m.get("category_1") or "").strip(),
            "category_2": str(m.get("category_2") or "").strip(),
            "category_3": str(m.get("category_3") or "").strip(),
            "category_4": str(m.get("category_4") or "").strip(),
            "category_5": str(m.get("category_5") or "").strip(),
            "standardized_charge": str(m.get("standardized_charge") or "").strip(),
        }
        out[f"{carrier_lookup}\t{desc_norm}"] = payload
        if carrier_lookup == "UPS":
            out[desc_norm] = payload
    return out


def lookup_charge_taxonomy(
    lookup: Lookup,
    invoice_carrier: Any,
    charge_description: Any,
) -> Taxonomy | None:
    desc_norm = normalize_mapping_text(charge_description)
    if not desc_norm:
        return None
    carrier_lookup = canonical_premium_carrier(str(invoice_carrier or "") or "UPS")
    hit = lookup.get(f"{carrier_lookup}\t{desc_norm}")
    if not hit and carrier_lookup != "UPS":
        hit = lookup.get(f"UPS\t{desc_norm}")
    if not hit:
        hit = lookup.get(desc_norm)
    return hit


def load_master_mapping_xlsx(path: Path) -> list[dict[str, Any]]:
    """Load consolidated master mapping workbook (same layout as legacy invoice_analysis)."""
    import pandas as pd

    df = pd.read_excel(path, dtype=str, skiprows=1, engine="openpyxl")
    df.columns = df.columns.str.strip()

    if "Charge Description" not in df.columns:
        raise ValueError(f"'Charge Description' missing in {path}")

    for col in ["Transportation_Mode", "Category 1", "Category 2", "Category 3", "Category 4", "Category 5"]:
        if col not in df.columns:
            df[col] = ""
    if "Standardized Charge" not in df.columns:
        df["Standardized Charge"] = ""
    if "Carrier" not in df.columns:
        df["Carrier"] = "UPS"

    rows: list[dict[str, Any]] = []
    for _, r in df.iterrows():
        desc = str(r.get("Charge Description") or "").strip()
        if not desc or desc.lower() == "charge description":
            continue
        rows.append(
            {
                "charge_description": desc,
                "carrier": str(r.get("Carrier") or "UPS").strip(),
                "transportation_mode": str(r.get("Transportation_Mode") or "").strip(),
                "category_1": str(r.get("Category 1") or "").strip(),
                "category_2": str(r.get("Category 2") or "").strip(),
                "category_3": str(r.get("Category 3") or "").strip(),
                "category_4": str(r.get("Category 4") or "").strip(),
                "category_5": str(r.get("Category 5") or "").strip(),
                "standardized_charge": str(r.get("Standardized Charge") or "").strip(),
            }
        )
    return rows
