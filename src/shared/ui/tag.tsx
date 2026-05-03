import * as React from "react";
import { Tag as SemiTag } from "@douyinfe/semi-ui-19";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../lib/cn";

const tagVariants = cva(
  "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium leading-5 transition-colors",
  {
    variants: {
      tone: {
        neutral:
          "border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-600 dark:bg-slate-800/70 dark:text-slate-200",
        info: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-700/60 dark:bg-sky-500/20 dark:text-sky-200",
        success:
          "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-700/60 dark:bg-emerald-500/20 dark:text-emerald-200",
        warning:
          "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-700/60 dark:bg-amber-500/20 dark:text-amber-200",
        danger:
          "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-700/60 dark:bg-rose-500/20 dark:text-rose-200",
      },
      size: {
        sm: "px-1.5 py-0 text-[10px]",
        md: "px-2 py-0.5 text-xs",
      },
    },
    defaultVariants: {
      tone: "neutral",
      size: "md",
    },
  },
);

export interface TagProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof tagVariants> {}

function toneToColor(tone: TagProps["tone"]) {
  if (tone === "info") {
    return "blue" as const;
  }
  if (tone === "success") {
    return "green" as const;
  }
  if (tone === "warning") {
    return "orange" as const;
  }
  if (tone === "danger") {
    return "red" as const;
  }
  return "grey" as const;
}

function Tag({ className, tone, size, ...props }: TagProps) {
  return (
    <SemiTag
      color={toneToColor(tone)}
      size={size === "sm" ? "small" : "default"}
      type="light"
      className={cn(tagVariants({ tone, size }), className)}
      {...(props as any)}
    />
  );
}

export { Tag, tagVariants };
