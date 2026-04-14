import { AlertTriangle, RefreshCw, Trash2 } from "lucide-react";

import { SectionTitle } from "../../common/components/SectionTitle";
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from "../../../shared/ui";

type AgentTagStatus = "drifted" | "clean" | "synced" | "success" | "error" | string;

export type AgentAssetTag = Record<string, unknown>;

export type AgentAssetListItem = {
  id: string;
  name: string;
  latestVersion?: number | string | null;
  updatedAt?: string | null;
  tags?: AgentAssetTag[];
};

export type AgentConnectionListItem = {
  id: string;
  agentType: string;
  rootDir?: string | null;
  ruleFile?: string | null;
  resolvedPath?: string | null;
};

export type AgentsCenterProps = {
  l: (zh: string, en: string) => string;
  isDarkTheme: boolean;
  activeWorkspaceId: string | null;
  agentAssets: AgentAssetListItem[];
  agentConnections: AgentConnectionListItem[];
  agentQuery: string;
  setAgentQuery: (value: string) => void;
  handleRefreshAgentModule: () => Promise<void> | void;
  handleCreateNewAgentAsset: () => void;
  agentRulesError: string | null;
  clearAgentRulesError: () => void;
  filteredAgentAssets: AgentAssetListItem[];
  pagedAgentAssets: AgentAssetListItem[];
  agentTagsByAsset: Record<string, AgentAssetTag[]>;
  openAgentRuleEditor: (assetId: string) => Promise<void> | void;
  handleOpenAgentVersionDiff: (assetId: string) => Promise<void> | void;
  setSelectedAssetId: (assetId: string | null) => void;
  setCreatingAgentAsset: (value: boolean) => void;
  setAgentDistributionModalOpen: (open: boolean) => void;
  deleteConfirmAssetId: string | null;
  setDeleteConfirmAssetId: (updater: string | null | ((prev: string | null) => string | null)) => void;
  handleDeleteAgentRuleAsset: (assetId: string, assetName: string) => Promise<void> | void;
  toLocalTime: (value: string | null | undefined) => string;
  agentRulesPage: number;
  setAgentRulesPage: (updater: number | ((prev: number) => number)) => void;
  totalAgentPages: number;
  agentRulesPageSize: number;
  normalizeAgentTypeInput: (value: string) => string;
  defaultAgentRuleFile: (platform: string) => string;
  joinRuleFilePath: (rootDir: string, ruleFile: string) => string;
  handleOpenAgentMappingPreview: (platform: string) => Promise<void> | void;
};

