import { useEffect, useMemo, useState } from "react";
import { useAgentRulesStore } from "../../../shared/stores";
import { useAgentVersionsCompare } from "./useAgentVersionsCompare";
import type { UseWorkbenchAgentsControllerInput } from "./useWorkbenchAgentsController.types";
import { useWorkbenchAgentsModuleView } from "./useWorkbenchAgentsModuleView";
import type { AgentRuleAccessTarget } from "../../../shared/types";
const AGENT_RULES_PAGE_SIZE = 8;

function isApplyRecordSuccess(record: unknown): boolean {
  return (
    String((record as Record<string, unknown>)?.status ?? "") === "success"
  );
}

function summarizeApplyFailures(
  records: unknown[] | undefined,
  l: (zh: string, en: string) => string,
): string {
  const failedRecords = (records ?? []).filter(
    (record) => !isApplyRecordSuccess(record),
  );
  return failedRecords
    .slice(0, 2)
    .map((record) => {
      const row = (record ?? {}) as Record<string, unknown>;
      const agent = String(
        row.agentType ??
          row.agent_type ??
          row.targetId ??
          l("未知 Agent", "Unknown agent"),
      );
      const message = String(row.message ?? l("未知错误", "Unknown error"));
      return `${agent}: ${message}`;
    })
    .join("；");
}

function summarizeAccessIssues(
  targets: AgentRuleAccessTarget[],
  l: (zh: string, en: string) => string,
): string {
  return (
    targets
      .slice(0, 2)
      .map(
        (target) =>
          `${target.agentType}: ${target.message}${target.advice ? `。${target.advice}` : ""}`,
      )
      .join("；") || l("规则目录暂时不可写", "Rule directory is not writable")
  );
}

