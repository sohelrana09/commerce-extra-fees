/** Daily housekeeping, run by the `extra-fees-daily` alarm trigger. */

import AioLogger from "@adobe/aio-lib-core-logging";

import { purgeExpired } from "../../../common/fees/maintenance.js";

export async function main(params = {}, purge = purgeExpired) {
  const logger = AioLogger("extra-fees-cleanup", {
    level: params.LOG_LEVEL || "info",
  });
  const removed = await purge(params);
  logger.info(
    `Removed ${removed.selections} expired fee choice(s) and ${removed.catalog} product cache entr(ies)`,
  );
  return { body: removed, statusCode: 200 };
}
