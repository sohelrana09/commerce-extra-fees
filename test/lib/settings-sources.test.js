import { describe, expect, test } from "vitest";

import { normaliseCart } from "../../src/common/fees/cart.js";
import { previewPayload } from "../../src/common/fees/preview.js";
import {
  DEFAULT_SETTINGS,
  parseSettings,
} from "../../src/common/fees/settings.js";
import { rulesFromInput } from "../../src/common/fees/sources.js";

describe("parseSettings", () => {
  test("defaults when nothing is configured", () => {
    expect(parseSettings()).toEqual(DEFAULT_SETTINGS);
  });

  test("reads booleans and numbers stored as strings", () => {
    expect(
      parseSettings([
        { name: "feesEnabled", value: "false" },
        { name: "catalogCacheMinutes", value: "15" },
      ]),
    ).toEqual({ catalogCacheMinutes: 15, feesEnabled: false });
    expect(
      parseSettings([{ name: "feesEnabled", value: true }]).feesEnabled,
    ).toBe(true);
  });

  test("ignores invalid cache minutes", () => {
    expect(
      parseSettings([{ name: "catalogCacheMinutes", value: "-3" }])
        .catalogCacheMinutes,
    ).toBe(60);
    expect(
      parseSettings([{ name: "catalogCacheMinutes", value: null }])
        .catalogCacheMinutes,
    ).toBe(60);
  });
});

describe("rulesFromInput", () => {
  test("null when FEE_RULES is unset or blank", () => {
    expect(rulesFromInput({})).toBeNull();
    expect(rulesFromInput({ FEE_RULES: "  " })).toBeNull();
  });

  test("accepts arrays, objects and JSON strings", () => {
    expect(rulesFromInput({ FEE_RULES: [{ code: "a" }] })).toEqual([
      { code: "a" },
    ]);
    expect(rulesFromInput({ FEE_RULES: '{"rules":[{"code":"b"}]}' })).toEqual([
      { code: "b" },
    ]);
  });

  test("rejects bad input", () => {
    expect(() => rulesFromInput({ FEE_RULES: "{x" })).toThrow("not valid JSON");
    expect(() => rulesFromInput({ FEE_RULES: '{"a":1}' })).toThrow(
      "must be an array",
    );
  });
});

describe("previewPayload", () => {
  test("builds a payload the engine reads like a real cart", () => {
    const cart = normaliseCart(
      previewPayload({
        country: "US",
        customerGroup: 2,
        discount: 5,
        items: [{ price: 20, qty: 3, sku: "A" }],
        shippingAmount: 7,
        storeId: 3,
      }),
    );
    expect(cart).toMatchObject({
      address: { country: "US" },
      customer: { groupId: 2, isGuest: false },
      discount: 5,
      shippingAmount: 7,
      storeId: 3,
      subtotal: 60,
    });
  });

  test("an explicit subtotal and guest flag win", () => {
    const cart = normaliseCart(
      previewPayload({
        isGuest: true,
        items: [{ price: 1, sku: "A" }],
        subtotal: 99,
      }),
    );
    expect(cart.subtotal).toBe(99);
    expect(cart.customer.isGuest).toBe(true);
    expect(normaliseCart(previewPayload()).itemCount).toBe(0);
  });
});
