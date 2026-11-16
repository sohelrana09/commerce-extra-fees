import { ActionButton } from "@react-spectrum/s2/ActionButton";
import { Button } from "@react-spectrum/s2/Button";
import { Checkbox } from "@react-spectrum/s2/Checkbox";
import {
  Disclosure,
  DisclosurePanel,
  DisclosureTitle,
} from "@react-spectrum/s2/Disclosure";
import Delete from "@react-spectrum/s2/icons/Delete";
import { style } from "@react-spectrum/s2/style" with { type: "macro" };
import { Text } from "@react-spectrum/s2/Text";
import { TextField } from "@react-spectrum/s2/TextField";

import { describeCalc, toCode } from "../lib/rules.ts";
import { CalcFields } from "./calc-fields.tsx";

import type { FeeOption } from "../lib/types.ts";

export type OptionsEditorProps = {
  onChange: (options: FeeOption[]) => void;
  options: FeeOption[];
};

/** Priced choices for optional and required fees (for example Basic and Full insurance). */
export function OptionsEditor({ options, onChange }: OptionsEditorProps) {
  const update = (index: number, patch: Partial<FeeOption>) =>
    onChange(
      options.map((option, i) =>
        i === index ? { ...option, ...patch } : option,
      ),
    );
  const remove = (index: number) =>
    onChange(options.filter((_, i) => i !== index));
  const add = () =>
    onChange([
      ...options,
      { calc: { fixed: 0, mode: "fixed" }, code: "", label: "" },
    ]);

  return (
    <div
      className={style({ display: "flex", flexDirection: "column", gap: 12 })}>
      <Text>
        Without options, the fee uses the Calculation tab. With options, the
        buyer picks one or more and each option has its own price.
      </Text>
      {options.map((option, index) => (
        <Disclosure defaultExpanded={!option.code} key={index}>
          <DisclosureTitle>
            {option.label || "New option"} — {describeCalc(option.calc)}
          </DisclosureTitle>
          <DisclosurePanel>
            <div
              className={style({
                display: "flex",
                flexDirection: "column",
                gap: 16,
              })}>
              <div
                className={style({
                  alignItems: "end",
                  display: "flex",
                  gap: 16,
                })}>
                <TextField
                  isRequired
                  label="Option label"
                  onChange={(label) =>
                    update(index, {
                      code: option.code || toCode(label),
                      label,
                    })
                  }
                  value={option.label}
                />
                <TextField
                  description="a-z, 0-9 and _"
                  isRequired
                  label="Option code"
                  onChange={(code) => update(index, { code: toCode(code) })}
                  value={option.code}
                />
                <Checkbox
                  isSelected={Boolean(option.default)}
                  onChange={(isDefault) =>
                    update(index, { default: isDefault })
                  }>
                  Selected by default
                </Checkbox>
                <ActionButton
                  aria-label="Remove option"
                  onPress={() => remove(index)}>
                  <Delete />
                </ActionButton>
              </div>
              <CalcFields
                calc={option.calc ?? { fixed: 0, mode: "fixed" }}
                onChange={(calc) => update(index, { calc })}
              />
            </div>
          </DisclosurePanel>
        </Disclosure>
      ))}
      <div>
        <Button onPress={add} variant="secondary">
          Add option
        </Button>
      </div>
    </div>
  );
}
