/**
 * Normalises the totals-collector webhook payload (`total`, `quote`, `shippingAssignment`)
 * into one flat cart object the rule engine can read. Commerce sends snake_case fields and
 * sometimes only the store-currency or only the base-currency value, so every read falls back.
 * Fees are returned in base currency (`base_fee`), so amounts prefer `base_*` fields.
 */

export function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function round2(n) {
  return Math.round((toNumber(n) + Number.EPSILON) * 100) / 100;
}

function pick(obj, ...keys) {
  if (!obj || typeof obj !== "object") {
    return;
  }
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null) {
      return obj[key];
    }
  }
}

function normaliseItem(raw) {
  const qty = toNumber(pick(raw, "qty", "quantity"));
  const price = toNumber(pick(raw, "base_price", "price"));
  const rowTotal = toNumber(
    pick(raw, "base_row_total", "row_total"),
    price * qty,
  );
  return {
    discount: Math.abs(
      toNumber(pick(raw, "base_discount_amount", "discount_amount")),
    ),
    id: pick(raw, "item_id", "id") ?? null,
    // Child lines of configurable/bundle products carry a parent id; their parent line
    // already holds the price, so they are skipped to avoid charging twice.
    isChild: Boolean(pick(raw, "parent_item_id", "parent_item")),
    price,
    qty,
    rowTotal: rowTotal || price * qty,
    sku: String(pick(raw, "sku") ?? ""),
    weight: toNumber(pick(raw, "weight")),
  };
}

export function normaliseCart(params = {}) {
  const total = params.total ?? {};
  const quote = params.quote ?? {};
  const assignment =
    params.shippingAssignment ?? params.shipping_assignment ?? {};
  const shipping = assignment.shipping ?? {};
  const address = shipping.address ?? {};

  const rawItems = [assignment.items, quote.items].find(Array.isArray) ?? [];
  const items = rawItems
    .filter((item) => item && typeof item === "object")
    .map(normaliseItem)
    .filter((item) => !item.isChild && item.qty > 0);

  const itemsSubtotal = items.reduce((sum, item) => sum + item.rowTotal, 0);

  return {
    address: {
      city: String(pick(address, "city") ?? ""),
      country: String(pick(address, "country_id", "country") ?? ""),
      postcode: String(pick(address, "postcode") ?? ""),
      region: String(pick(address, "region_code", "region_id", "region") ?? ""),
    },
    customer: {
      groupId: toNumber(pick(quote, "customer_group_id"), 0),
      id: pick(quote, "customer_id") ?? null,
      isGuest: Boolean(
        pick(quote, "customer_is_guest") ?? !pick(quote, "customer_id"),
      ),
    },
    discount: Math.abs(
      toNumber(pick(total, "base_discount_amount", "discount_amount")),
    ),
    itemCount: items.length,
    items,
    qty: items.reduce((sum, item) => sum + item.qty, 0),
    shippingAmount: toNumber(
      pick(total, "base_shipping_amount", "shipping_amount"),
    ),
    shippingMethod: String(
      pick(shipping, "method") ?? pick(address, "shipping_method") ?? "",
    ),
    storeId: toNumber(pick(quote, "store_id"), 0),
    subtotal: round2(
      toNumber(pick(total, "base_subtotal", "subtotal"), itemsSubtotal) ||
        itemsSubtotal,
    ),
    weight: items.reduce((sum, item) => sum + item.weight * item.qty, 0),
  };
}
