/**
 * Builds a totals-collector style payload from the Admin page's "Test a cart" form, so the
 * preview runs through exactly the same normalisation and engine as the real webhook.
 */

import { toNumber } from "./cart.js";

export function previewPayload(input = {}) {
  const items = (Array.isArray(input.items) ? input.items : []).map(
    (line, index) => ({
      base_price: toNumber(line.price),
      item_id: index + 1,
      price: toNumber(line.price),
      qty: toNumber(line.qty, 1),
      sku: String(line.sku ?? ""),
      weight: toNumber(line.weight),
    }),
  );
  const itemsSubtotal = items.reduce(
    (sum, line) => sum + line.base_price * line.qty,
    0,
  );
  const subtotal =
    input.subtotal === undefined || input.subtotal === ""
      ? itemsSubtotal
      : toNumber(input.subtotal);

  return {
    quote: {
      customer_group_id: toNumber(input.customerGroup, 0),
      customer_id: input.isGuest ? null : 1,
      customer_is_guest: Boolean(input.isGuest),
      items,
      store_id: toNumber(input.storeId, 1),
    },
    shippingAssignment: {
      items,
      shipping: {
        address: {
          city: input.city ?? "",
          country_id: input.country ?? "",
          postcode: input.postcode ?? "",
          region_code: input.region ?? "",
        },
        method: input.shippingMethod ?? "",
      },
    },
    total: {
      base_discount_amount: -Math.abs(toNumber(input.discount)),
      base_shipping_amount: toNumber(input.shippingAmount),
      base_subtotal: subtotal,
    },
  };
}
