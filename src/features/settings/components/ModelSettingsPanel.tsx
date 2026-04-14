import { type ReactNode } from "react";

import { ModelWorkbenchPanel, type LocalAgentProfileItem } from "./ModelWorkbenchPanel";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
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
  newModelProfileKey: string;
  onNewModelProfileKeyChange: (value: string) => void;
  onAddModelProfile: () => void;
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
  newModelProfileKey,
  onNewModelProfileKeyChange,
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
      <Card>
        <CardHeader>
          <CardTitle>{l("场景默认模型", "Scenario Defaults")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-slate-600">
          <div>
            {l(
              "当前仅启用“翻译 / 双语处理”场景。选择默认 Profile 后，Prompt 翻译会按该设置执行。",
              "Only the \"Translation / Bilingual\" scenario is enabled in V1. Prompt translation uses the selected default profile.",
            )}
          </div>
        </CardContent>
      </Card>

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
        newProfileKey={newModelProfileKey}
        onNewProfileKeyChange={onNewModelProfileKeyChange}
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
                "配置翻译场景的默认 Profile 和 Prompt 模板。",
                "Configure default profile and prompt template for translation scenario.",
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label className="block text-xs text-slate-500">
              {l("默认 Profile", "Default Profile")}
              <Input
                value={translationDefaultProfileKey}
                onChange={(event) => onTranslationDefaultProfileKeyChange(event.currentTarget.value)}
              />
            </label>
            <label className="block text-xs text-slate-500">
              {l("模板配置", "Prompt Template")}
              <Textarea
                value={translationPromptTemplate}
                onChange={(event) => onTranslationPromptTemplateChange(event.currentTarget.value)}
                rows={12}
              />
            </label>
          </div>
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
            <label className="block text-xs text-slate-500">
              {l("测试原文", "Source Text")}
              <Textarea
                value={modelTestSourceText}
                onChange={(event) => onModelTestSourceTextChange(event.currentTarget.value)}
                rows={6}
                placeholder={l("输入测试原文", "Input source text")}
              />
            </label>
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
