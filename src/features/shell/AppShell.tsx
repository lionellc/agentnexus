import type { MouseEvent, ReactNode } from "react";
import { Menu } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { Button, Sheet, SheetContent } from "../../shared/ui";
import { Sidebar } from "./Sidebar";
import type { AppLanguage, MainModule } from "./types";

export function AppShell({
  activeModule,
  language,
  onChangeModule,
  promptCount,
  skillCount,
  agentRulesCount,
  onOpenSettings,
  sidebarOpen,
  onSidebarOpen,
  mobileDetailOpen,
  onMobileDetailOpen,
  showDetailPanel = true,
  statusBarContent,
  center,
  detail,
}: {
  activeModule: MainModule;
  language: AppLanguage;
  onChangeModule: (module: MainModule) => void;
  promptCount: number;
  skillCount: number;
  agentRulesCount: number;
  onOpenSettings: () => void;
  sidebarOpen: boolean;
  onSidebarOpen: (open: boolean) => void;
  mobileDetailOpen: boolean;
  onMobileDetailOpen: (open: boolean) => void;
  showDetailPanel?: boolean;
  statusBarContent?: ReactNode;
  center: ReactNode;
  detail: ReactNode;
}) {
  const macDragBarHeight = 40;
  const isDesktop = typeof window !== "undefined" ? window.innerWidth >= 1024 : false;
  const isMac = typeof navigator !== "undefined" ? /mac/i.test(navigator.platform) : false;
  const showMacDragBar = isMac && isDesktop;
  const mobileSheetEnabled = !isDesktop;
  const layoutClass = showDetailPanel
    ? "grid h-full min-h-0 grid-cols-1 lg:grid-cols-[264px_1fr_480px]"
    : "grid h-full min-h-0 grid-cols-1 lg:grid-cols-[264px_1fr]";

  const handleMacDragMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    void getCurrentWindow().startDragging().catch(() => {});
  };

  return (
    <div className="relative h-screen overflow-hidden bg-background text-foreground">
      {showMacDragBar ? (
        <div
          className="absolute inset-x-0 top-0 z-40 h-10 border-b border-border bg-background/90"
          onMouseDown={handleMacDragMouseDown}
        >
          {statusBarContent ? (
            <div
              className="absolute right-3 top-1/2 -translate-y-1/2"
              onMouseDown={(event) => event.stopPropagation()}
            >
              {statusBarContent}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className={`${layoutClass} min-h-0 box-border`} style={showMacDragBar ? { paddingTop: `${macDragBarHeight}px` } : undefined}>
        <div className="hidden min-h-0 lg:block">
          <Sidebar
            activeModule={activeModule}
            language={language}
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
              language={language}
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

        <div className="flex h-full min-h-0 min-w-0 flex-col border-r border-border bg-background">
          <div className="border-b border-border bg-background/85 px-4 py-2 backdrop-blur-sm lg:hidden">
            <Button variant="outline" size="icon" onClick={() => onSidebarOpen(true)}>
              <Menu className="h-4 w-4" />
            </Button>
          </div>
          <main className="min-h-0 flex-1 overflow-y-auto p-4">{center}</main>
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
                <div className="h-full overflow-auto bg-card">{detail}</div>
              </SheetContent>
            </Sheet>

            <aside className="hidden h-full min-h-0 overflow-y-auto bg-card lg:block">{detail}</aside>
          </>
        ) : null}
      </div>
    </div>
  );
}
