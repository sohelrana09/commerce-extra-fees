import { describe, expect, test, vi } from "vitest";

import { normaliseCart } from "../../src/common/fees/cart.js";
import { DEFAULT_RULES } from "../../src/common/fees/default-rules.js";
import {
  calculateAmount,
  calculateFees,
  chosenOptions,
  describeOptions,
  needsCatalog,
  validateRule,
} from "../../src/common/fees/engine.js";
import { item, payload } from "../fixtures/payloads.js";

const cartOf = (opts) => normaliseCart(payload(opts));

function rule(overrides = {}) {
  return {
    calc: { fixed: 15, mode: "fixed" },
    code: "test_fee",
    label: "Test fee",
    ...overrides,
  };
}

describe("calculation modes", () => {
  // Two lines: 2 × $50 and 1 × $100 → subtotal $200, shipping $10, discount $20.
  const cart = cartOf({
    discount: 20,
    items: [
      item({ item_id: 1, qty: 2 }),
      item({ base_price: 100, item_id: 2, price: 100, sku: "B" }),
    ],
  });
  const r = rule();

  test.each([
    [{ fixed: 15, mode: "fixed" }, 15],
    [{ applyPer: "item", fixed: 2, mode: "fixed" }, 4],
    [{ applyPer: "unit", fixed: 2, mode: "fixed" }, 6],
    [{ mode: "percent", percent: 5 }, 10],
    [{ base: { includeDiscount: true }, mode: "percent", percent: 5 }, 9],
    [{ base: { includeShipping: true }, mode: "percent", percent: 5 }, 10.5],
    [{ fixed: 3, mode: "fixed_plus_percent", percent: 1 }, 5],
    [{ fixed: 3, mode: "max_of", percent: 1 }, 3],
    [{ fixed: 1, mode: "max_of", percent: 1 }, 2],
    [{ max: 7, mode: "percent", percent: 5 }, 7],
    [{ min: 12, mode: "percent", percent: 5 }, 12],
    [{ mode: "percent", percent: 3.333 }, 6.67],
  ])("%j → %s", (calc, expected) => {
    expect(calculateAmount(r, calc, cart, cart.items)).toBe(expected);
  });

  test("percent of matching lines only when the rule filters items", () => {
    const filtered = rule({ items: { field: "sku", op: "eq", value: "B" } });
    const lines = cart.items.filter((line) => line.sku === "B");
    expect(
      calculateAmount(filtered, { mode: "percent", percent: 10 }, cart, lines),
    ).toBe(10);
  });

  test("never goes below zero", () => {
    const tiny = cartOf({ discount: 500 });
    expect(
      calculateAmount(
        r,
        { base: { includeDiscount: true }, mode: "percent", percent: 10 },
        tiny,
        tiny.items,
      ),
    ).toBe(0);
  });
});

