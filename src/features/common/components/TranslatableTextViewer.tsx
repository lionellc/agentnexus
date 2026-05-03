import { Button, Select } from "@douyinfe/semi-ui-19";
import { useEffect, useRef, useState } from "react";
import { Columns2, Eye, FileText, Languages, Pencil, X } from "lucide-react";
import { cn } from "../../../shared/lib/cn";
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
  className,
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
  className?: string;
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
  const [translationPanelOpen, setTranslationPanelOpen] = useState(false);
  const [translatedByTarget, setTranslatedByTarget] = useState<Record<string, string>>(() => {
    const initialText = translatedText?.trim() ?? "";
    if (!currentTargetLanguageKey || !initialText) {
      return {};
    }
    return { [currentTargetLanguageKey]: translatedText ?? "" };
  });
  const [translatingTargetLanguageKey, setTranslatingTargetLanguageKey] = useState<string | null>(null);
  const [translateSubmitting, setTranslateSubmitting] = useState(false);
  const [sourcePreviewHeight, setSourcePreviewHeight] = useState<number>(560);
  const currentTargetLanguageRef = useRef(currentTargetLanguageKey);
  const translationPanelRef = useRef<HTMLDivElement | null>(null);
  const sourcePreviewContainerRef = useRef<HTMLDivElement | null>(null);
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
  const sourcePreviewFixedHeight = sourcePreviewHeight > 0 ? sourcePreviewHeight : 420;
  const sourcePreviewMaxHeight = sourcePreviewFixedHeight;
  const sourcePreviewMinHeight = sourcePreviewFixedHeight;

  useEffect(() => {
    setSourceViewMode(effectiveDefaultSourceViewMode);
  }, [effectiveDefaultSourceViewMode, sourceViewModeResetKey]);

  useEffect(() => {
    if (!hasCurrentTargetTranslatedText) {
      setShowTranslatedPreview(false);
    }
  }, [hasCurrentTargetTranslatedText]);

  useEffect(() => {
    if (!translationPanelOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (translationPanelRef.current?.contains(target)) {
        return;
      }
      setTranslationPanelOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setTranslationPanelOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [translationPanelOpen]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const updateSourcePreviewHeight = () => {
      const container = sourcePreviewContainerRef.current;
      if (!container) {
        return;
      }
      const nextHeight = Math.floor(container.clientHeight);
      if (nextHeight <= 0) {
        return;
      }
      setSourcePreviewHeight((prev) => (Math.abs(prev - nextHeight) <= 2 ? prev : nextHeight));
    };

    const rafId = window.requestAnimationFrame(updateSourcePreviewHeight);
    window.addEventListener("resize", updateSourcePreviewHeight);

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => {
        updateSourcePreviewHeight();
      });
      if (sourcePreviewContainerRef.current) {
        observer.observe(sourcePreviewContainerRef.current);
      }
    }

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener("resize", updateSourcePreviewHeight);
      observer?.disconnect();
    };
  }, [sourceViewMode, translationPanelOpen, sourceViewModeResetKey]);

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
    <div className={cn("flex h-full min-h-0 flex-col rounded-md border border-slate-200 bg-white p-3", className)}>
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs font-medium text-slate-500">
          {isZh ? "文本展示" : "Text Viewer"}
        </div>
        <div className="relative" ref={translationPanelRef}>
          <Button
            htmlType="button"
            className="h-7 w-7"
            title={isZh ? "翻译工具" : "Translation Tools"}
            aria-label={isZh ? "翻译工具" : "Translation Tools"}
            onClick={() => setTranslationPanelOpen((prev) => !prev)}
          >
            <Languages className="h-4 w-4" />
          </Button>
          {translationPanelOpen ? (
            <div className="absolute right-0 top-full z-20 mt-2 w-[280px] rounded-lg border border-slate-200 bg-white p-3 shadow-xl">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-[11px] font-medium text-slate-500">
                  {isZh ? "翻译功能" : "Translation"}
                </div>
                <Button
                  htmlType="button"
                  className="h-6 w-6"
                  aria-label={isZh ? "关闭翻译工具" : "Close translation tools"}
                  onClick={() => setTranslationPanelOpen(false)}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="space-y-2">
                <Select
                  className="h-8 w-full rounded-lg px-2 pr-7 text-xs"
                  value={targetLanguage}
                  onChange={(value) => onTargetLanguageChange(String(value ?? ""))}
                  optionList={targetLanguageOptions}
                />
                <div className="flex items-center gap-2">
                  <Button
                    htmlType="button"
                    className="flex-1"
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
                    htmlType="button"
                    className="flex-1"
                    disabled={!hasCurrentTargetTranslatedText}
                    onClick={() => setShowTranslatedPreview((prev) => !prev)}
                  >
                    {showTranslatedPreview && hasCurrentTargetTranslatedText
                      ? (isZh ? "隐藏译文" : "Hide Translation")
                      : (isZh ? "显示译文" : "Show Translation")}
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
      <div className="mt-2 flex min-h-0 flex-1 flex-col space-y-1">
        <div className="text-[11px] font-medium text-slate-500">
          {previewTitle}
        </div>
        <div className="relative min-h-0 flex-1" ref={sourcePreviewContainerRef}>
          <div className="absolute right-0 top-0 z-10 inline-flex items-center gap-1 rounded-bl-md rounded-tr-md border border-slate-200 bg-white/90 p-1 shadow-sm backdrop-blur opacity-60 transition-opacity hover:opacity-100 focus-within:opacity-100 dark:border-slate-700 dark:bg-slate-900/85 dark:shadow-black/50">
              <Button
                htmlType="button"
                className="h-7 w-7"
                title={isZh ? "查看" : "View"}
                aria-label={isZh ? "查看" : "View"}
                onClick={() => setSourceViewMode("view")}
              >
                <FileText className="h-4 w-4" />
                <span className="sr-only">{isZh ? "查看" : "View"}</span>
              </Button>
              <Button
                htmlType="button"
                className="h-7 w-7"
                title={isZh ? "预览" : "Preview"}
                aria-label={isZh ? "预览" : "Preview"}
                onClick={() => setSourceViewMode("preview")}
              >
                <Eye className="h-4 w-4" />
                <span className="sr-only">{isZh ? "预览" : "Preview"}</span>
              </Button>
              <Button
                htmlType="button"
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
                  htmlType="button"
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
          <div className="min-h-0 flex-1">
            {sourceEditable && sourceViewMode === "edit" ? (
              <MarkdownEditor
                value={sourceText}
                onChange={(value) => onSourceTextChange?.(value)}
                minHeight={sourcePreviewMinHeight}
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
                minHeight={sourcePreviewMinHeight}
                maxHeight={sourcePreviewMaxHeight}
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
                    minHeight={sourcePreviewMinHeight}
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
                  <pre
                    className="box-border overflow-auto whitespace-pre-wrap break-words rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700"
                    style={{ minHeight: sourcePreviewMinHeight, maxHeight: sourcePreviewMaxHeight }}
                  >
                    {previewContent || "-"}
                  </pre>
                )}
                <MarkdownPreview
                  content={previewContent}
                  minHeight={sourcePreviewMinHeight}
                  maxHeight={sourcePreviewMaxHeight}
                  language={isZh ? "zh" : "en"}
                  emptyText={
                    showTranslatedPreview && hasCurrentTargetTranslatedText
                      ? (isZh ? "暂无译文内容" : "No translated text")
                      : (isZh ? "暂无原文内容" : "No source text")
                  }
                />
              </div>
            ) : (
              <pre
                className="box-border overflow-auto whitespace-pre-wrap break-words rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700"
                style={{ minHeight: sourcePreviewMinHeight, maxHeight: sourcePreviewMaxHeight }}
              >
                {previewContent || "-"}
              </pre>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
