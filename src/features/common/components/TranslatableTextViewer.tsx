import { useEffect, useRef, useState } from "react";
import { Columns2, Eye, FileText, Pencil } from "lucide-react";

import { Button, Select } from "../../../shared/ui";
import { MarkdownEditor, MarkdownPreview } from "./MarkdownEditor";

type SourceViewMode = "view" | "preview" | "split-preview" | "edit";

function normalizeTargetLanguageKey(value: string): string {
  return value.trim().toLowerCase();
}

export function TranslatableTextViewer({
  isZh,
  sourceText,
  translatedText,
  targetLanguage,
  targetLanguageOptions,
  translating,
  onTargetLanguageChange,
  onTranslate,
  onSourceTextChange,
  sourceEditPlaceholder,
  defaultSourceViewMode,
  sourceViewModeResetKey,
}: {
  isZh: boolean;
  sourceText: string;
  translatedText?: string;
  targetLanguage: string;
  targetLanguageOptions: Array<{ value: string; label: string }>;
  translating: boolean;
  onTargetLanguageChange: (value: string) => void;
  onTranslate: () => void | Promise<void>;
  onSourceTextChange?: (value: string) => void;
  sourceEditPlaceholder?: string;
  defaultSourceViewMode?: SourceViewMode;
  sourceViewModeResetKey?: string;
}) {
  const sourceEditable = Boolean(onSourceTextChange);
  const defaultMode = defaultSourceViewMode ?? (sourceEditable ? "edit" : "view");
  const effectiveDefaultSourceViewMode: SourceViewMode =
    sourceEditable
      ? defaultMode
      : (defaultMode === "edit" ? "view" : defaultMode);
  const currentTargetLanguageKey = normalizeTargetLanguageKey(targetLanguage);
  const [sourceViewMode, setSourceViewMode] = useState<SourceViewMode>(effectiveDefaultSourceViewMode);
  const [showTranslatedPreview, setShowTranslatedPreview] = useState(false);
  const [translatedByTarget, setTranslatedByTarget] = useState<Record<string, string>>(() => {
    const initialText = translatedText?.trim() ?? "";
    if (!currentTargetLanguageKey || !initialText) {
      return {};
    }
    return { [currentTargetLanguageKey]: translatedText ?? "" };
  });
  const [translatingTargetLanguageKey, setTranslatingTargetLanguageKey] = useState<string | null>(null);
  const [translateSubmitting, setTranslateSubmitting] = useState(false);
  const currentTargetLanguageRef = useRef(currentTargetLanguageKey);
  const currentTranslatedText = translatedByTarget[currentTargetLanguageKey] ?? "";
  const hasCurrentTargetTranslatedText = Boolean(currentTranslatedText.trim());
  const currentTargetTranslating = Boolean(
    translatingTargetLanguageKey
      && translatingTargetLanguageKey === currentTargetLanguageKey
      && (translating || translateSubmitting),
  );
  const previewContent = showTranslatedPreview && hasCurrentTargetTranslatedText
    ? currentTranslatedText
    : sourceText;
  const previewTitle = showTranslatedPreview && hasCurrentTargetTranslatedText
    ? (isZh ? "译文" : "Translated")
    : (isZh ? "原文" : "Source");

  useEffect(() => {
    setSourceViewMode(effectiveDefaultSourceViewMode);
  }, [effectiveDefaultSourceViewMode, sourceViewModeResetKey]);

  useEffect(() => {
    if (!hasCurrentTargetTranslatedText) {
      setShowTranslatedPreview(false);
    }
  }, [hasCurrentTargetTranslatedText]);

  useEffect(() => {
    setShowTranslatedPreview(false);
    setTranslatingTargetLanguageKey(null);
    setTranslateSubmitting(false);
    if (!currentTargetLanguageKey || !translatedText?.trim()) {
      setTranslatedByTarget({});
      return;
    }
    setTranslatedByTarget({
      [currentTargetLanguageKey]: translatedText,
    });
  }, [sourceViewModeResetKey]);

  useEffect(() => {
    currentTargetLanguageRef.current = currentTargetLanguageKey;
  }, [currentTargetLanguageKey]);

  useEffect(() => {
    const key = currentTargetLanguageRef.current;
    if (!key) {
      return;
    }
    const nextText = translatedText?.trim() ?? "";
    setTranslatedByTarget((prev) => {
      if (!nextText) {
        if (!(key in prev)) {
          return prev;
        }
        const next = { ...prev };
        delete next[key];
        return next;
      }
      if (prev[key] === translatedText) {
        return prev;
      }
      return {
        ...prev,
        [key]: translatedText ?? "",
      };
    });
  }, [translatedText]);

  useEffect(() => {
    if (!translating && !translateSubmitting) {
      setTranslatingTargetLanguageKey(null);
    }
  }, [translating, translateSubmitting]);

  async function handleTranslateClick() {
    if (hasCurrentTargetTranslatedText) {
      const confirmed = window.confirm(
        isZh
          ? "当前目标语言已有译文，是否重新翻译？"
          : "A translation already exists for this target language. Retranslate?",
      );
      if (!confirmed) {
        return;
      }
    }

    setTranslatingTargetLanguageKey(currentTargetLanguageKey || null);
    setTranslateSubmitting(true);
    try {
      await Promise.resolve(onTranslate());
    } finally {
      setTranslateSubmitting(false);
      if (!translating) {
        setTranslatingTargetLanguageKey(null);
      }
    }
  }

  return (
    <div className="space-y-2 rounded-md border border-slate-200 bg-white p-3">
      <div className="text-xs font-medium text-slate-500">
        {isZh ? "文本展示" : "Text Viewer"}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 bg-slate-50 px-2 py-2">
        <div className="text-[11px] font-medium text-slate-500">
          {isZh ? "翻译功能" : "Translation"}
        </div>
        <div className="flex items-center gap-2 whitespace-nowrap">
          <Select
            className="w-28 shrink-0"
            buttonClassName="h-8 rounded-lg px-2 pr-7 text-xs"
            value={targetLanguage}
            onChange={onTargetLanguageChange}
            options={targetLanguageOptions}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={currentTargetTranslating || !sourceText.trim()}
            onClick={() => {
              void handleTranslateClick();
            }}
          >
            {currentTargetTranslating
              ? (isZh ? "翻译中..." : "Translating...")
              : (isZh ? "翻译" : "Translate")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={showTranslatedPreview && hasCurrentTargetTranslatedText ? "default" : "outline"}
            disabled={!hasCurrentTargetTranslatedText}
            onClick={() => setShowTranslatedPreview((prev) => !prev)}
          >
            {showTranslatedPreview && hasCurrentTargetTranslatedText
              ? (isZh ? "隐藏译文" : "Hide Translation")
              : (isZh ? "显示译文" : "Show Translation")}
          </Button>
        </div>
      </div>
      <div className="space-y-1">
        <div className="text-[11px] font-medium text-slate-500">
          {previewTitle}
        </div>
        <div className="relative">
          <div className="absolute right-0 top-0 z-10 inline-flex items-center gap-1 rounded-bl-md rounded-tr-md border border-slate-200 bg-white/90 p-1 shadow-sm backdrop-blur opacity-60 transition-opacity hover:opacity-100 focus-within:opacity-100 dark:border-slate-700 dark:bg-slate-900/85 dark:shadow-black/50">
              <Button
                type="button"
                size="icon"
                variant={sourceViewMode === "view" ? "default" : "ghost"}
                className="h-7 w-7"
                title={isZh ? "查看" : "View"}
                aria-label={isZh ? "查看" : "View"}
                onClick={() => setSourceViewMode("view")}
              >
                <FileText className="h-4 w-4" />
                <span className="sr-only">{isZh ? "查看" : "View"}</span>
              </Button>
              <Button
                type="button"
                size="icon"
                variant={sourceViewMode === "preview" ? "default" : "ghost"}
                className="h-7 w-7"
                title={isZh ? "预览" : "Preview"}
                aria-label={isZh ? "预览" : "Preview"}
                onClick={() => setSourceViewMode("preview")}
              >
                <Eye className="h-4 w-4" />
                <span className="sr-only">{isZh ? "预览" : "Preview"}</span>
              </Button>
              <Button
                type="button"
                size="icon"
                variant={sourceViewMode === "split-preview" ? "default" : "ghost"}
                className="h-7 w-7"
                title={isZh ? "分栏预览" : "Split Preview"}
                aria-label={isZh ? "分栏预览" : "Split Preview"}
                onClick={() => setSourceViewMode("split-preview")}
              >
                <Columns2 className="h-4 w-4" />
                <span className="sr-only">{isZh ? "分栏预览" : "Split Preview"}</span>
              </Button>
              {sourceEditable ? (
                <Button
                  type="button"
                  size="icon"
                  variant={sourceViewMode === "edit" ? "default" : "ghost"}
                  className="h-7 w-7"
                  title={isZh ? "编辑" : "Edit"}
                  aria-label={isZh ? "编辑" : "Edit"}
                  onClick={() => setSourceViewMode("edit")}
                >
                  <Pencil className="h-4 w-4" />
                  <span className="sr-only">{isZh ? "编辑" : "Edit"}</span>
                </Button>
              ) : null}
          </div>
          <div>
            {sourceEditable && sourceViewMode === "edit" ? (
              <MarkdownEditor
                value={sourceText}
                onChange={(value) => onSourceTextChange?.(value)}
                minHeight={320}
                placeholder={sourceEditPlaceholder ?? (isZh ? "请输入原文内容..." : "Input source text...")}
                language={isZh ? "zh" : "en"}
                modeLabels={{
                  edit: isZh ? "编辑" : "Edit",
                  preview: isZh ? "预览" : "Preview",
                  split: isZh ? "分栏" : "Split",
                }}
                mode="edit"
                onModeChange={() => {
                  // 固定在编辑模式，避免和外层查看模式冲突
                }}
                hideModeSwitcher
              />
            ) : sourceViewMode === "preview" ? (
              <MarkdownPreview
                content={previewContent}
                minHeight={320}
                maxHeight={420}
                language={isZh ? "zh" : "en"}
                emptyText={
                  showTranslatedPreview && hasCurrentTargetTranslatedText
                    ? (isZh ? "暂无译文内容" : "No translated text")
                    : (isZh ? "暂无原文内容" : "No source text")
                }
              />
            ) : sourceViewMode === "split-preview" ? (
              <div className="grid gap-3 lg:grid-cols-2">
                {sourceEditable ? (
                  <MarkdownEditor
                    value={sourceText}
                    onChange={(value) => onSourceTextChange?.(value)}
                    minHeight={320}
                    placeholder={sourceEditPlaceholder ?? (isZh ? "请输入原文内容..." : "Input source text...")}
                    language={isZh ? "zh" : "en"}
                    modeLabels={{
                      edit: isZh ? "编辑" : "Edit",
                      preview: isZh ? "预览" : "Preview",
                      split: isZh ? "分栏" : "Split",
                    }}
                    mode="edit"
                    onModeChange={() => {
                      // 固定在编辑模式，避免和外层查看模式冲突
                    }}
                    hideModeSwitcher
                  />
                ) : (
                  <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap break-words rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
                    {previewContent || "-"}
                  </pre>
                )}
                <MarkdownPreview
                  content={previewContent}
                  minHeight={320}
                  maxHeight={420}
                  language={isZh ? "zh" : "en"}
                  emptyText={
                    showTranslatedPreview && hasCurrentTargetTranslatedText
                      ? (isZh ? "暂无译文内容" : "No translated text")
                      : (isZh ? "暂无原文内容" : "No source text")
                  }
                />
              </div>
            ) : (
              <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
                {previewContent || "-"}
              </pre>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
