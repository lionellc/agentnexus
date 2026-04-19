import { useMemo, useState } from "react";

import type {
  SkillsManagerMatrixFilter,
  SkillsManagerMatrixSummary,
  SkillsManagerOperationsRow,
  SkillsUsageSyncJobSnapshot,
} from "../../../shared/types";

import { DistributionActions } from "./operations/DistributionActions";
import {
  isLinkCandidateStatus,
  statusToPreviewKind,
  type ActiveStatus,
  type SkillDistributionPreviewKind,
} from "./operations/helpers";
import { OperationsTable } from "./operations/OperationsTable";
import { UsageFilters } from "./operations/UsageFilters";

export type SkillsOperationsPanelProps = {
  rows: SkillsManagerOperationsRow[];
  matrixSummaries: SkillsManagerMatrixSummary[];
  matrixFilter: SkillsManagerMatrixFilter;
  usageAgentFilter: string;
  usageSourceFilter: string;
  usageStatsLoading: boolean;
  usageStatsError: string;
  usageSyncJob: SkillsUsageSyncJobSnapshot | null;
  expandedSkillId: string | null;
  runningDistribution: boolean;
  purgingSkillId: string | null;
  onMatrixFilterChange: (next: Partial<SkillsManagerMatrixFilter>) => void;
  onUsageFilterChange: (next: { agent?: string; source?: string }) => void;
  onUsageRefresh: () => Promise<void> | void;
  onToggleExpanded: (skillId: string | null) => void;
  onOpenSkillDetail: (skillId: string) => void;
  onRunDistribution: (skillId: string, tools: string[]) => Promise<void> | void;
  onRunBulkLink?: (plans: Array<{ skillId: string; tools: string[] }>) => Promise<void> | void;
  onRunLink: (skillId: string, tool: string) => Promise<void> | void;
  onRunUnlink: (skillId: string, tool: string) => Promise<void> | void;
  onPurgeSkill: (skillId: string, skillName: string) => Promise<void> | void;
  onDismissRowHint: (skillId: string) => void;
  onJumpToConfig: () => void;
  l: (zh: string, en: string) => string;
};

