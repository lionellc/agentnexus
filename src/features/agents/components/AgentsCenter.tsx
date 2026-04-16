import { AlertTriangle, RefreshCw, Trash2 } from "lucide-react";

import { SectionTitle } from "../../common/components/SectionTitle";
import { Button, Card, CardContent, Input, Tag, type TagProps } from "../../../shared/ui";

type AgentTagStatus = "drifted" | "clean" | "synced" | "success" | "error" | string;

function agentTagTone(status: AgentTagStatus): NonNullable<TagProps["tone"]> {
  if (status === "drifted") {
    return "danger";
  }
  if (status === "clean" || status === "synced" || status === "success") {
    return "success";
  }
  if (status === "error") {
    return "warning";
  }
  return "neutral";
}

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
};

export function AgentsCenter({
  l,
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
        <CardContent className="space-y-3 py-6 text-sm">
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
                                variant="outline"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void handleDeleteAgentRuleAsset(asset.id, asset.name);
                                }}
                              >
                                <Trash2 className="mr-1 h-4 w-4 text-red-600" />
                                {l("确认", "Confirm")}
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
                        const agentType = String(
                          (tag as Record<string, unknown>).agentType ??
                            (tag as Record<string, unknown>).agent_type ??
                            "unknown",
                        );
                        return (
                          <Tag key={`${asset.id}-${agentType}`} tone={agentTagTone(status)} className="px-2 py-1">
                            {agentType}
                            {status === "drifted" ? " · drifted" : ""}
                          </Tag>
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
    </div>
  );
}
