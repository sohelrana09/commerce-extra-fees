import { ActionButton } from "@react-spectrum/s2/ActionButton";
import { Button } from "@react-spectrum/s2/Button";
import { Content } from "@react-spectrum/s2/Content";
import { Heading } from "@react-spectrum/s2/Heading";
import { IllustratedMessage } from "@react-spectrum/s2/IllustratedMessage";
import { InlineAlert } from "@react-spectrum/s2/InlineAlert";
import Refresh from "@react-spectrum/s2/icons/Refresh";
import { Picker, PickerItem } from "@react-spectrum/s2/Picker";
import { ProgressCircle } from "@react-spectrum/s2/ProgressCircle";
import { style } from "@react-spectrum/s2/style" with { type: "macro" };
import {
  Cell,
  Column,
  Row,
  TableBody,
  TableHeader,
  TableView,
} from "@react-spectrum/s2/TableView";
import { Text } from "@react-spectrum/s2/Text";
import { useCallback, useEffect, useState } from "react";

import { useFeesApi } from "../hooks/use-fees-api.ts";
import {
  formatAmount,
  GROUP_BY_LABELS,
  RANGE_LABELS,
  rangeFor,
  toCsv,
} from "../lib/report.ts";

import type { Key } from "react-aria-components";
import type { RangeKey } from "../lib/report.ts";
import type { FeeReport as Report, ReportGroupBy } from "../lib/types.ts";

function download(report: Report) {
  const blob = new Blob([toCsv(report.rows)], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `extra-fees_${report.from}_${report.to}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function FeeReport() {
  const api = useFeesApi();
  const [range, setRange] = useState<RangeKey>("last30");
  const [groupBy, setGroupBy] = useState<ReportGroupBy>("fee");
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setReport(await api.report({ ...rangeFor(range), groupBy }));
    } catch (loadError) {
      setError((loadError as Error).message);
    } finally {
      setLoading(false);
    }
  }, [api, groupBy, range]);

  useEffect(() => {
    load();
  }, [load]);

  const renderEmptyState = useCallback(
    () => (
      <IllustratedMessage>
        <Heading>No fees in this period</Heading>
        <Content>Orders with extra fees appear here once placed.</Content>
      </IllustratedMessage>
    ),
    [],
  );

  const rows = (report?.rows ?? []).map((row) => ({
    ...row,
    id: `${row.period ?? ""}|${row.code}|${row.currency ?? ""}`,
  }));
  const showPeriod = groupBy !== "fee";

  return (
    <main
      className={style({ display: "flex", flexDirection: "column", gap: 16 })}>
      <div className={style({ alignItems: "end", display: "flex", gap: 8 })}>
        <Heading
          level={1}
          styles={style({ flexGrow: 1, font: "heading-lg", margin: 0 })}>
          Fee revenue
        </Heading>
        <Picker
          label="Period"
          onSelectionChange={(key: Key | null) => setRange(key as RangeKey)}
          selectedKey={range}>
          {Object.entries(RANGE_LABELS).map(([id, label]) => (
            <PickerItem id={id} key={id}>
              {label}
            </PickerItem>
          ))}
        </Picker>
        <Picker
          label="Group by"
          onSelectionChange={(key: Key | null) =>
            setGroupBy(key as ReportGroupBy)
          }
          selectedKey={groupBy}>
          {Object.entries(GROUP_BY_LABELS).map(([id, label]) => (
            <PickerItem id={id} key={id}>
              {label}
            </PickerItem>
          ))}
        </Picker>
        <ActionButton aria-label="Reload" isDisabled={loading} onPress={load}>
          <Refresh />
        </ActionButton>
        <Button
          isDisabled={!report?.rows.length}
          onPress={() => report && download(report)}
          variant="secondary">
          Download CSV
        </Button>
      </div>

      {error && (
        <InlineAlert variant="negative">
          <Heading>Couldn't load the report</Heading>
          <Content>{error}</Content>
        </InlineAlert>
      )}

      {report && !loading && (
        <div className={style({ display: "flex", gap: 32 })}>
          {report.totals.map((total) => (
            <div key={total.currency ?? "none"}>
              <Heading level={2}>
                {formatAmount(total.total, total.currency)}
              </Heading>
              <Text>
                from {total.orders} order{total.orders === 1 ? "" : "s"},{" "}
                {report.from} to {report.to} (UTC)
              </Text>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div
          className={style({
            display: "flex",
            justifyContent: "center",
            marginTop: 32,
          })}>
          <ProgressCircle
            aria-label="Loading report"
            isIndeterminate
            size="L"
          />
        </div>
      ) : (
        <TableView
          aria-label="Fee revenue"
          selectionMode="none"
          styles={style({ minHeight: 320, width: "full" })}>
          <TableHeader>
            {[
              ...(showPeriod
                ? [
                    <Column id="period" isRowHeader key="period">
                      {groupBy === "day" ? "Day" : "Month"}
                    </Column>,
                  ]
                : []),
              <Column id="fee" isRowHeader={!showPeriod} key="fee">
                Fee
              </Column>,
              <Column id="code" key="code">
                Code
              </Column>,
              <Column id="orders" key="orders">
                Orders
              </Column>,
              <Column id="total" key="total">
                Revenue
              </Column>,
            ]}
          </TableHeader>
          <TableBody items={rows} renderEmptyState={renderEmptyState}>
            {(row) => (
              <Row id={row.id}>
                {[
                  ...(showPeriod
                    ? [<Cell key="period">{row.period ?? ""}</Cell>]
                    : []),
                  <Cell key="fee">{row.label}</Cell>,
                  <Cell key="code">{row.code}</Cell>,
                  <Cell key="orders">{String(row.orders)}</Cell>,
                  <Cell key="total">
                    {formatAmount(row.total, row.currency)}
                  </Cell>,
                ]}
              </Row>
            )}
          </TableBody>
        </TableView>
      )}

      <Text>
        Fees are recorded when an order is placed, in the store's base currency.
        Refunds aren't subtracted.
      </Text>
    </main>
  );
}
