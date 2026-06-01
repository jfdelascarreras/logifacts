# Pricing Data — Sources

All JSON files in `lib/pricing/data/` are derived from the official UPS publications listed here.
Keep original source documents in this folder so future updates can be traced to the raw material.

---

## Source documents

| Document | Covers | Used to build |
|---|---|---|
| `preview-accessorial-us-en.pdf` | 2026 UPS Value-Added Services & Other Charges (eff. 2025-12-22) | `accessorials.json` |
| `daily-rates-us-en.xlsx` (in `Invoices skills/ups-plan-invoice-csv/`) | 2026 UPS Daily Rates by service/weight/zone | `ups-rates.json` |
| UPS Zone Advisor XLS exports (in `ups_zone_charts/`) | Origin ZIP prefix → destination zone per service | `zone-charts/*.json` |
| UPS DAS + Remote Area ZIP list (provided externally) | ZIP-level DAS type and remote area classification | `zip-surcharges.json` |
| UPS weekly fuel surcharge index (manual entry) | Weekly domestic ground and air fuel surcharge rates | `ups-fuel-surcharge-history.json` |

---

## Data files

### `accessorials.json`
- **Source:** `preview-accessorial-us-en.pdf`
- **Effective date:** 2025-12-22 (2026 rates)
- **Contains:** residential surcharge, address correction, DAS rates (8 combinations),
  large package surcharge (zone-tiered), additional handling (zone-tiered),
  remote area surcharge (Alaska/Hawaii/US-48), declared value, Saturday delivery (TODO)

### `ups-rates.json`
- **Source:** `daily-rates-us-en.xlsx` → `scripts/convert-ups-data.ts`
- **Effective date:** 2025-12-22
- **Contains:** transportation rates for ground, 3day, 2day, 2day_am, nda_saver, nda.
  Weights 1–150 lb. Zones 2–8 plus territory zones 44/45/46.

### `zone-charts/{prefix}.json` (902 files) + `_manifest.json`
- **Source:** `ups_zone_charts/*.xls` → `scripts/convert-ups-data.ts`
- **Contains:** per-origin-prefix lookup table of dest ZIP prefix → zone per service.
  Alaska and Hawaii territory zones are hardcoded (UPS Zone Advisor lists them as
  individual 5-digit ZIP footnotes rather than 3-digit prefix rows).

### `ups-fuel-surcharge-history.json`
- **Source:** UPS weekly fuel surcharge index — manually updated each week
- **Contains:** rolling history of `{ weekOf, domesticGround, domesticAir }`.
  The first entry (most recent) is used in live calculations.
- **Current rate (2026-05-25):** 27.5% ground, 31.25% air

### `zip-surcharges.json`
- **Source:** UPS DAS and Remote Area ZIP list
- **Contains:** 25,782 entries mapping 5-digit ZIP → surcharge type:
  `das_standard` | `das_extended` | `remote_alaska` | `remote_hawaii` | `remote_us48`
- **Note:** A ZIP is either DAS or remote, never both. ZIPs absent from the file carry no surcharge.
