import { Button, Input } from "@douyinfe/semi-ui-19";
import { ArrowLeft, ChevronRight, Copy, History, Save } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";

import { EmptyState } from "../../common/components/EmptyState";
import { SectionTitle } from "../../common/components/SectionTitle";
import { TranslatableTextViewer } from "../../common/components/TranslatableTextViewer";
import type { PromptAsset, PromptTranslationDto } from "../../../shared/types";

type PromptTranslationStage = "idle" | "running" | "reviewing";

type PromptTranslationResult = {
  ok: boolean;
  text: string;
} | null;

type TranslationTargetLanguageOption = {
  value: string;
  label: string;
};

export type PromptDetailProps = {
  selectedPrompt: PromptAsset | null | undefined;
  selectedPromptTranslation: PromptTranslationDto | null;
  detailName: string;
  setDetailName: Dispatch<SetStateAction<string>>;
  detailCategory: string;
  setDetailCategory: Dispatch<SetStateAction<string>>;
  detailTagsInput: string;
  setDetailTagsInput: Dispatch<SetStateAction<string>>;
  detailContent: string;
  setDetailContent: Dispatch<SetStateAction<string>>;
  promptTranslationLoading: boolean;
  promptTranslationRunning: boolean;
  promptTranslationElapsedLabel: string;
  promptTranslationStage: PromptTranslationStage;
  setPromptTranslationStage: Dispatch<SetStateAction<PromptTranslationStage>>;
  promptTranslationResult: PromptTranslationResult;
  setPromptTranslationResult: Dispatch<SetStateAction<PromptTranslationResult>>;
  isZh: boolean;
  translationTargetLanguage: string;
  translationTargetLanguageOptions: TranslationTargetLanguageOption[];
  setTranslationTargetLanguage: Dispatch<SetStateAction<string>>;
  leavePromptDetail: () => void;
  runPromptTranslation: () => Promise<void>;
  handleSavePromptDetail: () => Promise<void>;
  handleCopyPromptFromDetail: () => Promise<void>;
  handleOpenPromptVersion: () => Promise<void>;
  toLocalTime: (value: string | null | undefined) => string;
  l: (zh: string, en: string) => string;
};

