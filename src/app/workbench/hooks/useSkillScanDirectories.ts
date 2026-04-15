import { useEffect, useMemo, useState } from "react";
import { homeDir } from "@tauri-apps/api/path";

import type { SkillScanDirectory } from "../types";
import { normalizeDirectoryInput } from "../utils";

export type SkillDistributionTarget = {
  platform: string;
  targetPath: string;
  skillsPath?: string;
};

export type UseSkillScanDirectoriesInput = {
  distributionTargets: SkillDistributionTarget[];
};

export type UseSkillScanDirectoriesResult = {
  homePath: string;
  skillScanDirectories: SkillScanDirectory[];
  selectedSkillScanDirectories: string[];
  skillScanDirsReady: boolean;
};

export function useSkillScanDirectories({
  distributionTargets,
}: UseSkillScanDirectoriesInput): UseSkillScanDirectoriesResult {
  const [homePath, setHomePath] = useState("");
  const [homePathResolved, setHomePathResolved] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const path = await homeDir();
        setHomePath(path);
      } catch {
        setHomePath("");
      } finally {
        setHomePathResolved(true);
      }
    })();
  }, []);

  const skillScanDirectories = useMemo(() => {
    const dedup = new Map<string, SkillScanDirectory>();
    for (const item of distributionTargets) {
      const path = normalizeDirectoryInput(item.targetPath);
      if (!path || dedup.has(path)) {
        continue;
      }
      dedup.set(path, {
        path,
        selected: true,
        source: "custom",
      });
    }
    return Array.from(dedup.values());
  }, [distributionTargets]);

  const selectedSkillScanDirectories = useMemo(
    () => skillScanDirectories.map((item) => normalizeDirectoryInput(item.path)).filter(Boolean),
    [skillScanDirectories],
  );

  return {
    homePath,
    skillScanDirectories,
    selectedSkillScanDirectories,
    skillScanDirsReady: homePathResolved,
  };
}
