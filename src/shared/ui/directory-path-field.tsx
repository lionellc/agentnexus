import type { ReactNode } from "react";
import { Input } from "@douyinfe/semi-ui-19";

import { cn } from "../lib/cn";
import { Button } from "./button";
import { FormField, FormLabel } from "./fieldset";

export type DirectoryPathFieldProps = {
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onPickDirectory: () => void;
  pickButtonLabel: ReactNode;
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
  buttonClassName?: string;
};

export function DirectoryPathField({
  label,
  value,
  onChange,
  placeholder,
  onPickDirectory,
  pickButtonLabel,
  disabled = false,
  className,
  inputClassName,
  buttonClassName,
}: DirectoryPathFieldProps) {
  return (
    <FormField className={cn("space-y-1", className)}>
      <FormLabel>{label}</FormLabel>
      <div className="flex items-center gap-2">
        <Input
          value={value}
          onChange={(nextValue) => onChange(nextValue)}
          placeholder={placeholder}
          disabled={disabled}
          className={cn("min-w-0 flex-1 font-mono text-xs sm:text-sm", inputClassName)}
        />
        <Button
          type="button"
          variant="outline"
          onClick={onPickDirectory}
          disabled={disabled}
          className={cn("shrink-0", buttonClassName)}
        >
          {pickButtonLabel}
        </Button>
      </div>
    </FormField>
  );
}
