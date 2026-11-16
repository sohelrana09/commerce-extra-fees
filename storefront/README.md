# Extra Fees storefront kit

These files add Extra Fees to an Adobe Commerce storefront on Edge Delivery Services (the boilerplate and drop-ins). They do two things:

- **Fee lines:** show every fee Commerce charged in the cart and checkout order summaries.
- **Fee choices:** let buyers pick optional and required fees (checkboxes, radio buttons or a dropdown), with prices, in the cart and in checkout.

The app doesn't deploy these files. Copy them into your storefront repository.

| File | Copy to |
|---|---|
| `scripts/extra-fees.js` | `scripts/extra-fees.js` |
| `blocks/extra-fees/extra-fees.js` | `blocks/extra-fees/extra-fees.js` |
| `blocks/extra-fees/extra-fees.css` | `blocks/extra-fees/extra-fees.css` |

They follow the boilerplate's ESLint (Airbnb) and Stylelint rules, and they use the drop-in design tokens for styling.

## 1. Point the storefront at the app

Find the URL of the app's `fee-options` web action:

```bash
aio app get-url
```

It looks like `https://<namespace>.adobeioruntime.net/api/v1/web/extra-fees/fee-options`. Add it to your site configuration as `commerce-extra-fees-endpoint`. You can also set it per block (see step 4).

The action is public, because buyers don't have an Adobe login. The masked cart ID that the storefront already holds identifies the cart, just as it does for Commerce's own guest cart APIs. Every choice is checked against your fee rules before it's saved.

## 2. Ask GraphQL for the fees

In `build.mjs`, extend the cart drop-in's `CART_FRAGMENT`:

```js
{
  npm: '@dropins/storefront-cart',
  skipFragments: [/* keep what you have */],
  operations: [
    `
    fragment CART_FRAGMENT on Cart {
      prices {
        custom_fees {
          code
          label
          amount { value currency }
        }
      }
    }
    `,
  ],
},
```

Then run `npm run postinstall` (or `npm install`) to rebuild the drop-ins.

Only add this fragment when your Commerce backend has the out-of-process totals collector. Without it, `custom_fees` doesn't exist and every cart query fails. ACCS and PaaS with the `magento/module-out-of-process-totals-collector` module have it.

## 3. Add the fees to the cart data

In `scripts/initializers/cart.js`, pass the transformer to `initialize`:

```js
import { customFeesTransformer } from '../extra-fees.js';

return initializers.mountImmediately(initialize, {
  langDefinitions,
  models: {
    CartModel: { transformer: customFeesTransformer },
  },
});
```

If you already have a `CartModel` transformer, merge the two: `(data) => ({ ...yours(data), ...customFeesTransformer(data) })`. Cart data events now carry `customFees: [{ code, label, amount: { value, currency } }]`.

## 4. Let buyers choose fees in the cart

Add an **Extra Fees** block to the cart page, below the cart block. The two rows are optional:

| Extra Fees | |
|---|---|
| Title | Additional options |
| Endpoint | https://…/extra-fees/fee-options |

The block stays hidden when the cart is empty, when no optional or required fee applies, or when no endpoint is set. When the buyer changes a choice, the block saves it and refreshes the cart, and the totals update without a page reload.

## 5. Show fee lines in the order summary

In `blocks/commerce-cart/commerce-cart.js`, and in the checkout block's order summary as well, keep the latest fees and pass `updateLineItems` to `OrderSummary`. **Register the listener before you render `OrderSummary`**, so the fees are up to date when the summary redraws.

```js
import { h } from '@dropins/tools/preact.js';
import { Price } from '@dropins/tools/components.js';
import OrderSummaryLine from '@dropins/storefront-cart/containers/OrderSummaryLine.js';
import { withCustomFees } from '../../scripts/extra-fees.js';

let customFees = [];
events.on('cart/data', (cart) => { customFees = cart?.customFees ?? []; }, { eager: true });

provider.render(OrderSummary, {
  // ...your existing props
  updateLineItems: (lineItems) => withCustomFees(lineItems, customFees, (fee) => h(OrderSummaryLine, {
    label: fee.label,
    price: h(Price, { amount: fee.amount.value, currency: fee.amount.currency }),
    classSuffixes: ['extra-fee'],
  })),
})($orderSummary);
```

Fee lines appear after gift cards and before tax (sort order 750).

## 6. Fee choices in checkout (optional)

The checkout block builds its own layout, so mount the choices yourself, for example above the order summary:

```js
import { getConfigValue } from '@dropins/tools/lib/aem/configs.js';
import * as Cart from '@dropins/storefront-cart/api.js';
import { mountFeeOptions } from '../../scripts/extra-fees.js';

const $fees = document.createElement('div');
$orderSummary.before($fees);
mountFeeOptions($fees, {
  endpoint: getConfigValue('commerce-extra-fees-endpoint'),
  events,
  refreshCart: () => Cart.refreshCart(),
  labels: { title: 'Delivery options' },
});
```

Then load `blocks/extra-fees/extra-fees.css` on the checkout page, or copy its rules into the checkout block's CSS.

## Labels

`mountFeeOptions` and the block accept these labels (pass them as `labels`, or set the block's Title row):

| Key | Default |
|---|---|
| `title` | Additional options |
| `none` | None |
| `updated` | Your order total has been updated. |
| `error` | We couldn't update your options. Please try again. |

## Known limits

- Prices are shown in the store's base currency, because Commerce's fee API works in base currency.
- Fees are untaxed, because the custom fees API has no tax field.
- Order confirmation and order history show fee lines only if your Commerce version exposes `custom_fees` on the order GraphQL type. The grand total is always right.
