import { ChevronDown, RefreshCw } from "lucide-react";

import { SectionTitle } from "../../common/components/SectionTitle";
import { Button, Card, CardContent, Input, Tabs, TabsList, TabsTrigger } from "../../../shared/ui";
import type { PromptBrowseScope } from "../utils/promptBrowseContext";
import { PromptResults, type PromptResultsProps, type PromptViewMode } from "./PromptResults";

type PromptCategoryOption = {
  key: string;
  label: string;
  count: number;
  sortValue: string;
};

type PromptCenterProps = {
  l: (zh: string, en: string) => string;
  filteredPromptsCount: number;
  promptQuery: string;
  setPromptQuery: (value: string) => void;
  promptBrowseScope: PromptBrowseScope;
  selectBaseClass: string;
  promptAllCategoryFilter: string;
  setPromptAllCategoryFilter: (value: string) => void;
  promptCategoryOptions: PromptCategoryOption[];
  setCreatePromptOpen: (open: boolean) => void;
  activeWorkspaceId: string | null;
  fetchPrompts: (workspaceId: string) => Promise<void> | void;
  handleChangePromptBrowseScope: (nextScope: PromptBrowseScope) => void;
  promptViewMode: PromptViewMode;
  setPromptViewMode: (mode: PromptViewMode) => void;
  showPromptContextBar: boolean;
  promptBrowseContextLabel: string;
  handleResetPromptBrowseContext: () => void;
  setPromptBrowseCategory: (value: string) => void;
  setPromptPage: (updater: number | ((prev: number) => number)) => void;
  promptBrowseCategory: string;
  promptResultsProps: PromptResultsProps;
};

export function PromptCenter({
  l,
  filteredPromptsCount,
  promptQuery,
  setPromptQuery,
  promptBrowseScope,
  selectBaseClass,
  promptAllCategoryFilter,
  setPromptAllCategoryFilter,
  promptCategoryOptions,
  setCreatePromptOpen,
  activeWorkspaceId,
  fetchPrompts,
  handleChangePromptBrowseScope,
  promptViewMode,
  setPromptViewMode,
  showPromptContextBar,
  promptBrowseContextLabel,
  handleResetPromptBrowseContext,
  setPromptBrowseCategory,
  setPromptPage,
  promptBrowseCategory,
  promptResultsProps,
}: PromptCenterProps) {
  return (
    <div className="space-y-4">
      <SectionTitle
        title="Prompts"
        subtitle={l(`共 ${filteredPromptsCount} 项`, `${filteredPromptsCount} items`)}
        action={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Input
              value={promptQuery}
              onChange={(event) => setPromptQuery(event.currentTarget.value)}
              placeholder={l("搜索 Prompt...", "Search prompts...")}
              className="w-56"
            />
            {promptBrowseScope === "all" ? (
              <div className="relative">
                <select
                  aria-label={l("All 视角分类筛选", "All scope category filter")}
                  className={`${selectBaseClass} h-10 w-44`}
                  value={promptAllCategoryFilter}
                  onChange={(event) => setPromptAllCategoryFilter(event.currentTarget.value)}
                >
                  {promptCategoryOptions.map((item) => (
                    <option key={item.key} value={item.key}>
                      {item.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              </div>
            ) : null}
            <Button variant="outline" onClick={() => setCreatePromptOpen(true)}>
              {l("新建 Prompt", "New Prompt")}
            </Button>
            <Button variant="outline" onClick={() => activeWorkspaceId && fetchPrompts(activeWorkspaceId)}>
              <RefreshCw className="mr-1 h-4 w-4" />
              {l("刷新", "Refresh")}
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs value={promptBrowseScope} onValueChange={(value) => handleChangePromptBrowseScope(value as PromptBrowseScope)}>
          <TabsList>
            <TabsTrigger value="all" aria-label={l("Prompts 视角 All", "Prompts scope all")}>
              {l("All", "All")}
            </TabsTrigger>
            <TabsTrigger value="categories" aria-label={l("Prompts 视角 Categories", "Prompts scope categories")}>
              {l("分类", "Categories")}
            </TabsTrigger>
            <TabsTrigger value="favorites" aria-label={l("Prompts 视角 Favorites", "Prompts scope favorites")}>
              {l("收藏夹", "Favorites")}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <Tabs value={promptViewMode} onValueChange={(value) => setPromptViewMode(value as PromptViewMode)}>
          <TabsList>
            <TabsTrigger value="list">{l("列表", "List")}</TabsTrigger>
            <TabsTrigger value="gallery">{l("卡片", "Cards")}</TabsTrigger>
            <TabsTrigger value="table">{l("表格", "Table")}</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {showPromptContextBar ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3 text-xs text-slate-600">
          <span>{l("当前浏览：", "Context:")} {promptBrowseContextLabel}</span>
          <div className="ml-auto flex items-center gap-2">
            {promptQuery.trim() ? (
              <Button size="sm" variant="ghost" onClick={() => setPromptQuery("")}>
                {l("清空搜索", "Clear search")}
              </Button>
            ) : null}
            <Button size="sm" variant="outline" onClick={handleResetPromptBrowseContext}>
              {l("回到 All", "Back to All")}
            </Button>
          </div>
        </div>
      ) : null}

      {promptBrowseScope === "categories" ? (
        <div className="grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)]">
          <Card className="h-fit">
            <CardContent className="space-y-1 pt-4">
              {promptCategoryOptions.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  aria-label={`prompt-category-${item.key}`}
                  className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                    promptBrowseCategory === item.key
                      ? "bg-blue-50 text-blue-700"
                      : "text-slate-700 hover:bg-slate-100"
                  }`}
                  onClick={() => {
                    setPromptBrowseCategory(item.key);
                    setPromptPage(1);
                  }}
                >
                  <span className="truncate">{item.label}</span>
                  <span className="ml-2 text-xs opacity-75">{item.count}</span>
                </button>
              ))}
            </CardContent>
          </Card>
          <div className="space-y-3">
            <PromptResults {...promptResultsProps} />
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <PromptResults {...promptResultsProps} />
        </div>
      )}
    </div>
  );
}

export type { PromptCenterProps, PromptCategoryOption };
