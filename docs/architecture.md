# Architecture

Extra Fees is an Adobe App Builder app with three extensions:

| Extension | Folder | What it adds |
|---|---|---|
| `commerce/extensibility/1` | `src/commerce-extensibility-1` | The `extra-fees` package: webhook, storefront, event and cleanup actions, and the App Management actions. |
| `commerce/backend-ui/2` | `src/commerce-backend-ui-2` | The Admin page (React Spectrum) and the `ExtraFeesAdmin` actions it calls. |
| `commerce/configuration/1` | `src/commerce-configuration-1` | The settings merchants change in App Management. |

`app.commerce.config.ts` declares everything App Management sets up on installation: the webhook, the order event, the Admin menu, the settings schema and the database step.

## Actions

| Action | Called by | Auth | Does |
|---|---|---|---|
| `calculate-fees` | Commerce custom fees webhook, during totals collection | Adobe IMS | Works out the fees for the cart and answers with a JSON Patch on `result/fees`. |
| `fee-options` | The storefront | Public (masked cart ID) | Lists and prices the fees a buyer can choose, and saves their choices. |
| `record-order-fees` | Adobe I/O Events, order placed | Not a web action | Saves the fees on each order for reports, and clears the cart's saved choices. |
| `cleanup` | Daily alarm, 03:17 UTC | Not a web action | Deletes expired choices and product data. |
| `rules-list`, `rule-save`, `rule-delete`, `rule-preview`, `lookups`, `catalog-refresh`, `fee-report` | The Admin page | Adobe IMS | See [admin.md](admin.md#web-actions). |

## Data flow at checkout

1. The buyer changes the cart. Commerce collects totals and calls the webhook with `total`, `quote` and `shippingAssignment`.
2. `calculate-fees` turns the payload into one cart shape (`cart.js`), loads the rules (cached for 30 seconds per running instance), and only when a rule needs them:
   - the buyer's saved choices for this cart (`fee_selections`);
   - product categories and attributes (`fee_catalog`, filled from `GET /V1/products`).
3. The engine (`engine.js`, `conditions.js`) checks each rule and works out the amount.
4. The action answers `replace result/fees` with `[{ code, label, base_fee }]`, or `success` when there are none.
5. Commerce adds the fee lines to the totals and carries them to the order, invoice, credit memo and emails.

The storefront action and the Admin's Test a cart call the same engine, so prices agree everywhere.

## Failure handling

- **Checkout first.** `calculate-fees` catches every error and answers `success` (no fees), logging the error. Commerce also has a 5-second timeout on the webhook and a 1-second soft timeout.
- **Bad rules are skipped.** Rules are validated when saved and again when loaded; an invalid rule is logged and ignored, not charged.
- **Lookups fail closed.** If the product lookup fails, category and attribute conditions don't match, so the fee isn't charged.
- **Events retry.** `record-order-fees` rethrows errors so Adobe I/O Events delivers the event again, and its write is idempotent per order.

## Storage

App Builder Database Storage, one database per workspace. Collections and how long data stays are listed in [installation.md](installation.md#data). `scripts/setup-database.js` creates the indexes on installation (`code` unique on rules, `quoteId` unique on choices, `orderId` unique and `createdAt` on orders, `expiresAt` for cleanup).

## Security

- Admin actions require the signed-in admin's IMS token, and the menu is ACL protected.
- The webhook action requires Adobe IMS authentication from Commerce.
- `fee-options` is public because buyers don't have an Adobe login. The masked cart ID is the credential, as for Commerce's own guest cart APIs; it is checked for shape before any lookup, and every choice is checked against the rules before it's saved.
- Calls to Commerce use the workspace's OAuth Server-to-Server credential, which never reaches the browser.
- No personal data is stored: choices are keyed by the cart, and order records hold IDs, store, currency, date and fees.
- The report's CSV export neutralises spreadsheet formulas in labels.

## Telemetry

The actions are instrumented with `@adobe/aio-lib-telemetry` (OpenTelemetry), including a fee-request counter in `fee-metrics.js`. No exporter is configured by default: add one in `src/commerce-extensibility-1/actions/telemetry.js` to send traces and metrics to your observability tool.
