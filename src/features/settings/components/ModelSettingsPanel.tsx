import { Button, Select, TextArea, Modal } from "@douyinfe/semi-ui-19";
import { type ReactNode } from "react";

import { ModelWorkbenchPanel, type LocalAgentProfileItem, type ModelProfileSourceType } from "./ModelWorkbenchPanel";
import { TranslatableTextViewer } from "../../common/components/TranslatableTextViewer";

type ModelTestResult = {
  ok: boolean;
  text: string;
} | null;

type TargetLanguageOption = {
  value: string;
  label: string;
};

export type ModelSettingsPanelProps = {
  l: (zh: string, en: string) => string;
  isZh: boolean;
  modelLoading: boolean;
  modelSaving: boolean;
  localAgentProfiles: LocalAgentProfileItem[];
  selectedModelProfileKey: string;
  onSelectModelProfileKey: (key: string) => void;
  onDeleteModelProfile: (key: string) => void;
  modelProfileName: string;
  onModelProfileNameChange: (value: string) => void;
  modelExecutable: string;
  onModelExecutableChange: (value: string) => void;
  modelArgsTemplateText: string;
  onModelArgsTemplateTextChange: (value: string) => void;
  onSaveModelProfile: () => void;
  newModelProfileName: string;
  onNewModelProfileNameChange: (value: string) => void;
  onAddModelProfile: (sourceType: ModelProfileSourceType) => Promise<boolean> | boolean;
  translationDefaultProfileKey: string;
  modelTestRunning: boolean;
  modelScenarioSettingsOpen: boolean;
  onModelScenarioSettingsOpenChange: (open: boolean) => void;
  modelScenarioTestOpen: boolean;
  onModelScenarioTestOpenChange: (open: boolean) => void;
  onOpenModelScenarioSettings: () => void;
  onOpenModelScenarioTest: () => void;
  onRestoreDefaultTranslationConfig: () => void;
  onSaveTranslationConfigFromDialog: () => void;
  onTranslationDefaultProfileKeyChange: (value: string) => void;
  translationPromptTemplate: string;
  onTranslationPromptTemplateChange: (value: string) => void;
  modelTestSourceText: string;
  onModelTestSourceTextChange: (value: string) => void;
  modelTestResult: ModelTestResult;
  translationTargetLanguage: string;
  translationTargetLanguageOptions: TargetLanguageOption[];
  onTranslationTargetLanguageChange: (value: string) => void;
  onRunModelTranslationTest: () => void;
  onOpenModelTestOutputSheet: () => void;
};

