import { Bot, ChartColumn, FlaskConical, LayoutGrid, Settings, Sparkles, Wrench } from "lucide-react";
import type { AppLanguage, MainModule } from "./types";

type SidebarProps = {
  activeModule: MainModule;
  language: AppLanguage;
  onChangeModule: (module: MainModule) => void;
  promptCount: number;
  skillCount: number;
  agentRulesCount: number;
  onOpenSettings: () => void;
};

export function Sidebar({
  activeModule,
  language,
  onChangeModule,
  promptCount,
  skillCount,
  agentRulesCount,
  onOpenSettings,
}: SidebarProps) {
  const isZh = language === "zh-CN";
  const items: Array<{ module: MainModule; label: string; icon: typeof Sparkles }> = [
    { module: "prompts", label: isZh ? "Prompts" : "Prompts", icon: Sparkles },
    { module: "skills", label: isZh ? "Skills" : "Skills", icon: Wrench },
    { module: "usage", label: isZh ? "模型使用与成本" : "Model Usage & Cost", icon: ChartColumn },
    { module: "channelTest", label: isZh ? "渠道 API 测试台" : "Channel API Testbench", icon: FlaskConical },
    { module: "agents", label: isZh ? "全局 Agent 规则" : "Global Agent Rules", icon: Bot },
  ];

  return (
    <aside className="flex h-full flex-col border-r border-border bg-slate-50/80 px-3 py-4 dark:bg-slate-950/70">
      <div className="mb-5 flex items-center gap-3 px-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-sm">
          <LayoutGrid className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">AgentNexus</div>
        </div>
      </div>

      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1" aria-label={isZh ? "主导航" : "Main navigation"}>
        {items.map((item) => {
          const Icon = item.icon;
          const active = item.module === activeModule;
          const count = item.module === "prompts"
            ? promptCount
            : item.module === "skills"
              ? skillCount
              : item.module === "agents"
                ? agentRulesCount
                : undefined;

          return (
            <button
              key={item.module}
              type="button"
              className={`group flex h-10 w-full items-center gap-2 rounded-md px-3 text-left text-sm font-medium transition ${
                active
                  ? "bg-white text-slate-950 shadow-[inset_3px_0_0_hsl(var(--primary)),0_1px_2px_rgba(15,23,42,0.06)] dark:bg-slate-900 dark:text-slate-100 dark:shadow-[inset_3px_0_0_hsl(var(--primary))]"
                  : "text-slate-600 hover:bg-white hover:text-slate-950 hover:shadow-sm dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-slate-100 dark:hover:shadow-none"
              }`}
              aria-current={active ? "page" : undefined}
              onClick={() => onChangeModule(item.module)}
            >
              <Icon className={`h-4 w-4 shrink-0 ${active ? "text-slate-700 dark:text-slate-200" : "text-slate-500 group-hover:text-slate-700 dark:text-slate-500 dark:group-hover:text-slate-300"}`} />
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {count !== undefined ? (
                <span
                  className={`ml-2 min-w-5 shrink-0 rounded-full px-1.5 py-0.5 text-center text-xs font-semibold ${
                    active ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950" : "bg-white text-slate-500 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-400 dark:ring-slate-800"
                  }`}
                >
                  {count}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-border pt-3">
        <button
          type="button"
          className={`flex h-10 w-full items-center gap-2 rounded-md px-3 text-left text-sm font-medium transition ${
            activeModule === "settings"
              ? "bg-white text-slate-950 shadow-[inset_3px_0_0_hsl(var(--primary)),0_1px_2px_rgba(15,23,42,0.06)] dark:bg-slate-900 dark:text-slate-100 dark:shadow-[inset_3px_0_0_hsl(var(--primary))]"
              : "text-slate-600 hover:bg-white hover:text-slate-950 hover:shadow-sm dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-slate-100 dark:hover:shadow-none"
          }`}
          aria-current={activeModule === "settings" ? "page" : undefined}
          aria-label={isZh ? "打开设置" : "Open settings"}
          title={isZh ? "设置" : "Settings"}
          onClick={onOpenSettings}
        >
          <Settings className="h-4 w-4 shrink-0" />
          <span>{isZh ? "设置" : "Settings"}</span>
        </button>
      </div>
    </aside>
  );
}
