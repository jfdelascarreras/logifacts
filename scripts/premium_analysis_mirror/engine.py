"""Core aggregation — mirrors computeInvoiceAnalysisSummary in analysis-summary.ts."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from .mapping import lookup_charge_taxonomy
from .primitives import (
    SURCHARGE_CATS,
    is_accessorial_cost_row,
    mode_from_zone,
    normalize_mapping_text,
    parse_invoice_date_key,
    primary_rollup_date_raw,
    shipment_package_dedupe_key,
    to_number,
    weight_bucket_from_lbs,
)


def _month_label_from_date_key(date_key: str) -> str:
    parts = date_key.split("-")
    year_text, month_text = parts[0], parts[1]
    month_date = datetime(int(year_text), int(month_text), 1, tzinfo=timezone.utc)
    month_name = month_date.strftime("%B")
    return f"{month_name} {year_text}"


def compute_invoice_analysis_summary(
    records: list[dict[str, Any]],
    mapping_lookup: dict[str, dict[str, str]],
) -> dict[str, Any]:
    summary: dict[str, Any] = {
        "totalRows": len(records),
        "byCarrier": {},
        "byService": {},
        "totals": {"netAmount": 0.0, "invoiceAmount": 0.0, "dutyAmount": 0.0},
        "measures": {
            "totalCost": 0.0,
            "totalPackages": 0.0,
            "packageDedupeShipmentCount": 0,
            "fuelCost": 0.0,
            "costSurcharges": 0.0,
            "costAccessorials": 0.0,
            "weightGap": 0.0,
        },
        "monthlySpend": [],
        "dailySpend": [],
        "dailySpendByAccount": [],
        "category2VolumeCpp": [],
        "modeVolumeCpp": [],
        "weightBucketVolume": [],
        "spendByInvoice": [],
    }

    sum_billed = 0.0
    sum_entered = 0.0
    invoice_spend: dict[str, dict[str, Any]] = {}
    daily_spend: dict[str, dict[str, float]] = {}
    daily_by_account: dict[str, dict[str, float]] = {}
    month_spend: dict[str, dict[str, float]] = {}
    category2_agg: dict[str, dict[str, float]] = {}
    mode_agg: dict[str, dict[str, float]] = {}
    weight_bucket_agg: dict[str, dict[str, Any]] = {}

    for rec in records:
        carrier = rec.get("Carrier Name") or "Unknown"
        service = (
            str(rec.get("Original Service Description") or "").strip()
            or str(rec.get("Charge Category Code") or "").strip()
            or "Unknown"
        )
        net_amount = to_number(rec.get("Net Amount"))
        invoice_amount = to_number(rec.get("Invoice Amount"))
        duty_amount = to_number(rec.get("Duty Amount"))
        billed_weight = to_number(rec.get("Billed Weight"))
        entered_weight = to_number(rec.get("Entered Weight"))
        volume_units = max(1.0, to_number(rec.get("Package Quantity")))
        zone = to_number(rec.get("Zone"))
        charge_category_code = str(rec.get("Charge Category Code") or "").strip().upper()
        charge_classification = str(rec.get("Charge Classification Code") or "").strip().upper()
        charge_description = str(rec.get("Charge Description") or "").strip()

        mapping = lookup_charge_taxonomy(mapping_lookup, rec.get("Carrier Name"), charge_description)
        category1 = normalize_mapping_text(mapping.get("category_1") if mapping else "")
        category2 = normalize_mapping_text(mapping.get("category_2") if mapping else "")
        category3 = normalize_mapping_text(mapping.get("category_3") if mapping else "")
        category2_label = category2 or "UNMAPPED"

        is_accessorial = is_accessorial_cost_row(
            charge_classification, charge_category_code, category1, category3
        )
        mode_label = mode_from_zone(zone)
        weight_bucket, weight_sort = weight_bucket_from_lbs(billed_weight)

        summary["totals"]["netAmount"] += net_amount
        summary["totals"]["invoiceAmount"] += invoice_amount
        summary["totals"]["dutyAmount"] += duty_amount
        summary["measures"]["totalCost"] += net_amount
        sum_billed += billed_weight
        sum_entered += entered_weight

        is_fuel = category3 == "FUEL SURCHARGE"
        if is_fuel:
            summary["measures"]["fuelCost"] += net_amount
        if category3 in SURCHARGE_CATS:
            summary["measures"]["costSurcharges"] += net_amount
        if is_accessorial:
            summary["measures"]["costAccessorials"] += net_amount

        cat = category2_agg.setdefault(category2_label, {"totalCost": 0.0, "totalVolume": 0.0})
        cat["totalCost"] += net_amount
        cat["totalVolume"] += volume_units

        mode = mode_agg.setdefault(mode_label, {"totalCost": 0.0, "totalVolume": 0.0})
        mode["totalCost"] += net_amount
        mode["totalVolume"] += volume_units

        bucket = weight_bucket_agg.setdefault(
            weight_bucket, {"sort": weight_sort, "totalCost": 0.0, "totalVolume": 0.0}
        )
        bucket["totalCost"] += net_amount
        bucket["totalVolume"] += volume_units

        bc = summary["byCarrier"].setdefault(
            carrier, {"chargeLineCount": 0, "totalNetAmount": 0.0, "totalInvoiceAmount": 0.0}
        )
        bc["chargeLineCount"] += 1
        bc["totalNetAmount"] += net_amount
        bc["totalInvoiceAmount"] += invoice_amount

        bs = summary["byService"].setdefault(
            service, {"chargeLineCount": 0, "totalNetAmount": 0.0, "totalInvoiceAmount": 0.0}
        )
        bs["chargeLineCount"] += 1
        bs["totalNetAmount"] += net_amount
        bs["totalInvoiceAmount"] += invoice_amount

        date_key = parse_invoice_date_key(primary_rollup_date_raw(rec))
        account_dim = str(rec.get("Account Number") or "").strip() or "(no account)"

        if date_key:
            daily = daily_spend.setdefault(
                date_key, {"totalCost": 0.0, "costFuel": 0.0, "costAccessorials": 0.0, "costSurcharges": 0.0}
            )
            daily["totalCost"] += net_amount
            if is_fuel:
                daily["costFuel"] += net_amount
            if is_accessorial:
                daily["costAccessorials"] += net_amount
            if category3 in SURCHARGE_CATS:
                daily["costSurcharges"] += net_amount

            da_key = f"{date_key}\t{account_dim}"
            dacc = daily_by_account.setdefault(
                da_key, {"totalCost": 0.0, "costFuel": 0.0, "costAccessorials": 0.0, "costSurcharges": 0.0}
            )
            dacc["totalCost"] += net_amount
            if is_fuel:
                dacc["costFuel"] += net_amount
            if is_accessorial:
                dacc["costAccessorials"] += net_amount
            if category3 in SURCHARGE_CATS:
                dacc["costSurcharges"] += net_amount

            month_label = _month_label_from_date_key(date_key)
            month = month_spend.setdefault(
                month_label, {"totalCost": 0.0, "costFuel": 0.0, "costAccessorials": 0.0, "costSurcharges": 0.0}
            )
            month["totalCost"] += net_amount
            if is_fuel:
                month["costFuel"] += net_amount
            if is_accessorial:
                month["costAccessorials"] += net_amount
            if category3 in SURCHARGE_CATS:
                month["costSurcharges"] += net_amount

        inv_label = str(rec.get("Invoice Number") or "").strip() or "(no invoice)"
        inv_agg = invoice_spend.setdefault(
            inv_label,
            {
                "totalCost": 0.0,
                "costFuel": 0.0,
                "costAccessorials": 0.0,
                "costSurcharges": 0.0,
                "minDate": None,
                "accountNumbers": set(),
            },
        )
        inv_agg["totalCost"] += net_amount
        if is_fuel:
            inv_agg["costFuel"] += net_amount
        if is_accessorial:
            inv_agg["costAccessorials"] += net_amount
        if category3 in SURCHARGE_CATS:
            inv_agg["costSurcharges"] += net_amount
        if date_key:
            prev = inv_agg["minDate"]
            inv_agg["minDate"] = date_key if prev is None or date_key < prev else prev
        acc = str(rec.get("Account Number") or "").strip()
        if acc:
            inv_agg["accountNumbers"].add(acc)

    spend_by_invoice = []
    for invoice_number, v in invoice_spend.items():
        sorted_acc = sorted(v["accountNumbers"])
        if not sorted_acc:
            account_number = "(no account)"
        elif len(sorted_acc) == 1:
            account_number = sorted_acc[0]
        else:
            account_number = ", ".join(sorted_acc)
        spend_by_invoice.append(
            {
                "accountNumber": account_number,
                "invoiceNumber": invoice_number,
                "invoiceDate": v["minDate"],
                "totalCost": v["totalCost"],
                "costFuel": v["costFuel"],
                "costAccessorials": v["costAccessorials"],
                "costSurcharges": v["costSurcharges"],
            }
        )
    # Match TS: invoiceDate desc, then invoiceNumber asc
    spend_by_invoice.sort(key=lambda x: x["invoiceNumber"])
    spend_by_invoice.sort(key=lambda x: x["invoiceDate"] or "", reverse=True)

    package_qty_by_shipment: dict[str, float] = {}
    for rec in records:
        key = shipment_package_dedupe_key(rec)
        if not key:
            continue
        pq = to_number(rec.get("Package Quantity"))
        package_qty_by_shipment[key] = max(package_qty_by_shipment.get(key, 0.0), pq)

    summary["measures"]["totalPackages"] = sum(package_qty_by_shipment.values())
    summary["measures"]["packageDedupeShipmentCount"] = len(package_qty_by_shipment)
    summary["measures"]["weightGap"] = sum_billed - sum_entered
    summary["spendByInvoice"] = spend_by_invoice

    def month_sort_key(label: str) -> str:
        parts = label.split()
        if len(parts) < 2:
            return label
        month_name, year_text = parts[0], parts[-1]
        try:
            mi = datetime.strptime(f"{month_name} 1, {year_text}", "%B %d, %Y").month
        except ValueError:
            mi = 1
        return f"{year_text}-{mi:02d}"

    summary["monthlySpend"] = [
        {
            "month": month,
            "totalCost": vals["totalCost"],
            "costFuel": vals["costFuel"],
            "costAccessorials": vals["costAccessorials"],
            "costSurcharges": vals["costSurcharges"],
        }
        for month, vals in sorted(month_spend.items(), key=lambda kv: month_sort_key(kv[0]), reverse=True)
    ]

    summary["dailySpend"] = [
        {
            "date": date,
            "totalCost": vals["totalCost"],
            "costFuel": vals["costFuel"],
            "costAccessorials": vals["costAccessorials"],
            "costSurcharges": vals["costSurcharges"],
        }
        for date, vals in sorted(daily_spend.items(), key=lambda kv: kv[0])
    ]

    summary["dailySpendByAccount"] = []
    for key, vals in sorted(daily_by_account.items(), key=lambda kv: kv[0]):
        tab = key.find("\t")
        date = key[:tab] if tab >= 0 else key
        account = key[tab + 1 :] if tab >= 0 else "(no account)"
        summary["dailySpendByAccount"].append(
            {
                "date": date,
                "accountNumber": account,
                "totalCost": vals["totalCost"],
                "costFuel": vals["costFuel"],
                "costAccessorials": vals["costAccessorials"],
                "costSurcharges": vals["costSurcharges"],
            }
        )
    summary["dailySpendByAccount"].sort(key=lambda x: (x["date"], x["accountNumber"]))

    summary["category2VolumeCpp"] = sorted(
        [
            {
                "category2": k,
                "totalVolume": v["totalVolume"],
                "totalCost": v["totalCost"],
                "totalCpp": v["totalCost"] / v["totalVolume"] if v["totalVolume"] > 0 else 0.0,
            }
            for k, v in category2_agg.items()
        ],
        key=lambda x: -x["totalVolume"],
    )

    summary["modeVolumeCpp"] = sorted(
        [
            {
                "mode": k,
                "totalVolume": v["totalVolume"],
                "totalCost": v["totalCost"],
                "totalCpp": v["totalCost"] / v["totalVolume"] if v["totalVolume"] > 0 else 0.0,
            }
            for k, v in mode_agg.items()
        ],
        key=lambda x: -x["totalVolume"],
    )

    summary["weightBucketVolume"] = sorted(
        [
            {
                "weightBucket": k,
                "sort": v["sort"],
                "totalVolume": v["totalVolume"],
                "totalCost": v["totalCost"],
                "totalCpp": v["totalCost"] / v["totalVolume"] if v["totalVolume"] > 0 else 0.0,
            }
            for k, v in weight_bucket_agg.items()
        ],
        key=lambda x: x["sort"],
    )

    return summary
