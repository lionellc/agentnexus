import { useMemo } from "react";

import type { SkillsConfigConflictPair, SkillsConfigGroup } from "../../../features/skills/components/SkillsConfigPanel";
import type { SkillManagerStatus, SkillsManagerMatrixSummary } from "../../../shared/types";

type SkillsManagerSkill = {
  id: string;
  name: string;
  localPath: string;
  conflict?: boolean;
  statusByTool: Record<string, SkillManagerStatus>;
};

type SkillListItem = {
  id: string;
  name: string;
  identity: string;
  source: string;
  sourceParent: string;
  sourceLocalPath?: string;
  localPath: string;
  sourceIsSymlink?: boolean;
  isSymlink: boolean;
};

type UseWorkbenchSkillsDerivedDataInput = {
  skills: SkillListItem[];
  skillQuery: string;
  activeWorkspaceRootPath: string;
  selectedSkillScanDirectories: string[];
  normalizeDirectoryInput: (input: string) => string;
  getManagerOperationsRows: () => any[];
  managerMatrixFilter: { tool?: string | null; status: "all" | "missing" | SkillManagerStatus };
  managerState: { skills?: SkillsManagerSkill[] } | null;
  managerRowHints: unknown;
};

function isPendingSkillStatus(status: SkillManagerStatus): boolean {
  return status === "missing" || status === "manual" || status === "directory" || status === "blocked";
}