export function PromptDetail({
  selectedPrompt,
  selectedPromptTranslation,
  detailName,
  setDetailName,
  detailCategory,
  setDetailCategory,
  detailTagsInput,
  setDetailTagsInput,
  detailContent,
  setDetailContent,
  promptTranslationLoading,
  promptTranslationRunning,
  promptTranslationElapsedLabel,
  promptTranslationStage,
  setPromptTranslationStage,
  promptTranslationResult,
  setPromptTranslationResult,
  isZh,
  translationTargetLanguage,
  translationTargetLanguageOptions,
  setTranslationTargetLanguage,
  leavePromptDetail,
  runPromptTranslation,
  handleSavePromptDetail,
  handleCopyPromptFromDetail,
  handleOpenPromptVersion,
  toLocalTime,
  l,
}: PromptDetailProps) {
  return (
    <div className="space-y-4 pb-3">
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <Button
            onClick={leavePromptDetail}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <button
            type="button"
            className="font-medium text-slate-600 hover:text-slate-950 hover:underline dark:text-slate-300 dark:hover:text-slate-100"
            onClick={leavePromptDetail}
          >
            Prompts
          </button>
          <ChevronRight className="h-4 w-4 text-slate-400" />
          <span className="max-w-[420px] truncate text-slate-700">
            {selectedPrompt?.name ?? l("未选择 Prompt", "No prompt selected")}
          </span>
        </div>

        <SectionTitle
          title={l("Prompt 详情", "Prompt Details")}
          subtitle={selectedPrompt ? l(`最后更新 ${toLocalTime(selectedPrompt.updatedAt)}`, `Updated ${toLocalTime(selectedPrompt.updatedAt)}`) : l("请选择一个 Prompt", "Please select a prompt")}
        />
      </div>

      {!selectedPrompt ? (
        <EmptyState title={l("未选择 Prompt", "No prompt selected")} description={l("请返回列表后选择一个 Prompt。", "Go back and pick a prompt.")} />
      ) : (
        <div className="space-y-3">
          <div className="space-y-4 rounded-md border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/30">
            <label className="grid gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
              <span>{l("标题", "Title")}</span>
              <Input value={detailName} onChange={(value) => setDetailName(value)} />
            </label>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                <span>{l("分类", "Category")}</span>
                <Input value={detailCategory} onChange={(value) => setDetailCategory(value)} />
              </label>

              <label className="grid gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                <span>{l("标签（逗号分隔）", "Tags (comma separated)")}</span>
                <Input value={detailTagsInput} onChange={(value) => setDetailTagsInput(value)} />
              </label>
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                <span>
                  {promptTranslationLoading
                    ? l("译文加载中...", "Loading translations...")
                    : selectedPromptTranslation
                      ? l(
                        `最近译文更新时间：${toLocalTime(selectedPromptTranslation.updatedAt)}`,
                        `Latest translation updated at ${toLocalTime(selectedPromptTranslation.updatedAt)}`,
                      )
                      : l("暂无译文，点击“翻译”生成。", "No translation yet. Click Translate to generate one.")}
                </span>
                {selectedPromptTranslation ? (
                  <span>
                    {selectedPromptTranslation.targetLanguage}
                    {" · "}
                    {selectedPromptTranslation.variantLabel}
                  </span>
                ) : null}
              </div>
              {promptTranslationRunning ? (
                <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300">
                  {l(
                    `正在翻译 · 已运行 ${promptTranslationElapsedLabel}`,
                    `Translating · running ${promptTranslationElapsedLabel}`,
                  )}
                </div>
              ) : promptTranslationResult ? (
                <div
                  className={`rounded-md border px-3 py-2 text-xs ${
                    promptTranslationResult.ok
                      ? "border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950/30 dark:text-green-300"
                      : "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300"
                  }`}
                >
                  {promptTranslationResult.text}
                </div>
              ) : promptTranslationStage === "reviewing" ? (
                <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
                  {l(
                    "译文已就绪，可在原文/译文之间切换阅读。",
                    "Translation is ready. Switch between source and translated views for reading.",
                  )}
                </div>
              ) : null}
              <TranslatableTextViewer
                isZh={isZh}
                sourceText={detailContent}
                translatedText={selectedPromptTranslation?.translatedText ?? ""}
                targetLanguage={translationTargetLanguage}
                targetLanguageOptions={translationTargetLanguageOptions}
                translating={promptTranslationRunning}
                onSourceTextChange={setDetailContent}
                sourceEditPlaceholder={l("使用 Markdown 编写 Prompt 内容...", "Write prompt content with Markdown...")}
                defaultSourceViewMode="edit"
                sourceViewModeResetKey={selectedPrompt?.id ?? ""}
                onTargetLanguageChange={(value) => {
                  setTranslationTargetLanguage(value);
                  setPromptTranslationResult(null);
                  if (!promptTranslationRunning) {
                    setPromptTranslationStage("idle");
                  }
                }}
                onTranslate={() => runPromptTranslation()}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button theme="solid" type="primary" onClick={() => void handleSavePromptDetail()}>
                <Save className="mr-1 h-4 w-4" />
                {l("保存", "Save")}
              </Button>
              <Button type="tertiary" onClick={() => void handleCopyPromptFromDetail()}>
                <Copy className="mr-1 h-4 w-4" />
                {l("复制 Prompt", "Copy Prompt")}
              </Button>
              <Button type="tertiary" onClick={() => void handleOpenPromptVersion()}>
                <History className="mr-1 h-4 w-4" />
                {l("历史版本", "History")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
