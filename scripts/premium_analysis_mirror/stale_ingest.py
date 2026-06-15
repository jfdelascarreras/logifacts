"""Stale ingest detection — mirrors lib/premium-analysis/stale-ingest.ts."""

from __future__ import annotations

from .constants import FEDEX_PARSE_VERSION, UPS_PARSE_VERSION, WWE_PARSE_VERSION

CARRIER_PARSE_EXPECTATIONS = [
    {"carrier": "FedEx", "version": FEDEX_PARSE_VERSION},
    {"carrier": "WWE", "version": WWE_PARSE_VERSION},
    {"carrier": "UPS", "version": UPS_PARSE_VERSION},
]


def detect_stale_ingest(parse_versions: list[str], carriers_present: list[str]) -> dict[str, object]:
    reasons: list[str] = []
    versions = {v.strip() for v in parse_versions if v and v.strip()}
    carriers = {c.strip() for c in carriers_present if c and c.strip()}

    for item in CARRIER_PARSE_EXPECTATIONS:
        carrier = item["carrier"]
        version = item["version"]
        present = any(carrier.lower() in c.lower() for c in carriers)
        if not present:
            continue
        if version not in versions:
            reasons.append(
                f"{carrier} data may be from an older parser — re-upload invoices to refresh "
                f"weights, tracking, and taxonomy (expected {version})."
            )

    if carriers and not versions:
        reasons.append(
            "No parser version recorded on stored facts — re-upload invoices to pick up the latest ingest pipeline."
        )

    unique = list(dict.fromkeys(reasons))
    return {"needsReupload": len(unique) > 0, "reasons": unique}
