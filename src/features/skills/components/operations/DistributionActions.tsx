import { SkillDistributionDialog } from "../SkillDistributionDialog";
import { SkillStatusPopover } from "../SkillStatusPopover";

import {
  buildStatusSummaryLines,
  isLinkCandidateStatus,
  type ActiveStatus,
  type SkillDistributionPreviewKind,
} from "./helpers";
import type { SkillsManagerOperationsRow } from "../../../../shared/types";

type DistributionActionsProps = {
  l: (zh: string, en: string) => string;
  distributionRow: SkillsManagerOperationsRow | null;
  distributionTargetIds: string[];
  distributionPreviewItems: Array<{
    id: string;
    label: string;
    kind: SkillDistributionPreviewKind;
    retryable?: boolean;
    message?: string;
  }>;
  distributionPreviewLoading: boolean;
  distributionSubmitLoading: boolean;
  runningDistribution: boolean;
  onDistributionOpenChange: (open: boolean) => void;
  onDistributionTargetIdsChange: (ids: string[]) => void;
  onRequestPreview: () => Promise<void> | void;
  onSubmitDistribution: () => Promise<void> | void;
  activeStatus: ActiveStatus | null;
  onActiveStatusChange: (status: ActiveStatus | null) => void;
  onRunLink: (skillId: string, tool: string) => Promise<void> | void;
  onRunUnlink: (skillId: string, tool: string) => Promise<void> | void;
  onOpenSkillDetail: (skillId: string) => void;
  onOpenDistributionForRow: (row: SkillsManagerOperationsRow) => void;
};

export function DistributionActions({
  l,
  distributionRow,
  distributionTargetIds,
  distributionPreviewItems,
  distributionPreviewLoading,
  distributionSubmitLoading,
  runningDistribution,
  onDistributionOpenChange,
  onDistributionTargetIdsChange,
  onRequestPreview,
  onSubmitDistribution,
  activeStatus,
  onActiveStatusChange,
  onRunLink,
  onRunUnlink,
  onOpenSkillDetail,
  onOpenDistributionForRow,
}: DistributionActionsProps) {
  return (
    <>
      <SkillDistributionDialog
        open={distributionRow !== null}
        onOpenChange={onDistributionOpenChange}
        l={l}
        skillName={distributionRow?.name ?? "-"}
        targets={(distributionRow?.statusCells ?? []).map((cell) => ({
          id: cell.tool,
          label: cell.tool,
          defaultSelected: isLinkCandidateStatus(cell.status),
        }))}
        selectedTargetIds={distributionTargetIds}
        onSelectedTargetIdsChange={onDistributionTargetIdsChange}
        previewItems={distributionPreviewItems}
        onRequestPreview={onRequestPreview}
        previewLoading={distributionPreviewLoading}
        submitLoading={distributionSubmitLoading || runningDistribution}
        onSubmit={onSubmitDistribution}
      />

      <SkillStatusPopover
        open={activeStatus !== null}
        onOpenChange={(open) => {
          if (!open) {
            onActiveStatusChange(null);
          }
        }}
        skillName={activeStatus?.row.name ?? ""}
        targetLabel={activeStatus?.tool ?? ""}
        status={activeStatus?.status ?? "missing"}
        summaryLines={
          activeStatus
            ? buildStatusSummaryLines(activeStatus.row, activeStatus.status, activeStatus.tool, l)
            : []
        }
        primaryAction={
          activeStatus?.status === "linked"
            ? {
                label: l("执行断链", "Unlink"),
                onClick: () => {
                  if (activeStatus) {
                    void onRunUnlink(activeStatus.row.id, activeStatus.tool);
                    onActiveStatusChange(null);
                  }
                },
              }
            : {
                label: l("执行补链", "Link"),
                onClick: () => {
                  if (activeStatus) {
                    void onRunLink(activeStatus.row.id, activeStatus.tool);
                    onActiveStatusChange(null);
                  }
                },
              }
        }
        secondaryActions={
          activeStatus
            ? [
                {
                  key: "detail",
                  label: l("查看详情", "Open Detail"),
                  onClick: () => {
                    onOpenSkillDetail(activeStatus.row.id);
                    onActiveStatusChange(null);
                  },
                },
                {
                  key: "distribute",
                  label: l("打开链接向导", "Open Link Wizard"),
                  onClick: () => {
                    onOpenDistributionForRow(activeStatus.row);
                    onActiveStatusChange(null);
                  },
                },
              ]
            : []
        }
        l={l}
      />
    </>
  );
}
