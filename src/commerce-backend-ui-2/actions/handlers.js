/**
 * Admin action handlers: manage fee rules, test them against a sample cart, and load the store
 * views and customer groups the rule editor offers. Dependencies are injectable for tests.
 */

import { normaliseCart } from "../../common/fees/cart.js";
import { clearCatalogCache } from "../../common/fees/catalog.js";
import { DEFAULT_RULES } from "../../common/fees/default-rules.js";
import {
  calculateFees,
  describeOptions,
  needsCatalog,
  validateRule,
} from "../../common/fees/engine.js";
import { previewPayload } from "../../common/fees/preview.js";
import { feeReport } from "../../common/fees/reports.js";
import {
  deleteRule,
  listRules,
  RuleValidationError,
  saveRule,
} from "../../common/fees/rules-repo.js";
import { getCommerce, loadCatalog } from "../../common/fees/sources.js";
import { json } from "../../common/http.js";

const realDeps = {
  clearCatalogCache,
  deleteRule,
  feeReport,
  getCommerce,
  listRules,
  loadCatalog,
  saveRule,
};

function requireCode(code) {
  if (typeof code !== "string" || !code) {
    throw new RuleValidationError(["code is required"]);
  }
  return code;
}

export function createHandlers(overrides = {}) {
  const deps = { ...realDeps, ...overrides };

  return {
    async catalogRefresh(_body, params) {
      const removed = await deps.clearCatalogCache(params);
      return json(200, { removed });
    },

    async feeReport(body, params) {
      const report = await deps.feeReport(
        { from: body.from, groupBy: body.groupBy, to: body.to },
        params,
      );
      return json(200, report);
    },

    async lookups(_body, params, logger) {
      try {
        const commerce = await deps.getCommerce(params);
        const [storeViews, groups] = await Promise.all([
          commerce.get("store/storeViews").json(),
          commerce
            .get("customerGroups/search", {
              searchParams: { "searchCriteria[pageSize]": "200" },
            })
            .json(),
        ]);
        return json(200, {
          customerGroups: (groups?.items ?? []).map((g) => ({
            id: g.id,
            label: g.code,
          })),
          storeViews: (storeViews ?? [])
            .filter((s) => Number(s.id) !== 0)
            .map((s) => ({ code: s.code, id: s.id, label: s.name })),
        });
      } catch (error) {
        // The editor still works with typed IDs when Commerce can't be reached.
        logger.warn(`lookups unavailable: ${error.message}`);
        return json(200, {
          customerGroups: [],
          storeViews: [],
          unavailable: true,
        });
      }
    },

    async ruleDelete(body, params) {
      const deleted = await deps.deleteRule(requireCode(body.code), params);
      return deleted
        ? json(200, { deleted: true })
        : json(404, { error: "Rule not found" });
    },

    async rulePreview(body, params) {
      const rules = Array.isArray(body.rules)
        ? body.rules
        : await deps.listRules(params);
      const invalid = rules
        .map((rule) => ({ code: rule?.code, errors: validateRule(rule) }))
        .filter((entry) => entry.errors.length);
      const cart = normaliseCart(previewPayload(body.cart));
      const catalog = needsCatalog(rules)
        ? await deps.loadCatalog(
            cart.items.map((item) => item.sku),
            params,
          )
        : {};
      const selections = body.selections ?? {};
      const fees = calculateFees(rules, cart, { catalog, selections });
      return json(200, {
        fees,
        invalid,
        options: describeOptions(rules, cart, { catalog, selections }),
        subtotal: cart.subtotal,
        total:
          Math.round(fees.reduce((sum, fee) => sum + fee.base_fee, 0) * 100) /
          100,
      });
    },

    async ruleSave(body, params) {
      if (!body.rule || typeof body.rule !== "object") {
        throw new RuleValidationError(["rule is required"]);
      }
      const saved = await deps.saveRule(body.rule, params, {
        previousCode: body.previousCode,
      });
      return json(200, { rule: saved });
    },

    async rulesList(_body, params) {
      const rules = await deps.listRules(params);
      return json(200, { examples: DEFAULT_RULES, rules });
    },
  };
}

export const handlers = createHandlers();
