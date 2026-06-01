# Pricing Data — Test Inputs

Example payloads for manual testing of `POST /api/pricing/estimate` or `estimateUPS()`.

## Naming convention

```
{carrier}-{scenario}.json
```

Examples: `ups-ground-commercial.json`, `ups-nda-residential-das.json`, `ups-ground-large-package.json`

## Payload shape

```jsonc
{
  "weightLbs": 10,
  "dimensionsIn": { "length": 18, "width": 14, "height": 10 },   // optional
  "originZip": "60169",          // optional — falls back to user profile
  "destinationZip": "10001",
  "service": "ground",           // ground | 3day | 2day | 2day_am | nda_saver | nda
  "residential": false,
  "nonStandardPackaging": false, // optional — triggers packaging-type additional handling
  "declaredValueDollars": 0,     // optional — 0 = no coverage
  "addressCorrection": false,    // optional — include post-shipment correction charge
  "contractDiscounts": {         // optional — overrides profile discounts per field
    "transportation": 0.56,
    "fuelSurcharge": 0.30
  }
}
```

Contract discounts saved in the user's profile are applied automatically.
The `contractDiscounts` body field overrides profile values per-field if provided.
