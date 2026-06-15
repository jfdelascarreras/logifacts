"""Low-level helpers — mirrors lib/invoices/csv.ts and analysis-summary.ts."""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any

SURCHARGE_CATS = frozenset({"FUEL SURCHARGE", "ACCESSORIAL SURCHARGE", "SURCHARGE"})

NON_UPS_DATE_COLUMNS = ("Invoice Date", "Transaction Date", "Shipment Date")


def normalize_mapping_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip()).upper()


def canonical_premium_carrier(raw: str) -> str:
    k = normalize_mapping_text(raw)
    norm = "UPS" if k == "" else k
    if norm == "UPS":
        return "UPS"
    if "FED" in norm:
        return "FEDEX"
    if "WORLD" in norm or norm == "WWE" or "WWE" in norm:
        return "WWE"
    return norm


def premium_carrier_key_from_record(rec: dict[str, Any]) -> str:
    return canonical_premium_carrier(str(rec.get("Carrier Name") or ""))


def has_real_date_value(column: str, rec: dict[str, Any]) -> bool:
    v = str(rec.get(column) or "").strip()
    return v != "" and v != column


def primary_rollup_date_raw(rec: dict[str, Any]) -> str | None:
    carrier = premium_carrier_key_from_record(rec)
    if carrier in {"FEDEX", "WWE"}:
        for col in NON_UPS_DATE_COLUMNS:
            if has_real_date_value(col, rec):
                return str(rec.get(col) or "").strip()
        return None
    if not has_real_date_value("Invoice Date", rec):
        return None
    return str(rec.get("Invoice Date") or "").strip()


def to_number(value: Any) -> float:
    if value is None:
        return 0.0
    raw = str(value).strip()
    if not raw:
        return 0.0
    if re.search(r"[a-z]", raw, re.I):
        return 0.0
    is_paren = raw.startswith("(") and raw.endswith(")")
    normalized = f"-{raw[1:-1]}" if is_paren else raw
    cleaned = re.sub(r"[$,\s]", "", normalized)
    if not re.fullmatch(r"-?\d*\.?\d+", cleaned):
        return 0.0
    try:
        n = float(cleaned)
    except ValueError:
        return 0.0
    return n if n == n else 0.0  # NaN guard


def parse_invoice_date_key(raw: Any) -> str | None:
    value = re.sub(r'^"|"$', "", str(raw or "").strip())
    if not value:
        return None
    date_only = re.split(r"[T\s]", value)[0]

    year = month = day = 0
    us = re.match(r"^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$", date_only)
    iso = re.match(r"^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$", date_only)
    compact = re.match(r"^(\d{4})(\d{2})(\d{2})$", date_only)

    if compact:
        year, month, day = int(compact[1]), int(compact[2]), int(compact[3])
    elif iso:
        year, month, day = int(iso[1]), int(iso[2]), int(iso[3])
    elif us:
        month, day, year = int(us[1]), int(us[2]), int(us[3])
    else:
        return None
    if not (1 <= month <= 12 and 1 <= day <= 31):
        return None
    try:
        dt = datetime(year, month, day, tzinfo=timezone.utc)
    except ValueError:
        return None
    if dt.year != year or dt.month != month or dt.day != day:
        return None
    return f"{year:04d}-{month:02d}-{day:02d}"


def shipment_package_dedupe_key(rec: dict[str, Any]) -> str | None:
    invoice = str(rec.get("Invoice Number") or "").strip()
    for field in ("Tracking Number", "Shipment Reference Number 1", "Lead Shipment Number"):
        ship_id = str(rec.get(field) or "").strip()
        if ship_id:
            return f"{invoice}::{ship_id}"
    return None


def shipment_identity_key(rec: dict[str, Any]) -> str | None:
    dedupe = shipment_package_dedupe_key(rec)
    if dedupe:
        return dedupe
    invoice = str(rec.get("Invoice Number") or "").strip()
    ref1 = str(rec.get("Shipment Reference Number 1") or "").strip()
    if invoice and ref1:
        return f"{invoice}::{ref1}"
    if invoice:
        return f"{invoice}::no-ship-id"
    return None


def is_accessorial_cost_row(
    charge_classification: str,
    charge_category_code: str,
    category_1: str,
    category_3: str,
) -> bool:
    cc = str(charge_classification or "").strip().upper()
    cat_code = str(charge_category_code or "").strip().upper()
    if cc == "ACC" and cat_code not in {"INF", "ICC"}:
        return True
    c1 = normalize_mapping_text(category_1)
    c3 = normalize_mapping_text(category_3)
    return c1 == "ACCESSORIAL SURCHARGE" and c3 not in SURCHARGE_CATS


def mode_from_zone(zone: Any) -> str:
    z = int(to_number(zone)) if str(zone or "").strip() else -1
    if 400 <= z < 500:
        return "Express/Special"
    if 300 <= z < 400:
        return "Air"
    if 200 <= z < 300:
        return "International Export"
    if 100 <= z < 200:
        return "International Import"
    if 0 <= z < 100:
        return "Ground"
    return "Unknown"


def weight_bucket_from_lbs(weight_lbs: float) -> tuple[str, int]:
    if weight_lbs <= 1:
        return "0-1 lbs", 1
    if weight_lbs <= 5:
        return "2-5 lbs", 2
    if weight_lbs <= 10:
        return "6-10 lbs", 3
    if weight_lbs <= 20:
        return "11-20 lbs", 4
    if weight_lbs <= 50:
        return "21-50 lbs", 5
    if weight_lbs <= 100:
        return "51-100 lbs", 6
    return "100+ lbs", 7


def is_sci_notation_corrupted(value: object) -> bool:
    try:
        float(str(value).strip())
        s = str(value).strip().upper()
        return "E" in s and s.replace(".", "").replace("E+", "").replace("E-", "").isdigit()
    except ValueError:
        return False


def filter_rows_like_club_colors(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for rec in records:
        carrier = premium_carrier_key_from_record(rec)
        if carrier in {"FEDEX", "WWE"}:
            if any(has_real_date_value(col, rec) for col in NON_UPS_DATE_COLUMNS):
                out.append(rec)
        elif has_real_date_value("Invoice Date", rec):
            out.append(rec)
    return out


def year_month_key_from_engine_month_label(label: str) -> str | None:
    parts = label.split()
    if len(parts) < 2:
        return None
    month_name, year_text = parts[0], parts[-1]
    try:
        mi = datetime.strptime(f"{month_name} 1, {year_text}", "%B %d, %Y").month
    except ValueError:
        return None
    return f"{year_text}-{mi:02d}"


def iso_week_year_from_date_key(date_key: str) -> tuple[int, int]:
    """Mirrors period-averages-matrix.ts isoWeekYearFromDateKey (UTC)."""
    from datetime import timedelta
    import math

    d = datetime.strptime(date_key, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    js_dow = (d.weekday() + 1) % 7  # JS getUTCDay: Sun=0 .. Sat=6
    day = js_dow or 7
    shifted = d + timedelta(days=4 - day)
    iso_year = shifted.year
    year_start = datetime(iso_year, 1, 1, tzinfo=timezone.utc)
    week_of_year = math.ceil(((shifted - year_start).total_seconds() / 86400 + 1) / 7)
    return iso_year, int(week_of_year)
