import type { ReactNode } from "react";
import { Empty } from "@douyinfe/semi-ui-19";

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center dark:border-slate-700 dark:bg-slate-900">
      <Empty title={title} description={description} />
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
