"""AGENTS outputs layer — mirrors lib/premium-analysis/agents-outputs.ts."""

from __future__ import annotations

from typing import Any

from .action_prioritization import prioritize_actions
from .anomaly_detection import build_dataset_flags, detect_anomalies
from .carrier_mix import build_carrier_mix
from .ingest_quality import apply_ingest_quality_gate, evaluate_ingest_quality
from .savings_estimator import estimate_savings
from .shipment_fact import build_shipment_facts, shipment_weight_gap_lbs
from .spec_categories import rollup_by_agents_category
from .primitives import shipment_package_dedupe_key


def _count_shipments_by_dimension(
    records: list[dict[str, Any]], dim: str
) -> dict[str, int]:
    sets: dict[str, set[str]] = {}
    for rec in records:
        if dim == "carrier":
            key = str(rec.get("Carrier Name") or "").strip() or "Unknown"
        else:
            key = (
                str(rec.get("Original Service Description") or "").strip()
                or str(rec.get("Charge Category Code") or "").strip()
                or "Unknown"
            )
        ship_key = shipment_package_dedupe_key(rec)
        if not ship_key:
            continue
        bucket = sets.setdefault(key, set())
        bucket.add(ship_key)
    return {k: len(v) for k, v in sets.items()}


def enrich_summary_with_agents_outputs(
    summary: dict[str, Any],
    records: list[dict[str, Any]],
    mapping_rows: list[dict[str, Any]] | None,
    mapping_lookup: dict[str, dict[str, str]],
    ingest_diagnostics: dict[str, Any] | None = None,
) -> dict[str, Any]:
    shipment_facts = build_shipment_facts(records, mapping_lookup, mapping_rows)
    spec_categories = rollup_by_agents_category(records, mapping_lookup, mapping_rows)
    base_freight = next(
        (c["totalCost"] for c in spec_categories["categories"] if c["category"] == "BASE_FREIGHT"),
        0.0,
    )

    measures = {
        **summary["measures"],
        "baseFreightCost": base_freight,
        "accessorialRate": (
            summary["measures"]["costAccessorials"] / base_freight if base_freight > 0 else 0.0
        ),
        "weightGap": shipment_weight_gap_lbs(shipment_facts),
    }

    ship_by_carrier = _count_shipments_by_dimension(records, "carrier")
    ship_by_service = _count_shipments_by_dimension(records, "service")

    by_carrier = {
        k: {**v, "shipmentCount": ship_by_carrier.get(k, 0)}
        for k, v in summary.get("byCarrier", {}).items()
    }
    by_service = {
        k: {**v, "shipmentCount": ship_by_service.get(k, 0)}
        for k, v in summary.get("byService", {}).items()
    }

    enriched_base = {**summary, "measures": measures, "byCarrier": by_carrier, "byService": by_service}

    dataset_flags = build_dataset_flags(enriched_base, records, mapping_lookup, mapping_rows)
    anomaly_flags = detect_anomalies(
        records, enriched_base, mapping_lookup, mapping_rows, shipment_facts
    )

    savings_estimate = estimate_savings(
        anomaly_flags,
        summary.get("monthlySpend") or [],
        summary["measures"]["totalCost"],
    )
    action_items = prioritize_actions(savings_estimate)

    result = {
        **enriched_base,
        "specCategories": spec_categories,
        "carrierMix": build_carrier_mix(shipment_facts),
        "anomalyFlags": anomaly_flags,
        "savingsEstimate": savings_estimate,
        "actionItems": action_items,
        "datasetFlags": dataset_flags,
        "ingestSource": "offline_files",
    }

    if ingest_diagnostics is not None:
        gate = evaluate_ingest_quality(ingest_diagnostics, measures["totalCost"])
        result["ingestDiagnostics"] = ingest_diagnostics
        result["ingestQuality"] = gate
        result = apply_ingest_quality_gate(result, gate)

    return result
