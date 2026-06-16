"""Anomaly detection — mirrors lib/premium-analysis/anomaly-detection.ts."""

from __future__ import annotations

import re
from typing import Any

from .expedited_marginal import marginal_avoidable_premium
from .fuel_rerate import rerate_fuel_row
from .shipment_fact import build_shipment_facts
from .spec_categories import resolve_agents_category, rollup_by_agents_category, build_standardized_charge_lookup
from .transit_table import is_avoidable_expedited
from .trend_flags import detect_monthly_spend_spikes
from .primitives import to_number


def _tracking_from_record(rec: dict[str, Any]) -> str | None:
    for field in ("Tracking Number", "Shipment Reference Number 1", "Lead Shipment Number"):
        t = str(rec.get(field) or "").strip()
        if t:
            return t
    return None


def build_dataset_flags(
    summary: dict[str, Any],
    records: list[dict[str, Any]],
    mapping_lookup: dict[str, dict[str, str]],
    mapping_rows: list[dict[str, Any]] | None,
) -> dict[str, Any]:
    spec = rollup_by_agents_category(records, mapping_lookup, mapping_rows)
    base_freight = next(
        (c["totalCost"] for c in spec["categories"] if c["category"] == "BASE_FREIGHT"),
        0.0,
    )
    accessorial_rate = (
        summary["measures"]["costAccessorials"] / base_freight if base_freight > 0 else 0.0
    )
    wwe_present = any(re.search(r"wwe|world", str(r.get("Carrier Name") or ""), re.I) for r in records)

    return {
        "weightGapExceeds500Lbs": summary["measures"]["weightGap"] > 500,
        "accessorialRateHigh": accessorial_rate > 0.1,
        "accessorialRate": accessorial_rate,
        "monthlySpikeMonths": detect_monthly_spend_spikes(summary.get("monthlySpend") or []),
        "wweFuelEmbedded": wwe_present,
        "wwePresent": wwe_present,
    }


def detect_anomalies(
    records: list[dict[str, Any]],
    summary: dict[str, Any],
    mapping_lookup: dict[str, dict[str, str]],
    mapping_rows: list[dict[str, Any]] | None,
    shipment_facts: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    flags: list[dict[str, Any]] = []
    dataset_flags = build_dataset_flags(summary, records, mapping_lookup, mapping_rows)
    std_lookup = build_standardized_charge_lookup(mapping_rows)

    if dataset_flags["accessorialRateHigh"]:
        flags.append(
            {
                "type": "accessorial_rate_high",
                "trackingNumber": None,
                "invoiceNumber": None,
                "amount": summary["measures"]["costAccessorials"],
                "description": (
                    f"Accessorial rate {dataset_flags['accessorialRate'] * 100:.1f}% exceeds 10% benchmark"
                ),
                "severity": "high",
            }
        )

    if dataset_flags["weightGapExceeds500Lbs"]:
        flags.append(
            {
                "type": "weight_gap_high",
                "trackingNumber": None,
                "invoiceNumber": None,
                "amount": 0.0,
                "description": (
                    f"Total billed weight exceeds declared weight by "
                    f"{summary['measures']['weightGap']:.0f} lbs — review DIM packaging"
                ),
                "severity": "medium",
            }
        )

    for month in dataset_flags["monthlySpikeMonths"]:
        row = next((m for m in summary.get("monthlySpend") or [] if m["month"] == month), None)
        flags.append(
            {
                "type": "monthly_spend_spike",
                "trackingNumber": None,
                "invoiceNumber": None,
                "amount": row["totalCost"] if row else 0.0,
                "description": f"{month} spend is more than 20% above the prior 3-month rolling average",
                "severity": "medium",
            }
        )

    for rec in records:
        cat = resolve_agents_category(rec, mapping_lookup, std_lookup, mapping_rows)
        net = to_number(rec.get("Net Amount"))
        tracking = _tracking_from_record(rec)
        invoice_number = str(rec.get("Invoice Number") or "").strip() or None

        if cat == "ADDRESS_CORRECTION" and net > 0:
            flags.append(
                {
                    "type": "address_correction",
                    "trackingNumber": tracking,
                    "invoiceNumber": invoice_number,
                    "amount": net,
                    "description": "Address correction charge — enable validation at checkout",
                    "severity": "medium",
                }
            )
        if cat == "ADD_HANDLING" and net > 0:
            flags.append(
                {
                    "type": "additional_handling",
                    "trackingNumber": tracking,
                    "invoiceNumber": invoice_number,
                    "amount": net,
                    "description": "Additional handling charge — review packaging dimensions/weight",
                    "severity": "medium",
                }
            )
        if cat == "LARGE_PACKAGE" and net > 100:
            flags.append(
                {
                    "type": "large_package",
                    "trackingNumber": tracking,
                    "invoiceNumber": invoice_number,
                    "amount": net,
                    "description": "Large package surcharge exceeds $100 on one shipment",
                    "severity": "high",
                }
            )
        if cat == "DECLARED_VALUE" and net > 0:
            flags.append(
                {
                    "type": "declared_value",
                    "trackingNumber": tracking,
                    "invoiceNumber": invoice_number,
                    "amount": net,
                    "description": "Declared value charge — verify liability coverage need",
                    "severity": "low",
                }
            )

    facts = shipment_facts or build_shipment_facts(records, mapping_lookup, mapping_rows)

    for fact in facts:
        zone = fact.get("zone")
        if zone is None or not fact.get("service"):
            continue
        if not is_avoidable_expedited(zone, fact["service"], fact["carrier"]):
            continue
        if fact["baseFreightNet"] <= 0:
            continue

        marginal = marginal_avoidable_premium(
            carrier=fact["carrier"],
            service=fact["service"],
            zone=zone,
            weight_lbs=max(fact["billedWeight"], fact["enteredWeight"], 1.0),
            base_freight_net=fact["baseFreightNet"],
        )
        if marginal is None:
            marginal = fact["baseFreightNet"]

        amount = max(0.0, min(marginal, fact["shipmentNet"]))
        if amount <= 0:
            continue

        flags.append(
            {
                "type": "avoidable_expedited",
                "trackingNumber": fact.get("tracking"),
                "invoiceNumber": fact.get("invoiceNumber"),
                "amount": amount,
                "description": (
                    f"Expedited service ({fact['service']}) in zone {zone} where Ground transit is ≤3 days"
                ),
                "severity": "medium",
            }
        )

    for fact in facts:
        if fact["baseFreightNet"] <= 0 or not fact.get("shipDate") or fact["fuelNet"] <= 0:
            continue
        rerate = rerate_fuel_row(
            {
                "tracking_number": fact.get("tracking") or "",
                "ship_date": fact["shipDate"],
                "service": fact["service"],
                "transport_charge": fact["baseFreightNet"],
                "billed_fuel_surcharge": fact["fuelNet"],
            }
        )
        if rerate["flag"] == "overbilled" and rerate.get("variance") and rerate["variance"] > 0:
            rate_pp = 0.0
            if rerate.get("rate_used") and fact["baseFreightNet"] > 0:
                rate_pp = (fact["fuelNet"] / fact["baseFreightNet"] - rerate["rate_used"]) * 100
            if rate_pp > 0.5:
                flags.append(
                    {
                        "type": "fuel_over_eia",
                        "trackingNumber": fact.get("tracking"),
                        "invoiceNumber": fact.get("invoiceNumber"),
                        "amount": rerate["variance"],
                        "description": f"Fuel surcharge over published EIA rate by {rate_pp:.2f}pp",
                        "severity": "high",
                    }
                )

    return sorted(flags, key=lambda f: -f["amount"])
