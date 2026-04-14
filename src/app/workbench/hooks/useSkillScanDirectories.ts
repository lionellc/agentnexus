import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { homeDir } from "@tauri-apps/api/path";

import { SKILL_SCAN_DIR_STORAGE_KEY } from "../constants";
import type { SkillScanDirectory } from "../types";
import {
  buildDefaultSkillScanDirectories,
  isAbsolutePathInput,
  mergeSkillScanDirectories,
  migrateLegacySkillScanDirectory,
  normalizeDirectoryInput,
} from "../utils";

type LFn = (zh: string, en: string) => string;

type ToastFn = (payload: { title: string; variant?: "default" | "destructive" }) => void;

export type UseSkillScanDirectoriesInput = {
  l: LFn;
  toast: ToastFn;
};

export type UseSkillScanDirectoriesResult = {
  homePath: string;
  skillScanDirectories: SkillScanDirectory[];
  skillScanDirInput: string;
  setSkillScanDirInput: Dispatch<SetStateAction<string>>;
  selectedSkillScanDirectories: string[];
  handleToggleSkillScanDirectory: (path: string, checked: boolean) => void;
  handleAddSkillScanDirectory: () => void;
  handleRemoveSkillScanDirectory: (path: string) => void;
  skillScanDirsReady: boolean;
};

export function useSkillScanDirectories({
  l,
  toast,
}: UseSkillScanDirectoriesInput): UseSkillScanDirectoriesResult {
  const [homePath, setHomePath] = useState("");
  const [homePathResolved, setHomePathResolved] = useState(false);
  const [skillScanDirectories, setSkillScanDirectories] = useState<SkillScanDirectory[]>([]);
  const [skillScanDirInput, setSkillScanDirInput] = useState("");
  const [skillScanDirsReady, setSkillScanDirsReady] = useState(false);

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

  useEffect(() => {
    if (!homePathResolved || skillScanDirsReady) {
      return;
    }
    const defaults = buildDefaultSkillScanDirectories(homePath);
    if (typeof window === "undefined") {
      setSkillScanDirectories(defaults);
      setSkillScanDirsReady(true);
      return;
    }
    try {
      const raw = window.localStorage.getItem(SKILL_SCAN_DIR_STORAGE_KEY);
      if (!raw) {
        setSkillScanDirectories(defaults);
        setSkillScanDirsReady(true);
        return;
      }
      const parsed = JSON.parse(raw) as Array<Partial<SkillScanDirectory>>;
      const persisted = Array.isArray(parsed)
        ? parsed
            .map((item) => {
              const path = migrateLegacySkillScanDirectory(String(item.path ?? ""), homePath);
              if (!path) {
                return null;
              }
              const source = item.source === "default" || item.source === "custom" ? item.source : "custom";
              return {
                path,
                selected: Boolean(item.selected),
                source,
              } satisfies SkillScanDirectory;
            })
            .filter((item): item is SkillScanDirectory => Boolean(item))
        : [];
      setSkillScanDirectories(mergeSkillScanDirectories(defaults, persisted));
      setSkillScanDirsReady(true);
    } catch {
      setSkillScanDirectories(defaults);
      setSkillScanDirsReady(true);
    }
  }, [homePath, homePathResolved, skillScanDirsReady]);

  useEffect(() => {
    if (!skillScanDirsReady || typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(SKILL_SCAN_DIR_STORAGE_KEY, JSON.stringify(skillScanDirectories));
  }, [skillScanDirsReady, skillScanDirectories]);

  const selectedSkillScanDirectories = useMemo(
    () =>
      skillScanDirectories
        .filter((item) => item.selected)
        .map((item) => normalizeDirectoryInput(item.path))
        .filter(Boolean),
    [skillScanDirectories],
  );

  const handleToggleSkillScanDirectory = useCallback((path: string, checked: boolean) => {
    const normalized = normalizeDirectoryInput(path);
    setSkillScanDirectories((prev) =>
      prev.map((item) =>
        normalizeDirectoryInput(item.path) === normalized ? { ...item, selected: checked } : item,
      ),
    );
  }, []);

  const handleAddSkillScanDirectory = useCallback(() => {
    const path = normalizeDirectoryInput(skillScanDirInput);
    if (!path) {
      toast({ title: l("请输入目录路径", "Please enter a directory path"), variant: "destructive" });
      return;
    }
    if (!isAbsolutePathInput(path)) {
      toast({ title: l("目录必须是绝对路径", "Directory must be an absolute path"), variant: "destructive" });
      return;
    }
    const exists = skillScanDirectories.some((item) => normalizeDirectoryInput(item.path) === path);
    if (exists) {
      toast({ title: l("目录已存在", "Directory already exists"), variant: "destructive" });
      return;
    }
    setSkillScanDirectories((prev) => [...prev, { path, selected: true, source: "custom" }]);
    setSkillScanDirInput("");
  }, [l, skillScanDirInput, skillScanDirectories, toast]);

  const handleRemoveSkillScanDirectory = useCallback((path: string) => {
    const normalized = normalizeDirectoryInput(path);
    setSkillScanDirectories((prev) =>
      prev.filter((item) => normalizeDirectoryInput(item.path) !== normalized),
    );
  }, []);

  return {
    homePath,
    skillScanDirectories,
    skillScanDirInput,
    setSkillScanDirInput,
    selectedSkillScanDirectories,
    handleToggleSkillScanDirectory,
    handleAddSkillScanDirectory,
    handleRemoveSkillScanDirectory,
    skillScanDirsReady,
  };
}