export function SkillsOperationsPanel({
  rows,
  matrixSummaries,
  matrixFilter,
  usageAgentFilter,
  usageSourceFilter,
  usageStatsLoading,
  usageStatsError,
  usageSyncJob,
  expandedSkillId,
  runningDistribution,
  purgingSkillId,
  onMatrixFilterChange,
  onUsageFilterChange,
  onUsageRefresh,
  onToggleExpanded,
  onOpenSkillDetail,
  onRunDistribution,
  onRunBulkLink,
  onRunLink,
  onRunUnlink,
  onPurgeSkill,
  onDismissRowHint,
  onJumpToConfig,
  l,
}: SkillsOperationsPanelProps) {
  const [activeStatus, setActiveStatus] = useState<ActiveStatus | null>(null);
  const [distributionSkillId, setDistributionSkillId] = useState<string | null>(null);
  const [distributionTargetIds, setDistributionTargetIds] = useState<string[]>([]);
  const [distributionPreviewLoading, setDistributionPreviewLoading] = useState(false);
  const [distributionSubmitLoading, setDistributionSubmitLoading] = useState(false);
  const [distributionPreviewItems, setDistributionPreviewItems] = useState<
    Array<{
      id: string;
      label: string;
      kind: SkillDistributionPreviewKind;
      retryable?: boolean;
      message?: string;
    }>
  >([]);
  const [bulkLinking, setBulkLinking] = useState(false);
  const [sortByUsage, setSortByUsage] = useState(false);

  const sortedRows = useMemo(() => {
    const list = [...rows];
    if (!sortByUsage) {
      return list;
    }
    list.sort(
      (left, right) =>
        right.totalCalls - left.totalCalls ||
        right.last7dCalls - left.last7dCalls ||
        left.name.localeCompare(right.name),
    );
    return list;
  }, [rows, sortByUsage]);

  const bulkLinkPlans = useMemo(
    () =>
      sortedRows
        .map((row) => ({
          skillId: row.id,
          tools: row.statusCells
            .filter((cell) => isLinkCandidateStatus(cell.status))
            .map((cell) => cell.tool),
        }))
        .filter((item) => item.tools.length > 0),
    [sortedRows],
  );

  const distributionRow = useMemo(
    () => sortedRows.find((row) => row.id === distributionSkillId) ?? null,
    [sortedRows, distributionSkillId],
  );

  function openDistributionForRow(row: SkillsManagerOperationsRow) {
    const defaults = row.statusCells
      .filter((cell) => isLinkCandidateStatus(cell.status))
      .map((cell) => cell.tool);
    setDistributionSkillId(row.id);
    setDistributionTargetIds(defaults);
    setDistributionPreviewItems([]);
  }

  async function handleRequestPreview() {
    if (!distributionRow) {
      return;
    }
    setDistributionPreviewLoading(true);
    try {
      const previewItems = distributionTargetIds.map((tool) => {
        const status = distributionRow.statusCells.find((cell) => cell.tool === tool)?.status ?? "missing";
        const kind = statusToPreviewKind(status);
        const retryable = kind === "conflict" || kind === "error";
        let message = "";
        if (status === "wrong") {
          message = l("检测到错误链接，将尝试覆盖。", "Wrong link detected and will be replaced.");
        } else if (status === "directory") {
          message = l(
            "检测到同名文件/目录，将替换为软链接。",
            "Same name file/folder detected and will be replaced with symlink.",
          );
        } else if (status === "blocked") {
          message = l("该目标被规则阻断，无法执行链接。", "This target is blocked by rules.");
        }
        return {
          id: `${distributionRow.id}:${tool}`,
          label: tool,
          kind,
          retryable,
          message,
        };
      });
      setDistributionPreviewItems(previewItems);
    } finally {
      setDistributionPreviewLoading(false);
    }
  }

  async function handleSubmitDistribution() {
    if (!distributionRow || distributionTargetIds.length === 0) {
      return;
    }
    setDistributionSubmitLoading(true);
    try {
      await onRunDistribution(distributionRow.id, distributionTargetIds);
      setDistributionSkillId(null);
      setDistributionTargetIds([]);
      setDistributionPreviewItems([]);
    } finally {
      setDistributionSubmitLoading(false);
    }
  }

  async function handleBulkLink() {
    if (!onRunBulkLink || bulkLinkPlans.length === 0 || bulkLinking || runningDistribution) {
      return;
    }
    setBulkLinking(true);
    try {
      await onRunBulkLink(bulkLinkPlans);
    } finally {
      setBulkLinking(false);
    }
  }

  return (
    <div className="space-y-4">
      <UsageFilters
        l={l}
        usageAgentFilter={usageAgentFilter}
        usageSourceFilter={usageSourceFilter}
        usageStatsLoading={usageStatsLoading}
        usageStatsError={usageStatsError}
        usageSyncJob={usageSyncJob}
        sortByUsage={sortByUsage}
        onToggleSortByUsage={() => setSortByUsage((prev) => !prev)}
        onUsageFilterChange={onUsageFilterChange}
        onUsageRefresh={onUsageRefresh}
        onBulkLink={onRunBulkLink ? handleBulkLink : undefined}
        bulkLinkEnabled={bulkLinkPlans.length > 0}
        bulkLinking={bulkLinking}
        runningDistribution={runningDistribution}
      />

      <OperationsTable
        l={l}
        rows={sortedRows}
        matrixSummaries={matrixSummaries}
        matrixFilter={matrixFilter}
        expandedSkillId={expandedSkillId}
        purgingSkillId={purgingSkillId}
        onMatrixFilterChange={onMatrixFilterChange}
        onToggleExpanded={onToggleExpanded}
        onOpenSkillDetail={onOpenSkillDetail}
        onRunLink={onRunLink}
        onRunUnlink={onRunUnlink}
        onPurgeSkill={onPurgeSkill}
        onDismissRowHint={onDismissRowHint}
        onJumpToConfig={onJumpToConfig}
        onOpenDistributionForRow={openDistributionForRow}
        onOpenStatus={(row, tool, status) => setActiveStatus({ row, tool, status })}
      />

      <DistributionActions
        l={l}
        distributionRow={distributionRow}
        distributionTargetIds={distributionTargetIds}
        distributionPreviewItems={distributionPreviewItems}
        distributionPreviewLoading={distributionPreviewLoading}
        distributionSubmitLoading={distributionSubmitLoading}
        runningDistribution={runningDistribution}
        onDistributionOpenChange={(open) => {
          if (!open) {
            setDistributionSkillId(null);
            setDistributionTargetIds([]);
            setDistributionPreviewItems([]);
          }
        }}
        onDistributionTargetIdsChange={setDistributionTargetIds}
        onRequestPreview={handleRequestPreview}
        onSubmitDistribution={handleSubmitDistribution}
        activeStatus={activeStatus}
        onActiveStatusChange={setActiveStatus}
        onRunLink={onRunLink}
        onRunUnlink={onRunUnlink}
        onOpenSkillDetail={onOpenSkillDetail}
        onOpenDistributionForRow={openDistributionForRow}
      />
    </div>
  );
}
