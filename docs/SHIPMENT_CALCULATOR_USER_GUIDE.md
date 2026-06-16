# LogiFacts Shipment Calculator — User Guide

Use the **Shipment Calculator** at **`/pricing`** to estimate domestic parcel shipping cost before you ship. It models **UPS** and **FedEx** using **2026 published list rates**, your **contract discounts**, the **current weekly fuel index**, and **accessorial charges** (residential, DAS, oversize, declared value, and more).

This is an **estimate**, not a carrier invoice or live API quote. Actual billing can differ if the carrier re-rates the shipment, applies peak surcharges, or corrects address/weight.

For technical calculation detail, see [PRICING_CALCULATION.md](./PRICING_CALCULATION.md) (UPS) and [FEDEX_PRICING_CALCULATION.md](./FEDEX_PRICING_CALCULATION.md) (FedEx).

---

## Before you start — My Profile

Two profile settings apply to **every** quote automatically:

| Setting | Location | What it does |
|---|---|---|
| **Origin ZIP** | My Profile | Pre-fills ship-from ZIP. Used for zone lookup unless you override it on the form. |
| **Contract discounts** | My Profile → UPS Contract Discounts | Percentage discounts from your carrier agreement, applied per charge category (see below). |

If origin ZIP is missing, the calculator will ask you to add it before running a quote.

**Note:** Contract discount fields are shared between UPS and FedEx in the current version. Enter the discounts that match your agreement; leave a field blank if you have no discount for that category.

---

## Using the calculator

### 1. Choose carriers

Toggle **UPS** and/or **FedEx**. You can compare both side-by-side after you run the estimate.

### 2. Enter the lane

| Field | Description |
|---|---|
| **Weight (lbs)** | Actual scale weight. The engine picks billable weight vs dimensional weight when dimensions are provided. |
| **Origin ZIP** | 5-digit ship-from (from profile by default). |
| **Destination ZIP** | 5-digit delivery ZIP — drives zone and DAS/remote lookups. |
| **Dimensions (L × W × H)** | Optional but recommended for DIM weight, large package, oversize, and additional handling checks. |

### 3. Delivery type

**Commercial** or **Residential**.

- **UPS:** Adds residential surcharge when residential is selected.
- **FedEx:** Ground + residential is modeled as **Home Delivery** (separate service/rate).

### 4. Carrier services

Each carrier has its own service picker:

**UPS**

| Service | Typical use |
|---|---|
| UPS Ground | Standard ground by zone |
| UPS 3 Day Select | Three-day |
| UPS 2nd Day Air / 2nd Day Air A.M. | Two-day air |
| UPS Next Day Air Saver / Next Day Air | Overnight |

**Rate program (UPS only)**

| Program | Behavior |
|---|---|
| **Daily** | Full 2026 list rates + fuel + accessorials + your contract discounts |
| **Small Business** | Separate SB rate table; fuel, DAS, large package, additional handling, and address correction are waived; contract discounts do not apply |

**FedEx**

| Service | Notes |
|---|---|
| Ground | Commercial ground |
| Home Delivery | Used automatically when Ground + Residential |
| Express Saver, 2Day, Standard/Priority Overnight | Express services |

### 5. Accessorials & pricing (optional)

| Field | Effect |
|---|---|
| **Non-standard packaging** | Additional handling — packaging trigger |
| **Address correction** | Post-shipment correction charge (if you expect one) |
| **Declared value ($)** | Coverage above standard limits |
| **Mark up (%)** | Client billing margin — **browser only**, not sent to the server |

Click **Get estimate** to run the quote.

---

## Reading the results

Each carrier card shows:

### Header

- **Large total** — estimated invoice charge for that carrier/service
- **Service · Zone · Billable weight · Commercial/Residential**
- **Contract disc.** — your transportation discount % (or N/A for UPS Small Business)
- **Fuel index** — current weekly fuel percentage (or Waived for SB)

### Charge composition

Line-by-line breakdown of how the total was built.

### List-rate reference (expandable)

Published **list** accessorial amounts for reference. Your profile discounts are already applied in the estimate lines above — this section does not show your net rates.

### Comparison strip

When both carriers are selected, a summary row highlights the lower total.

### Methodology panel

Expand **Methodology & accuracy** above the form for data sources, fuel effective dates, and known limitations.

---

## How contract discounts are applied

Discounts are saved in **My Profile → UPS Contract Discounts** as **percentages** (e.g. `56` = 56% off that charge category). Internally they are stored as fractions from **0% to 95%** (maximum 95% discount per field).

They apply **automatically** on every estimate — you do not re-enter them on the calculator form.

### Discount categories

| Profile field | Applies to |
|---|---|
| **Transportation** | Published base transportation rate |
| **Fuel Surcharge** | Fuel surcharge **amount** (not the fuel index %) |
| **Residential** | Residential / Home Delivery surcharge |
| **Delivery Area (DAS)** | DAS surcharge; on UPS, also **remote area** surcharge |
| **Additional Handling** | Additional handling surcharge |
| **Large Package** | UPS large package; FedEx **oversize** |
| **Address Correction** | Address correction charge |
| **Declared Value** | Declared value charge |

Leave a field **blank** if you have no discount for that category (treated as 0%).

### Calculation order (both carriers)

The engine uses the same pattern for each charge line:

1. Look up the **published list rate** (or calculated charge for declared value).
2. Apply the matching **contract discount** for that category.
3. Add the **net line** to the total.

**Transportation**

