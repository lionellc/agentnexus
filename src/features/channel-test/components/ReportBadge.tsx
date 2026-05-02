import type { ReactNode } from "react";

type ReportBadgeTone = "success" | "warning" | "danger" | "info" | "neutral";

type ReportBadgeProps = {
  tone?: ReportBadgeTone;
  children: ReactNode;
};

export function ReportBadge({ tone = "neutral", children }: ReportBadgeProps) {
  return <span className={`${BASE_CLASS} ${TONE_CLASS[tone]}`}>{children}</span>;
}

const BASE_CLASS =
  "inline-block min-w-0 max-w-full whitespace-normal break-words rounded-md border px-2.5 py-1 text-xs font-medium leading-5 [overflow-wrap:anywhere]";

const TONE_CLASS: Record<ReportBadgeTone, string> = {
  success:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-200",
  warning:
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-200",
  danger: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/15 dark:text-rose-200",
  info: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/15 dark:text-blue-200",
  neutral:
    "border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-600/50 dark:bg-slate-800/70 dark:text-slate-200",
};
