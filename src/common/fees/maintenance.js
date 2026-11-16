/**
 * Housekeeping run once a day: removes buyer choices for abandoned carts and stale product
 * data. Recorded orders are kept for reports.
 */

import { CATALOG, SELECTIONS, withDb } from "./db.js";

export function purgeExpired(params, { connect, now = Date.now() } = {}) {
  return withDb(
    params,
    async (client) => {
      const query = { expiresAt: { $lt: now } };
      const [selections, catalog] = await Promise.all([
        client.collection(SELECTIONS).deleteMany(query),
        client.collection(CATALOG).deleteMany(query),
      ]);
      return {
        catalog: catalog?.deletedCount ?? 0,
        selections: selections?.deletedCount ?? 0,
      };
    },
    connect,
  );
}
