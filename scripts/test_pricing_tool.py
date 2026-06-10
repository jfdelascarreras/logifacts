"""
UPS Pricing Tool — Python cross-validator
==========================================
Replicates the TypeScript estimateUPS() logic using the same JSON data files,
then compares results against values you captured from the web tool.

Usage
-----
  python scripts/test_pricing_tool.py                         # runs pricing_test_cases.json
  python scripts/test_pricing_tool.py --tests my_cases.json  # custom file
  python scripts/test_pricing_tool.py --tolerance 0.05       # looser $ tolerance (default 0.01)

Test case file format (JSON array)
-----------------------------------
[
  {
    "label": "Ground 5 lbs Chicago→NYC commercial",
    "input": {
      "weightLbs": 5,
      "destinationZip": "10001",
      "service": "ground",
      "zoneChartPrefix": "601",
      "residential": false,
      "rateType": "daily",
      "dimensionsIn": {"length": 12, "width": 8, "height": 6},  // optional
      "nonStandardPackaging": false,
      "declaredValueDollars": 0,
      "addressCorrection": false,
      "contractDiscounts": {                                     // optional, all 0-0.95
        "transportation": 0,
        "fuelSurcharge": 0,
        "residential": 0,
        "das": 0,
        "additionalHandling": 0,
        "largePackage": 0,
        "addressCorrection": 0,
        "declaredValue": 0
      },
      "fuelSurchargeRates": {"ground": 0.275, "air": 0.3125}   // optional; omit = latest history
    },
    "tool_result": {
      "totalEstimatedCharge": 27.33,      // REQUIRED — what the tool showed
      // Optional fine-grained fields (copy from the tool breakdown if you want per-line checks):
      "publishedRate": 18.65,
      "netTransportationCharge": 18.65,
      "fuelSurcharge": 5.13,
      "residentialSurcharge": 0,
      "dasSurcharge": 4.50,
      "largePackageSurcharge": 0,
      "additionalHandlingSurcharge": 0,
      "remoteAreaSurcharge": 0,
      "declaredValueCharge": 0,
      "addressCorrectionCharge": 0
    }
  }
]
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
from pathlib import Path
from typing import Any

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "lib" / "pricing" / "data"

# ---------------------------------------------------------------------------
# Load data files (once at import time)
# ---------------------------------------------------------------------------

def _load(name: str) -> Any:
    with open(DATA_DIR / name) as f:
        return json.load(f)


RATES: dict[str, dict[str, dict[str, float]]] = _load("ups-rates.json")
SB_RATES: dict[str, dict[str, dict[str, float]]] = _load("ups-sb-rates.json")
ACCESSORIALS: dict[str, Any] = _load("accessorials.json")
FUEL_HISTORY: list[dict] = _load("ups-fuel-surcharge-history.json")
ZIP_SURCHARGES: dict[str, str] = _load("zip-surcharges.json")

FEDEX_RATES: dict[str, dict[str, dict[str, float]]] = _load("fedex-rates.json")
FEDEX_ACCESSORIALS: dict[str, Any] = _load("fedex-accessorials.json")
FEDEX_FUEL_HISTORY: list[dict] = _load("fedex-fuel-surcharge-history.json")
FEDEX_ZIP_SURCHARGES: dict[str, str] = _load("fedex-zip-surcharges.json")

# ---------------------------------------------------------------------------
# Constants (mirror TypeScript)
# ---------------------------------------------------------------------------

AIR_SERVICES = {"3day", "2day", "2day_am", "nda_saver", "nda"}
FEDEX_EXPRESS_SERVICES = {"express_saver", "2day", "standard_overnight", "priority_overnight"}
FEDEX_DIM_DIVISOR = 139

DIM_DIVISORS: dict[str, int] = {
    "ground": 220,
    "3day": 194,
    "2day": 194,
    "2day_am": 194,
    "nda_saver": 194,
    "nda": 194,
}

ZONE_OFFSETS: dict[str, int] = {
    "ground": 0,
    "nda": 100,
    "nda_saver": 130,
    "2day": 200,
    "2day_am": 240,
    "3day": 300,
}

# ---------------------------------------------------------------------------
# Pure helpers (match TypeScript one-for-one)
# ---------------------------------------------------------------------------

def clamp_discount(v: float | None) -> float:
    return min(max(v or 0.0, 0.0), 0.95)


def resolve_discounts(d: dict | None) -> dict[str, float]:
    d = d or {}
    keys = ["transportation", "fuelSurcharge", "residential", "das",
            "additionalHandling", "largePackage", "addressCorrection", "declaredValue"]
    return {k: clamp_discount(d.get(k)) for k in keys}


def calc_dim_weight(dims: dict, service: str) -> int:
    vol = dims["length"] * dims["width"] * dims["height"]
    return math.ceil(vol / DIM_DIVISORS[service])


def calc_dim_weight_sb(dims: dict) -> int | None:
    vol = dims["length"] * dims["width"] * dims["height"]
    if vol <= 864:
        return None
    return math.ceil(vol / 166)


def calc_billable_weight(actual_lbs: float, dim_lbs: int) -> tuple[int, str]:
    actual_ceil = math.ceil(actual_lbs)
    if dim_lbs > actual_ceil:
        return dim_lbs, "dimensional"
    return actual_ceil, "actual"


def load_zone_chart(prefix: str) -> dict[str, dict[str, int | None]]:
    path = DATA_DIR / "zone-charts" / f"{prefix}.json"
    with open(path) as f:
        return json.load(f)


def load_fedex_zone_chart(prefix: str) -> dict[str, dict[str, int | None]]:
    path = DATA_DIR / "fedex-zone-charts" / f"{prefix}.json"
    with open(path) as f:
        return json.load(f)


def lookup_zone(chart: dict, dest_zip: str, service: str) -> int | None:
    prefix = dest_zip.zfill(5)[:3]
    entry = chart.get(prefix)
    if entry is None:
        return None
    return entry.get(service)  # may be None if service not available to that dest


def get_published_rate(service: str, billable_weight: int, zone: int) -> float | None:
    svc = RATES.get(service)
    if not svc:
        return None
    return svc.get(str(billable_weight), {}).get(str(zone))


def get_published_rate_sb(service: str, billable_weight: int, zone: int) -> float | None:
    svc = SB_RATES.get(service)
    if not svc or not svc:
        return None
    return svc.get(str(billable_weight), {}).get(str(zone))


def has_sb_rates() -> bool:
    return any(
        not k.startswith("_") and isinstance(v, dict) and len(v) > 0
        for k, v in SB_RATES.items()
    )


def max_available_weight(service: str) -> int:
    svc = RATES.get(service, {})
    if not svc:
        return 0
    return max(int(k) for k in svc)


def max_available_weight_sb(service: str) -> int:
    svc = SB_RATES.get(service, {})
    if not svc or not any(True for _ in svc):
        return 0
    return max(int(k) for k in svc)


def get_fuel_surcharge_rate(service: str) -> float:
    latest = FUEL_HISTORY[0]
    return latest["domesticAir"] if service in AIR_SERVICES else latest["domesticGround"]


def base_zone(zone: int, service: str) -> int:
    bz = zone - ZONE_OFFSETS[service]
    if bz < 2 or bz > 8:
        return 8
    return bz


def tiered_rate(tiers: list[dict], bz: int) -> float:
    for t in tiers:
        if t["zoneMin"] <= bz <= t["zoneMax"]:
            return t["rate"]
    return 0.0


def is_large_package(dims: dict) -> bool:
    sides = sorted([dims["length"], dims["width"], dims["height"]], reverse=True)
    l, w, h = sides
    return l > 96 or (l + 2 * (w + h)) > 130


def remote_area_type(dest_zip: str) -> str | None:
    kind = ZIP_SURCHARGES.get(dest_zip)
    if kind == "remote_alaska":
        return "alaska"
    if kind == "remote_hawaii":
        return "hawaii"
    if kind == "remote_us48":
        return "us48"
    return None


def das_type(dest_zip: str) -> str | None:
    kind = ZIP_SURCHARGES.get(dest_zip)
    if kind == "das_standard":
        return "standard"
    if kind == "das_extended":
        return "extended"
    return None


def declared_value_charge(declared_dollars: float, rate_per_hundred: float, minimum: float) -> float:
    if declared_dollars <= 0:
        return 0.0
    return max(minimum, (declared_dollars / 100) * rate_per_hundred)


def additional_handling_trigger(weight_lbs: float, dims: dict | None, non_standard: bool) -> str | None:
    if weight_lbs > 70:
        return "weight"
    if dims:
        sides = sorted([dims["length"], dims["width"], dims["height"]], reverse=True)
        longest, second = sides[0], sides[1]
        if longest > 48 or second > 30:
            return "dimensions"
    if non_standard:
        return "packaging"
    return None

# ---------------------------------------------------------------------------
# Main estimator
# ---------------------------------------------------------------------------

def estimate_ups(inp: dict) -> dict:
    """
    Returns a dict with either:
      {"ok": False, "error": "..."}
    or
      {"ok": True, "breakdown": {...}}
    Breakdown keys match TypeScript UPSRateBreakdown (camelCase).
    """
    weight_lbs: float = inp["weightLbs"]
    dest_zip: str = str(inp["destinationZip"]).zfill(5)
    service: str = inp["service"]
    residential: bool = bool(inp.get("residential", False))
    rate_type: str = inp.get("rateType", "daily")
    is_sb = rate_type == "smallBusiness"
    dims: dict | None = inp.get("dimensionsIn")
    non_standard: bool = bool(inp.get("nonStandardPackaging", False))
    declared_value_dollars: float = float(inp.get("declaredValueDollars", 0))
    address_correction: bool = bool(inp.get("addressCorrection", False))
    zone_chart_prefix: str = str(inp["zoneChartPrefix"])
    discounts_raw: dict | None = inp.get("contractDiscounts")
    fuel_rates_override: dict | None = inp.get("fuelSurchargeRates")

    if weight_lbs <= 0:
        return {"ok": False, "error": "Weight must be greater than 0."}

    if is_sb and not has_sb_rates():
        return {"ok": False, "error": "Small Business rate tables are not yet available."}

    # Dim weight
    if dims:
        dim_weight_lbs = calc_dim_weight_sb(dims) if is_sb else calc_dim_weight(dims, service)
    else:
        dim_weight_lbs = None

    # Billable weight
    if dim_weight_lbs is not None:
        billable_weight_lbs, billable_weight_source = calc_billable_weight(weight_lbs, dim_weight_lbs)
    else:
        billable_weight_lbs = math.ceil(weight_lbs)
        billable_weight_source = "actual"

    # Max weight check
    max_wt = max_available_weight_sb(service) if is_sb else max_available_weight(service)
    if billable_weight_lbs > max_wt:
        return {
            "ok": False,
            "error": f"Billable weight {billable_weight_lbs} lbs exceeds maximum ({max_wt} lbs) for this service.",
        }

    # Zone lookup
    chart = load_zone_chart(zone_chart_prefix)
    zone = lookup_zone(chart, dest_zip, service)
    if zone is None:
        return {"ok": False, "error": f"Service not available or zone not found for destination ZIP {dest_zip}."}

    # Published rate
    published_rate = (
        get_published_rate_sb(service, billable_weight_lbs, zone)
        if is_sb
        else get_published_rate(service, billable_weight_lbs, zone)
    )
    if published_rate is None:
        return {"ok": False, "error": f"No published rate found for zone {zone} at {billable_weight_lbs} lbs."}

    # Discounts
    discounts = resolve_discounts({} if is_sb else (discounts_raw or {}))

    # Transportation
    net_transportation_charge = published_rate * (1 - discounts["transportation"])

    # Fuel surcharge
    if is_sb:
        fuel_surcharge_rate = 0.0
        fuel_surcharge = 0.0
    else:
        if fuel_rates_override:
            fuel_surcharge_rate = fuel_rates_override["air"] if service in AIR_SERVICES else fuel_rates_override["ground"]
        else:
            fuel_surcharge_rate = get_fuel_surcharge_rate(service)
        fuel_surcharge = net_transportation_charge * fuel_surcharge_rate * (1 - discounts["fuelSurcharge"])

    # Residential surcharge
    sb_res = ACCESSORIALS["smallBusiness"]["residentialSurcharge"]
    if is_sb:
        res_list_rate = sb_res["air"] if service in AIR_SERVICES else sb_res["ground"]
        residential_surcharge = res_list_rate if residential else 0.0
    else:
        res_list_rate = (
            ACCESSORIALS["residentialSurcharge"]["air"]
            if service in AIR_SERVICES
            else ACCESSORIALS["residentialSurcharge"]["ground"]
        )
        residential_surcharge = res_list_rate * (1 - discounts["residential"]) if residential else 0.0

    # Base zone for tiered accessorials
    bz = base_zone(zone, service)

    # Large Package Surcharge (waived for SB)
    lp_triggered = (not is_sb) and (is_large_package(dims) if dims else False)
    if lp_triggered:
        lp_tiers = (
            ACCESSORIALS["largePackageSurcharge"]["residential"]
            if residential
            else ACCESSORIALS["largePackageSurcharge"]["commercial"]
        )
        lp_list_rate = tiered_rate(lp_tiers, bz)
        large_package_surcharge = lp_list_rate * (1 - discounts["largePackage"])
    else:
        large_package_surcharge = 0.0

    # Additional Handling (waived for SB; skipped when large package applies)
    if (not is_sb) and (not lp_triggered):
        ah_trigger = additional_handling_trigger(weight_lbs, dims, non_standard)
    else:
        ah_trigger = None

    if ah_trigger:
        ah_list_rate = tiered_rate(ACCESSORIALS["additionalHandling"][ah_trigger], bz)
        additional_handling_surcharge = ah_list_rate * (1 - discounts["additionalHandling"])
    else:
        additional_handling_surcharge = 0.0

    # DAS (waived for SB)
    das_t = None if is_sb else das_type(dest_zip)
    das_surcharge = 0.0
    if (not is_sb) and das_t:
        svc_group = "air" if service in AIR_SERVICES else "ground"
        cust_group = "Residential" if residential else "Commercial"
        ext_suffix = "Extended" if das_t == "extended" else ""
        das_key = f"{svc_group}{cust_group}{ext_suffix}"
        das_list_rate = ACCESSORIALS["deliveryAreaSurcharge"][das_key]
        das_surcharge = das_list_rate * (1 - discounts["das"])

    # Remote area surcharge
    ra_type = remote_area_type(dest_zip)
    remote_area_surcharge = 0.0
    if ra_type:
        waived = is_sb and ra_type == "us48"
        if not waived:
            ra_list_rate = ACCESSORIALS["remoteAreaSurcharge"][ra_type]
            remote_area_surcharge = ra_list_rate if is_sb else ra_list_rate * (1 - discounts["das"])

    # Declared value
    dv_raw = declared_value_charge(
        declared_value_dollars,
        ACCESSORIALS["declaredValue"]["ratePerHundred"],
        ACCESSORIALS["declaredValue"]["minimum"],
    )
    declared_value_charge_amount = dv_raw * (1 - discounts["declaredValue"])

    # Address correction (waived for SB)
    if (not is_sb) and address_correction:
        ac_list_rate = ACCESSORIALS["addressCorrection"]["ground"]
        address_correction_charge = ac_list_rate * (1 - discounts["addressCorrection"])
    else:
        address_correction_charge = 0.0

    total = (
        net_transportation_charge
        + fuel_surcharge
        + residential_surcharge
        + das_surcharge
        + large_package_surcharge
        + additional_handling_surcharge
        + remote_area_surcharge
        + declared_value_charge_amount
        + address_correction_charge
    )

    return {
        "ok": True,
        "breakdown": {
            "rateType": rate_type,
            "service": service,
            "actualWeightLbs": weight_lbs,
            "dimWeightLbs": dim_weight_lbs,
            "billableWeightLbs": billable_weight_lbs,
            "billableWeightSource": billable_weight_source,
            "zone": zone,
            "publishedRate": published_rate,
            "contractDiscounts": discounts,
            "netTransportationCharge": net_transportation_charge,
            "fuelSurchargeRate": fuel_surcharge_rate,
            "fuelSurcharge": fuel_surcharge,
            "residentialSurcharge": residential_surcharge,
            "dasSurchargeType": das_t,
            "dasSurcharge": das_surcharge,
            "largePackageSurcharge": large_package_surcharge,
            "additionalHandlingTrigger": ah_trigger,
            "additionalHandlingSurcharge": additional_handling_surcharge,
            "remoteAreaType": ra_type,
            "remoteAreaSurcharge": remote_area_surcharge,
            "declaredValueCharge": declared_value_charge_amount,
            "addressCorrectionCharge": address_correction_charge,
            "totalEstimatedCharge": total,
        },
    }


def calc_fedex_dim_weight(dims: dict) -> int:
    vol = dims["length"] * dims["width"] * dims["height"]
    return math.ceil(vol / FEDEX_DIM_DIVISOR)


def get_fedex_published_rate(service: str, billable_weight: int, zone: int) -> float | None:
    svc = FEDEX_RATES.get(service)
    if not svc:
        return None
    return svc.get(str(billable_weight), {}).get(str(zone))


def max_fedex_available_weight(service: str) -> int:
    svc = FEDEX_RATES.get(service, {})
    if not svc:
        return 0
    return max(int(k) for k in svc)


def get_fedex_fuel_surcharge_rate(service: str) -> float:
    latest = FEDEX_FUEL_HISTORY[0]
    return latest["express"] if service in FEDEX_EXPRESS_SERVICES else latest["ground"]


def fedex_das_type(dest_zip: str) -> str | None:
    kind = FEDEX_ZIP_SURCHARGES.get(dest_zip)
    if kind == "das_standard":
        return "standard"
    if kind == "das_extended":
        return "extended"
    if kind == "das_remote":
        return "remote"
    return None


def fedex_base_zone(zone: int) -> int:
    if 2 <= zone <= 8:
        return zone
    return 8


def fedex_is_oversize(dims: dict, weight_lbs: float) -> bool:
    sides = sorted([dims["length"], dims["width"], dims["height"]], reverse=True)
    l, w, h = sides
    return weight_lbs > 150 or l > 96 or (l + 2 * (w + h)) > 130


def fedex_additional_handling_trigger(weight_lbs: float, dims: dict | None, non_standard: bool) -> str | None:
    if weight_lbs > 50:
        return "weight"
    if dims:
        sides = sorted([dims["length"], dims["width"], dims["height"]], reverse=True)
        longest, second = sides[0], sides[1]
        if longest > 48 or second > 30:
            return "dimensions"
    if non_standard:
        return "packaging"
    return None


def fedex_declared_value_charge(declared_dollars: float) -> float:
    if declared_dollars <= 0:
        return 0.0
    dv = FEDEX_ACCESSORIALS["declaredValue"]
    if declared_dollars <= dv["minimumBandMax"]:
        return dv["minimumCharge"]
    return (declared_dollars / 100) * dv["ratePerHundred"]


def estimate_fedex(inp: dict) -> dict:
    weight_lbs: float = inp["weightLbs"]
    dest_zip: str = str(inp["destinationZip"]).zfill(5)
    service: str = inp["service"]
    residential: bool = bool(inp.get("residential", False))
    dims: dict | None = inp.get("dimensionsIn")
    non_standard: bool = bool(inp.get("nonStandardPackaging", False))
    declared_value_dollars: float = float(inp.get("declaredValueDollars", 0))
    address_correction: bool = bool(inp.get("addressCorrection", False))
    zone_chart_prefix: str = str(inp["zoneChartPrefix"])
    discounts_raw: dict | None = inp.get("contractDiscounts")
    fuel_rates_override: dict | None = inp.get("fuelSurchargeRates")

    if service == "ground" and residential:
        service = "home_delivery"

    if weight_lbs <= 0:
        return {"ok": False, "error": "Weight must be greater than 0."}

    dim_weight_lbs = calc_fedex_dim_weight(dims) if dims else None
    if dim_weight_lbs is not None:
        billable_weight_lbs, billable_weight_source = calc_billable_weight(weight_lbs, dim_weight_lbs)
    else:
        billable_weight_lbs = math.ceil(weight_lbs)
        billable_weight_source = "actual"

    max_wt = max_fedex_available_weight(service)
    if billable_weight_lbs > max_wt:
        return {
            "ok": False,
            "error": f"Billable weight {billable_weight_lbs} lbs exceeds maximum ({max_wt} lbs) for this service.",
        }

    chart = load_fedex_zone_chart(zone_chart_prefix)
    zone = lookup_zone(chart, dest_zip, service)
    if zone is None:
        return {"ok": False, "error": f"Service not available or zone not found for destination ZIP {dest_zip}."}

    published_rate = get_fedex_published_rate(service, billable_weight_lbs, zone)
    if published_rate is None:
        return {"ok": False, "error": f"No published rate found for zone {zone} at {billable_weight_lbs} lbs."}

    discounts = resolve_discounts(discounts_raw or {})
    net_transportation_charge = published_rate * (1 - discounts["transportation"])

    if fuel_rates_override:
        fuel_surcharge_rate = (
            fuel_rates_override["express"]
            if service in FEDEX_EXPRESS_SERVICES
            else fuel_rates_override["ground"]
        )
    else:
        fuel_surcharge_rate = get_fedex_fuel_surcharge_rate(service)
    fuel_surcharge = net_transportation_charge * fuel_surcharge_rate * (1 - discounts["fuelSurcharge"])

    home_delivery_surcharge = 0.0
    if service == "home_delivery":
        home_delivery_surcharge = (
            FEDEX_ACCESSORIALS["homeDeliveryResidentialSurcharge"] * (1 - discounts["residential"])
        )

    residential_surcharge = 0.0
    if service != "home_delivery" and residential and service in FEDEX_EXPRESS_SERVICES:
        residential_surcharge = (
            FEDEX_ACCESSORIALS["residentialSurcharge"]["express"] * (1 - discounts["residential"])
        )

    oversize_triggered = fedex_is_oversize(dims, weight_lbs) if dims else False
    bz = fedex_base_zone(zone)
    oversize_surcharge = 0.0
    if oversize_triggered:
        oversize_surcharge = (
            tiered_rate(FEDEX_ACCESSORIALS["oversizeCharge"], bz) * (1 - discounts["largePackage"])
        )

    ah_trigger = None if oversize_triggered else fedex_additional_handling_trigger(weight_lbs, dims, non_standard)
    additional_handling_surcharge = 0.0
    if ah_trigger:
        additional_handling_surcharge = (
            tiered_rate(FEDEX_ACCESSORIALS["additionalHandling"][ah_trigger], bz)
            * (1 - discounts["additionalHandling"])
        )

    das_t = fedex_das_type(dest_zip)
    das_surcharge = 0.0
    if das_t:
        svc_group = "express" if service in FEDEX_EXPRESS_SERVICES else "ground"
        cust_group = "Residential" if (residential or service == "home_delivery") else "Commercial"
        if das_t == "remote":
            das_key = f"remote{cust_group}"
        else:
            ext_suffix = "Extended" if das_t == "extended" else ""
            das_key = f"{svc_group}{cust_group}{ext_suffix}"
        das_list_rate = FEDEX_ACCESSORIALS["deliveryAreaSurcharge"][das_key]
        das_surcharge = das_list_rate * (1 - discounts["das"])

    dv_raw = fedex_declared_value_charge(declared_value_dollars)
    declared_value_charge_amount = dv_raw * (1 - discounts["declaredValue"])

    address_correction_charge = (
        FEDEX_ACCESSORIALS["addressCorrection"] * (1 - discounts["addressCorrection"])
        if address_correction else 0.0
    )

    total = (
        net_transportation_charge
        + fuel_surcharge
        + home_delivery_surcharge
        + residential_surcharge
        + das_surcharge
        + oversize_surcharge
        + additional_handling_surcharge
        + declared_value_charge_amount
        + address_correction_charge
    )

    return {
        "ok": True,
        "breakdown": {
            "carrier": "fedex",
            "service": service,
            "actualWeightLbs": weight_lbs,
            "dimWeightLbs": dim_weight_lbs,
            "billableWeightLbs": billable_weight_lbs,
            "billableWeightSource": billable_weight_source,
            "zone": zone,
            "publishedRate": published_rate,
            "contractDiscounts": discounts,
            "netTransportationCharge": net_transportation_charge,
            "fuelSurchargeRate": fuel_surcharge_rate,
            "fuelSurcharge": fuel_surcharge,
            "homeDeliverySurcharge": home_delivery_surcharge,
            "residentialSurcharge": residential_surcharge,
            "dasSurchargeType": das_t,
            "dasSurcharge": das_surcharge,
            "oversizeSurcharge": oversize_surcharge,
            "additionalHandlingTrigger": ah_trigger,
            "additionalHandlingSurcharge": additional_handling_surcharge,
            "declaredValueCharge": declared_value_charge_amount,
            "addressCorrectionCharge": address_correction_charge,
            "totalEstimatedCharge": total,
        },
    }

# ---------------------------------------------------------------------------
# Comparison and reporting
# ---------------------------------------------------------------------------

NUMERIC_FIELDS = [
    "publishedRate",
    "netTransportationCharge",
    "fuelSurcharge",
    "residentialSurcharge",
    "dasSurcharge",
    "largePackageSurcharge",
    "additionalHandlingSurcharge",
    "remoteAreaSurcharge",
    "declaredValueCharge",
    "addressCorrectionCharge",
    "totalEstimatedCharge",
]


def compare_case(label: str, inp: dict, tool_result: dict, tolerance: float, markup_pct: float = 0.0, expect_error: bool = False) -> bool:
    carrier = inp.get("carrier", "ups")
    result = estimate_fedex(inp) if carrier == "fedex" else estimate_ups(inp)
    print(f"\n{'='*70}")
    print(f"  {label}")
    print(f"{'='*70}")

    if expect_error:
        if not result["ok"]:
            print(f"  Python correctly returned error: {result['error']}")
            print("  RESULT: PASS (expected error)")
            return True
        else:
            print(f"  Expected an error but Python returned a result (total=${result['breakdown']['totalEstimatedCharge']:.2f})")
            print("  RESULT: FAIL")
            return False

    if not result["ok"]:
        print(f"  PYTHON ERROR: {result['error']}")
        if "totalEstimatedCharge" in tool_result:
            print(f"  TOOL SHOWED:  ${tool_result['totalEstimatedCharge']:.2f}")
        print("  RESULT: FAIL (estimator returned an error)")
        return False

    bd = result["breakdown"]
    rate_type_note = f"  RateType={bd['rateType']}" if "rateType" in bd else ""
    print(
        f"  Service={bd['service']}  Zone={bd['zone']}  "
        f"Billable={bd['billableWeightLbs']} lbs ({bd['billableWeightSource']})"
        f"{rate_type_note}"
    )
    if markup_pct:
        print(f"  Note: tool also shows Markup {markup_pct}% (client billing only — not in estimated total)")
    print()

    # Markup % is client-facing billing context only; the tool's Estimated Total is always pre-markup
    adjusted_tool = dict(tool_result)

    all_pass = True
    # Check every field that appears in tool_result
    fields_to_check = [f for f in NUMERIC_FIELDS if f in adjusted_tool]
    if not fields_to_check:
        print("  WARNING: tool_result has no recognisable fields to compare.")
        return False

    col_w = 34
    print(f"  {'Field':<{col_w}} {'Tool':>10}  {'Python':>10}  {'Diff':>8}  Status")
    print(f"  {'-'*col_w} {'-'*10}  {'-'*10}  {'-'*8}  ------")

    for field in fields_to_check:
        tool_val = float(adjusted_tool[field])
        py_val = bd.get(field, 0.0) or 0.0
        diff = abs(py_val - tool_val)
        ok = diff <= tolerance
        status = "PASS" if ok else "FAIL ⚠"
        print(f"  {field:<{col_w}} ${tool_val:>9.2f}  ${py_val:>9.2f}  ${diff:>7.2f}  {status}")
        if not ok:
            all_pass = False

    # Print Python-only fields for context (not compared)
    extra = [f for f in NUMERIC_FIELDS if f not in adjusted_tool]
    if extra:
        print()
        print("  (Python-only, not in tool_result — for reference)")
        for field in extra:
            py_val = bd.get(field, 0.0) or 0.0
            if py_val != 0.0:
                print(f"  {field:<{col_w}} {'':>10}  ${py_val:>9.2f}")

    print()
    print(f"  RESULT: {'PASS' if all_pass else 'FAIL'}")
    return all_pass


def run(tests_path: Path, tolerance: float) -> None:
    with open(tests_path) as f:
        cases: list[dict] = json.load(f)

    print(f"\nPricing Tool Cross-Validator ({'FedEx + UPS' if 'fedex' in tests_path.name else 'UPS'})")
    print(f"Data:      {DATA_DIR}")
    print(f"Tests:     {tests_path}  ({len(cases)} case{'s' if len(cases) != 1 else ''})")
    print(f"Tolerance: ±${tolerance:.2f}")

    passed = 0
    failed = 0
    for case in cases:
        ok = compare_case(
            label=case.get("label", "(unlabelled)"),
            inp=case["input"],
            tool_result=case.get("tool_result", {}),
            tolerance=tolerance,
            markup_pct=float(case.get("markupPct", 0)),
            expect_error=bool(case.get("expectError", False)),
        )
        if ok:
            passed += 1
        else:
            failed += 1

    print(f"\n{'='*70}")
    print(f"  Summary: {passed} passed, {failed} failed  ({passed + failed} total)")
    print(f"{'='*70}\n")

    if failed:
        sys.exit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Compare pricing tool results against Python estimator.")
    parser.add_argument(
        "--tests",
        default=str(Path(__file__).parent / "pricing_test_cases.json"),
        help="Path to JSON test cases file (default: scripts/pricing_test_cases.json)",
    )
    parser.add_argument(
        "--tolerance",
        type=float,
        default=0.01,
        help="Max allowed $ difference per field (default: 0.01)",
    )
    args = parser.parse_args()
    run(Path(args.tests), args.tolerance)
