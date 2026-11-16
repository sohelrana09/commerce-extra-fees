/** OpenTelemetry metrics for the extra-fees actions. */

import { defineMetrics } from "@adobe/aio-lib-telemetry";
import { ValueType } from "@adobe/aio-lib-telemetry/otel";

export const feeMetrics = defineMetrics((meter) => ({
  feeRequestsCounter: meter.createCounter("extra_fees.requests_total", {
    description: "Totals-collector custom fee requests, by status.",
    valueType: ValueType.INT,
  }),
}));