export function useWorkbenchSkillsDerivedData({
  skills,
  skillQuery,
  activeWorkspaceRootPath,
  selectedSkillScanDirectories,
  normalizeDirectoryInput,
  getManagerOperationsRows,
  managerMatrixFilter,
  managerState,
  managerRowHints,
}: UseWorkbenchSkillsDerivedDataInput) {
  const filteredSkills = useMemo(() => {
    const lower = skillQuery.trim().toLowerCase();
    return skills.filter((item) => {
      if (!lower) {
        return true;
      }
      return (
        item.name.toLowerCase().includes(lower) ||
        item.identity.toLowerCase().includes(lower) ||
        item.source.toLowerCase().includes(lower) ||
        item.sourceParent.toLowerCase().includes(lower)
      );
    });
  }, [skills, skillQuery]);

  const operationsScanDirectories = useMemo(() => {
    const root = normalizeDirectoryInput(activeWorkspaceRootPath);
    if (!root) {
      return [] as string[];
    }
    const projectSkillsDir = normalizeDirectoryInput(`${root}/skills`);
    return projectSkillsDir ? [projectSkillsDir] : [];
  }, [activeWorkspaceRootPath, normalizeDirectoryInput]);

  const filteredSkillIdSet = useMemo(
    () => new Set(filteredSkills.map((item) => item.id)),
    [filteredSkills],
  );

  const scanSourceDirectories = useMemo(
    () =>
      selectedSkillScanDirectories
        .map((item) => normalizeDirectoryInput(item))
        .filter(Boolean),
    [normalizeDirectoryInput, selectedSkillScanDirectories],
  );

  const scanScopedSkills = useMemo(() => {
    if (scanSourceDirectories.length === 0) {
      return [] as typeof filteredSkills;
    }
    return filteredSkills.filter((skill) => {
      const source = normalizeDirectoryInput(skill.source);
      if (!source) {
        return false;
      }
      return scanSourceDirectories.some(
        (directory) =>
          source === directory ||
          source.startsWith(`${directory}/`) ||
          source.startsWith(`${directory}\\`),
      );
    });
  }, [filteredSkills, normalizeDirectoryInput, scanSourceDirectories]);

  const scanScopedSkillIdSet = useMemo(
    () => new Set(scanScopedSkills.map((item) => item.id)),
    [scanScopedSkills],
  );

  const operationsSourceRows = useMemo<any[]>(
    () => getManagerOperationsRows().filter((row) => filteredSkillIdSet.has(row.id)),
    [getManagerOperationsRows, managerState, managerRowHints, filteredSkillIdSet],
  );

  const operationsRows = useMemo<any[]>(() => {
    const tool = managerMatrixFilter.tool;
    const status = managerMatrixFilter.status;
    return operationsSourceRows.filter((row) => {
      if (status === "all") {
        if (!tool) {
          return true;
        }
        return row.statusCells.some((cell: any) => cell.tool === tool);
      }
      if (status === "missing") {
        if (!tool) {
          return row.statusCells.some((cell: any) => isPendingSkillStatus(cell.status));
        }
        return row.statusCells.some((cell: any) => cell.tool === tool && isPendingSkillStatus(cell.status));
      }
      if (!tool) {
        return row.statusCells.some((cell: any) => cell.status === status);
      }
      return row.statusCells.some((cell: any) => cell.tool === tool && cell.status === status);
    });
  }, [operationsSourceRows, managerMatrixFilter]);

  const operationsMatrixSummaries = useMemo<SkillsManagerMatrixSummary[]>(() => {
    const byTool = new Map<string, SkillsManagerMatrixSummary>();
    for (const row of operationsSourceRows) {
      for (const cell of row.statusCells) {
        const summary = byTool.get(cell.tool) ?? {
          tool: cell.tool,
          linked: 0,
          missing: 0,
          blocked: 0,
          wrong: 0,
          directory: 0,
          manual: 0,
          total: 0,
          issueCount: 0,
        };
        if (cell.status === "linked") {
          summary.linked += 1;
        } else if (cell.status === "wrong") {
          summary.wrong += 1;
        } else if (isPendingSkillStatus(cell.status)) {
          summary.missing += 1;
        }
        byTool.set(cell.tool, summary);
      }
    }
    const list = Array.from(byTool.values()).map((item) => {
      const total = item.linked + item.missing + item.wrong;
      return {
        ...item,
        blocked: 0,
        directory: 0,
        manual: 0,
        total,
        issueCount: total - item.linked,
      };
    });
    return list.sort((left, right) => left.tool.localeCompare(right.tool));
  }, [operationsSourceRows]);

  const managerSkillById = useMemo(
    () => new Map((managerState?.skills ?? []).map((item) => [item.id, item])),
    [managerState?.skills],
  );

  const scanGroups = useMemo<SkillsConfigGroup[]>(() => {
    const grouped = new Map<string, SkillsConfigGroup>();
    for (const skill of scanScopedSkills) {
      const rawKey = skill.sourceParent.trim();
      const sourceParts = skill.source
        .split(/[\\/]/)
        .map((part) => part.trim())
        .filter(Boolean);
      const fallbackKey = sourceParts[sourceParts.length - 2] ?? sourceParts[sourceParts.length - 1] ?? "default";
      const key = rawKey || fallbackKey;
      const group = grouped.get(key) ?? {
        key,
        label: key,
        total: 0,
        pendingCount: 0,
        items: [],
      };
      const managerSkill = managerSkillById.get(skill.id);
      const statusList = managerSkill ? Object.values(managerSkill.statusByTool) : [];
      const pending = managerSkill
        ? Boolean(managerSkill.conflict) || statusList.some((status) => status !== "linked")
        : true;

      group.total += 1;
      if (pending) {
        group.pendingCount += 1;
      }
      group.items.push({
        id: skill.id,
        name: skill.name,
        localPath: skill.sourceLocalPath ?? skill.localPath,
        conflict: Boolean(managerSkill?.conflict),
        isSymlink: skill.sourceIsSymlink ?? skill.isSymlink,
      });
      grouped.set(key, group);
    }

    return Array.from(grouped.values())
      .map((group) => ({
        ...group,
        items: [...group.items].sort((left, right) => left.name.localeCompare(right.name)),
      }))
      .sort((left, right) => left.label.localeCompare(right.label));
  }, [managerSkillById, scanScopedSkills]);

  const conflictPairs = useMemo<SkillsConfigConflictPair[]>(() => {
    const rows = (managerState?.skills ?? []).filter((skill) => scanScopedSkillIdSet.has(skill.id));
    const conflictGroups = new Map<string, typeof rows>();
    for (const row of rows) {
      if (!row.conflict) {
        continue;
      }
      const current = conflictGroups.get(row.name) ?? [];
      current.push(row);
      conflictGroups.set(row.name, current);
    }

    const pairs: SkillsConfigConflictPair[] = [];
    for (const [name, list] of conflictGroups.entries()) {
      if (list.length < 2) {
        continue;
      }
      const sorted = [...list].sort((left, right) => left.localPath.localeCompare(right.localPath));
      const pivot = sorted[0];
      for (let index = 1; index < sorted.length; index += 1) {
        const right = sorted[index];
        pairs.push({
          key: `${name}:${pivot.id}:${right.id}`,
          name,
          left: { id: pivot.id, localPath: pivot.localPath },
          right: { id: right.id, localPath: right.localPath },
        });
      }
    }
    return pairs.sort((left, right) => left.name.localeCompare(right.name));
  }, [managerState?.skills, scanScopedSkillIdSet]);

  return {
    filteredSkills,
    operationsScanDirectories,
    operationsRows,
    operationsMatrixSummaries,
    scanGroups,
    conflictPairs,
  };
}
