import { Button, Card } from "@douyinfe/semi-ui-19";
import { Input } from "@douyinfe/semi-ui-19";
import { RefreshCw } from "lucide-react";

export type PromptTranslationItem = {
  id: string;
  targetLanguage: string;
  variantNo: number;
  variantLabel: string;
  translatedText: string;
  updatedAt: string;
  applyMode: "immersive" | "overwrite";
};

export function PromptTranslationPanel({
  isZh,
  loading,
  targetLanguage,
  onTargetLanguageChange,
  runLoading,
  applyMode: _applyMode,
  onApplyModeChange,
  onRunTranslation,
  onRefresh,
  translations,
  selectedTranslationId,
  onSelectTranslation,
  onRetranslate,
  onApplyOverwrite,
  onApplyImmersive,
  immersivePreview,
}: {
  isZh: boolean;
  loading: boolean;
  targetLanguage: string;
  onTargetLanguageChange: (value: string) => void;
  runLoading: boolean;
  applyMode: "immersive" | "overwrite";
  onApplyModeChange: (mode: "immersive" | "overwrite") => void;
  onRunTranslation: () => void;
  onRefresh: () => void;
  translations: PromptTranslationItem[];
  selectedTranslationId: string | null;
  onSelectTranslation: (id: string) => void;
  onRetranslate: () => void;
  onApplyOverwrite: () => void;
  onApplyImmersive: () => void;
  immersivePreview: string | null;
}) {
  const selected = translations.find((item) => item.id === selectedTranslationId) ?? null;

  return (
    <Card>
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3>{isZh ? "翻译侧栏" : "Translation"}</h3>
          <Button onClick={onRefresh} disabled={loading}>
            <RefreshCw className={`mr-1 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            {isZh ? "刷新" : "Refresh"}
          </Button>
        </div>
      </div>
      <div className="space-y-3 text-sm">
        <label className="block text-xs text-slate-500">
          {isZh ? "目标语言" : "Target Language"}
          <Input
            value={targetLanguage}
            onChange={(value) => onTargetLanguageChange(value)}
            placeholder={isZh ? "例如：英文 / 日文" : "e.g. English / Japanese"}
          />
        </label>

        <label className="block text-xs text-slate-500">
          {isZh ? "应用模式" : "Apply Mode"}
          <div className="mt-1 grid grid-cols-2 gap-2">
            <Button
              onClick={() => onApplyModeChange("immersive")}
            >
              {isZh ? "沉浸式" : "Immersive"}
            </Button>
            <Button
              onClick={() => onApplyModeChange("overwrite")}
            >
              {isZh ? "覆盖原文" : "Overwrite"}
            </Button>
          </div>
        </label>

        <Button className="w-full" onClick={onRunTranslation} disabled={runLoading || !targetLanguage.trim()}>
          {runLoading ? (isZh ? "翻译中..." : "Translating...") : (isZh ? "开始翻译" : "Translate")}
        </Button>

        <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-2">
          <div className="text-xs font-medium text-slate-500">{isZh ? "当前版本译文" : "Translations"}</div>
          {translations.length === 0 ? (
            <div className="text-xs text-slate-500">{isZh ? "暂无译文" : "No translations yet"}</div>
          ) : (
            <div className="max-h-48 space-y-2 overflow-auto pr-1">
              {translations.map((item) => {
                const active = item.id === selectedTranslationId;
                return (
                  <Button
                    key={item.id}
                    htmlType="button"
                    className={`h-auto w-full justify-start px-2 py-2 text-left text-xs ${
                      active
                        ? "border-blue-300 bg-blue-50 text-blue-700"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                    onClick={() => onSelectTranslation(item.id)}
                  >
                    <div className="font-medium">{item.variantLabel}</div>
                    <div className="mt-1 text-[11px] text-slate-500">{item.updatedAt}</div>
                  </Button>
                );
              })}
            </div>
          )}
        </div>

        {selected ? (
          <div className="space-y-2">
            <div className="rounded-md border border-slate-200 bg-white p-2 text-xs text-slate-700">
              <div className="mb-1 font-medium text-slate-500">{isZh ? "译文内容" : "Translated Text"}</div>
              <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words">{selected.translatedText}</pre>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button onClick={onRetranslate}>
                {isZh ? "重翻译" : "Retranslate"}
              </Button>
              <Button onClick={onApplyOverwrite}>
                {isZh ? "应用为原文" : "Use as Source"}
              </Button>
            </div>
            <Button className="w-full" onClick={onApplyImmersive}>
              {isZh ? "沉浸式预览" : "Immersive Preview"}
            </Button>
          </div>
        ) : null}

        {immersivePreview ? (
          <div className="rounded-md border border-dashed border-blue-300 bg-blue-50 p-2 text-xs text-slate-700">
            <div className="mb-1 font-medium text-blue-700">{isZh ? "沉浸式双语" : "Immersive Bilingual"}</div>
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words">{immersivePreview}</pre>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
