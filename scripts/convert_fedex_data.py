#!/usr/bin/env python3
"""
Convert FedEx source documents into lib/pricing/data/ JSON files.

Usage:
  python3 scripts/convert_fedex_data.py

FedEx source PDFs (lib/pricing/data/sources/fedex/):
  FedEx_Standard_List_Rates_2026.pdf  → fedex-rates.json
  Service_Guide_2026.pdf              → fedex-accessorials.json (primary)
  surcharge_and_fee_changes_2026.pdf  → fedex-accessorials.json (cross-check)
  fedex_zones_COMPLETE.csv            → fedex-zone-charts/
  DAS_Contiguous_Extended_Remote_Alaska_Hawaii*.pdf (or .txt) → fedex-zip-surcharges.json
  DAS_Zip_Code_Changes_*.pdf          → overlay on fedex-zip-surcharges.json

Outputs:
  lib/pricing/data/fedex-rates.json
  lib/pricing/data/fedex-accessorials.json
  lib/pricing/data/fedex-zip-surcharges.json
  lib/pricing/data/fedex-zone-charts/{prefix}.json
  lib/pricing/data/fedex-zone-charts/_manifest.json
"""

from __future__ import annotations

import csv
import json
import re
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SOURCES = REPO / "lib/pricing/data/sources/fedex"
PDF = SOURCES / "FedEx_Standard_List_Rates_2026.pdf"
ZONES_CSV = SOURCES / "fedex_zones_COMPLETE.csv"
DAS_FULL_TXT = SOURCES / "DAS_Contiguous_Extended_Remote_Alaska_Hawaii_2025.txt"
DAS_CHANGES_PDF = SOURCES / "DAS_Zip_Code_Changes_2025.pdf"
OUT_RATES = REPO / "lib/pricing/data/fedex-rates.json"
OUT_ACCESSORIALS = REPO / "lib/pricing/data/fedex-accessorials.json"
OUT_ZIP = REPO / "lib/pricing/data/fedex-zip-surcharges.json"
OUT_ZONE_DIR = REPO / "lib/pricing/data/fedex-zone-charts"

EXPRESS_SERVICES = {
    "priority_overnight": 1,
    "standard_overnight": 2,
    "2day": 4,
    "express_saver": 5,
}
SERVICE_ORDER = [
    "first",
    "priority_overnight",
    "standard_overnight",
    "2day_am",
    "2day",
    "express_saver",
]
FEDEX_SERVICES = ["ground", "home_delivery", *EXPRESS_SERVICES.keys()]


def pdftotext() -> str:
    if not PDF.exists():
        raise FileNotFoundError(f"Missing FedEx list rates PDF: {PDF}")
    return subprocess.check_output(["pdftotext", str(PDF), "-"], text=True)


def parse_floats(block: str) -> list[float]:
    return [float(x) for x in re.findall(r"\$?\s*([\d]+\.[\d]{2})", block)]


def parse_ground_block(block: str) -> dict[str, dict[str, float]]:
    m = re.search(r"(\d+)\s*lbs?\.", block)
    start_wt = int(m.group(1)) if m else 1
    nums = parse_floats(block)
    if len(nums) < 14:
        return {}

    rates: dict[str, dict[str, float]] = {}
    if start_wt == 1:
        for z, v in zip(range(2, 9), nums[:7]):
            rates.setdefault("1", {})[str(z)] = v
        for z, v in zip(range(2, 9), nums[7:14]):
            rates.setdefault("2", {})[str(z)] = v
        rest = nums[14:]
        base = 3
    else:
        for z, v in zip(range(2, 9), nums[:7]):
            rates.setdefault(str(start_wt), {})[str(z)] = v
        rest = nums[7:]
        base = start_wt + 1

    col_size = len(rest) // 7
    for zi, z in enumerate(range(2, 9)):
        col = rest[zi * col_size : (zi + 1) * col_size]
        for i, v in enumerate(col):
            rates.setdefault(str(base + i), {})[str(z)] = v
    return rates


