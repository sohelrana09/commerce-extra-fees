import { describe, expect, test, vi } from "vitest";

import { normaliseCart } from "../../src/common/fees/cart.js";
import { ORDERS } from "../../src/common/fees/db.js";
import {
  loadOrder,
  orderFees,
  orderIdsFromEvent,
  orderToPayload,
  saveOrderRecord,
  storedFees,
  toIsoDate,
  toOrderRecord,
} from "../../src/common/fees/orders.js";
import { createFakeDb } from "../fixtures/fake-db.js";

const order = {
  base_currency_code: "USD",
  base_discount_amount: -5,
  base_shipping_amount: 10,
  base_subtotal: 120,
  created_at: "2026-11-02 14:30:00",
  customer_group_id: 1,
  customer_id: 3,
  customer_is_guest: false,
  entity_id: 55,
  extension_attributes: {
    shipping_assignments: [
      {
        shipping: {
          address: { country_id: "US", region_code: "AK" },
          method: "flatrate_flatrate",
        },
      },
    ],
  },
  increment_id: "000000055",
  items: [
    {
      base_price: 100,
      base_row_total: 100,
      item_id: 1,
      qty_ordered: 1,
      sku: "CONF",
    },
    {
      base_price: 0,
      item_id: 2,
      parent_item_id: 1,
      qty_ordered: 1,
      sku: "CONF-RED",
    },
    {
      base_price: 10,
      base_row_total: 20,
      item_id: 3,
      qty_ordered: 2,
      sku: "B",
      weight: 1,
    },
  ],
  quote_id: 900,
  store_id: 1,
};

const remote = {
  calc: { fixed: 12 },
  code: "remote",
  conditions: { field: "region", op: "in", value: "AK,HI" },
  label: "Remote area",
};
const delivery = {
  code: "delivery",
  input: "radio",
  label: "Delivery",
  options: [
    { calc: { fixed: 0 }, code: "standard", default: true, label: "Standard" },
    { calc: { fixed: 9 }, code: "express", label: "Express" },
  ],
  type: "required",
};

function deps(overrides = {}) {
  return {
    loadCatalog: vi.fn(async () => ({})),
    loadRules: vi.fn(async () => [remote, delivery]),
    loadSelections: vi.fn(async () => ({ delivery: "express" })),
    normaliseCart,
    ...overrides,
  };
}

describe("event parsing", () => {
  test("finds IDs in the shapes I/O Events delivers", () => {
    expect(
      orderIdsFromEvent({ data: { value: { entity_id: 1, quote_id: 2 } } }),
    ).toEqual({ entityId: 1, incrementId: null, quoteId: 2 });
    expect(
      orderIdsFromEvent({ data: { value: { result: { increment_id: "9" } } } }),
    ).toMatchObject({ incrementId: "9" });
    expect(
      orderIdsFromEvent({ value: { order: { entity_id: 4 } } }).entityId,
    ).toBe(4);
    expect(orderIdsFromEvent({ quote_id: 7 }).quoteId).toBe(7);
    expect(orderIdsFromEvent()).toEqual({
      entityId: null,
      incrementId: null,
      quoteId: null,
    });
  });

  test("toIsoDate reads Commerce UTC dates", () => {
    expect(toIsoDate("2026-11-02 14:30:00")).toBe("2026-11-02T14:30:00.000Z");
    expect(toIsoDate("2026-11-02T14:30:00Z")).toBe("2026-11-02T14:30:00.000Z");
    const now = new Date("2026-01-01T00:00:00Z");
    expect(toIsoDate("nonsense", now)).toBe(now.toISOString());
    expect(toIsoDate(undefined, now)).toBe(now.toISOString());
  });
});

