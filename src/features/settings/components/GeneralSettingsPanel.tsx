import { Card, Select } from "@douyinfe/semi-ui-19";
import type { AppLanguage } from "../../shell/types";

export type GeneralSettingsPanelTheme = "light" | "dark";

export type GeneralSettingsPanelProps = {
  l: (zh: string, en: string) => string;
  selectBaseClass: string;
  theme: GeneralSettingsPanelTheme;
  language: AppLanguage;
  onThemeChange: (theme: GeneralSettingsPanelTheme) => void;
  onLanguageChange: (language: AppLanguage) => void;
};

export function GeneralSettingsPanel({
  l,
  selectBaseClass: _selectBaseClass,
  theme,
  language,
  onThemeChange,
  onLanguageChange,
}: GeneralSettingsPanelProps) {
  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-4">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">{l("通用设置", "General")}</h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {l("调整界面显示偏好，修改后立即生效。", "Adjust display preferences. Changes apply immediately.")}
          </p>
        </div>
        <div className="divide-y divide-slate-200 rounded-md border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
          <div className="grid gap-3 px-4 py-4 md:grid-cols-[220px_1fr] md:items-center">
            <div>
              <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{l("主题", "Theme")}</div>
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {l("选择日间或夜间界面。", "Choose light or dark appearance.")}
              </div>
            </div>
            <Select
              value={theme}
              onChange={(value) => onThemeChange(value as GeneralSettingsPanelTheme)}
              optionList={[
                { value: "light", label: l("日间模式", "Day Mode") },
                { value: "dark", label: l("夜间模式", "Night Mode") },
              ]}
            />
          </div>
          <div className="grid gap-3 px-4 py-4 md:grid-cols-[220px_1fr] md:items-center">
            <div>
              <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{l("语言", "Language")}</div>
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {l("切换应用显示语言。", "Switch the application language.")}
              </div>
            </div>
            <Select
              value={language}
              onChange={(value) => onLanguageChange(value as AppLanguage)}
              optionList={[
                { value: "zh-CN", label: l("中文", "Chinese") },
                { value: "en-US", label: "English" },
              ]}
            />
          </div>
        </div>
      </Card>
    </div>
  );
}
