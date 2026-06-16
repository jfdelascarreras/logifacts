"""Trend flags — mirrors lib/premium-analysis/trend-flags.ts."""

from __future__ import annotations

from typing import Any

from .primitives import year_month_key_from_engine_month_label


def detect_monthly_spend_spikes(monthly_spend: list[dict[str, Any]]) -> list[str]:
    if len(monthly_spend) < 4:
        return []

    sorted_rows = sorted(
        [
            {
                "month": m["month"],
                "sortKey": year_month_key_from_engine_month_label(m["month"]) or m["month"],
                "totalCost": float(m.get("totalCost") or 0),
            }
            for m in monthly_spend
        ],
        key=lambda x: x["sortKey"],
    )

    spikes: list[str] = []
    for i in range(2, len(sorted_rows)):
        window = sorted_rows[i - 3 : i]
        avg = sum(x["totalCost"] for x in window) / 3
        if avg <= 0:
            continue
        current = sorted_rows[i]
        if current["totalCost"] > avg * 1.2:
            spikes.append(current["month"])
    return spikes
