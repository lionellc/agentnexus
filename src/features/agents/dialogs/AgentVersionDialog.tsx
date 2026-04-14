import { VersionDiffViewer } from "../../common/components/VersionDiffViewer";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../shared/ui";

export type AgentVersionListItem = {
  version: number | string;
  createdAt?: string;
  content?: string;
};

export type AgentVersionDialogProps = {
  l: (zh: string, en: string) => string;
  isZh: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedAgentAssetName?: string | null;
  agentVersionCompareMode: boolean;
  setAgentVersionCompareMode: (value: boolean) => void;
  agentCompareLeftVersion: string;
  setAgentCompareLeftVersion: (value: string) => void;
  agentCompareRightVersion: string;
  setAgentCompareRightVersion: (value: string) => void;
  selectedAgentVersions: AgentVersionListItem[];
  agentVersionPreview: string;
  setAgentVersionPreview: (value: string) => void;
  toggleAgentCompareCandidate: (version: string) => void;
  selectedAgentPreviewVersion: AgentVersionListItem | null;
  agentCompareLeft: AgentVersionListItem | null;
  agentCompareRight: AgentVersionListItem | null;
  agentDiffStats: {
    added: number;
    removed: number;
  };
  toLocalTime: (value: string | null | undefined) => string;
  handleRestoreAgentRuleVersion: (version: string) => Promise<void> | void;
};

export function AgentVersionDialog({
  l,
  isZh,
  open,
  onOpenChange,
  selectedAgentAssetName,
  agentVersionCompareMode,
  setAgentVersionCompareMode,
  agentCompareLeftVersion,
  setAgentCompareLeftVersion,
  agentCompareRightVersion,
  setAgentCompareRightVersion,
  selectedAgentVersions,
  agentVersionPreview,
  setAgentVersionPreview,
  toggleAgentCompareCandidate,
  selectedAgentPreviewVersion,
  agentCompareLeft,
  agentCompareRight,
  agentDiffStats,
  toLocalTime,
  handleRestoreAgentRuleVersion,
}: AgentVersionDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);
        if (!nextOpen) {
          setAgentVersionCompareMode(false);
          setAgentCompareLeftVersion("");
          setAgentCompareRightVersion("");
        }
      }}
    >
      <DialogContent className="flex max-h-[90vh] max-w-6xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>{l("历史版本", "History Versions")}</DialogTitle>
          <DialogDescription>{selectedAgentAssetName ?? l("请选择规则文件", "Please select a rule file")}</DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden pt-1 md:grid-cols-[280px_minmax(0,1fr)]">
          <div className="min-h-0 space-y-2 overflow-auto border-r border-slate-200 pr-3">
            <div className="px-1 text-sm text-slate-500">
              {agentVersionCompareMode
                ? l("选择对比版本", "Select versions for comparison")
                : l("选择版本", "Select version")}
            </div>
            {selectedAgentVersions.map((item) => {
              const version = String(item.version);
              const selectedAsSingle = !agentVersionCompareMode && agentVersionPreview === version;
              const selectedAsLeft = agentVersionCompareMode && agentCompareLeftVersion === version;
              const selectedAsRight = agentVersionCompareMode && agentCompareRightVersion === version;
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
                  key={`agent-version-${version}`}
                  type="button"
                  className={`w-full rounded-xl border px-3 py-3 text-left transition-colors ${colorClass}`}
                  onClick={() => {
                    if (agentVersionCompareMode) {
                      toggleAgentCompareCandidate(version);
                      return;
                    }
                    setAgentVersionPreview(version);
                  }}
                >
                  <div className="text-[22px] leading-none">v{version}</div>
                  <div className="mt-1 text-sm opacity-90">{toLocalTime(item.createdAt)}</div>
                </button>
              );
            })}
          </div>
          <div className="min-h-0 space-y-3 overflow-auto pr-1">
            {!agentVersionCompareMode ? (
              <>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs text-slate-500">
                    {selectedAgentPreviewVersion
                      ? `v${selectedAgentPreviewVersion.version} · ${toLocalTime(selectedAgentPreviewVersion.createdAt)}`
                      : l("请选择一个版本查看详情。", "Select a version to view details.")}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-sm font-medium text-slate-600">{l("规则内容", "Rule Content")}</div>
                  <div className="max-h-[56vh] overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <pre className="whitespace-pre-wrap break-words text-sm text-slate-800">
                      {selectedAgentPreviewVersion?.content || l("暂无版本内容", "No version content")}
                    </pre>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="rounded-md bg-red-100 px-2 py-1 font-medium text-red-700">
                        {agentCompareLeft ? `v${agentCompareLeft.version}` : l("未选择", "N/A")}
                      </span>
                      <span className="text-slate-500">→</span>
                      <span className="rounded-md bg-emerald-100 px-2 py-1 font-medium text-emerald-700">
                        {agentCompareRight ? `v${agentCompareRight.version}` : l("未选择", "N/A")}
                      </span>
                    </div>
                    <div className="text-sm text-slate-500">
                      {agentCompareLeft && agentCompareRight
                        ? `${toLocalTime(agentCompareLeft.createdAt)} → ${toLocalTime(agentCompareRight.createdAt)}`
                        : l("请选择两个版本进行对比。", "Select two versions to compare.")}
                    </div>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-sm font-medium text-slate-600">
                    <span>{l("规则内容对比", "Rule Content Diff")}</span>
                    <span className="text-xs">
                      <span className="text-emerald-600">+ {agentDiffStats.added}</span>
                      <span className="mx-2 text-red-600">- {agentDiffStats.removed}</span>
                    </span>
                  </div>
                  <VersionDiffViewer
                    isZh={isZh}
                    before={agentCompareLeft?.content ?? ""}
                    after={agentCompareRight?.content ?? ""}
                    leftTitle={agentCompareLeft ? `v${agentCompareLeft.version}` : undefined}
                    rightTitle={agentCompareRight ? `v${agentCompareRight.version}` : undefined}
                  />
                </div>
              </>
            )}
          </div>
        </div>
        <DialogFooter className="mt-2 border-t border-slate-200 pt-3">
          <div className="flex w-full items-center justify-between gap-2">
            <Button
              variant="outline"
              onClick={() => {
                if (agentVersionCompareMode) {
                  setAgentVersionCompareMode(false);
                  setAgentCompareLeftVersion("");
                  setAgentCompareRightVersion("");
                  return;
                }
                setAgentVersionCompareMode(true);
                setAgentCompareLeftVersion(String(selectedAgentVersions[0]?.version ?? ""));
                setAgentCompareRightVersion(
                  String(selectedAgentVersions[1]?.version ?? selectedAgentVersions[0]?.version ?? ""),
                );
              }}
            >
              {agentVersionCompareMode ? l("退出对比", "Exit Compare") : l("版本对比", "Compare Versions")}
            </Button>
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                {l("取消", "Cancel")}
              </Button>
              {!agentVersionCompareMode ? (
                <Button
                  disabled={!selectedAgentPreviewVersion}
                  onClick={() => {
                    if (!selectedAgentPreviewVersion) {
                      return;
                    }
                    void handleRestoreAgentRuleVersion(String(selectedAgentPreviewVersion.version));
                  }}
                >
                  {l("恢复此版本", "Restore This Version")}
                </Button>
              ) : null}
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
