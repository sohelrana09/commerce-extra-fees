import { AlertDialog } from "@react-spectrum/s2/AlertDialog";
import { Button } from "@react-spectrum/s2/Button";
import { ButtonGroup } from "@react-spectrum/s2/ButtonGroup";
import { Content } from "@react-spectrum/s2/Content";
import { DialogTrigger } from "@react-spectrum/s2/Dialog";
import { Heading } from "@react-spectrum/s2/Heading";
import { InlineAlert } from "@react-spectrum/s2/InlineAlert";
import { NumberField } from "@react-spectrum/s2/NumberField";
import { Picker, PickerItem } from "@react-spectrum/s2/Picker";
import { Switch } from "@react-spectrum/s2/Switch";
import { style } from "@react-spectrum/s2/style" with { type: "macro" };
import { Tab, TabList, TabPanel, Tabs } from "@react-spectrum/s2/Tabs";
import { Text } from "@react-spectrum/s2/Text";
import { TextArea } from "@react-spectrum/s2/TextArea";
import { TextField } from "@react-spectrum/s2/TextField";
import { useState } from "react";

import { ApiError } from "../hooks/use-fees-api.ts";
import {
  cleanRule,
  INPUT_LABELS,
  RULE_TYPE_LABELS,
  toCode,
} from "../lib/rules.ts";
import { CalcFields } from "./calc-fields.tsx";
import { ConditionField } from "./condition-field.tsx";
import { OptionsEditor } from "./options-editor.tsx";
import { ScopePicker } from "./scope-picker.tsx";

import type { Key } from "react-aria-components";
import type { FeeRule, InputType, Lookups, RuleType } from "../lib/types.ts";

export type RuleEditorProps = {
  initial: FeeRule;
  lookups: Lookups | null;
  onCancel: () => void;
  onDelete: (code: string) => Promise<void>;
  onSave: (rule: FeeRule, previousCode?: string) => Promise<void>;
  /** The saved code when editing; undefined for a new rule. */
  originalCode?: string;
};

const column = style({
  display: "flex",
  flexDirection: "column",
  gap: 16,
  paddingY: 16,
});
const grid = style({
  display: "grid",
  gap: 16,
  gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
});

const CART_FIELDS =
  "subtotal, qty, item_count, weight, shipping_method, country, region, postcode, city, customer_group, customer_is_guest, store_id";
const ITEM_FIELDS =
  "sku, qty, price, row_total, weight, category_ids, attr.<attribute_code>";

function optionalNumber(value: number): number | undefined {
  return Number.isNaN(value) ? undefined : value;
}