describe("eligibility", () => {
  test("small-order fee applies under the threshold only (max is exclusive)", () => {
    const smallOrder = rule({ subtotal: { max: 250 } });
    expect(
      calculateFees([smallOrder], cartOf({ subtotal: 249.99 })),
    ).toHaveLength(1);
    expect(calculateFees([smallOrder], cartOf({ subtotal: 250 }))).toHaveLength(
      0,
    );
    expect(
      calculateFees(
        [rule({ subtotal: { min: 100 } })],
        cartOf({ subtotal: 100 }),
      ),
    ).toHaveLength(1);
  });

  test("disabled rules and empty carts never charge", () => {
    expect(calculateFees([rule({ enabled: false })], cartOf())).toEqual([]);
    expect(calculateFees([rule()], cartOf({ items: [] }))).toEqual([]);
  });

  test("store views and customer groups (empty = all)", () => {
    const scoped = rule({ customerGroups: [2, 3], stores: [1] });
    expect(
      calculateFees([scoped], cartOf({ groupId: 2, storeId: 1 })),
    ).toHaveLength(1);
    expect(
      calculateFees([scoped], cartOf({ groupId: 1, storeId: 1 })),
    ).toHaveLength(0);
    expect(
      calculateFees([scoped], cartOf({ groupId: 2, storeId: 2 })),
    ).toHaveLength(0);
    expect(
      calculateFees([rule({ customerGroups: [], stores: [] })], cartOf()),
    ).toHaveLength(1);
  });

  test("cart conditions: country, postcode, shipping method", () => {
    const remote = rule({
      conditions: {
        all: [
          { field: "country", op: "eq", value: "US" },
          {
            any: [
              { field: "region", op: "in", value: "AK,HI" },
              { field: "postcode", op: "starts_with", value: "996" },
            ],
          },
          { field: "shipping_method", op: "neq", value: "instore_pickup" },
        ],
      },
    });
    expect(calculateFees([remote], cartOf({ region: "HI" }))).toHaveLength(1);
    expect(
      calculateFees([remote], cartOf({ postcode: "99611", region: "XX" })),
    ).toHaveLength(1);
    expect(calculateFees([remote], cartOf({ region: "CA" }))).toHaveLength(0);
    expect(
      calculateFees(
        [remote],
        cartOf({ method: "instore_pickup", region: "HI" }),
      ),
    ).toHaveLength(0);
  });

  test("item filters: no matching line, no fee; per-unit counts matching lines only", () => {
    const oversize = rule({
      calc: { applyPer: "unit", fixed: 4.5, mode: "fixed" },
      items: { field: "attr.oversize", op: "eq", value: "1" },
    });
    const cart = cartOf({
      items: [
        item({ qty: 3, sku: "BIG" }),
        item({ item_id: 2, qty: 5, sku: "SMALL" }),
      ],
    });
    expect(calculateFees([oversize], cart, { catalog: {} })).toEqual([]);
    expect(
      calculateFees([oversize], cart, {
        catalog: { BIG: { attributes: { oversize: "1" } } },
      }),
    ).toEqual([{ base_fee: 13.5, code: "test_fee", label: "Test fee" }]);
  });
});

describe("optional and required fees", () => {
  const insurance = rule({
    calc: undefined,
    code: "insurance",
    input: "radio",
    label: "Insurance",
    options: [
      { calc: { fixed: 5 }, code: "basic", default: true, label: "Basic" },
      { calc: { fixed: 10 }, code: "full", label: "Full" },
    ],
    type: "optional",
  });

  test("optional fees charge only what the buyer chose", () => {
    const cart = cartOf();
    expect(calculateFees([insurance], cart)).toEqual([]);
    expect(
      calculateFees([insurance], cart, { selections: { insurance: "full" } }),
    ).toEqual([
      { base_fee: 10, code: "insurance__full", label: "Insurance: Full" },
    ]);
    expect(
      calculateFees([insurance], cart, { selections: { insurance: "nope" } }),
    ).toEqual([]);
  });

  test("radio and dropdown keep one choice; checkbox keeps all", () => {
    expect(
      chosenOptions(insurance, ["full", "basic"]).map((o) => o.code),
    ).toEqual(["full"]);
    const extras = { ...insurance, input: "checkbox" };
    expect(chosenOptions(extras, ["full", "basic"]).map((o) => o.code)).toEqual(
      ["full", "basic"],
    );
  });

  test("an optional fee without options is a simple checkbox", () => {
    const giftWrap = rule({ code: "gift_wrap", type: "optional" });
    expect(calculateFees([giftWrap], cartOf())).toEqual([]);
    expect(
      calculateFees([giftWrap], cartOf(), { selections: { gift_wrap: true } }),
    ).toHaveLength(1);
  });

  test("required fees fall back to the default, then to the first option", () => {
    const required = { ...insurance, type: "required" };
    expect(chosenOptions(required, undefined).map((o) => o.code)).toEqual([
      "basic",
    ]);
    expect(chosenOptions(required, "full").map((o) => o.code)).toEqual([
      "full",
    ]);
    const noDefault = {
      ...required,
      options: required.options.map((o) => ({ ...o, default: false })),
    };
    expect(chosenOptions(noDefault, undefined).map((o) => o.code)).toEqual([
      "basic",
    ]);
  });

  test("automatic rules with options charge their default options", () => {
    const auto = { ...insurance, type: "automatic" };
    expect(calculateFees([auto], cartOf()).map((f) => f.code)).toEqual([
      "insurance__basic",
    ]);
  });

  test("describeOptions lists choosable fees with prices and the current choice", () => {
    const [described] = describeOptions([insurance, rule()], cartOf(), {
      selections: { insurance: "full" },
    });
    expect(described).toMatchObject({
      code: "insurance",
      input: "radio",
      options: [
        { amount: 5, code: "basic", selected: false },
        { amount: 10, code: "full", selected: true },
      ],
      selected: true,
    });
    const [plain] = describeOptions([rule({ type: "optional" })], cartOf(), {
      selections: { test_fee: true },
    });
    expect(plain).toMatchObject({ amount: 15, options: [], selected: true });
  });
});

