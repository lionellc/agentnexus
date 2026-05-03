import { Select as SemiSelect } from "@douyinfe/semi-ui-19";

import { cn } from "../lib/cn";

export type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

export type SelectProps = {
  value: string;
  options: readonly SelectOption[];
  onChange: (value: string) => void;
  className?: string;
  buttonClassName?: string;
  optionsClassName?: string;
  placeholder?: string;
  disabled?: boolean;
  "aria-label"?: string;
};

export function Select({
  value,
  options,
  onChange,
  className,
  buttonClassName,
  optionsClassName,
  placeholder,
  disabled = false,
  "aria-label": ariaLabel,
}: SelectProps) {
  return (
    <SemiSelect
      aria-label={ariaLabel}
      className={cn("w-full", className, buttonClassName)}
      dropdownClassName={optionsClassName}
      disabled={disabled}
      emptyContent={placeholder}
      optionList={[...options]}
      placeholder={placeholder}
      value={value || undefined}
      onChange={(nextValue) => onChange(String(nextValue ?? ""))}
    />
  );
}
