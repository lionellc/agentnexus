import type { ReactElement } from "react";

import { SectionTitle } from "../../common/components/SectionTitle";
import type { SettingsCategory } from "../../shell/types";
import { Button, Card, CardContent } from "../../../shared/ui";
import { useSettingsModuleController } from "./useSettingsModuleController";

export type SettingsCategoryItem = {
  key: SettingsCategory;
  label: string;
};

export type SettingsModuleProps = {
  l: (zh: string, en: string) => string;
  settingCategories: SettingsCategoryItem[];
  settingsCategory: SettingsCategory;
  settingsLoading: boolean;
  onChangeSettingsCategory: (category: SettingsCategory) => void;
  generalPanel: ReactElement;
  dataPanel: ReactElement;
  agentConnectionsPanel: ReactElement;
  modelPanel: ReactElement;
  aboutPanel: ReactElement;
};

export function SettingsModule({
  l,
  settingCategories,
  settingsCategory,
  settingsLoading,
  onChangeSettingsCategory,
  generalPanel,
  dataPanel,
  agentConnectionsPanel,
  modelPanel,
  aboutPanel,
}: SettingsModuleProps) {
  const selectedPanel =
    settingsCategory === "general"
      ? generalPanel
      : settingsCategory === "data"
        ? dataPanel
        : settingsCategory === "agents"
          ? agentConnectionsPanel
          : settingsCategory === "model"
            ? modelPanel
            : settingsCategory === "about"
              ? aboutPanel
              : null;

  const { centerContent } = useSettingsModuleController({
    centerContent: (
      <div className="space-y-4">
        <SectionTitle title={l("设置", "Settings")} subtitle={l("数据目录与 Agent 管理", "Data directory and agent management")} />
        <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
          <div className="h-fit lg:sticky lg:top-4">
            <div className="space-y-2">
              {settingCategories.map((category) => (
                <Button
                  key={category.key}
                  variant={settingsCategory === category.key ? "default" : "outline"}
                  className="min-h-11 w-full justify-start"
                  onClick={() => onChangeSettingsCategory(category.key)}
                >
                  {category.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            {settingsLoading ? (
              <Card>
                <CardContent className="py-8 text-sm text-slate-500">{l("加载设置中...", "Loading settings...")}</CardContent>
              </Card>
            ) : null}

            {selectedPanel}
          </div>
        </div>
      </div>
    ),
  });

  return <>{centerContent}</>;
}
