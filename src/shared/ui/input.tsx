import * as React from "react";
import { Input as SemiInput } from "@douyinfe/semi-ui-19";

import { cn } from "../lib/cn";

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size" | "prefix" | "onChange"> {
  mode?: "password";
  onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type = "text", onChange, ...props }, ref) => {
  return (
    <SemiInput
      type={type}
      className={cn(
        "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background",
        "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-0",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      ref={ref}
      {...(props as any)}
      onChange={(_, event) => onChange?.(event)}
    />
  );
});
Input.displayName = "Input";

export { Input };
