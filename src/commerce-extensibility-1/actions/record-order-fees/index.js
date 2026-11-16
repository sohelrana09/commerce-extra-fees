/** Runtime action for the order-placed Commerce event (see app.commerce.config.ts). */

import AioLogger from "@adobe/aio-lib-core-logging";

import { createRecordOrderFees } from "./handler.js";

const recordOrderFees = createRecordOrderFees();

export async function main(params = {}) {
  const logger = AioLogger("extra-fees-record-order-fees", {
    level: params.LOG_LEVEL || "info",
  });
  try {
    return { body: await recordOrderFees(params, logger), statusCode: 200 };
  } catch (error) {
    logger.error(`record-order-fees failed: ${error.message}`);
    // Failing the activation makes Adobe I/O Events retry the delivery.
    throw error;
  }
}
