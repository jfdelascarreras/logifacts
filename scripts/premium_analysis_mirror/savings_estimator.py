"""Savings estimator — mirrors lib/premium-analysis/savings-estimator.ts."""

from __future__ import annotations

from typing import Any

from .primitives import year_month_key_from_engine_month_label

RECOVERY_RATE: dict[str, dict[str, float]] = {
    "fuel_over_eia": {"low": 0.5, "high": 1.0},
    "contract_discount_shortfall": {"low": 0.5, "high": 1.0},
    "address_correction": {"low": 0.8, "high": 1.0},
    "large_package": {"low": 0.25, "high": 0.75},
    "additional_handling": {"low": 0.25, "high": 0.5},
    "avoidable_expedited": {"low": 0.3, "high": 0.7},
    "declared_value": {"low": 0.5, "high": 1.0},
    "accessorial_rate_high": {"low": 0.1, "high": 0.25},
    "weight_gap_high": {"low": 0.15, "high": 0.35},
    "monthly_spend_spike": {"low": 0.0, "high": 0.0},
}


def _months_in_dataset(monthly_spend: list[dict[str, Any]]) -> int:
    keys = set()
    for m in monthly_spend:
        k = year_month_key_from_engine_month_label(m.get("month", ""))
        if k:
            keys.add(k)
    return max(1, len(keys))


def cap_flag_amounts_by_spend(flags: list[dict[str, Any]], period_total_spend: float) -> dict[str, float]:
    by_type: dict[str, float] = {}
    for flag in flags:
        t = flag["type"]
        by_type[t] = by_type.get(t, 0.0) + float(flag.get("amount") or 0)

    raw_sum = sum(by_type.values())
    if period_total_spend <= 0 or raw_sum <= period_total_spend:
        return by_type

    scale = period_total_spend / raw_sum
    return {t: a * scale for t, a in by_type.items()}


def estimate_savings(
    anomaly_flags: list[dict[str, Any]],
    monthly_spend: list[dict[str, Any]],
    period_total_spend: float | None = None,
) -> dict[str, Any]:
    months = _months_in_dataset(monthly_spend)
    period_spend = period_total_spend
    if period_spend is None:
        period_spend = sum(float(m.get("totalCost") or 0) for m in monthly_spend)

    by_type = cap_flag_amounts_by_spend(anomaly_flags, period_spend)

    opportunities = []
    for flag_type, period_amount in by_type.items():
        rates = RECOVERY_RATE.get(flag_type, {"low": 0.2, "high": 0.5})
        annualized = (period_amount / months) * 12
        opportunities.append(
            {
                "type": flag_type,
                "periodAmount": period_amount,
                "annualizedLow": annualized * rates["low"],
                "annualizedHigh": annualized * rates["high"],
            }
        )

    low = sum(o["annualizedLow"] for o in opportunities)
    high = sum(o["annualizedHigh"] for o in opportunities)
    annualized_cap = (period_spend / months) * 12 if period_spend > 0 else 0.0

    if annualized_cap > 0 and high > annualized_cap:
        scale = annualized_cap / high
        opportunities = [
            {
                **o,
                "annualizedLow": o["annualizedLow"] * scale,
                "annualizedHigh": o["annualizedHigh"] * scale,
            }
            for o in opportunities
        ]
        low *= scale
        high = annualized_cap

    return {
        "low": round(low, 2),
        "high": round(high, 2),
        "annualizedBasisMonths": months,
        "opportunities": sorted(opportunities, key=lambda x: -x["annualizedHigh"]),
    }
