import { describe, expect, test, vi } from "vitest";

import { main as cleanup } from "../../src/commerce-extensibility-1/actions/cleanup/index.js";
import { createRecordOrderFees } from "../../src/commerce-extensibility-1/actions/record-order-fees/handler.js";
import { main } from "../../src/commerce-extensibility-1/actions/record-order-fees/index.js";

const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() };
const order = {
  base_subtotal: 50,
  created_at: "2026-11-02 10:00:00",
  entity_id: 8,
  increment_id: "000000008",
  items: [{ base_price: 50, item_id: 1, qty_ordered: 1, sku: "A" }],
  quote_id: 77,
};
const smallOrder = {
  calc: { fixed: 15 },
  code: "small",
  label: "Small order",
  subtotal: { max: 100 },
};
const event = { data: { value: { entity_id: 8, quote_id: 77 } } };

function setup(overrides = {}) {
  const deps = {
    deleteSelections: vi.fn(async () => true),
    getCommerce: vi.fn(async () => ({})),
    loadCatalog: vi.fn(async () => ({})),
    loadOrder: vi.fn(async () => order),
    loadRules: vi.fn(async () => [smallOrder]),
    loadSelections: vi.fn(async () => ({})),
    loadSettings: vi.fn(async () => ({
      catalogCacheMinutes: 1,
      feesEnabled: true,
    })),
    saveOrderRecord: vi.fn(async (record) => record),
    ...overrides,
  };
  return { deps, run: createRecordOrderFees(deps) };
}

describe("record-order-fees", () => {
  test("records the order's fees and clears the buyer's choices", async () => {
    const { deps, run } = setup();
    expect(await run(event, logger)).toEqual({
      fees: 1,
      recorded: true,
      status: "recalculated",
    });
    expect(deps.saveOrderRecord.mock.calls[0][0]).toMatchObject({
      feeTotal: 15,
      orderId: "8",
      quoteId: "77",
    });
    expect(deps.loadSelections).toHaveBeenCalledWith(77, event, { logger });
    expect(deps.deleteSelections).toHaveBeenCalledWith(77, event);
  });

  test("passes cache settings to the catalog lookup", async () => {
    const { deps, run } = setup({
      loadRules: vi.fn(async () => [
        {
          ...smallOrder,
          items: { field: "category_ids", op: "in", value: "1" },
        },
      ]),
    });
    await run(event, logger);
    expect(deps.loadCatalog).toHaveBeenCalledWith(["A"], event, {
      logger,
      ttlMs: 60_000,
    });
  });

  test("records nothing when no fee applies or fees are off", async () => {
    const none = setup({ loadRules: vi.fn(async () => []) });
    expect((await none.run(event, logger)).recorded).toBe(false);
    expect(none.deps.saveOrderRecord).not.toHaveBeenCalled();
    expect(none.deps.deleteSelections).toHaveBeenCalled();

    const off = setup({
      loadSettings: vi.fn(async () => ({ feesEnabled: false })),
    });
    expect(await off.run(event, logger)).toMatchObject({ status: "disabled" });
    expect(off.deps.loadRules).not.toHaveBeenCalled();
  });

  test("skips events without an order and orders Commerce can't find", async () => {
    const { deps, run } = setup({ loadOrder: vi.fn(async () => null) });
    expect(await run({ data: {} }, logger)).toEqual({
      recorded: false,
      status: "no-order-id",
    });
    expect(await run(event, logger)).toEqual({
      recorded: false,
      status: "not-found",
    });
    expect(deps.saveOrderRecord).not.toHaveBeenCalled();

    const noQuote = setup({
      loadOrder: vi.fn(async () => ({ ...order, quote_id: null })),
    });
    await noQuote.run(event, logger);
    expect(noQuote.deps.deleteSelections).not.toHaveBeenCalled();
  });

  test("main fails the activation so I/O Events retries", async () => {
    await expect(main({ ...event, LOG_LEVEL: "error" })).rejects.toThrow();
  });
});

describe("cleanup", () => {
  test("purges and reports counts", async () => {
    const purge = vi.fn(async () => ({ catalog: 2, selections: 3 }));
    expect(await cleanup({ LOG_LEVEL: "error" }, purge)).toEqual({
      body: { catalog: 2, selections: 3 },
      statusCode: 200,
    });
  });
});
