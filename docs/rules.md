# Rule format

Every fee is a rule. The Admin page writes rules in this format, and you can write them yourself: set the `FEE_RULES` action input to a JSON array of rules (or `{ "rules": [...] }`) to keep them in version control. When `FEE_RULES` is set, it **overrides** the rules saved in the Admin.

## Examples

A small-order fee of $15 under $250, and a remote-area surcharge for two customer groups:

```json
[
  {
    "code": "small_order_fee",
    "label": "Small order fee",
    "subtotal": { "max": 250 },
    "calc": { "mode": "fixed", "fixed": 15 }
  },
  {
    "code": "remote_area",
    "label": "Remote area delivery",
    "customerGroups": [1, 2],
    "conditions": { "any": [
      { "field": "region", "op": "in", "value": "AK,HI" },
      { "field": "postcode", "op": "starts_with", "value": "996,997" }
    ] },
    "calc": { "mode": "max_of", "fixed": 10, "percent": 2, "max": 60 }
  }
]
```

A handling fee of $2 per unit, counted only on heavy products:

```json
{
  "code": "heavy_handling",
  "label": "Heavy item handling",
  "items": { "field": "weight", "op": "gte", "value": 20 },
  "calc": { "mode": "fixed", "fixed": 2, "applyPer": "unit" }
}
```

A delivery choice the buyer must make, with Standard selected by default:

```json
{
  "code": "delivery",
  "label": "Delivery",
  "type": "required",
  "input": "radio",
  "options": [
    { "code": "standard", "label": "Standard", "default": true, "calc": { "fixed": 0 } },
    { "code": "express", "label": "Express", "calc": { "fixed": 9 } }
  ]
}
```

Optional gift wrap at 3% of the discounted subtotal, at least $4:

```json
{
  "code": "gift_wrap",
  "label": "Gift wrap",
  "description": "Wrapped in recycled paper with a card.",
  "type": "optional",
  "calc": { "mode": "percent", "percent": 3, "min": 4, "base": { "includeDiscount": true } }
}
```

## Fields

| Field | Meaning |
|---|---|
| `code` | Unique key, 1–40 characters of `a-z 0-9 _`. Option fees are charged as `code__option`. |
| `label`, `description` | Shown to the buyer. Options are labelled `Label: Option`. |
| `enabled` | `false` switches the rule off. Default `true`. |
| `sortOrder` | Order of the fee lines. |
| `type` | `automatic` (default: charged when the conditions match), `required` (the buyer must choose an option; the default option applies until they do) or `optional` (charged only when the buyer chooses it). |
| `input` | `checkbox` (default, several choices allowed), `dropdown` or `radio` (one choice). |
| `stores`, `customerGroups` | Store IDs and customer group IDs. Empty means all. |
| `subtotal` | `{ min, max }`. `min` is inclusive and `max` is exclusive. |
| `conditions` | Cart condition tree (see below). |
| `items` | Item condition tree. Only matching lines count for per-item and per-unit fees and for percent bases, and the fee applies only when at least one line matches. |
| `calc` | How much to charge (see below). |
| `options` | `[{ code, label, calc, default }]`. An option's `calc` overrides the rule's `calc`. |

## Calculation

`calc` is `{ mode, fixed, percent, applyPer, base, min, max }`.

| Field | Values |
|---|---|
| `mode` | `fixed` (default), `percent`, `fixed_plus_percent`, or `max_of` (the larger of fixed and percent). |
| `fixed` | Amount in the store's base currency. |
| `percent` | Percent of the base, for example `2.5`. |
| `applyPer` | `order` (default), `item` (each matching line) or `unit` (each matching unit). |
| `base` | `{ includeDiscount, includeShipping }`: what the percent is taken of. Default: the subtotal of the matching lines, before discount, without shipping. |
| `min`, `max` | Caps on the final fee. |

Fees are rounded to two decimals. A fee of zero isn't shown.

## Conditions

Condition trees combine `{ "all": [...] }`, `{ "any": [...] }` and `{ "not": {...} }` around leaves `{ "field", "op", "value" }`.

**Operators:** `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `between` (`"value": [min, max]`), `in`, `nin` (a list, or a comma-separated string), `contains`, `starts_with` (one or more prefixes).

**Cart fields** (`conditions`):

| Field | Meaning |
|---|---|
| `subtotal`, `qty`, `item_count`, `weight` | Cart totals. |
| `country`, `region`, `postcode`, `city` | Shipping address (`region` is the region code, for example `CA`). |
| `shipping_method` | Carrier and method, for example `flatrate_flatrate`. |
| `customer_group`, `customer_is_guest` | The buyer. |
| `store_id` | The store view. |

**Item fields** (`items`):

| Field | Meaning |
|---|---|
| `sku`, `qty`, `price`, `row_total`, `weight` | From the cart line. |
| `category_ids` | Category IDs, looked up from Commerce. |
| `attr.<code>` | Any product attribute, for example `attr.manufacturer`, looked up from Commerce. |

### Product categories and attributes

The webhook payload carries only SKUs. When a rule uses `category_ids` or `attr.<code>`, the app looks up the cart's products with `GET /V1/products`, 50 SKUs per request, and caches them in the `fee_catalog` collection for the minutes set in App Management. If the lookup fails, those conditions don't match: the fee isn't charged and checkout carries on. **Refresh product data** on the Admin page clears the cache.
