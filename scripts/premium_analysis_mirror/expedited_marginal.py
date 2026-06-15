"""Marginal expedited premium — mirrors lib/premium-analysis/expedited-marginal.ts."""

from __future__ import annotations

import json
import math
import re
from functools import lru_cache
from typing import Any

from .constants import FEDEX_RATES_JSON

EXPRESS_SERVICES = frozenset({
    "express_saver",
    "2day",
    "standard_overnight",
    "priority_overnight",
})


def fedex_service_from_description(service: str) -> str | None:
    s = service.lower()
    if re.search(r"priority\s*overnight", s):
        return "priority_overnight"
    if re.search(r"standard\s*overnight", s):
        return "standard_overnight"
    if re.search(r"2\s*day|2day", s):
        return "2day"
    if re.search(r"express\s*saver", s):
        return "express_saver"
    if re.search(r"home\s*delivery", s):
        return "home_delivery"
    if "ground" in s:
        return "ground"
    return None


def is_express_service(service: str) -> bool:
    return service in EXPRESS_SERVICES


def fedex_base_zone(zone: float) -> int:
    z = int(zone)
    if 2 <= z <= 8:
        return z
    return 8


@lru_cache(maxsize=1)
def _load_fedex_rates() -> dict[str, Any]:
    with FEDEX_RATES_JSON.open(encoding="utf-8") as f:
        return json.load(f)


def get_published_rate(service: str, billable_weight_lbs: int, zone: int) -> float | None:
    rates = _load_fedex_rates().get(service)
    if not rates:
        return None
    return rates.get(str(billable_weight_lbs), {}).get(str(zone))


def marginal_avoidable_premium(
    *,
    carrier: str,
    service: str,
    zone: float,
    weight_lbs: float,
    base_freight_net: float,
    residential: bool = False,
) -> float | None:
    if not re.search(r"fedex", carrier, re.I):
        return None
    if base_freight_net <= 0 or zone <= 0:
        return None

    expedited = fedex_service_from_description(service)
    if not expedited or not is_express_service(expedited):
        return None

    bz = fedex_base_zone(zone)
    weight = max(1, math.ceil(weight_lbs))
    ground_svc = "home_delivery" if residential else "ground"

    ground_published = get_published_rate(ground_svc, weight, bz)
    expedited_published = get_published_rate(expedited, weight, bz)
    if ground_published is None or expedited_published is None:
        return None

    marginal_list = max(0.0, expedited_published - ground_published)
    if marginal_list <= 0:
        return 0.0

    scale = base_freight_net / expedited_published if expedited_published > 0 else 1.0
    return min(base_freight_net, marginal_list * scale)
