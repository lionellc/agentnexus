import type { WorkbenchToastOptions as ToastOptions } from "../types";
import { useCallback, useEffect, useRef, useState } from "react";

import type { SkillsConfigDiffView } from "../../../features/skills/components/SkillsConfigPanel";
import { SkillsLinkConfirmDialog } from "../components/SkillsLinkConfirmDialog";
import { skillsManagerApi } from "../../../shared/services/api";
import type {
  SkillsManagerDiffProgress,
  SkillsManagerLinkPreviewResult,
  SkillsManagerState,
} from "../../../shared/types";

const DIFF_RUNNING_STATUSES = new Set(["running", "cancelling"]);
const DIFF_TERMINAL_STATUSES = new Set(["completed", "cancelled", "failed"]);

type ManagerLinkConfirmDecision = "cancel" | "force-link" | "update-then-link";

type UseSkillsOperationsActionsInput = {
  l: (zh: string, en: string) => string;
  toast: (options: ToastOptions) => string;
  activeWorkspaceId: string | null;
  projectBootingMessage: string;
  managerState: SkillsManagerState | null;
  fetchSkills: () => Promise<void>;
  loadManagerState: (workspaceId: string) => Promise<void>;
  managerBatchLink: (workspaceId: string, skillIds: string[], tool: string, force?: boolean) => Promise<void>;
  managerBatchUnlink: (workspaceId: string, skillIds: string[], tool: string) => Promise<void>;
};

function createInitialDiffView(): SkillsConfigDiffView {
  return {
    open: false,
    status: "completed",
    running: false,
    jobId: "",
    leftSkillName: "",
    rightSkillName: "",
    processedFiles: 0,
    totalFiles: 0,
    currentFile: "",
    diffFiles: 0,
    sameSkill: null,
    errorMessage: "",
    entries: [],
  };
}

