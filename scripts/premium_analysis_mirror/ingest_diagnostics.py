"""Ingest diagnostics — mirrors lib/premium-analysis/ingest-diagnostics.ts."""

from __future__ import annotations

from typing import Any

from .mapping import lookup_charge_taxonomy
from .primitives import primary_rollup_date_raw, shipment_package_dedupe_key, to_number


def empty_ingest_diagnostics() -> dict[str, Any]:
    return {
        "duplicateUploadRowsSkipped": 0,
        "duplicateChargeRowsDropped": 0,
        "rowsDroppedCriticalSciCorruption": 0,
        "linesTotal": 0,
        "linesMapped": 0,
        "unmappedSpend": 0.0,
        "shipmentsTotal": 0,
        "shipmentsWithoutTracking": 0,
        "linesMissingShipDate": 0,
        "parseVersions": [],
    }


def _line_is_mapped(rec: dict[str, Any], mapping_lookup: dict[str, dict[str, str]]) -> bool:
    taxonomy = lookup_charge_taxonomy(
        mapping_lookup, rec.get("Carrier Name"), rec.get("Charge Description")
    )
    if not taxonomy:
        return False
    return bool(taxonomy.get("category_1") or taxonomy.get("category_3"))


def _ship_date_present(rec: dict[str, Any]) -> bool:
    raw = primary_rollup_date_raw(rec)
    if not raw or not raw.strip():
        return False
    return not raw.lower().startswith("invoice")


def parse_versions_from_records(records: list[dict[str, Any]]) -> list[str]:
    versions = sorted({str(r.get("_parse_version") or "").strip() for r in records if r.get("_parse_version")})
    return [v for v in versions if v]


def build_ingest_diagnostics(
    records: list[dict[str, Any]],
    base: dict[str, Any],
    mapping_lookup: dict[str, dict[str, str]],
    parse_versions: list[str] | None = None,
) -> dict[str, Any]:
    lines_mapped = 0
    unmapped_spend = 0.0
    lines_missing_ship_date = 0
    shipment_keys: set[str] = set()
    shipments_without_tracking: set[str] = set()

    for rec in records:
        net = to_number(rec.get("Net Amount"))
        if _line_is_mapped(rec, mapping_lookup):
            lines_mapped += 1
        elif net != 0:
            unmapped_spend += net

        if not _ship_date_present(rec):
            lines_missing_ship_date += 1

        ship_key = shipment_package_dedupe_key(rec)
        if not ship_key:
            continue
        shipment_keys.add(ship_key)
        tracking = str(rec.get("Tracking Number") or rec.get("Shipment Reference Number 1") or "").strip()
        if not tracking:
            shipments_without_tracking.add(ship_key)

    versions = parse_versions or parse_versions_from_records(records)

    return {
        **base,
        "linesTotal": len(records),
        "linesMapped": lines_mapped,
        "unmappedSpend": round(unmapped_spend, 2),
        "shipmentsTotal": len(shipment_keys),
        "shipmentsWithoutTracking": len(shipments_without_tracking),
        "linesMissingShipDate": lines_missing_ship_date,
        "parseVersions": versions,
    }
