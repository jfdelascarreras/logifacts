"""Fuel rerate — mirrors lib/pricing/fuel-rerate.ts."""

from __future__ import annotations

import json
import re
from functools import lru_cache
from typing import Any

from .constants import UPS_FUEL_HISTORY_JSON


@lru_cache(maxsize=1)
def load_fuel_surcharge_history() -> list[dict[str, Any]]:
    with UPS_FUEL_HISTORY_JSON.open(encoding="utf-8") as f:
        return json.load(f)


def find_fuel_rate_for_date(history: list[dict[str, Any]], date: str) -> dict[str, float] | None:
    for entry in history:
        if entry.get("effectiveDate", "") <= date:
            return {
                "ground": float(entry.get("domesticGround", 0)),
                "air": float(entry.get("domesticAir", 0)),
            }
    return None


def is_air_fuel_service(service: str) -> bool:
    return bool(re.search(r"air|2\s*day|3\s*day|next.?day|nda|express|priority", service, re.I))


def rerate_fuel_row(row: dict[str, Any], history: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    hist = history if history is not None else load_fuel_surcharge_history()
    rates = find_fuel_rate_for_date(hist, str(row.get("ship_date") or ""))
    if not rates:
        return {**row, "rate_used": None, "expected_fuel": None, "variance": None, "flag": "no_rate"}

    rate = rates["air"] if is_air_fuel_service(str(row.get("service") or "")) else rates["ground"]
    transport = float(row.get("transport_charge") or 0)
    billed = float(row.get("billed_fuel_surcharge") or 0)
    expected = round(transport * rate, 2)
    variance = round(billed - expected, 2)

    if variance > 1.0:
        flag = "overbilled"
    elif variance < -1.0:
        flag = "underbilled"
    else:
        flag = "correct"

    return {
        **row,
        "rate_used": rate,
        "expected_fuel": expected,
        "variance": variance,
        "flag": flag,
    }