export function useWorkbenchAgentsController({
  l,
  isZh,
  toast,
  activeWorkspaceId,
  projectBootingMessage,
  agentAssets,
  agentTagsByAsset,
  agentVersionsByAsset,
  agentConnections,
  agentRulesError,
  selectedAssetId,
  setSelectedAssetId,
  clearAgentRulesError,
  loadAgentModuleData,
  loadAgentVersions,
  createAgentAsset,
  renameAgentAsset,
  deleteAgentAsset,
  publishAgentVersion,
  rollbackAgentRuleVersion,
  refreshAgentAsset,
  runAgentDistribution,
  translationTargetLanguage,
  translationTargetLanguageOptions,
  modelTestRunning,
  setTranslationTargetLanguage,
  handleRunModelTranslationTest,
  toLocalTime,
}: UseWorkbenchAgentsControllerInput) {
  const [agentVersionModalOpen, setAgentVersionModalOpen] = useState(false);
  const [agentDistributionModalOpen, setAgentDistributionModalOpen] =
    useState(false);
  const [agentRuleEditorModalOpen, setAgentRuleEditorModalOpen] =
    useState(false);
  const [agentRulesPage, setAgentRulesPage] = useState(1);
  const [deleteConfirmAssetId, setDeleteConfirmAssetId] = useState<
    string | null
  >(null);
  const [agentQuery, setAgentQuery] = useState("");
  const [creatingAgentAsset, setCreatingAgentAsset] = useState(false);
  const [agentAssetNameInput, setAgentAssetNameInput] = useState("");
  const [agentEditorContent, setAgentEditorContent] = useState("");
  const [agentRuleTranslatedText, setAgentRuleTranslatedText] = useState("");
  const [agentTargetIds, setAgentTargetIds] = useState<string[]>([]);
  const agentRuleAccessCheck = useAgentRulesStore((state) => state.accessCheck);
  const checkingAgentRuleAccess = useAgentRulesStore(
    (state) => state.checkingAccess,
  );
  const checkAgentRuleAccess = useAgentRulesStore((state) => state.checkAccess);
  const versionCompare = useAgentVersionsCompare({
    selectedAssetId,
    agentVersionsByAsset,
  });
  const filteredAgentAssets = useMemo(() => {
    if (!agentQuery.trim()) {
      return agentAssets;
    }
    const lower = agentQuery.toLowerCase();
    return agentAssets.filter((item) => {
      const latestVersion = String(item.latestVersion ?? "");
      return (
        item.name.toLowerCase().includes(lower) || latestVersion.includes(lower)
      );
    });
  }, [agentAssets, agentQuery]);
  const totalAgentPages = useMemo(
    () =>
      Math.max(
        1,
        Math.ceil(filteredAgentAssets.length / AGENT_RULES_PAGE_SIZE),
      ),
    [filteredAgentAssets.length],
  );
  const pagedAgentAssets = useMemo(() => {
    const start = (agentRulesPage - 1) * AGENT_RULES_PAGE_SIZE;
    return filteredAgentAssets.slice(start, start + AGENT_RULES_PAGE_SIZE);
  }, [filteredAgentAssets, agentRulesPage]);
  const selectedAgentAsset = useMemo(() => {
    if (!selectedAssetId) {
      return null;
    }
    return agentAssets.find((item) => item.id === selectedAssetId) ?? null;
  }, [agentAssets, selectedAssetId]);
  useEffect(() => {
    setAgentRulesPage((prev) => Math.min(prev, totalAgentPages));
  }, [totalAgentPages]);
  useEffect(() => {
    if (creatingAgentAsset) {
      return;
    }
    if (!selectedAgentAsset) {
      if (agentAssets.length > 0) {
        setSelectedAssetId(agentAssets[0].id);
      } else {
        setCreatingAgentAsset(true);
        setAgentAssetNameInput(l("规则文件 1", "Rule File 1"));
        setAgentEditorContent("");
      }
      return;
    }
    setAgentAssetNameInput(selectedAgentAsset.name);
    if (typeof selectedAgentAsset.latestContent === "string") {
      setAgentEditorContent(selectedAgentAsset.latestContent);
    }
  }, [
    creatingAgentAsset,
    selectedAgentAsset,
    agentAssets,
    setSelectedAssetId,
    l,
  ]);
  useEffect(() => {
    if (creatingAgentAsset || !selectedAssetId) {
      return;
    }
    const latestVersion = agentVersionsByAsset[selectedAssetId]?.[0];
    if (typeof latestVersion?.content === "string") {
      setAgentEditorContent(latestVersion.content);
    }
  }, [creatingAgentAsset, selectedAssetId, agentVersionsByAsset]);
  useEffect(() => {
    setAgentRuleTranslatedText("");
  }, [creatingAgentAsset, selectedAssetId]);
  useEffect(() => {
    if (!activeWorkspaceId) {
      setAgentTargetIds([]);
      return;
    }
    const next = agentConnections
      .filter((item) => item.enabled !== false && item.agentType.trim())
      .map((item) => item.agentType);
    setAgentTargetIds(next);
  }, [activeWorkspaceId, agentConnections]);
  const agentTargetIdsKey = useMemo(
    () => agentTargetIds.join("|"),
    [agentTargetIds],
  );
  useEffect(() => {
    if (!agentDistributionModalOpen || !activeWorkspaceId) {
      return;
    }
    const targets = agentTargetIds.length > 0 ? agentTargetIds : undefined;
    void checkAgentRuleAccess(activeWorkspaceId, targets).catch(
      () => undefined,
    );
  }, [
    activeWorkspaceId,
    agentDistributionModalOpen,
    agentTargetIdsKey,
    checkAgentRuleAccess,
  ]);
  useEffect(() => {
    if (!agentVersionModalOpen || versionCompare.agentVersionCompareMode) {
      return;
    }
    if (versionCompare.selectedAgentVersions.length === 0) {
      if (versionCompare.agentVersionPreview) {
        versionCompare.setAgentVersionPreview("");
      }
      return;
    }
    const exists = versionCompare.selectedAgentVersions.some(
      (item) => String(item.version) === versionCompare.agentVersionPreview,
    );
    if (!exists) {
      versionCompare.setAgentVersionPreview(
        String(versionCompare.selectedAgentVersions[0]?.version ?? ""),
      );
    }
  }, [
    agentVersionModalOpen,
    versionCompare.agentVersionCompareMode,
    versionCompare.selectedAgentVersions,
    versionCompare.agentVersionPreview,
    versionCompare.setAgentVersionPreview,
  ]);
  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    document.body.classList.toggle(
      "agent-rule-editor-open",
      agentRuleEditorModalOpen,
    );
    return () => {
      document.body.classList.remove("agent-rule-editor-open");
    };
  }, [agentRuleEditorModalOpen]);
  function handleCreateNewAgentAsset() {
    setCreatingAgentAsset(true);
    setSelectedAssetId(null);
    setAgentAssetNameInput(
      l(
        `规则文件 ${agentAssets.length + 1}`,
        `Rule File ${agentAssets.length + 1}`,
      ),
    );
    setAgentEditorContent("");
    setAgentRuleEditorModalOpen(true);
  }
  async function openAgentRuleEditor(assetId: string) {
    setCreatingAgentAsset(false);
    setSelectedAssetId(assetId);
    setAgentRuleEditorModalOpen(true);
    const currentAsset = agentAssets.find((item) => item.id === assetId);
    if (typeof currentAsset?.latestContent === "string") {
      setAgentEditorContent(currentAsset.latestContent);
      return;
    }
    try {
      await loadAgentVersions(assetId);
    } catch {
      // 忽略补读失败，保持当前内容。
    }
  }
  async function handleOpenAgentVersionDiff(assetId: string) {
    setCreatingAgentAsset(false);
    setSelectedAssetId(assetId);
    const cachedVersions = agentVersionsByAsset[assetId] ?? [];
    versionCompare.setAgentVersionCompareMode(false);
    versionCompare.setAgentVersionPreview(
      String(cachedVersions[0]?.version ?? ""),
    );
    versionCompare.setAgentCompareLeftVersion("");
    versionCompare.setAgentCompareRightVersion("");
    try {
      await loadAgentVersions(assetId);
      setAgentVersionModalOpen(true);
    } catch (error) {
      toast({
        title: l("读取版本失败", "Failed to load versions"),
        description:
          error instanceof Error
            ? error.message
            : l("未知错误", "Unknown error"),
        variant: "destructive",
      });
    }
  }
  async function handleDeleteAgentRuleAsset(
    assetId: string,
    assetName: string,
  ) {
    if (!activeWorkspaceId) {
      toast({ title: projectBootingMessage, variant: "destructive" });
      return;
    }
    try {
      await deleteAgentAsset(activeWorkspaceId, assetId);
      setDeleteConfirmAssetId(null);
      if (selectedAssetId === assetId) {
        setAgentRuleEditorModalOpen(false);
      }
      toast({
        title: l("删除成功", "Deleted"),
        description: l(`${assetName} 已删除`, `${assetName} deleted`),
      });
    } catch (error) {
      toast({
        title: l("删除失败", "Delete failed"),
        description:
          error instanceof Error
            ? error.message
            : l("未知错误", "Unknown error"),
        variant: "destructive",
      });
    }
  }
  async function handleSaveAgentRuleVersion() {
    if (!activeWorkspaceId) {
      toast({ title: projectBootingMessage, variant: "destructive" });
      return;
    }
    const nextTitle = agentAssetNameInput.trim();
    if (!nextTitle) {
      toast({
        title: l("请输入规则文件名称", "Please enter a rule file name"),
        variant: "destructive",
      });
      return;
    }
    try {
      if (!selectedAgentAsset || creatingAgentAsset) {
        const created = await createAgentAsset(
          activeWorkspaceId,
          nextTitle,
          agentEditorContent,
        );
        setCreatingAgentAsset(false);
        setSelectedAssetId(created.id);
        setAgentRuleEditorModalOpen(false);
        toast({
          title: l("规则文件已创建", "Rule file created"),
          description: l(
            `${created.name} 已创建并生成首个版本`,
            `${created.name} created with the first version`,
          ),
        });
        return;
      }
      if (nextTitle !== selectedAgentAsset.name) {
        await renameAgentAsset(
          activeWorkspaceId,
          selectedAgentAsset.id,
          nextTitle,
        );
      }
      const version = await publishAgentVersion(
        selectedAgentAsset.id,
        agentEditorContent,
      );
      toast({
        title: l("保存成功", "Saved"),
        description: l(
          `${nextTitle} 已生成版本 ${version.version}`,
          `${nextTitle} generated version ${version.version}`,
        ),
      });
    } catch (error) {
      toast({
        title: l("保存失败", "Save failed"),
        description:
          error instanceof Error
            ? error.message
            : l("未知错误", "Unknown error"),
        variant: "destructive",
      });
    }
  }
  async function handleRunAgentDistribution() {
    if (!activeWorkspaceId) {
      toast({ title: projectBootingMessage, variant: "destructive" });
      return;
    }
    if (!selectedAssetId) {
      toast({
        title: l("请先选择规则资产", "Please select a rule asset first"),
        variant: "destructive",
      });
      return;
    }
    try {
      const accessCheck = await checkAgentRuleAccess(
        activeWorkspaceId,
        agentTargetIds.length > 0 ? agentTargetIds : undefined,
      );
      const blockedTargets = accessCheck.targets.filter(
        (target) => target.status !== "ready",
      );
      if (blockedTargets.length > 0) {
        toast({
          title: l(
            "应用前需要处理目录权限",
            "Fix directory access before applying",
          ),
          description: summarizeAccessIssues(blockedTargets, l),
          variant: "destructive",
        });
        return;
      }
      const job = await runAgentDistribution({
        workspaceId: activeWorkspaceId,
        releaseVersion: selectedAssetId,
        targetIds: agentTargetIds.length > 0 ? agentTargetIds : undefined,
      });
      await loadAgentModuleData(activeWorkspaceId);
      setAgentDistributionModalOpen(false);
      const total = Array.isArray(job.records) ? job.records.length : 0;
      const success = Array.isArray(job.records)
        ? job.records.filter(isApplyRecordSuccess).length
        : 0;
      const failed = Math.max(0, total - success);
      const failureSummary = summarizeApplyFailures(job.records, l);
      toast({
        title: l("应用完成", "Apply completed"),
        description:
          failed > 0
            ? failureSummary ||
              l(
                `已更新 Agent 标签，成功 ${success} 个，失败 ${failed} 个。`,
                `Agent tags updated. Success ${success}, failed ${failed}.`,
              )
            : l("已更新 Agent 标签。", "Agent tags updated."),
        variant: failed > 0 ? "destructive" : "default",
      });
    } catch (error) {
      toast({
        title: l("应用失败", "Apply failed"),
        description:
          error instanceof Error
            ? error.message
            : l("未知错误", "Unknown error"),
        variant: "destructive",
      });
    }
  }
  async function handleRestoreAgentRuleVersion(version: string) {
    if (!activeWorkspaceId || !selectedAssetId) {
      return;
    }
    try {
      await rollbackAgentRuleVersion(selectedAssetId, version);
      await loadAgentModuleData(activeWorkspaceId);
      toast({ title: l("已恢复指定版本", "Selected version restored") });
      setAgentVersionModalOpen(false);
    } catch (error) {
      toast({
        title: l("恢复失败", "Restore failed"),
        description:
          error instanceof Error
            ? error.message
            : l("未知错误", "Unknown error"),
        variant: "destructive",
      });
    }
  }
  async function handleRefreshAgentModule() {
    if (!activeWorkspaceId) {
      toast({ title: projectBootingMessage, variant: "destructive" });
      return;
    }
    try {
      await loadAgentModuleData(activeWorkspaceId);
      setDeleteConfirmAssetId(null);
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
      const failedCount = driftResults.filter(
        (result) => result.status === "rejected",
      ).length;
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
  }
  const { module } = useWorkbenchAgentsModuleView({
    l,
    isZh,
    activeWorkspaceId,
    agentAssets,
    agentTagsByAsset,
    agentConnections,
    agentRulesError,
    selectedAssetId,
    selectedAgentAsset,
    clearAgentRulesError,
    setSelectedAssetId,
    setCreatingAgentAsset,
    agentQuery,
    setAgentQuery,
    filteredAgentAssets,
    pagedAgentAssets,
    deleteConfirmAssetId,
    setDeleteConfirmAssetId,
    handleDeleteAgentRuleAsset,
    handleRefreshAgentModule,
    handleCreateNewAgentAsset,
    openAgentRuleEditor,
    handleOpenAgentVersionDiff,
    toLocalTime,
    agentRulesPage,
    setAgentRulesPage,
    totalAgentPages,
    agentRulesPageSize: AGENT_RULES_PAGE_SIZE,
    agentVersionModalOpen,
    setAgentVersionModalOpen,
    agentVersionCompareMode: versionCompare.agentVersionCompareMode,
    setAgentVersionCompareMode: versionCompare.setAgentVersionCompareMode,
    agentCompareLeftVersion: versionCompare.agentCompareLeftVersion,
    setAgentCompareLeftVersion: versionCompare.setAgentCompareLeftVersion,
    agentCompareRightVersion: versionCompare.agentCompareRightVersion,
    setAgentCompareRightVersion: versionCompare.setAgentCompareRightVersion,
    selectedAgentVersions: versionCompare.selectedAgentVersions,
    agentVersionPreview: versionCompare.agentVersionPreview,
    setAgentVersionPreview: versionCompare.setAgentVersionPreview,
    toggleAgentCompareCandidate: versionCompare.toggleAgentCompareCandidate,
    selectedAgentPreviewVersion: versionCompare.selectedAgentPreviewVersion,
    agentCompareLeft: versionCompare.agentCompareLeft,
    agentCompareRight: versionCompare.agentCompareRight,
    agentDiffStats: versionCompare.agentDiffStats,
    handleRestoreAgentRuleVersion,
    agentRuleEditorModalOpen,
    setAgentRuleEditorModalOpen,
    creatingAgentAsset,
    agentAssetNameInput,
    setAgentAssetNameInput,
    agentEditorContent,
    setAgentEditorContent,
    agentRuleTranslatedText,
    setAgentRuleTranslatedText,
    translationTargetLanguage,
    translationTargetLanguageOptions,
    modelTestRunning,
    setTranslationTargetLanguage,
    handleRunModelTranslationTest,
    handleSaveAgentRuleVersion,
    agentDistributionModalOpen,
    setAgentDistributionModalOpen,
    agentTargetIds,
    setAgentTargetIds,
    agentRuleAccessCheck,
    checkingAgentRuleAccess,
    handleRunAgentDistribution,
  });
  return {
    module,
  };
}
