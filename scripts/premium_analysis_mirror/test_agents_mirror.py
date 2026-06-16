#!/usr/bin/env python3
"""Mirror tests — FedEx v2 parser fields + agents layer smoke."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from premium_analysis_mirror.constants import FEDEX_PARSE_VERSION
from premium_analysis_mirror.ingest_quality import evaluate_ingest_quality
from premium_analysis_mirror.savings_estimator import cap_flag_amounts_by_spend
from premium_analysis_mirror.shipment_fact import build_shipment_facts, shipment_weight_gap_lbs
from premium_analysis_mirror.stale_ingest import detect_stale_ingest


def test_fedex_v2_fields():
    try:
        import pandas  # noqa: F401
    except ImportError:
        print("[SKIP] FedEx parser test — pandas not installed")
        return

    from premium_analysis_mirror.parsers import parse_fedex_file

    fixture = (
        Path(__file__).resolve().parents[2]
        / "Invoices skills"
        / "FedEx Invoice Example"
        / "FedEx_invoice_8-694-83570.XLS"
    )
    if not fixture.exists():
        print(f"[SKIP] FedEx fixture missing: {fixture}")
        return

    df = parse_fedex_file(fixture)
    assert not df.empty, "FedEx parse returned no rows"
    row = df.iloc[0].to_dict()
    assert row.get("_parse_version") == FEDEX_PARSE_VERSION
    assert row.get("Tracking Number") or row.get("Shipment Reference Number 1")
    print("[OK] FedEx v2 parser — tracking + parse version")


def test_shipment_weight_gap():
    records = [
        {
            "Invoice Number": "INV1",
            "Tracking Number": "T1",
            "Carrier Name": "FedEx",
            "Charge Description": "Ground",
            "Net Amount": "50",
            "Billed Weight": "10",
            "Entered Weight": "8",
            "Package Quantity": "1",
            "Zone": "5",
        },
        {
            "Invoice Number": "INV1",
            "Tracking Number": "T1",
            "Carrier Name": "FedEx",
            "Charge Description": "Fuel Surcharge",
            "Net Amount": "5",
            "Billed Weight": "10",
            "Entered Weight": "8",
            "Package Quantity": "1",
            "Zone": "5",
        },
    ]
    facts = build_shipment_facts(records, {}, None)
    gap = shipment_weight_gap_lbs(facts)
    assert gap == 2.0, f"expected gap 2, got {gap}"
    print("[OK] shipment weight gap — no double-count")


def test_savings_cap():
    flags = [
        {"type": "avoidable_expedited", "amount": 600},
        {"type": "address_correction", "amount": 600},
    ]
    capped = cap_flag_amounts_by_spend(flags, 500)
    assert sum(capped.values()) <= 500.01
    print("[OK] savings cap — flag totals ≤ spend")


def test_ingest_quality_gate():
    gate = evaluate_ingest_quality({"unmappedSpend": 20_000}, 100_000)
    assert gate["blockSavings"] is True
    print("[OK] ingest quality gate — blocks savings when unmapped > 15%")


def test_stale_ingest():
    alert = detect_stale_ingest([], ["FedEx"])
    assert alert["needsReupload"] is True
    alert_ok = detect_stale_ingest([FEDEX_PARSE_VERSION], ["FedEx"])
    assert alert_ok["needsReupload"] is False
    print("[OK] stale ingest detection")


def main() -> int:
    test_fedex_v2_fields()
    test_shipment_weight_gap()
    test_savings_cap()
    test_ingest_quality_gate()
    test_stale_ingest()
    print("\nAll mirror smoke tests passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
