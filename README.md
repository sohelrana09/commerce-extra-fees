# Extra Fees for Adobe Commerce

Extra Fees adds rule-based fees to the cart and checkout in Adobe Commerce: small-order fees, handling and surcharges, fees for some products, and optional services such as shipping insurance. It's an App Builder app. Commerce calls it during cart totals collection through the out-of-process totals collector's **custom fees** webhook. Commerce then shows each fee on its own line in the cart, checkout, order, invoice, credit memo and emails.

> **Status: phase 4 (feature complete, not yet verified on a live Commerce instance).** Merchants manage fees and read fee revenue reports on an Admin page. Buyers choose optional and required fees on an Edge Delivery Services storefront, and fee lines show in the cart and checkout summaries. See [Roadmap](#roadmap).

## Features

| Feature | Supported |
|---|---|
| Any number of fees, each with a label, description, sort order and on/off switch | ✅ |
| Fixed, percent, fixed + percent, or the larger of fixed and percent | ✅ |
| Charged per order, per item or per unit | ✅ |
| Minimum and maximum fee caps | ✅ |
| A subtotal range (for example a small-order fee under $250) | ✅ |
| Percent taken of the subtotal, with or without the discount and shipping | ✅ |
| Limited to store views and customer groups | ✅ |
| Cart conditions: subtotal, quantity, item count, weight, country, region, postcode prefix, city, shipping method, guest or signed-in | ✅ |
| Product filters: SKU, quantity, price, row total, weight | ✅ |
| Product filters: category and product attribute | ✅ (looked up through Commerce REST and cached) |
| Automatic, required and optional fees (checkbox, dropdown, radio, with priced options) | ✅ |
| Storefront kit for Edge Delivery Services: fee choices and fee lines in the cart and checkout | ✅ ([storefront/](storefront/README.md)) |
| Fee on order, invoice, credit memo and emails | ✅ (Commerce) |
| Admin page to create, edit, delete and test fees | ✅ |
| Fee revenue reports by fee, day or month, with CSV export | ✅ |
| Tax on fees | ❌ The custom fees API has no tax field. Fees are untaxed |

**Failure policy:** the webhook never blocks a cart. If anything goes wrong, such as an invalid rule or bad configuration, it charges no fee and logs the error.

## Requirements

- Adobe Commerce as a Cloud Service, or Adobe Commerce 2.4.5+ on cloud infrastructure or on-premises with `magento/module-out-of-process-totals-collector` and the Commerce webhooks module.
- An App Builder project and workspace.
- Node.js 24 and the Adobe I/O CLI (`aio`).

## Install

```bash
npm install
aio login
aio console org select
aio console project select
aio console workspace select
aio app use --merge
cp env.dist .env
aio app deploy
```

Then associate the app with your Commerce instance in **Apps → App Management**. The custom fees webhook is declared in `app.commerce.config.ts` for both SaaS and PaaS and runs with Adobe IMS authentication (`require-adobe-auth: true`).

| | Webhook method |
|---|---|
| PaaS | `plugin.magento.out_of_process_totals_collector.api.get_total_modifications.custom_fees` |
| SaaS | `plugin.out_of_process_totals_collector.api.get_total_modifications.custom_fees` (check with `GET /V1/webhooks/supportedList`) |

On installation, App Management runs `scripts/setup-database.js`. It waits until the workspace's App Builder database is provisioned, then creates the indexes for the app's collections. **Uninstalling the app drops every collection, including the recorded orders behind the reports.**

| Collection | Holds | Kept for |
|---|---|---|
| `fee_rules` | Fee rules from the Admin page | Until deleted |
| `fee_catalog` | Product categories and attributes | The cache time in settings |
| `fee_selections` | Buyers' choices for optional and required fees, per cart | 30 days, or until the order is placed |
| `fee_orders` | Fees charged on each placed order, for reports | Until the app is uninstalled |

App Management also subscribes the app to the order-placed Commerce event:

| | Event |
|---|---|
| PaaS | `plugin.magento.sales.api.order_management.place` |
| SaaS | `plugin.sales.api.order_management.place` |

The event sends only the order's IDs (`entity_id`, `increment_id`, `quote_id`, `created_at`). The `record-order-fees` action reads the full order from Commerce REST, saves its fees in `fee_orders`, and deletes the buyer's saved choices for that cart. Saving is idempotent per order, so a redelivered event does no harm, and a failure makes Adobe I/O Events retry. The order's fees come from the order itself when Commerce exposes them in `extension_attributes`. Otherwise they're worked out again from the order with the current rules and the buyer's saved choices, which matches the charge unless a rule changed in the moments before the order was placed.

A daily `cleanup` action (the `extra-fees-daily` alarm trigger, 03:17 UTC) deletes expired buyer choices and product data.

### App Management settings

| Setting | Default | Meaning |
|---|---|---|
| Charge extra fees | On | The master switch. When it's off, the webhook charges no fees. |
| Product data cache (minutes) | 60 | How long product categories and attributes are cached. |

## Managing fees in the Admin

Open **Extra Fees** in the Commerce Admin menu. It's protected by an ACL resource, so grant it to the admin roles that should manage fees. The page has these sections:

- **Fees:** the list of rules. The editor has General, Stores & groups, Conditions, Calculation and Options tabs. The bundled examples appear as templates, and **every one of them is switched off**.
- **Test a cart:** enter a subtotal, address, customer group and lines, and see which fees would be charged and why the others were skipped.
- **Reports:** fee revenue for the last 7 or 30 days, this or last month, or this year, grouped by fee, by fee and day, or by fee and month, with a CSV download. Amounts are in each store's base currency and never mixed across currencies. Days and months are in UTC. Refunds aren't subtracted.
- **Refresh product data:** clears the product cache, so category and attribute changes take effect immediately.

A saved change reaches checkout within about 30 seconds, because each warm webhook container caches the rules for that long.

The page calls these web actions in the `ExtraFeesAdmin` package. Every one requires the signed-in admin's IMS token (`require-adobe-auth: true`):

| Action | Purpose |
|---|---|
| `rules-list` | Lists the saved rules and the example templates. |
| `rule-save` | Validates and saves a rule, including renaming its code. |
| `rule-delete` | Deletes a rule. |
| `rule-preview` | Runs the rule engine against a test cart. |
| `lookups` | Lists store views and customer groups from Commerce REST. |
| `catalog-refresh` | Clears the product data cache. |
| `fee-report` | Totals recorded fees for a date range (`{ from, to, groupBy }`, dates as `YYYY-MM-DD`, at most 3 years). |

## Storefront

Buyers choose optional and required fees through the public `fee-options` web action (package `extra-fees`). The storefront sends the masked cart ID it already holds. The action looks up the cart with `GET /V1/guest-carts/{maskedId}` and its totals, and prices the choices with the same rule engine as the webhook, so the price a buyer sees is the price Commerce charges.

| Request body | Response |
|---|---|
| `{ "cartId": "<masked id>" }` | `{ currency, fees: [{ code, label, description, type, input, amount, selected, options: [{ code, label, amount, selected }] }] }` |
| `{ "cartId": "<masked id>", "selections": { "insurance": true, "delivery": "express", "packaging": ["box"] } }` | Saves the choices, then answers as above. |

Choices are checked against the rules before they're saved: unknown fees and options are dropped, and a dropdown or radio fee keeps one option. They're stored per quote in the `fee_selections` collection and expire after 30 days. When the storefront refreshes the cart, the webhook reads the saved choices and charges them.

The [storefront kit](storefront/README.md) has a block and helpers for Edge Delivery Services storefronts. Headless storefronts can call the action directly, and read the charged fees from `cart.prices.custom_fees` in GraphQL.

### Product categories and attributes

The webhook payload carries only SKUs. When a rule uses `category_ids` or `attr.<code>`, the webhook looks up the cart's products with `GET /V1/products`, 50 SKUs per request, and caches them in the `fee_catalog` collection. If the lookup fails, those conditions don't match, so the fee isn't charged and checkout carries on.

## Rule format

The Admin page writes rules in this format. To manage rules in code instead, for example to keep them in version control, set the `FEE_RULES` action input to a JSON array of rules or to `{ "rules": [...] }`. When `FEE_RULES` is set, it **overrides** the rules saved in the Admin.

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

### Rule reference

| Field | Meaning |
|---|---|
| `code` | Unique key, 1–40 chars of `a-z 0-9 _`. Option fees use `code__option`. |
| `label`, `description` | Shown to the buyer. |
| `enabled` | `false` switches the rule off. Default `true`. |
| `sortOrder` | Order of the fee lines. |
| `type` | `automatic` (default), `required` or `optional`. |
| `input` | `checkbox` (default, several choices allowed), `dropdown` or `radio` (one choice). |
| `stores`, `customerGroups` | Store IDs and customer group IDs. Empty means all. |
| `subtotal` | `{ min, max }`. `min` is inclusive and `max` is exclusive. |
| `conditions` | Cart condition tree (see below). |
| `items` | Item condition tree. Only matching lines count for per-item and per-unit fees and percent bases. |
| `calc` | `{ mode, fixed, percent, applyPer, base: { includeDiscount, includeShipping }, min, max }` |
| `options` | `[{ code, label, calc, default }]`. An option's `calc` overrides the rule's `calc`. |

**Condition trees** use `{ all: [...] }`, `{ any: [...] }`, `{ not: {...} }` and leaves `{ field, op, value }`.

- Operators: `eq neq gt gte lt lte between in nin contains starts_with`.
- Cart fields: `subtotal qty item_count weight shipping_method country region postcode city customer_group customer_is_guest store_id`.
- Item fields: `sku qty price row_total weight category_ids attr.<code>`.

## Development

```bash
npm test            # Vitest with coverage
npm run code:check  # Biome
npm run typecheck   # Admin page TypeScript
aio app build
```

## Roadmap

1. **Phase 1 (done):** rule engine and the custom fees webhook.
2. **Phase 2 (done):** an Admin UI SDK page for rules, rules stored in App Builder Database Storage, and a cached catalog lookup for categories and attributes.
3. **Phase 3 (done):** a storefront action and an Edge Delivery Services kit for optional fees, plus fee lines in the cart and checkout summaries.
4. **Phase 4 (this release):** an order-placed event that records the fees on each order, fee revenue reports with CSV export, and daily cleanup.

### Known limits

- Fees are untaxed, because the custom fees API has no tax field.
- Reports count fees when the order is placed. Credit memos and cancellations aren't subtracted.
- Date and note inputs on fees (as in some Magento fee modules) aren't supported, because they couldn't be printed on Commerce documents.
- Before the Marketplace submission, these need confirming on a live instance: the SaaS webhook and event names, guest-cart lookup for signed-in customers' carts, whether `custom_fees` is on the order GraphQL type and in order `extension_attributes`, and the `install.yaml` API list for Commerce eventing.
