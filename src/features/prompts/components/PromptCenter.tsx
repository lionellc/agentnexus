import { Button, Card } from "@douyinfe/semi-ui-19";
import { Input as SemiInput, Select as SemiSelect } from "@douyinfe/semi-ui-19";
import { Search } from "lucide-react";

import { SectionTitle } from "../../common/components/SectionTitle";
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
  promptAllCategoryFilter: string;
  setPromptAllCategoryFilter: (value: string) => void;
  promptCategoryOptions: PromptCategoryOption[];
  setCreatePromptOpen: (open: boolean) => void;
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
  promptAllCategoryFilter,
  setPromptAllCategoryFilter,
  promptCategoryOptions,
  setCreatePromptOpen,
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
            <SemiInput
              value={promptQuery}
              onChange={(value) => setPromptQuery(value)}
              placeholder={l("搜索 Prompt...", "Search prompts...")}
              prefix={
                <span className="inline-flex pl-1 pr-2">
                  <Search className="h-4 w-4 text-slate-400" />
                </span>
              }
              showClear
              style={{ width: 240 }}
            />
            {promptBrowseScope === "all" ? (
              <SemiSelect
                aria-label={l("All 视角分类筛选", "All scope category filter")}
                value={promptAllCategoryFilter}
                onChange={(value) => setPromptAllCategoryFilter(String(value ?? ""))}
                optionList={promptCategoryOptions.map((item) => ({
                  value: item.key,
                  label: item.label,
                }))}
                style={{ width: 184 }}
              />
            ) : null}
            <Button theme="solid" type="primary" onClick={() => setCreatePromptOpen(true)}>
              {l("新建 Prompt", "New Prompt")}
            </Button>
          </div>
        }
      />

      <div className="flex items-center justify-between gap-3 overflow-x-auto">
        <div className="flex w-auto shrink-0 items-center gap-1">
          <Button
            aria-label={l("Prompts 视角 All", "Prompts scope all")}
            theme={promptBrowseScope === "all" ? "solid" : "light"}
            type={promptBrowseScope === "all" ? "primary" : "tertiary"}
            onClick={() => handleChangePromptBrowseScope("all")}
          >
            {l("All", "All")}
          </Button>
          <Button
            aria-label={l("Prompts 视角 Categories", "Prompts scope categories")}
            theme={promptBrowseScope === "categories" ? "solid" : "light"}
            type={promptBrowseScope === "categories" ? "primary" : "tertiary"}
            onClick={() => handleChangePromptBrowseScope("categories")}
          >
            {l("分类", "Categories")}
          </Button>
          <Button
            aria-label={l("Prompts 视角 Favorites", "Prompts scope favorites")}
            theme={promptBrowseScope === "favorites" ? "solid" : "light"}
            type={promptBrowseScope === "favorites" ? "primary" : "tertiary"}
            onClick={() => handleChangePromptBrowseScope("favorites")}
          >
            {l("收藏夹", "Favorites")}
          </Button>
        </div>

        <div className="flex w-auto shrink-0 items-center gap-1">
          <Button
            theme={promptViewMode === "list" ? "solid" : "light"}
            type={promptViewMode === "list" ? "primary" : "tertiary"}
            onClick={() => setPromptViewMode("list")}
          >
            {l("列表", "List")}
          </Button>
          <Button
            theme={promptViewMode === "gallery" ? "solid" : "light"}
            type={promptViewMode === "gallery" ? "primary" : "tertiary"}
            onClick={() => setPromptViewMode("gallery")}
          >
            {l("卡片", "Cards")}
          </Button>
          <Button
            theme={promptViewMode === "table" ? "solid" : "light"}
            type={promptViewMode === "table" ? "primary" : "tertiary"}
            onClick={() => setPromptViewMode("table")}
          >
            {l("表格", "Table")}
          </Button>
        </div>
      </div>

      {showPromptContextBar ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3 text-xs text-slate-600">
          <span>{l("当前浏览：", "Context:")} {promptBrowseContextLabel}</span>
          <div className="ml-auto flex items-center gap-2">
            {promptQuery.trim() ? (
              <Button onClick={() => setPromptQuery("")}>
                {l("清空搜索", "Clear search")}
              </Button>
            ) : null}
            <Button onClick={handleResetPromptBrowseContext}>
              {l("回到 All", "Back to All")}
            </Button>
          </div>
        </div>
      ) : null}

      {promptBrowseScope === "categories" ? (
        <div className="grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)]">
          <Card className="h-fit">
            <div className="space-y-1 pt-4">
              {promptCategoryOptions.map((item) => (
                <Button
                  key={item.key}
                  htmlType="button"
                  aria-label={`prompt-category-${item.key}`}
                  className={`flex h-auto w-full items-center justify-between px-2 py-1.5 text-left text-sm ${
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
                </Button>
              ))}
            </div>
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
