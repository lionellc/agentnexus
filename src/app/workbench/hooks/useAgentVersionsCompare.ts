import { useMemo, useState } from "react";

import type { AgentRuleVersion } from "../../../shared/stores/agentRulesStore/types";
import { buildLineDiff } from "../../../shared/utils/diff";

type UseAgentVersionsCompareInput = {
  selectedAssetId: string | null;
  agentVersionsByAsset: Record<string, AgentRuleVersion[]>;
};

export function useAgentVersionsCompare({
  selectedAssetId,
  agentVersionsByAsset,
}: UseAgentVersionsCompareInput) {
  const [agentCompareLeftVersion, setAgentCompareLeftVersion] = useState("");
  const [agentCompareRightVersion, setAgentCompareRightVersion] = useState("");
  const [agentVersionPreview, setAgentVersionPreview] = useState("");
  const [agentVersionCompareMode, setAgentVersionCompareMode] = useState(false);

  const selectedAgentVersions = useMemo(
    () => (selectedAssetId ? agentVersionsByAsset[selectedAssetId] ?? [] : []),
    [agentVersionsByAsset, selectedAssetId],
  );

  const selectedAgentPreviewVersion = useMemo(
    () =>
      agentVersionPreview
        ? selectedAgentVersions.find((item) => String(item.version) === agentVersionPreview) ?? null
        : null,
    [agentVersionPreview, selectedAgentVersions],
  );

  const agentCompareLeft = useMemo(
    () =>
      agentCompareLeftVersion
        ? selectedAgentVersions.find((item) => String(item.version) === agentCompareLeftVersion) ?? null
        : null,
    [agentCompareLeftVersion, selectedAgentVersions],
  );

  const agentCompareRight = useMemo(
    () =>
      agentCompareRightVersion
        ? selectedAgentVersions.find((item) => String(item.version) === agentCompareRightVersion) ?? null
        : null,
    [agentCompareRightVersion, selectedAgentVersions],
  );

  const agentVersionDiffLines = useMemo(() => {
    if (!selectedAssetId || !agentCompareLeftVersion || !agentCompareRightVersion) {
      return [];
    }
    return buildLineDiff(agentCompareLeft?.content ?? "", agentCompareRight?.content ?? "");
  }, [
    agentCompareLeft,
    agentCompareLeftVersion,
    agentCompareRight,
    agentCompareRightVersion,
    selectedAssetId,
  ]);

  const agentDiffStats = useMemo(
    () =>
      agentVersionDiffLines.reduce(
        (stats, line) => {
          if (line.type === "added") {
            stats.added += 1;
          } else if (line.type === "removed") {
            stats.removed += 1;
          }
          return stats;
        },
        { added: 0, removed: 0 },
      ),
    [agentVersionDiffLines],
  );

  function toggleAgentCompareCandidate(version: string) {
    if (agentCompareLeftVersion === version) {
      setAgentCompareLeftVersion("");
      return;
    }
    if (agentCompareRightVersion === version) {
      setAgentCompareRightVersion("");
      return;
    }
    if (!agentCompareLeftVersion) {
      setAgentCompareLeftVersion(version);
      return;
    }
    if (!agentCompareRightVersion) {
      setAgentCompareRightVersion(version);
      return;
    }
    setAgentCompareLeftVersion(agentCompareRightVersion);
    setAgentCompareRightVersion(version);
  }

  return {
    agentCompareLeftVersion,
    setAgentCompareLeftVersion,
    agentCompareRightVersion,
    setAgentCompareRightVersion,
    agentVersionPreview,
    setAgentVersionPreview,
    agentVersionCompareMode,
    setAgentVersionCompareMode,
    selectedAgentVersions,
    selectedAgentPreviewVersion,
    agentCompareLeft,
    agentCompareRight,
    agentDiffStats,
    toggleAgentCompareCandidate,
  };
}
