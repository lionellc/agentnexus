import { Save } from "lucide-react";

import { TranslatableTextViewer } from "../../common/components/TranslatableTextViewer";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "../../../shared/ui";

type AgentAssetSummary = {
  name: string;
  latestVersion?: number | string | null;
  updatedAt?: string | null;
};

export type AgentRuleEditorDialogProps = {
  l: (zh: string, en: string) => string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  creatingAgentAsset: boolean;
  selectedAgentAsset: AgentAssetSummary | null;
  agentAssetNameInput: string;
  setAgentAssetNameInput: (value: string) => void;
  toLocalTime: (value: string | null | undefined) => string;
  isZh: boolean;
  agentEditorContent: string;
  setAgentEditorContent: (value: string) => void;
  agentRuleTranslatedText: string;
  setAgentRuleTranslatedText: (value: string) => void;
  translationTargetLanguage: string;
  translationTargetLanguageOptions: Array<{ value: string; label: string }>;
  modelTestRunning: boolean;
  setTranslationTargetLanguage: (value: string) => void;
  handleRunModelTranslationTest: (input: {
    sourceText: string;
    targetLanguage: string;
    syncModelTestForm: boolean;
  }) => Promise<{ translatedText: string } | null>;
  selectedAssetId: string | null;
  setAgentDistributionModalOpen: (open: boolean) => void;
  handleSaveAgentRuleVersion: () => Promise<void> | void;
};

export function AgentRuleEditorDialog({
  l,
  open,
  onOpenChange,
  creatingAgentAsset,
  selectedAgentAsset,
  agentAssetNameInput,
  setAgentAssetNameInput,
  toLocalTime,
  isZh,
  agentEditorContent,
  setAgentEditorContent,
  agentRuleTranslatedText,
  setAgentRuleTranslatedText,
  translationTargetLanguage,
  translationTargetLanguageOptions,
  modelTestRunning,
  setTranslationTargetLanguage,
  handleRunModelTranslationTest,
  selectedAssetId,
  setAgentDistributionModalOpen,
  handleSaveAgentRuleVersion,
}: AgentRuleEditorDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-5xl flex-col overflow-hidden" overlayClassName="agent-rule-editor-overlay">
        <DialogHeader>
          <DialogTitle>{creatingAgentAsset ? l("创建规则文件", "Create Rule File") : l("规则编辑/预览", "Rule Edit/Preview")}</DialogTitle>
          <DialogDescription>
            {creatingAgentAsset
              ? l("新建规则文件", "Create a new rule file")
              : selectedAgentAsset
                ? `${selectedAgentAsset.name} · v${selectedAgentAsset.latestVersion ?? "-"}`
                : l("请选择规则文件", "Please select a rule file")}
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 space-y-3 overflow-auto pr-1 text-sm">
          <label className="block text-xs text-slate-500">
            {l("规则文件名称", "Rule File Name")}
            <Input
              value={agentAssetNameInput}
              onChange={(event) => setAgentAssetNameInput(event.currentTarget.value)}
              placeholder={l("例如：团队规范A", "e.g. Team Policy A")}
            />
          </label>
          {!creatingAgentAsset ? (
            <div className="text-xs text-slate-500">
              {l("最后更新时间", "Last Updated")}: {toLocalTime(selectedAgentAsset?.updatedAt)}
            </div>
          ) : null}

          <TranslatableTextViewer
            isZh={isZh}
            sourceText={agentEditorContent}
            translatedText={agentRuleTranslatedText}
            targetLanguage={translationTargetLanguage}
            targetLanguageOptions={translationTargetLanguageOptions}
            translating={modelTestRunning}
            onTargetLanguageChange={setTranslationTargetLanguage}
            onTranslate={() => {
              void (async () => {
                const result = await handleRunModelTranslationTest({
                  sourceText: agentEditorContent,
                  targetLanguage: translationTargetLanguage,
                  syncModelTestForm: false,
                });
                if (!result) {
                  return;
                }
                setAgentRuleTranslatedText(result.translatedText);
              })();
            }}
            onSourceTextChange={(value) => {
              setAgentEditorContent(value);
              if (agentRuleTranslatedText) {
                setAgentRuleTranslatedText("");
              }
            }}
            sourceEditPlaceholder={l("使用 Markdown 编写全局规则...", "Write global rules in Markdown...")}
            defaultSourceViewMode="edit"
            sourceViewModeResetKey={selectedAssetId ?? (creatingAgentAsset ? "new" : "")}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {l("关闭", "Close")}
          </Button>
          <Button
            variant="outline"
            onClick={() => setAgentDistributionModalOpen(true)}
            disabled={creatingAgentAsset}
          >
            {l("应用", "Apply")}
          </Button>
          <Button onClick={() => void handleSaveAgentRuleVersion()}>
            <Save className="mr-1 h-4 w-4" />
            {creatingAgentAsset ? l("创建规则文件", "Create Rule File") : l("保存并生成新版本", "Save and Create New Version")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

