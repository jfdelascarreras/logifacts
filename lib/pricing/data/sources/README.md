# Pricing Data — Source Documents

Generated JSON under `lib/pricing/data/` is built from **carrier-specific source packs**. UPS and FedEx are kept in separate folders with separate READMEs — do not mix source files between carriers.

| Carrier | Source folder | README | Generated data prefix |
|---------|---------------|--------|------------------------|
| **UPS** | [`ups/`](./ups/) + files listed in [`ups/README.md`](./ups/README.md) | [`ups/README.md`](./ups/README.md) | `ups-*.json`, `zone-charts/`, `accessorials.json`, `zip-surcharges.json` |
| **FedEx** | [`fedex/`](./fedex/) | [`fedex/README.md`](./fedex/README.md) | `fedex-*.json`, `fedex-zone-charts/` |

## Regenerate

```bash
# UPS
pnpm dlx tsx scripts/convert-ups-data.ts

# FedEx
pnpm dlx tsx scripts/convert-fedex-data.ts
# or: python3 scripts/convert_fedex_data.py
```

## Bootstrap note (FedEx only)

FedEx zone charts and DAS ZIP classification both come from FedEx sources under `sources/fedex/` — not UPS.

## Docs

- UPS calculation: [`docs/UPS_PRICING_CALCULATION.md`](../../../docs/UPS_PRICING_CALCULATION.md) (if present)
- FedEx calculation: [`docs/FEDEX_PRICING_CALCULATION.md`](../../../docs/FEDEX_PRICING_CALCULATION.md)
