import { describe, expect, test, vi } from "vitest";

import { createFeeOptions } from "../../src/commerce-extensibility-1/actions/fee-options/handler.js";
import { main } from "../../src/commerce-extensibility-1/actions/fee-options/index.js";
import { CartNotFoundError } from "../../src/common/fees/storefront-cart.js";
import { payload } from "../fixtures/payloads.js";

const logger = { error: vi.fn(), warn: vi.fn() };
const rules = [
  {
    calc: { fixed: 5 },
    code: "insurance",
    description: "Covers loss",
    label: "Insurance",
    type: "optional",
  },
  {
    code: "delivery",
    input: "radio",
    label: "Delivery",
    options: [
      {
        calc: { fixed: 0 },
        code: "standard",
        default: true,
        label: "Standard",
      },
      { calc: { fixed: 9 }, code: "express", label: "Express" },
    ],
    type: "required",
  },
  { calc: { fixed: 1 }, code: "auto", label: "Auto" },
];

function setup(overrides = {}) {
  const deps = {
    getCommerce: vi.fn(async () => ({})),
    getSelections: vi.fn(async () => ({})),
    loadCatalog: vi.fn(async () => ({})),
    loadRules: vi.fn(async () => rules),
    loadSettings: vi.fn(async () => ({
      catalogCacheMinutes: 5,
      feesEnabled: true,
    })),
    loadStorefrontCart: vi.fn(async () => ({
      currency: "USD",
      payload: payload({ subtotal: 100 }),
      quoteId: 100,
    })),
    saveSelections: vi.fn(async () => undefined),
    ...overrides,
  };
  return { deps, run: createFeeOptions(deps) };
}

describe("fee-options", () => {
  test("lists choosable fees with prices and saved choices", async () => {
    const { deps, run } = setup({
      getSelections: vi.fn(async () => ({ delivery: "express" })),
    });
    const response = await run({ cartId: "masked" }, {}, logger);
    expect(response.statusCode).toBe(200);
    expect(response.headers["Cache-Control"]).toBe("no-store");
    expect(response.body.currency).toBe("USD");
    expect(response.body.fees.map((fee) => fee.code)).toEqual([
      "insurance",
      "delivery",
    ]);
    expect(response.body.fees[1].options.find((o) => o.selected).code).toBe(
      "express",
    );
    expect(deps.getSelections).toHaveBeenCalledWith(100, {});
    expect(deps.saveSelections).not.toHaveBeenCalled();
    expect(deps.loadCatalog).not.toHaveBeenCalled();
  });

  test("saves only valid choices", async () => {
    const { deps, run } = setup();
    const response = await run(
      {
        cartId: "masked",
        selections: { auto: true, delivery: "express", insurance: true },
      },
      {},
      logger,
    );
    expect(deps.saveSelections).toHaveBeenCalledWith(
      100,
      { delivery: "express", insurance: true },
      {},
    );
    expect(response.body.fees[0].selected).toBe(true);
  });

  test("looks up the catalog for category rules", async () => {
    const { deps, run } = setup({
      loadRules: vi.fn(async () => [
        { ...rules[0], items: { field: "category_ids", op: "in", value: "3" } },
      ]),
    });
    await run({ cartId: "masked" }, {}, logger);
    expect(deps.loadCatalog).toHaveBeenCalledWith(
      ["WIDGET-1"],
      {},
      {
        logger,
        ttlMs: 300_000,
      },
    );
  });

  test("returns no fees when the app is switched off", async () => {
    const { deps, run } = setup({
      loadSettings: vi.fn(async () => ({ feesEnabled: false })),
    });
    const response = await run({ cartId: "masked" }, {}, logger);
    expect(response.body).toEqual({ currency: null, fees: [] });
    expect(deps.loadStorefrontCart).not.toHaveBeenCalled();
  });

  test("answers 404 for an unknown cart and rethrows other errors", async () => {
    const missing = setup({
      loadStorefrontCart: vi.fn(async () => {
        throw new CartNotFoundError();
      }),
    });
    expect((await missing.run({ cartId: "x" }, {}, logger)).statusCode).toBe(
      404,
    );

    const broken = setup({
      getCommerce: vi.fn(async () => {
        throw new Error("auth");
      }),
    });
    await expect(broken.run({ cartId: "x" }, {}, logger)).rejects.toThrow(
      "auth",
    );
  });

  test("main hides internal errors from the browser", async () => {
    const response = await main({ body: "{}", LOG_LEVEL: "error" });
    expect(response.statusCode).toBe(500);
    expect(response.body).toEqual({ error: "Fees are unavailable right now." });
  });
});