export function ModelSettingsPanel({
  l,
  isZh,
  modelLoading,
  modelSaving,
  localAgentProfiles,
  selectedModelProfileKey,
  onSelectModelProfileKey,
  onDeleteModelProfile,
  modelProfileName,
  onModelProfileNameChange,
  modelExecutable,
  onModelExecutableChange,
  modelArgsTemplateText,
  onModelArgsTemplateTextChange,
  onSaveModelProfile,
  newModelProfileName,
  onNewModelProfileNameChange,
  onAddModelProfile,
  translationDefaultProfileKey,
  modelTestRunning,
  modelScenarioSettingsOpen,
  onModelScenarioSettingsOpenChange,
  modelScenarioTestOpen,
  onModelScenarioTestOpenChange,
  onOpenModelScenarioSettings,
  onOpenModelScenarioTest,
  onRestoreDefaultTranslationConfig,
  onSaveTranslationConfigFromDialog,
  onTranslationDefaultProfileKeyChange,
  translationPromptTemplate,
  onTranslationPromptTemplateChange,
  modelTestSourceText,
  onModelTestSourceTextChange,
  modelTestResult,
  translationTargetLanguage,
  translationTargetLanguageOptions,
  onTranslationTargetLanguageChange,
  onRunModelTranslationTest,
  onOpenModelTestOutputSheet,
}: ModelSettingsPanelProps) {
  const defaultAgentOptions = localAgentProfiles.map((item) => ({
    value: item.profileKey,
    label: item.name || item.profileKey,
  }));
  const hasCurrentDefaultAgent =
    translationDefaultProfileKey.trim().length > 0 &&
    defaultAgentOptions.some((option) => option.value === translationDefaultProfileKey);
  const currentDefaultAgentOption = hasCurrentDefaultAgent
    ? []
    : translationDefaultProfileKey.trim()
      ? [
          {
            value: translationDefaultProfileKey,
            label: translationDefaultProfileKey,
          },
        ]
      : [];
  const allDefaultAgentOptions = [...currentDefaultAgentOption, ...defaultAgentOptions];

  let resultFeedback: ReactNode = null;
  if (modelTestResult) {
    resultFeedback = (
      <div
        className={`rounded-md border px-3 py-2 text-xs ${
          modelTestResult.ok
            ? "border-green-200 bg-green-50 text-green-700"
            : "border-red-200 bg-red-50 text-red-700"
        }`}
      >
        {modelTestResult.text}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ModelWorkbenchPanel
        isZh={isZh}
        loading={modelLoading || modelSaving}
        profiles={localAgentProfiles.map((item) => ({
          profileKey: item.profileKey,
          name: item.name,
          executable: item.executable,
          argsTemplate: item.argsTemplate,
          isBuiltin: item.isBuiltin,
          enabled: item.enabled,
          sourceType: "localAgent",
        }))}
        selectedProfileKey={selectedModelProfileKey}
        onSelectProfile={onSelectModelProfileKey}
        onDeleteProfile={onDeleteModelProfile}
        profileName={modelProfileName}
        onProfileNameChange={onModelProfileNameChange}
        executable={modelExecutable}
        onExecutableChange={onModelExecutableChange}
        argsTemplateText={modelArgsTemplateText}
        onArgsTemplateTextChange={onModelArgsTemplateTextChange}
        onSaveProfile={onSaveModelProfile}
        newProfileName={newModelProfileName}
        onNewProfileNameChange={onNewModelProfileNameChange}
        onAddProfile={onAddModelProfile}
        translationScenarioDefaultProfileKey={translationDefaultProfileKey}
        onOpenTranslationScenarioSettings={onOpenModelScenarioSettings}
        onOpenTranslationScenarioTest={onOpenModelScenarioTest}
        testRunning={modelTestRunning}
      />

      <Modal visible={modelScenarioSettingsOpen} onCancel={() => onModelScenarioSettingsOpenChange(false)} footer={null} title={null}>
        <div className="max-w-3xl space-y-5">
          <div className="pr-10">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{l("翻译场景设置", "Translation Scenario Settings")}</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {l(
                "配置翻译场景的默认 Agent 和 Prompt 模板。",
                "Configure default agent and prompt template for translation scenario.",
              )}
            </p>
          </div>
          <div className="grid gap-5">
            <div className="grid gap-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-200">{l("Agent", "Agent")}</label>
              <Select
                className="max-w-md"
                value={translationDefaultProfileKey}
                onChange={(value) => onTranslationDefaultProfileKeyChange(String(value ?? ""))}
                optionList={allDefaultAgentOptions}
                placeholder={l("请选择 Agent", "Select agent")}
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-200">{l("模板配置", "Prompt Template")}</label>
              <TextArea
                value={translationPromptTemplate}
                onChange={(value) => onTranslationPromptTemplateChange(value)}
                rows={12}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
            <Button type="tertiary" onClick={onRestoreDefaultTranslationConfig}>
              {l("恢复默认配置", "Restore Defaults")}
            </Button>
            <Button theme="solid" type="primary" onClick={onSaveTranslationConfigFromDialog} disabled={modelLoading}>
              {l("保存模板配置", "Save Template Config")}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal visible={modelScenarioTestOpen} onCancel={() => onModelScenarioTestOpenChange(false)} footer={null} title={null}>
        <div className="flex max-h-[90vh] max-w-2xl flex-col overflow-hidden">
          <div className="pr-10">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{l("翻译场景测试", "Translation Scenario Test")}</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {l(
                "填写测试文本后点击运行，输出会在右侧面板实时展示。",
                "Run a test and inspect streaming output in the right-side panel.",
              )}
            </p>
          </div>
          <div className="mt-3 flex-1 space-y-3 overflow-y-auto pr-1">
            <div>
              <div className="grid gap-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-200">{l("测试原文", "Source Text")}</label>
              <TextArea
                value={modelTestSourceText}
                onChange={(value) => onModelTestSourceTextChange(value)}
                rows={6}
                placeholder={l("输入测试原文", "Input source text")}
              />
              </div>
            </div>
            <TranslatableTextViewer
              isZh={isZh}
              sourceText={modelTestSourceText}
              translatedText={modelTestResult?.ok ? modelTestResult.text : ""}
              targetLanguage={translationTargetLanguage}
              targetLanguageOptions={translationTargetLanguageOptions}
              translating={modelTestRunning}
              onTargetLanguageChange={onTranslationTargetLanguageChange}
              onTranslate={onRunModelTranslationTest}
            />
            {resultFeedback}
          </div>
          <div className="shrink-0 border-t border-slate-200 pt-3 dark:border-slate-800">
            <Button type="tertiary" onClick={onOpenModelTestOutputSheet}>
              {l("查看运行输出", "View Runtime Output")}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
