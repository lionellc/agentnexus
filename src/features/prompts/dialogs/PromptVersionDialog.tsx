import { VersionDiffViewer } from "../../common/components/VersionDiffViewer";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Tag,
} from "../../../shared/ui";

export type PromptVersionListItem = {
  version: number;
  createdAt: string;
};

export type PromptVersionPreviewData = {
  version: number;
  createdAt: string;
  content: string;
};

export type PromptVersionCompareData = {
  before: string;
  after: string;
  leftVersion: number | null;
  rightVersion: number | null;
  leftCreatedAt?: string | null;
  rightCreatedAt?: string | null;
  diffStats: {
    added: number;
    removed: number;
  };
};

export type PromptVersionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isZh: boolean;
  versions: PromptVersionListItem[];
  compareMode: boolean;
  selectedPreviewVersion: number | null;
  selectedCompareLeftVersion: number | null;
  selectedCompareRightVersion: number | null;
  previewData: PromptVersionPreviewData | null;
  compareData: PromptVersionCompareData;
  onSelectPreviewVersion: (version: number) => void;
  onSelectCompareCandidate: (version: number) => void;
  onToggleCompareMode: () => void;
  onRestoreVersion: (version: number) => void;
  onCancel?: () => void;
  restoreDisabled?: boolean;
};

function toLocalTime(value: string | null | undefined): string {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

export function PromptVersionDialog({
  open,
  onOpenChange,
  isZh,
  versions,
  compareMode,
  selectedPreviewVersion,
  selectedCompareLeftVersion,
  selectedCompareRightVersion,
  previewData,
  compareData,
  onSelectPreviewVersion,
  onSelectCompareCandidate,
  onToggleCompareMode,
  onRestoreVersion,
  onCancel,
  restoreDisabled = false,
}: PromptVersionDialogProps) {
  const handleCancel = () => {
    if (onCancel) {
      onCancel();
      return;
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-6xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>{isZh ? "历史版本" : "History Versions"}</DialogTitle>
        </DialogHeader>
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden pt-1 md:grid-cols-[280px_minmax(0,1fr)]">
          <div className="min-h-0 space-y-2 overflow-auto border-r border-slate-200 pr-3">
            <div className="px-1 text-sm text-slate-500">
              {compareMode
                ? (isZh ? "选择对比版本" : "Select versions for comparison")
                : (isZh ? "选择版本" : "Select version")}
            </div>
            {versions.map((item) => {
              const version = item.version;
              const selectedAsSingle = !compareMode && selectedPreviewVersion === version;
              const selectedAsLeft = compareMode && selectedCompareLeftVersion === version;
              const selectedAsRight = compareMode && selectedCompareRightVersion === version;
              const selected = selectedAsSingle || selectedAsLeft || selectedAsRight;
              const colorClass = selectedAsLeft
                ? "border-red-200 bg-red-500 text-white"
                : selectedAsRight
                  ? "border-emerald-200 bg-emerald-500 text-white"
                  : selected
                    ? "border-blue-200 bg-blue-500 text-white"
                    : "border-slate-200 bg-white text-slate-800 hover:border-blue-200 hover:bg-blue-50";
              return (
                <button
                  key={`prompt-version-${version}`}
                  type="button"
                  className={`w-full rounded-xl border px-3 py-3 text-left transition-colors ${colorClass}`}
                  onClick={() => {
                    if (compareMode) {
                      onSelectCompareCandidate(version);
                      return;
                    }
                    onSelectPreviewVersion(version);
                  }}
                >
                  <div className="text-[22px] leading-none">v{version}</div>
                  <div className="mt-1 text-sm opacity-90">{toLocalTime(item.createdAt)}</div>
                </button>
              );
            })}
          </div>
          <div className="min-h-0 space-y-3 overflow-auto pr-1">
            {!compareMode ? (
              <>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs text-slate-500">
                    {previewData
                      ? `v${previewData.version} · ${toLocalTime(previewData.createdAt)}`
                      : (isZh ? "请选择一个版本查看详情。" : "Select a version to view details.")}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-sm font-medium text-slate-600">{isZh ? "内容" : "Content"}</div>
                  <div className="max-h-[56vh] overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <pre className="whitespace-pre-wrap break-words text-sm text-slate-800">
                      {previewData?.content || (isZh ? "暂无版本内容" : "No version content")}
                    </pre>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm">
                      <Tag tone="danger" className="rounded-md px-2 py-1">
                        {compareData.leftVersion !== null
                          ? `v${compareData.leftVersion}`
                          : (isZh ? "未选择" : "N/A")}
                      </Tag>
                      <span className="text-slate-500">→</span>
                      <Tag tone="success" className="rounded-md px-2 py-1">
                        {compareData.rightVersion !== null
                          ? `v${compareData.rightVersion}`
                          : (isZh ? "未选择" : "N/A")}
                      </Tag>
                    </div>
                    <div className="text-sm text-slate-500">
                      {compareData.leftCreatedAt && compareData.rightCreatedAt
                        ? `${toLocalTime(compareData.leftCreatedAt)} → ${toLocalTime(compareData.rightCreatedAt)}`
                        : (isZh ? "请选择两个版本进行对比。" : "Select two versions to compare.")}
                    </div>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-sm font-medium text-slate-600">
                    <span>{isZh ? "内容对比" : "Content Diff"}</span>
                    <span className="text-xs">
                      <span className="text-emerald-600">+ {compareData.diffStats.added}</span>
                      <span className="mx-2 text-red-600">- {compareData.diffStats.removed}</span>
                    </span>
                  </div>
                  <VersionDiffViewer
                    isZh={isZh}
                    before={compareData.before}
                    after={compareData.after}
                    leftTitle={compareData.leftVersion !== null ? `v${compareData.leftVersion}` : undefined}
                    rightTitle={compareData.rightVersion !== null ? `v${compareData.rightVersion}` : undefined}
                  />
                </div>
              </>
            )}
          </div>
        </div>
        <DialogFooter className="mt-2 border-t border-slate-200 pt-3">
          <div className="flex w-full items-center justify-between gap-2">
            <Button variant="outline" onClick={onToggleCompareMode}>
              {compareMode ? (isZh ? "退出对比" : "Exit Compare") : (isZh ? "版本对比" : "Compare Versions")}
            </Button>
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={handleCancel}>
                {isZh ? "取消" : "Cancel"}
              </Button>
              {!compareMode ? (
                <Button
                  disabled={!previewData || restoreDisabled}
                  onClick={() => {
                    if (!previewData) {
                      return;
                    }
                    onRestoreVersion(previewData.version);
                  }}
                >
                  {isZh ? "恢复此版本" : "Restore This Version"}
                </Button>
              ) : null}
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
