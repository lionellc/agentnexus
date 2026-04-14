import { ArrowLeft, ChevronDown, ChevronRight, RefreshCw } from "lucide-react";
import type { ReactElement } from "react";

import { DataTable } from "../../common/components/DataTable";
import { EmptyState } from "../../common/components/EmptyState";
import { MarkdownPreview } from "../../common/components/MarkdownEditor";
import { SectionTitle } from "../../common/components/SectionTitle";
import { TranslatableTextViewer } from "../../common/components/TranslatableTextViewer";
import { Button, Card, CardContent, Input, Tabs, TabsContent, TabsList, TabsTrigger } from "../../../shared/ui";
import type {
  SkillAsset,
  SkillOpenMode,
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
  skillDetailView: "list" | "detail";
  filteredSkills: SkillAsset[];
  skillsLoading: boolean;
  skillQuery: string;
  setSkillQuery: (value: string) => void;
  showSkillOpenModeInStatusBar: boolean;
  selectBaseClass: string;
  skillOpenMode: SkillOpenMode;
  setSkillOpenMode: (value: SkillOpenMode) => void;
  skillOpenModeOptions: SkillOpenModeOption[];
  skillSourceFilter: string;
  setSkillSourceFilter: (value: string) => void;
  skillSources: string[];
  onScanSkills: () => void;
  onRefreshSkills: () => void;
  pagedSkills: SkillAsset[];
  onOpenSkillDetail: (skill: SkillAsset) => void;
  onSkillOpen: (skillId: string, relativePath?: string) => void;
  skillsPage: number;
  setSkillsPage: (updater: number | ((prev: number) => number)) => void;
  totalSkillsPages: number;
  skillsPageSize: number;
  onBackToSkillList: () => void;
  selectedSkill: SkillAsset | null;
  skillDetailTab: "overview" | "files";
  setSkillDetailTab: (value: "overview" | "files") => void;
  onReadSkillFile: (skillId: string, relativePath: string) => void;
  skillFileReadLoading: boolean;
  selectedSkillOverviewRead: SkillsFileReadResult | null;
  uiLanguage: "zh" | "en";
  selectedSkillTree: SkillsFileTreeResult | undefined;
  skillTreeLoading: boolean;
  onLoadSkillTree: (skillId: string, force?: boolean) => void;
  renderSkillTreeNodes: (nodes: SkillsFileTreeNode[], skillId: string, depth?: number) => ReactElement[];
  selectedSkillFilePath: string;
  selectedSkillFileRead: SkillsFileReadResult | null;
  selectedSkillTranslationKey: string;
  selectedSkillTranslatedText: string;
  isZh: boolean;
  translationTargetLanguage: string;
  translationTargetLanguageOptions: TranslationTargetLanguageOption[];
  modelTestRunning: boolean;
  setTranslationTargetLanguage: (value: string) => void;
  onTranslateSkillFile: () => void;
  shouldUseMarkdownPreview: (language: string) => boolean;
  l: (zh: string, en: string) => string;
};

