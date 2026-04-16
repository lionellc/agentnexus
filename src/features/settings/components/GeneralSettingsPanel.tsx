import type { AppLanguage } from "../../shell/types";
import { Card, CardContent, CardHeader, CardTitle, Select } from "../../../shared/ui";

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
  selectBaseClass,
  theme,
  language,
  onThemeChange,
  onLanguageChange,
}: GeneralSettingsPanelProps) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{l("通用设置", "General")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <label className="block text-xs text-slate-500">
            {l("主题", "Theme")}
            <Select
              className="mt-1"
              buttonClassName={selectBaseClass}
              value={theme}
              onChange={(value) => onThemeChange(value as GeneralSettingsPanelTheme)}
              options={[
                { value: "light", label: l("日间模式", "Day Mode") },
                { value: "dark", label: l("夜间模式", "Night Mode") },
              ]}
            />
          </label>
          <label className="block text-xs text-slate-500">
            {l("语言", "Language")}
            <Select
              className="mt-1"
              buttonClassName={selectBaseClass}
              value={language}
              onChange={(value) => onLanguageChange(value as AppLanguage)}
              options={[
                { value: "zh-CN", label: l("中文", "Chinese") },
                { value: "en-US", label: "English" },
              ]}
            />
          </label>
          <div className="text-xs text-slate-500">{l("切换后立即生效。", "Changes apply immediately.")}</div>
        </CardContent>
      </Card>
    </div>
  );
}
