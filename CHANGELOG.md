# Changelog

All notable changes to Extra Fees. Versions follow [Semantic Versioning](https://semver.org/); until 1.0.0, a minor version may change the rule format or settings.

## v0.4.0 (2026-11-16)

Orders and reports, and the first public release.

- **Order fees:** the order-placed Commerce event (`plugin.magento.sales.api.order_management.place` on PaaS, `plugin.sales.api.order_management.place` on SaaS) runs `record-order-fees`, which saves each order's fees in the `fee_orders` collection and clears the cart's saved choices. Idempotent per order; failures are retried by Adobe I/O Events.
- **Reports:** fee revenue by fee, by fee and day, or by fee and month, per currency, with a CSV download that neutralises spreadsheet formulas. New `fee-report` Admin action.
- **Cleanup:** a daily alarm (03:17 UTC) deletes expired choices and product data.

### Project

- MIT license, contributor guides, issue and pull request templates, and guides in `docs/`.
- **Admin page:** the page now uses the Spectrum font everywhere (titles and sidebar fell back to the browser's serif font). Test a cart offers radio and dropdown fees as a radio group, so it sends one option the way the storefront does, and right-aligns amounts.
- Screenshots of the Admin page in the README and `docs/admin.md`.
- Dependencies updated; TypeScript stays on 6 and Babel on 7, as `@adobe/aio-commerce-lib-app` requires, and Dependabot skips their majors.
- A CI workflow runs Biome, the type check and the tests on every push and pull request, without App Builder secrets. Stage and Production deploys run on demand from the Actions tab.

## v0.3.0

Storefront.

- **`fee-options` action:** a public web action that lists and prices the fees a buyer can choose for a cart, and saves their choices, keyed by the masked cart ID. Choices are checked against the rules and expire after 30 days.
- **Storefront kit** for Edge Delivery Services: fee lines in the cart and checkout order summaries, and an `extra-fees` block for optional and required fees.
- The webhook charges the buyer's saved choices.

## v0.2.0

Admin page.

- **Admin page** (Admin UI SDK, React Spectrum): fees list, a five-tab editor, example templates (all switched off), Test a cart, and Refresh product data.
- Rules stored in App Builder Database Storage, with a 30-second cache per running instance. `FEE_RULES` still overrides them.
- **Category and attribute conditions**, looked up from Commerce REST and cached in `fee_catalog`.
- App Management settings: the master switch and the product cache time. The installation step provisions the database and creates the indexes.

## v0.1.0

Rule engine and webhook.

- The custom fees webhook of the out-of-process totals collector, for PaaS and SaaS, failing open: any error means no fee, never a blocked cart.
- Fixed, percent, fixed + percent and larger-of fees; per order, item or unit; minimum and maximum; subtotal range; store views and customer groups; cart, address, shipping method and product conditions; automatic, required and optional fees with options.
