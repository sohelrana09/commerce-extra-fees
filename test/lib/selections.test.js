import { describe, expect, test, vi } from "vitest";

import { SELECTIONS } from "../../src/common/fees/db.js";
import {
  getSelections,
  needsSelections,
  SELECTION_TTL_MS,
  sanitizeSelections,
  saveSelections,
} from "../../src/common/fees/selections.js";
import { loadSelections } from "../../src/common/fees/sources.js";
import { createFakeDb } from "../fixtures/fake-db.js";

const insurance = {
  calc: { fixed: 5 },
  code: "insurance",
  label: "Insurance",
  type: "optional",
};
const packaging = {
  code: "packaging",
  input: "checkbox",
  label: "Packaging",
  options: [
    { calc: { fixed: 2 }, code: "box", label: "Box" },
    { calc: { fixed: 4 }, code: "wrap", label: "Gift wrap" },
  ],
  type: "optional",
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
const automatic = { calc: { fixed: 1 }, code: "auto", label: "Auto" };
const rules = [insurance, packaging, delivery, automatic];

describe("needsSelections", () => {
  test("only when an enabled rule lets the buyer choose", () => {
    expect(needsSelections([automatic])).toBe(false);
    expect(needsSelections([{ ...insurance, enabled: false }])).toBe(false);
    expect(needsSelections(rules)).toBe(true);
    expect(needsSelections(undefined)).toBe(false);
  });
});

describe("sanitizeSelections", () => {
  test("keeps valid choices and drops everything else", () => {
    expect(
      sanitizeSelections(rules, {
        auto: true,
        delivery: ["express", "standard"],
        insurance: true,
        packaging: ["box", "box", "nope", 3],
        unknown: true,
      }),
    ).toEqual({
      delivery: "express",
      insurance: true,
      packaging: ["box"],
    });
  });

  test("drops a non-true flag and unknown single options", () => {
    expect(
      sanitizeSelections(rules, { delivery: "nope", insurance: "yes" }),
    ).toEqual({});
  });

  test("ignores non-object input", () => {
    expect(sanitizeSelections(rules, null)).toEqual({});
    expect(sanitizeSelections(rules, ["a"])).toEqual({});
    expect(sanitizeSelections(undefined, { insurance: true })).toEqual({});
  });
});

describe("selection storage", () => {
  test("saves, reads and expires choices per quote", async () => {
    const db = createFakeDb();
    await saveSelections(
      42,
      { insurance: true },
      {},
      { connect: db.connect, now: 1000 },
    );
    await saveSelections(
      42,
      { delivery: "express" },
      {},
      { connect: db.connect, now: 2000 },
    );

    expect(db.collections.get(SELECTIONS)).toHaveLength(1);
    expect(db.collections.get(SELECTIONS)[0]).toMatchObject({
      expiresAt: 2000 + SELECTION_TTL_MS,
      quoteId: "42",
    });
    expect(
      await getSelections("42", {}, { connect: db.connect, now: 3000 }),
    ).toEqual({
      delivery: "express",
    });
    expect(
      await getSelections(
        42,
        {},
        { connect: db.connect, now: 2000 + SELECTION_TTL_MS },
      ),
    ).toEqual({});
    expect(await getSelections(7, {}, { connect: db.connect })).toEqual({});
  });

  test("loadSelections returns no choices when the database fails", async () => {
    const logger = { warn: vi.fn() };
    const connect = async () => {
      throw new Error("db down");
    };
    expect(await loadSelections(1, {}, { connect, logger })).toEqual({});
    expect(logger.warn).toHaveBeenCalledOnce();
  });

  test("loadSelections reads saved choices", async () => {
    const db = createFakeDb();
    db.seed(SELECTIONS, [
      {
        expiresAt: Date.now() + 1000,
        quoteId: "5",
        selections: { insurance: true },
      },
    ]);
    expect(await loadSelections(5, {}, { connect: db.connect })).toEqual({
      insurance: true,
    });
  });
});