def parse_ground_rates(text: str) -> dict[str, dict[str, dict[str, float]]]:
    marker = "FedEx Ground® and FedEx Home Delivery® rates: Zones 2–8"
    all_rates: dict[str, dict[str, float]] = {}
    idx = 0
    while True:
        start = text.find(marker, idx)
        if start == -1:
            break
        nxt = text.find(marker, start + len(marker))
        block = text[start:nxt if nxt != -1 else len(text)]
        m = re.search(r"(\d+)\s*lbs?\.", block)
        start_wt = int(m.group(1)) if m else 1
        # Continental tables start at 1, 51, or 101 lb — skip AK/HI/other sections.
        if start_wt not in (1, 51, 101):
            idx = start + len(marker)
            continue
        chunk = parse_ground_block(block)
        for wt, zones in chunk.items():
            if int(wt) <= 150:
                all_rates[wt] = zones
        idx = start + len(marker)

    return {
        "ground": {k: dict(v) for k, v in all_rates.items()},
        "home_delivery": {k: dict(v) for k, v in all_rates.items()},
    }


def parse_express_zone(text: str, zone: int) -> dict[str, dict[str, dict[str, float]]]:
    pat = f"U.S. package rates: Zone {zone}"
    start = text.find(pat)
    if start == -1:
        return {svc: {} for svc in EXPRESS_SERVICES}

    nxt = text.find("U.S. package rates: Zone ", start + 10)
    block = text[start : nxt if nxt != -1 else start + 15000]
    nums = parse_floats(block)
    rates: dict[str, dict[str, dict[str, float]]] = {svc: {} for svc in EXPRESS_SERVICES}
    if len(nums) < 6:
        return rates

    row1 = nums[0:6]
    for svc, idx in EXPRESS_SERVICES.items():
        rates[svc]["1"] = {str(zone): row1[idx]}

    rest = nums[6:]
    col_size = len(rest) // 6
    base = 2
    for ci, svc_name in enumerate(SERVICE_ORDER):
        if svc_name not in EXPRESS_SERVICES:
            continue
        col = rest[ci * col_size : (ci + 1) * col_size]
        for i, v in enumerate(col):
            rates[svc_name].setdefault(str(base + i), {})[str(zone)] = v
    return rates


def merge_express_rates(text: str) -> dict[str, dict[str, dict[str, float]]]:
    merged = {svc: {} for svc in EXPRESS_SERVICES}
    for zone in range(2, 9):
        chunk = parse_express_zone(text, zone)
        for svc, weights in chunk.items():
            for wt, zones in weights.items():
                merged[svc].setdefault(wt, {}).update(zones)
    return merged


def zone_tiers(*bands: tuple[int, int, float]) -> list[dict]:
    return [{"zoneMin": lo, "zoneMax": hi, "rate": rate} for lo, hi, rate in bands]


def build_accessorials() -> dict:
    # Rates from Service_Guide_2026.pdf + surcharge_and_fee_changes_2026.pdf (eff. 2026-01-05).
    tier_234 = (3, 4)
    tier_567 = (5, 6)
    tier_7p = (7, 99)
    return {
        "_meta": {
            "effectiveDate": "2026-01-05",
            "source": "FedEx 2026 Service Guide + surcharge and fee changes (Jan 2026)",
            "sourceFiles": [
                "sources/fedex/Service_Guide_2026.pdf",
                "sources/fedex/surcharge_and_fee_changes_2026.pdf",
            ],
            "notes": [
                "List rates only. Apply contract discounts before use.",
                "Fuel surcharge is weekly — see fedex-fuel-surcharge-history.json.",
                "Home Delivery list rates match Ground; HD residential surcharge applied separately.",
                "Zone-tiered AHS and oversize use base zone 2–8; territory zones (44/45/46) use zone 8 tier.",
            ],
        },
        "homeDeliveryResidentialSurcharge": 6.45,
        "residentialSurcharge": {
            "_note": "Applied to Express services when residential=true.",
            "express": 6.95,
        },
        "addressCorrection": 25.50,
        "deliveryAreaSurcharge": {
            "groundCommercial": 4.45,
            "groundCommercialExtended": 5.55,
            "groundResidential": 6.60,
            "groundResidentialExtended": 8.80,
            "expressCommercial": 4.45,
            "expressCommercialExtended": 5.55,
            "expressResidential": 6.60,
            "expressResidentialExtended": 8.80,
            "remoteCommercial": 16.75,
            "remoteResidential": 16.75,
        },
        "additionalHandling": {
            "_note": "Highest trigger wins (weight > dimensions > packaging). Zone-tiered by base zone.",
            "weight": zone_tiers((2, 2, 46.00), tier_234 + (50.25,), tier_567 + (56.25,), tier_7p + (58.75,)),
            "dimensions": zone_tiers((2, 2, 29.50), tier_234 + (32.75,), tier_567 + (38.50,), tier_7p + (40.75,)),
            "packaging": zone_tiers((2, 2, 26.50), tier_234 + (30.75,), tier_567 + (33.00,), tier_7p + (33.75,)),
        },
        "oversizeCharge": zone_tiers((2, 2, 255.00), tier_234 + (275.00,), tier_567 + (320.00,), tier_7p + (330.00,)),
        "declaredValue": {
            "minimumBandMax": 300.00,
            "minimumCharge": 4.95,
            "ratePerHundred": 1.65,
        },
    }


