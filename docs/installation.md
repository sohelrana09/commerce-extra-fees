# Installation

Extra Fees is an App Builder app. You deploy it to an App Builder workspace, then install it on a Commerce instance through App Management, which sets up the webhook, the order event, the Admin menu, the settings and the database.

## Requirements

- **Commerce:** Adobe Commerce as a Cloud Service, or Adobe Commerce 2.4.5+ on cloud infrastructure or on-premises with the Commerce webhooks module and `magento/module-out-of-process-totals-collector`.
- **App Builder:** a project in the **same Adobe organization** as the Commerce instance. App Management only lists apps from the instance's own organization.
- **Tools:** Node.js 24 (`.nvmrc`) and the Adobe I/O CLI: `npm install -g @adobe/aio-cli`.

## App Builder project

In the [Adobe Developer Console](https://developer.adobe.com/console), create a project from the **App Builder** template. In each workspace you deploy to (for example Stage and Production), add:

| Service | Why |
|---|---|
| I/O Management API | App Management and event registration. |
| Adobe Commerce eventing (`commerceeventing`) | The order-placed event behind the reports. |
| App Builder Data Services | App Builder Database Storage for rules, choices, product data and order fees. |
| OAuth Server-to-Server credential | Calls to Commerce REST (store views, customer groups, products, carts, orders). |

`install.yaml` lists the same APIs for the Adobe Commerce Marketplace.

## Deploy

```bash
git clone https://github.com/sohelrana09/commerce-extra-fees.git
cd commerce-extra-fees
npm install

aio login
aio console org select
aio console project select
aio console workspace select
aio app use --merge
cp env.dist .env

aio app deploy
```

`aio app use --merge` writes the workspace's credentials into `.env` and `.aio`. Both are git-ignored: never commit them.

To deploy from GitHub instead, set the workspace secrets the template workflows expect (`CLIENTID_STAGE`, `CLIENTSECRET_STAGE`, `TECHNICALACCID_STAGE`, `TECHNICALACCEMAIL_STAGE`, `IMSORGID_STAGE`, `SCOPES_STAGE`, `AIO_RUNTIME_NAMESPACE_STAGE`, `AIO_RUNTIME_AUTH_STAGE`, and the same with `_PROD`). Then run **Deploy to Stage** or **Deploy to Production** from the Actions tab; for Production, pick the release tag under "Use workflow from".

## Install in Commerce

1. In the Commerce Admin, open **Apps → App Management**.
2. Find **Extra Fees** and choose **Install**.
3. App Management:
   - registers the custom fees webhook and the order-placed event subscription;
   - adds **Extra Fees** to the Admin menu, protected by an ACL resource;
   - runs the **Set up database** step (`scripts/setup-database.js`), which provisions the workspace's App Builder database if needed and creates the indexes.
4. Grant the Extra Fees ACL resource to the admin roles that should manage fees.
5. Open **Extra Fees** and add your first fee. The bundled examples are templates, and every one is switched off.

### Webhook

| | Webhook method |
|---|---|
| PaaS | `plugin.magento.out_of_process_totals_collector.api.get_total_modifications.custom_fees` |
| SaaS | `plugin.out_of_process_totals_collector.api.get_total_modifications.custom_fees` (check with `GET /V1/webhooks/supportedList`) |

The webhook is type `after`, timeout 5000 ms, soft timeout 1000 ms, and calls `extra-fees/calculate-fees` with Adobe IMS authentication. It sends `total`, `quote` and `shippingAssignment`, and the action answers with a JSON Patch that replaces `result/fees`.

### Order event

| | Event |
|---|---|
| PaaS | `plugin.magento.sales.api.order_management.place` |
| SaaS | `plugin.sales.api.order_management.place` |

The event sends only `entity_id`, `increment_id`, `quote_id` and `created_at`. The `record-order-fees` action reads the full order from Commerce REST, saves its fees in `fee_orders`, and deletes the buyer's saved choices for that cart. Saving is idempotent per order, so a redelivered event does no harm, and a failure makes Adobe I/O Events retry.

The fees come from the order itself when Commerce exposes them in `extension_attributes`. Otherwise they're worked out again with the current rules and the buyer's saved choices, which matches the charge unless a rule changed in the moments before the order was placed.

## Data

| Collection | Holds | Kept for |
|---|---|---|
| `fee_rules` | Fee rules from the Admin page | Until deleted |
| `fee_catalog` | Product categories and attributes | The cache time in settings |
| `fee_selections` | Buyers' choices for optional and required fees, per cart | 30 days, or until the order is placed |
| `fee_orders` | Fees charged on each placed order, for reports | Until the app is uninstalled |

A daily `cleanup` action (the `extra-fees-daily` alarm, 03:17 UTC) deletes expired choices and product data.

No buyer names, emails or addresses are stored: choices are keyed by the cart, and order records hold the order and cart IDs, store, currency, date and fees.

## Settings

In **App Management → Extra Fees → Configure**:

| Setting | Default | Meaning |
|---|---|---|
| Charge extra fees | On | The master switch. When it's off, the webhook charges no fees. |
| Product data cache (minutes) | 60 | How long product categories and attributes are cached. |

## Storefront

- **Edge Delivery Services:** follow the [storefront kit](../storefront/README.md).
- **Headless:** read `cart.prices.custom_fees` in GraphQL, and use the [`fee-options` action](storefront-api.md) if you offer optional fees.

## Uninstalling

Uninstall in **Apps → App Management**. It removes the webhook, event subscription and menu, and **drops every collection, including the recorded orders behind the reports**. Export the reports you want to keep first (Reports → Download CSV).

## Troubleshooting

| Symptom | Check |
|---|---|
| No fee in the cart | The fee is switched on, the master switch is on, and **Test a cart** with the same cart charges it. Then `aio app logs` for `calculate-fees`. |
| Fee shows, optional choice ignored | The storefront calls `fee-options` with the masked cart ID and then refreshes the cart. |
| Category or attribute rule never matches | Click **Refresh product data**, and check that the OAuth credential may read products. |
| Reports are empty | The order event is registered (**System → Events** in PaaS, or App Management), and `record-order-fees` shows activations in `aio rt activation list`. |
| "Not associated with a Commerce instance" in logs | The app is deployed but not installed in App Management yet. |
