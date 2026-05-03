import type { ReactElement } from "react";

import { UsageDashboard } from "../components/UsageDashboard";

type UsageModuleProps = {
  l: (zh: string, en: string) => string;
  dashboard?: ReactElement;
};

export function UsageModule({ l, dashboard }: UsageModuleProps) {
  return dashboard ?? <UsageDashboard l={l} />;
}