def bootstrap_zip_surcharges() -> dict[str, str]:
    das = parse_das_full_list(load_das_text())
    if DAS_CHANGES_PDF.exists():
        das = apply_das_changes(das, DAS_CHANGES_PDF)
    return das


DAS_SECTION = re.compile(r"Delivery Area Surcharge ZIP codes:")
ZIP_TOKEN = re.compile(r"^(\d{5})\*?$")
CHANGE_SECTIONS: dict[str, str] = {
    "ADDED TO CONTIGUOUS U.S. LIST:": "das_standard",
    "MOVED FROM CONTIGUOUS U.S. LIST TO CONTIGUOUS U.S. EXTENDED LIST:": "das_extended",
    "MOVED FROM CONTIGUOUS U.S. EXTENDED LIST TO CONTIGUOUS U.S. LIST:": "das_standard",
    "MOVED FROM CONTIGUOUS U.S. EXTENDED LIST TO CONTIGUOUS U.S. REMOTE LIST:": "das_remote",
    "MOVED FROM CONTIGUOUS U.S. REMOTE LIST TO CONTIGUOUS U.S. EXTENDED LIST:": "das_extended",
    "REMOVED FROM CONTIGUOUS U.S. LIST:": "__remove__",
    "REMOVED FROM CONTIGUOUS U.S. REMOTE LIST:": "__remove__",
}


def load_das_text() -> str:
    for path in sorted(SOURCES.glob("DAS_Contiguous_Extended_Remote_Alaska_Hawaii*.pdf")):
        if path.stat().st_size > 10_000:
            return subprocess.check_output(["pdftotext", str(path), "-"], text=True)
    if DAS_FULL_TXT.exists():
        return DAS_FULL_TXT.read_text()
    raise FileNotFoundError(
        "Missing FedEx DAS ZIP list. Add "
        "sources/fedex/DAS_Contiguous_Extended_Remote_Alaska_Hawaii.pdf (or .txt)."
    )


def classify_das_section(header: str) -> str | None:
    if "Intra-Hawaii" in header:
        return "das_remote"
    if ": Extended" in header:
        return "das_extended"
    if ": Remote" in header:
        return "das_remote"
    if ": Alaska" in header:
        return "das_remote"
    if ": Hawaii" in header:
        return "das_remote"
    if "Contiguous U.S." in header:
        return "das_standard"
    return None


def parse_das_full_list(text: str) -> dict[str, str]:
    current: str | None = None
    out: dict[str, str] = {}
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        if DAS_SECTION.search(line):
            current = classify_das_section(line)
            continue
        match = ZIP_TOKEN.match(line)
        if match and current:
            out[match.group(1).zfill(5)] = current
    return out


def apply_das_changes(base: dict[str, str], changes_pdf: Path) -> dict[str, str]:
    text = subprocess.check_output(["pdftotext", str(changes_pdf), "-"], text=True)
    out = dict(base)
    current: str | None = None
    for raw in text.splitlines():
        line = raw.strip()
        if line in CHANGE_SECTIONS:
            current = CHANGE_SECTIONS[line]
            continue
        match = ZIP_TOKEN.match(line)
        if not match or current is None:
            continue
        zip_code = match.group(1).zfill(5)
        if current == "__remove__":
            out.pop(zip_code, None)
        else:
            out[zip_code] = current
    return out


