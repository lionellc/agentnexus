import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, FileCode2, History, Play, RefreshCw, Save, Star, Trash2 } from "lucide-react";

import { AppShell } from "../features/shell/AppShell";
import type { SettingsCategory } from "../features/shell/types";
import { DataTable } from "../features/common/components/DataTable";
import { EmptyState } from "../features/common/components/EmptyState";
import { MarkdownEditor } from "../features/common/components/MarkdownEditor";
import { SectionTitle } from "../features/common/components/SectionTitle";
import { agentConnectionApi } from "../shared/services/api";
import {
  usePromptsStore,
  useAgentRulesStore,
  useSettingsStore,
  useShellStore,
  useSkillsStore,
} from "../shared/stores";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  useToast,
} from "../shared/ui";
import { buildLineDiff } from "../shared/utils/diff";
import { extractTemplateVariables, renderTemplatePreview } from "../shared/utils/template";
import type { RuntimeFlags, SkillAsset } from "../shared/types";

const AGENT_RULES_PAGE_SIZE = 10;

const settingCategories: Array<{ key: SettingsCategory; label: string }> = [
  { key: "general", label: "常规设置" },
  { key: "appearance", label: "显示设置" },
  { key: "data", label: "数据设置" },
  { key: "model", label: "AI 模型" },
  { key: "language", label: "语言" },
  { key: "notifications", label: "通知" },
  { key: "security", label: "安全" },
  { key: "about", label: "关于" },
];

