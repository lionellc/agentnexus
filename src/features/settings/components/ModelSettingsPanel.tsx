import { type ReactNode } from "react";

import { ModelWorkbenchPanel, type LocalAgentProfileItem, type ModelProfileSourceType } from "./ModelWorkbenchPanel";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FormField,
  FormFieldset,
  FormLabel,
  Select,
  Textarea,
} from "../../../shared/ui";
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

      <Dialog open={modelScenarioSettingsOpen} onOpenChange={onModelScenarioSettingsOpenChange}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{l("翻译场景设置", "Translation Scenario Settings")}</DialogTitle>
            <DialogDescription>
              {l(
                "配置翻译场景的默认 Agent 和 Prompt 模板。",
                "Configure default agent and prompt template for translation scenario.",
              )}
            </DialogDescription>
          </DialogHeader>
          <FormFieldset>
            <FormField>
              <FormLabel>{l("Agent", "Agent")}</FormLabel>
              <Select
                value={translationDefaultProfileKey}
                onChange={onTranslationDefaultProfileKeyChange}
                options={allDefaultAgentOptions}
                placeholder={l("请选择 Agent", "Select agent")}
              />
            </FormField>
            <FormField>
              <FormLabel>{l("模板配置", "Prompt Template")}</FormLabel>
              <Textarea
                value={translationPromptTemplate}
                onChange={(event) => onTranslationPromptTemplateChange(event.currentTarget.value)}
                rows={12}
              />
            </FormField>
          </FormFieldset>
          <DialogFooter>
            <Button variant="outline" onClick={onRestoreDefaultTranslationConfig}>
              {l("恢复默认配置", "Restore Defaults")}
            </Button>
            <Button onClick={onSaveTranslationConfigFromDialog} disabled={modelLoading}>
              {l("保存模板配置", "Save Template Config")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={modelScenarioTestOpen} onOpenChange={onModelScenarioTestOpenChange}>
        <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>{l("翻译场景测试", "Translation Scenario Test")}</DialogTitle>
            <DialogDescription>
              {l(
                "填写测试文本后点击运行，输出会在右侧面板实时展示。",
                "Run a test and inspect streaming output in the right-side panel.",
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-3 flex-1 space-y-3 overflow-y-auto pr-1">
            <FormFieldset>
              <FormField>
                <FormLabel>{l("测试原文", "Source Text")}</FormLabel>
              <Textarea
                value={modelTestSourceText}
                onChange={(event) => onModelTestSourceTextChange(event.currentTarget.value)}
                rows={6}
                placeholder={l("输入测试原文", "Input source text")}
              />
              </FormField>
            </FormFieldset>
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
          <DialogFooter className="shrink-0">
            <Button variant="outline" onClick={onOpenModelTestOutputSheet}>
              {l("查看运行输出", "View Runtime Output")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