export function SkillsCenter({
  skillDetailView,
  filteredSkills,
  skillsLoading,
  skillQuery,
  setSkillQuery,
  showSkillOpenModeInStatusBar,
  selectBaseClass,
  skillOpenMode,
  setSkillOpenMode,
  skillOpenModeOptions,
  skillSourceFilter,
  setSkillSourceFilter,
  skillSources,
  onScanSkills,
  onRefreshSkills,
  pagedSkills,
  onOpenSkillDetail,
  onSkillOpen,
  skillsPage,
  setSkillsPage,
  totalSkillsPages,
  skillsPageSize,
  onBackToSkillList,
  selectedSkill,
  skillDetailTab,
  setSkillDetailTab,
  onReadSkillFile,
  skillFileReadLoading,
  selectedSkillOverviewRead,
  uiLanguage,
  selectedSkillTree,
  skillTreeLoading,
  onLoadSkillTree,
  renderSkillTreeNodes,
  selectedSkillFilePath,
  selectedSkillFileRead,
  selectedSkillTranslationKey,
  selectedSkillTranslatedText,
  isZh,
  translationTargetLanguage,
  translationTargetLanguageOptions,
  modelTestRunning,
  setTranslationTargetLanguage,
  onTranslateSkillFile,
  shouldUseMarkdownPreview,
  l,
}: SkillsCenterProps) {
  return (
    <div className="space-y-4">
      {skillDetailView === "list" ? (
        <>
          <SectionTitle
            title="Skills"
            subtitle={l(`共 ${filteredSkills.length} 项`, `${filteredSkills.length} items`)}
            action={
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={skillQuery}
                  onChange={(event) => setSkillQuery(event.currentTarget.value)}
                  placeholder={l("搜索 Skill...", "Search skills...")}
                  className="w-56"
                />
                {!showSkillOpenModeInStatusBar ? (
                  <div className="relative">
                    <select
                      className={`${selectBaseClass} w-44`}
                      value={skillOpenMode}
                      onChange={(event) => setSkillOpenMode(event.currentTarget.value as SkillOpenMode)}
                    >
                      {skillOpenModeOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  </div>
                ) : null}
                <div className="relative">
                  <select
                    className={`${selectBaseClass} w-44`}
                    value={skillSourceFilter}
                    onChange={(event) => setSkillSourceFilter(event.currentTarget.value)}
                  >
                    <option value="all">{l("全部来源", "All sources")}</option>
                    {skillSources.map((source) => (
                      <option key={source} value={source}>
                        {source}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                </div>
                <Button variant="outline" onClick={onScanSkills}>
                  {l("扫描 Skills", "Scan Skills")}
                </Button>
                <Button variant="outline" onClick={onRefreshSkills}>
                  <RefreshCw className="mr-1 h-4 w-4" />
                  {l("刷新", "Refresh")}
                </Button>
              </div>
            }
          />

          {!skillsLoading && filteredSkills.length === 0 ? (
            <EmptyState
              title={l("暂无 Skills", "No skills")}
              description={l("点击“扫描 Skills”从本地目录聚合技能。", 'Click "Scan Skills" to discover local skills.')}
            />
          ) : null}

          {skillsLoading ? (
            <Card>
              <CardContent className="py-8 text-sm text-slate-500">{l("扫描中...", "Scanning...")}</CardContent>
            </Card>
          ) : null}

          {filteredSkills.length > 0 ? (
            <DataTable
              rows={pagedSkills}
              rowKey={(row) => row.id}
              onRowClick={(row) => {
                void onOpenSkillDetail(row);
              }}
              columns={[
                {
                  key: "name",
                  title: l("技能", "Skill"),
                  render: (row) => (
                    <div className="space-y-0.5">
                      <div className="font-medium text-slate-900">{row.name}</div>
                      <div className="text-xs text-slate-500">{row.identity}</div>
                    </div>
                  ),
                },
                {
                  key: "path",
                  title: l("文件路径", "Path"),
                  className: "w-[360px]",
                  render: (row) => (
                    <span
                      className="block max-w-[340px] truncate text-xs text-slate-500"
                      title={row.localPath}
                    >
                      {row.localPath}
                    </span>
                  ),
                },
                {
                  key: "type",
                  title: l("是否软链", "Symlink"),
                  render: (row) =>
                    row.isSymlink ? (
                      <span className="rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-700">{l("是", "Yes")}</span>
                    ) : (
                      <span className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-600">{l("否", "No")}</span>
                    ),
                },
                {
                  key: "open",
                  title: l("操作", "Actions"),
                  render: (row) => (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(event) => {
                        event.stopPropagation();
                        void onSkillOpen(row.id);
                      }}
                    >
                      {l("打开", "Open")}
                    </Button>
                  ),
                },
              ]}
            />
          ) : null}

          {!skillsLoading && filteredSkills.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2 text-xs text-slate-500">
              <span>
                {l(`共 ${filteredSkills.length} 项 · 每页 ${skillsPageSize} 条`, `${filteredSkills.length} items · ${skillsPageSize} / page`)}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={skillsPage <= 1}
                  onClick={() => setSkillsPage((prev) => Math.max(1, prev - 1))}
                >
                  {l("上一页", "Prev")}
                </Button>
                <span>
                  {skillsPage} / {totalSkillsPages}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={skillsPage >= totalSkillsPages}
                  onClick={() => setSkillsPage((prev) => Math.min(totalSkillsPages, prev + 1))}
                >
                  {l("下一页", "Next")}
                </Button>
              </div>
            </div>
          ) : null}
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
              <Button variant="outline" onClick={() => void onSkillOpen(selectedSkill.id)}>
                {l("打开目录", "Open Folder")}
              </Button>
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
                    <MarkdownPreview
                      content={selectedSkillOverviewRead.content}
                      minHeight={420}
                      maxHeight={720}
                      language={uiLanguage}
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