function toLocalTime(value: string | null | undefined): string {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function parseTags(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeSkillPreview(skill: SkillAsset): string {
  return [
    `# ${skill.name}`,
    `- identity: ${skill.identity}`,
    `- version: ${skill.version}`,
    `- latest: ${skill.latestVersion}`,
    `- source: ${skill.source}`,
    `- localPath: ${skill.localPath}`,
  ].join("\n");
}

const PLATFORM_RULE_PATHS: Record<string, string> = {
  codex: ".codex/AGENTS.md",
  claude: ".claude/CLAUDE.md",
};

function resolvePlatformRulePath(platform: string): string {
  return PLATFORM_RULE_PATHS[platform.toLowerCase()] ?? "(未配置映射路径)";
}

function isAbsolutePathInput(path: string): boolean {
  const trimmed = path.trim();
  if (!trimmed) {
    return false;
  }
  if (trimmed.startsWith("/")) {
    return true;
  }
  return /^[A-Za-z]:[\\/]/.test(trimmed);
}

export function WorkbenchApp() {
  const { toast } = useToast();

  const activeModule = useShellStore((state) => state.activeModule);
  const setActiveModule = useShellStore((state) => state.setActiveModule);
  const query = useShellStore((state) => state.query);
  const setQuery = useShellStore((state) => state.setQuery);
  const promptViewMode = useShellStore((state) => state.promptViewMode);
  const setPromptViewMode = useShellStore((state) => state.setPromptViewMode);
  const skillDetailTab = useShellStore((state) => state.skillDetailTab);
  const setSkillDetailTab = useShellStore((state) => state.setSkillDetailTab);
  const settingsCategory = useShellStore((state) => state.settingsCategory);
  const setSettingsCategory = useShellStore((state) => state.setSettingsCategory);
  const sidebarOpen = useShellStore((state) => state.mobileSidebarOpen);
  const setSidebarOpen = useShellStore((state) => state.setMobileSidebarOpen);
  const mobileDetailOpen = useShellStore((state) => state.mobileDetailOpen);
  const setMobileDetailOpen = useShellStore((state) => state.setMobileDetailOpen);
  const searchHits = useShellStore((state) => state.searchHits);
  const setSearchHits = useShellStore((state) => state.setSearchHits);

  const prompts = usePromptsStore((state) => state.prompts);
  const promptsLoading = usePromptsStore((state) => state.loading);
  const selectedPromptId = usePromptsStore((state) => state.selectedPromptId);
  const promptSelectedIds = usePromptsStore((state) => state.selectedIds);
  const promptVersions = usePromptsStore((state) => state.versionsByPromptId);
  const promptBatchResult = usePromptsStore((state) => state.lastBatchResult);
  const fetchPrompts = usePromptsStore((state) => state.fetchPrompts);
  const searchPrompts = usePromptsStore((state) => state.searchPrompts);
  const selectPrompt = usePromptsStore((state) => state.selectPrompt);
  const togglePromptSelection = usePromptsStore((state) => state.toggleSelect);
  const clearPromptSelection = usePromptsStore((state) => state.clearSelection);
  const createPrompt = usePromptsStore((state) => state.createPrompt);
  const updatePrompt = usePromptsStore((state) => state.updatePrompt);
  const renderPrompt = usePromptsStore((state) => state.renderPrompt);
  const fetchPromptVersions = usePromptsStore((state) => state.fetchVersions);
  const restorePromptVersion = usePromptsStore((state) => state.restoreVersion);
  const batchFavoritePrompt = usePromptsStore((state) => state.batchFavorite);
  const batchMovePrompt = usePromptsStore((state) => state.batchMove);
  const batchDeletePrompt = usePromptsStore((state) => state.batchDelete);

  const skills = useSkillsStore((state) => state.skills);
  const skillsLoading = useSkillsStore((state) => state.loading);
  const selectedSkillId = useSkillsStore((state) => state.selectedSkillId);
  const skillSelectedIds = useSkillsStore((state) => state.selectedIds);
  const skillDetails = useSkillsStore((state) => state.detailById);
  const skillBatchResult = useSkillsStore((state) => state.lastBatchResult);
  const fetchSkills = useSkillsStore((state) => state.fetchSkills);
  const scanSkills = useSkillsStore((state) => state.scanSkills);
  const selectSkill = useSkillsStore((state) => state.selectSkill);
  const toggleSkillSelection = useSkillsStore((state) => state.toggleSelect);
  const clearSkillSelection = useSkillsStore((state) => state.clearSelection);
  const fetchSkillDetail = useSkillsStore((state) => state.fetchDetail);
  const distributeSkills = useSkillsStore((state) => state.distribute);
  const uninstallSkills = useSkillsStore((state) => state.uninstall);

  const agentAssets = useAgentRulesStore((state) => state.assets);
  const agentTagsByAsset = useAgentRulesStore((state) => state.tagsByAsset);
  const agentVersionsByAsset = useAgentRulesStore((state) => state.versionsByAsset ?? {});
  const agentConnections = useAgentRulesStore((state) => state.connections);
  const agentRulesError = useAgentRulesStore((state) => state.lastActionError);
  const selectedAssetId = useAgentRulesStore((state) => state.selectedAssetId);
  const setSelectedAssetId = useAgentRulesStore((state) => state.setSelectedAssetId);
  const clearAgentRulesError = useAgentRulesStore((state) => state.clearError);
  const loadAgentModuleData = useAgentRulesStore((state) => state.loadModuleData);
  const loadAgentConnections = useAgentRulesStore((state) => state.loadConnections);
  const loadAgentVersions = useAgentRulesStore((state) => state.loadVersions);
  const createAgentAsset = useAgentRulesStore((state) => state.createAsset);
  const deleteAgentAsset = useAgentRulesStore((state) => state.deleteAsset);
  const publishAgentVersion = useAgentRulesStore((state) => state.publishVersion);
  const refreshAgentAsset = useAgentRulesStore((state) => state.refreshAsset);
  const runAgentDistribution = useAgentRulesStore((state) => state.runDistribution);

  const workspaces = useSettingsStore((state) => state.workspaces);
  const activeWorkspaceId = useSettingsStore((state) => state.activeWorkspaceId);
  const runtimeFlags = useSettingsStore((state) => state.runtimeFlags);
  const targets = useSettingsStore((state) => state.targets);
  const settingsConnections = useSettingsStore((state) => state.connections);
  const webdav = useSettingsStore((state) => state.webdav);
  const dirty = useSettingsStore((state) => state.dirty);
  const settingsLoading = useSettingsStore((state) => state.loading);
  const loadAllSettings = useSettingsStore((state) => state.loadAll);
  const createWorkspace = useSettingsStore((state) => state.createWorkspace);
  const activateWorkspace = useSettingsStore((state) => state.activateWorkspace);
  const loadSettingsConnections = useSettingsStore((state) => state.loadConnections);
  const upsertConnection = useSettingsStore((state) => state.upsertConnection);
  const upsertTarget = useSettingsStore((state) => state.upsertTarget);
  const updateRuntimeFlags = useSettingsStore((state) => state.updateRuntimeFlags);
  const setWebDav = useSettingsStore((state) => state.setWebDav);
  const testWebDav = useSettingsStore((state) => state.testWebDav);
  const uploadWebDav = useSettingsStore((state) => state.uploadWebDav);
  const downloadWebDav = useSettingsStore((state) => state.downloadWebDav);
  const setDirty = useSettingsStore((state) => state.setDirty);

  const [createPromptOpen, setCreatePromptOpen] = useState(false);
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false);
  const [variableModalOpen, setVariableModalOpen] = useState(false);
  const [versionModalOpen, setVersionModalOpen] = useState(false);
  const [skillVersionModalOpen, setSkillVersionModalOpen] = useState(false);
  const [agentVersionModalOpen, setAgentVersionModalOpen] = useState(false);
  const [agentDistributionModalOpen, setAgentDistributionModalOpen] = useState(false);
  const [agentRuleEditorModalOpen, setAgentRuleEditorModalOpen] = useState(false);
  const [agentRulesPage, setAgentRulesPage] = useState(1);
  const [deleteConfirmAssetId, setDeleteConfirmAssetId] = useState<string | null>(null);

  const [newPromptName, setNewPromptName] = useState("");
  const [newPromptContent, setNewPromptContent] = useState("");
  const [newWorkspaceName, setNewWorkspaceName] = useState("默认工作区");
  const [newWorkspacePath, setNewWorkspacePath] = useState("");
  const [targetPlatform, setTargetPlatform] = useState("cursor");
  const [targetPath, setTargetPath] = useState("");
  const [targetSkillsPath, setTargetSkillsPath] = useState("");
  const [skillsTargetIds, setSkillsTargetIds] = useState<string[]>([]);

  const [detailName, setDetailName] = useState("");
  const [detailCategory, setDetailCategory] = useState("");
  const [detailTagsInput, setDetailTagsInput] = useState("");
  const [detailContent, setDetailContent] = useState("");
  const [detailFavorite, setDetailFavorite] = useState(false);

  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [renderedResult, setRenderedResult] = useState("");

  const [compareLeftVersion, setCompareLeftVersion] = useState<number | null>(null);
  const [compareRightVersion, setCompareRightVersion] = useState<number | null>(null);
  const [skillCompareLeftVersion, setSkillCompareLeftVersion] = useState<string>("");
  const [skillCompareRightVersion, setSkillCompareRightVersion] = useState<string>("");
  const [agentCompareLeftVersion, setAgentCompareLeftVersion] = useState<string>("");
  const [agentCompareRightVersion, setAgentCompareRightVersion] = useState<string>("");

  const [runtimeForm, setRuntimeForm] = useState<RuntimeFlags | null>(null);
  const [creatingAgentAsset, setCreatingAgentAsset] = useState(false);
  const [agentAssetNameInput, setAgentAssetNameInput] = useState("");
  const [agentEditorContent, setAgentEditorContent] = useState("");
  const [agentTargetIds, setAgentTargetIds] = useState<string[]>([]);
  const [mappingPreviewOpen, setMappingPreviewOpen] = useState(false);
  const [mappingPreviewPlatform, setMappingPreviewPlatform] = useState("");
  const [mappingPreviewPath, setMappingPreviewPath] = useState("");
  const [mappingPreviewContent, setMappingPreviewContent] = useState("");
  const [mappingPreviewExists, setMappingPreviewExists] = useState(false);
  const [mappingPreviewMessage, setMappingPreviewMessage] = useState("");
  const [connectionDrafts, setConnectionDrafts] = useState<Record<string, string>>({
    codex: "",
    claude: "",
  });
  const [connectionEnabledDrafts, setConnectionEnabledDrafts] = useState<
    Record<string, boolean>
  >({
    codex: true,
    claude: true,
  });

  const selectedPrompt = useMemo(() => prompts.find((item) => item.id === selectedPromptId) ?? null, [prompts, selectedPromptId]);
  const selectedSkill = useMemo(() => skills.find((item) => item.id === selectedSkillId) ?? null, [skills, selectedSkillId]);
  const selectedSkillDetail = selectedSkillId ? skillDetails[selectedSkillId] : undefined;

  const filteredPrompts = useMemo(() => {
    if (!query.trim()) {
      return prompts;
    }
    const lower = query.toLowerCase();
    return prompts.filter((item) => {
      return (
        item.name.toLowerCase().includes(lower) ||
        item.content.toLowerCase().includes(lower) ||
        item.tags.some((tag) => tag.toLowerCase().includes(lower))
      );
    });
  }, [prompts, query]);

  const filteredSkills = useMemo(() => {
    if (!query.trim()) {
      return skills;
    }
    const lower = query.toLowerCase();
    return skills.filter((item) => {
      return (
        item.name.toLowerCase().includes(lower) ||
        item.identity.toLowerCase().includes(lower) ||
        item.source.toLowerCase().includes(lower)
      );
    });
  }, [skills, query]);

  const filteredAgentAssets = useMemo(() => {
    if (!query.trim()) {
      return agentAssets;
    }
    const lower = query.toLowerCase();
    return agentAssets.filter((item) => {
      const latestVersion = String(item.latestVersion ?? "");
      return (
        item.name.toLowerCase().includes(lower) ||
        latestVersion.toLowerCase().includes(lower)
      );
    });
  }, [agentAssets, query]);
  const totalAgentPages = useMemo(
    () => Math.max(1, Math.ceil(filteredAgentAssets.length / AGENT_RULES_PAGE_SIZE)),
    [filteredAgentAssets.length],
  );
  const pagedAgentAssets = useMemo(() => {
    const start = (agentRulesPage - 1) * AGENT_RULES_PAGE_SIZE;
    return filteredAgentAssets.slice(start, start + AGENT_RULES_PAGE_SIZE);
  }, [filteredAgentAssets, agentRulesPage]);

  const selectedAgentAsset = useMemo(() => {
    if (!selectedAssetId) {
      return null;
    }
    return agentAssets.find((item) => item.id === selectedAssetId) ?? null;
  }, [agentAssets, selectedAssetId]);

  const requiredVariables = useMemo(() => {
    if (!selectedPrompt) {
      return [];
    }
    return extractTemplateVariables(selectedPrompt.content);
  }, [selectedPrompt]);

  const variablePreview = useMemo(() => {
    if (!selectedPrompt) {
      return "";
    }
    return renderTemplatePreview(selectedPrompt.content, variableValues);
  }, [selectedPrompt, variableValues]);
  const missingVariables = useMemo(
    () => requiredVariables.filter((key) => !String(variableValues[key] ?? "").trim()),
    [requiredVariables, variableValues],
  );

  const selectedPromptVersions = selectedPrompt ? promptVersions[selectedPrompt.id] ?? [] : [];
  const selectedAgentVersions = selectedAssetId ? agentVersionsByAsset[selectedAssetId] ?? [] : [];

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

  const skillVersionDiffLines = useMemo(() => {
    if (!selectedSkillDetail || !skillCompareLeftVersion || !skillCompareRightVersion) {
      return [];
    }
    const left = selectedSkillDetail.versions.find((item) => item.version === skillCompareLeftVersion);
    const right = selectedSkillDetail.versions.find((item) => item.version === skillCompareRightVersion);
    if (!left || !right) {
      return [];
    }
    return buildLineDiff(JSON.stringify(left, null, 2), JSON.stringify(right, null, 2));
  }, [selectedSkillDetail, skillCompareLeftVersion, skillCompareRightVersion]);

  const agentVersionDiffLines = useMemo(() => {
    if (!selectedAssetId || !agentCompareLeftVersion || !agentCompareRightVersion) {
      return [];
    }
    const left = selectedAgentVersions.find((item) => String(item.version) === agentCompareLeftVersion);
    const right = selectedAgentVersions.find((item) => String(item.version) === agentCompareRightVersion);
    if (!left || !right) {
      return [];
    }
    return buildLineDiff(left.content ?? "", right.content ?? "");
  }, [selectedAssetId, selectedAgentVersions, agentCompareLeftVersion, agentCompareRightVersion]);

  useEffect(() => {
    void loadAllSettings();
  }, [loadAllSettings]);

  useEffect(() => {
    if (!activeWorkspaceId) {
      return;
    }
    void fetchPrompts(activeWorkspaceId);
    void fetchSkills();
    void loadAgentModuleData(activeWorkspaceId);
  }, [activeWorkspaceId, fetchPrompts, fetchSkills, loadAgentModuleData]);

  useEffect(() => {
    if (!selectedSkillId) {
      return;
    }
    if (skillDetails[selectedSkillId]) {
      return;
    }
    void fetchSkillDetail(selectedSkillId);
  }, [selectedSkillId, skillDetails, fetchSkillDetail]);

  useEffect(() => {
    setAgentRulesPage((prev) => Math.min(prev, totalAgentPages));
  }, [totalAgentPages]);

  useEffect(() => {
    if (!runtimeFlags) {
      return;
    }
    setRuntimeForm(runtimeFlags);
  }, [runtimeFlags]);

  useEffect(() => {
    if (creatingAgentAsset) {
      return;
    }
    if (!selectedAgentAsset) {
      if (agentAssets.length > 0) {
        setSelectedAssetId(agentAssets[0].id);
      } else {
        setCreatingAgentAsset(true);
        setAgentAssetNameInput("规则文件 1");
        setAgentEditorContent("");
      }
      return;
    }
    setAgentAssetNameInput(selectedAgentAsset.name);
    if (typeof selectedAgentAsset.latestContent === "string") {
      setAgentEditorContent(selectedAgentAsset.latestContent);
    }
  }, [creatingAgentAsset, selectedAgentAsset, agentAssets, setSelectedAssetId]);

  useEffect(() => {
    if (creatingAgentAsset || !selectedAssetId) {
      return;
    }
    const latestVersion = agentVersionsByAsset[selectedAssetId]?.[0];
    if (typeof latestVersion?.content === "string") {
      setAgentEditorContent(latestVersion.content);
    }
  }, [creatingAgentAsset, selectedAssetId, agentVersionsByAsset]);

  useEffect(() => {
    if (!activeWorkspaceId) {
      setAgentTargetIds([]);
      return;
    }
    const next = agentConnections
      .filter((item) => item.enabled)
      .map((item) => item.agentType);
    setAgentTargetIds(next);
  }, [activeWorkspaceId, agentConnections]);

  useEffect(() => {
    const nextRoots: Record<string, string> = { codex: "", claude: "" };
    const nextEnabled: Record<string, boolean> = { codex: true, claude: true };
    settingsConnections.forEach((connection) => {
      const key = connection.platform.toLowerCase();
      nextRoots[key] = connection.rootDir;
      nextEnabled[key] = connection.enabled;
    });
    setConnectionDrafts(nextRoots);
    setConnectionEnabledDrafts(nextEnabled);
  }, [settingsConnections]);

  useEffect(() => {
    const nextHits = [
      ...filteredPrompts.slice(0, 5).map((item) => ({
        module: "prompts" as const,
        id: item.id,
        title: item.name,
        subtitle: item.category,
      })),
      ...filteredSkills.slice(0, 5).map((item) => ({
        module: "skills" as const,
        id: item.id,
        title: item.name,
        subtitle: item.version,
      })),
      ...filteredAgentAssets.slice(0, 5).map((item) => ({
        module: "agents" as const,
        id: item.id,
        title: item.name,
        subtitle: `v${item.latestVersion ?? "-"}`,
      })),
    ];
    setSearchHits(nextHits);
  }, [filteredPrompts, filteredSkills, filteredAgentAssets, setSearchHits]);

  useEffect(() => {
    if (!selectedPrompt) {
      setDetailName("");
      setDetailCategory("");
      setDetailTagsInput("");
      setDetailContent("");
      setDetailFavorite(false);
      return;
    }

    setDetailName(selectedPrompt.name);
    setDetailCategory(selectedPrompt.category);
    setDetailTagsInput(selectedPrompt.tags.join(", "));
    setDetailContent(selectedPrompt.content);
    setDetailFavorite(selectedPrompt.favorite);
  }, [selectedPrompt]);

  function handleSelectSearchHit(hit: (typeof searchHits)[number]) {
    setActiveModule(hit.module);
    if (hit.module === "prompts") {
      selectPrompt(hit.id);
      setMobileDetailOpen(true);
    }
    if (hit.module === "skills") {
      selectSkill(hit.id);
      setMobileDetailOpen(true);
    }
    if (hit.module === "agents") {
      void openAgentRuleEditor(hit.id);
    }
    if (hit.module === "settings") {
      setSettingsCategory("general");
    }
    setQuery("");
  }

  function handleQuickCreate() {
    if (activeModule === "prompts") {
      setCreatePromptOpen(true);
      return;
    }
    if (activeModule === "settings") {
      setCreateWorkspaceOpen(true);
      return;
    }
    if (activeModule === "agents") {
      if (!activeWorkspaceId) {
        toast({ title: "请先创建工作区", variant: "destructive" });
        return;
      }
      handleCreateNewAgentAsset();
      return;
    }
    if (activeModule === "skills") {
      if (!activeWorkspaceId) {
        toast({ title: "请先创建工作区", variant: "destructive" });
        return;
      }
      void (async () => {
        try {
          await scanSkills(activeWorkspaceId);
          toast({ title: "扫描完成", description: "已刷新 Skills 列表" });
        } catch (error) {
          toast({ title: "扫描失败", description: error instanceof Error ? error.message : "未知错误", variant: "destructive" });
        }
      })();
    }
  }

  function handleCreateNewAgentAsset() {
    setCreatingAgentAsset(true);
    setSelectedAssetId(null);
    setAgentAssetNameInput(`规则文件 ${agentAssets.length + 1}`);
    setAgentEditorContent("");
    setAgentRuleEditorModalOpen(true);
  }

  async function openAgentRuleEditor(assetId: string) {
    setCreatingAgentAsset(false);
    setSelectedAssetId(assetId);
    setAgentRuleEditorModalOpen(true);

    const currentAsset = agentAssets.find((item) => item.id === assetId);
    if (typeof currentAsset?.latestContent === "string") {
      setAgentEditorContent(currentAsset.latestContent);
      return;
    }

    try {
      await loadAgentVersions(assetId);
    } catch {
      // 忽略补读失败，保持当前内容。
    }
  }

  async function handleOpenAgentVersionDiff(assetId: string) {
    setCreatingAgentAsset(false);
    setSelectedAssetId(assetId);
    const cachedVersions = agentVersionsByAsset[assetId] ?? [];
    setAgentCompareLeftVersion(String(cachedVersions[0]?.version ?? ""));
    setAgentCompareRightVersion(
      String(cachedVersions[1]?.version ?? cachedVersions[0]?.version ?? ""),
    );
    try {
      await loadAgentVersions(assetId);
      setAgentVersionModalOpen(true);
    } catch (error) {
      toast({
        title: "读取版本失败",
        description: error instanceof Error ? error.message : "未知错误",
        variant: "destructive",
      });
    }
  }

  async function handleDeleteAgentRuleAsset(assetId: string, assetName: string) {
    if (!activeWorkspaceId) {
      toast({ title: "请先创建工作区", variant: "destructive" });
      return;
    }
    try {
      await deleteAgentAsset(activeWorkspaceId, assetId);
      setDeleteConfirmAssetId(null);
      if (selectedAssetId === assetId) {
        setAgentRuleEditorModalOpen(false);
      }
      toast({ title: "删除成功", description: `${assetName} 已删除` });
    } catch (error) {
      toast({
        title: "删除失败",
        description: error instanceof Error ? error.message : "未知错误",
        variant: "destructive",
      });
    }
  }

  async function handleSaveAgentRuleVersion() {
    if (!activeWorkspaceId) {
      toast({ title: "请先创建工作区", variant: "destructive" });
      return;
    }
    try {
      if (!selectedAgentAsset || creatingAgentAsset) {
        if (!agentAssetNameInput.trim()) {
          toast({ title: "请输入规则文件名称", variant: "destructive" });
          return;
        }
        const created = await createAgentAsset(
          activeWorkspaceId,
          agentAssetNameInput.trim(),
          agentEditorContent,
        );
        setCreatingAgentAsset(false);
        setSelectedAssetId(created.id);
        setAgentRuleEditorModalOpen(false);
        toast({
          title: "规则文件已创建",
          description: `${created.name} 已创建并生成首个版本`,
        });
        return;
      }
      const version = await publishAgentVersion(
        selectedAgentAsset.id,
        agentEditorContent,
      );
      toast({
        title: "保存成功",
        description: `${selectedAgentAsset.name} 已生成版本 ${version.version}`,
      });
    } catch (error) {
      toast({ title: "保存失败", description: error instanceof Error ? error.message : "未知错误", variant: "destructive" });
    }
  }

  async function handleRunAgentDistribution() {
    if (!activeWorkspaceId) {
      toast({ title: "请先创建工作区", variant: "destructive" });
      return;
    }
    if (!selectedAssetId) {
      toast({ title: "请先选择规则资产", variant: "destructive" });
      return;
    }
    try {
      const job = await runAgentDistribution({
        workspaceId: activeWorkspaceId,
        releaseVersion: selectedAssetId,
        targetIds: agentTargetIds.length > 0 ? agentTargetIds : undefined,
      });
      await loadAgentModuleData(activeWorkspaceId);
      setAgentDistributionModalOpen(false);
      const total = Array.isArray(job.records) ? job.records.length : 0;
      const success = Array.isArray(job.records)
        ? job.records.filter((record) => record.status === "success").length
        : 0;
      const failed = Math.max(0, total - success);
      toast({
        title: "应用完成",
        description:
          failed > 0
            ? `已更新 Agent 标签，成功 ${success} 个，失败 ${failed} 个。`
            : "已更新 Agent 标签。",
        variant: failed > 0 ? "destructive" : "default",
      });
    } catch (error) {
      toast({ title: "应用失败", description: error instanceof Error ? error.message : "未知错误", variant: "destructive" });
    }
  }

  async function handleOpenAgentMappingPreview(platform: string) {
    if (!activeWorkspaceId) {
      toast({ title: "请先创建工作区", variant: "destructive" });
      return;
    }
    try {
      const result = await agentConnectionApi.preview({
        workspaceId: activeWorkspaceId,
        platform,
      });
      setMappingPreviewPlatform(platform);
      setMappingPreviewPath(result.resolvedPath || resolvePlatformRulePath(platform));
      setMappingPreviewExists(result.exists);
      setMappingPreviewContent(result.content);
      setMappingPreviewMessage(result.exists ? "读取成功" : "文件不存在或不可读取");
      setMappingPreviewOpen(true);
    } catch (error) {
      setMappingPreviewPlatform(platform);
      setMappingPreviewPath(resolvePlatformRulePath(platform));
      setMappingPreviewExists(false);
      setMappingPreviewContent("");
      setMappingPreviewMessage(error instanceof Error ? error.message : "读取失败");
      setMappingPreviewOpen(true);
    }
  }

  function handleToggleTheme() {
    document.documentElement.classList.toggle("dark");
  }

  async function handleCreatePrompt() {
    if (!activeWorkspaceId) {
      toast({ title: "请先创建工作区", variant: "destructive" });
      return;
    }

    if (!newPromptName.trim() || !newPromptContent.trim()) {
      toast({ title: "请输入名称和内容", variant: "destructive" });
      return;
    }

    try {
      await createPrompt({
        workspaceId: activeWorkspaceId,
        name: newPromptName.trim(),
        content: newPromptContent,
      });
      toast({ title: "Prompt 已创建" });
      setCreatePromptOpen(false);
      setNewPromptName("");
      setNewPromptContent("");
    } catch (error) {
      toast({ title: "创建失败", description: error instanceof Error ? error.message : "未知错误", variant: "destructive" });
    }
  }

  async function handleSavePromptDetail() {
    if (!selectedPrompt) {
      return;
    }

    try {
      await updatePrompt({
        promptId: selectedPrompt.id,
        content: detailContent,
        category: detailCategory || "default",
        tags: parseTags(detailTagsInput),
        favorite: detailFavorite,
      });
      toast({ title: "已保存" });
      if (activeWorkspaceId) {
        await fetchPrompts(activeWorkspaceId);
      }
    } catch (error) {
      toast({ title: "保存失败", description: error instanceof Error ? error.message : "未知错误", variant: "destructive" });
    }
  }

  async function handleOpenPromptVersion() {
    if (!selectedPrompt) {
      return;
    }

    try {
      await fetchPromptVersions(selectedPrompt.id);
      const versions = promptVersions[selectedPrompt.id] ?? [];
      if (versions.length >= 2) {
        setCompareLeftVersion(versions[0]?.version ?? null);
        setCompareRightVersion(versions[1]?.version ?? null);
      }
      setVersionModalOpen(true);
    } catch (error) {
      toast({ title: "读取版本失败", description: error instanceof Error ? error.message : "未知错误", variant: "destructive" });
    }
  }

  async function handlePromptRender() {
    if (!selectedPrompt) {
      return;
    }
    if (missingVariables.length > 0) {
      toast({
        title: "请先填写全部变量",
        description: `缺失 ${missingVariables.length} 项`,
        variant: "destructive",
      });
      return;
    }

    try {
      const rendered = await renderPrompt(selectedPrompt.id, variableValues);
      setRenderedResult(rendered);
      toast({ title: "渲染完成" });
    } catch (error) {
      toast({ title: "渲染失败", description: error instanceof Error ? error.message : "未知错误", variant: "destructive" });
    }
  }

  async function handlePromptBatchFavorite(value: boolean) {
    const confirmed = window.confirm(
      `确认对已选择的 ${promptSelectedIds.length} 个 Prompt 执行批量${value ? "收藏" : "取消收藏"}吗？`,
    );
    if (!confirmed) {
      return;
    }
    try {
      await batchFavoritePrompt(value);
      if (activeWorkspaceId) {
        await fetchPrompts(activeWorkspaceId);
      }
      toast({ title: "批量更新完成" });
      clearPromptSelection();
    } catch (error) {
      toast({ title: "批量更新失败", description: error instanceof Error ? error.message : "未知错误", variant: "destructive" });
    }
  }

  async function handlePromptBatchMove() {
    const confirmed = window.confirm(`确认移动已选择的 ${promptSelectedIds.length} 个 Prompt 吗？`);
    if (!confirmed) {
      return;
    }
    const category = window.prompt("请输入目标分类");
    if (!category) {
      return;
    }
    try {
      await batchMovePrompt(category);
      if (activeWorkspaceId) {
        await fetchPrompts(activeWorkspaceId);
      }
      toast({ title: "批量移动完成" });
      clearPromptSelection();
    } catch (error) {
      toast({ title: "批量移动失败", description: error instanceof Error ? error.message : "未知错误", variant: "destructive" });
    }
  }

  async function handlePromptBatchDelete() {
    if (!window.confirm(`确认删除 ${promptSelectedIds.length} 个 Prompt 吗？`)) {
      return;
    }
    try {
      await batchDeletePrompt();
      toast({ title: "批量删除已执行" });
    } catch (error) {
      toast({ title: "批量删除失败", description: error instanceof Error ? error.message : "未知错误", variant: "destructive" });
    }
  }

  async function handleRunSkillBatch(action: "distribute" | "uninstall") {
    if (!activeWorkspaceId) {
      toast({ title: "请先创建工作区", variant: "destructive" });
      return;
    }
    if (skillsTargetIds.length === 0) {
      toast({ title: "请选择分发目标", variant: "destructive" });
      return;
    }
    const confirmed = window.confirm(
      `确认对 ${skillSelectedIds.length} 个 Skills 在 ${skillsTargetIds.length} 个目标执行${action === "distribute" ? "分发" : "卸载"}吗？`,
    );
    if (!confirmed) {
      return;
    }
    try {
      if (action === "distribute") {
        await distributeSkills(activeWorkspaceId, skillsTargetIds);
        toast({ title: "批量分发完成" });
      } else {
        await uninstallSkills(activeWorkspaceId, skillsTargetIds);
        toast({ title: "批量卸载完成" });
      }
    } catch (error) {
      toast({ title: "批量操作失败", description: error instanceof Error ? error.message : "未知错误", variant: "destructive" });
    }
  }

  async function handleCreateWorkspace() {
    if (!newWorkspaceName.trim() || !newWorkspacePath.trim()) {
      toast({ title: "请输入 workspace 名称与路径", variant: "destructive" });
      return;
    }
    try {
      const created = await createWorkspace({ name: newWorkspaceName.trim(), rootPath: newWorkspacePath.trim() });
      await activateWorkspace(created.id);
      toast({ title: "工作区已创建并激活" });
      setCreateWorkspaceOpen(false);
      setNewWorkspacePath("");
    } catch (error) {
      toast({ title: "创建工作区失败", description: error instanceof Error ? error.message : "未知错误", variant: "destructive" });
    }
  }

  async function handleSaveTarget() {
    if (!activeWorkspaceId) {
      toast({ title: "请先创建工作区", variant: "destructive" });
      return;
    }

    const result = await upsertTarget({
      workspaceId: activeWorkspaceId,
      platform: targetPlatform,
      targetPath,
      skillsPath: targetSkillsPath,
    });

    if (!result.ok) {
      toast({ title: result.message, variant: "destructive" });
      return;
    }
    setDirty("data", false);
    toast({ title: result.message });
  }

  async function handleSaveRuntime() {
    if (!runtimeForm) {
      return;
    }

    const result = await updateRuntimeFlags(runtimeForm);
    if (!result.ok) {
      toast({ title: result.message, variant: "destructive" });
      return;
    }
    setDirty("general", false);
    toast({ title: result.message });
  }

  async function handleWebDavAction(type: "test" | "upload" | "download") {
    try {
      const result =
        type === "test" ? await testWebDav() : type === "upload" ? await uploadWebDav() : await downloadWebDav();
      if (!result.ok) {
        toast({ title: result.message, variant: "destructive" });
        return;
      }
      setDirty("data", false);
      toast({ title: result.message });
    } catch (error) {
      toast({ title: "操作失败", description: error instanceof Error ? error.message : "未知错误", variant: "destructive" });
    }
  }

  async function handleSaveAgentConnections() {
    if (!activeWorkspaceId) {
      toast({ title: "请先创建工作区", variant: "destructive" });
      return;
    }

    const platforms: Array<"codex" | "claude"> = ["codex", "claude"];
    for (const platform of platforms) {
      const rootDir = connectionDrafts[platform] ?? "";
      if (!isAbsolutePathInput(rootDir)) {
        toast({ title: `${platform} 根目录必须是绝对路径`, variant: "destructive" });
        return;
      }
      if (connectionEnabledDrafts[platform] && !rootDir.trim()) {
        toast({ title: `${platform} 启用时根目录不能为空`, variant: "destructive" });
        return;
      }
    }

    for (const platform of platforms) {
      const result = await upsertConnection({
        workspaceId: activeWorkspaceId,
        platform,
        rootDir: connectionDrafts[platform] ?? "",
        enabled: connectionEnabledDrafts[platform],
      });
      if (!result.ok) {
        toast({ title: result.message, variant: "destructive" });
        return;
      }
    }

    await Promise.all([
      loadSettingsConnections(activeWorkspaceId),
      loadAgentConnections(activeWorkspaceId),
    ]);
    setDirty("data", false);
    toast({ title: "Agent 连接配置已保存" });
  }

  async function handleRefreshAgentModule() {
    if (!activeWorkspaceId) {
      toast({ title: "请先创建工作区", variant: "destructive" });
      return;
    }
    try {
      await loadAgentModuleData(activeWorkspaceId);
      setDeleteConfirmAssetId(null);
      const latestState = useAgentRulesStore.getState();
      const boundAssetIds = latestState.assets
        .filter((asset) => {
          const tags = latestState.tagsByAsset[asset.id] ?? asset.tags ?? [];
          return tags.length > 0;
        })
        .map((asset) => asset.id)
        .filter(Boolean);
      if (boundAssetIds.length === 0) {
        toast({
          title: "规则检查完成",
          description: "暂无已应用的规则，已刷新列表。",
        });
        return;
      }

      const driftResults = await Promise.allSettled(
        boundAssetIds.map((assetId) => refreshAgentAsset(activeWorkspaceId, assetId)),
      );
      await loadAgentModuleData(activeWorkspaceId);

      const failedCount = driftResults.filter((result) => result.status === "rejected").length;
      const byAgent = new Map<string, { clean: number; drifted: number; error: number; other: number }>();
      for (const result of driftResults) {
        if (result.status !== "fulfilled") {
          continue;
        }
        const records = Array.isArray(result.value?.records) ? result.value.records : [];
        for (const raw of records) {
          const row = (raw ?? {}) as Record<string, unknown>;
          const agent = String(row.agentType ?? row.agent_type ?? row.targetId ?? "unknown");
          const status = String(row.status ?? "");
          const stat = byAgent.get(agent) ?? { clean: 0, drifted: 0, error: 0, other: 0 };
          if (status === "clean") {
            stat.clean += 1;
          } else if (status === "drifted") {
            stat.drifted += 1;
          } else if (status === "error") {
            stat.error += 1;
          } else {
            stat.other += 1;
          }
          byAgent.set(agent, stat);
        }
      }
      const summary = Array.from(byAgent.entries())
        .map(([agent, stat]) => {
          if (stat.error > 0) {
            return `${agent} 检查异常`;
          }
          if (stat.drifted > 0) {
            return `${agent} 检测到规则变更`;
          }
          if (stat.clean > 0) {
            return `${agent} 正常`;
          }
          return `${agent} 已检查`;
        })
        .join("，");
      const failedPart =
        failedCount > 0
          ? `。有 ${failedCount} 个规则检查失败，可重试。`
          : "";
      const description = `${summary ? `规则检查完成：${summary}` : "规则检查完成。"}${failedPart}`;
      toast({
        title: "规则检查完成",
        description,
        variant: failedCount > 0 ? "destructive" : "default",
      });
    } catch (error) {
      toast({
        title: "刷新失败",
        description: error instanceof Error ? error.message : "未知错误",
        variant: "destructive",
      });
    }
  }

  function handleChangeSettingsCategory(next: SettingsCategory) {
    if (dirty[settingsCategory]) {
      const confirmed = window.confirm("当前分类有未保存改动，是否继续切换？");
      if (!confirmed) {
        return;
      }
    }
    setSettingsCategory(next);
  }

  const promptCenter = (
    <div className="space-y-4">
      <SectionTitle
        title="Prompts"
        subtitle={`共 ${filteredPrompts.length} 项`}
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setCreatePromptOpen(true)}>
              新建 Prompt
            </Button>
            <Button variant="outline" onClick={() => activeWorkspaceId && fetchPrompts(activeWorkspaceId)}>
              <RefreshCw className="mr-1 h-4 w-4" />
              刷新
            </Button>
          </div>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>视图与批量操作</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Tabs value={promptViewMode} onValueChange={(value) => setPromptViewMode(value as "list" | "gallery" | "table")}>
            <TabsList>
              <TabsTrigger value="list">列表</TabsTrigger>
              <TabsTrigger value="gallery">卡片</TabsTrigger>
              <TabsTrigger value="table">表格</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" disabled={promptSelectedIds.length === 0} onClick={() => void handlePromptBatchFavorite(true)}>
              <Star className="mr-1 h-4 w-4" />
              批量收藏
            </Button>
            <Button variant="outline" disabled={promptSelectedIds.length === 0} onClick={() => void handlePromptBatchMove()}>
              批量移动
            </Button>
            <Button variant="destructive" disabled={promptSelectedIds.length === 0} onClick={() => void handlePromptBatchDelete()}>
              <Trash2 className="mr-1 h-4 w-4" />
              批量删除
            </Button>
          </div>
        </CardContent>
      </Card>

      {promptsLoading ? <Card><CardContent className="py-8 text-sm text-slate-500">加载中...</CardContent></Card> : null}

      {!promptsLoading && filteredPrompts.length === 0 ? (
        <EmptyState title="暂无 Prompt" description="先创建一个 Prompt 开始使用。" action={<Button onClick={() => setCreatePromptOpen(true)}>立即创建</Button>} />
      ) : null}

      {!promptsLoading && filteredPrompts.length > 0 && promptViewMode === "list" ? (
        <div className="space-y-2">
          {filteredPrompts.map((item) => (
            <Card key={item.id} className={selectedPromptId === item.id ? "border-blue-300" : ""}>
              <CardContent className="flex items-start gap-3 pt-6">
                <input type="checkbox" checked={promptSelectedIds.includes(item.id)} onChange={() => togglePromptSelection(item.id)} />
                <button
                  type="button"
                  className="flex-1 text-left"
                  onClick={() => {
                    selectPrompt(item.id);
                    setMobileDetailOpen(true);
                  }}
                >
                  <div className="text-base font-semibold text-slate-900">{item.name}</div>
                  <div className="mt-1 text-xs text-slate-500">{item.category} · v{item.activeVersion} · {toLocalTime(item.updatedAt)}</div>
                  <div className="mt-2 line-clamp-2 text-sm text-slate-600">{item.content}</div>
                </button>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      {!promptsLoading && filteredPrompts.length > 0 && promptViewMode === "gallery" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {filteredPrompts.map((item) => (
            <Card key={item.id} className={selectedPromptId === item.id ? "border-blue-300" : ""}>
              <CardHeader>
                <CardTitle className="text-base">{item.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="mb-2 text-xs text-slate-500">{item.category} · v{item.activeVersion}</div>
                <div className="line-clamp-4 text-sm text-slate-600">{item.content}</div>
                <div className="mt-3 flex items-center justify-between">
                  <label className="flex items-center gap-2 text-xs text-slate-500">
                    <input type="checkbox" checked={promptSelectedIds.includes(item.id)} onChange={() => togglePromptSelection(item.id)} />
                    选择
                  </label>
                  <Button variant="outline" size="sm" onClick={() => {
                    selectPrompt(item.id);
                    setMobileDetailOpen(true);
                  }}>
                    查看详情
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      {!promptsLoading && filteredPrompts.length > 0 && promptViewMode === "table" ? (
        <DataTable
          rows={filteredPrompts}
          rowKey={(row) => row.id}
          columns={[
            {
              key: "select",
              title: "选择",
              render: (row) => <input type="checkbox" checked={promptSelectedIds.includes(row.id)} onChange={() => togglePromptSelection(row.id)} />,
              className: "w-14",
            },
            {
              key: "name",
              title: "标题",
              render: (row) => (
                <button type="button" className="text-left text-blue-600 hover:underline" onClick={() => {
                  selectPrompt(row.id);
                  setMobileDetailOpen(true);
                }}>
                  {row.name}
                </button>
              ),
            },
            { key: "category", title: "分类", render: (row) => row.category },
            { key: "version", title: "版本", render: (row) => `v${row.activeVersion}` },
            { key: "updatedAt", title: "更新时间", render: (row) => toLocalTime(row.updatedAt) },
          ]}
        />
      ) : null}

      {promptBatchResult ? (
        <Card>
          <CardHeader>
            <CardTitle>批量操作结果</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>动作：{promptBatchResult.action}</div>
            <div>成功：{promptBatchResult.success}</div>
            <div>失败：{promptBatchResult.failed}</div>
            {promptBatchResult.failures.length > 0 ? (
              <div className="rounded-md bg-red-50 p-2 text-red-700">
                {promptBatchResult.failures.map((item) => (
                  <div key={item.id}>{item.id}: {item.message}</div>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );

  const promptDetail = (
    <div className="h-full p-4">
      <SectionTitle
        title="Prompt 详情"
        subtitle={selectedPrompt ? `最后更新 ${toLocalTime(selectedPrompt.updatedAt)}` : "选择左侧 Prompt 查看详情"}
      />

      {!selectedPrompt ? (
        <EmptyState title="未选择 Prompt" description="从左侧列表中选择一个 Prompt。" />
      ) : (
        <div className="space-y-3">
          <label className="block text-xs text-slate-500">
            标题
            <Input value={detailName} onChange={(event) => setDetailName(event.currentTarget.value)} disabled />
          </label>

          <label className="block text-xs text-slate-500">
            分类
            <Input value={detailCategory} onChange={(event) => setDetailCategory(event.currentTarget.value)} />
          </label>

          <label className="block text-xs text-slate-500">
            标签（逗号分隔）
            <Input value={detailTagsInput} onChange={(event) => setDetailTagsInput(event.currentTarget.value)} />
          </label>

          <label className="flex items-center gap-2 text-xs text-slate-500">
            <input type="checkbox" checked={detailFavorite} onChange={(event) => setDetailFavorite(event.currentTarget.checked)} />
            收藏
          </label>

          <div className="space-y-1">
            <div className="text-xs text-slate-500">内容（Markdown）</div>
            <MarkdownEditor
              value={detailContent}
              onChange={setDetailContent}
              minHeight={320}
              placeholder="使用 Markdown 编写 Prompt 内容..."
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void handleSavePromptDetail()}>
              <Save className="mr-1 h-4 w-4" />
              保存
            </Button>
            <Button variant="outline" onClick={() => {
              setVariableValues({});
              setRenderedResult("");
              setVariableModalOpen(true);
            }}>
              <Play className="mr-1 h-4 w-4" />
              变量填充
            </Button>
            <Button variant="outline" onClick={() => void handleOpenPromptVersion()}>
              <History className="mr-1 h-4 w-4" />
              历史版本
            </Button>
          </div>
        </div>
      )}
    </div>
  );

  const skillsCenter = (
    <div className="space-y-4">
      <SectionTitle
        title="Skills"
        subtitle={`共 ${filteredSkills.length} 项`}
        action={
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                if (!activeWorkspaceId) {
                  toast({ title: "请先创建工作区", variant: "destructive" });
                  return;
                }
                void scanSkills(activeWorkspaceId);
              }}
            >
              扫描 Skills
            </Button>
            <Button variant="outline" onClick={() => void fetchSkills()}>
              <RefreshCw className="mr-1 h-4 w-4" />刷新
            </Button>
          </div>
        }
      />

      {!skillsLoading && filteredSkills.length === 0 ? (
        <EmptyState title="暂无 Skills" description="点击“扫描 Skills”从本地目录聚合技能。" />
      ) : null}

      {skillsLoading ? <Card><CardContent className="py-8 text-sm text-slate-500">扫描中...</CardContent></Card> : null}

      {filteredSkills.length > 0 ? (
        <DataTable
          rows={filteredSkills}
          rowKey={(row) => row.id}
          columns={[
            {
              key: "select",
              title: "选择",
              render: (row) => <input type="checkbox" checked={skillSelectedIds.includes(row.id)} onChange={() => toggleSkillSelection(row.id)} />,
              className: "w-14",
            },
            {
              key: "name",
              title: "技能",
              render: (row) => (
                <button
                  type="button"
                  className="text-left text-blue-600 hover:underline"
                  onClick={() => {
                    selectSkill(row.id);
                    setMobileDetailOpen(true);
                    void fetchSkillDetail(row.id);
                  }}
                >
                  {row.name}
                </button>
              ),
            },
            { key: "version", title: "版本", render: (row) => row.version },
            { key: "latest", title: "最新", render: (row) => row.latestVersion },
            { key: "source", title: "来源", render: (row) => row.source },
            { key: "status", title: "状态", render: (row) => (row.updateCandidate ? "可更新" : "最新") },
          ]}
        />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>平台分发</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            {targets.map((target) => (
              <label key={target.id} className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={skillsTargetIds.includes(target.id)}
                  onChange={(event) => {
                    if (event.currentTarget.checked) {
                      setSkillsTargetIds((prev) => [...prev, target.id]);
                    } else {
                      setSkillsTargetIds((prev) => prev.filter((item) => item !== target.id));
                    }
                  }}
                />
                <span>{target.platform} · {target.targetPath}</span>
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => void handleRunSkillBatch("distribute")} disabled={skillSelectedIds.length === 0}>批量安装/分发</Button>
            <Button variant="destructive" onClick={() => void handleRunSkillBatch("uninstall")} disabled={skillSelectedIds.length === 0}>批量卸载</Button>
            <Button variant="ghost" onClick={() => clearSkillSelection()}>清空选择</Button>
          </div>
        </CardContent>
      </Card>

      {skillBatchResult ? (
        <Card>
          <CardHeader>
            <CardTitle>批量结果</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>总数：{skillBatchResult.summary.total}</div>
            <div>成功：{skillBatchResult.summary.success}</div>
            <div>失败：{skillBatchResult.summary.failed}</div>
            {skillBatchResult.results.length > 0 ? (
              <div className="max-h-40 overflow-auto rounded-md border border-slate-200">
                {skillBatchResult.results.map((item, index) => (
                  <div key={`${item.skillId}-${item.targetId}-${index}`} className="border-b border-slate-100 px-2 py-1 text-xs">
                    {item.skillName}
                    {" -> "}
                    {item.platform} · {item.status} · {item.message}
                  </div>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );

  const skillsDetail = (
    <div className="h-full p-4">
      <SectionTitle title="Skill 详情" subtitle={selectedSkill ? selectedSkill.identity : "选择左侧 Skill 查看详情"} />

      {!selectedSkill ? (
        <EmptyState title="未选择 Skill" description="从左侧列表选择 Skill。" />
      ) : (
        <div className="space-y-3">
          <Tabs value={skillDetailTab} onValueChange={(value) => setSkillDetailTab(value as "preview" | "source" | "files")}>
            <TabsList>
              <TabsTrigger value="preview">预览</TabsTrigger>
              <TabsTrigger value="source">源码/内容</TabsTrigger>
              <TabsTrigger value="files">文件</TabsTrigger>
            </TabsList>

            <TabsContent value="preview">
              <Textarea rows={18} value={normalizeSkillPreview(selectedSkill)} readOnly />
            </TabsContent>

            <TabsContent value="source">
              <Textarea rows={18} value={JSON.stringify(selectedSkillDetail?.versions ?? [], null, 2)} readOnly />
            </TabsContent>

            <TabsContent value="files">
              <div className="grid grid-cols-[180px_1fr] gap-3">
                <div className="rounded-md border border-slate-200 p-2 text-sm">
                  <div className="py-1 text-slate-700">SKILL.md</div>
                  <div className="py-1 text-slate-700">README.md</div>
                  <div className="py-1 text-slate-700">scripts/</div>
                </div>
                <Textarea
                  rows={18}
                  readOnly
                  value={`# 文件编辑器容器\n\nlocalPath: ${selectedSkill.localPath}\n\n当前版本: ${selectedSkill.version}\n`}
                />
              </div>
            </TabsContent>
          </Tabs>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setSkillVersionModalOpen(true)}>
              <FileCode2 className="mr-1 h-4 w-4" />版本对比
            </Button>
          </div>
        </div>
      )}
    </div>
  );
  const agentsCenter = (
    <div className="space-y-4">
      <SectionTitle
        title="全局 Agent 规则管理"
        subtitle={`规则文件 ${agentAssets.length} 个 · 已接入 Agent ${agentConnections.length} 个`}
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void handleRefreshAgentModule()}>
              <RefreshCw className="mr-1 h-4 w-4" />
              刷新
            </Button>
            <Button onClick={() => handleCreateNewAgentAsset()} disabled={!activeWorkspaceId}>
              新建规则文件
            </Button>
          </div>
        }
      />

      {agentRulesError ? (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="flex items-center justify-between gap-3 py-3 text-sm text-red-700">
            <span className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              {agentRulesError}
            </span>
            <Button size="sm" variant="outline" onClick={() => clearAgentRulesError()}>
              清除
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>规则列表</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {filteredAgentAssets.length === 0 ? (
            <div className="text-slate-500">暂无规则文件，点击“新建规则文件”开始。</div>
          ) : (
            pagedAgentAssets.map((asset) => {
              const tags = agentTagsByAsset[asset.id] ?? asset.tags ?? [];
              return (
                <div
                  key={asset.id}
                  className="group cursor-pointer rounded-md border border-slate-200 px-3 py-2"
                  onClick={() => {
                    void openAgentRuleEditor(asset.id);
                  }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-900">{asset.name}</span>
                      <span className="text-xs text-slate-500">
                        版本 v{asset.latestVersion ?? "-"} · {toLocalTime(asset.updatedAt)}
                      </span>
                    </div>
                    <div className="flex gap-2 opacity-0 pointer-events-none transition-opacity group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleOpenAgentVersionDiff(asset.id);
                        }}
                      >
                        版本对比
                      </Button>
                      <Button
                        size="sm"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedAssetId(asset.id);
                          setCreatingAgentAsset(false);
                          setAgentDistributionModalOpen(true);
                        }}
                        disabled={agentConnections.length === 0}
                      >
                        应用
                      </Button>
                      <div className="relative">
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600 hover:text-red-700"
                          onClick={(event) => {
                            event.stopPropagation();
                            setDeleteConfirmAssetId((prev) =>
                              prev === asset.id ? null : asset.id,
                            );
                          }}
                        >
                          删除
                        </Button>
                        {deleteConfirmAssetId === asset.id ? (
                          <div
                            className="absolute right-0 top-10 z-20 w-56 rounded-md border border-red-200 bg-white p-2 text-xs shadow-lg"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <div className="text-slate-700">
                              确认彻底删除「{asset.name}」？
                            </div>
                            <div className="mt-2 flex justify-end gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setDeleteConfirmAssetId(null);
                                }}
                              >
                                取消
                              </Button>
                              <Button
                                size="sm"
                                className="bg-red-600 hover:bg-red-700"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void handleDeleteAgentRuleAsset(asset.id, asset.name);
                                }}
                              >
                                确认删除
                              </Button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {tags.length === 0 ? (
                      <span className="text-xs text-slate-400">暂无 Agent 标签</span>
                    ) : (
                      tags.map((tag) => {
                        const status = String(
                          (tag as Record<string, unknown>).status ??
                            (tag as Record<string, unknown>).driftStatus ??
                            "clean",
                        );
                        const label =
                          status === "drifted"
                            ? "border-[#ffccc7] bg-[#fff2f0] text-[#ff4d4f]"
                            : status === "clean" || status === "synced" || status === "success"
                              ? "border-[#b7eb8f] bg-[#f6ffed] text-[#52c41a]"
                              : status === "error"
                                ? "border-amber-200 bg-amber-50 text-amber-700"
                                : "border-slate-200 bg-slate-50 text-slate-700";
                        const agentType = String(
                          (tag as Record<string, unknown>).agentType ??
                            (tag as Record<string, unknown>).agent_type ??
                            "unknown",
                        );
                        return (
                          <span key={`${asset.id}-${agentType}`} className={`rounded-full border px-2 py-1 text-xs ${label}`}>
                            {agentType}
                            {status === "drifted" ? " · drifted" : ""}
                          </span>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })
          )}
          {filteredAgentAssets.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2 text-xs text-slate-500">
              <span>
                共 {filteredAgentAssets.length} 个 · 每页 {AGENT_RULES_PAGE_SIZE} 条
              </span>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={agentRulesPage <= 1}
                  onClick={() => setAgentRulesPage((prev) => Math.max(1, prev - 1))}
                >
                  上一页
                </Button>
                <span>
                  {agentRulesPage} / {totalAgentPages}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={agentRulesPage >= totalAgentPages}
                  onClick={() => setAgentRulesPage((prev) => Math.min(totalAgentPages, prev + 1))}
                >
                  下一页
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>平台文件映射</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {agentConnections.length === 0 ? (
            <div className="text-slate-500">暂无接入 Agent，请先在设置中配置根目录。</div>
          ) : (
            agentConnections.map((connection) => {
              const platform = connection.agentType.toLowerCase();
              const mappedPath = resolvePlatformRulePath(platform);
              const resolvedPath =
                connection.resolvedPath ||
                (connection.rootDir
                  ? `${connection.rootDir.replace(/\/$/, "")}/${mappedPath}`
                  : mappedPath);
              return (
                <div
                  key={`mapping-${connection.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 px-3 py-2"
                >
                  <div>
                    <div className="font-medium">{platform}</div>
                    <div className="text-xs text-slate-500">{connection.rootDir || "(未配置根目录)"}</div>
                    <div className="text-xs text-slate-500">
                      <code>{resolvedPath}</code>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => void handleOpenAgentMappingPreview(platform)}>
                    预览
                  </Button>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );

  const settingsCenter = (
    <div className="space-y-4">
      <SectionTitle title="设置" subtitle="配置 workspace、分发目标、运行模式与 WebDAV 同步。" />

      <Card>
        <CardHeader>
          <CardTitle>设置分组</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {settingCategories.map((category) => (
            <Button
              key={category.key}
              variant={settingsCategory === category.key ? "default" : "outline"}
              onClick={() => handleChangeSettingsCategory(category.key)}
            >
              {category.label}
            </Button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>工作区</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {workspaces.map((workspace) => (
              <Button
                key={workspace.id}
                variant={workspace.id === activeWorkspaceId ? "default" : "outline"}
                onClick={() => void activateWorkspace(workspace.id)}
              >
                {workspace.name}
              </Button>
            ))}
            <Button variant="outline" onClick={() => setCreateWorkspaceOpen(true)}>
              新建工作区
            </Button>
          </div>
        </CardContent>
      </Card>

      {settingsLoading ? <Card><CardContent className="py-8 text-sm text-slate-500">加载设置中...</CardContent></Card> : null}
    </div>
  );

  const settingsDetail = (
    <div className="h-full p-4">
      <SectionTitle title={settingCategories.find((item) => item.key === settingsCategory)?.label ?? "设置"} />

      {settingsCategory === "general" ? (
        <Card>
          <CardHeader>
            <CardTitle>运行开关</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {runtimeForm ? (
              <>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={runtimeForm.localMode}
                    onChange={(event) => {
                      setRuntimeForm({ ...runtimeForm, localMode: event.currentTarget.checked });
                      setDirty("general", true);
                    }}
                  />
                  本地模式
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={runtimeForm.externalSourcesEnabled}
                    onChange={(event) => {
                      setRuntimeForm({ ...runtimeForm, externalSourcesEnabled: event.currentTarget.checked });
                      setDirty("general", true);
                    }}
                  />
                  外部源开关
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={runtimeForm.experimentalEnabled}
                    onChange={(event) => {
                      setRuntimeForm({ ...runtimeForm, experimentalEnabled: event.currentTarget.checked });
                      setDirty("general", true);
                    }}
                  />
                  实验功能
                </label>
                <div className="text-xs text-slate-500">更新时间：{toLocalTime(runtimeForm.updatedAt)}</div>
                <Button onClick={() => void handleSaveRuntime()}>保存运行开关</Button>
              </>
            ) : (
              <div className="text-slate-500">暂无运行配置</div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {settingsCategory === "data" ? (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Agent 连接配置</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {(["codex", "claude"] as const).map((platform) => {
                const connection = settingsConnections.find(
                  (item) => item.platform.toLowerCase() === platform,
                );
                const resolvedPath =
                  connection?.resolvedPath ??
                  (connectionDrafts[platform]
                    ? `${connectionDrafts[platform].replace(/\/$/, "")}/${resolvePlatformRulePath(platform)}`
                    : "");
                return (
                  <div key={`conn-${platform}`} className="rounded-md border border-slate-200 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <div className="font-semibold">{platform}</div>
                      <label className="flex items-center gap-2 text-xs text-slate-600">
                        <input
                          type="checkbox"
                          checked={Boolean(connectionEnabledDrafts[platform])}
                          onChange={(event) => {
                            const enabled = event.currentTarget.checked;
                            setConnectionEnabledDrafts((prev) => ({
                              ...prev,
                              [platform]: enabled,
                            }));
                            setDirty("data", true);
                          }}
                        />
                        已启用
                      </label>
                    </div>
                    <label className="block text-xs text-slate-500">
                      根目录（绝对路径）
                      <Input
                        value={connectionDrafts[platform] ?? ""}
                        onChange={(event) => {
                          const value = event.currentTarget.value;
                          setConnectionDrafts((prev) => ({ ...prev, [platform]: value }));
                          setDirty("data", true);
                        }}
                        placeholder={platform === "codex" ? "/Users/you/workspace" : "/Users/you/project"}
                      />
                    </label>
                    <div className="mt-2 text-xs text-slate-500">
                      规则文件：<code>{resolvePlatformRulePath(platform)}</code>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      解析路径：<code>{resolvedPath || "-"}</code>
                    </div>
                  </div>
                );
              })}

              <Button onClick={() => void handleSaveAgentConnections()}>
                保存 Agent 连接
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>分发目标配置</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <label className="block">
                平台
                <Input value={targetPlatform} onChange={(event) => { setTargetPlatform(event.currentTarget.value); setDirty("data", true); }} />
              </label>
              <label className="block">
                目标路径
                <Input value={targetPath} onChange={(event) => { setTargetPath(event.currentTarget.value); setDirty("data", true); }} />
              </label>
              <label className="block">
                Skills 路径
                <Input value={targetSkillsPath} onChange={(event) => { setTargetSkillsPath(event.currentTarget.value); setDirty("data", true); }} />
              </label>
              <Button onClick={() => void handleSaveTarget()}>保存目标配置</Button>

              <div className="rounded-md border border-slate-200 p-2 text-xs">
                {targets.length === 0 ? "暂无目标" : targets.map((target) => (
                  <div key={target.id} className="py-1">
                    {target.platform} · {target.targetPath} · {target.installMode}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>WebDAV 同步</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={webdav.enabled}
                  onChange={(event) => {
                    setWebDav({ ...webdav, enabled: event.currentTarget.checked });
                    setDirty("data", true);
                  }}
                />
                启用 WebDAV
              </label>

              <label className="block">
                服务器地址
                <Input
                  value={webdav.endpoint}
                  onChange={(event) => {
                    setWebDav({ ...webdav, endpoint: event.currentTarget.value });
                    setDirty("data", true);
                  }}
                  placeholder="https://dav.example.com/path"
                />
              </label>

              <label className="block">
                用户名
                <Input
                  value={webdav.username}
                  onChange={(event) => {
                    setWebDav({ ...webdav, username: event.currentTarget.value });
                    setDirty("data", true);
                  }}
                />
              </label>

              <label className="block">
                密码
                <Input
                  type="password"
                  value={webdav.password}
                  onChange={(event) => {
                    setWebDav({ ...webdav, password: event.currentTarget.value });
                    setDirty("data", true);
                  }}
                />
              </label>

              <label className="block">
                自动运行模式
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={webdav.autoMode}
                  onChange={(event) => {
                    setWebDav({ ...webdav, autoMode: event.currentTarget.value as "off" | "startup" | "interval" });
                    setDirty("data", true);
                  }}
                >
                  <option value="off">关闭</option>
                  <option value="startup">启动后运行一次</option>
                  <option value="interval">定时运行</option>
                </select>
              </label>

              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => void handleWebDavAction("test")}>测试连接</Button>
                <Button onClick={() => void handleWebDavAction("upload")}>上传</Button>
                <Button variant="outline" onClick={() => void handleWebDavAction("download")}>下载</Button>
              </div>

              <div className="text-xs text-slate-500">最近同步：{toLocalTime(webdav.lastSyncAt)}</div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {settingsCategory !== "general" && settingsCategory !== "data" ? (
        <Card>
          <CardContent className="pt-6 text-sm text-slate-500">{settingCategories.find((item) => item.key === settingsCategory)?.label} 页面骨架已就绪，可继续补充细项配置。</CardContent>
        </Card>
      ) : null}
    </div>
  );

  const center =
    activeModule === "prompts"
      ? promptCenter
      : activeModule === "skills"
        ? skillsCenter
        : activeModule === "agents"
          ? agentsCenter
          : settingsCenter;
  const detail =
    activeModule === "prompts"
      ? promptDetail
      : activeModule === "skills"
        ? skillsDetail
        : settingsDetail;

  return (
    <>
      <AppShell
        activeModule={activeModule}
        onChangeModule={setActiveModule}
        promptCount={prompts.length}
        skillCount={skills.length}
        agentRulesCount={agentAssets.length}
        searchQuery={query}
        onSearchQuery={(next) => {
          setQuery(next);
          if (activeWorkspaceId && activeModule === "prompts") {
            if (next.trim()) {
              void searchPrompts(activeWorkspaceId, next);
            } else {
              void fetchPrompts(activeWorkspaceId);
            }
          }
        }}
        searchHits={searchHits}
        onSelectSearchHit={handleSelectSearchHit}
        onQuickCreate={handleQuickCreate}
        onOpenSettings={() => {
          setActiveModule("settings");
          setSettingsCategory("general");
        }}
        onToggleTheme={handleToggleTheme}
        sidebarOpen={sidebarOpen}
        onSidebarOpen={setSidebarOpen}
        mobileDetailOpen={mobileDetailOpen}
        onMobileDetailOpen={setMobileDetailOpen}
        showDetailPanel={activeModule !== "agents"}
        center={center}
        detail={detail}
      />

      <Dialog open={createPromptOpen} onOpenChange={setCreatePromptOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>新建 Prompt</DialogTitle>
            <DialogDescription>创建并立即加入列表。</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label className="block text-xs text-slate-500">
              名称
              <Input value={newPromptName} onChange={(event) => setNewPromptName(event.currentTarget.value)} />
            </label>
            <div className="space-y-1">
              <div className="text-xs text-slate-500">内容（Markdown）</div>
              <MarkdownEditor
                value={newPromptContent}
                onChange={setNewPromptContent}
                minHeight={260}
                placeholder="使用 Markdown 编写 Prompt 内容..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreatePromptOpen(false)}>取消</Button>
            <Button onClick={() => void handleCreatePrompt()}>创建</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createWorkspaceOpen} onOpenChange={setCreateWorkspaceOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建工作区</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <label className="block text-xs text-slate-500">
              名称
              <Input value={newWorkspaceName} onChange={(event) => setNewWorkspaceName(event.currentTarget.value)} />
            </label>
            <label className="block text-xs text-slate-500">
              路径
              <Input value={newWorkspacePath} onChange={(event) => setNewWorkspacePath(event.currentTarget.value)} placeholder="/path/to/workspace" />
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateWorkspaceOpen(false)}>取消</Button>
            <Button onClick={() => void handleCreateWorkspace()}>创建并激活</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={variableModalOpen} onOpenChange={setVariableModalOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>变量填充</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              {requiredVariables.length === 0 ? (
                <div className="rounded-md bg-slate-50 p-2 text-sm text-slate-500">当前 Prompt 无变量。</div>
              ) : (
                requiredVariables.map((key) => (
                  <label key={key} className="block text-xs text-slate-500">
                    {`{{${key}}}`}
                    <Input
                      value={variableValues[key] ?? ""}
                      onChange={(event) => setVariableValues((prev) => ({ ...prev, [key]: event.currentTarget.value }))}
                    />
                  </label>
                ))
              )}
              {requiredVariables.length > 0 && missingVariables.length > 0 ? (
                <div className="rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-700">
                  仍有 {missingVariables.length} 个变量未填写，完成后可执行渲染
                </div>
              ) : null}
              <Button
                onClick={() => void handlePromptRender()}
                disabled={requiredVariables.length > 0 && missingVariables.length > 0}
              >
                执行渲染
              </Button>
            </div>
            <div className="space-y-2">
              <div className="text-xs text-slate-500">预览结果</div>
              <Textarea rows={12} readOnly value={variablePreview} />
              <div className="text-xs text-slate-500">渲染返回</div>
              <Textarea rows={8} readOnly value={renderedResult} />
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={versionModalOpen} onOpenChange={setVersionModalOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Prompt 历史版本</DialogTitle>
          </DialogHeader>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="block text-xs text-slate-500">
              左侧版本
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={compareLeftVersion ?? ""}
                onChange={(event) => setCompareLeftVersion(Number(event.currentTarget.value))}
              >
                <option value="">请选择</option>
                {selectedPromptVersions.map((item) => (
                  <option key={`left-${item.version}`} value={item.version}>v{item.version} · {toLocalTime(item.createdAt)}</option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-slate-500">
              右侧版本
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={compareRightVersion ?? ""}
                onChange={(event) => setCompareRightVersion(Number(event.currentTarget.value))}
              >
                <option value="">请选择</option>
                {selectedPromptVersions.map((item) => (
                  <option key={`right-${item.version}`} value={item.version}>v{item.version} · {toLocalTime(item.createdAt)}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="max-h-[340px] overflow-auto rounded-md border border-slate-200 bg-slate-50 p-2 text-xs">
            {promptDiffLines.length === 0 ? (
              <div className="text-slate-500">请选择两个版本进行对比。</div>
            ) : (
              promptDiffLines.map((line, index) => (
                <div
                  key={`${line.type}-${index}`}
                  className={
                    line.type === "added"
                      ? "bg-green-50 text-green-700"
                      : line.type === "removed"
                        ? "bg-red-50 text-red-700"
                        : "text-slate-700"
                  }
                >
                  <span className="inline-block w-4">{line.type === "added" ? "+" : line.type === "removed" ? "-" : " "}</span>
                  <span>{line.text}</span>
                </div>
              ))
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              disabled={compareRightVersion === null || !selectedPrompt}
              onClick={() => {
                if (!selectedPrompt || compareRightVersion === null) {
                  return;
                }
                void (async () => {
                  try {
                    await restorePromptVersion(selectedPrompt.id, compareRightVersion);
                    if (activeWorkspaceId) {
                      await fetchPrompts(activeWorkspaceId);
                    }
                    toast({ title: "已恢复指定版本" });
                    setVersionModalOpen(false);
                  } catch (error) {
                    toast({ title: "恢复失败", description: error instanceof Error ? error.message : "未知错误", variant: "destructive" });
                  }
                })();
              }}
            >
              恢复右侧版本
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={skillVersionModalOpen} onOpenChange={setSkillVersionModalOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Skill 版本对比</DialogTitle>
          </DialogHeader>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="block text-xs text-slate-500">
              左侧版本
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={skillCompareLeftVersion}
                onChange={(event) => setSkillCompareLeftVersion(event.currentTarget.value)}
              >
                <option value="">请选择</option>
                {(selectedSkillDetail?.versions ?? []).map((item) => (
                  <option key={`skill-left-${item.version}`} value={item.version}>v{item.version} · {toLocalTime(item.installedAt)}</option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-slate-500">
              右侧版本
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={skillCompareRightVersion}
                onChange={(event) => setSkillCompareRightVersion(event.currentTarget.value)}
              >
                <option value="">请选择</option>
                {(selectedSkillDetail?.versions ?? []).map((item) => (
                  <option key={`skill-right-${item.version}`} value={item.version}>v{item.version} · {toLocalTime(item.installedAt)}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="max-h-[340px] overflow-auto rounded-md border border-slate-200 bg-slate-50 p-2 text-xs">
            {skillVersionDiffLines.length === 0 ? (
              <div className="text-slate-500">请选择两个版本进行对比。</div>
            ) : (
              skillVersionDiffLines.map((line, index) => (
                <div
                  key={`${line.type}-${index}`}
                  className={
                    line.type === "added"
                      ? "bg-green-50 text-green-700"
                      : line.type === "removed"
                        ? "bg-red-50 text-red-700"
                        : "text-slate-700"
                  }
                >
                  <span className="inline-block w-4">{line.type === "added" ? "+" : line.type === "removed" ? "-" : " "}</span>
                  <span>{line.text}</span>
                </div>
              ))
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={!skillCompareRightVersion}
              onClick={() => {
                if (!skillCompareRightVersion) {
                  return;
                }
                const confirmed = window.confirm(`确认更新为版本 ${skillCompareRightVersion} 吗？`);
                if (!confirmed) {
                  return;
                }
                toast({ title: "已确认更新流程", description: `目标版本 ${skillCompareRightVersion}` });
              }}
            >
              更新到右侧版本
            </Button>
            <Button
              variant="outline"
              disabled={!skillCompareLeftVersion}
              onClick={() => {
                if (!skillCompareLeftVersion) {
                  return;
                }
                const confirmed = window.confirm(`确认回滚到版本 ${skillCompareLeftVersion} 吗？`);
                if (!confirmed) {
                  return;
                }
                toast({ title: "已确认回滚流程", description: `目标版本 ${skillCompareLeftVersion}` });
              }}
            >
              回滚到左侧版本
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={agentVersionModalOpen} onOpenChange={setAgentVersionModalOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>规则版本对比</DialogTitle>
            <DialogDescription>{selectedAgentAsset?.name ?? "请选择规则文件"}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="block text-xs text-slate-500">
              左侧版本
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={agentCompareLeftVersion}
                onChange={(event) => setAgentCompareLeftVersion(event.currentTarget.value)}
              >
                <option value="">请选择</option>
                {selectedAgentVersions.map((item) => (
                  <option key={`agent-left-${item.version}`} value={String(item.version)}>
                    v{item.version} · {toLocalTime(item.createdAt)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-slate-500">
              右侧版本
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={agentCompareRightVersion}
                onChange={(event) => setAgentCompareRightVersion(event.currentTarget.value)}
              >
                <option value="">请选择</option>
                {selectedAgentVersions.map((item) => (
                  <option key={`agent-right-${item.version}`} value={String(item.version)}>
                    v{item.version} · {toLocalTime(item.createdAt)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="max-h-[340px] overflow-auto rounded-md border border-slate-200 bg-slate-50 p-2 text-xs">
            {agentVersionDiffLines.length === 0 ? (
              <div className="text-slate-500">请选择两个版本进行对比。</div>
            ) : (
              agentVersionDiffLines.map((line, index) => (
                <div
                  key={`${line.type}-${index}`}
                  className={
                    line.type === "added"
                      ? "bg-green-50 text-green-700"
                      : line.type === "removed"
                        ? "bg-red-50 text-red-700"
                        : "text-slate-700"
                  }
                >
                  <span className="inline-block w-4">{line.type === "added" ? "+" : line.type === "removed" ? "-" : " "}</span>
                  <span>{line.text}</span>
                </div>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAgentVersionModalOpen(false)}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={agentRuleEditorModalOpen} onOpenChange={setAgentRuleEditorModalOpen}>
        <DialogContent className="flex max-h-[90vh] max-w-5xl flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>{creatingAgentAsset ? "创建规则文件" : "规则编辑/预览"}</DialogTitle>
            <DialogDescription>
              {creatingAgentAsset
                ? "新建规则文件"
                : selectedAgentAsset
                  ? `${selectedAgentAsset.name} · v${selectedAgentAsset.latestVersion ?? "-"}`
                  : "请选择规则文件"}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 space-y-3 overflow-auto pr-1 text-sm">
            {creatingAgentAsset ? (
              <label className="block text-xs text-slate-500">
                规则文件名称
                <Input
                  value={agentAssetNameInput}
                  onChange={(event) => setAgentAssetNameInput(event.currentTarget.value)}
                  placeholder="例如：团队规范A"
                />
              </label>
            ) : (
              <div className="text-xs text-slate-500">
                文件：{selectedAgentAsset?.name || "-"}
                {" · "}
                最后更新时间：{toLocalTime(selectedAgentAsset?.updatedAt)}
              </div>
            )}

            <MarkdownEditor
              value={agentEditorContent}
              onChange={setAgentEditorContent}
              minHeight={320}
              maxHeight={520}
              placeholder="使用 Markdown 编写全局规则..."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAgentRuleEditorModalOpen(false)}>
              关闭
            </Button>
            <Button
              variant="outline"
              onClick={() => setAgentDistributionModalOpen(true)}
              disabled={creatingAgentAsset}
            >
              应用
            </Button>
            <Button onClick={() => void handleSaveAgentRuleVersion()}>
              <Save className="mr-1 h-4 w-4" />
              {creatingAgentAsset ? "创建规则文件" : "保存并生成新版本"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={agentDistributionModalOpen} onOpenChange={setAgentDistributionModalOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>应用规则</DialogTitle>
            <DialogDescription>确认规则资产与目标 Agent 后立即应用。</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <label className="block text-xs text-slate-500">
              规则资产
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={selectedAssetId ?? ""}
                onChange={(event) => setSelectedAssetId(event.currentTarget.value || null)}
              >
                <option value="">请选择规则资产</option>
                {agentAssets.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.name} · v{asset.latestVersion ?? "-"}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid gap-2">
              {agentConnections.length === 0 ? (
                <div className="rounded-md border border-slate-200 px-3 py-2 text-xs text-slate-500">暂无 Agent 连接，请先在设置中配置。</div>
              ) : (
                agentConnections.map((target) => {
                  const checked = agentTargetIds.includes(target.agentType);
                  const mappedPath = resolvePlatformRulePath(target.agentType);
                  const resolvedPath =
                    target.resolvedPath ||
                    (target.rootDir
                      ? `${target.rootDir.replace(/\/$/, "")}/${mappedPath}`
                      : mappedPath);
                  return (
                    <label key={target.id} className="flex items-center justify-between gap-3 rounded-md border border-slate-200 px-3 py-2 text-xs">
                      <span className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) => {
                            if (event.currentTarget.checked) {
                              setAgentTargetIds((prev) => [...prev, target.agentType]);
                            } else {
                              setAgentTargetIds((prev) =>
                                prev.filter((item) => item !== target.agentType),
                              );
                            }
                          }}
                        />
                        {target.agentType}
                        {" · "}
                        {target.rootDir || "(未配置 root_dir)"}
                      </span>
                      <code>{resolvedPath}</code>
                    </label>
                  );
                })
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAgentDistributionModalOpen(false)}>
              取消
            </Button>
            <Button onClick={() => void handleRunAgentDistribution()}>应用</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={mappingPreviewOpen} onOpenChange={setMappingPreviewOpen}>
        <DialogContent className="flex max-h-[85vh] max-w-3xl flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>平台文件预览</DialogTitle>
            <DialogDescription>
              {mappingPreviewPlatform}
              {" · "}
              {mappingPreviewPath || "-"}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 space-y-2 overflow-auto pr-1 text-sm">
            <div className={mappingPreviewExists ? "text-green-700" : "text-amber-700"}>
              {mappingPreviewMessage}
            </div>
            <MarkdownEditor value={mappingPreviewContent || ""} readOnly minHeight={240} maxHeight={480} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMappingPreviewOpen(false)}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
