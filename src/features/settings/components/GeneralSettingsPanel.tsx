import { ChevronDown } from "lucide-react";

import type { AppLanguage } from "../../shell/types";
import { Card, CardContent, CardHeader, CardTitle } from "../../../shared/ui";

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
            <div className="relative mt-1">
              <select
                className={selectBaseClass}
                value={theme}
                onChange={(event) => onThemeChange(event.currentTarget.value as GeneralSettingsPanelTheme)}
              >
                <option value="light">{l("日间模式", "Day Mode")}</option>
                <option value="dark">{l("夜间模式", "Night Mode")}</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            </div>
          </label>
          <label className="block text-xs text-slate-500">
            {l("语言", "Language")}
            <div className="relative mt-1">
              <select
                className={selectBaseClass}
                value={language}
                onChange={(event) => onLanguageChange(event.currentTarget.value as AppLanguage)}
              >
                <option value="zh-CN">{l("中文", "Chinese")}</option>
                <option value="en-US">English</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            </div>
          </label>
          <div className="text-xs text-slate-500">{l("切换后立即生效。", "Changes apply immediately.")}</div>
        </CardContent>
      </Card>
    </div>
  );
}
