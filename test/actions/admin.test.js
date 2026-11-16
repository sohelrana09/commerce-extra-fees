import { describe, expect, test, vi } from "vitest";

import { createHandlers } from "../../src/commerce-backend-ui-2/actions/handlers.js";
import { adminAction } from "../../src/commerce-backend-ui-2/actions/http.js";
import { RuleValidationError } from "../../src/common/fees/rules-repo.js";
import { json, readBody } from "../../src/common/http.js";

const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() };
const smallOrder = {
  calc: { fixed: 15 },
  code: "small_order_fee",
  label: "Small order fee",
  subtotal: { max: 250 },
};

describe("http helpers", () => {
  test("json and readBody", () => {
    expect(json(201, { a: 1 })).toEqual({
      body: { a: 1 },
      headers: { "Content-Type": "application/json" },
      statusCode: 201,
    });
    expect(readBody({ body: '{"a":1}' })).toEqual({ a: 1 });
    expect(readBody({ body: "{bad" })).toEqual({});
    expect(readBody({ body: { b: 2 } })).toEqual({ b: 2 });
    expect(readBody({ __ow_method: "post", code: "x" })).toEqual({ code: "x" });
  });

  test("adminAction maps validation errors to 400 and others to 500 without details", async () => {
    const invalid = adminAction("t", () => {
      throw new RuleValidationError(["label is required"]);
    });
    expect(await invalid({})).toMatchObject({
      body: { errors: ["label is required"] },
      statusCode: 400,
    });

    const broken = adminAction("t", () => {
      throw new Error("secret connection string");
    });
    const response = await broken({});
    expect(response.statusCode).toBe(500);
    expect(JSON.stringify(response.body)).not.toContain("secret");
  });
});

describe("admin handlers", () => {
  test("rulesList returns saved rules and the examples", async () => {
    const h = createHandlers({ listRules: async () => [smallOrder] });
    const response = await h.rulesList({}, {});
    expect(response.body.rules).toEqual([smallOrder]);
    expect(response.body.examples.length).toBeGreaterThan(0);
  });

  test("ruleSave passes the previous code and requires a rule", async () => {
    const saveRule = vi.fn(async (rule) => rule);
    const h = createHandlers({ saveRule });
    const response = await h.ruleSave(
      { previousCode: "old", rule: smallOrder },
      {},
    );
    expect(response.statusCode).toBe(200);
    expect(saveRule).toHaveBeenCalledWith(
      smallOrder,
      {},
      { previousCode: "old" },
    );
    await expect(h.ruleSave({}, {})).rejects.toBeInstanceOf(
      RuleValidationError,
    );
  });

  test("ruleDelete returns 404 for unknown codes and requires a code", async () => {
    const h = createHandlers({ deleteRule: async (code) => code === "a" });
    expect((await h.ruleDelete({ code: "a" }, {})).statusCode).toBe(200);
    expect((await h.ruleDelete({ code: "b" }, {})).statusCode).toBe(404);
    await expect(h.ruleDelete({}, {})).rejects.toBeInstanceOf(
      RuleValidationError,
    );
  });

  test("rulePreview runs the saved rules against a sample cart", async () => {
    const insurance = {
      code: "insurance",
      input: "radio",
      label: "Insurance",
      options: [{ calc: { fixed: 5 }, code: "basic", label: "Basic" }],
      type: "optional",
    };
    const h = createHandlers({
      listRules: async () => [smallOrder, insurance, { code: "BAD" }],
    });
    const response = await h.rulePreview(
      {
        cart: { items: [{ price: 50, qty: 2, sku: "A" }] },
        selections: { insurance: "basic" },
      },
      {},
    );
    expect(response.body).toMatchObject({
      fees: [
        { base_fee: 15, code: "small_order_fee" },
        { base_fee: 5, code: "insurance__basic" },
      ],
      invalid: [{ code: "BAD" }],
      subtotal: 100,
      total: 20,
    });
    expect(response.body.options[0].code).toBe("insurance");
  });

  test("rulePreview can test unsaved rules and loads the catalog when needed", async () => {
    const loadCatalog = vi.fn(async () => ({
      A: { attributes: { oversize: "1" } },
    }));
    const listRules = vi.fn();
    const h = createHandlers({ listRules, loadCatalog });
    const oversize = {
      calc: { applyPer: "unit", fixed: 2 },
      code: "oversize",
      items: { field: "attr.oversize", op: "eq", value: "1" },
      label: "Oversize",
    };
    const response = await h.rulePreview(
      { cart: { items: [{ price: 1, qty: 3, sku: "A" }] }, rules: [oversize] },
      {},
    );
    expect(listRules).not.toHaveBeenCalled();
    expect(loadCatalog).toHaveBeenCalledWith(["A"], {});
    expect(response.body.total).toBe(6);
  });

  test("lookups maps store views and groups, and degrades when Commerce is down", async () => {
    const commerce = {
      get: (path) => ({
        json: async () =>
          path === "store/storeViews"
            ? [
                { code: "admin", id: 0, name: "Admin" },
                { code: "default", id: 1, name: "Default Store View" },
              ]
            : { items: [{ code: "General", id: 1 }] },
      }),
    };
    const h = createHandlers({ getCommerce: async () => commerce });
    expect((await h.lookups({}, {}, logger)).body).toEqual({
      customerGroups: [{ id: 1, label: "General" }],
      storeViews: [{ code: "default", id: 1, label: "Default Store View" }],
    });

    const down = createHandlers({
      getCommerce: async () => {
        throw new Error("no association");
      },
    });
    expect((await down.lookups({}, {}, logger)).body.unavailable).toBe(true);
  });

  test("catalogRefresh reports how many products were cleared", async () => {
    const h = createHandlers({ clearCatalogCache: async () => 4 });
    expect((await h.catalogRefresh({}, {})).body).toEqual({ removed: 4 });
  });

  test("feeReport passes only the report fields through", async () => {
    const feeReport = vi.fn(async (request) => ({ request, rows: [] }));
    const h = createHandlers({ feeReport });
    const response = await h.feeReport(
      { extra: 1, from: "2026-11-01", groupBy: "day", to: "2026-11-30" },
      { p: 1 },
    );
    expect(feeReport).toHaveBeenCalledWith(
      { from: "2026-11-01", groupBy: "day", to: "2026-11-30" },
      { p: 1 },
    );
    expect(response.statusCode).toBe(200);
  });

  test("an invalid report request is a 400", async () => {
    const main = adminAction("fee-report", createHandlers().feeReport);
    const response = await main({ from: "nope", LOG_LEVEL: "error" });
    expect(response.statusCode).toBe(400);
    expect(response.body.errors[0]).toContain("from must be a date");
  });
});
