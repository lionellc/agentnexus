import { useMemo } from "react";

import { buildLineDiff } from "../../../shared/utils/diff";
import type { PromptAsset } from "../../../shared/types";

type PromptVersionItem = {
  version: number;
  content: string;
  createdAt: string;
};

type UsePromptVersionCompareInput = {
  selectedPrompt: PromptAsset | null;
  promptVersionsByPromptId: Record<string, PromptVersionItem[]>;
  promptVersionPreview: number | null;
  compareLeftVersion: number | null;
  compareRightVersion: number | null;
};

export function usePromptVersionCompare({
  selectedPrompt,
  promptVersionsByPromptId,
  promptVersionPreview,
  compareLeftVersion,
  compareRightVersion,
}: UsePromptVersionCompareInput) {
  const selectedPromptVersions = selectedPrompt ? promptVersionsByPromptId[selectedPrompt.id] ?? [] : [];

  const selectedPromptPreviewVersion = useMemo(
    () =>
      promptVersionPreview === null
        ? null
        : selectedPromptVersions.find((item) => item.version === promptVersionPreview) ?? null,
    [selectedPromptVersions, promptVersionPreview],
  );

  const promptDiffLines = useMemo(() => {
    if (!selectedPrompt || compareLeftVersion === null || compareRightVersion === null) {
      return [];
    }
    const left = selectedPromptVersions.find((item) => item.version === compareLeftVersion);
    const right = selectedPromptVersions.find((item) => item.version === compareRightVersion);
    if (!left || !right) {
      return [];
    }
    return buildLineDiff(left.content, right.content);
  }, [selectedPrompt, selectedPromptVersions, compareLeftVersion, compareRightVersion]);

  const promptCompareLeft = useMemo(
    () =>
      compareLeftVersion === null
        ? null
        : selectedPromptVersions.find((item) => item.version === compareLeftVersion) ?? null,
    [selectedPromptVersions, compareLeftVersion],
  );

  const promptCompareRight = useMemo(
    () =>
      compareRightVersion === null
        ? null
        : selectedPromptVersions.find((item) => item.version === compareRightVersion) ?? null,
    [selectedPromptVersions, compareRightVersion],
  );

  const promptDiffStats = useMemo(
    () =>
      promptDiffLines.reduce(
        (acc, line) => {
          if (line.type === "added") {
            acc.added += 1;
          }
          if (line.type === "removed") {
            acc.removed += 1;
          }
          return acc;
        },
        { added: 0, removed: 0 },
      ),
    [promptDiffLines],
  );

  return {
    selectedPromptVersions,
    selectedPromptPreviewVersion,
    promptCompareLeft,
    promptCompareRight,
    promptDiffStats,
  };
}
