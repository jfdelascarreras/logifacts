# UPS Pricing Data — Sources

All UPS JSON files (`accessorials.json`, `ups-rates.json`, `zone-charts/`, `zip-surcharges.json`, `ups-fuel-surcharge-history.json`) are derived from **UPS publications only**. FedEx files live in [`../fedex/`](../fedex/) — never store FedEx documents here.

---

## Source documents

| Document | Location | Used to build |
|---|---|---|
| `preview-accessorial-us-en.pdf` | `sources/preview-accessorial-us-en.pdf` (when present) | `accessorials.json` |
| `daily-rates-us-en.xlsx` | `Invoices skills/ups-plan-invoice-csv/` | `ups-rates.json` |
| UPS Zone Advisor XLS exports | `ups_zone_charts/` (repo root or path in convert script) | `zone-charts/*.json` |
| UPS DAS + Remote Area ZIP list | Provided externally | `zip-surcharges.json` |
| UPS weekly fuel surcharge index | Manual entry | `ups-fuel-surcharge-history.json` |

**Effective date (2026 list rates):** 2025-12-22

---

## Regenerate

```bash
pnpm dlx tsx scripts/convert-ups-data.ts
```

---

## Generated data files

### `accessorials.json`
- **Source:** `preview-accessorial-us-en.pdf`
- **Contains:** residential surcharge, address correction, DAS (8 combinations), large package (zone-tiered), additional handling (zone-tiered), remote area, declared value

### `ups-rates.json`
- **Source:** `daily-rates-us-en.xlsx`
- **Contains:** transportation rates for ground, 3day, 2day, 2day_am, nda_saver, nda (weights 1–150 lb, zones 2–8 + territory 44/45/46)

### `zone-charts/{prefix}.json`
- **Source:** UPS Zone Advisor `*.xls` exports
- **Contains:** origin prefix → destination prefix → zone per service

### `zip-surcharges.json`
- **Source:** UPS DAS and Remote Area ZIP list
- **Contains:** ZIP → `das_standard` | `das_extended` | `remote_alaska` | `remote_hawaii` | `remote_us48`

### `ups-fuel-surcharge-history.json`
- **Source:** UPS weekly fuel index (manual)
- **Contains:** rolling `{ weekOf, domesticGround, domesticAir }` — first entry used in live calculations
