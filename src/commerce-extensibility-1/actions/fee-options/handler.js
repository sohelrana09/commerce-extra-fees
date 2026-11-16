/**
 * Storefront API for optional and required fees.
 *
 *   POST { cartId }               → the fees the buyer can choose for this cart, with prices
 *   POST { cartId, selections }   → saves the buyer's choices, then answers as above
 *
 * `cartId` is the masked cart ID the storefront already has. Prices come from the same rule
 * engine the webhook uses, so what the buyer sees is what Commerce charges. After saving, the
 * storefront refreshes its cart: that totals collection calls the webhook, which reads the
 * saved choices.
 */

import { normaliseCart } from "../../../common/fees/cart.js";
import { describeOptions, needsCatalog } from "../../../common/fees/engine.js";
import {
  getSelections,
  sanitizeSelections,
  saveSelections,
} from "../../../common/fees/selections.js";
import { loadSettings } from "../../../common/fees/settings.js";
import {
  getCommerce,
  loadCatalog,
  loadRules,
} from "../../../common/fees/sources.js";
import {
  CartNotFoundError,
  loadStorefrontCart,
} from "../../../common/fees/storefront-cart.js";
import { json } from "../../../common/http.js";

const NO_STORE = { "Cache-Control": "no-store" };

function reply(statusCode, body) {
  const response = json(statusCode, body);
  return { ...response, headers: { ...response.headers, ...NO_STORE } };
}

const defaults = {
  getCommerce,
  getSelections,
  loadCatalog,
  loadRules,
  loadSettings,
  loadStorefrontCart,
  saveSelections,
};

export function createFeeOptions(overrides = {}) {
  const deps = { ...defaults, ...overrides };

  return async function feeOptions(body, params, logger) {
    const settings = await deps.loadSettings(logger);
    if (!settings.feesEnabled) {
      return reply(200, { currency: null, fees: [] });
    }

    let cart;
    try {
      const commerce = await deps.getCommerce(params);
      cart = await deps.loadStorefrontCart(commerce, body.cartId);
    } catch (error) {
      if (error instanceof CartNotFoundError) {
        return reply(404, { error: "Cart not found" });
      }
      throw error;
    }

    const rules = await deps.loadRules(params);
    const normalised = normaliseCart(cart.payload);
    let selections;
    if (body.selections === undefined) {
      selections = await deps.getSelections(cart.quoteId, params);
    } else {
      selections = sanitizeSelections(rules, body.selections);
      await deps.saveSelections(cart.quoteId, selections, params);
    }

    const catalog = needsCatalog(rules)
      ? await deps.loadCatalog(
          normalised.items.map((item) => item.sku),
          params,
          { logger, ttlMs: settings.catalogCacheMinutes * 60_000 },
        )
      : {};

    return reply(200, {
      currency: cart.currency,
      fees: describeOptions(rules, normalised, { catalog, selections }),
    });
  };
}
