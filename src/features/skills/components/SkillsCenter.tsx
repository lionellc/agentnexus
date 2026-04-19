import { ArrowLeft, ChevronRight, RefreshCw } from "lucide-react";
import type { ReactElement } from "react";

import { EmptyState } from "../../common/components/EmptyState";
import { TranslatableTextViewer } from "../../common/components/TranslatableTextViewer";
import { Button, Input, Select, Tabs, TabsContent, TabsList, TabsTrigger } from "../../../shared/ui";
import type {
  SkillOpenMode,
  SkillsManagerMode,
  SkillsFileReadResult,
  SkillsFileTreeNode,
  SkillsFileTreeResult,
} from "../../../shared/types";

type SkillOpenModeOption = {
  value: SkillOpenMode;
  label: string;
};

type TranslationTargetLanguageOption = {
  value: string;
  label: string;
};

export type SkillsCenterProps = {
  managerMode: SkillsManagerMode;
  setManagerMode: (value: SkillsManagerMode) => void;
  operationsPanel: ReactElement;
  configPanel: ReactElement;
  skillDetailView: "list" | "detail";
  filteredSkillCount: number;
  skillQuery: string;
  setSkillQuery: (value: string) => void;
  showSkillOpenModeInStatusBar: boolean;
  selectBaseClass: string;
  skillOpenMode: SkillOpenMode;
  setSkillOpenMode: (value: SkillOpenMode) => void;
  skillOpenModeOptions: SkillOpenModeOption[];
  skillsLoading: boolean;
  onScanSkills: () => void;
  onRefreshSkills: () => void;
  onBackToSkillList: () => void;
  selectedSkill: {
    id: string;
    name: string;
    localPath: string;
  } | null;
  onOpenUsageTimeline: (skillId: string) => void;
  onSkillOpen: (skillId: string, relativePath?: string) => void;
  skillDetailTab: "overview" | "files";
  setSkillDetailTab: (value: "overview" | "files") => void;
  onReadSkillFile: (skillId: string, relativePath: string) => void;
  skillFileReadLoading: boolean;
  selectedSkillOverviewRead: SkillsFileReadResult | null;
  selectedSkillTree: SkillsFileTreeResult | undefined;
  skillTreeLoading: boolean;
  onLoadSkillTree: (skillId: string, force?: boolean) => void;
  renderSkillTreeNodes: (nodes: SkillsFileTreeNode[], skillId: string, depth?: number) => ReactElement[];
  selectedSkillFilePath: string;
  selectedSkillFileRead: SkillsFileReadResult | null;
  selectedSkillOverviewTranslationKey: string;
  selectedSkillOverviewTranslatedText: string;
  selectedSkillTranslationKey: string;
  selectedSkillTranslatedText: string;
  isZh: boolean;
  translationTargetLanguage: string;
  translationTargetLanguageOptions: TranslationTargetLanguageOption[];
  modelTestRunning: boolean;
  setTranslationTargetLanguage: (value: string) => void;
  onTranslateSkillOverview: () => void;
  onTranslateSkillFile: () => void;
  shouldUseMarkdownPreview: (language: string) => boolean;
  l: (zh: string, en: string) => string;
};

