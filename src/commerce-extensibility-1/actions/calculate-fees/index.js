/**
 * Custom fees webhook for the out-of-process totals collector.
 *
 * Commerce calls this during totals collection (after shipping and the shipping discount are
 * known) with `total`, `quote` and `shippingAssignment`. We answer with a JSON Patch that
 * replaces `result/fees` with [{ code, label, base_fee }], or a plain success when no fee
 * applies.
 *
 * Runs with `require-adobe-auth: true`; App Management verifies the webhook, so `params`
 * arrives as the already-parsed payload.
 *
 * Failure policy: this action never blocks a cart. Any error is logged and answered with a
 * success (no fees), so a bad rule or an outage costs a fee, not a sale.
 */

import {
  isWebhookSuccessful,
  ok,
  replaceOperation,
  successOperation,
} from "@adobe/aio-commerce-sdk/webhooks/responses";
import {
  getInstrumentationHelpers,
  instrumentEntrypoint,
} from "@adobe/aio-lib-telemetry";

import { normaliseCart } from "../../../common/fees/cart.js";
import { calculateFees, needsCatalog } from "../../../common/fees/engine.js";
import { needsSelections } from "../../../common/fees/selections.js";
import { loadSettings } from "../../../common/fees/settings.js";
import {
  loadCatalog,
  loadRules,
  loadSelections,
} from "../../../common/fees/sources.js";
import { feeMetrics } from "../fee-metrics.js";
import { telemetryConfig } from "../telemetry.js";

export async function calculate(params, logger = console) {
  const cart = normaliseCart(params);
  if (cart.itemCount === 0) {
    return { fees: [], status: "empty" };
  }

  const settings = await loadSettings(logger);
  if (!settings.feesEnabled) {
    return { fees: [], status: "disabled" };
  }

  const rules = await loadRules(params);
  const quoteId = params.quote?.entity_id ?? params.quote?.id ?? null;
  const selections =
    quoteId && needsSelections(rules)
      ? await loadSelections(quoteId, params, { logger })
      : {};
  const catalog = needsCatalog(rules)
    ? await loadCatalog(
        cart.items.map((item) => item.sku),
        params,
        { logger, ttlMs: settings.catalogCacheMinutes * 60_000 },
      )
    : {};

  const fees = calculateFees(rules, cart, {
    catalog,
    onSkip: (rule, errors) =>
      logger.warn(
        `Skipping invalid fee rule "${rule?.code}": ${errors.join("; ")}`,
      ),
    selections,
  });
  return { fees, status: fees.length ? "fees" : "none" };
}

async function collectCustomFees(params) {
  const { logger } = getInstrumentationHelpers();
  try {
    const { fees, status } = await calculate(params, logger);
    feeMetrics.feeRequestsCounter.add(1, { status });
    if (!fees.length) {
      return ok([successOperation()]);
    }
    logger.debug(`Applying fees: ${JSON.stringify(fees)}`);
    return ok([replaceOperation("result/fees", fees)]);
  } catch (error) {
    logger.error("Error in calculate-fees, charging no fees:", error);
    feeMetrics.feeRequestsCounter.add(1, {
      errorCode: "exception",
      status: "error",
    });
    return ok([successOperation()]);
  }
}

export const main = instrumentEntrypoint(collectCustomFees, {
  ...telemetryConfig,
  isSuccessful: isWebhookSuccessful,
});
