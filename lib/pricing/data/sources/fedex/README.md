# FedEx Pricing Data — Sources

All FedEx JSON files (`fedex-rates.json`, `fedex-accessorials.json`, `fedex-zone-charts/`, `fedex-zip-surcharges.json`, `fedex-fuel-surcharge-history.json`) trace to **FedEx publications in this folder**. UPS source documents live in [`../ups/`](../ups/) — never store UPS files here.

---

## FedEx source documents (this folder)

| Document | Covers | Used to build |
|---|---|---|
| `FedEx_Standard_List_Rates_2026.pdf` | 2026 list transportation rates (Ground/HD + Express by zone) | `fedex-rates.json` |
| `Service_Guide_2026.pdf` | Full 2026 Service Guide — accessorial tables, terms, oversize tiers | `fedex-accessorials.json` (primary) |
| `surcharge_and_fee_changes_2026.pdf` | 2025→2026 surcharge change sheet | `fedex-accessorials.json` (cross-check) |
| `fedex_zones_COMPLETE.csv` | Origin/dest ZIP ranges → Express + Ground zones | `fedex-zone-charts/*.json` |
| `DAS_Contiguous_Extended_Remote_Alaska_Hawaii_2025.txt` or `.pdf` | FedEx DAS ZIP tiers (standard / extended / remote) | `fedex-zip-surcharges.json` (base list) |
| `DAS_Zip_Code_Changes_2025.pdf` | FedEx DAS ZIP add/move/remove deltas | `fedex-zip-surcharges.json` (overlay) |
| `High_Cost_Service_Area_ZIPs_preview.pdf` | FedEx Freight (FXF) high-cost ZIP tiers — **not parcel DAS** | Reference only (not used in parcel calculator) |
| FedEx weekly fuel index | Ground + Express fuel surcharge | `fedex-fuel-surcharge-history.json` (manual) |

**Effective date:** 2026-01-05 (list rates updated 2026-06-01 per Standard List Rates PDF)

---

## Regenerate

```bash
pnpm dlx tsx scripts/convert-fedex-data.ts
# or
python3 scripts/convert_fedex_data.py
```

Requires `pdftotext` (Poppler): `brew install poppler`

---

## Generated data files

### `fedex-rates.json`
- **Source:** `FedEx_Standard_List_Rates_2026.pdf`
- **Services:** `ground`, `home_delivery`, `express_saver`, `2day`, `standard_overnight`, `priority_overnight`
- **Shape:** `service → weightLb → zone → rate ($)`

### `fedex-accessorials.json`
- **Source:** `Service_Guide_2026.pdf` + `surcharge_and_fee_changes_2026.pdf`
- **Contains:** HD residential ($6.45), Express residential ($6.95), DAS tiers, zone-tiered additional handling, zone-tiered oversize, declared value, address correction

### `fedex-zone-charts/{prefix}.json`
- **Source:** `fedex_zones_COMPLETE.csv`
- **Shape:** `destPrefix → { ground, home_delivery, express_saver, 2day, standard_overnight, priority_overnight }`
- **Note:** Express services use `fedex_express_zone`; Ground/HD use `fedex_ground_zone` from the CSV

### `fedex-zip-surcharges.json`
- **Source:** `DAS_Contiguous_Extended_Remote_Alaska_Hawaii_2025.txt` (or official PDF) + `DAS_Zip_Code_Changes_2025.pdf`
- **Types:** `das_standard`, `das_extended`, `das_remote`
- **Note:** Alaska / Hawaii / intra-Hawaii ZIP sections map to `das_remote` for parcel rating (territory remote tier)
