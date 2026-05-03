import type {
  SkillManagerStatus,
  SkillsManagerOperationsRow,
  SkillsUsageSyncJobSnapshot,
} from "../../../../shared/types";

export type SkillDistributionPreviewKind = "safe" | "conflict" | "error";

export type ActiveStatus = {
  row: SkillsManagerOperationsRow;
  tool: string;
  status: SkillManagerStatus;
};

export const OPERATIONS_PAGE_SIZE = 10;

export type SkillStatusTagColor = "green" | "orange" | "red" | "grey";

export function isPendingLinkStatus(status: SkillManagerStatus): boolean {
  return status === "wrong" || status === "directory";
}

export function isLinkCandidateStatus(status: SkillManagerStatus): boolean {
  return (
    status === "missing" ||
    status === "manual" ||
    status === "wrong" ||
    status === "directory"
  );
}

export function statusTagColor(status: SkillManagerStatus): SkillStatusTagColor {
  if (status === "linked") {
    return "green";
  }
  if (isPendingLinkStatus(status) || status === "manual") {
    return "orange";
  }
  if (status === "blocked") {
    return "red";
  }
  return "grey";
}

export function statusLabel(status: SkillManagerStatus, l: (zh: string, en: string) => string): string {
  if (status === "linked") {
    return l("已链接", "Linked");
  }
  if (status === "missing") {
    return l("缺失", "Missing");
  }
  if (isPendingLinkStatus(status)) {
    return l("待链接", "Pending Link");
  }
  if (status === "manual") {
    return l("手动断链", "Manual Unlink");
  }
  if (status === "blocked") {
    return l("规则阻断", "Blocked");
  }
  return l("缺失", "Missing");
}

export function statusToPreviewKind(status: SkillManagerStatus): SkillDistributionPreviewKind {
  if (status === "linked" || status === "missing" || status === "manual") {
    return "safe";
  }
  if (isPendingLinkStatus(status)) {
    return "conflict";
  }
  return "error";
}

export function usageProgressPercent(job: SkillsUsageSyncJobSnapshot | null): number {
  if (!job || job.totalFiles <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round((job.processedFiles / job.totalFiles) * 100)));
}

export function formatLastCalled(lastCalledAt: string | null): string {
  if (!lastCalledAt) {
    return "--";
  }
  const parsed = new Date(lastCalledAt);
  if (Number.isNaN(parsed.getTime())) {
    return lastCalledAt;
  }
  return parsed.toLocaleString();
}

export function buildStatusSummaryLines(
  row: SkillsManagerOperationsRow,
  status: SkillManagerStatus,
  targetLabel: string,
  l: (zh: string, en: string) => string,
): string[] {
  if (status === "linked") {
    const lines = [
      `${l("目标", "Target")}: ${targetLabel}`,
      l("状态正常，软链已就绪。", "The symlink is healthy."),
      `${l("技能目录", "Skill path")}: ${row.localPath}`,
    ];
    if (row.sourceMissing) {
      lines.push(l("源目录已不存在，可使用清除操作移除记录。", "Source directory is missing. Purge to remove record."));
    }
    return lines;
  }
  if (status === "wrong") {
    const lines = [
      `${l("目标", "Target")}: ${targetLabel}`,
      l("该平台下存在同名项，但没有链接到当前技能源。", "Same skill exists on this platform but not linked to current source."),
      l("链接操作会覆盖为当前技能源的软链接。", "Link will replace it with symlink to current source."),
    ];
    if (row.sourceMissing) {
      lines.push(l("源目录已不存在，可使用清除操作移除记录。", "Source directory is missing. Purge to remove record."));
    }
    return lines;
  }
  if (status === "directory") {
    const lines = [
      `${l("目标", "Target")}: ${targetLabel}`,
      l("该平台下存在同名文件/目录，但不是当前技能链接。", "Same name file/folder exists, but not current skill link."),
      l("链接操作会替换为当前技能源的软链接。", "Link will replace it with symlink to current source."),
      `${l("技能目录", "Skill path")}: ${row.localPath}`,
    ];
    if (row.sourceMissing) {
      lines.push(l("源目录已不存在，可使用清除操作移除记录。", "Source directory is missing. Purge to remove record."));
    }
    return lines;
  }
  if (status === "manual") {
    const lines = [
      `${l("目标", "Target")}: ${targetLabel}`,
      l("该目标执行过手动断链，当前没有链接。", "This target was manually unlinked and currently has no link."),
      `${l("技能目录", "Skill path")}: ${row.localPath}`,
    ];
    if (row.sourceMissing) {
      lines.push(l("源目录已不存在，可使用清除操作移除记录。", "Source directory is missing. Purge to remove record."));
    }
    return lines;
  }
  if (status === "blocked") {
    const lines = [
      `${l("目标", "Target")}: ${targetLabel}`,
      l("当前被规则阻断，需先调整规则后再链接。", "Blocked by rules, update rules before linking."),
      `${l("技能目录", "Skill path")}: ${row.localPath}`,
    ];
    if (row.sourceMissing) {
      lines.push(l("源目录已不存在，可使用清除操作移除记录。", "Source directory is missing. Purge to remove record."));
    }
    return lines;
  }
  const lines = [
    `${l("目标", "Target")}: ${targetLabel}`,
    l("该平台下缺少这个技能，可直接补链。", "This skill is missing on this platform and can be linked directly."),
    `${l("技能目录", "Skill path")}: ${row.localPath}`,
  ];
  if (row.sourceMissing) {
    lines.push(l("源目录已不存在，可使用清除操作移除记录。", "Source directory is missing. Purge to remove record."));
  }
  return lines;
}