describe("output", () => {
  test("sorts by sortOrder and drops zero fees", () => {
    const fees = calculateFees(
      [
        rule({ code: "b", label: "B", sortOrder: 20 }),
        rule({ code: "a", label: "A", sortOrder: 10 }),
        rule({ calc: { fixed: 0 }, code: "zero", label: "Zero" }),
      ],
      cartOf(),
    );
    expect(fees.map((f) => f.code)).toEqual(["a", "b"]);
  });

  test("invalid rules are skipped and reported", () => {
    const onSkip = vi.fn();
    const fees = calculateFees([rule({ code: "Bad Code" }), rule()], cartOf(), {
      onSkip,
    });
    expect(fees).toHaveLength(1);
    expect(onSkip).toHaveBeenCalledOnce();
  });
});

describe("validateRule", () => {
  test("accepts every bundled default rule", () => {
    for (const r of DEFAULT_RULES) {
      expect(validateRule(r)).toEqual([]);
    }
  });

  test("ships with every fee switched off", () => {
    expect(DEFAULT_RULES.every((r) => r.enabled === false)).toBe(true);
    expect(calculateFees(DEFAULT_RULES, cartOf({ subtotal: 10 }))).toEqual([]);
  });

  test("reports each problem", () => {
    expect(validateRule(null)).toEqual(["Rule must be an object"]);
    const errors = validateRule({
      calc: { applyPer: "box", fixed: -1, mode: "free" },
      code: "x",
      input: "slider",
      options: [{ code: "a" }, { code: "a" }, { code: "B!" }],
      type: "sometimes",
    });
    expect(errors.join("\n")).toMatch("label is required");
    expect(errors.join("\n")).toMatch("type must be");
    expect(errors.join("\n")).toMatch("input must be");
    expect(errors.join("\n")).toMatch("calc.mode must be");
    expect(errors.join("\n")).toMatch("applyPer must be");
    expect(errors.join("\n")).toMatch("calc.fixed must be");
    expect(errors.join("\n")).toMatch("duplicate option code");
    expect(errors.join("\n")).toMatch("option needs a code");
    expect(validateRule({ code: "x", label: "X" })).toEqual([
      "calc is required when there are no options",
    ]);
    expect(
      validateRule({ code: "x", label: "X", options: [{ code: "a" }] }),
    ).toEqual(['option "a" needs a calc (or a rule-level calc)']);
  });

  test("needsCatalog only when a rule reads categories or attributes", () => {
    expect(needsCatalog([rule()])).toBe(false);
    expect(
      needsCatalog([
        rule({ items: { field: "category_ids", op: "in", value: "3" } }),
      ]),
    ).toBe(true);
    expect(
      needsCatalog([
        rule({
          conditions: { any: [{ field: "attr.hazmat", op: "eq", value: 1 }] },
        }),
      ]),
    ).toBe(true);
  });
});
