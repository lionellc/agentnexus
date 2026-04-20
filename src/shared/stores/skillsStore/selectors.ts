import { MANAGER_STATUS_LIST } from "./constants";
import type { OptimisticMap } from "./types";
import type {
  SkillManagerStatus,
  SkillsManagerMatrixFilter,
  SkillsManagerMatrixSummary,
  SkillsManagerOperationsRow,
  SkillsManagerState,
  SkillsUsageStatsRow,
  SkillsUsageSyncJobSnapshot,
} from "../../types";

export function normalizeUsageFilter(value: string | undefined | null): string | undefined {
  const normalized = value?.trim() ?? "";
  return normalized ? normalized : undefined;
}

export function isUsageSyncRunning(job: SkillsUsageSyncJobSnapshot | null): boolean {
  return job?.status === "running";
}

export function nextManagerStateWithPatch(
  managerState: SkillsManagerState | null,
  skillIds: string[],
  tool: string,
  status: SkillManagerStatus,
): SkillsManagerState | null {
  if (!managerState || skillIds.length === 0 || !tool) {
    return managerState;
  }

  const selected = new Set(skillIds);
  return {
    ...managerState,
    skills: managerState.skills.map((skill) =>
      selected.has(skill.id)
        ? {
            ...skill,
            statusByTool: {
              ...skill.statusByTool,
              [tool]: status,
            },
          }
        : skill,
    ),
  };
}

export function mergeOptimisticMap(
  previous: OptimisticMap,
  skillIds: string[],
  tool: string,
  status: SkillManagerStatus,
): OptimisticMap {
  if (skillIds.length === 0 || !tool) {
    return previous;
  }

  const next: OptimisticMap = { ...previous };
  for (const skillId of skillIds) {
    next[skillId] = {
      ...(next[skillId] ?? {}),
      [tool]: status,
    };
  }
  return next;
}

export function buildCalibrationHints(
  managerState: SkillsManagerState | null,
  optimisticMap: OptimisticMap,
): Record<string, string> {
  if (!managerState) {
    return {};
  }

  const byId = new Map(managerState.skills.map((skill) => [skill.id, skill]));
  const hints: Record<string, string> = {};

  for (const [skillId, expectedByTool] of Object.entries(optimisticMap)) {
    const skill = byId.get(skillId);
    if (!skill) {
      continue;
    }

    const mismatchedTools = Object.entries(expectedByTool)
      .filter(([tool, expected]) => (skill.statusByTool[tool] ?? "missing") !== expected)
      .map(([tool]) => tool);
    if (mismatchedTools.length > 0) {
      hints[skillId] = `校准后状态不一致：${mismatchedTools.join(", ")}`;
    }
  }

  return hints;
}

export function toOperationsRows(
  managerState: SkillsManagerState | null,
  rowHints: Record<string, string>,
  usageStatsBySkillId: Record<string, SkillsUsageStatsRow>,
): SkillsManagerOperationsRow[] {
  if (!managerState) {
    return [];
  }

  return [...managerState.skills]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((skill) => {
      const statusCells = managerState.tools.map((tool) => ({
        tool: tool.tool,
        status: (skill.statusByTool[tool.tool] ?? "missing") as SkillManagerStatus,
      }));
      const linkedCount = statusCells.filter((item) => item.status === "linked").length;
      const totalCount = statusCells.length;
      const sourceMissing = Boolean(skill.sourceMissing);
      const issueCount = totalCount - linkedCount + (sourceMissing ? 1 : 0);
      const usageStats = usageStatsBySkillId[skill.id];

      return {
        id: skill.id,
        name: skill.name,
        group: skill.group,
        source: skill.source,
        localPath: skill.localPath,
        createdAt: skill.createdAt ?? null,
        sourceMissing,
        conflict: skill.conflict,
        linkedCount,
        totalCount,
        issueCount,
        statusCells,
        statusPreview: statusCells.slice(0, 3),
        hiddenStatusCount: Math.max(0, statusCells.length - 3),
        totalCalls: usageStats?.totalCalls ?? 0,
        last7dCalls: usageStats?.last7dCalls ?? 0,
        lastCalledAt: usageStats?.lastCalledAt ?? null,
        rowHint: rowHints[skill.id],
      };
    });
}

export function toMatrixSummaries(
  managerState: SkillsManagerState | null,
): SkillsManagerMatrixSummary[] {
  if (!managerState) {
    return [];
  }

  return managerState.tools.map((tool) => {
    const counts: Record<SkillManagerStatus, number> = {
      linked: 0,
      missing: 0,
      blocked: 0,
      wrong: 0,
      directory: 0,
      manual: 0,
    };

    for (const skill of managerState.skills) {
      const status = (skill.statusByTool[tool.tool] ?? "missing") as SkillManagerStatus;
      counts[status] += 1;
    }

    const total = managerState.skills.length;
    const issueCount = total - counts.linked;

    return {
      tool: tool.tool,
      linked: counts.linked,
      missing: counts.missing,
      blocked: counts.blocked,
      wrong: counts.wrong,
      directory: counts.directory,
      manual: counts.manual,
      total,
      issueCount,
    };
  });
}

export function applyOperationsFilters(
  rows: SkillsManagerOperationsRow[],
  managerStatusFilter: "all" | SkillManagerStatus,
  matrixFilter: SkillsManagerMatrixFilter,
): SkillsManagerOperationsRow[] {
  const statusMatches = (current: SkillManagerStatus, expected: SkillManagerStatus | "all") =>
    expected === "all"
      ? true
      : expected === "wrong"
        ? current === "wrong" || current === "directory"
        : current === expected;

  return rows.filter((row) => {
    if (
      managerStatusFilter !== "all" &&
      !row.statusCells.some((item) => statusMatches(item.status, managerStatusFilter))
    ) {
      return false;
    }

    if (matrixFilter.status === "all") {
      if (!matrixFilter.tool) {
        return true;
      }
      return row.statusCells.some((item) => item.tool === matrixFilter.tool);
    }

    if (!matrixFilter.tool) {
      return row.statusCells.some((item) => statusMatches(item.status, matrixFilter.status));
    }

    return row.statusCells.some(
      (item) => item.tool === matrixFilter.tool && statusMatches(item.status, matrixFilter.status),
    );
  });
}

export function skillManagerStatusLabel(status: SkillManagerStatus): string {
  return status;
}

export function skillManagerStatusSortWeight(status: SkillManagerStatus): number {
  const index = MANAGER_STATUS_LIST.indexOf(status);
  return index < 0 ? MANAGER_STATUS_LIST.length : index;
}