export function AgentsCenter({
  l,
  isDarkTheme,
  activeWorkspaceId,
  agentAssets,
  agentConnections,
  agentQuery,
  setAgentQuery,
  handleRefreshAgentModule,
  handleCreateNewAgentAsset,
  agentRulesError,
  clearAgentRulesError,
  filteredAgentAssets,
  pagedAgentAssets,
  agentTagsByAsset,
  openAgentRuleEditor,
  handleOpenAgentVersionDiff,
  setSelectedAssetId,
  setCreatingAgentAsset,
  setAgentDistributionModalOpen,
  deleteConfirmAssetId,
  setDeleteConfirmAssetId,
  handleDeleteAgentRuleAsset,
  toLocalTime,
  agentRulesPage,
  setAgentRulesPage,
  totalAgentPages,
  agentRulesPageSize,
  normalizeAgentTypeInput,
  defaultAgentRuleFile,
  joinRuleFilePath,
  handleOpenAgentMappingPreview,
}: AgentsCenterProps) {
  return (
    <div className="space-y-4">
      <SectionTitle
        title={l("全局 Agent 规则管理", "Global Agent Rules")}
        subtitle={l(`规则文件 ${agentAssets.length} 个 · 已接入 Agent ${agentConnections.length} 个`, `${agentAssets.length} rule files · ${agentConnections.length} connected agents`)}
        action={
          <div className="flex flex-wrap gap-2">
            <Input
              value={agentQuery}
              onChange={(event) => setAgentQuery(event.currentTarget.value)}
              placeholder={l("搜索规则文件...", "Search rule files...")}
              className="w-56"
            />
            <Button variant="outline" onClick={() => void handleRefreshAgentModule()}>
              <RefreshCw className="mr-1 h-4 w-4" />
              {l("刷新", "Refresh")}
            </Button>
            <Button onClick={() => handleCreateNewAgentAsset()} disabled={!activeWorkspaceId}>
              {l("新建规则文件", "New Rule File")}
            </Button>
          </div>
        }
      />

      {agentRulesError ? (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="flex items-center justify-between gap-3 py-3 text-sm text-red-700">
            <span className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              {agentRulesError}
            </span>
            <Button size="sm" variant="outline" onClick={() => clearAgentRulesError()}>
              {l("清除", "Clear")}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{l("规则列表", "Rule Files")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {filteredAgentAssets.length === 0 ? (
            <div className="text-slate-500">{l("暂无规则文件，点击“新建规则文件”开始。", "No rule files yet. Click \"New Rule File\" to start.")}</div>
          ) : (
            pagedAgentAssets.map((asset) => {
              const tags = agentTagsByAsset[asset.id] ?? asset.tags ?? [];
              return (
                <div
                  key={asset.id}
                  className="group cursor-pointer rounded-md border border-slate-200 px-3 py-2"
                  onClick={() => {
                    void openAgentRuleEditor(asset.id);
                  }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-900">{asset.name}</span>
                      <span className="text-xs text-slate-500">
                        {l("版本", "Version")} v{asset.latestVersion ?? "-"} · {toLocalTime(asset.updatedAt)}
                      </span>
                    </div>
                    <div className="flex gap-2 opacity-0 pointer-events-none transition-opacity group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleOpenAgentVersionDiff(asset.id);
                        }}
                      >
                        {l("版本对比", "Compare")}
                      </Button>
                      <Button
                        size="sm"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedAssetId(asset.id);
                          setCreatingAgentAsset(false);
                          setAgentDistributionModalOpen(true);
                        }}
                        disabled={agentConnections.length === 0}
                      >
                        {l("应用", "Apply")}
                      </Button>
                      <div className="relative">
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600 hover:text-red-700"
                          title={l("删除规则文件", "Delete rule file")}
                          onClick={(event) => {
                            event.stopPropagation();
                            setDeleteConfirmAssetId((prev) =>
                              prev === asset.id ? null : asset.id,
                            );
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                        {deleteConfirmAssetId === asset.id ? (
                          <div
                            className="absolute right-0 top-10 z-20 w-56 rounded-md border border-red-200 bg-white p-2 text-xs shadow-lg"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <div className="text-slate-700">
                              {l(`确认彻底删除「${asset.name}」？`, `Delete "${asset.name}" permanently?`)}
                            </div>
                            <div className="mt-2 flex justify-end gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setDeleteConfirmAssetId(null);
                                }}
                              >
                                {l("取消", "Cancel")}
                              </Button>
                              <Button
                                size="sm"
                                className="bg-red-600 hover:bg-red-700"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void handleDeleteAgentRuleAsset(asset.id, asset.name);
                                }}
                              >
                                {l("确认删除", "Delete")}
                              </Button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {tags.length === 0 ? (
                      <span className="text-xs text-slate-400">{l("暂无 Agent 标签", "No agent tags")}</span>
                    ) : (
                      tags.map((tag) => {
                        const status = String(
                          (tag as Record<string, unknown>).status ??
                            (tag as Record<string, unknown>).driftStatus ??
                            "clean",
                        ) as AgentTagStatus;
                        const label =
                          status === "drifted"
                            ? isDarkTheme
                              ? "border-rose-400/40 bg-rose-500/15 text-rose-200"
                              : "border-[#ffccc7] bg-[#fff2f0] text-[#ff4d4f]"
                            : status === "clean" || status === "synced" || status === "success"
                              ? isDarkTheme
                                ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-200"
                                : "border-[#b7eb8f] bg-[#f6ffed] text-[#52c41a]"
                              : status === "error"
                                ? isDarkTheme
                                  ? "border-amber-400/40 bg-amber-500/15 text-amber-200"
                                  : "border-amber-200 bg-amber-50 text-amber-700"
                                : isDarkTheme
                                  ? "border-slate-500/40 bg-slate-500/15 text-slate-200"
                                  : "border-slate-200 bg-slate-50 text-slate-700";
                        const agentType = String(
                          (tag as Record<string, unknown>).agentType ??
                            (tag as Record<string, unknown>).agent_type ??
                            "unknown",
                        );
                        return (
                          <span key={`${asset.id}-${agentType}`} className={`rounded-full border px-2 py-1 text-xs ${label}`}>
                            {agentType}
                            {status === "drifted" ? " · drifted" : ""}
                          </span>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })
          )}
          {filteredAgentAssets.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2 text-xs text-slate-500">
              <span>
                {l(
                  `共 ${filteredAgentAssets.length} 个 · 每页 ${agentRulesPageSize} 条`,
                  `${filteredAgentAssets.length} items · ${agentRulesPageSize} / page`,
                )}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={agentRulesPage <= 1}
                  onClick={() => setAgentRulesPage((prev) => Math.max(1, prev - 1))}
                >
                  {l("上一页", "Prev")}
                </Button>
                <span>
                  {agentRulesPage} / {totalAgentPages}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={agentRulesPage >= totalAgentPages}
                  onClick={() => setAgentRulesPage((prev) => Math.min(totalAgentPages, prev + 1))}
                >
                  {l("下一页", "Next")}
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{l("平台文件映射", "Platform File Mapping")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {agentConnections.length === 0 ? (
            <div className="text-slate-500">{l("暂无接入 Agent，请先在设置中配置根目录。", "No connected agents. Configure root directories in Settings first.")}</div>
          ) : (
            agentConnections.map((connection) => {
              const platform = normalizeAgentTypeInput(connection.agentType);
              const mappedPath = connection.ruleFile || defaultAgentRuleFile(platform);
              const resolvedPath =
                connection.resolvedPath ||
                (connection.rootDir
                  ? joinRuleFilePath(connection.rootDir, mappedPath)
                  : mappedPath);
              return (
                <div
                  key={`mapping-${connection.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 px-3 py-2"
                >
                  <div>
                    <div className="font-medium">{platform}</div>
                    <div className="text-xs text-slate-500">{connection.rootDir || l("(未配置根目录)", "(root directory not configured)")}</div>
                    <div className="text-xs text-slate-500">
                      <code>{resolvedPath}</code>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => void handleOpenAgentMappingPreview(platform)}>
                    {l("预览", "Preview")}
                  </Button>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}

