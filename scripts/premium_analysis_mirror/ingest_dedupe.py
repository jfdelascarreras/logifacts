"""Charge-line dedupe — mirrors dedupeInvoiceRecordsStableOrder key fields."""

from __future__ import annotations

from typing import Any


def charge_line_dedupe_key(rec: dict[str, Any]) -> str:
    parts = [
        str(rec.get("Invoice Number") or "").strip().upper(),
        str(rec.get("Tracking Number") or "").strip().upper(),
        str(rec.get("Charge Description") or "").strip().upper(),
        str(rec.get("Net Amount") or "").strip(),
        str(rec.get("Invoice Date") or "").strip(),
        str(rec.get("Carrier Name") or "").strip().upper(),
    ]
    return "\t".join(parts)


def dedupe_records_stable(records: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], int]:
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    dropped = 0
    for rec in records:
        key = charge_line_dedupe_key(rec)
        if key in seen:
            dropped += 1
            continue
        seen.add(key)
        out.append(rec)
    if dropped:
        print(f"  [INFO] Dropped {dropped} duplicate charge line(s)")
    return out, dropped
