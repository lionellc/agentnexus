import { useMemo } from "react";
import type { ReactElement } from "react";

import { SettingsModule } from "../../../features/settings/module/SettingsModule";
import type { SettingsCategory } from "../../../features/shell/types";

type SettingCategoryItem = {
  key: SettingsCategory;
  label: string;
};

type UseWorkbenchSettingsControllerInput = {
  l: (zh: string, en: string) => string;
  settingCategories: SettingCategoryItem[];
  settingsCategory: SettingsCategory;
  settingsLoading: boolean;
  onChangeSettingsCategory: (category: SettingsCategory) => void;
  generalPanel: ReactElement;
  dataPanel: ReactElement;
  modelPanel: ReactElement;
  aboutPanel: ReactElement;
};

export function useWorkbenchSettingsController({
  l,
  settingCategories,
  settingsCategory,
  settingsLoading,
  onChangeSettingsCategory,
  generalPanel,
  dataPanel,
  modelPanel,
  aboutPanel,
}: UseWorkbenchSettingsControllerInput) {
  const module = useMemo(
    () => (
      <SettingsModule
        l={l}
        settingCategories={settingCategories}
        settingsCategory={settingsCategory}
        settingsLoading={settingsLoading}
        onChangeSettingsCategory={onChangeSettingsCategory}
        generalPanel={generalPanel}
        dataPanel={dataPanel}
        modelPanel={modelPanel}
        aboutPanel={aboutPanel}
      />
    ),
    [
      aboutPanel,
      dataPanel,
      generalPanel,
      l,
      modelPanel,
      onChangeSettingsCategory,
      settingCategories,
      settingsCategory,
      settingsLoading,
    ],
  );

  return {
    module,
  };
}
