import { Input } from "@douyinfe/semi-ui-19";
import { Copy, Pencil, Star, Trash2 } from "lucide-react";

import { DataTable } from "../../common/components/DataTable";
import { EmptyState } from "../../common/components/EmptyState";
import { Button, Card, CardContent, CardHeader, CardTitle, DeleteIconButton } from "../../../shared/ui";
import type { PromptAsset } from "../../../shared/types/prompts";
import type { PromptBrowseScope } from "../utils/promptBrowseContext";

export type PromptViewMode = "list" | "gallery" | "table";

export type PromptBatchJumpSuggestion =
  | { type: "favorites" }
  | { type: "category"; categoryKey: string };

export type PromptCategoryBatchResult = {
  success: number;
  failed: number;
};

type PromptBatchAction = "favorite_on" | "favorite_off" | "move" | "delete";

type PromptResultsProps = {
  l: (zh: string, en: string) => string;
  promptsLoading: boolean;
  filteredPrompts: PromptAsset[];
  promptBrowseScope: PromptBrowseScope;
  promptQuery: string;
  setPromptQuery: (value: string) => void;
  setCreatePromptOpen: (open: boolean) => void;
  handleResetPromptBrowseContext: () => void;
  promptViewMode: PromptViewMode;
  pagedPrompts: PromptAsset[];
  openPromptDetailById: (promptId: string) => void;
  formatPromptCategoryLabel: (category: string | null | undefined) => string;
  toLocalTime: (value: string | null | undefined) => string;
  handleCopyPromptFromRow: (item: PromptAsset) => Promise<void> | void;
  handleTogglePromptFavorite: (item: PromptAsset) => Promise<void> | void;
  handleDeletePrompt: (id: string, name: string) => Promise<void> | void;
  promptSelectedIds: string[];
  runPromptBatchAction: (action: PromptBatchAction) => Promise<void> | void;
  promptBatchCategory: string;
  setPromptBatchCategory: (value: string) => void;
  clearPromptSelection: () => void;
  promptBatchJumpSuggestion: PromptBatchJumpSuggestion | null;
  handleRunPromptBatchJumpSuggestion: () => void;
  promptBatchResult: PromptCategoryBatchResult | null;
  setPromptSelection: (keys: string[]) => void;
  promptTableColumnSettingsKey: string;
  extractTemplateVariables: (content: string) => string[];
  promptPage: number;
  setPromptPage: (updater: number | ((prev: number) => number)) => void;
  totalPromptPages: number;
  promptsPageSize: number;
};

