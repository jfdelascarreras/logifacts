"""Action prioritization — mirrors lib/premium-analysis/action-prioritization.ts."""

from __future__ import annotations

from typing import Any

INSTRUCTIONS: dict[str, dict[str, str]] = {
    "address_correction": {
        "effort": "low",
        "text": "Enable address validation at checkout to eliminate $10–15 per correction.",
    },
    "fuel_over_eia": {
        "effort": "low",
        "text": "File billing error claims for fuel lines over the published EIA rate for the invoice week.",
    },
    "accessorial_rate_high": {
        "effort": "medium",
        "text": "Identify top 2–3 accessorial types driving rate above 10% and target each with a mitigation plan.",
    },
    "avoidable_expedited": {
        "effort": "medium",
        "text": "Route zone ≤3 shipments on Ground instead of expedited service where transit is equivalent.",
    },
    "additional_handling": {
        "effort": "high",
        "text": "Measure top SKU carton dimensions and reduce additional handling triggers before resizing all packaging.",
    },
    "large_package": {
        "effort": "medium",
        "text": "Verify shipment dimensions; file a claim if carrier measurements are inaccurate.",
    },
    "weight_gap_high": {
        "effort": "high",
        "text": "Measure top 5 SKU boxes against DIM divisor — positive gap indicates billable DIM weight issue.",
    },
    "declared_value": {
        "effort": "low",
        "text": "Review declared value coverage — consumer goods often covered by standard $100 liability.",
    },
    "monthly_spend_spike": {
        "effort": "medium",
        "text": "Investigate spike month volume mix, rate changes, and one-time surcharges.",
    },
}

EFFORT_SCORE = {"low": 3, "medium": 2, "high": 1}


def prioritize_actions(savings: dict[str, Any]) -> list[dict[str, Any]]:
    items = []
    for opp in savings.get("opportunities") or []:
        meta = INSTRUCTIONS.get(
            opp["type"],
            {
                "effort": "medium",
                "text": f"Review flagged {opp['type'].replace('_', ' ')} opportunities with operations team.",
            },
        )
        score = opp["annualizedHigh"] * EFFORT_SCORE[meta["effort"]]
        items.append({"opp": opp, "meta": meta, "score": score})

    items.sort(key=lambda x: -x["score"])

    return [
        {
            "rank": index + 1,
            "category": item["opp"]["type"].replace("_", " "),
            "annualSavingsLow": round(item["opp"]["annualizedLow"], 2),
            "annualSavingsHigh": round(item["opp"]["annualizedHigh"], 2),
            "effort": item["meta"]["effort"],
            "instructions": item["meta"]["text"],
            "executable": index < 3,
        }
        for index, item in enumerate(items)
    ]
