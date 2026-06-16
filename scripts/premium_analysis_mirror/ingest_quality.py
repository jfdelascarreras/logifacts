"""Ingest quality gates — mirrors lib/premium-analysis/ingest-quality.ts."""

from __future__ import annotations

import os
from typing import Any


def ingest_quality_block_savings_enabled() -> bool:
    return os.environ.get("INGEST_QUALITY_BLOCK_SAVINGS", "1") != "0"


def evaluate_ingest_quality(
    diagnostics: dict[str, Any],
    total_cost: float,
    threshold_pct: float = 0.15,
) -> dict[str, Any]:
    unmapped = float(diagnostics.get("unmappedSpend") or 0)
    unmapped_pct = unmapped / total_cost if total_cost > 0 else 0.0
    over = unmapped_pct > threshold_pct

    if not ingest_quality_block_savings_enabled():
        return {
            "blockSavings": False,
            "unmappedPctOfSpend": unmapped_pct,
            "thresholdPct": threshold_pct,
            "reason": None,
        }

    return {
        "blockSavings": over,
        "unmappedPctOfSpend": unmapped_pct,
        "thresholdPct": threshold_pct,
        "reason": (
            f"{unmapped_pct * 100:.1f}% of spend is unmapped (threshold {threshold_pct * 100:.0f}%) "
            "— update charge taxonomy before trusting savings estimates."
            if over
            else None
        ),
    }


def apply_ingest_quality_gate(summary: dict[str, Any], gate: dict[str, Any]) -> dict[str, Any]:
    if not gate.get("blockSavings"):
        return summary
    out = dict(summary)
    out.pop("savingsEstimate", None)
    out["actionItems"] = []
    return out
