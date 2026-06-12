#!/usr/bin/env python3
"""Parity test — mirrors lib/premium-analysis/analysis-summary.test.ts golden synthetic proof."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from premium_analysis_mirror.engine import compute_invoice_analysis_summary
from premium_analysis_mirror.mapping import build_charge_description_lookup


def _row(**kwargs: str) -> dict[str, str | None]:
    from premium_analysis_mirror.constants import UPS_HEADERS

    base = {h: None for h in UPS_HEADERS}
    base.update(kwargs)
    return base


def run_golden_test() -> None:
    mapping_rows = [
        {
            "charge_description": "Fuel Surcharge",
            "transportation_mode": "Other",
            "category_1": "Fuel Surcharge",
            "category_2": "Fuel Surcharge",
            "category_3": "Fuel Surcharge",
            "category_4": "",
            "category_5": "",
            "carrier": "UPS",
        },
        {
            "charge_description": "Ground",
            "transportation_mode": "Parcel",
            "category_1": "Parcel",
            "category_2": "Base Freight",
            "category_3": "",
            "category_4": "",
            "category_5": "",
            "carrier": "UPS",
        },
    ]
    lookup = build_charge_description_lookup(mapping_rows)

    line1 = _row(
        **{
            "Carrier Name": "UPS",
            "Invoice Date": "2025-03-10",
            "Account Number": "ACC1",
            "Invoice Number": "INV1",
            "Tracking Number": "TRK1",
            "Package Quantity": "2",
            "Billed Weight": "3",
            "Entered Weight": "2",
            "Zone": "51",
            "Net Amount": "100.00",
            "Invoice Amount": "100.00",
            "Duty Amount": "0",
            "Original Service Description": "Ground",
            "Charge Category Code": "IMP",
            "Charge Classification Code": "SHP",
            "Charge Description": "Ground",
        }
    )
    line2 = _row(
        **{
            "Carrier Name": "UPS",
            "Invoice Date": "2025-03-10",
            "Account Number": "ACC1",
            "Invoice Number": "INV1",
            "Tracking Number": "TRK1",
            "Package Quantity": "2",
            "Billed Weight": "3",
            "Entered Weight": "2",
            "Zone": "51",
            "Net Amount": "10.50",
            "Invoice Amount": "0",
            "Duty Amount": "0",
            "Charge Category Code": "IMP",
            "Charge Classification Code": "SHP",
            "Charge Description": "Fuel Surcharge",
        }
    )
    line3 = _row(
        **{
            "Carrier Name": "UPS",
            "Invoice Date": "2025-03-11",
            "Account Number": "ACC1",
            "Invoice Number": "INV1",
            "Tracking Number": "TRK2",
            "Package Quantity": "1",
            "Billed Weight": "1",
            "Entered Weight": "1",
            "Zone": "51",
            "Net Amount": "5.00",
            "Invoice Amount": "0",
            "Duty Amount": "0",
            "Charge Category Code": "RES",
            "Charge Classification Code": "ACC",
            "Charge Description": "Residential",
        }
    )

    summary = compute_invoice_analysis_summary([line1, line2, line3], lookup)
    m = summary["measures"]

    assert summary["totalRows"] == 3
    assert abs(summary["totals"]["netAmount"] - 115.5) < 1e-6
    assert abs(m["totalCost"] - 115.5) < 1e-6
    assert abs(m["fuelCost"] - 10.5) < 1e-6
    assert abs(m["costAccessorials"] - 5.0) < 1e-6
    assert abs(m["costSurcharges"] - 10.5) < 1e-6
    assert m["totalPackages"] == 3
    assert m["packageDedupeShipmentCount"] == 2
    assert abs(m["weightGap"] - 2.0) < 1e-6

    march = next((x for x in summary["monthlySpend"] if "March" in x["month"] and "2025" in x["month"]), None)
    assert march and abs(march["totalCost"] - 115.5) < 1e-6
    assert [d["date"] for d in summary["dailySpend"]] == ["2025-03-10", "2025-03-11"]

    inv = summary["spendByInvoice"][0]
    assert inv["accountNumber"] == "ACC1"
    assert inv["invoiceNumber"] == "INV1"
    assert inv["invoiceDate"] == "2025-03-10"
    assert abs(inv["totalCost"] - 115.5) < 1e-6

    print("OK — golden synthetic parity with TypeScript engine")


if __name__ == "__main__":
    run_golden_test()
