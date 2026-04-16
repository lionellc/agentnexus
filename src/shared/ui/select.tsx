import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from "@headlessui/react";
import { Check, ChevronDown } from "lucide-react";

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
  const selectedOption = options.find((option) => option.value === value);
  const selectedLabel = selectedOption?.label ?? placeholder ?? "";

  return (
    <Listbox value={value} onChange={onChange} disabled={disabled}>
      <div className={cn("relative w-full", className)}>
        <ListboxButton
          aria-label={ariaLabel}
          className={cn(
            "flex h-10 w-full items-center rounded-md border border-input bg-background px-3 pr-9 text-left text-sm text-foreground",
            "transition-colors hover:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
            buttonClassName,
          )}
        >
          <span className="truncate">{selectedLabel || "\u00A0"}</span>
          <ChevronDown className="pointer-events-none absolute right-3 h-4 w-4 text-slate-400" />
        </ListboxButton>
        <ListboxOptions
          className={cn(
            "absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border border-input bg-background p-1 shadow-lg focus:outline-none",
            optionsClassName,
          )}
        >
          {options.map((option) => (
            <ListboxOption
              key={option.value}
              value={option.value}
              disabled={option.disabled}
              className={cn(
                "group relative flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-slate-700 outline-none",
                "data-[focus]:bg-accent data-[focus]:text-accent-foreground data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
                "dark:text-slate-200 dark:data-[focus]:bg-slate-800 dark:data-[focus]:text-slate-100",
              )}
            >
              <span className="truncate group-data-[selected]:font-medium">{option.label}</span>
              <Check className="ml-auto h-4 w-4 text-primary opacity-0 group-data-[selected]:opacity-100" />
            </ListboxOption>
          ))}
        </ListboxOptions>
      </div>
    </Listbox>
  );
}
