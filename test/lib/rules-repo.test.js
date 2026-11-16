import { beforeEach, describe, expect, test } from "vitest";

import { RULES } from "../../src/common/fees/db.js";
import {
  clearRulesCache,
  deleteRule,
  getRule,
  listRules,
  listRulesCached,
  RULES_CACHE_MS,
  RuleValidationError,
  saveRule,
} from "../../src/common/fees/rules-repo.js";
import { createFakeDb } from "../fixtures/fake-db.js";

const rule = (overrides = {}) => ({
  calc: { fixed: 5 },
  code: "handling",
  label: "Handling",
  sortOrder: 10,
  ...overrides,
});

describe("rules repository", () => {
  let db;
  beforeEach(() => {
    db = createFakeDb();
    clearRulesCache();
  });

  test("saves, lists in sort order, reads and deletes rules", async () => {
    await saveRule(
      rule({ code: "b", sortOrder: 20 }),
      {},
      { connect: db.connect },
    );
    await saveRule(
      rule({ code: "a", sortOrder: 10 }),
      {},
      { connect: db.connect },
    );

    const rules = await listRules({}, db.connect);
    expect(rules.map((r) => r.code)).toEqual(["a", "b"]);
    expect(rules[0]).not.toHaveProperty("_id");
    expect(rules[0].updatedAt).toBeTypeOf("string");

    expect((await getRule("b", {}, db.connect)).code).toBe("b");
    expect(await getRule("zzz", {}, db.connect)).toBeNull();

    expect(await deleteRule("a", {}, db.connect)).toBe(true);
    expect(await deleteRule("a", {}, db.connect)).toBe(false);
    expect(db.calls.closed).toBeGreaterThan(0);
  });

  test("rejects invalid rules and duplicate codes", async () => {
    await expect(
      saveRule({ code: "Bad" }, {}, { connect: db.connect }),
    ).rejects.toBeInstanceOf(RuleValidationError);
    await saveRule(rule(), {}, { connect: db.connect });
    await expect(saveRule(rule(), {}, { connect: db.connect })).rejects.toThrow(
      "already exists",
    );
  });

  test("updates in place and handles renames", async () => {
    await saveRule(rule(), {}, { connect: db.connect });
    await saveRule(
      rule({ label: "Handling v2" }),
      {},
      { connect: db.connect, previousCode: "handling" },
    );
    expect((await listRules({}, db.connect)).map((r) => r.label)).toEqual([
      "Handling v2",
    ]);

    await saveRule(
      rule({ code: "handling_fee" }),
      {},
      { connect: db.connect, previousCode: "handling" },
    );
    expect((await listRules({}, db.connect)).map((r) => r.code)).toEqual([
      "handling_fee",
    ]);

    await saveRule(rule({ code: "other" }), {}, { connect: db.connect });
    await expect(
      saveRule(
        rule({ code: "other" }),
        {},
        { connect: db.connect, previousCode: "handling_fee" },
      ),
    ).rejects.toThrow("already exists");
  });

  test("caches the webhook's rules per container and clears on save", async () => {
    db.seed(RULES, [rule()]);
    const first = await listRulesCached({}, db.connect, 1000);
    db.seed(RULES, [rule({ code: "later" })]);
    expect(
      await listRulesCached({}, db.connect, 1000 + RULES_CACHE_MS - 1),
    ).toBe(first);
    expect(
      await listRulesCached({}, db.connect, 1000 + RULES_CACHE_MS + 1),
    ).toHaveLength(2);

    await saveRule(rule({ code: "third" }), {}, { connect: db.connect });
    expect(
      await listRulesCached({}, db.connect, 1000 + RULES_CACHE_MS + 2),
    ).toHaveLength(3);
  });
});

describe("findOneOrNull", () => {
  test("returns null on a miss and rethrows other errors", async () => {
    const { findOneOrNull } = await import("../../src/common/fees/db.js");
    const miss = {
      findOne: async () => {
        throw Object.assign(new Error("Document not found"), {
          httpStatusCode: 404,
        });
      },
    };
    expect(await findOneOrNull(miss, {})).toBeNull();
    const broken = {
      findOne: async () => {
        throw Object.assign(new Error("boom"), { httpStatusCode: 500 });
      },
    };
    await expect(findOneOrNull(broken, {})).rejects.toThrow("boom");
  });
});
