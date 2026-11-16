import { describe, expect, test } from "vitest";

import {
  formatAmount,
  rangeFor,
  toCsv,
} from "../../src/commerce-backend-ui-2/web-src/src/lib/report.ts";

describe("rangeFor", () => {
  const today = new Date("2026-03-15T12:00:00Z");

  test.each([
    ["last7", "2026-03-09", "2026-03-15"],
    ["last30", "2026-02-14", "2026-03-15"],
    ["thisMonth", "2026-03-01", "2026-03-15"],
    ["lastMonth", "2026-02-01", "2026-02-28"],
    ["thisYear", "2026-01-01", "2026-03-15"],
  ] as const)("%s", (key, from, to) => {
    expect(rangeFor(key, today)).toEqual({ from, to });
  });

  test("last month across a year boundary", () => {
    expect(rangeFor("lastMonth", new Date("2026-01-10T00:00:00Z"))).toEqual({
      from: "2025-12-01",
      to: "2025-12-31",
    });
  });
});

describe("toCsv", () => {
  test("quotes cells and neutralises formulas", () => {
    const csv = toCsv([
      {
        code: "small",
        currency: "USD",
        label: '=HYPERLINK("x") "fee"',
        orders: 2,
        period: null,
        total: 30,
      },
    ]);
    expect(csv.split("\r\n")).toEqual([
      '"Period","Fee","Code","Currency","Orders","Total"',
      '"","\'=HYPERLINK(""x"") ""fee""","small","USD","2","30.00"',
    ]);
  });
});

describe("formatAmount", () => {
  test("formats known currencies and falls back for others", () => {
    expect(formatAmount(5, "NOPE")).toBe("5.00");
    expect(formatAmount(5, null)).toBe("5.00");
    expect(formatAmount(5, "USD")).toContain("5.00");
  });
});
