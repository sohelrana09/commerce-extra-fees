import { ActionButton } from "@react-spectrum/s2/ActionButton";
import { Button } from "@react-spectrum/s2/Button";
import { Checkbox } from "@react-spectrum/s2/Checkbox";
import { Content } from "@react-spectrum/s2/Content";
import { Heading } from "@react-spectrum/s2/Heading";
import { InlineAlert } from "@react-spectrum/s2/InlineAlert";
import Delete from "@react-spectrum/s2/icons/Delete";
import { NumberField } from "@react-spectrum/s2/NumberField";
import { Radio, RadioGroup } from "@react-spectrum/s2/RadioGroup";
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
import { TextField } from "@react-spectrum/s2/TextField";
import { useState } from "react";

import { useFeesApi } from "../hooks/use-fees-api.ts";
import { money } from "../lib/rules.ts";

import type { PreviewCart, PreviewLine, PreviewResult } from "../lib/types.ts";

const grid = style({
  display: "grid",
  gap: 16,
  gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
});

function num(value: number): number | undefined {
  return Number.isNaN(value) ? undefined : value;
}

/** Runs the saved fees against a made-up cart, using the same engine as checkout. */
export function CartPreview() {
  const api = useFeesApi();
  const [cart, setCart] = useState<PreviewCart>({
    country: "US",
    customerGroup: 1,
    items: [{ price: 50, qty: 2, sku: "SKU-1" }],
    shippingAmount: 10,
    storeId: 1,
  });
  const [selections, setSelections] = useState<
    Record<string, string | string[] | boolean>
  >({});
  const [result, setResult] = useState<PreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const set = (patch: Partial<PreviewCart>) =>
    setCart((c) => ({ ...c, ...patch }));
  const setLine = (index: number, patch: Partial<PreviewLine>) =>
    set({
      items: cart.items.map((line, i) =>
        i === index ? { ...line, ...patch } : line,
      ),
    });

  const run = async (nextSelections = selections) => {
    setRunning(true);
    setError(null);
    try {
      setResult(await api.preview(cart, undefined, nextSelections));
    } catch (runError) {
      setError((runError as Error).message);
    } finally {
      setRunning(false);
    }
  };

  const toggleOption = (
    feeCode: string,
    optionCode: string | null,
    on: boolean,
  ) => {
    const current = selections[feeCode];
    let next: string[] | boolean;
    if (optionCode === null) {
      next = on;
    } else {
      const list = Array.isArray(current) ? current : [];
      next = on
        ? [...list, optionCode]
        : list.filter((code) => code !== optionCode);
    }
    choose(feeCode, next);
  };

  const choose = (feeCode: string, value: string | string[] | boolean) => {
    const updated = { ...selections, [feeCode]: value };
    setSelections(updated);
    run(updated);
  };

  // A fee without options is one checkbox; radio and dropdown fees take one option code, as the
  // storefront sends them; checkbox fees with options take a list.
  const renderChoice = (fee: PreviewResult["options"][number]) => {
    if (fee.options.length === 0) {
      return (
        <Checkbox
          isSelected={selections[fee.code] === true}
          key={fee.code}
          onChange={(on) => toggleOption(fee.code, null, on)}>
          {`${fee.label} (${money(fee.amount)})`}
        </Checkbox>
      );
    }
    if (fee.input === "radio" || fee.input === "dropdown") {
      return (
        <RadioGroup
          key={fee.code}
          label={fee.label}
          onChange={(code) => choose(fee.code, code)}
          value={fee.options.find((option) => option.selected)?.code ?? null}>
          {fee.options.map((option) => (
            <Radio key={option.code} value={option.code}>
              {`${option.label} (${money(option.amount)})`}
            </Radio>
          ))}
        </RadioGroup>
      );
    }
    return fee.options.map((option) => (
      <Checkbox
        isSelected={option.selected}
        key={`${fee.code}-${option.code}`}
        onChange={(on) => toggleOption(fee.code, option.code, on)}>
        {`${fee.label}: ${option.label} (${money(option.amount)})`}
      </Checkbox>
    ));
  };

  return (
    <main
      className={style({ display: "flex", flexDirection: "column", gap: 16 })}>
      <Heading level={1} styles={style({ font: "heading-lg", margin: 0 })}>
        Test a cart
      </Heading>
      <Text>
        See which fees a cart would get with the saved fees. Nothing is charged
        and no cart is created.
      </Text>

      {cart.items.map((line, index) => (
        <div
          className={style({ alignItems: "end", display: "flex", gap: 16 })}
          key={index}>
          <TextField
            label="SKU"
            onChange={(sku) => setLine(index, { sku })}
            value={line.sku}
          />
          <NumberField
            label="Qty"
            minValue={0}
            onChange={(qty) => setLine(index, { qty: num(qty) ?? 0 })}
            value={line.qty}
          />
          <NumberField
            label="Price"
            minValue={0}
            onChange={(price) => setLine(index, { price: num(price) ?? 0 })}
            step={0.01}
            value={line.price}
          />
          <ActionButton
            aria-label="Remove line"
            isDisabled={cart.items.length === 1}
            onPress={() =>
              set({ items: cart.items.filter((_, i) => i !== index) })
            }>
            <Delete />
          </ActionButton>
        </div>
      ))}
      <div>
        <Button
          onPress={() =>
            set({ items: [...cart.items, { price: 0, qty: 1, sku: "" }] })
          }
          variant="secondary">
          Add line
        </Button>
      </div>

      <div className={grid}>
        <NumberField
          description="Empty = sum of lines"
          label="Subtotal"
          minValue={0}
          onChange={(subtotal) => set({ subtotal: num(subtotal) })}
          value={cart.subtotal ?? Number.NaN}
        />
        <NumberField
          label="Shipping"
          minValue={0}
          onChange={(v) => set({ shippingAmount: num(v) })}
          value={cart.shippingAmount ?? 0}
        />
        <NumberField
          label="Discount"
          minValue={0}
          onChange={(v) => set({ discount: num(v) })}
          value={cart.discount ?? 0}
        />
        <TextField
          label="Country"
          onChange={(country) => set({ country })}
          value={cart.country ?? ""}
        />
        <TextField
          label="Region code"
          onChange={(region) => set({ region })}
          value={cart.region ?? ""}
        />
        <TextField
          label="Postcode"
          onChange={(postcode) => set({ postcode })}
          value={cart.postcode ?? ""}
        />
        <TextField
          label="Shipping method"
          onChange={(shippingMethod) => set({ shippingMethod })}
          value={cart.shippingMethod ?? ""}
        />
        <NumberField
          label="Customer group ID"
          minValue={0}
          onChange={(v) => set({ customerGroup: num(v) })}
          value={cart.customerGroup ?? 0}
        />
        <NumberField
          label="Store view ID"
          minValue={0}
          onChange={(v) => set({ storeId: num(v) })}
          value={cart.storeId ?? 1}
        />
      </div>

      <div>
        <Button isPending={running} onPress={() => run()} variant="accent">
          Calculate fees
        </Button>
      </div>

      {error && (
        <InlineAlert variant="negative">
          <Heading>Couldn't calculate</Heading>
          <Content>{error}</Content>
        </InlineAlert>
      )}

      {result && (
        <div
          className={style({
            display: "flex",
            flexDirection: "column",
            gap: 16,
          })}>
          {result.invalid.length > 0 && (
            <InlineAlert variant="notice">
              <Heading>
                Some fees are skipped because their settings are invalid
              </Heading>
              <Content>
                {result.invalid.map((entry) => (
                  <div
                    key={
                      entry.code
                    }>{`${entry.code}: ${entry.errors.join("; ")}`}</div>
                ))}
              </Content>
            </InlineAlert>
          )}

          <TableView
            aria-label="Fees for this cart"
            styles={style({ width: "full" })}>
            <TableHeader>
              <Column isRowHeader>Fee</Column>
              <Column>Code</Column>
              <Column align="end">Amount</Column>
            </TableHeader>
            <TableBody
              items={result.fees.map((fee) => ({ ...fee, id: fee.code }))}
              renderEmptyState={() => "No fees for this cart."}>
              {(fee) => (
                <Row id={fee.code}>
                  <Cell>{fee.label}</Cell>
                  <Cell>{fee.code}</Cell>
                  <Cell align="end">{money(fee.base_fee)}</Cell>
                </Row>
              )}
            </TableBody>
          </TableView>
          <Text>{`Subtotal ${money(result.subtotal)} · Fees ${money(result.total)}`}</Text>

          {result.options.length > 0 && (
            <div
              className={style({
                display: "flex",
                flexDirection: "column",
                gap: 8,
              })}>
              <Heading level={3}>Fees the buyer can choose</Heading>
              {result.options.map(renderChoice)}
            </div>
          )}
        </div>
      )}
    </main>
  );
}
