import { LocaleProvider } from "@douyinfe/semi-ui-19";
import enUS from "@douyinfe/semi-ui-19/lib/es/locale/source/en_US";
import zhCN from "@douyinfe/semi-ui-19/lib/es/locale/source/zh_CN";
import { useEffect, type ReactNode } from "react";

import type { AppTheme } from "../../app/workbench/types";
import type { AppLanguage } from "../../features/shell/types";

type SemiAppProviderProps = {
  children: ReactNode;
  language: AppLanguage;
  theme: AppTheme;
};

export function SemiAppProvider({ children, language, theme }: SemiAppProviderProps) {
  const locale = language === "zh-CN" ? zhCN : enUS;

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    document.body.setAttribute("theme-mode", theme);
    return () => {
      document.body.removeAttribute("theme-mode");
    };
  }, [theme]);

  return <LocaleProvider locale={locale}>{children}</LocaleProvider>;
}
