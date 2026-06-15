"""Transit tables — mirrors lib/premium-analysis/transit-table.ts."""

from __future__ import annotations

import re


def fedex_ground_transit_days(zone: float) -> int | None:
    if zone <= 0 or zone >= 100:
        return None
    if zone <= 2:
        return 1
    if zone <= 4:
        return 2
    if zone <= 6:
        return 3
    if zone <= 8:
        return 4
    return 5


def ups_ground_transit_days(zone: float) -> int | None:
    if zone <= 0 or zone >= 100:
        return None
    if zone <= 2:
        return 1
    if zone <= 4:
        return 2
    if zone <= 6:
        return 3
    if zone <= 8:
        return 4
    return 5


def ground_transit_days_for_zone(zone: float, carrier: str | None = None) -> int | None:
    if carrier and re.search(r"fedex", carrier, re.I):
        return fedex_ground_transit_days(zone)
    return ups_ground_transit_days(zone)


def is_expedited_service(service: str) -> bool:
    return bool(
        re.search(r"next.?day|nda|2\s*day|3\s*day|express|priority|air|overnight", service, re.I)
    )


def is_avoidable_expedited(zone: float, service: str, carrier: str | None = None) -> bool:
    if not is_expedited_service(service):
        return False
    ground_days = ground_transit_days_for_zone(zone, carrier)
    return ground_days is not None and ground_days <= 3