def parse_zip_range(raw: str) -> tuple[int, int]:
    if "-" in raw:
        lo, hi = raw.split("-", 1)
        return int(lo), int(hi)
    z = int(raw)
    return z, z


def parse_zone_value(raw: str) -> int | None:
    if raw in ("NA", "*", ""):
        return None
    return int(raw)


def zone_for_zip(rules: list[dict], zip5: int) -> tuple[int | None, int | None]:
    best: dict | None = None
    best_span: int | None = None
    for rule in rules:
        lo, hi = rule["dest_lo"], rule["dest_hi"]
        if lo <= zip5 <= hi:
            span = hi - lo
            if best is None or span < best_span:
                best = rule
                best_span = span
    if best is None:
        return None, None
    return best["express"], best["ground"]


def build_zone_charts_from_csv() -> list[int]:
    if not ZONES_CSV.exists():
        raise FileNotFoundError(f"Missing FedEx zones CSV: {ZONES_CSV}")

    by_origin: dict[str, list[dict]] = {}
    with ZONES_CSV.open(newline="") as f:
        for row in csv.DictReader(f):
            dest_lo, dest_hi = parse_zip_range(row["dest_zip_range"])
            by_origin.setdefault(row["origin_zip_range"], []).append(
                {
                    "dest_lo": dest_lo,
                    "dest_hi": dest_hi,
                    "express": parse_zone_value(row["fedex_express_zone"]),
                    "ground": parse_zone_value(row["fedex_ground_zone"]),
                }
            )

    prefix_charts: dict[int, dict[str, dict[str, int | None]]] = {}
    for origin_range, rules in by_origin.items():
        origin_lo, origin_hi = parse_zip_range(origin_range)
        chart: dict[str, dict[str, int | None]] = {}
        for dest_prefix in range(1000):
            rep_zip = dest_prefix * 100 + 50
            express, ground = zone_for_zip(rules, rep_zip)
            if express is None and ground is None:
                continue
            chart[f"{dest_prefix:03d}"] = {
                "ground": ground,
                "home_delivery": ground,
                "express_saver": express,
                "2day": express,
                "standard_overnight": express,
                "priority_overnight": express,
            }

        for origin_prefix in range(origin_lo // 100, origin_hi // 100 + 1):
            prefix_charts[origin_prefix] = chart

    OUT_ZONE_DIR.mkdir(parents=True, exist_ok=True)
    for stale in OUT_ZONE_DIR.glob("*.json"):
        if not stale.name.startswith("_"):
            stale.unlink()

    prefixes = sorted(prefix_charts)
    for prefix in prefixes:
        out_path = OUT_ZONE_DIR / f"{prefix:03d}.json"
        out_path.write_text(json.dumps(prefix_charts[prefix], separators=(",", ":")))

    (OUT_ZONE_DIR / "_manifest.json").write_text(
        json.dumps({"prefixes": prefixes, "source": "sources/fedex/fedex_zones_COMPLETE.csv"}, indent=2)
        + "\n"
    )
    return prefixes


def main() -> int:
    print(f"Reading {PDF.name}...")
    text = pdftotext()

    print("Parsing Ground / Home Delivery rates...")
    rates = parse_ground_rates(text)
    express = merge_express_rates(text)
    rates.update(express)

    weight_counts = ", ".join(
        f"{svc}: {len(tbl)} weights" for svc, tbl in rates.items()
    )
    OUT_RATES.write_text(json.dumps(rates, indent=2) + "\n")
    print(f"  ✓ fedex-rates.json ({weight_counts})")

    accessorials = build_accessorials()
    OUT_ACCESSORIALS.write_text(json.dumps(accessorials, indent=2) + "\n")
    print("  ✓ fedex-accessorials.json")

    zip_map = bootstrap_zip_surcharges()
    OUT_ZIP.write_text(json.dumps(zip_map, separators=(",", ":")) + "\n")
    print(f"  ✓ fedex-zip-surcharges.json ({len(zip_map)} ZIPs)")

    prefixes = build_zone_charts_from_csv()
    print(f"  ✓ fedex-zone-charts/ ({len(prefixes)} origin prefixes from {ZONES_CSV.name})")

    print("\nDone.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