export function RuleEditor({
  initial,
  originalCode,
  lookups,
  onSave,
  onDelete,
  onCancel,
}: RuleEditorProps) {
  const [rule, setRule] = useState<FeeRule>(initial);
  const [invalidJson, setInvalidJson] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const isNew = originalCode === undefined;
  const set = (patch: Partial<FeeRule>) =>
    setRule((current) => ({ ...current, ...patch }));
  const hasJsonErrors = Object.values(invalidJson).some(Boolean);

  const handleSave = async () => {
    setSaving(true);
    setErrors([]);
    try {
      await onSave(cleanRule(rule), originalCode);
    } catch (error) {
      setErrors(
        error instanceof ApiError && error.errors.length
          ? error.errors
          : [(error as Error).message],
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <main
      className={style({ display: "flex", flexDirection: "column", gap: 8 })}>
      <div className={style({ alignItems: "center", display: "flex", gap: 8 })}>
        <Heading level={1} styles={style({ flexGrow: 1 })}>
          {isNew ? "New fee" : rule.label || originalCode}
        </Heading>
        <ButtonGroup>
          {!isNew && (
            <DialogTrigger>
              <Button variant="negative">Delete</Button>
              <AlertDialog
                onPrimaryAction={() => onDelete(originalCode)}
                primaryActionLabel="Delete"
                secondaryActionLabel="Cancel"
                title="Delete this fee?"
                variant="destructive">
                Carts stop getting “{rule.label}” as soon as the change reaches
                checkout (within a minute). Orders already placed keep their
                fee.
              </AlertDialog>
            </DialogTrigger>
          )}
          <Button onPress={onCancel} variant="secondary">
            Cancel
          </Button>
          <Button
            isDisabled={hasJsonErrors || !rule.code || !rule.label}
            isPending={saving}
            onPress={handleSave}
            variant="accent">
            Save
          </Button>
        </ButtonGroup>
      </div>

      {errors.length > 0 && (
        <InlineAlert variant="negative">
          <Heading>The fee wasn't saved</Heading>
          <Content>
            {errors.map((message) => (
              <div key={message}>{message}</div>
            ))}
          </Content>
        </InlineAlert>
      )}

      <Tabs aria-label="Fee settings">
        <TabList>
          <Tab id="general">General</Tab>
          <Tab id="scope">Stores & groups</Tab>
          <Tab id="conditions">Conditions</Tab>
          <Tab id="calculation">Calculation</Tab>
          <Tab id="options">Options</Tab>
        </TabList>

        <TabPanel id="general">
          <GeneralTab isNew={isNew} rule={rule} set={set} />
        </TabPanel>

        <TabPanel id="scope">
          <div className={column}>
            <ScopePicker
              available={lookups?.storeViews ?? []}
              description="Leave empty to charge in every store view."
              label="Store views"
              onChange={(stores) => set({ stores })}
              unavailable={lookups?.unavailable}
              value={rule.stores ?? []}
            />
            <ScopePicker
              available={lookups?.customerGroups ?? []}
              description="Leave empty to charge every customer group, including guests (group 0)."
              label="Customer groups"
              onChange={(customerGroups) => set({ customerGroups })}
              unavailable={lookups?.unavailable}
              value={rule.customerGroups ?? []}
            />
          </div>
        </TabPanel>

        <TabPanel id="conditions">
          <div className={column}>
            <div className={grid}>
              <NumberField
                description="Charge only when the subtotal is at least this."
                label="Subtotal from"
                minValue={0}
                onChange={(min) =>
                  set({
                    subtotal: { ...rule.subtotal, min: optionalNumber(min) },
                  })
                }
                value={rule.subtotal?.min ?? Number.NaN}
              />
              <NumberField
                description="Charge only when the subtotal is below this (a small-order fee)."
                label="Subtotal under"
                minValue={0}
                onChange={(max) =>
                  set({
                    subtotal: { ...rule.subtotal, max: optionalNumber(max) },
                  })
                }
                value={rule.subtotal?.max ?? Number.NaN}
              />
            </div>
            <ConditionField
              description={`Cart conditions as JSON, e.g. {"all":[{"field":"country","op":"in","value":"US,CA"}]}. Fields: ${CART_FIELDS}.`}
              key={`conditions-${originalCode ?? "new"}`}
              label="Cart conditions"
              onChange={(conditions) => set({ conditions })}
              onValidityChange={(valid) =>
                setInvalidJson((s) => ({ ...s, conditions: !valid }))
              }
              value={rule.conditions}
            />
            <ConditionField
              description={`Which products the fee applies to. The fee is charged only if at least one line matches; per-item, per-unit and percent fees count matching lines only. Fields: ${ITEM_FIELDS}.`}
              key={`items-${originalCode ?? "new"}`}
              label="Product conditions"
              onChange={(items) => set({ items })}
              onValidityChange={(valid) =>
                setInvalidJson((s) => ({ ...s, items: !valid }))
              }
              value={rule.items}
            />
            <Text>
              Operators: eq, neq, gt, gte, lt, lte, between, in, nin, contains,
              starts_with. Combine with {'{"all": [...]}'}, {'{"any": [...]}'}{" "}
              and {'{"not": {...}}'}.
            </Text>
          </div>
        </TabPanel>

        <TabPanel id="calculation">
          <div className={column}>
            {rule.options?.length ? (
              <Text>
                This fee has options; each option sets its own price on the
                Options tab.
              </Text>
            ) : null}
            <CalcFields
              calc={rule.calc ?? { fixed: 0, mode: "fixed" }}
              onChange={(calc) => set({ calc })}
            />
          </div>
        </TabPanel>

        <TabPanel id="options">
          <div className={column}>
            <OptionsEditor
              onChange={(options) => set({ options })}
              options={rule.options ?? []}
            />
          </div>
        </TabPanel>
      </Tabs>
    </main>
  );
}

type GeneralTabProps = {
  isNew: boolean;
  rule: FeeRule;
  set: (patch: Partial<FeeRule>) => void;
};

function GeneralTab({ isNew, rule, set }: GeneralTabProps) {
  const type = rule.type ?? "automatic";
  return (
    <div className={column}>
      <Switch
        isSelected={rule.enabled !== false}
        onChange={(enabled) => set({ enabled })}>
        Charge this fee
      </Switch>
      <div className={grid}>
        <TextField
          description="Shown on the cart, checkout, order and invoice."
          isRequired
          label="Label"
          onChange={(label) =>
            set({
              code: isNew && !rule.code ? toCode(label) : rule.code,
              label,
            })
          }
          value={rule.label}
        />
        <TextField
          description="Unique; a-z, 0-9 and _. Changing it starts a new fee line."
          isRequired
          label="Code"
          onChange={(code) => set({ code: toCode(code) })}
          value={rule.code}
        />
        <NumberField
          description="Lower numbers show first."
          label="Sort order"
          onChange={(value) => set({ sortOrder: optionalNumber(value) ?? 0 })}
          value={rule.sortOrder ?? 0}
        />
      </div>
      <TextArea
        description="Shown to buyers next to optional fees."
        label="Description"
        onChange={(description) => set({ description })}
        value={rule.description ?? ""}
      />
      <div className={grid}>
        <Picker
          label="Type"
          onSelectionChange={(key: Key | null) =>
            set({ type: String(key) as RuleType })
          }
          selectedKey={type}>
          {Object.entries(RULE_TYPE_LABELS).map(([id, label]) => (
            <PickerItem id={id} key={id}>
              {label}
            </PickerItem>
          ))}
        </Picker>
        {type !== "automatic" && (
          <Picker
            label="Buyer chooses with"
            onSelectionChange={(key: Key | null) =>
              set({ input: String(key) as InputType })
            }
            selectedKey={rule.input ?? "checkbox"}>
            {Object.entries(INPUT_LABELS).map(([id, label]) => (
              <PickerItem id={id} key={id}>
                {label}
              </PickerItem>
            ))}
          </Picker>
        )}
      </div>
      {type !== "automatic" && (
        <Text>
          Buyers choose this fee in the storefront with the Extra Fees block.
          Until a buyer chooses, a required fee charges its default option and
          an optional fee isn't charged.
        </Text>
      )}
    </div>
  );
}
