# Storefront API

Any storefront shows the fees Commerce charged: they're in GraphQL on the cart, and on orders, invoices and credit memos. Optional and required fees also need a way for the buyer to choose, which is the `fee-options` web action.

For Edge Delivery Services storefronts, the [storefront kit](../storefront/README.md) wraps all of this in a block.

## Reading charged fees

```graphql
query {
  cart(cart_id: "<masked id>") {
    prices {
      custom_fees { code label amount { value currency } }
      grand_total { value currency }
    }
  }
}
```

Option fees appear as `code__option` with the label `Fee: Option`.

## fee-options

Public web action in the `extra-fees` package. Find its URL with `aio app get-url`; it looks like `https://<namespace>.adobeioruntime.net/api/v1/web/extra-fees/fee-options`.

Send a `POST` with a JSON body:

| Request body | Response |
|---|---|
| `{ "cartId": "<masked id>" }` | The fees the buyer can choose, priced for this cart. |
| `{ "cartId": "<masked id>", "selections": { ... } }` | Saves the choices, then answers as above. |

Selections are keyed by fee code:

```json
{
  "cartId": "Xyz123...",
  "selections": {
    "insurance": true,
    "delivery": "express",
    "packaging": ["box", "card"]
  }
}
```

- A checkbox fee without options: `true` or `false`.
- A dropdown or radio fee: one option code.
- A checkbox fee with options: an array of option codes.

Response:

```json
{
  "currency": "USD",
  "fees": [
    {
      "code": "delivery",
      "label": "Delivery",
      "description": "",
      "type": "required",
      "input": "radio",
      "amount": 9,
      "selected": true,
      "options": [
        { "code": "standard", "label": "Standard", "amount": 0, "selected": false },
        { "code": "express", "label": "Express", "amount": 9, "selected": true }
      ]
    }
  ]
}
```

After saving choices, **refresh the cart** (for example `Cart.refreshCart()` in the drop-ins, or re-query the cart in GraphQL): Commerce recalculates the totals, the webhook reads the saved choices, and the new fee lines appear.

### Rules and limits

- The masked cart ID identifies the cart, just as it does for Commerce's own guest cart APIs. The action reads the cart with `GET /V1/guest-carts/{maskedId}` and its totals.
- Choices are checked against the rules before they're saved: unknown fees and options are dropped, and a dropdown or radio fee keeps one option.
- Choices are stored per cart in the `fee_selections` collection, expire after 30 days, and are deleted when the order is placed.
- When the master switch in App Management is off, the answer is `{ "currency": null, "fees": [] }`.
- Errors: `404` for a malformed or unknown cart ID, `500` with a generic message when Commerce or the database can't be reached (the details go to the action log). Responses are never cached (`Cache-Control: no-store`).