export function SkillsCenter({
  managerMode,
  setManagerMode,
  operationsPanel,
  configPanel,
  skillDetailView,
  filteredSkillCount,
  skillQuery,
  setSkillQuery,
  showSkillOpenModeInStatusBar,
  selectBaseClass,
  skillOpenMode,
  setSkillOpenMode,
  skillOpenModeOptions,
  skillsLoading,
  onScanSkills,
  onRefreshSkills,
  onSkillOpen,
  onOpenUsageTimeline,
  onBackToSkillList,
  selectedSkill,
  skillDetailTab,
  setSkillDetailTab,
  onReadSkillFile,
  skillFileReadLoading,
  selectedSkillOverviewRead,
  selectedSkillTree,
  skillTreeLoading,
  onLoadSkillTree,
  renderSkillTreeNodes,
  selectedSkillFilePath,
  selectedSkillFileRead,
  selectedSkillOverviewTranslationKey,
  selectedSkillOverviewTranslatedText,
  selectedSkillTranslationKey,
  selectedSkillTranslatedText,
  isZh,
  translationTargetLanguage,
  translationTargetLanguageOptions,
  modelTestRunning,
  setTranslationTargetLanguage,
  onTranslateSkillOverview,
  onTranslateSkillFile,
  shouldUseMarkdownPreview,
  l,
}: SkillsCenterProps) {
  return (
    <div className="space-y-4">
      {skillDetailView === "list" ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Skills</h2>
              <p className="mt-1 text-sm text-slate-500">
                {l(`当前筛选 ${filteredSkillCount} 项`, `${filteredSkillCount} filtered items`)}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={skillQuery}
                onChange={(event) => setSkillQuery(event.currentTarget.value)}
                placeholder={l("搜索 Skill...", "Search skills...")}
                className="w-56"
              />
              {!showSkillOpenModeInStatusBar ? (
                <Select
                  className="w-44"
                  buttonClassName={selectBaseClass}
                  value={skillOpenMode}
                  onChange={(nextValue) => setSkillOpenMode(nextValue as SkillOpenMode)}
                  options={skillOpenModeOptions.map((option) => ({
                    value: option.value,
                    label: option.label,
                  }))}
                />
              ) : null}
              {managerMode === "config" ? (
                <Button variant="outline" onClick={onScanSkills}>
                  {l("扫描 Skills", "Scan Skills")}
                </Button>
              ) : null}
              <Button variant="outline" onClick={onRefreshSkills} disabled={skillsLoading}>
                <RefreshCw className="mr-1 h-4 w-4" />
                {l("刷新", "Refresh")}
              </Button>
            </div>
          </div>

          <Tabs value={managerMode} onValueChange={(value) => setManagerMode(value as SkillsManagerMode)}>
            <TabsList>
              <TabsTrigger value="operations">{l("中控", "Hub")}</TabsTrigger>
              <TabsTrigger value="config">{l("扫描", "Scan")}</TabsTrigger>
            </TabsList>
            <TabsContent value="operations" className="mt-3">
              {operationsPanel}
            </TabsContent>
            <TabsContent value="config" className="mt-3">
              {configPanel}
            </TabsContent>
          </Tabs>
        </>
      ) : (
        <>
          <div className="mb-4 flex w-full flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <Button size="sm" variant="outline" onClick={onBackToSkillList}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <button type="button" className="font-medium text-blue-600 hover:underline" onClick={onBackToSkillList}>
                Skills
              </button>
              <ChevronRight className="h-4 w-4 text-slate-400" />
              <span className="max-w-[380px] truncate text-slate-700">
                {selectedSkill?.name ?? l("未选择 skill", "No skill selected")}
              </span>
            </div>
            {selectedSkill ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" onClick={() => onOpenUsageTimeline(selectedSkill.id)}>
                  {l("调用记录", "Call History")}
                </Button>
                <Button variant="outline" onClick={() => void onSkillOpen(selectedSkill.id)}>
                  {l("打开", "Open")}
                </Button>
              </div>
            ) : null}
          </div>

          {!selectedSkill ? (
            <EmptyState title={l("未选择 Skill", "No skill selected")} description={l("请返回列表重新选择。", "Go back and choose a skill.")} />
          ) : (
            <>
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <div className="font-medium text-slate-500">{l("完整路径", "Full Path")}</div>
                <div className="mt-1 break-all font-mono text-slate-800">{selectedSkill.localPath || "-"}</div>
              </div>
              <Tabs value={skillDetailTab} onValueChange={(value) => setSkillDetailTab(value as "overview" | "files")}>
                <TabsList>
                  <TabsTrigger value="overview">{l("概述", "Overview")}</TabsTrigger>
                  <TabsTrigger value="files">{l("文件", "Files")}</TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="space-y-3">
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void onReadSkillFile(selectedSkill.id, "SKILL.md")}
                    >
                      {l("刷新 SKILL.md", "Refresh SKILL.md")}
                    </Button>
                  </div>
                  {skillFileReadLoading && !selectedSkillOverviewRead ? (
                    <div className="rounded-md border border-slate-200 bg-white px-3 py-4 text-sm text-slate-500">{l("加载中...", "Loading...")}</div>
                  ) : null}
                  {!selectedSkillOverviewRead ? (
                    <div className="rounded-md border border-slate-200 bg-white px-3 py-4 text-sm text-slate-500">
                      {l("未找到 SKILL.md", "SKILL.md not found")}
                    </div>
                  ) : selectedSkillOverviewRead.supported ? (
                    <TranslatableTextViewer
                      isZh={isZh}
                      sourceText={selectedSkillOverviewRead.content}
                      translatedText={selectedSkillOverviewTranslatedText}
                      targetLanguage={translationTargetLanguage}
                      targetLanguageOptions={translationTargetLanguageOptions}
                      translating={modelTestRunning}
                      onTargetLanguageChange={setTranslationTargetLanguage}
                      onTranslate={onTranslateSkillOverview}
                      defaultSourceViewMode={
                        shouldUseMarkdownPreview(selectedSkillOverviewRead.language) ? "preview" : "view"
                      }
                      sourceViewModeResetKey={selectedSkillOverviewTranslationKey}
                    />
                  ) : (
                    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-700">
                      {selectedSkillOverviewRead.message || l("SKILL.md 暂不支持预览", "SKILL.md preview is not supported")}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="files">
                  <div className="grid min-h-[560px] grid-cols-1 gap-3 lg:grid-cols-[280px_minmax(0,1fr)]">
                    <div className="flex min-h-[560px] flex-col rounded-xl border border-slate-200 bg-white p-2">
                      <div className="mb-2 flex items-center justify-between px-1">
                        <span className="text-xs font-medium text-slate-500">{l("文件树", "File Tree")}</span>
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" onClick={() => void onLoadSkillTree(selectedSkill.id, true)}>
                            <RefreshCw className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => void onSkillOpen(selectedSkill.id)}>
                            {l("打开", "Open")}
                          </Button>
                        </div>
                      </div>
                      <div className="min-h-0 flex-1 overflow-auto">
                        {skillTreeLoading ? (
                          <div className="px-2 py-2 text-xs text-slate-500">{l("读取文件树中...", "Reading file tree...")}</div>
                        ) : null}
                        {!skillTreeLoading && !selectedSkillTree?.entries?.length ? (
                          <div className="px-2 py-2 text-xs text-slate-500">{l("暂无可浏览文件", "No browsable files")}</div>
                        ) : null}
                        {selectedSkillTree?.entries?.length
                          ? renderSkillTreeNodes(selectedSkillTree.entries, selectedSkill.id)
                          : null}
                      </div>
                    </div>

                    <div className="flex min-h-[560px] min-w-0 flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-xs text-slate-500">
                          {l("当前文件：", "Current File:")}<span className="font-medium text-slate-700">{selectedSkillFilePath}</span>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void onReadSkillFile(selectedSkill.id, selectedSkillFilePath)}
                          >
                            {l("刷新", "Refresh")}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void onSkillOpen(selectedSkill.id, selectedSkillFilePath)}
                          >
                            {l("打开", "Open")}
                          </Button>
                        </div>
                      </div>
                      {skillFileReadLoading && !selectedSkillFileRead ? (
                        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">
                          {l("加载中...", "Loading...")}
                        </div>
                      ) : null}
                      {!selectedSkillFileRead ? (
                        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">
                          {l("请选择要预览的文件", "Please select a file to preview")}
                        </div>
                      ) : selectedSkillFileRead.supported ? (
                        <TranslatableTextViewer
                          isZh={isZh}
                          sourceText={selectedSkillFileRead.content}
                          translatedText={selectedSkillTranslatedText}
                          targetLanguage={translationTargetLanguage}
                          targetLanguageOptions={translationTargetLanguageOptions}
                          translating={modelTestRunning}
                          onTargetLanguageChange={setTranslationTargetLanguage}
                          onTranslate={onTranslateSkillFile}
                          defaultSourceViewMode={
                            shouldUseMarkdownPreview(selectedSkillFileRead.language) ? "preview" : "view"
                          }
                          sourceViewModeResetKey={selectedSkillTranslationKey}
                        />
                      ) : (
                        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-700">
                          {selectedSkillFileRead.message || l("该文件类型暂不支持预览", "This file type is not supported for preview")}
                        </div>
                      )}
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </>
          )}
        </>
      )}
    </div>
  );
}
