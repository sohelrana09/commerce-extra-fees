import { ActionButton } from "@react-spectrum/s2/ActionButton";
import { Button } from "@react-spectrum/s2/Button";
import { Content } from "@react-spectrum/s2/Content";
import { Heading } from "@react-spectrum/s2/Heading";
import { IllustratedMessage } from "@react-spectrum/s2/IllustratedMessage";
import { InlineAlert } from "@react-spectrum/s2/InlineAlert";
import Refresh from "@react-spectrum/s2/icons/Refresh";
import { Menu, MenuItem, MenuTrigger } from "@react-spectrum/s2/Menu";
import { ProgressCircle } from "@react-spectrum/s2/ProgressCircle";
import { StatusLight } from "@react-spectrum/s2/StatusLight";
import { style } from "@react-spectrum/s2/style" with { type: "macro" };
import {
  Cell,
  Column,
  Row,
  TableBody,
  TableHeader,
  TableView,
} from "@react-spectrum/s2/TableView";
import { useCallback } from "react";

import { describeCalc, RULE_TYPE_LABELS } from "../lib/rules.ts";

import type { Key } from "react-aria-components";
import type { FeeRule } from "../lib/types.ts";

export type RulesListProps = {
  error: string | null;
  examples: FeeRule[];
  loading: boolean;
  onCreate: (template?: FeeRule) => void;
  onEdit: (code: string) => void;
  onReload: () => void;
  rules: FeeRule[];
};

export function RulesList({
  rules,
  examples,
  loading,
  error,
  onReload,
  onEdit,
  onCreate,
}: RulesListProps) {
  const handleRowAction = useCallback(
    (key: Key) => onEdit(String(key)),
    [onEdit],
  );
  const handleNew = useCallback(() => onCreate(), [onCreate]);
  const handleTemplate = useCallback(
    (key: Key) => {
      const example = examples.find((rule) => rule.code === key);
      if (example) {
        onCreate(example);
      }
    },
    [examples, onCreate],
  );

  const renderEmptyState = useCallback(
    () => (
      <IllustratedMessage>
        <Heading>No fees yet</Heading>
        <Content>Add a fee, or start from an example.</Content>
      </IllustratedMessage>
    ),
    [],
  );

  return (
    <main
      className={style({ display: "flex", flexDirection: "column", gap: 16 })}>
      <div className={style({ alignItems: "center", display: "flex", gap: 8 })}>
        <Heading level={1} styles={style({ flexGrow: 1 })}>
          Fees
        </Heading>
        <ActionButton
          aria-label="Reload"
          isDisabled={loading}
          onPress={onReload}>
          <Refresh />
        </ActionButton>
        <MenuTrigger>
          <Button variant="secondary">Start from example</Button>
          <Menu items={examples} onAction={handleTemplate}>
            {(example) => (
              <MenuItem id={example.code}>{example.label}</MenuItem>
            )}
          </Menu>
        </MenuTrigger>
        <Button onPress={handleNew} variant="accent">
          Add fee
        </Button>
      </div>

      {error && (
        <InlineAlert variant="negative">
          <Heading>Couldn't load fees</Heading>
          <Content>{error}</Content>
        </InlineAlert>
      )}

      {loading ? (
        <div
          className={style({
            display: "flex",
            justifyContent: "center",
            marginTop: 32,
          })}>
          <ProgressCircle aria-label="Loading fees" isIndeterminate size="L" />
        </div>
      ) : (
        <TableView
          aria-label="Fees"
          onAction={handleRowAction}
          selectionMode="none"
          styles={style({ minHeight: 320, width: "full" })}>
          <TableHeader>
            <Column isRowHeader>Fee</Column>
            <Column>Code</Column>
            <Column>Type</Column>
            <Column>Amount</Column>
            <Column>Order</Column>
            <Column>Status</Column>
          </TableHeader>
          <TableBody items={rules} renderEmptyState={renderEmptyState}>
            {(rule) => (
              <Row id={rule.code}>
                <Cell>{rule.label}</Cell>
                <Cell>{rule.code}</Cell>
                <Cell>{RULE_TYPE_LABELS[rule.type ?? "automatic"]}</Cell>
                <Cell>{describeCalc(rule.calc)}</Cell>
                <Cell>{String(rule.sortOrder ?? 0)}</Cell>
                <Cell>
                  <StatusLight
                    size="S"
                    variant={rule.enabled === false ? "neutral" : "positive"}>
                    {rule.enabled === false ? "Off" : "On"}
                  </StatusLight>
                </Cell>
              </Row>
            )}
          </TableBody>
        </TableView>
      )}
    </main>
  );
}
