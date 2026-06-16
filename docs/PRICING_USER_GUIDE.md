# UPS Rate Calculator — User Guide

> **Updated:** The live app at `/pricing` is the **multi-carrier Shipment Calculator** (UPS + FedEx). For the current user guide — including how contract discounts appear in results — see **[SHIPMENT_CALCULATOR_USER_GUIDE.md](./SHIPMENT_CALCULATOR_USER_GUIDE.md)**.

Use the calculator at `/pricing` to get an estimated shipping cost before you hand a shipment to UPS. It reflects your negotiated contract rates, the current weekly fuel surcharge, and any accessorial charges that apply to the destination ZIP.

---

## Before you start

Two things live in **My Profile → Settings** and are applied automatically every time you run a quote:

| Setting | Where it comes from | What it does |
|---|---|---|
| **Origin ZIP** | My Profile → origin zip | Pre-fills the "Origin ZIP" field. Every quote uses this as the ship-from location unless you override it per-query. |
| **Contract Discounts** | My Profile → Contract Discounts | Per-charge discounts (transportation, fuel, residential, etc.) that UPS applied in your contract negotiation. Set once; applied to every estimate. |

If your origin ZIP is missing, the calculator will ask you to add it before it can run.

---

## Input fields

### Actual Weight (lbs)
The physical weight of the package as it sits on the scale. Enter the real weight — the calculator will determine whether actual or DIM weight governs. Do not pre-round.

### Origin ZIP
Your 5-digit shipping origin. Pre-filled from your profile. Override here if you are quoting a one-off shipment from a different location — it does not change your profile default.

### Destination ZIP
The 5-digit destination ZIP code. Used for two things: zone lookup (which determines the base rate) and ZIP-level surcharge lookup (DAS and remote area checks).

### Dimensions — L × W × H (inches)
Optional. Enter all three only if you have the package dimensions. When provided:
- The DIM weight is calculated and compared against actual weight — the higher of the two becomes the billable weight.
- The large package and additional handling thresholds are checked.

Leave blank only for lightweight envelopes or small items where DIM weight clearly will not govern and the package meets no dimensional thresholds.

### Rate Program
Two options:

| Option | What it means |
|---|---|
| **Daily Rates** | Your negotiated contract (contract D001207201). Applies all contract discounts, fuel surcharge, and accessorials. Use this for your standard shipments. |
| **Small Business** | UPS Small Business program rates. Pre-negotiated flat rates — no fuel surcharge, no DAS, no large package or additional handling charges. Lower residential surcharge ($3.55 ground / $4.00 air). Use this when quoting a shipment that will be billed under the SB account. |

### Service
The UPS service level:

| Service | Typical transit |
|---|---|
| UPS Ground | 1–5 business days by zone |
| UPS 3 Day Select | 3 business days |
| UPS 2nd Day Air | 2 business days |
| UPS 2nd Day Air A.M. | 2 business days, delivered by 10:30 AM |
| UPS Next Day Air Saver | Next business day, afternoon |
| UPS Next Day Air | Next business day, by 10:30 AM |

The zone for air services is encoded differently from Ground (e.g. zone 5 Ground = 5, zone 5 NDA = 105). The calculator handles this automatically.

### Delivery Type
**Commercial** — delivery to a business address (office, warehouse, retail).  
**Residential** — delivery to a home address. Adds the residential surcharge and changes the DAS rate key if the destination ZIP is a DAS zone.

When in doubt: UPS determines this at delivery time, not at label creation. Use Residential if there is any chance the address is residential to avoid a surprise charge on the invoice.

### Non-standard packaging
Check this if the package uses non-rigid, irregular, or problematic packaging:
- Poly bags, tote bags, shrink wrap
- Tires (not on a rim)
- Loose or unstable items not in a box

This triggers the **Additional Handling — Packaging** surcharge unless the package already qualifies for the Large Package Surcharge (which takes precedence).

### Address Correction
Check this only if you already know UPS corrected the address on a previous shipment to this recipient and you expect the same correction charge on the invoice. This is a post-delivery charge — it does not affect whether the package ships. Leave unchecked for standard estimates.

