import type { ReactNode } from "react";

import { Sheet, SheetContent } from "../../shared/ui";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import type { MainModule } from "./types";
import type { GlobalSearchHit } from "../../shared/stores";

export function AppShell({
  activeModule,
  onChangeModule,
  promptCount,
  skillCount,
  agentRulesCount,
  searchQuery,
  onSearchQuery,
  searchHits,
  onSelectSearchHit,
  onQuickCreate,
  onOpenSettings,
  onToggleTheme,
  sidebarOpen,
  onSidebarOpen,
  mobileDetailOpen,
  onMobileDetailOpen,
  showDetailPanel = true,
  center,
  detail,
}: {
  activeModule: MainModule;
  onChangeModule: (module: MainModule) => void;
  promptCount: number;
  skillCount: number;
  agentRulesCount: number;
  searchQuery: string;
  onSearchQuery: (query: string) => void;
  searchHits: GlobalSearchHit[];
  onSelectSearchHit: (hit: GlobalSearchHit) => void;
  onQuickCreate: () => void;
  onOpenSettings: () => void;
  onToggleTheme: () => void;
  sidebarOpen: boolean;
  onSidebarOpen: (open: boolean) => void;
  mobileDetailOpen: boolean;
  onMobileDetailOpen: (open: boolean) => void;
  showDetailPanel?: boolean;
  center: ReactNode;
  detail: ReactNode;
}) {
  const isDesktop = typeof window !== "undefined" ? window.innerWidth >= 1024 : false;
  const mobileSheetEnabled = !isDesktop;
  const layoutClass = showDetailPanel
    ? "grid h-full grid-cols-1 lg:grid-cols-[248px_1fr_480px]"
    : "grid h-full grid-cols-1 lg:grid-cols-[248px_1fr]";

  return (
    <div className="h-screen bg-slate-100 text-slate-900">
      <div className={layoutClass}>
        <div className="hidden lg:block">
          <Sidebar
            activeModule={activeModule}
            onChangeModule={onChangeModule}
            promptCount={promptCount}
            skillCount={skillCount}
            agentRulesCount={agentRulesCount}
            onOpenSettings={onOpenSettings}
          />
        </div>

        <Sheet
          open={mobileSheetEnabled ? sidebarOpen : false}
          onOpenChange={(open) => {
            if (mobileSheetEnabled) {
              onSidebarOpen(open);
            }
          }}
        >
          <SheetContent side="left" className="p-0 lg:hidden">
            <Sidebar
              activeModule={activeModule}
              onChangeModule={(module) => {
                onChangeModule(module);
                onSidebarOpen(false);
              }}
              promptCount={promptCount}
              skillCount={skillCount}
              agentRulesCount={agentRulesCount}
              onOpenSettings={() => {
                onOpenSettings();
                onSidebarOpen(false);
              }}
            />
          </SheetContent>
        </Sheet>

        <div className="flex min-w-0 flex-col border-r border-slate-200 bg-slate-100">
          <TopBar
            query={searchQuery}
            onQueryChange={onSearchQuery}
            hits={searchHits}
            onSelectHit={onSelectSearchHit}
            onQuickCreate={onQuickCreate}
            onToggleTheme={onToggleTheme}
            onToggleSidebar={() => onSidebarOpen(true)}
          />
          <main className="min-h-0 flex-1 overflow-auto p-4">{center}</main>
        </div>

        {showDetailPanel ? (
          <>
            <Sheet
              open={mobileSheetEnabled ? mobileDetailOpen : false}
              onOpenChange={(open) => {
                if (mobileSheetEnabled) {
                  onMobileDetailOpen(open);
                }
              }}
            >
              <SheetContent side="right" className="w-full max-w-[92vw] p-0 lg:hidden">
                <div className="h-full overflow-auto bg-white">{detail}</div>
              </SheetContent>
            </Sheet>

            <aside className="hidden min-h-0 overflow-auto bg-white lg:block">{detail}</aside>
          </>
        ) : null}
      </div>
    </div>
  );
}
