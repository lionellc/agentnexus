import type { WorkbenchToastOptions as ToastOptions } from "../types";
import { useEffect, useState, type ReactElement } from "react";
import { ChevronDown, ChevronRight, FileCode2, Folder, FolderOpen } from "lucide-react";

import { skillsApi } from "../../../shared/services/api";
import type { SkillOpenMode, SkillsFileReadResult, SkillsFileTreeNode, SkillsFileTreeResult } from "../../../shared/types";

type UseWorkbenchSkillFileHandlersInput = {
  l: (zh: string, en: string) => string;
  toast: (options: ToastOptions) => string;
  selectedSkillId: string | null;
  skillOpenMode: SkillOpenMode;
  setSkillDetailView: (view: "list" | "detail") => void;
  setSkillOpenMenuOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  setSkillDetailTab: (tab: any) => void;
  selectSkill: (id: string | null) => void;
  translationTargetLanguage: string;
  handleRunModelTranslationTest: (input: {
    sourceText: string;
    targetLanguage: string;
    syncModelTestForm: boolean;
  }) => Promise<{ translatedText: string } | null>;
};

export function useWorkbenchSkillFileHandlers({
  l,
  toast,
  selectedSkillId,
  skillOpenMode,
  setSkillDetailView,
  setSkillOpenMenuOpen,
  setSkillDetailTab,
  selectSkill,
  translationTargetLanguage,
  handleRunModelTranslationTest,
}: UseWorkbenchSkillFileHandlersInput) {
  const [skillTreeLoading, setSkillTreeLoading] = useState(false);
  const [skillTreeById, setSkillTreeById] = useState<Record<string, SkillsFileTreeResult>>({});
  const [skillExpandedDirsById, setSkillExpandedDirsById] = useState<Record<string, Record<string, boolean>>>({});
  const [skillSelectedFilePathById, setSkillSelectedFilePathById] = useState<Record<string, string>>({});
  const [skillFileReadLoading, setSkillFileReadLoading] = useState(false);
  const [skillFileReadByKey, setSkillFileReadByKey] = useState<Record<string, SkillsFileReadResult>>({});
  const [skillFileTranslatedByKey, setSkillFileTranslatedByKey] = useState<Record<string, string>>({});

  const selectedSkillTree = selectedSkillId ? skillTreeById[selectedSkillId] : undefined;
  const selectedSkillExpandedDirs = selectedSkillId ? skillExpandedDirsById[selectedSkillId] ?? {} : {};
  const selectedSkillFilePath = selectedSkillId ? skillSelectedFilePathById[selectedSkillId] ?? "SKILL.md" : "SKILL.md";

  const selectedSkillOverviewRead = selectedSkillId ? skillFileReadByKey[`${selectedSkillId}:SKILL.md`] ?? null : null;
  const selectedSkillFileRead = selectedSkillId
    ? skillFileReadByKey[`${selectedSkillId}:${selectedSkillFilePath}`] ?? null
    : null;

  const selectedSkillTranslationKey = selectedSkillId ? `${selectedSkillId}:${selectedSkillFilePath}` : "";
  const selectedSkillOverviewTranslationKey = selectedSkillId ? `${selectedSkillId}:SKILL.md` : "";
  const selectedSkillTranslatedText = selectedSkillTranslationKey
    ? skillFileTranslatedByKey[selectedSkillTranslationKey] ?? ""
    : "";
  const selectedSkillOverviewTranslatedText = selectedSkillOverviewTranslationKey
    ? skillFileTranslatedByKey[selectedSkillOverviewTranslationKey] ?? ""
    : "";

  useEffect(() => {
    setSkillFileTranslatedByKey({});
  }, [selectedSkillId]);

  async function handleSkillOpen(skillId: string, relativePath?: string) {
    try {
      await skillsApi.open({
        skillId,
        relativePath,
        mode: skillOpenMode,
      });
    } catch (error) {
      toast({
        title: l("打开失败", "Open failed"),
        description: error instanceof Error ? error.message : l("未知错误", "Unknown error"),
        variant: "destructive",
      });
    }
  }

  async function handleLoadSkillTree(skillId: string, force = false): Promise<SkillsFileTreeResult | null> {
    if (!force && skillTreeById[skillId]) {
      return skillTreeById[skillId];
    }
    setSkillTreeLoading(true);
    try {
      const result = await skillsApi.filesTree({ skillId });
      setSkillTreeById((prev) => ({ ...prev, [skillId]: result }));
      setSkillExpandedDirsById((prev) => ({
        ...prev,
        [skillId]: prev[skillId] ?? {},
      }));
      return result;
    } catch (error) {
      toast({
        title: l("读取文件树失败", "Failed to read file tree"),
        description: error instanceof Error ? error.message : l("未知错误", "Unknown error"),
        variant: "destructive",
      });
      return null;
    } finally {
      setSkillTreeLoading(false);
    }
  }

  async function handleReadSkillFile(skillId: string, relativePath: string) {
    const key = `${skillId}:${relativePath}`;
    setSkillSelectedFilePathById((prev) => ({ ...prev, [skillId]: relativePath }));
    if (skillFileReadByKey[key]) {
      return;
    }
    setSkillFileReadLoading(true);
    try {
      const result = await skillsApi.fileRead({ skillId, relativePath });
      setSkillFileReadByKey((prev) => ({
        ...prev,
        [key]: result,
      }));
    } catch (error) {
      setSkillFileReadByKey((prev) => ({
        ...prev,
        [key]: {
          relativePath,
          absolutePath: "",
          language: "",
          supported: false,
          content: "",
          message: error instanceof Error ? error.message : l("读取失败", "Read failed"),
        },
      }));
    } finally {
      setSkillFileReadLoading(false);
    }
  }

  async function handleOpenSkillDetail(skillId: string) {
    selectSkill(skillId);
    setSkillOpenMenuOpen(false);
    setSkillDetailView("detail");
    setSkillDetailTab("overview");
    await handleLoadSkillTree(skillId);
    await handleReadSkillFile(skillId, "SKILL.md");
  }

  function handleToggleSkillDir(skillId: string, relativePath: string) {
    setSkillExpandedDirsById((prev) => {
      const current = prev[skillId] ?? {};
      return {
        ...prev,
        [skillId]: {
          ...current,
          [relativePath]: !current[relativePath],
        },
      };
    });
  }

  function renderSkillTreeNodes(nodes: SkillsFileTreeNode[], skillId: string, depth = 0): ReactElement[] {
    return nodes.flatMap((node) => {
      const expanded = selectedSkillExpandedDirs[node.relativePath] ?? depth < 1;
      const row = (
        <button
          type="button"
          key={`${node.relativePath}-row`}
          className={`flex w-full items-center gap-1 rounded-md px-2 py-1 text-left text-xs transition-colors ${
            selectedSkillFilePath === node.relativePath
              ? "bg-blue-50 text-blue-700 dark:bg-blue-500/20 dark:text-blue-200"
              : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800/80"
          }`}
          style={{ paddingLeft: `${8 + depth * 14}px` }}
          onClick={() => {
            if (node.isDir) {
              handleToggleSkillDir(skillId, node.relativePath);
              return;
            }
            void handleReadSkillFile(skillId, node.relativePath);
          }}
        >
          {node.isDir ? (
            expanded ? <ChevronDown className="h-3.5 w-3.5 text-slate-400" /> : <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
          ) : (
            <span className="inline-block h-3.5 w-3.5" />
          )}
          {node.isDir ? (
            expanded ? <FolderOpen className="h-3.5 w-3.5 text-amber-500" /> : <Folder className="h-3.5 w-3.5 text-amber-500" />
          ) : (
            <FileCode2 className="h-3.5 w-3.5 text-slate-400" />
          )}
          <span className="truncate">{node.name}</span>
          {node.isSymlink ? (
            <span className="ml-auto rounded bg-slate-100 px-1 py-0.5 text-[10px] text-slate-500 dark:bg-slate-800 dark:text-slate-300">
              {l("软链", "Symlink")}
            </span>
          ) : null}
        </button>
      );

      if (!node.isDir || !expanded || !node.children?.length) {
        return [row];
      }
      return [row, ...renderSkillTreeNodes(node.children, skillId, depth + 1)];
    });
  }

  function handleLeaveSkillDetail() {
    setSkillDetailView("list");
    setSkillOpenMenuOpen(false);
  }

  async function handleTranslateSkillContent(sourceText: string, translationKey: string) {
    if (!translationKey || !sourceText.trim()) {
      return;
    }
    const result = await handleRunModelTranslationTest({
      sourceText,
      targetLanguage: translationTargetLanguage,
      syncModelTestForm: false,
    });
    if (!result) {
      return;
    }
    setSkillFileTranslatedByKey((prev) => ({
      ...prev,
      [translationKey]: result.translatedText,
    }));
  }

  async function handleTranslateSelectedSkillFile() {
    if (!selectedSkillFileRead || !selectedSkillTranslationKey) {
      return;
    }
    await handleTranslateSkillContent(selectedSkillFileRead.content, selectedSkillTranslationKey);
  }

  async function handleTranslateSelectedSkillOverview() {
    if (!selectedSkillOverviewRead?.supported || !selectedSkillOverviewTranslationKey) {
      return;
    }
    await handleTranslateSkillContent(selectedSkillOverviewRead.content, selectedSkillOverviewTranslationKey);
  }

  return {
    skillTreeLoading,
    skillFileReadLoading,
    selectedSkillTree,
    selectedSkillFilePath,
    selectedSkillOverviewRead,
    selectedSkillFileRead,
    selectedSkillTranslationKey,
    selectedSkillOverviewTranslationKey,
    selectedSkillTranslatedText,
    selectedSkillOverviewTranslatedText,
    handleSkillOpen,
    handleLoadSkillTree,
    handleReadSkillFile,
    handleOpenSkillDetail,
    renderSkillTreeNodes,
    handleLeaveSkillDetail,
    handleTranslateSelectedSkillFile,
    handleTranslateSelectedSkillOverview,
  };
}
