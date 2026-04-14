import { useCallback, useMemo } from "react";

import type { PromptAsset } from "../../../shared/types";
import {
  PROMPT_CATEGORY_ALL_KEY,
  PROMPT_CATEGORY_UNCATEGORIZED_KEY,
  normalizePromptCategoryKey,
} from "../utils/promptCategory";
import type { PromptBrowseScope } from "../utils/promptBrowseContext";

export type PromptCategoryOption = {
  key: string;
  label: string;
  count: number;
  sortValue: string;
};

type UsePromptBrowseInput = {
  isZh: boolean;
  prompts: PromptAsset[];
  promptQuery: string;
  promptBrowseScope: PromptBrowseScope;
  promptBrowseCategory: string;
  promptAllCategoryFilter: string;
  promptPage: number;
  pageSize: number;
};

export function usePromptBrowse({
  isZh,
  prompts,
  promptQuery,
  promptBrowseScope,
  promptBrowseCategory,
  promptAllCategoryFilter,
  promptPage,
  pageSize,
}: UsePromptBrowseInput) {
  const t = useCallback((zh: string, en: string) => (isZh ? zh : en), [isZh]);

  const promptAllCategoryLabel = useMemo(() => t("全部分类", "All Categories"), [t]);
  const promptUncategorizedLabel = useMemo(() => t("未分类", "Uncategorized"), [t]);

  const formatPromptCategoryLabel = useCallback(
    (category: string | null | undefined): string => {
      const normalized = normalizePromptCategoryKey(category);
      if (normalized === PROMPT_CATEGORY_UNCATEGORIZED_KEY) {
        return promptUncategorizedLabel;
      }
      const trimmed = (category ?? "").trim();
      return trimmed || category || "-";
    },
    [promptUncategorizedLabel],
  );

  const promptCategoryOptions = useMemo<PromptCategoryOption[]>(() => {
    const grouped = new Map<string, { label: string; count: number; sortValue: string }>();
    let uncategorizedCount = 0;

    for (const item of prompts) {
      const normalized = normalizePromptCategoryKey(item.category);
      if (normalized === PROMPT_CATEGORY_UNCATEGORIZED_KEY) {
        uncategorizedCount += 1;
        continue;
      }
      const trimmed = item.category.trim();
      const label = trimmed || normalized;
      const existing = grouped.get(normalized);
      if (!existing) {
        grouped.set(normalized, {
          label,
          count: 1,
          sortValue: normalized,
        });
        continue;
      }
      existing.count += 1;
      if (label.localeCompare(existing.label, undefined, { sensitivity: "base" }) < 0) {
        existing.label = label;
      }
    }

    const dynamicCategories = Array.from(grouped.entries())
      .map(([key, value]) => ({
        key,
        label: value.label,
        count: value.count,
        sortValue: value.sortValue,
      }))
      .sort((left, right) => left.sortValue.localeCompare(right.sortValue));

    return [
      {
        key: PROMPT_CATEGORY_ALL_KEY,
        label: promptAllCategoryLabel,
        count: prompts.length,
        sortValue: "",
      },
      {
        key: PROMPT_CATEGORY_UNCATEGORIZED_KEY,
        label: promptUncategorizedLabel,
        count: uncategorizedCount,
        sortValue: PROMPT_CATEGORY_UNCATEGORIZED_KEY,
      },
      ...dynamicCategories,
    ];
  }, [promptAllCategoryLabel, promptUncategorizedLabel, prompts]);

  const promptCategoryKeySet = useMemo(
    () => new Set(promptCategoryOptions.map((item) => item.key)),
    [promptCategoryOptions],
  );

  const promptBrowseContextLabel = useMemo(() => {
    if (promptBrowseScope === "favorites") {
      return t("Favorites", "Favorites");
    }
    if (promptBrowseScope === "categories") {
      const selectedCategory = promptCategoryOptions.find((item) => item.key === promptBrowseCategory);
      const selectedLabel = selectedCategory?.label ?? promptAllCategoryLabel;
      return t(`Categories > ${selectedLabel}`, `Categories > ${selectedLabel}`);
    }
    if (promptAllCategoryFilter !== PROMPT_CATEGORY_ALL_KEY) {
      const selectedCategory = promptCategoryOptions.find((item) => item.key === promptAllCategoryFilter);
      const selectedLabel = selectedCategory?.label ?? promptAllCategoryLabel;
      return t(`All > ${selectedLabel}`, `All > ${selectedLabel}`);
    }
    return t("All", "All");
  }, [
    promptAllCategoryFilter,
    promptAllCategoryLabel,
    promptBrowseCategory,
    promptBrowseScope,
    promptCategoryOptions,
    t,
  ]);

  const showPromptContextBar =
    promptBrowseScope !== "all" || promptAllCategoryFilter !== PROMPT_CATEGORY_ALL_KEY;

  const filteredPrompts = useMemo(() => {
    const keyword = promptQuery.trim().toLowerCase();
    return prompts.filter((item) => {
      const normalizedCategory = normalizePromptCategoryKey(item.category);
      if (promptBrowseScope === "favorites" && !item.favorite) {
        return false;
      }
      if (
        promptBrowseScope === "categories"
        && promptBrowseCategory !== PROMPT_CATEGORY_ALL_KEY
        && normalizedCategory !== promptBrowseCategory
      ) {
        return false;
      }
      if (
        promptBrowseScope === "all"
        && promptAllCategoryFilter !== PROMPT_CATEGORY_ALL_KEY
        && normalizedCategory !== promptAllCategoryFilter
      ) {
        return false;
      }
      if (!keyword) {
        return true;
      }
      return (
        item.name.toLowerCase().includes(keyword)
        || item.content.toLowerCase().includes(keyword)
        || item.tags.some((tag) => tag.toLowerCase().includes(keyword))
      );
    });
  }, [promptAllCategoryFilter, promptBrowseCategory, promptBrowseScope, promptQuery, prompts]);

  const totalPromptPages = useMemo(
    () => Math.max(1, Math.ceil(filteredPrompts.length / pageSize)),
    [filteredPrompts.length, pageSize],
  );

  const pagedPrompts = useMemo(() => {
    const start = (promptPage - 1) * pageSize;
    return filteredPrompts.slice(start, start + pageSize);
  }, [filteredPrompts, pageSize, promptPage]);

  return {
    formatPromptCategoryLabel,
    promptCategoryOptions,
    promptCategoryKeySet,
    promptBrowseContextLabel,
    showPromptContextBar,
    filteredPrompts,
    totalPromptPages,
    pagedPrompts,
  };
}
