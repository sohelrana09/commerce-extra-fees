# Managing fees

Open **Extra Fees** in the Commerce Admin menu. The page is built with the Admin UI SDK and React Spectrum, and it's protected by an ACL resource: grant it to the admin roles that should manage fees.

## Fees

The list of fee rules, with each one's type, calculation and whether it's on. The bundled examples appear as templates, and **every one of them is switched off**: start from one, or from a blank fee.

The editor has five tabs:

| Tab | What you set |
|---|---|
| General | Code, label, description, sort order, on/off, and the type: automatic, required or optional. |
| Stores & groups | The store views and customer groups the fee applies to. None selected means all. |
| Conditions | The subtotal range, cart conditions (address, shipping method, quantity, weight and more), and the product filter that decides which lines count. |
| Calculation | Fixed, percent, fixed + percent or the larger of the two; per order, item or unit; what the percent is taken of; minimum and maximum. |
| Options | For required and optional fees: the input (checkbox, dropdown, radio) and the options, each with its own price and one default. |

Saving checks the rule first: a missing label, a duplicate code or a negative amount is reported on the form and nothing is saved. A saved change reaches checkout within about 30 seconds, because each running webhook instance caches the rules for that long.

Every field is described in [rules.md](rules.md).

## Test a cart

Enter some lines (SKU, quantity, price), the subtotal, shipping and discount, an address, a shipping method, a customer group and a store view, and see which fees would be charged, for how much, and why the others were skipped. It runs the same engine as checkout, against the saved rules, so it's the quickest way to check a fee before you switch it on.

## Reports

Fee revenue for the last 7 or 30 days, this or last month, or this year, grouped by fee, by fee and day, or by fee and month, with a total per currency and a CSV download.

- Amounts are in each store's base currency and never mixed across currencies.
- Days and months are in UTC.
- Fees are counted when the order is placed. Refunds and cancellations aren't subtracted.
- Labels are exported safely: a label starting with `=`, `+`, `-` or `@` can't run as a spreadsheet formula.

## Refresh product data

Clears the cached product categories and attributes, so a category or attribute change takes effect at the next cart update instead of after the cache time.

## Web actions

The page calls these actions in the `ExtraFeesAdmin` package. Every one requires the signed-in admin's Adobe IMS token (`require-adobe-auth: true`).

| Action | Purpose |
|---|---|
| `rules-list` | Lists the saved rules and the example templates. |
| `rule-save` | Validates and saves a rule, including renaming its code. |
| `rule-delete` | Deletes a rule. |
| `rule-preview` | Runs the rule engine against a test cart. |
| `lookups` | Lists store views and customer groups from Commerce REST. |
| `catalog-refresh` | Clears the product data cache. |
| `fee-report` | Totals recorded fees for a date range: `{ from, to, groupBy }`, dates as `YYYY-MM-DD` (inclusive), `groupBy` one of `fee`, `day`, `month`, at most 3 years. |
