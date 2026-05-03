import { Card } from "@douyinfe/semi-ui-19";
import type { ReactElement } from "react";

import { SectionTitle } from "../../common/components/SectionTitle";
import type { SettingsCategory } from "../../shell/types";
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
  modelPanel,
  aboutPanel,
}: SettingsModuleProps) {
  const selectedPanel =
    settingsCategory === "general"
      ? generalPanel
      : settingsCategory === "data"
        ? dataPanel
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
            <div className="space-y-1" role="tablist" aria-label={l("设置分类", "Settings categories")}>
              {settingCategories.map((category) => {
                const active = settingsCategory === category.key;
                return (
                  <button
                    key={category.key}
                    type="button"
                    className={`flex h-10 w-full items-center rounded-md px-3 text-left text-sm font-medium transition ${
                      active
                        ? "bg-slate-100 text-slate-950 shadow-[inset_3px_0_0_hsl(var(--primary))] dark:bg-slate-900 dark:text-slate-100"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-slate-100"
                    }`}
                    role="tab"
                    aria-selected={active}
                    onClick={() => onChangeSettingsCategory(category.key)}
                  >
                    {category.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-4">
            {settingsLoading ? (
              <Card>
                <div className="py-8 text-sm text-slate-500">{l("加载设置中...", "Loading settings...")}</div>
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
