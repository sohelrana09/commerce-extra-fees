import { TextArea } from "@react-spectrum/s2/TextArea";
import { useState } from "react";

import type { Condition } from "../lib/types.ts";

export type ConditionFieldProps = {
  description: string;
  label: string;
  onChange: (value: Condition | undefined) => void;
  onValidityChange: (valid: boolean) => void;
  value: Condition | undefined;
};

function stringify(value: Condition | undefined): string {
  return value ? JSON.stringify(value, null, 2) : "";
}

/**
 * Edits a condition tree as JSON. Empty means "no condition". The text is kept while it's
 * invalid so the admin can finish typing; the rule can't be saved until it parses.
 */
export function ConditionField({
  label,
  description,
  value,
  onChange,
  onValidityChange,
}: ConditionFieldProps) {
  // Initialised once; the editor remounts this field (via `key`) when another rule is loaded.
  const [text, setText] = useState(() => stringify(value));
  const [error, setError] = useState<string | null>(null);

  const handleChange = (next: string) => {
    setText(next);
    if (next.trim() === "") {
      setError(null);
      onValidityChange(true);
      onChange(undefined);
      return;
    }
    try {
      const parsed = JSON.parse(next);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error('Use an object such as { "all": [ ... ] }');
      }
      setError(null);
      onValidityChange(true);
      onChange(parsed);
    } catch (parseError) {
      setError((parseError as Error).message);
      onValidityChange(false);
    }
  };

  return (
    <TextArea
      description={description}
      errorMessage={error ?? undefined}
      isInvalid={Boolean(error)}
      label={label}
      onChange={handleChange}
      styles={{ width: "full" } as never}
      value={text}
    />
  );
}
