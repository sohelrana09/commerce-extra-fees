/**
 * Records the fees charged on placed orders, for fee revenue reports.
 *
 * The order-placed event carries the order's IDs. The full order is read from Commerce REST.
 * Fees come from the order itself when Commerce exposes them in `extension_attributes`;
 * otherwise they're worked out again from the order with the current rules and the buyer's
 * saved choices (`source: "recalculated"`). That matches the charge unless a rule changed in
 * the moments between the last totals collection and placing the order.
 */

import { round2, toNumber } from "./cart.js";
import { ORDERS, withDb } from "./db.js";
import { calculateFees, needsCatalog } from "./engine.js";

/** Commerce dates are UTC "YYYY-MM-DD HH:MM:SS"; reports group by the ISO string. */
export function toIsoDate(value, fallback = new Date()) {
  if (typeof value === "string" && value.trim()) {
    const iso = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
    const date = new Date(iso);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
  }
  return fallback.toISOString();
}

function candidates(value) {
  if (!value || typeof value !== "object") {
    return [];
  }
  return [value, value.order, value.result, value.data, value.value].filter(
    (entry) => entry && typeof entry === "object",
  );
}

/** Pulls the order IDs out of an I/O Events delivery, whatever the event's shape. */
export function orderIdsFromEvent(params = {}) {
  const sources = [
    ...candidates(params.data?.value),
    ...candidates(params.data),
    ...candidates(params.value),
    params,
  ];
  const pick = (key) =>
    sources
      .map((source) => source[key])
      .find((v) => v !== undefined && v !== null && v !== "");
  return {
    entityId: pick("entity_id") ?? null,
    incrementId: pick("increment_id") ?? null,
    quoteId: pick("quote_id") ?? null,
  };
}

function searchOne(commerce, field, value) {
  return commerce
    .get("orders", {
      searchParams: {
        "searchCriteria[filter_groups][0][filters][0][field]": field,
        "searchCriteria[filter_groups][0][filters][0][value]": String(value),
        "searchCriteria[pageSize]": "1",
      },
    })
    .json()
    .then((body) => body?.items?.[0] ?? null);
}

/** Loads the order by entity ID, else by increment ID, else by quote ID. */
export async function loadOrder(commerce, ids) {
  if (ids.entityId) {
    return await commerce
      .get(`orders/${encodeURIComponent(ids.entityId)}`)
      .json();
  }
  if (ids.incrementId) {
    return await searchOne(commerce, "increment_id", ids.incrementId);
  }
  if (ids.quoteId) {
    return await searchOne(commerce, "quote_id", ids.quoteId);
  }
  return null;
}

function feeAmount(entry) {
  return toNumber(
    entry.base_fee ??
      entry.base_amount ??
      entry.amount?.value ??
      entry.amount ??
      entry.value,
    Number.NaN,
  );
}

function looksLikeFees(list) {
  return (
    Array.isArray(list) &&
    list.length > 0 &&
    list.every((entry) => entry?.code && Number.isFinite(feeAmount(entry)))
  );
}

/** Fees Commerce stored on the order, when its REST API exposes them. */
export function storedFees(order) {
  const attributes = order?.extension_attributes ?? {};
  const list = Object.values(attributes).find(looksLikeFees);
  if (!list) {
    return null;
  }
  return list
    .map((entry) => ({
      amount: round2(feeAmount(entry)),
      code: String(entry.code),
      label: String(entry.label ?? entry.title ?? entry.code),
    }))
    .filter((fee) => fee.amount > 0);
}

/** Shapes a REST order like the totals-collector payload so the engine can read it. */
export function orderToPayload(order) {
  const shipping =
    order?.extension_attributes?.shipping_assignments?.[0]?.shipping ?? {};
  return {
    quote: {
      customer_group_id: order?.customer_group_id ?? 0,
      customer_id: order?.customer_id ?? null,
      customer_is_guest: Boolean(order?.customer_is_guest),
      entity_id: order?.quote_id,
      store_id: order?.store_id,
    },
    shippingAssignment: {
      items: (order?.items ?? []).map((line) => ({
        base_discount_amount: line.base_discount_amount,
        base_price: line.base_price,
        base_row_total: line.base_row_total,
        item_id: line.item_id,
        parent_item_id: line.parent_item_id,
        qty: line.qty_ordered,
        sku: line.sku,
        weight: line.weight,
      })),
      shipping: {
        address: shipping.address ?? order?.billing_address ?? {},
        method: shipping.method ?? order?.shipping_method ?? "",
      },
    },
    total: {
      base_discount_amount: order?.base_discount_amount,
      base_shipping_amount: order?.base_shipping_amount,
      base_subtotal: order?.base_subtotal,
    },
  };
}

/**
 * Works out the fees for an order: stored ones if Commerce exposes them, else recalculated.
 * `deps` supplies { normaliseCart, loadRules, loadSelections, loadCatalog }.
 */
export async function orderFees(order, params, deps) {
  const stored = storedFees(order);
  if (stored) {
    return { fees: stored, source: "order" };
  }
  const cart = deps.normaliseCart(orderToPayload(order));
  if (cart.itemCount === 0) {
    return { fees: [], source: "recalculated" };
  }
  const rules = await deps.loadRules(params);
  const selections = order.quote_id
    ? await deps.loadSelections(order.quote_id, params)
    : {};
  const catalog = needsCatalog(rules)
    ? await deps.loadCatalog(
        cart.items.map((item) => item.sku),
        params,
      )
    : {};
  const fees = calculateFees(rules, cart, { catalog, selections }).map(
    (fee) => ({
      amount: fee.base_fee,
      code: fee.code,
      label: fee.label,
    }),
  );
  return { fees, source: "recalculated" };
}

/** The report document for an order. */
export function toOrderRecord(order, { fees, source }, now = new Date()) {
  return {
    createdAt: toIsoDate(order.created_at, now),
    currency: order.base_currency_code ?? null,
    fees,
    feeTotal: round2(fees.reduce((sum, fee) => sum + fee.amount, 0)),
    incrementId: order.increment_id ? String(order.increment_id) : null,
    orderId: String(order.entity_id),
    quoteId: order.quote_id ? String(order.quote_id) : null,
    recordedAt: now.toISOString(),
    source,
    storeId: order.store_id ?? null,
  };
}

/** Saves the record, replacing an earlier one for the same order (events can repeat). */
export function saveOrderRecord(record, params, connect) {
  return withDb(
    params,
    async (client) => {
      await client
        .collection(ORDERS)
        .replaceOne({ orderId: record.orderId }, record, { upsert: true });
      return record;
    },
    connect,
  );
}
