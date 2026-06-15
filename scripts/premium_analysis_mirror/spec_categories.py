"""AGENTS charge categories — mirrors lib/premium-analysis/spec-categories.ts."""

from __future__ import annotations

import re
from typing import Any

from .mapping import lookup_charge_taxonomy
from .primitives import normalize_mapping_text, to_number

AGENTS_CHARGE_CATEGORIES = (
    "BASE_FREIGHT",
    "FUEL",
    "RESIDENTIAL",
    "DELIVERY_AREA",
    "PEAK",
    "ADD_HANDLING",
    "ADDRESS_CORRECTION",
    "LARGE_PACKAGE",
    "DECLARED_VALUE",
    "OTHER",
)


def _norm_std(value: str | None) -> str:
    return re.sub(r"[^A-Z0-9]+", " ", normalize_mapping_text(value)).strip()


def category_from_standardized_charge(std: str) -> str | None:
    n = _norm_std(std)
    if not n:
        return None
    if re.search(r"TRANSPORT|BASE CHARGE|BASE FREIGHT|FREIGHT CHARGE", n):
        return "BASE_FREIGHT"
    if "FUEL" in n:
        return "FUEL"
    if "RESIDENTIAL" in n:
        return "RESIDENTIAL"
    if re.search(r"DELIVERY AREA|DAS|REMOTE", n):
        return "DELIVERY_AREA"
    if re.search(r"PEAK|DEMAND", n):
        return "PEAK"
    if re.search(r"ADDITIONAL HANDLING|ADD HANDLING", n):
        return "ADD_HANDLING"
    if "ADDRESS CORRECTION" in n:
        return "ADDRESS_CORRECTION"
    if re.search(r"LARGE PACKAGE|OVERSIZE|OVER SIZE", n):
        return "LARGE_PACKAGE"
    if "DECLARED VALUE" in n:
        return "DECLARED_VALUE"
    return None


def category_from_taxonomy(cat1: str, cat3: str) -> str | None:
    c1 = normalize_mapping_text(cat1)
    c3 = normalize_mapping_text(cat3)
    if c3 == "FUEL SURCHARGE" or "FUEL" in c1:
        return "FUEL"
    if c3 == "SURCHARGE" and re.search(r"PEAK|DEMAND", c1):
        return "PEAK"
    if "RESIDENTIAL" in c1:
        return "RESIDENTIAL"
    if "DELIVERY" in c1 or "DELIVERY" in c3:
        return "DELIVERY_AREA"
    if "ADDRESS" in c1:
        return "ADDRESS_CORRECTION"
    if "HANDLING" in c1:
        return "ADD_HANDLING"
    if "LARGE" in c1 or "OVERSIZE" in c1:
        return "LARGE_PACKAGE"
    if "DECLARED" in c1:
        return "DECLARED_VALUE"
    if "TRANSPORT" in c1 or "TRANSPORT" in c3:
        return "BASE_FREIGHT"
    return None


def category_from_charge_description(desc: str) -> str:
    d = normalize_mapping_text(desc)
    if re.search(r"TRANSPORTATION|BASE CHARGE", d):
        return "BASE_FREIGHT"
    if "FUEL" in d:
        return "FUEL"
    if "RESIDENTIAL" in d:
        return "RESIDENTIAL"
    if re.search(r"DELIVERY AREA|DAS", d):
        return "DELIVERY_AREA"
    if re.search(r"PEAK|DEMAND", d):
        return "PEAK"
    if re.search(r"ADDITIONAL HANDLING|ADD HANDLING", d):
        return "ADD_HANDLING"
    if "ADDRESS CORRECTION" in d:
        return "ADDRESS_CORRECTION"
    if re.search(r"LARGE PACKAGE|OVERSIZE", d):
        return "LARGE_PACKAGE"
    if "DECLARED VALUE" in d:
        return "DECLARED_VALUE"
    return "OTHER"


def build_standardized_charge_lookup(
    rows: list[dict[str, Any]] | None,
) -> dict[str, str | None]:
    from .primitives import canonical_premium_carrier

    out: dict[str, str | None] = {}
    for m in rows or []:
        desc_norm = normalize_mapping_text(m.get("charge_description"))
        if not desc_norm:
            continue
        raw_carrier = normalize_mapping_text(m.get("carrier") or "")
        carrier = canonical_premium_carrier("UPS" if raw_carrier == "" else raw_carrier)
        std = str(m.get("standardized_charge") or "").strip() or None
        out[f"{carrier}\t{desc_norm}"] = std
        if carrier == "UPS":
            out[desc_norm] = std
    return out


def lookup_standardized_charge(
    std_lookup: dict[str, str | None],
    carrier: str,
    charge_description: str,
) -> str | None:
    from .primitives import canonical_premium_carrier

    desc_norm = normalize_mapping_text(charge_description)
    if not desc_norm:
        return None
    raw = normalize_mapping_text(carrier)
    c = (
        "UPS"
        if raw in {"", "UPS"}
        else "FEDEX"
        if "FED" in raw
        else "WWE"
        if "WORLD" in raw or raw == "WWE"
        else raw
    )
    return (
        std_lookup.get(f"{c}\t{desc_norm}")
        or (std_lookup.get(f"UPS\t{desc_norm}") if c != "UPS" else None)
        or std_lookup.get(desc_norm)
    )


def resolve_agents_category(
    rec: dict[str, Any],
    mapping_lookup: dict[str, dict[str, str]],
    std_lookup: dict[str, str | None],
    mapping_rows: list[dict[str, Any]] | None = None,
) -> str:
    charge_description = str(rec.get("Charge Description") or "").strip()
    carrier = str(rec.get("Carrier Name") or "")
    taxonomy = lookup_charge_taxonomy(mapping_lookup, carrier, charge_description)

    std = lookup_standardized_charge(std_lookup, carrier, charge_description)
    if not std and mapping_rows:
        for m in mapping_rows:
            if normalize_mapping_text(m.get("charge_description")) == normalize_mapping_text(
                charge_description
            ):
                std = str(m.get("standardized_charge") or "").strip() or None
                break

    if std:
        from_std = category_from_standardized_charge(std)
        if from_std:
            return from_std

    if taxonomy:
        from_tax = category_from_taxonomy(
            taxonomy.get("category_1", ""), taxonomy.get("category_3", "")
        )
        if from_tax:
            return from_tax

    if not taxonomy and not std:
        return category_from_charge_description(charge_description)

    return "OTHER"


def rollup_by_agents_category(
    records: list[dict[str, Any]],
    mapping_lookup: dict[str, dict[str, str]],
    mapping_rows: list[dict[str, Any]] | None,
) -> dict[str, Any]:
    std_lookup = build_standardized_charge_lookup(mapping_rows)
    totals = {cat: {"totalCost": 0.0, "lineCount": 0} for cat in AGENTS_CHARGE_CATEGORIES}
    grand_total = 0.0

    for rec in records:
        net = to_number(rec.get("Net Amount"))
        grand_total += net
        cat = resolve_agents_category(rec, mapping_lookup, std_lookup, mapping_rows)
        totals[cat]["totalCost"] += net
        totals[cat]["lineCount"] += 1

    categories = [
        {
            "category": cat,
            "totalCost": totals[cat]["totalCost"],
            "pctOfTotal": totals[cat]["totalCost"] / grand_total if grand_total > 0 else 0.0,
            "lineCount": totals[cat]["lineCount"],
        }
        for cat in AGENTS_CHARGE_CATEGORIES
        if totals[cat]["totalCost"] > 0 or totals[cat]["lineCount"] > 0
    ]

    return {"categories": categories, "totalCost": grand_total}