export function useSkillsOperationsActions({
  l,
  toast,
  activeWorkspaceId,
  projectBootingMessage,
  managerState,
  fetchSkills,
  loadManagerState,
  managerBatchLink,
  managerBatchUnlink,
}: UseSkillsOperationsActionsInput) {
  const [managerPurgingSkillId, setManagerPurgingSkillId] = useState<string | null>(null);
  const [diffView, setDiffView] = useState<SkillsConfigDiffView>(() => createInitialDiffView());
  const [linkConfirmPreview, setLinkConfirmPreview] = useState<SkillsManagerLinkPreviewResult | null>(null);

  const linkConfirmResolverRef = useRef<((decision: ManagerLinkConfirmDecision) => void) | null>(null);
  const diffPollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const diffPollContextRef = useRef<{ workspaceId: string; jobId: string } | null>(null);

  const settleLinkConfirm = useCallback((decision: ManagerLinkConfirmDecision) => {
    const resolver = linkConfirmResolverRef.current;
    linkConfirmResolverRef.current = null;
    setLinkConfirmPreview(null);
    if (resolver) {
      resolver(decision);
    }
  }, []);

  const requestLinkConfirm = useCallback(
    async (preview: SkillsManagerLinkPreviewResult): Promise<ManagerLinkConfirmDecision> =>
      new Promise((resolve) => {
        if (linkConfirmResolverRef.current) {
          linkConfirmResolverRef.current("cancel");
        }
        linkConfirmResolverRef.current = resolve;
        setLinkConfirmPreview(preview);
      }),
    [],
  );

  useEffect(() => {
    return () => {
      if (linkConfirmResolverRef.current) {
        linkConfirmResolverRef.current("cancel");
        linkConfirmResolverRef.current = null;
      }
    };
  }, []);

  async function confirmManagerLinkWithDiff(
    skillId: string,
    tool: string,
  ): Promise<{ proceed: boolean; force: boolean; updateThenLink: boolean; cancelled?: boolean }> {
    if (!activeWorkspaceId || !tool) {
      return { proceed: false, force: false, updateThenLink: false };
    }
    const preview = await skillsManagerApi.linkPreview({
      workspaceId: activeWorkspaceId,
      skillId,
      tool,
      maxEntries: 24,
    });
    if (!preview.canLink) {
      toast({
        title: l("链接前检查失败", "Link precheck failed"),
        description: preview.message || l("当前目标不可链接", "Target cannot be linked"),
        variant: "destructive",
      });
      return { proceed: false, force: false, updateThenLink: false };
    }
    if (!preview.requiresConfirm) {
      return { proceed: true, force: false, updateThenLink: false };
    }
    const decision = await requestLinkConfirm(preview);
    if (decision === "cancel") {
      return { proceed: false, force: false, updateThenLink: false, cancelled: true };
    }
    if (decision === "update-then-link") {
      return { proceed: true, force: false, updateThenLink: true };
    }
    return { proceed: true, force: true, updateThenLink: false };
  }

  async function handleManagerLinkSkill(skillId: string, tool: string) {
    if (!activeWorkspaceId || !tool) {
      return;
    }
    try {
      const decision = await confirmManagerLinkWithDiff(skillId, tool);
      if (!decision.proceed) {
        if (decision.cancelled) {
          toast({
            title: l("已取消链接", "Link canceled"),
            description: l("你取消了差异处理链接。", "Diff link handling canceled."),
          });
        }
        return;
      }
      if (decision.updateThenLink) {
        const result = await skillsManagerApi.updateThenLink({
          workspaceId: activeWorkspaceId,
          skillId,
          tool,
        });
        await fetchSkills();
        await loadManagerState(activeWorkspaceId);
        toast({
          title: l("更新后链接完成", "Update then link completed"),
          description: result.message,
        });
        return;
      }
      await managerBatchLink(activeWorkspaceId, [skillId], tool, decision.force);
    } catch (error) {
      toast({
        title: l("补链失败", "Link failed"),
        description: error instanceof Error ? error.message : l("未知错误", "Unknown error"),
        variant: "destructive",
      });
    }
  }

  async function handleManagerPurgeSkill(skillId: string, _skillName: string) {
    if (!activeWorkspaceId) {
      toast({ title: projectBootingMessage, variant: "destructive" });
      return;
    }
    setManagerPurgingSkillId(skillId);
    try {
      const result = await skillsManagerApi.purge({
        workspaceId: activeWorkspaceId,
        skillId,
      });
      await fetchSkills();
      await loadManagerState(activeWorkspaceId);
      toast({
        title: l("清除完成", "Purge completed"),
        description: l(
          `${result.skillName} 已清除，处理 ${result.removedTools.length} 个链接目录。`,
          `${result.skillName} purged. ${result.removedTools.length} link targets cleaned.`,
        ),
      });
    } catch (error) {
      toast({
        title: l("清除失败", "Purge failed"),
        description: error instanceof Error ? error.message : l("未知错误", "Unknown error"),
        variant: "destructive",
      });
    } finally {
      setManagerPurgingSkillId(null);
    }
  }

  async function handleManagerUnlinkSkill(skillId: string, tool: string) {
    if (!activeWorkspaceId || !tool) {
      return;
    }
    try {
      await managerBatchUnlink(activeWorkspaceId, [skillId], tool);
    } catch (error) {
      toast({
        title: l("断链失败", "Unlink failed"),
        description: error instanceof Error ? error.message : l("未知错误", "Unknown error"),
        variant: "destructive",
      });
    }
  }

  const stopDiffPolling = useCallback(() => {
    if (diffPollTimerRef.current) {
      clearInterval(diffPollTimerRef.current);
      diffPollTimerRef.current = null;
    }
  }, []);

  const applyDiffProgress = useCallback(
    (progress: SkillsManagerDiffProgress, forceOpen = true) => {
      const running = DIFF_RUNNING_STATUSES.has(progress.status);
      const terminal = DIFF_TERMINAL_STATUSES.has(progress.status);
      setDiffView((prev) => ({
        open: forceOpen ? true : prev.open,
        status: progress.status,
        running,
        jobId: progress.jobId,
        leftSkillName: progress.leftSkillName,
        rightSkillName: progress.rightSkillName,
        processedFiles: progress.processedFiles,
        totalFiles: progress.totalFiles,
        currentFile: progress.currentFile,
        diffFiles: progress.diffFiles,
        sameSkill: progress.sameSkill,
        errorMessage: progress.errorMessage,
        entries: progress.entries,
      }));

      if (terminal) {
        stopDiffPolling();
        diffPollContextRef.current = null;
      }
    },
    [stopDiffPolling],
  );

  const pollDiffProgress = useCallback(
    async (workspaceId: string, jobId: string) => {
      try {
        const progress = await skillsManagerApi.diffProgress({ workspaceId, jobId });
        applyDiffProgress(progress, true);
      } catch (error) {
        stopDiffPolling();
        diffPollContextRef.current = null;
        setDiffView((prev) => ({
          ...prev,
          open: true,
          status: "failed",
          running: false,
          errorMessage: error instanceof Error ? error.message : l("读取 Diff 进度失败", "Failed to read diff progress"),
        }));
      }
    },
    [applyDiffProgress, l, stopDiffPolling],
  );

  const startDiffPolling = useCallback(
    (workspaceId: string, jobId: string) => {
      stopDiffPolling();
      diffPollContextRef.current = { workspaceId, jobId };
      diffPollTimerRef.current = setInterval(() => {
        void pollDiffProgress(workspaceId, jobId);
      }, 450);
    },
    [pollDiffProgress, stopDiffPolling],
  );

  useEffect(() => {
    return () => {
      stopDiffPolling();
    };
  }, [stopDiffPolling]);

  async function handleStartConflictDiff(leftSkillId: string, rightSkillId: string) {
    if (!activeWorkspaceId) {
      toast({ title: projectBootingMessage, variant: "destructive" });
      return;
    }

    const left = managerState?.skills.find((item) => item.id === leftSkillId);
    const right = managerState?.skills.find((item) => item.id === rightSkillId);
    setDiffView({
      ...createInitialDiffView(),
      open: true,
      status: "running",
      running: true,
      leftSkillName: left?.name ?? "",
      rightSkillName: right?.name ?? "",
    });

    try {
      const progress = await skillsManagerApi.diffStart({
        workspaceId: activeWorkspaceId,
        leftSkillId,
        rightSkillId,
      });
      applyDiffProgress(progress, true);
      if (DIFF_RUNNING_STATUSES.has(progress.status)) {
        startDiffPolling(activeWorkspaceId, progress.jobId);
      }
    } catch (error) {
      stopDiffPolling();
      diffPollContextRef.current = null;
      setDiffView((prev) => ({
        ...prev,
        open: true,
        status: "failed",
        running: false,
        errorMessage: error instanceof Error ? error.message : l("启动 Diff 失败", "Failed to start diff"),
      }));
      toast({
        title: l("启动 Diff 失败", "Failed to start diff"),
        description: error instanceof Error ? error.message : l("未知错误", "Unknown error"),
        variant: "destructive",
      });
    }
  }

  async function handleCancelDiff() {
    const context = diffPollContextRef.current;
    if (!context) {
      return;
    }
    try {
      const progress = await skillsManagerApi.diffCancel({
        workspaceId: context.workspaceId,
        jobId: context.jobId,
      });
      applyDiffProgress(progress, true);
    } catch (error) {
      toast({
        title: l("中断 Diff 失败", "Failed to cancel diff"),
        description: error instanceof Error ? error.message : l("未知错误", "Unknown error"),
        variant: "destructive",
      });
    }
  }

  function handleCloseDiff() {
    const context = diffPollContextRef.current;
    if (diffView.running && context) {
      void skillsManagerApi
        .diffCancel({
          workspaceId: context.workspaceId,
          jobId: context.jobId,
        })
        .catch(() => undefined);
    }
    stopDiffPolling();
    diffPollContextRef.current = null;
    setDiffView(createInitialDiffView());
  }

  async function handleOperationsDistribute(skillId: string, tools: string[]) {
    if (!activeWorkspaceId) {
      toast({ title: projectBootingMessage, variant: "destructive" });
      return;
    }
    const normalizedTools = Array.from(new Set(tools.filter(Boolean)));
    if (normalizedTools.length === 0) {
      toast({
        title: l("请至少选择一个目标目录", "Please select at least one target"),
        variant: "destructive",
      });
      return;
    }

    let linkedCount = 0;
    for (const tool of normalizedTools) {
      const decision = await confirmManagerLinkWithDiff(skillId, tool);
      if (!decision.proceed) {
        continue;
      }
      await managerBatchLink(activeWorkspaceId, [skillId], tool, decision.force);
      linkedCount += 1;
    }

    if (linkedCount === 0) {
      toast({
        title: l("已取消链接", "Link canceled"),
        description: l("没有任何目标执行链接。", "No target was linked."),
      });
    }
  }

  async function handleOperationsBulkLink(plans: Array<{ skillId: string; tools: string[] }>) {
    if (!activeWorkspaceId) {
      toast({ title: projectBootingMessage, variant: "destructive" });
      return;
    }

    const normalizedPlans = plans
      .map((plan) => ({
        skillId: plan.skillId,
        tools: Array.from(new Set(plan.tools.filter(Boolean))),
      }))
      .filter((plan) => plan.tools.length > 0);

    if (normalizedPlans.length === 0) {
      toast({
        title: l("当前没有可补链目标", "No link candidates"),
      });
      return;
    }

    let linkedSkillCount = 0;
    let linkedTargetCount = 0;

    for (const plan of normalizedPlans) {
      let skillLinked = false;
      for (const tool of plan.tools) {
        const decision = await confirmManagerLinkWithDiff(plan.skillId, tool);
        if (!decision.proceed) {
          continue;
        }
        await managerBatchLink(activeWorkspaceId, [plan.skillId], tool, decision.force);
        skillLinked = true;
        linkedTargetCount += 1;
      }
      if (skillLinked) {
        linkedSkillCount += 1;
      }
    }

    if (linkedTargetCount === 0) {
      toast({
        title: l("已取消全部 Link", "Link all canceled"),
        description: l("没有任何目标执行链接。", "No target was linked."),
      });
      return;
    }

    toast({
      title: l("全部 Link 完成", "Link all completed"),
      description: l(
        `已完成 ${linkedSkillCount} 个 Skill，${linkedTargetCount} 个目标目录`,
        `${linkedSkillCount} skills linked across ${linkedTargetCount} targets`,
      ),
    });
  }

  const linkConfirmDialog = (
    <SkillsLinkConfirmDialog
      l={l}
      preview={linkConfirmPreview}
      onDecision={settleLinkConfirm}
    />
  );

  return {
    diffView,
    managerPurgingSkillId,
    handleManagerLinkSkill,
    handleManagerPurgeSkill,
    handleManagerUnlinkSkill,
    handleStartConflictDiff,
    handleCancelDiff,
    handleCloseDiff,
    handleOperationsDistribute,
    handleOperationsBulkLink,
    linkConfirmDialog,
  };
}
