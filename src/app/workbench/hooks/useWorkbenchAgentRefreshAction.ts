import { useAgentRulesStore } from "../../../shared/stores";
import type { WorkbenchToastOptions } from "../types";

type RefreshActionInput = {
  activeWorkspaceId: string | null;
  projectBootingMessage: string;
  loadAgentModuleData: (workspaceId: string) => Promise<void>;
  refreshAgentAsset: (workspaceId: string, assetId: string) => Promise<unknown>;
  l: (zh: string, en: string) => string;
  toast: (options: WorkbenchToastOptions) => string;
};

export function createWorkbenchAgentRefreshAction({
  activeWorkspaceId,
  projectBootingMessage,
  loadAgentModuleData,
  refreshAgentAsset,
  l,
  toast,
}: RefreshActionInput) {
  return async function handleRefreshAgentModule() {
    if (!activeWorkspaceId) {
      toast({ title: projectBootingMessage, variant: "destructive" });
      return;
    }
    try {
      await loadAgentModuleData(activeWorkspaceId);
      const latestState = useAgentRulesStore.getState();
      const boundAssetIds = latestState.assets
        .filter((asset) => {
          const tags = latestState.tagsByAsset[asset.id] ?? asset.tags ?? [];
          return tags.length > 0;
        })
        .map((asset) => asset.id)
        .filter(Boolean);
      if (boundAssetIds.length === 0) {
        toast({
          title: l("规则检查完成", "Rule check complete"),
          description: l(
            "暂无已应用的规则，已刷新列表。",
            "No applied rules yet. List refreshed.",
          ),
        });
        return;
      }
      const driftResults = await Promise.allSettled(
        boundAssetIds.map((assetId) =>
          refreshAgentAsset(activeWorkspaceId, assetId),
        ),
      );
      await loadAgentModuleData(activeWorkspaceId);
      showRefreshSummary(driftResults, l, toast);
    } catch (error) {
      toast({
        title: l("刷新失败", "Refresh failed"),
        description:
          error instanceof Error
            ? error.message
            : l("未知错误", "Unknown error"),
        variant: "destructive",
      });
    }
  };
}

function showRefreshSummary(
  driftResults: PromiseSettledResult<unknown>[],
  l: (zh: string, en: string) => string,
  toast: (options: WorkbenchToastOptions) => string,
) {
  const failedCount = driftResults.filter(
    (result) => result.status === "rejected",
  ).length;
  const byAgent = summarizeDriftResults(driftResults);
  const summary = Array.from(byAgent.entries())
    .map(([agent, stat]) => {
      if (stat.error > 0) {
        return l(`${agent} 检查异常`, `${agent} check error`);
      }
      if (stat.drifted > 0) {
        return l(`${agent} 检测到规则变更`, `${agent} drift detected`);
      }
      if (stat.clean > 0) {
        return l(`${agent} 正常`, `${agent} clean`);
      }
      return l(`${agent} 已检查`, `${agent} checked`);
    })
    .join(l("，", ", "));
  const failedPart =
    failedCount > 0
      ? l(
          `。有 ${failedCount} 个规则检查失败，可重试。`,
          `. ${failedCount} rule checks failed and can be retried.`,
        )
      : "";
  const description = `${
    summary
      ? l(`规则检查完成：${summary}`, `Rule check complete: ${summary}`)
      : l("规则检查完成。", "Rule check complete.")
  }${failedPart}`;
  toast({
    title: l("规则检查完成", "Rule check complete"),
    description,
    variant: failedCount > 0 ? "destructive" : "default",
  });
}

function summarizeDriftResults(driftResults: PromiseSettledResult<unknown>[]) {
  const byAgent = new Map<
    string,
    { clean: number; drifted: number; error: number; other: number }
  >();
  for (const result of driftResults) {
    if (result.status !== "fulfilled") {
      continue;
    }
    const records = Array.isArray(
      (result.value as { records?: unknown[] } | null)?.records,
    )
      ? ((result.value as { records?: unknown[] }).records ?? [])
      : [];
    for (const raw of records) {
      const row = (raw ?? {}) as Record<string, unknown>;
      const agent = String(
        row.agentType ?? row.agent_type ?? row.targetId ?? "unknown",
      );
      const status = String(row.status ?? "");
      const stat = byAgent.get(agent) ?? {
        clean: 0,
        drifted: 0,
        error: 0,
        other: 0,
      };
      if (status === "clean") {
        stat.clean += 1;
      } else if (status === "drifted") {
        stat.drifted += 1;
      } else if (status === "error") {
        stat.error += 1;
      } else {
        stat.other += 1;
      }
      byAgent.set(agent, stat);
    }
  }
  return byAgent;
}
