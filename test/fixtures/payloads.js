/** Sample totals-collector custom_fees webhook payloads (shape per Adobe's custom fees guide). */

export function item(overrides = {}) {
  return {
    base_price: 50,
    item_id: 1,
    price: 50,
    qty: 1,
    quote_id: 100,
    sku: "WIDGET-1",
    weight: 1,
    ...overrides,
  };
}

export function payload({
  items = [item()],
  subtotal,
  shipping = 10,
  discount = 0,
  storeId = 1,
  groupId = 1,
  customerId = 7,
  country = "US",
  region = "CA",
  postcode = "94110",
  method = "flatrate_flatrate",
} = {}) {
  const itemsSubtotal = items.reduce(
    (sum, line) => sum + line.base_price * line.qty,
    0,
  );
  const sub = subtotal ?? itemsSubtotal;
  return {
    quote: {
      customer_group_id: groupId,
      customer_id: customerId,
      entity_id: 100,
      items,
      store_id: storeId,
    },
    shippingAssignment: {
      items,
      shipping: {
        address: {
          city: "San Francisco",
          country_id: country,
          postcode,
          region_code: region,
        },
        method,
      },
    },
    total: {
      base_discount_amount: -discount,
      base_shipping_amount: shipping,
      base_subtotal: sub,
      grand_total: sub + shipping - discount,
      subtotal: sub,
    },
  };
}