```
Net transportation = Published list rate × (1 − transportation discount)
```

**Fuel surcharge**

Fuel is a **percentage of net transportation**, then your fuel discount applies to that dollar amount:

```
Fuel surcharge = Net transportation × Fuel index % × (1 − fuel surcharge discount)
```

Example: list rate $100, 56% transportation discount, 27.5% fuel index, 30% fuel discount:

- Net transportation = $100 × (1 − 0.56) = **$44.00**
- Fuel = $44.00 × 0.275 × (1 − 0.30) = **$8.47**

**Accessorials** (residential, DAS, large package/oversize, additional handling, declared value, address correction)

```
Net accessorial = Published accessorial rate × (1 − category discount)
```

**Total estimate**

```
Total = Net transportation
      + Fuel surcharge
      + All net accessorial lines that apply to this shipment
```

UPS **Small Business** skips contract discounts entirely and uses the SB rate table with fuel/DAS/AH/large package/address correction waived (Alaska/Hawaii remote may still apply).

---

## What you see in the output vs what happens internally

The **Charge composition** panel is designed to stay readable. Important detail:

| Line in the UI | What it shows |
|---|---|
| **Published list rate** | Full 2026 list transportation rate (before discount) |
| **Contract discount (X%)** | Transportation discount only — shown as a **negative** dollar amount |
| **Net transportation** | List rate after transportation discount |
| **Fuel surcharge (Y%)** | **Final** fuel dollars (fuel index applied to net TC, **after** your fuel discount) |
| **Residential, DAS, Large Package, etc.** | **Final** net amounts (**after** each category’s discount) |
| **Total estimate** | Sum of all net lines |

So:

- **Transportation** discount is shown explicitly as its own row.
- **All other discounts** (fuel, residential, DAS, handling, etc.) are **already baked into** the dollar amounts on those rows — they are **not** shown as separate “−$X discount” lines.

The header **Contract disc.** pill reflects your **transportation** discount percentage only.

### Worked example (UPS Ground, simplified)

Assume profile discounts: Transportation **56%**, Fuel **30%**, DAS **50%**.  
Shipment: 5 lb, zone 5, DAS ZIP, commercial, fuel index **26.5%**.

| Step | Calculation | Amount |
|---|---|---|
| Published list rate | From 2026 tariff | $18.65 |
| Transportation discount | 56% off list | −$10.44 |
| Net transportation | | **$8.21** |
| Fuel surcharge | $8.21 × 26.5% × (1 − 30%) | **+$1.52** |
| DAS | $4.50 list × (1 − 50%) | **+$2.25** |
| **Total estimate** | | **$11.98** |

On screen you would see list rate, the transportation discount line, net transportation, then fuel and DAS as single positive amounts (already net of fuel and DAS discounts).

---

## Client markup (Bill to client)

**Mark up %** is optional and runs **only in your browser**. It is not stored on the server and does not change the carrier estimate.

When you enter a markup (e.g. **15%**):

```
Markup amount   = Total estimate × (markup % ÷ 100)
Bill to client  = Total estimate + Markup amount
```

Example: Total estimate **$42.18**, markup **15%** → markup **$6.33** → bill to client **$48.51**.

Use this when quoting a customer; the **Total estimate** row remains your expected carrier cost.

---

## Billable weight

When dimensions are provided:

| Carrier | DIM divisor |
|---|---|
| UPS Ground | 220 |
| UPS Air | 194 |
| FedEx (all services) | 139 |

```
Dimensional weight = ceil(L × W × H ÷ divisor)
Billable weight    = max(actual weight, dimensional weight), rounded up
```

The result card shows whether **actual** or **DIM** governs.

---

## What the estimate does not include

| Not included | Why |
|---|---|
| Quarterly rebates / account-level credits | Applied outside individual shipment rating |
| Peak / demand / seasonal surcharges | Not in current model |
| Guaranteed carrier API quote | Uses published tariffs + your profile |
| International, freight, SurePost, SmartPost, One Rate | Domestic parcel only |
| Exact fuel on invoice pickup week | Uses latest weekly index; updates every Monday |

All totals are labeled **estimate**. Validate against carrier tools or invoices for high-stakes quotes.

---

## Common workflows

### Compare UPS vs FedEx on the same lane

1. Enable both carriers.
2. Enter weight, ZIPs, and dimensions.
3. Pick service level for each carrier.
4. Run once — both cards and the comparison strip update together.

### Quote with your contract economics

1. Enter discounts once in **My Profile**.
2. Use **Daily** (UPS) for standard negotiated rating.
3. Read **Net transportation** and accessorial lines — discounts are already applied.

### Quote what you bill a client

1. Run the estimate with your real shipment inputs.
2. Add **Mark up %** in accessorials section.
3. Use **Bill to client** from the result card.

### Rural or residential destination

Enter the destination ZIP and toggle **Residential** if needed. DAS and remote surcharges appear automatically when the ZIP is in the carrier database — no manual classification required.

---

## Related documentation

| Document | Audience |
|---|---|
| [PRICING_ACCURACY.md](./PRICING_ACCURACY.md) | Sources, validation, limitations |
| [PRICING_CALCULATION.md](./PRICING_CALCULATION.md) | UPS calculation math |
| [FEDEX_PRICING_CALCULATION.md](./FEDEX_PRICING_CALCULATION.md) | FedEx calculation math |
| [PRICING_USER_GUIDE.md](./PRICING_USER_GUIDE.md) | Legacy UPS-focused guide (superseded by this document for `/pricing`) |
