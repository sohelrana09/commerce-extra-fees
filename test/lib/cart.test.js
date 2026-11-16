import { describe, expect, test } from "vitest";

import { normaliseCart, round2 } from "../../src/common/fees/cart.js";
import { item, payload } from "../fixtures/payloads.js";

describe("normaliseCart", () => {
  test("reads totals, customer, store and address", () => {
    const cart = normaliseCart(
      payload({ discount: 5, groupId: 3, items: [item({ qty: 2 })] }),
    );
    expect(cart).toMatchObject({
      address: { country: "US", postcode: "94110", region: "CA" },
      customer: { groupId: 3, id: 7, isGuest: false },
      discount: 5,
      itemCount: 1,
      qty: 2,
      shippingAmount: 10,
      shippingMethod: "flatrate_flatrate",
      storeId: 1,
      subtotal: 100,
      weight: 2,
    });
  });

  test("skips child lines of configurable products and zero-qty lines", () => {
    const cart = normaliseCart(
      payload({
        items: [
          item({ item_id: 1, sku: "PARENT" }),
          item({ item_id: 2, parent_item_id: 1, sku: "CHILD" }),
          item({ item_id: 3, qty: 0, sku: "EMPTY" }),
        ],
      }),
    );
    expect(cart.items.map((line) => line.sku)).toEqual(["PARENT"]);
  });

  test("falls back to store-currency fields and to quote.items", () => {
    const cart = normaliseCart({
      quote: { items: [{ price: 20, qty: 3, sku: "A" }] },
      total: {},
    });
    expect(cart.subtotal).toBe(60);
    expect(cart.items[0].rowTotal).toBe(60);
    expect(cart.customer.isGuest).toBe(true);
  });

  test("handles an empty or missing payload", () => {
    const cart = normaliseCart();
    expect(cart.itemCount).toBe(0);
    expect(cart.subtotal).toBe(0);
  });

  test("round2 rounds to cents", () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2("2.499")).toBe(2.5);
    expect(round2("x")).toBe(0);
  });
});
