export interface SettingItem {
  key: string;
  value: string;
  description: string;
  updatedAt: string;
}

export interface SettingsUpsertInput {
  key: string;
  value: string;
  description?: string;
}