describe("loadOrder", () => {
  function commerce(items = [order]) {
    return {
      get: vi.fn((path) => ({
        json: async () => (path === "orders" ? { items } : order),
      })),
    };
  }

  test("prefers the entity ID, then increment ID, then quote ID", async () => {
    const byId = commerce();
    await loadOrder(byId, { entityId: 55 });
    expect(byId.get).toHaveBeenCalledWith("orders/55");

    const byIncrement = commerce();
    expect(await loadOrder(byIncrement, { incrementId: "000000055" })).toBe(
      order,
    );
    expect(byIncrement.get.mock.calls[0][1].searchParams).toMatchObject({
      "searchCriteria[filter_groups][0][filters][0][field]": "increment_id",
    });

    const byQuote = commerce([]);
    expect(await loadOrder(byQuote, { quoteId: 900 })).toBeNull();
    expect(await loadOrder(commerce(), {})).toBeNull();
  });
});

describe("order fees", () => {
  test("orderToPayload skips child lines and keeps the address", () => {
    const cart = normaliseCart(orderToPayload(order));
    expect(cart).toMatchObject({
      address: { country: "US", region: "AK" },
      customer: { groupId: 1, isGuest: false },
      itemCount: 2,
      qty: 3,
      shippingMethod: "flatrate_flatrate",
      subtotal: 120,
    });
    expect(normaliseCart(orderToPayload(undefined)).itemCount).toBe(0);
  });

  test("recalculates with the buyer's choices when the order has no stored fees", async () => {
    const d = deps();
    const result = await orderFees(order, {}, d);
    expect(result).toEqual({
      fees: [
        { amount: 12, code: "remote", label: "Remote area" },
        { amount: 9, code: "delivery__express", label: "Delivery: Express" },
      ],
      source: "recalculated",
    });
    expect(d.loadSelections).toHaveBeenCalledWith(900, {});
    expect(d.loadCatalog).not.toHaveBeenCalled();
  });

  test("looks up the catalog for category rules and handles empty orders", async () => {
    const d = deps({
      loadRules: vi.fn(async () => [
        { ...remote, items: { field: "category_ids", op: "in", value: "3" } },
      ]),
    });
    await orderFees({ ...order, quote_id: null }, {}, d);
    expect(d.loadCatalog).toHaveBeenCalledWith(["CONF", "B"], {});
    expect(d.loadSelections).not.toHaveBeenCalled();
    expect(await orderFees({ items: [] }, {}, deps())).toEqual({
      fees: [],
      source: "recalculated",
    });
  });

  test("uses fees Commerce stored on the order when it exposes them", async () => {
    const withFees = {
      ...order,
      extension_attributes: {
        ...order.extension_attributes,
        custom_fees: [
          { base_fee: "4.5", code: "handling", label: "Handling" },
          { amount: { value: 0 }, code: "zero" },
        ],
      },
    };
    expect(storedFees(withFees)).toEqual([
      { amount: 4.5, code: "handling", label: "Handling" },
    ]);
    const d = deps();
    expect((await orderFees(withFees, {}, d)).source).toBe("order");
    expect(d.loadRules).not.toHaveBeenCalled();
    expect(
      storedFees({ extension_attributes: { other: [{ x: 1 }] } }),
    ).toBeNull();
  });

  test("toOrderRecord and saveOrderRecord store one record per order", async () => {
    const now = new Date("2026-11-03T00:00:00Z");
    const record = toOrderRecord(
      order,
      {
        fees: [
          { amount: 12, code: "remote", label: "Remote area" },
          { amount: 0.11, code: "x", label: "X" },
        ],
        source: "recalculated",
      },
      now,
    );
    expect(record).toMatchObject({
      createdAt: "2026-11-02T14:30:00.000Z",
      currency: "USD",
      feeTotal: 12.11,
      incrementId: "000000055",
      orderId: "55",
      quoteId: "900",
      recordedAt: now.toISOString(),
      storeId: 1,
    });
    expect(
      toOrderRecord({ entity_id: 1 }, { fees: [], source: "order" }, now),
    ).toMatchObject({
      currency: null,
      incrementId: null,
      quoteId: null,
      storeId: null,
    });

    const db = createFakeDb();
    await saveOrderRecord(record, {}, db.connect);
    await saveOrderRecord({ ...record, feeTotal: 1 }, {}, db.connect);
    expect(db.collections.get(ORDERS)).toHaveLength(1);
    expect(db.collections.get(ORDERS)[0].feeTotal).toBe(1);
  });
});
