import { Picker, PickerItem } from "@react-spectrum/s2/Picker";
import { TextField } from "@react-spectrum/s2/TextField";

export type ScopePickerProps = {
  available: { id: number; label: string }[];
  description: string;
  label: string;
  onChange: (value: number[]) => void;
  unavailable?: boolean;
  value: number[];
};

function parseIds(text: string): number[] {
  return text
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((n) => Number.isInteger(n) && n >= 0);
}

/**
 * Multi-select of store views or customer groups loaded from Commerce. Falls back to typed IDs
 * when Commerce couldn't be reached.
 */
export function ScopePicker({
  label,
  description,
  available,
  value,
  onChange,
  unavailable,
}: ScopePickerProps) {
  if (unavailable || available.length === 0) {
    return (
      <TextField
        description={`${description} Commerce couldn't be reached, so enter IDs separated by commas.`}
        label={label}
        onChange={(text) => onChange(parseIds(text))}
        value={value.join(", ")}
      />
    );
  }

  return (
    <Picker
      description={description}
      items={available}
      label={label}
      onChange={(keys) => onChange([...keys].map(Number))}
      selectionMode="multiple"
      value={value}>
      {(item) => (
        <PickerItem id={item.id} textValue={item.label}>
          {`${item.label} (${item.id})`}
        </PickerItem>
      )}
    </Picker>
  );
}
