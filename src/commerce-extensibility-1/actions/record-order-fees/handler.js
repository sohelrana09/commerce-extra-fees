/**
 * Handles the order-placed event: records the order's fees for reports and clears the buyer's
 * saved choices for that cart. Recording is idempotent per order, so redelivered events are
 * harmless. Errors are rethrown so Adobe I/O Events retries the delivery.
 */

import { normaliseCart } from "../../../common/fees/cart.js";
import {
  loadOrder,
  orderFees,
  orderIdsFromEvent,
  saveOrderRecord,
  toOrderRecord,
} from "../../../common/fees/orders.js";
import { deleteSelections } from "../../../common/fees/selections.js";
import { loadSettings } from "../../../common/fees/settings.js";
import {
  getCommerce,
  loadCatalog,
  loadRules,
  loadSelections,
} from "../../../common/fees/sources.js";

const defaults = {
  deleteSelections,
  getCommerce,
  loadCatalog,
  loadOrder,
  loadRules,
  loadSelections,
  loadSettings,
  saveOrderRecord,
};

export function createRecordOrderFees(overrides = {}) {
  const deps = { ...defaults, ...overrides };

  return async function recordOrderFees(params, logger) {
    const ids = orderIdsFromEvent(params);
    if (!(ids.entityId || ids.incrementId || ids.quoteId)) {
      logger.warn("Order event without an order ID; nothing recorded");
      return { recorded: false, status: "no-order-id" };
    }

    const commerce = await deps.getCommerce(params);
    const order = await deps.loadOrder(commerce, ids);
    if (!order?.entity_id) {
      logger.warn(`Order not found for event ${JSON.stringify(ids)}`);
      return { recorded: false, status: "not-found" };
    }

    const settings = await deps.loadSettings(logger);
    const result = settings.feesEnabled
      ? await orderFees(order, params, {
          loadCatalog: (skus, p) =>
            deps.loadCatalog(skus, p, {
              logger,
              ttlMs: settings.catalogCacheMinutes * 60_000,
            }),
          loadRules: deps.loadRules,
          loadSelections: (quoteId, p) =>
            deps.loadSelections(quoteId, p, { logger }),
          normaliseCart,
        })
      : { fees: [], source: "disabled" };

    let recorded = false;
    if (result.fees.length) {
      await deps.saveOrderRecord(toOrderRecord(order, result), params);
      recorded = true;
    }
    if (order.quote_id) {
      await deps.deleteSelections(order.quote_id, params);
    }
    logger.info(
      `Order ${order.increment_id ?? order.entity_id}: ${result.fees.length} fee(s) (${result.source})`,
    );
    return { fees: result.fees.length, recorded, status: result.source };
  };
}
