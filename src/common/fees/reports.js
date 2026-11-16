/**
 * Fee revenue reports over the `fee_orders` collection. Totals are in base currency and are
 * grouped by currency too, so stores with several base currencies never mix amounts.
 * Periods are UTC days or months, read from the stored ISO `createdAt`.
 */

import { ORDERS, withDb } from "./db.js";

export const GROUP_BY = ["fee", "day", "month"];
const DATE = /^\d{4}-\d{2}-\d{2}$/u;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RANGE_DAYS = 3 * 366;

export class ReportRequestError extends Error {
  // biome-ignore lint/style/useConsistentMemberAccessibility: plain JavaScript has no access modifiers
  constructor(errors) {
    super(`Invalid report request: ${errors.join("; ")}`);
    this.name = "ReportRequestError";
    this.errors = errors;
  }
}

/** Checks { from, to, groupBy } and returns the ISO range [start, end). */
export function parseReportRequest({ from, to, groupBy = "fee" } = {}) {
  const errors = [];
  if (!(typeof from === "string" && DATE.test(from))) {
    errors.push("from must be a date (YYYY-MM-DD)");
  }
  if (!(typeof to === "string" && DATE.test(to))) {
    errors.push("to must be a date (YYYY-MM-DD)");
  }
  if (!GROUP_BY.includes(groupBy)) {
    errors.push(`groupBy must be one of: ${GROUP_BY.join(", ")}`);
  }
  if (errors.length) {
    throw new ReportRequestError(errors);
  }
  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(new Date(`${to}T00:00:00.000Z`).getTime() + DAY_MS);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new ReportRequestError(["from and to must be real dates"]);
  }
  if (end <= start) {
    throw new ReportRequestError(["to must be on or after from"]);
  }
  if ((end - start) / DAY_MS > MAX_RANGE_DAYS) {
    throw new ReportRequestError(["the range can be at most 3 years"]);
  }
  return { end: end.toISOString(), groupBy, start: start.toISOString() };
}

function periodExpression(groupBy) {
  if (groupBy === "day") {
    return { $substrBytes: ["$createdAt", 0, 10] };
  }
  if (groupBy === "month") {
    return { $substrBytes: ["$createdAt", 0, 7] };
  }
  return null;
}

export function reportPipelines({ start, end, groupBy }) {
  const match = { $match: { createdAt: { $gte: start, $lt: end } } };
  return {
    byFee: [
      match,
      { $unwind: "$fees" },
      {
        $group: {
          _id: {
            code: "$fees.code",
            currency: "$currency",
            period: periodExpression(groupBy),
          },
          label: { $last: "$fees.label" },
          orders: { $sum: 1 },
          total: { $sum: "$fees.amount" },
        },
      },
      { $sort: { "_id.period": 1, total: -1 } },
    ],
    totals: [
      match,
      {
        $group: {
          _id: "$currency",
          orders: { $sum: 1 },
          total: { $sum: "$feeTotal" },
        },
      },
      { $sort: { _id: 1 } },
    ],
  };
}

const money = (n) => Math.round(Number(n ?? 0) * 100) / 100;

export function feeReport(request, params, connect) {
  const range = parseReportRequest(request);
  const pipelines = reportPipelines(range);
  return withDb(
    params,
    async (client) => {
      const orders = client.collection(ORDERS);
      const [rows, totals] = await Promise.all([
        orders.aggregate(pipelines.byFee).toArray(),
        orders.aggregate(pipelines.totals).toArray(),
      ]);
      return {
        from: request.from,
        groupBy: range.groupBy,
        rows: rows.map((row) => ({
          code: row._id.code,
          currency: row._id.currency ?? null,
          label: row.label ?? row._id.code,
          orders: row.orders,
          period: row._id.period ?? null,
          total: money(row.total),
        })),
        to: request.to,
        totals: totals.map((row) => ({
          currency: row._id ?? null,
          orders: row.orders,
          total: money(row.total),
        })),
      };
    },
    connect,
  );
}
