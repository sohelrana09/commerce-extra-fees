import { describe, expect, test, vi } from "vitest";

import { normaliseCart } from "../../src/common/fees/cart.js";
import {
  CartNotFoundError,
  isMaskedCartId,
  loadStorefrontCart,
  toWebhookPayload,
} from "../../src/common/fees/storefront-cart.js";

const MASKED = "a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6";

const cart = {
  billing_address: { country_id: "US" },
  customer: { group_id: 1, id: 9 },
  customer_is_guest: false,
  extension_attributes: {
    shipping_assignments: [
      {
        shipping: {
          address: { country_id: "CA", postcode: "H2X", region_code: "QC" },
          method: "flatrate_flatrate",
        },
      },
    ],
  },
  id: 321,
  items: [
    { item_id: 1, price: 20, qty: 2, sku: "A" },
    { item_id: 2, price: 5, qty: 1, sku: "B" },
  ],
  store_id: 1,
};
const totals = {
  base_currency_code: "USD",
  base_discount_amount: -4,
  base_shipping_amount: 10,
  base_subtotal: 45,
  items: [
    { base_discount_amount: 4, base_price: 20, base_row_total: 40, item_id: 1 },
  ],
};

function fakeCommerce(responses) {
  return {
    get: vi.fn((path) => ({
      json: async () => {
        const value = responses[path];
        if (value instanceof Error) {
          throw value;
        }
        return value;
      },
    })),
  };
}

function httpError(status) {
  const error = new Error(`HTTP ${status}`);
  error.response = { status };
  return error;
}

describe("isMaskedCartId", () => {
  test("accepts masked IDs and rejects anything else", () => {
    expect(isMaskedCartId(MASKED)).toBe(true);
    expect(isMaskedCartId("12")).toBe(false);
    expect(isMaskedCartId("../../products")).toBe(false);
    expect(isMaskedCartId(undefined)).toBe(false);
  });
});

describe("toWebhookPayload", () => {
  test("produces a payload the engine reads like the webhook's", () => {
    const normalised = normaliseCart(toWebhookPayload(cart, totals));
    expect(normalised).toMatchObject({
      address: { country: "CA", postcode: "H2X", region: "QC" },
      customer: { groupId: 1, id: 9, isGuest: false },
      discount: 4,
      itemCount: 2,
      qty: 3,
      shippingAmount: 10,
      shippingMethod: "flatrate_flatrate",
      storeId: 1,
      subtotal: 45,
    });
    expect(normalised.items[1]).toMatchObject({
      price: 5,
      rowTotal: 5,
      sku: "B",
    });
  });

  test("tolerates a guest cart without shipping", () => {
    const payload = toWebhookPayload({ id: 1, items: [] }, undefined);
    expect(payload.quote).toMatchObject({
      customer_group_id: 0,
      customer_is_guest: true,
    });
    expect(payload.shippingAssignment.shipping).toEqual({
      address: {},
      method: "",
    });
    expect(
      toWebhookPayload(undefined, undefined).shippingAssignment.items,
    ).toEqual([]);
  });
});

describe("loadStorefrontCart", () => {
  const path = `guest-carts/${MASKED}`;

  test("loads the cart and totals", async () => {
    const commerce = fakeCommerce({ [path]: cart, [`${path}/totals`]: totals });
    const result = await loadStorefrontCart(commerce, MASKED);
    expect(result.quoteId).toBe(321);
    expect(result.currency).toBe("USD");
    expect(commerce.get).toHaveBeenCalledTimes(2);
  });

  test("rejects invalid IDs without calling Commerce", async () => {
    const commerce = fakeCommerce({});
    await expect(loadStorefrontCart(commerce, "x")).rejects.toBeInstanceOf(
      CartNotFoundError,
    );
    expect(commerce.get).not.toHaveBeenCalled();
  });

  test("maps 404s and empty carts to CartNotFoundError", async () => {
    await expect(
      loadStorefrontCart(
        fakeCommerce({ [path]: httpError(404), [`${path}/totals`]: totals }),
        MASKED,
      ),
    ).rejects.toBeInstanceOf(CartNotFoundError);
    await expect(
      loadStorefrontCart(
        fakeCommerce({ [path]: {}, [`${path}/totals`]: {} }),
        MASKED,
      ),
    ).rejects.toBeInstanceOf(CartNotFoundError);
  });

  test("rethrows other errors", async () => {
    await expect(
      loadStorefrontCart(
        fakeCommerce({ [path]: httpError(500), [`${path}/totals`]: totals }),
        MASKED,
      ),
    ).rejects.toThrow("HTTP 500");
  });
});
