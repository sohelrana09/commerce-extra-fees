import { describe, expect, test } from "vitest";

import { CATALOG, ORDERS, SELECTIONS } from "../../src/common/fees/db.js";
import { purgeExpired } from "../../src/common/fees/maintenance.js";
import {
  feeReport,
  parseReportRequest,
  ReportRequestError,
} from "../../src/common/fees/reports.js";
import { createFakeDb } from "../fixtures/fake-db.js";

const orders = [
  {
    createdAt: "2026-10-31T23:00:00.000Z",
    currency: "USD",
    fees: [{ amount: 15, code: "small", label: "Small order" }],
    feeTotal: 15,
    orderId: "1",
  },
  {
    createdAt: "2026-11-01T10:00:00.000Z",
    currency: "USD",
    fees: [
      { amount: 15, code: "small", label: "Small order" },
      { amount: 9, code: "delivery__express", label: "Delivery: Express" },
    ],
    feeTotal: 24,
    orderId: "2",
  },
  {
    createdAt: "2026-11-02T10:00:00.000Z",
    currency: "EUR",
    fees: [{ amount: 5, code: "small", label: "Small order fee" }],
    feeTotal: 5,
    orderId: "3",
  },
  {
    createdAt: "2026-12-01T00:00:00.000Z",
    currency: "USD",
    fees: [{ amount: 99, code: "small", label: "Small order" }],
    feeTotal: 99,
    orderId: "4",
  },
];

function seeded() {
  const db = createFakeDb();
  db.seed(ORDERS, orders);
  return db;
}

describe("parseReportRequest", () => {
  test("turns dates into an inclusive UTC range", () => {
    expect(
      parseReportRequest({ from: "2026-11-01", to: "2026-11-30" }),
    ).toEqual({
      end: "2026-12-01T00:00:00.000Z",
      groupBy: "fee",
      start: "2026-11-01T00:00:00.000Z",
    });
  });

  test.each([
    [{}, "from must be a date"],
    [
      { from: "2026-11-01", groupBy: "year", to: "2026-11-02" },
      "groupBy must be one of",
    ],
    [{ from: "2026-11-05", to: "2026-11-01" }, "on or after"],
    [{ from: "2020-01-01", to: "2026-11-01" }, "at most 3 years"],
    [{ from: "2026-02-31", to: "2026-13-45" }, "real dates"],
  ])("rejects %j", (request, message) => {
    expect(() => parseReportRequest(request)).toThrow(ReportRequestError);
    expect(() => parseReportRequest(request)).toThrow(message);
  });
});

describe("feeReport", () => {
  test("totals each fee and currency in the range", async () => {
    const report = await feeReport(
      { from: "2026-11-01", to: "2026-11-30" },
      {},
      seeded().connect,
    );
    expect(report.rows).toEqual([
      {
        code: "small",
        currency: "USD",
        label: "Small order",
        orders: 1,
        period: null,
        total: 15,
      },
      {
        code: "delivery__express",
        currency: "USD",
        label: "Delivery: Express",
        orders: 1,
        period: null,
        total: 9,
      },
      {
        code: "small",
        currency: "EUR",
        label: "Small order fee",
        orders: 1,
        period: null,
        total: 5,
      },
    ]);
    expect(report.totals).toEqual([
      { currency: "EUR", orders: 1, total: 5 },
      { currency: "USD", orders: 1, total: 24 },
    ]);
  });

  test("groups by day and month", async () => {
    const byDay = await feeReport(
      { from: "2026-10-01", groupBy: "day", to: "2026-11-30" },
      {},
      seeded().connect,
    );
    expect(byDay.rows.map((row) => row.period)).toEqual([
      "2026-10-31",
      "2026-11-01",
      "2026-11-01",
      "2026-11-02",
    ]);
    const byMonth = await feeReport(
      { from: "2026-10-01", groupBy: "month", to: "2026-12-31" },
      {},
      seeded().connect,
    );
    expect(
      byMonth.rows.map((row) => [
        row.period,
        row.code,
        row.currency,
        row.total,
      ]),
    ).toEqual([
      ["2026-10", "small", "USD", 15],
      ["2026-11", "small", "USD", 15],
      ["2026-11", "delivery__express", "USD", 9],
      ["2026-11", "small", "EUR", 5],
      ["2026-12", "small", "USD", 99],
    ]);
  });
});

describe("purgeExpired", () => {
  test("removes expired choices and product data", async () => {
    const db = createFakeDb();
    db.seed(SELECTIONS, [
      { expiresAt: 5, quoteId: "1" },
      { expiresAt: 50, quoteId: "2" },
    ]);
    db.seed(CATALOG, [{ expiresAt: 1, sku: "A" }]);
    expect(await purgeExpired({}, { connect: db.connect, now: 10 })).toEqual({
      catalog: 1,
      selections: 1,
    });
    expect(db.collections.get(SELECTIONS)).toHaveLength(1);
  });
});
