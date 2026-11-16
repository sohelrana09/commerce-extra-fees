/**
 * Public web action for the storefront (no Adobe IMS login: buyers call it from the browser).
 * The masked cart ID is the credential, and every choice is checked against the rules before
 * it's saved. Errors return a generic message; details go to the logs.
 */

import AioLogger from "@adobe/aio-lib-core-logging";

import { json, readBody } from "../../../common/http.js";
import { createFeeOptions } from "./handler.js";

const feeOptions = createFeeOptions();

export async function main(params = {}) {
  const logger = AioLogger("extra-fees-fee-options", {
    level: params.LOG_LEVEL || "info",
  });
  try {
    return await feeOptions(readBody(params), params, logger);
  } catch (error) {
    logger.error(`fee-options failed: ${error.message}`);
    return json(500, { error: "Fees are unavailable right now." });
  }
}
