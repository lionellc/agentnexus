import { useEffect, useState } from "react";
import { Menu, Moon, Plus, Search, Sun } from "lucide-react";

import { Button, Input } from "../../shared/ui";
import type { GlobalSearchHit } from "../../shared/stores";

export function TopBar({
  query,
  onQueryChange,
  hits,
  onSelectHit,
  onQuickCreate,
  onToggleTheme,
  onToggleSidebar,
}: {
  query: string;
  onQueryChange: (query: string) => void;
  hits: GlobalSearchHit[];
  onSelectHit: (hit: GlobalSearchHit) => void;
  onQuickCreate: () => void;
  onToggleTheme: () => void;
  onToggleSidebar: () => void;
}) {
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    setActiveIndex(hits.length > 0 ? 0 : -1);
  }, [hits, query]);

  return (
    <header className="border-b border-slate-200 bg-white px-4 py-3">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={onToggleSidebar}>
          <Menu className="h-4 w-4" />
        </Button>

        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={query}
            onChange={(event) => onQueryChange(event.currentTarget.value)}
            placeholder="搜索 Prompt / Skill / Agent 规则..."
            className="pl-9"
            onKeyDown={(event) => {
              if (hits.length === 0) {
                return;
              }
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActiveIndex((prev) => Math.min(prev + 1, hits.length - 1));
                return;
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setActiveIndex((prev) => Math.max(prev - 1, 0));
                return;
              }
              if (event.key === "Enter") {
                event.preventDefault();
                const hit = hits[activeIndex] ?? hits[0];
                if (hit) {
                  onSelectHit(hit);
                }
                return;
              }
              if (event.key === "Escape") {
                event.preventDefault();
                onQueryChange("");
              }
            }}
          />
          {query.trim() && hits.length > 0 ? (
            <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-30 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
              {hits.map((hit, index) => {
                const prevModule = index > 0 ? hits[index - 1]?.module : null;
                const needHeader = index === 0 || prevModule !== hit.module;
                const active = index === activeIndex;
                return (
                  <div key={`${hit.module}-${hit.id}`}>
                    {needHeader ? (
                      <div className="border-t border-slate-100 px-3 py-1 text-[11px] uppercase tracking-wider text-slate-400 first:border-t-0">
                        {hit.module}
                      </div>
                    ) : null}
                    <button
                      type="button"
                      className={`flex w-full flex-col items-start px-3 py-2 text-left ${
                        active ? "bg-blue-50" : "hover:bg-slate-50"
                      }`}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => onSelectHit(hit)}
                    >
                      <span className="text-sm font-medium text-slate-900">{hit.title}</span>
                      <span className="text-xs text-slate-500">
                        {hit.module} · {hit.subtitle ?? hit.id}
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>

        <Button onClick={onQuickCreate}>
          <Plus className="mr-1 h-4 w-4" />
          新建
        </Button>

        <Button variant="ghost" size="icon" onClick={onToggleTheme}>
          <Sun className="h-4 w-4 dark:hidden" />
          <Moon className="hidden h-4 w-4 dark:block" />
        </Button>
      </div>
    </header>
  );
}