export function PromptResults({
  l,
  promptsLoading,
  filteredPrompts,
  promptBrowseScope,
  promptQuery,
  setPromptQuery,
  setCreatePromptOpen,
  handleResetPromptBrowseContext,
  promptViewMode,
  pagedPrompts,
  openPromptDetailById,
  formatPromptCategoryLabel,
  toLocalTime,
  handleCopyPromptFromRow,
  handleTogglePromptFavorite,
  handleDeletePrompt,
  promptSelectedIds,
  runPromptBatchAction,
  promptBatchCategory,
  setPromptBatchCategory,
  clearPromptSelection,
  promptBatchJumpSuggestion,
  handleRunPromptBatchJumpSuggestion,
  promptBatchResult,
  setPromptSelection,
  promptTableColumnSettingsKey,
  extractTemplateVariables,
  promptPage,
  setPromptPage,
  totalPromptPages,
  promptsPageSize,
}: PromptResultsProps) {
  return (
    <>
      {promptsLoading ? <Card><CardContent className="py-8 text-sm text-slate-500">{l("加载中...", "Loading...")}</CardContent></Card> : null}

      {!promptsLoading && filteredPrompts.length === 0 ? (
        <EmptyState
          title={
            promptBrowseScope === "favorites"
              ? l("收藏夹为空", "Favorites is empty")
              : promptBrowseScope === "categories"
                ? l("该分类暂无 Prompt", "No prompts in this category")
                : l("暂无 Prompt", "No prompts")
          }
          description={
            promptQuery.trim()
              ? l("当前筛选无结果，可清空搜索或切换视角。", "No results for current filters. Clear search or switch scope.")
              : promptBrowseScope === "all"
                ? l("先创建一个 Prompt 开始使用。", "Create a prompt to get started.")
                : l("可返回 All 视角或创建新的 Prompt。", "Go back to All or create a new prompt.")
          }
          action={
            promptQuery.trim() ? (
              <Button onClick={() => setPromptQuery("")}>{l("清空搜索", "Clear search")}</Button>
            ) : promptBrowseScope === "all" ? (
              <Button onClick={() => setCreatePromptOpen(true)}>{l("立即创建", "Create now")}</Button>
            ) : (
              <Button variant="outline" onClick={handleResetPromptBrowseContext}>{l("回到 All", "Back to All")}</Button>
            )
          }
        />
      ) : null}

      {!promptsLoading && filteredPrompts.length > 0 && promptViewMode === "list" ? (
        <div className="space-y-2">
          {pagedPrompts.map((item) => (
            <Card key={item.id} className="group">
              <CardContent
                className="flex cursor-pointer items-start gap-3 pt-6"
                onClick={() => {
                  openPromptDetailById(item.id);
                }}
              >
                <div className="flex-1 text-left">
                  <div className="text-base font-semibold text-slate-900">{item.name}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {formatPromptCategoryLabel(item.category)} · v{item.activeVersion} · {toLocalTime(item.updatedAt)}
                  </div>
                  <div className="mt-2 line-clamp-2 text-sm text-slate-600">{item.content}</div>
                </div>
                <div className="pointer-events-none flex items-center gap-1 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
                  <Button
                    size="sm"
                    variant="ghost"
                    title={l("复制 Prompt", "Copy prompt")}
                    aria-label={l("复制 Prompt", "Copy prompt")}
                    onClick={(event) => {
                      event.stopPropagation();
                      void handleCopyPromptFromRow(item);
                    }}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    title={item.favorite ? l("取消收藏", "Unfavorite") : l("收藏", "Favorite")}
                    aria-label={item.favorite ? l("取消收藏", "Unfavorite") : l("收藏", "Favorite")}
                    onClick={(event) => {
                      event.stopPropagation();
                      void handleTogglePromptFavorite(item);
                    }}
                  >
                    <Star className={`h-4 w-4 ${item.favorite ? "fill-amber-400 text-amber-500" : "text-slate-500"}`} />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    title={l("编辑", "Edit")}
                    aria-label={l("编辑", "Edit")}
                    onClick={(event) => {
                      event.stopPropagation();
                      openPromptDetailById(item.id);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    title={l("删除", "Delete")}
                    aria-label={l("删除", "Delete")}
                    onClick={(event) => {
                      event.stopPropagation();
                      void handleDeletePrompt(item.id, item.name);
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-red-600" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      {!promptsLoading && filteredPrompts.length > 0 && promptViewMode === "gallery" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {pagedPrompts.map((item) => (
            <Card
              key={item.id}
              className="group cursor-pointer"
              onClick={() => {
                openPromptDetailById(item.id);
              }}
            >
              <CardHeader>
                <CardTitle className="text-base">{item.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="mb-2 text-xs text-slate-500">{formatPromptCategoryLabel(item.category)} · v{item.activeVersion}</div>
                <div className="line-clamp-4 text-sm text-slate-600">{item.content}</div>
                <div className="mt-3 flex items-center justify-end">
                  <div className="pointer-events-none flex items-center gap-1 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
                    <Button
                      size="sm"
                      variant="ghost"
                      title={l("复制 Prompt", "Copy prompt")}
                      aria-label={l("复制 Prompt", "Copy prompt")}
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleCopyPromptFromRow(item);
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      title={item.favorite ? l("取消收藏", "Unfavorite") : l("收藏", "Favorite")}
                      aria-label={item.favorite ? l("取消收藏", "Unfavorite") : l("收藏", "Favorite")}
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleTogglePromptFavorite(item);
                      }}
                    >
                      <Star className={`h-4 w-4 ${item.favorite ? "fill-amber-400 text-amber-500" : "text-slate-500"}`} />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      title={l("编辑", "Edit")}
                      aria-label={l("编辑", "Edit")}
                      onClick={(event) => {
                        event.stopPropagation();
                        openPromptDetailById(item.id);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      title={l("删除", "Delete")}
                      aria-label={l("删除", "Delete")}
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleDeletePrompt(item.id, item.name);
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      {!promptsLoading && filteredPrompts.length > 0 && promptViewMode === "table" ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3">
            <span className="text-xs text-slate-500">
              {l(`已选 ${promptSelectedIds.length} 条`, `${promptSelectedIds.length} selected`)}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={promptSelectedIds.length === 0}
              onClick={() => void runPromptBatchAction("favorite_on")}
            >
              {l("批量收藏", "Batch Favorite")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={promptSelectedIds.length === 0}
              onClick={() => void runPromptBatchAction("favorite_off")}
            >
              {l("取消收藏", "Unfavorite")}
            </Button>
            <div className="flex items-center gap-2">
              <Input
                value={promptBatchCategory}
                onChange={(value) => setPromptBatchCategory(value)}
                placeholder={l("目标分类", "Target category")}
                className="h-9 w-40"
              />
              <Button
                size="sm"
                variant="outline"
                disabled={promptSelectedIds.length === 0}
                onClick={() => void runPromptBatchAction("move")}
              >
                {l("批量移动", "Batch Move")}
              </Button>
            </div>
            <DeleteIconButton
              size="sm"
              variant="outline"
              label={l("批量删除", "Batch Delete")}
              disabled={promptSelectedIds.length === 0}
              onClick={() => void runPromptBatchAction("delete")}
            />
            <Button
              size="sm"
              variant="ghost"
              disabled={promptSelectedIds.length === 0}
              onClick={() => clearPromptSelection()}
            >
              {l("清空选择", "Clear")}
            </Button>
            {promptBatchJumpSuggestion ? (
              <Button
                size="sm"
                variant="secondary"
                className="ml-auto"
                onClick={handleRunPromptBatchJumpSuggestion}
              >
                {promptBatchJumpSuggestion.type === "favorites"
                  ? l("前往 Favorites 查看", "Go to Favorites")
                  : l("前往目标分类查看", "Go to Category")}
              </Button>
            ) : null}
            {!promptBatchJumpSuggestion && promptBatchResult ? (
              <span className="ml-auto text-xs text-slate-500">
                {l(
                  `最近批量结果：成功 ${promptBatchResult.success}，失败 ${promptBatchResult.failed}`,
                  `Latest batch: ${promptBatchResult.success} succeeded, ${promptBatchResult.failed} failed`,
                )}
              </span>
            ) : null}
          </div>
          <DataTable
            rows={pagedPrompts}
            rowKey={(row) => row.id}
            onRowClick={(row) => {
              openPromptDetailById(row.id);
            }}
            rowSelection={{
              selectedRowKeys: promptSelectedIds,
              onChange: (keys) => setPromptSelection(keys),
            }}
            columnSettingsKey={promptTableColumnSettingsKey}
            renderRowActions={(row) => (
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  title={l("复制 Prompt", "Copy prompt")}
                  aria-label={l("复制 Prompt", "Copy prompt")}
                  onClick={() => void handleCopyPromptFromRow(row)}
                >
                  <Copy className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  title={row.favorite ? l("取消收藏", "Unfavorite") : l("收藏", "Favorite")}
                  aria-label={row.favorite ? l("取消收藏", "Unfavorite") : l("收藏", "Favorite")}
                  onClick={() => void handleTogglePromptFavorite(row)}
                >
                  <Star className={`h-4 w-4 ${row.favorite ? "fill-amber-400 text-amber-500" : "text-slate-500"}`} />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  title={l("编辑", "Edit")}
                  aria-label={l("编辑", "Edit")}
                  onClick={() => {
                    openPromptDetailById(row.id);
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  title={l("删除", "Delete")}
                  aria-label={l("删除", "Delete")}
                  onClick={() => void handleDeletePrompt(row.id, row.name)}
                >
                  <Trash2 className="h-4 w-4 text-red-600" />
                </Button>
              </div>
            )}
            columns={[
              {
                key: "name",
                title: l("标题", "Title"),
                className: "min-w-[180px]",
                render: (row) => <span className="font-medium text-slate-900">{row.name}</span>,
              },
              {
                key: "content",
                title: l("User Prompt", "User Prompt"),
                className: "min-w-[260px] max-w-[360px]",
                render: (row) => <span className="line-clamp-2 text-slate-600">{row.content}</span>,
              },
              { key: "category", title: l("分类", "Category"), render: (row) => formatPromptCategoryLabel(row.category) },
              {
                key: "variables",
                title: l("变量", "Variables"),
                render: (row) => String(extractTemplateVariables(row.content).length),
              },
              {
                key: "favorite",
                title: l("收藏", "Favorite"),
                render: (row) =>
                  row.favorite ? (
                    <Star className="h-4 w-4 fill-amber-400 text-amber-500" />
                  ) : (
                    <Star className="h-4 w-4 text-slate-300" />
                  ),
              },
              { key: "version", title: l("版本", "Version"), render: (row) => `v${row.activeVersion}` },
              { key: "updatedAt", title: l("更新时间", "Updated At"), render: (row) => toLocalTime(row.updatedAt) },
            ]}
          />
        </div>
      ) : null}

      {!promptsLoading && filteredPrompts.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2 text-xs text-slate-500">
          <span>
            {l(`共 ${filteredPrompts.length} 项 · 每页 ${promptsPageSize} 条`, `${filteredPrompts.length} items · ${promptsPageSize} / page`)}
          </span>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={promptPage <= 1}
              onClick={() => setPromptPage((prev) => Math.max(1, prev - 1))}
            >
              {l("上一页", "Prev")}
            </Button>
            <span>
              {promptPage} / {totalPromptPages}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={promptPage >= totalPromptPages}
              onClick={() => setPromptPage((prev) => Math.min(totalPromptPages, prev + 1))}
            >
              {l("下一页", "Next")}
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}

export type { PromptResultsProps };
