"""Carrier mix — mirrors lib/premium-analysis/carrier-mix.ts."""

from __future__ import annotations

from typing import Any


def build_carrier_mix(facts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_key: dict[str, dict[str, Any]] = {}

    for fact in facts:
        key = f"{fact['carrier']}\t{fact['service']}\t{fact['zoneMode']}"
        agg = by_key.get(key)
        if not agg:
            agg = {
                "carrier": fact["carrier"],
                "service": fact["service"],
                "zoneMode": fact["zoneMode"],
                "zone": fact.get("zone"),
                "shipmentCount": 0,
                "totalCost": 0.0,
            }
            by_key[key] = agg
        agg["shipmentCount"] += 1
        agg["totalCost"] += fact["shipmentNet"]
        if agg["zone"] is None and fact.get("zone") is not None:
            agg["zone"] = fact["zone"]

    rows = [
        {
            **a,
            "avgCostPerShipment": a["totalCost"] / a["shipmentCount"] if a["shipmentCount"] > 0 else 0.0,
        }
        for a in by_key.values()
    ]
    return sorted(rows, key=lambda x: -x["totalCost"])
