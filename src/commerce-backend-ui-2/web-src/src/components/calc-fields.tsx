import { Checkbox } from "@react-spectrum/s2/Checkbox";
import { NumberField } from "@react-spectrum/s2/NumberField";
import { Picker, PickerItem } from "@react-spectrum/s2/Picker";
import { style } from "@react-spectrum/s2/style" with { type: "macro" };

import { APPLY_PER_LABELS, CALC_MODE_LABELS } from "../lib/rules.ts";

import type { Key } from "react-aria-components";
import type { ApplyPer, Calc, CalcMode } from "../lib/types.ts";

export type CalcFieldsProps = {
  calc: Calc;
  onChange: (calc: Calc) => void;
};

const grid = style({
  display: "grid",
  gap: 16,
  gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
});

function optionalNumber(value: number): number | undefined {
  return Number.isNaN(value) ? undefined : value;
}

/** How a fee amount is worked out: mode, fixed and percent parts, multiplier, base and caps. */
export function CalcFields({ calc, onChange }: CalcFieldsProps) {
  const mode = calc.mode ?? "fixed";
  const usesFixed = mode !== "percent";
  const usesPercent = mode !== "fixed";
  const set = (patch: Partial<Calc>) => onChange({ ...calc, ...patch });

  return (
    <div
      className={style({ display: "flex", flexDirection: "column", gap: 16 })}>
      <div className={grid}>
        <Picker
          label="Calculation"
          onSelectionChange={(key: Key | null) =>
            set({ mode: String(key) as CalcMode })
          }
          selectedKey={mode}>
          {Object.entries(CALC_MODE_LABELS).map(([id, label]) => (
            <PickerItem id={id} key={id}>
              {label}
            </PickerItem>
          ))}
        </Picker>
        {usesFixed && (
          <NumberField
            label="Fixed amount"
            minValue={0}
            onChange={(value) => set({ fixed: optionalNumber(value) })}
            step={0.01}
            value={calc.fixed ?? 0}
          />
        )}
        {usesFixed && (
          <Picker
            label="Charge the fixed amount"
            onSelectionChange={(key: Key | null) =>
              set({ applyPer: String(key) as ApplyPer })
            }
            selectedKey={calc.applyPer ?? "order"}>
            {Object.entries(APPLY_PER_LABELS).map(([id, label]) => (
              <PickerItem id={id} key={id}>
                {label}
              </PickerItem>
            ))}
          </Picker>
        )}
        {usesPercent && (
          <NumberField
            label="Percent"
            maxValue={100}
            minValue={0}
            onChange={(value) => set({ percent: optionalNumber(value) })}
            step={0.01}
            value={calc.percent ?? 0}
          />
        )}
      </div>

      {usesPercent && (
        <div className={style({ display: "flex", gap: 24 })}>
          <Checkbox
            isSelected={Boolean(calc.base?.includeDiscount)}
            onChange={(includeDiscount) =>
              set({ base: { ...calc.base, includeDiscount } })
            }>
            Take percent after discounts
          </Checkbox>
          <Checkbox
            isSelected={Boolean(calc.base?.includeShipping)}
            onChange={(includeShipping) =>
              set({ base: { ...calc.base, includeShipping } })
            }>
            Include shipping in the percent base
          </Checkbox>
        </div>
      )}

      <div className={grid}>
        <NumberField
          description="Leave empty for no minimum."
          label="Minimum fee"
          minValue={0}
          onChange={(value) => set({ min: optionalNumber(value) })}
          step={0.01}
          value={calc.min ?? Number.NaN}
        />
        <NumberField
          description="Leave empty for no maximum."
          label="Maximum fee"
          minValue={0}
          onChange={(value) => set({ max: optionalNumber(value) })}
          step={0.01}
          value={calc.max ?? Number.NaN}
        />
      </div>
    </div>
  );
}
