import { useEffect, useMemo, useState } from "react";
import { useAgentRulesStore } from "../../../shared/stores";
import { useAgentVersionsCompare } from "./useAgentVersionsCompare";
import type { UseWorkbenchAgentsControllerInput } from "./useWorkbenchAgentsController.types";
import { useWorkbenchAgentsModuleView } from "./useWorkbenchAgentsModuleView";
import { createWorkbenchAgentAssetActions } from "./useWorkbenchAgentAssetActions";
import { createWorkbenchAgentRefreshAction } from "./useWorkbenchAgentRefreshAction";
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
  const { handleDeleteAgentRuleAsset, handleSaveAgentRuleVersion } =
    createWorkbenchAgentAssetActions({
      activeWorkspaceId,
      projectBootingMessage,
      selectedAssetId,
      selectedAgentAsset,
      creatingAgentAsset,
      agentAssetNameInput,
      agentEditorContent,
      setCreatingAgentAsset,
      setSelectedAssetId,
      setAgentRuleEditorModalOpen,
      setDeleteConfirmAssetId,
      createAgentAsset,
      renameAgentAsset,
      deleteAgentAsset,
      publishAgentVersion,
      l,
      toast,
    });
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
  const handleRefreshAgentModule = createWorkbenchAgentRefreshAction({
    activeWorkspaceId,
    projectBootingMessage,
    loadAgentModuleData: async (workspaceId: string) => {
      await loadAgentModuleData(workspaceId);
      setDeleteConfirmAssetId(null);
    },
    refreshAgentAsset,
    l,
    toast,
  });
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
