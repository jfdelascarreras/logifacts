# Lojistic API Documentation

## Overview

The Lojistic API is a RESTful API that provides programmatic access to shipping data within a Lojistic account. It returns JSON-encoded responses and adheres to the [JSON:API specification](https://jsonapi.org). It uses standard HTTP response codes, authentication, and verbs.

**Base URL:** `https://api.lojistic.com/v1`

**Support:** api@lojistic.com

### Key Capabilities
- Pull general account and carrier information
- Retrieve shipping invoices and associated charges in a normalized format
- Programmatically generate and retrieve report data
- Integrate shipping data with third-party software

---

## Authentication

Every request requires the following three HTTP headers:

| Header | Value |
|---|---|
| `Content-Type` | `application/vnd.api+json` |
| `x-api-key-id` | Your API Key ID |
| `x-api-key-password` | Your API Key Password |

API keys are generated from the **API Key Management** interface within the Lojistic platform. The password is only shown once at creation, so store it securely. Keys may be deleted from the same interface and cannot be restored.

A key pair inherits access to all data associated with the Lojistic user account that created it — including any companies and carrier connections added or removed over time.

### Example Request

```bash
curl https://api.lojistic.com/v1/invoices \
  -H "Content-Type: application/vnd.api+json" \
  -H "x-api-key-id: API_KEY_ID" \
  -H "x-api-key-password: API_KEY_PASSWORD"
```

---

## Common Query Parameters

Most list endpoints support the following pagination and sorting parameters:

| Parameter | Required | Default | Description |
|---|---|---|---|
| `page` | No | 1 | Page number to retrieve |
| `page_limit` | No | 100 | Records per page (range: 20–5000) |
| `order_by` | No | `id` | Column to sort by |
| `order_dir` | No | `desc` | Sort direction (`asc` or `desc`) |

---

## Endpoints

### Accounts

Carrier accounts are associated to a user through one or more carrier connections.

**List Accounts**
```
GET /v1/accounts
```

**Show Account**
```
GET /v1/accounts/:id
```

Replace `:id` with a valid account ID.

Example response:
```json
{
  "data": {
    "id": "1",
    "type": "account",
    "attributes": {
      "number": "123",
      "carrier": "ups"
    }
  }
}
```

---

### Companies

A company is the primary entity through which a user's permissions are established. Membership in a company grants access to its carrier connections, associated accounts, invoices, and user list. Company management (users, connections) must be done through the Lojistic platform frontend.

**List Companies**
```
GET /v1/companies
```
Additional parameter: `include` — comma-separated list of relationships to include (`users`, `carrier_connections`).

**Show Company**
```
GET /v1/companies/:id
```

**List Users in a Company**
```
GET /v1/companies/:company_id/users
```

**Show a Specific User**
```
GET /v1/companies/:company_id/users/:id
```

**List Carrier Connections**
```
GET /v1/companies/:company_id/carrier_connections
```

**Show a Carrier Connection**
```
GET /v1/companies/:company_id/carrier_connections/:id
```

---

### Invoices

Invoices are related to a user through their carrier accounts.

**List Invoices**
```
GET /v1/invoices
```

Additional filter parameters:

| Parameter | Description |
|---|---|
| `shipping_mode` | Filter by shipping mode |
| `from_date` | Start date (`yyyy-mm-dd`) |
| `to_date` | End date (`yyyy-mm-dd`) |
| `account_ids[]` | Filter by account IDs |
| `account_numbers[]` | Filter by account numbers |
| `company_ids[]` | Filter by company IDs |

> List parameters use array format: `?company_ids[]=123&company_ids[]=234`

**Show Invoice**
```
GET /v1/invoices/:id
```

Returns the invoice and all associated charges in the same format as the Charge Detail report. Charges are returned via `columns`, `headers`, and `rows` attributes.

Additional parameters:

| Parameter | Default | Description |
|---|---|---|
| `page` | 1 | Page number |
| `page_limit` | 5,000 | Rows per page (range: 500–20,000) |
| `data_version` | v1 | Data version for charges |

> **Note:** All currency values are returned in **pennies** (e.g., `10000` = $100.00).

---

### Shipments

**Show Shipment (by ID)**
```
GET /v1/shipments/:id
```

**Track Shipment (by tracking number)**
```
GET /v1/shipments/track?tracking_number=TRACKING_NUMBER&carrier=CARRIER_CODE
```

| Parameter | Required | Description |
|---|---|---|
| `tracking_number` | Yes | The carrier-assigned tracking number |
| `carrier_code` | Yes | The carrier code (see Carriers section) |

**Response Formats:**
- **Parcel** — includes a `child_packages` array listing package IDs and tracking numbers within a multi-piece shipment.
- **Non-Parcel** — includes `charges` and `event_history` nodes.

Key shipment attributes include: `account_number`, `tracking_number`, `carrier`, `shipping_mode`, `shipped_at`, `delivered_at`, `zone`, `package_type`, dimensions, weights (`actual_weight_lbs`, `billed_weight_lbs`), shipper, shipping address, delivery address, cost summary (`shipment_original_amount`, `shipment_discount_amount`, `shipment_net_amount`), `piece_count`, and up to 8 reference fields.

---

### Packages

*(Parcel shipments only)*

**Show Package (by ID)**
```
GET /v1/packages/:id
```

**Track Package (by tracking number)**
```
GET /v1/packages/track?tracking_number=TRACKING_NUMBER&carrier=CARRIER_CODE
```

| Parameter | Required | Description |
|---|---|---|
| `tracking_number` | Yes | The carrier-assigned tracking number |
| `carrier_code` | Yes | The carrier code (see Carriers section) |

Package responses include all shipment attributes plus:

**`charges` array** — each charge contains: `type`, `description`, `currency`, `invoice_number`, `invoice_date`, `original_amount`, `discount_amount`, `net_amount`, `gl_codes`, `refund`.

**`event_history.package_events` array** — each event contains:
- `location` (city, state, postal, country)
- `event_code` — two-letter carrier-provided status code
- `event_category` — high-level category
- `event_description` — carrier-provided description
- `local_timestamp` and `utc_timestamp`

**Event Code Reference:**

| Code | Description |
|---|---|
| OD | On vehicle for delivery |
| DL | Delivered |
| DP | Departed carrier location |
| OC | Shipment information sent to carrier |
| AR | Arrived at carrier location |
| IP | In carrier possession |
| IT | In transit |
| PU | Picked Up |

**Event Category Reference:**

| Category | Description |
|---|---|
| In Transit | Package is in transit |
| Delivered | Package is delivered |
| Manifest | Package information sent |
| Picked Up | Package picked up |
| Exception | Package returned or not delivered |
| Unspecified | Voided information received |

---

### Reports

Report generation is **asynchronous**. The workflow is:

1. **Create** a report with `POST /v1/reports/:slug`
2. **Poll** its status with `GET /v1/reports/:id`
3. When `status` is `completed`, the data is available in the `rows` attribute

> Concurrent per-account limit: **10 reports processing at a time**. CSV reports have a **1,000,000 row limit**.

**List Reports**
```
GET /v1/reports
```
Returns reports created in the last two weeks.

**Create Report**
```
POST /v1/reports/:slug
```

| Parameter | Default | Description |
|---|---|---|
| `from_date` | 2 weeks ago | Start date (`yyyy-mm-dd`) |
| `to_date` | Today | End date (`yyyy-mm-dd`) |
| `data_version` | v1 | **Always specify this** to ensure consistent output |
| `response_format` | `json` | `json` or `csv` |
| `page_limit` | 300,000 | Rows per page (range: 2,500–500,000; JSON only) |
| `shipping_mode` | null | Filter by shipping mode |
| `surcharge_grouping` | — | `charge_detail` only — filter by charge type |
| `account_ids[]` | All | Filter by account IDs |
| `account_numbers[]` | null | Filter by account numbers |
| `company_ids[]` | All | Filter by company IDs |

**Show Report**
```
GET /v1/reports/:id
GET /v1/reports/:id?page=2
```

| Parameter | Default | Description |
|---|---|---|
| `page` | 1 | Page of the report to retrieve (JSON only) |
| `include_headers_in_rows` | false | Prepend headers array to rows for easy parsing |

**Report statuses:** `pending` → `executing` → `completed` / `error` / `canceled`

---

## Report Slugs & Column Schemas

### `address_correction_detail` *(latest: v5)*
Charges when a carrier had to correct a "Ship To" address.

Key columns: `vendor`, `carrier`, `account_number`, `invoice_number`, `invoice_date`, `tracking_number`, shipper/recipient address fields (original and corrected), `address_correction_fee_amount` (pennies), `currency`, references (1–8), GL codes (1–3), `shipping_mode`, `charge_identifier`

---

### `air_vs_ground_detail` *(latest: v3)*
Highlights air shipments that could have been shipped ground at lower cost and equal or faster delivery.

Key columns: `vendor`, `carrier`, `account_number`, `shipment_tracking_number`, `air_service_used`, `package_count`, `ship_date`, air delivery date/time/cost, ground delivery date/time/cost, `ground_re_rating_method`, `ground_number_days_faster`, `savings_with_ground` (pennies), `currency`, shipper/receiver address fields, references, GL codes, `shipping_mode`

---

### `approved_refund_detail` *(latest: v4)*
Detail for each approved refund Lojistic recovered on your behalf.

Key columns: `vendor`, `carrier`, `account_number`, `original_invoice_number`, `original_invoice_date`, `tracking_number`, `service_description`, `auditor_type`, `approved_refund_amount` (pennies), `currency`, `invoice_number`, `credited_invoice_date`, `refund_confirmation_date`, automation/manual attempt counts and dates, references, GL codes, `fedex_edi_control_number`, `shipping_mode`

---

### `charge_detail` *(latest: v4)*
Line-item detail of every carrier charge. Use this for full spend breakdowns.

Key columns: `vendor`, `carrier`, `account_number`, `invoice_number`, `invoice_amount`, `invoice_date`, `charge_type`, `charge_description`, `original_charge`, `discount`, `net_charge`, `currency`, `shipping_mode`, `tracking_number`, `parent_tracking_number`, service code/level/normalized, container type, `zone`, `ship_date`, `delivery_date`/`time`, weights, dimensions, shipper/receiver address, `bill_option`, `declared_value`, `piece_count`, references, GL codes, `fedex_edi_control_number`, `charge_identifier`

**Surcharge Grouping Filter Options** (use with `surcharge_grouping` param):
`additional_handling`, `address_correction`, `carrier_packaging_supplies`, `charge_on_delivery`, `declared_value`, `delivery_area_surcharge`, `delivery_confirmation`, `fuel`, `hazardous_material_fees`, `large_package`, `late_payment_fees`, `oversize`, `residential`, `saturday`, `signature_required`, and many more.

---

### `denied_refund_detail` *(latest: v3)*
Detail for each denied refund Lojistic attempted to recover.

Key columns: `vendor`, `carrier`, `account_number`, `invoice_number`, `invoice_date`, `tracking_number`, `service_description`, `auditor_type`, `denied_refund_amount` (pennies), `currency`, automation/manual attempt counts, denial reasons and dates, references, GL codes, `shipping_mode`

---

### `invoice_summary` *(latest: v2)*
Summary-level data for all carrier invoices.

Key columns: `vendor`, `account_number`, `shipping_mode`, `invoice_number`, `invoice_date`, `date_of_receipt`, `invoice_type`, `invoice_amount` (pennies), `currency`, `due_date`, `fedex_edi_control_numbers`

---

### `late_payment_fee_detail` *(latest: v3)*
Penalties from carriers for late invoice payments.

Key columns: `vendor`, `carrier`, `account_number`, `original_invoice_number`, `invoice_number`, `invoice_date`, `invoice_amount`, `currency`, `late_payment_fee_amount` (pennies), `charge_description`, references, GL codes, `shipping_mode`, `charge_identifier`

---

### `over_max_detail` *(latest: v4)*
Penalty fees for packages exceeding carrier size/weight limits.

Key columns: `vendor`, `carrier`, `account_number`, `invoice_number`, `invoice_date`, `tracking_number`, `charge_description`, shipper/receiver address fields, `actual_weight_lbs`, `billed_weight_lbs`, dimensions, `charge_amount` (pennies), `currency`, references, GL codes, `shipping_mode`, `charge_identifier`

---

### `package_detail` *(latest: v3)*
One row per package with all charges combined. Run by ship date.

Key columns: `vendor`, `carrier`, `account_number`, `invoice_number`, `invoice_amount`, `invoice_date`, `shipping_mode`, `tracking_number`, `parent_tracking_number`, `original_cost`, `discount`, `net_package_cost`, `currency`, service codes, `zone`, `ship_date`, `delivery_date`/`time`, `delivery_signature`, weights, dimensions, shipper/receiver address, `bill_option`, `declared_value`, references, GL codes, `fedex_edi_control_numbers`

---

### `potential_audit_recovery_detail` *(latest: v3)*
Errors/potential refunds Lojistic has identified.

Key columns: `vendor`, `carrier`, `account_number`, `invoice_number`, `invoice_date`, `ship_date`, `delivery_date`/`time`, `tracking_number`, `service_description`, `auditor_type`, `potential_refund_amount` (pennies), `currency`, references, GL codes, `shipping_mode`

---

### `potential_damaged_and_lost_claims_detail` *(latest: v3)*
Potential damaged or lost packages identified by Lojistic.

Key columns: `vendor`, `carrier`, `account_number`, `invoice_number`, `invoice_date`, `ship_date`, `delivery_date`/`time`, `tracking_number`, `service_description`, `auditor_type`, `potential_refund_amount` (pennies), `currency`, references, GL codes

---

### `shipment_detail` *(latest: v2)*
One row per shipment with all charges combined. Run by ship date.

Key columns: `vendor`, `carrier`, `account_number`, `invoice_number`, `invoice_amount`, `invoice_date`, `shipping_mode`, `shipment_tracking_id`, `original_cost`, `discount`, `net_shipment_cost`, `currency`, service codes/normalized, `zone`, `class`, `miles`, `ship_date`, `delivery_date`/`time`, `delivery_signature`, weights, shipper/receiver address, `bill_option`, `declared_value`, `piece_count`, references, GL codes, `fedex_edi_control_numbers`

---

## Notes on Data

**Currency values** — All monetary amounts are returned in **pennies**. Divide by 100 to get dollar amounts (e.g., `10050` = $100.50).

**Data versions** — Always specify the `data_version` parameter when creating reports to ensure consistent column structure. New versions are released when breaking changes are made (e.g., added/removed/renamed columns). Old versions are supported until formally deprecated.

**Pagination** — All list/report responses include a `links` node with `first`, `prev`, `page`, `next`, and `last` URLs for pagination.

**Array parameters** — Format as repeated keys: `?account_ids[]=123&account_ids[]=456`

---

## Supported Carriers (Selected)

| Name | Code |
|---|---|
| FedEx | `fedex` |
| UPS | `ups` |
| DHL Express | `dhl` |
| USPS | `usps` |
| OnTrac | `on_trac` |
| Stamps.com | `stamps` |
| Endicia | `endicia` |
| Pitney Bowes | `pitney_bowes` |
| Old Dominion | `old_dominion` |
| XPO | `xpo` |
| Estes | `estes` |
| Saia | `saia` |
| DHL eCommerce | `dhl_ecommerce` |
| GlobalPost | `global_post` |
| Purolator | `purolator` |
| ArcBest | `arc_best` |
| Averitt | `averitt` |
| Dayton Freight | `dayton_freight` |
| Estes | `estes` |
| Holland | `holland` |
| JB Hunt | `jb_hunt` |
| Landstar | `landstar` |
| Maersk | `maersk` |
| New Penn | `new_penn` |
| Pitt Ohio Express | `pitt_ohio_express` |
| Reddaway | `reddaway` |
| RL Carriers | `rl_carriers` |
| Roadrunner | `roadrunner_freight` |
| Schneider | `schneider` |
| TForce Freight | `tforce_freight` |
| Werner Enterprises | `werner_enterprises` |
| Yellow | `yellow` |
| YRC Freight | `yrc_freight` |

> The full carrier list includes 150+ carriers. See the official docs at https://api.lojistic.com for the complete carrier_code reference.

---

*Documentation generated from https://api.lojistic.com — Last updated: 5/20/2026*
