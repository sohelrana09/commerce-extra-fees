import { beforeEach, describe, expect, test, vi } from "vitest";

import { main } from "../../src/commerce-extensibility-1/actions/calculate-fees/index.js";
import { payload } from "../fixtures/payloads.js";

const mocks = vi.hoisted(() => ({
  catalog: vi.fn(async () => ({})),
  savedRules: vi.fn(async () => []),
  selections: vi.fn(async () => ({})),
  settings: vi.fn(async () => ({ catalogCacheMinutes: 60, feesEnabled: true })),
}));

vi.mock("../../src/common/fees/settings.js", () => ({
  loadSettings: mocks.settings,
}));
vi.mock("../../src/common/fees/rules-repo.js", () => ({
  listRulesCached: mocks.savedRules,
}));
vi.mock("../../src/common/fees/selections.js", async (importOriginal) => ({
  ...(await importOriginal()),
  getSelections: mocks.selections,
}));
vi.mock("../../src/common/fees/catalog.js", () => ({
  loadCatalogEntries: mocks.catalog,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

// With require-adobe-auth: true, the webhook fields arrive as top-level params. ENABLE_TELEMETRY
// mirrors the action input from ext.config.yaml, which aio-lib-telemetry expects on params.
const SMALL_ORDER = [
  {
    calc: { fixed: 15, mode: "fixed" },
    code: "small_order_fee",
    label: "Small order fee",
    subtotal: { max: 250 },
  },
];

function run(body, rules = SMALL_ORDER) {
  return main({
    ENABLE_TELEMETRY: true,
    FEE_RULES: JSON.stringify(rules),
    ...body,
  });
}

describe("calculate-fees action", () => {
  test("replaces result/fees when a fee applies", async () => {
    const response = await run(payload({ subtotal: 100 }));
    expect(response).toMatchObject({ statusCode: 200, type: "success" });
    expect(response.body).toEqual([
      {
        op: "replace",
        path: "result/fees",
        value: [
          { base_fee: 15, code: "small_order_fee", label: "Small order fee" },
        ],
      },
    ]);
  });

  test("answers success when no fee applies", async () => {
    const response = await run(payload({ subtotal: 300 }));
    expect(response.body).toEqual([{ op: "success" }]);
  });

  test("answers success for an empty cart", async () => {
    const response = await run(payload({ items: [] }));
    expect(response.body).toEqual([{ op: "success" }]);
  });

  test("accepts { rules: [...] } in FEE_RULES", async () => {
    const response = await run(payload({ subtotal: 100 }), {
      rules: SMALL_ORDER,
    });
    expect(response.body[0].value).toHaveLength(1);
  });

  test("uses the rules saved on the Admin page when FEE_RULES is unset", async () => {
    mocks.savedRules.mockResolvedValueOnce(SMALL_ORDER);
    const response = await main({
      ENABLE_TELEMETRY: true,
      ...payload({ subtotal: 1 }),
    });
    expect(mocks.savedRules).toHaveBeenCalledOnce();
    expect(response.body[0].value[0].code).toBe("small_order_fee");
  });

  test("charges nothing when fees are switched off in App Management", async () => {
    mocks.settings.mockResolvedValueOnce({
      catalogCacheMinutes: 60,
      feesEnabled: false,
    });
    const response = await run(payload({ subtotal: 100 }));
    expect(response.body).toEqual([{ op: "success" }]);
  });

  test("loads product data only for rules that need it, with the configured cache time", async () => {
    mocks.catalog.mockResolvedValueOnce({
      "WIDGET-1": { attributes: { oversize: "1" }, categoryIds: [] },
    });
    const oversize = [
      {
        calc: { applyPer: "unit", fixed: 4.5 },
        code: "oversize",
        items: { field: "attr.oversize", op: "eq", value: "1" },
        label: "Oversize",
      },
    ];
    const response = await run(payload(), oversize);
    expect(mocks.catalog).toHaveBeenCalledWith(
      ["WIDGET-1"],
      expect.any(Object),
      expect.objectContaining({ ttlMs: 3_600_000 }),
    );
    expect(response.body[0].value).toEqual([
      { base_fee: 4.5, code: "oversize", label: "Oversize" },
    ]);

    await run(payload({ subtotal: 100 }));
    expect(mocks.catalog).toHaveBeenCalledOnce();
  });

  test("never blocks the cart when the database is down", async () => {
    mocks.savedRules.mockRejectedValueOnce(new Error("db unavailable"));
    const response = await main({ ENABLE_TELEMETRY: true, ...payload() });
    expect(response).toMatchObject({
      body: [{ op: "success" }],
      statusCode: 200,
    });
  });

  test("never blocks the cart: bad configuration charges no fee", async () => {
    const badJson = await main({
      ENABLE_TELEMETRY: true,
      FEE_RULES: "{not json",
      ...payload(),
    });
    expect(badJson).toMatchObject({
      body: [{ op: "success" }],
      statusCode: 200,
    });

    const wrongShape = await main({
      ENABLE_TELEMETRY: true,
      FEE_RULES: '{"foo":1}',
      ...payload(),
    });
    expect(wrongShape.body).toEqual([{ op: "success" }]);
  });

  test("skips an invalid rule but still applies valid ones", async () => {
    const response = await run(payload({ subtotal: 100 }), [
      { code: "BAD", label: "x" },
      ...SMALL_ORDER,
    ]);
    expect(response.body[0].value.map((fee) => fee.code)).toEqual([
      "small_order_fee",
    ]);
  });

  test("charges the option the buyer chose", async () => {
    mocks.selections.mockResolvedValueOnce({ delivery: "express" });
    const delivery = {
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
    };
    const response = await run(payload({ subtotal: 300 }), [delivery]);
    expect(mocks.selections).toHaveBeenCalledWith(100, expect.anything(), {});
    expect(response.body[0].value).toEqual([
      { base_fee: 9, code: "delivery__express", label: "Delivery: Express" },
    ]);
  });

  test("doesn't read choices when no rule needs them", async () => {
    await run(payload({ subtotal: 100 }));
    expect(mocks.selections).not.toHaveBeenCalled();
  });
});
