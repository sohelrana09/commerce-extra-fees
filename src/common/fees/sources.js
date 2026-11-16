/**
 * Where the engine's inputs come from.
 *
 * - Rules: the FEE_RULES action input when set (handy for CI and scripted setups), otherwise the
 *   rules managed on the Admin page (App Builder Database Storage, cached per container).
 * - Catalog: categories and attributes by SKU, from Commerce REST with a database cache.
 * - Selections: the buyer's choices for optional and required fees, saved by the storefront.
 */

import { getCommerceClient } from "@adobe/aio-commerce-lib-app";
import { resolveImsAuthParams } from "@adobe/aio-commerce-lib-auth";

import { loadCatalogEntries } from "./catalog.js";
import { listRulesCached } from "./rules-repo.js";
import { getSelections } from "./selections.js";

function parseJson(value) {
  if (typeof value !== "string") {
    return value;
  }
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error("FEE_RULES is not valid JSON", { cause: error });
  }
}

/** Rules from the FEE_RULES input, or null when it isn't set. */
export function rulesFromInput(params = {}) {
  const value = params.FEE_RULES;
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value === "string" && value.trim() === "") {
    return null;
  }
  const raw = parseJson(value);
  const rules = Array.isArray(raw) ? raw : raw?.rules;
  if (!Array.isArray(rules)) {
    throw new Error("FEE_RULES must be an array of rules or { rules: [...] }");
  }
  return rules;
}

export function loadRules(params = {}, { connect } = {}) {
  return rulesFromInput(params) ?? listRulesCached(params, connect);
}

export function getCommerce(params) {
  return getCommerceClient(resolveImsAuthParams(params));
}

export function loadCatalog(skus, params, options = {}) {
  return loadCatalogEntries(skus, params, { getCommerce, ...options });
}

/**
 * The buyer's choices for this quote. A failed read returns no choices, so required fees fall
 * back to their default option and optional fees aren't charged, rather than blocking the cart.
 */
export async function loadSelections(quoteId, params = {}, options = {}) {
  const { logger = console, ...rest } = options;
  try {
    return await getSelections(quoteId, params, rest);
  } catch (error) {
    logger.warn(
      `Couldn't read fee choices for quote ${quoteId}: ${error.message}`,
    );
    return {};
  }
}
