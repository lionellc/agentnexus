import type { ReactElement } from "react";

import { UsageDashboard } from "../components/UsageDashboard";

type UsageModuleProps = {
  l: (zh: string, en: string) => string;
  workspaceId: string | null;
  dashboard?: ReactElement;
};

export function UsageModule({ l, workspaceId, dashboard }: UsageModuleProps) {
  return dashboard ?? <UsageDashboard l={l} workspaceId={workspaceId} />;
}