### Declared Value
Optional. Enter the item value in dollars if you want UPS declared value coverage above the standard $100.
- Rate: $1.70 per $100 of declared value
- Minimum charge: $5.11
- Leave blank (or enter 0) for no coverage beyond the standard limit.

### Mark Up
Optional. Enter the percentage margin you want to add on top of your UPS cost when billing the client. For example, entering `15` means you bill the client at your cost + 15%.

The customer price appears in a separate section below the cost breakdown — it does not affect the UPS cost estimate.

---

## Reading the results

### Estimated Total
The total amount you expect to see on your UPS invoice for this shipment. This is what UPS will charge you.

### Billable Weight
- **Actual governs:** The scale weight (rounded up to the next pound) was higher than DIM weight.
- **DIM governs:** The calculated DIM weight was higher than actual — UPS will charge based on the package volume, not the physical weight.

### Cost Breakdown
Shows every charge that makes up the total:

| Line | What it is |
|---|---|
| Published List Rate | UPS's 2026 standard daily rate for that service, zone, and billable weight |
| Contract Discount | Your negotiated transportation discount, applied as a percentage off the list rate |
| Net Transportation Charge | List rate after your discount |
| Fuel Surcharge | Current weekly rate applied to net TC after fuel discount. On first estimate after cache expiry, the API scrapes UPS and stores the rate in Redis (7-day TTL). |
| Residential Surcharge | Flat charge for residential delivery, after your residential discount |
| DAS (Delivery Area Surcharge) | Applied when the destination ZIP is in a UPS-designated rural or extended area |
| Large Package Surcharge | Triggered when the package exceeds 96" on the longest side or 130" in combined girth |
| Additional Handling | Triggered by weight (>70 lb), dimensions (longest side >48" or second side >30"), or non-standard packaging |
| Remote Area Surcharge | Applied for Alaska, Hawaii, and select remote contiguous-US ZIPs |
| Declared Value | Charge for the coverage amount you specified |
| Address Correction | Estimated post-delivery charge if the address needs correction |
| **Total Est. Invoice Charge** | Sum of all lines above |

### Bill to Client (Mark Up)
If you entered a Mark Up %, this section shows:
- **Your Cost (UPS)** — the estimate total from above
- **Mark Up** — the dollar amount added at your specified margin
- **Bill to Client** — the price to quote the customer

> Example: Your UPS cost = $42.18, Mark Up = 15% → Mark Up amount = $6.33 → Bill to Client = **$48.51**

### Contract Accessorial Rates (reference)
A quick reference for UPS **list rates** from `accessorials.json`. Your profile contract discounts apply in the estimate breakdown — these reference lines show published list rates only.

---

## What the estimate does not include

| Not included | Why |
|---|---|
| Quarterly rebate (3%) | Applied by UPS at the account level quarterly — not predictable per shipment |
| Saturday / extended delivery | Not yet implemented; add to estimate manually if applicable |
| Exact fuel surcharge at invoice time | The estimate uses the most recent weekly rate — warmed from UPS on cache miss, otherwise from `ups-fuel-surcharge-history.json`. Actual invoice fuel rate is whatever UPS publishes on the Monday of the pickup week. |
| Duty and brokerage fees | US domestic only — no international charges |

All displayed numbers are labeled **Estimate**. Actual invoice charges may differ.

---

## Common scenarios

### Quoting a large Ground shipment
1. Enter weight and dimensions (required to catch DIM and large-package thresholds).
2. Select Ground.
3. Toggle Residential if going to a home.
4. Leave mark up blank to see your raw cost, or enter your margin to get the client quote in one step.

### Comparing service levels
Run the quote once for each service level (Ground, 3 Day, 2nd Day Air). The zone, fuel rate, and accessorials are recalculated for each service automatically.

### SB program shipment
Switch Rate Program to **Small Business**. The fuel, DAS, large package, and additional handling lines will all zero out. Compare to Daily Rates to see which program is cheaper for that shipment.

### Shipment going to a rural ZIP
Enter the destination ZIP and run the quote. If the ZIP is in the DAS or remote area database, the surcharge will appear in the breakdown automatically. You do not need to know the ZIP classification in advance.
