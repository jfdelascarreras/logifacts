"""Shipment-grain facts — mirrors lib/premium-analysis/shipment-fact.ts."""

from __future__ import annotations

from typing import Any

from .mapping import lookup_charge_taxonomy
from .primitives import mode_from_zone, parse_invoice_date_key, primary_rollup_date_raw, shipment_package_dedupe_key, to_number
from .spec_categories import resolve_agents_category, build_standardized_charge_lookup

ACCESSORIAL_CATEGORIES = frozenset({
    "RESIDENTIAL",
    "DELIVERY_AREA",
    "PEAK",
    "ADD_HANDLING",
    "ADDRESS_CORRECTION",
    "LARGE_PACKAGE",
    "DECLARED_VALUE",
})


def _tracking_from_record(rec: dict[str, Any]) -> str | None:
    for field in ("Tracking Number", "Shipment Reference Number 1", "Lead Shipment Number"):
        t = str(rec.get(field) or "").strip()
        if t:
            return t
    return None


def _service_from_record(rec: dict[str, Any]) -> str:
    return (
        str(rec.get("Original Service Description") or "").strip()
        or str(rec.get("Charge Category Code") or "").strip()
        or "Unknown"
    )


def build_shipment_facts(
    records: list[dict[str, Any]],
    mapping_lookup: dict[str, dict[str, str]],
    mapping_rows: list[dict[str, Any]] | None,
) -> list[dict[str, Any]]:
    std_lookup = build_standardized_charge_lookup(mapping_rows)
    by_key: dict[str, dict[str, Any]] = {}

    for rec in records:
        ship_key = shipment_package_dedupe_key(rec)
        if not ship_key:
            continue

        cat = resolve_agents_category(rec, mapping_lookup, std_lookup, mapping_rows)
        net = to_number(rec.get("Net Amount"))
        zone = to_number(rec.get("Zone"))
        billed = to_number(rec.get("Billed Weight"))
        entered = to_number(rec.get("Entered Weight"))
        pq = to_number(rec.get("Package Quantity"))

        fact = by_key.get(ship_key)
        if not fact:
            fact = {
                "shipmentKey": ship_key,
                "invoiceNumber": None,
                "tracking": None,
                "carrier": "Unknown",
                "service": "Unknown",
                "zone": None,
                "zoneMode": "Unknown",
                "shipDate": None,
                "packageQty": 0.0,
                "shipmentNet": 0.0,
                "baseFreightNet": 0.0,
                "fuelNet": 0.0,
                "accessorialNet": 0.0,
                "billedWeight": 0.0,
                "enteredWeight": 0.0,
                "addressCorrectionNet": 0.0,
                "addHandlingNet": 0.0,
                "largePackageLineMax": 0.0,
                "declaredValueNet": 0.0,
                "lineCount": 0,
            }
            by_key[ship_key] = fact

        fact["lineCount"] += 1
        fact["shipmentNet"] += net
        if cat == "BASE_FREIGHT":
            fact["baseFreightNet"] += net
        if cat == "FUEL":
            fact["fuelNet"] += net
        if cat in ACCESSORIAL_CATEGORIES:
            fact["accessorialNet"] += net
        if cat == "ADDRESS_CORRECTION" and net > 0:
            fact["addressCorrectionNet"] += net
        if cat == "ADD_HANDLING" and net > 0:
            fact["addHandlingNet"] += net
        if cat == "LARGE_PACKAGE" and net > 0:
            fact["largePackageLineMax"] = max(fact["largePackageLineMax"], net)
        if cat == "DECLARED_VALUE" and net > 0:
            fact["declaredValueNet"] += net

        if zone > 0 and fact["zone"] is None:
            fact["zone"] = zone
        if billed > fact["billedWeight"]:
            fact["billedWeight"] = billed
        if entered > fact["enteredWeight"]:
            fact["enteredWeight"] = entered
        if pq > fact["packageQty"]:
            fact["packageQty"] = pq

        carrier = str(rec.get("Carrier Name") or "").strip() or "Unknown"
        service = _service_from_record(rec)
        tracking = _tracking_from_record(rec)
        invoice_number = str(rec.get("Invoice Number") or "").strip() or None
        ship_date = parse_invoice_date_key(primary_rollup_date_raw(rec))

        if fact["carrier"] in {"", "Unknown"}:
            fact["carrier"] = carrier
        if fact["service"] in {"", "Unknown"}:
            fact["service"] = service
        if not fact["tracking"] and tracking:
            fact["tracking"] = tracking
        if not fact["invoiceNumber"] and invoice_number:
            fact["invoiceNumber"] = invoice_number
        if not fact["shipDate"] and ship_date:
            fact["shipDate"] = ship_date

    for fact in by_key.values():
        fact["zoneMode"] = mode_from_zone(fact["zone"] if fact["zone"] is not None else -1)
        if fact["packageQty"] <= 0:
            fact["packageQty"] = 1.0

    return list(by_key.values())


def shipment_weight_gap_lbs(facts: list[dict[str, Any]]) -> float:
    return sum(max(0.0, f["billedWeight"] - f["enteredWeight"]) for f in facts)
