import * as React from "react";
import { TextArea as SemiTextArea } from "@douyinfe/semi-ui-19";

import { cn } from "../lib/cn";

export interface TextareaProps extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange"> {
  onChange?: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
}

function createTextareaChangeEvent(value: string): React.ChangeEvent<HTMLTextAreaElement> {
  return {
    currentTarget: { value },
    target: { value },
  } as React.ChangeEvent<HTMLTextAreaElement>;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, onChange, ...props }, ref) => {
  return (
    <SemiTextArea
      className={cn(
        "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background",
        "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-0",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      ref={ref}
      {...(props as any)}
      onChange={(value) => onChange?.(createTextareaChangeEvent(value))}
    />
  );
});
Textarea.displayName = "Textarea";

export { Textarea };
