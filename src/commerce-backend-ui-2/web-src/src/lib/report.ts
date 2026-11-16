import type { ReportRow } from "./types.ts";

export const RANGE_LABELS = {
  last7: "Last 7 days",
  last30: "Last 30 days",
  lastMonth: "Last month",
  thisMonth: "This month",
  thisYear: "This year",
} as const;

export type RangeKey = keyof typeof RANGE_LABELS;

export const GROUP_BY_LABELS = {
  day: "Fee and day",
  fee: "Fee",
  month: "Fee and month",
} as const;

const FORMULA_START = /^[=+\-@\t\r]/u;

const iso = (date: Date) => date.toISOString().slice(0, 10);

/** A date range in UTC, matching how the report groups orders. */
export function rangeFor(
  key: RangeKey,
  today = new Date(),
): { from: string; to: string } {
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth();
  const daysAgo = (n: number) =>
    new Date(Date.UTC(year, month, today.getUTCDate() - n));
  switch (key) {
    case "last7":
      return { from: iso(daysAgo(6)), to: iso(today) };
    case "thisMonth":
      return { from: iso(new Date(Date.UTC(year, month, 1))), to: iso(today) };
    case "lastMonth":
      return {
        from: iso(new Date(Date.UTC(year, month - 1, 1))),
        to: iso(new Date(Date.UTC(year, month, 0))),
      };
    case "thisYear":
      return { from: iso(new Date(Date.UTC(year, 0, 1))), to: iso(today) };
    default:
      return { from: iso(daysAgo(29)), to: iso(today) };
  }
}

function csvCell(value: string | number | null): string {
  const text = value === null ? "" : String(value);
  // Quote everything and neutralise leading formula characters for spreadsheet safety.
  const safe = FORMULA_START.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function toCsv(rows: ReportRow[]): string {
  const header = ["Period", "Fee", "Code", "Currency", "Orders", "Total"];
  const lines = rows.map((row) =>
    [
      row.period,
      row.label,
      row.code,
      row.currency,
      row.orders,
      row.total.toFixed(2),
    ]
      .map(csvCell)
      .join(","),
  );
  return [header.map(csvCell).join(","), ...lines].join("\r\n");
}

export function formatAmount(value: number, currency: string | null): string {
  if (currency) {
    try {
      return new Intl.NumberFormat(undefined, {
        currency,
        style: "currency",
      }).format(value);
    } catch {
      // Unknown currency code: plain number below.
    }
  }
  return value.toFixed(2);
}
