import { describe, expect, test } from "vitest";

import { normaliseCart } from "../../src/common/fees/cart.js";
import {
  compare,
  fieldsUsed,
  matchesCart,
  matchesItem,
} from "../../src/common/fees/conditions.js";
import { item, payload } from "../fixtures/payloads.js";

describe("compare", () => {
  test.each([
    [10, "gt", 5, true],
    [5, "gte", 5, true],
    [5, "lt", 5, false],
    [5, "lte", 5, true],
    [7, "between", "5,10", true],
    [11, "between", [5, 10], false],
    ["abc", "gt", 1, false],
    ["US", "eq", "us", true],
    ["2", "eq", 2, true],
    ["US", "neq", "CA", true],
    ["US", "in", "CA, US", true],
    ["US", "nin", ["CA", "MX"], true],
    ["Express Freight", "contains", "freight", true],
    ["SW1A 1AA", "starts_with", "sw1, ec", true],
    ["N1 9GU", "starts_with", "SW1", false],
    [[3, 4], "in", "4", true],
    [[3, 4], "nin", "4", false],
  ])("%j %s %j → %s", (actual, op, expected, result) => {
    expect(compare(actual, op, expected)).toBe(result);
  });

  test("rejects unknown operators", () => {
    expect(() => compare("a", "like", "a")).toThrow("Unknown operator");
  });
});

describe("condition trees", () => {
  const cart = normaliseCart(payload({ country: "US", groupId: 2 }));

  test("all / any / not", () => {
    expect(
      matchesCart(
        {
          all: [
            { field: "country", op: "eq", value: "US" },
            {
              any: [
                { field: "customer_group", op: "in", value: "2,3" },
                { field: "qty", op: "gt", value: 99 },
              ],
            },
            { not: { field: "postcode", op: "starts_with", value: "10" } },
          ],
        },
        cart,
      ),
    ).toBe(true);
    expect(matchesCart({ any: [] }, cart)).toBe(false);
    expect(matchesCart({ all: [] }, cart)).toBe(true);
    expect(matchesCart(undefined, cart)).toBe(true);
  });

  test("missing values only satisfy negative operators", () => {
    const [line] = normaliseCart(payload()).items;
    expect(
      matchesItem({ field: "attr.color", op: "eq", value: "red" }, line, {}),
    ).toBe(false);
    expect(
      matchesItem({ field: "attr.color", op: "neq", value: "red" }, line, {}),
    ).toBe(true);
  });

  test("item fields read the catalog for categories and attributes", () => {
    const [line] = normaliseCart(
      payload({ items: [item({ sku: "BIG" })] }),
    ).items;
    const catalog = {
      BIG: { attributes: { oversize: "1" }, categoryIds: [12, 40] },
    };
    expect(
      matchesItem(
        { field: "category_ids", op: "in", value: "40" },
        line,
        catalog,
      ),
    ).toBe(true);
    expect(
      matchesItem(
        { field: "attr.oversize", op: "eq", value: 1 },
        line,
        catalog,
      ),
    ).toBe(true);
  });

  test("rejects unknown fields and malformed nodes", () => {
    expect(() =>
      matchesCart({ field: "colour", op: "eq", value: 1 }, cart),
    ).toThrow("Unknown cart field");
    expect(() =>
      matchesItem({ field: "colour", op: "eq", value: 1 }, cart.items[0]),
    ).toThrow("Unknown item field");
    expect(() => matchesCart({ foo: 1 }, cart)).toThrow("Invalid condition");
  });

  test("fieldsUsed lists every field", () => {
    const fields = fieldsUsed({
      all: [
        { field: "sku" },
        { any: [{ field: "attr.size" }] },
        { not: { field: "qty" } },
      ],
    });
    expect([...fields].sort()).toEqual(["attr.size", "qty", "sku"]);
  });
});
