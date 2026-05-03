import { Button, Modal } from "@douyinfe/semi-ui-19";
import { Input } from "@douyinfe/semi-ui-19";
import { Save } from "lucide-react";

import { TranslatableTextViewer } from "../../common/components/TranslatableTextViewer";

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
    <Modal visible={open} onCancel={() => onOpenChange(false)} footer={null} title={null}>
      <div className="flex max-h-[90vh] max-w-5xl flex-col overflow-hidden">
        <div>
          <h2>{creatingAgentAsset ? l("创建规则文件", "Create Rule File") : l("规则编辑/预览", "Rule Edit/Preview")}</h2>
          <p>
            {creatingAgentAsset
              ? l("新建规则文件", "Create a new rule file")
              : selectedAgentAsset
                ? `${selectedAgentAsset.name} · v${selectedAgentAsset.latestVersion ?? "-"}`
                : l("请选择规则文件", "Please select a rule file")}
          </p>
        </div>
        <div className="flex-1 space-y-3 overflow-auto pr-1 text-sm">
          <div>
            <div>
              <label>{l("规则文件名称", "Rule File Name")}</label>
              <Input
                value={agentAssetNameInput}
                onChange={(value) => setAgentAssetNameInput(value)}
                placeholder={l("例如：团队规范A", "e.g. Team Policy A")}
              />
            </div>
          </div>
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
            onTranslate={async () => {
              const result = await handleRunModelTranslationTest({
                sourceText: agentEditorContent,
                targetLanguage: translationTargetLanguage,
                syncModelTestForm: false,
              });
              if (!result) {
                return;
              }
              setAgentRuleTranslatedText(result.translatedText);
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
        <div>
          <Button onClick={() => onOpenChange(false)}>
            {l("关闭", "Close")}
          </Button>
          <Button
            onClick={() => setAgentDistributionModalOpen(true)}
            disabled={creatingAgentAsset}
          >
            {l("应用", "Apply")}
          </Button>
          <Button onClick={() => void handleSaveAgentRuleVersion()}>
            <Save className="mr-1 h-4 w-4" />
            {creatingAgentAsset ? l("创建规则文件", "Create Rule File") : l("保存并生成新版本", "Save and Create New Version")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
