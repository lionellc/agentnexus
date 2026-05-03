import { Bot, ChartColumn, FlaskConical, LayoutGrid, Settings, Sparkles, Wrench } from "lucide-react";

import { Button, Tag } from "../../shared/ui";
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
    <aside className="flex h-full flex-col border-r border-border bg-card/90 p-3">
      <div className="mb-4 flex items-center gap-2 rounded-lg bg-card p-3 shadow-sm">
        <div className="rounded-md bg-primary p-2 text-primary-foreground">
          <LayoutGrid className="h-4 w-4" />
        </div>
        <div>
          <div className="text-sm font-semibold text-foreground">AgentNexus</div>
        </div>
      </div>

      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
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
            <Button
              key={item.module}
              type="button"
              variant={active ? "default" : "ghost"}
              className="min-h-11 w-full justify-start"
              aria-current={active ? "page" : undefined}
              onClick={() => onChangeModule(item.module)}
            >
              <span className="flex min-w-0 items-center gap-2">
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.label}</span>
                {count !== undefined ? (
                  <Tag tone={active ? "info" : "neutral"} size="sm" className="ml-1 shrink-0">
                    {count}
                  </Tag>
                ) : null}
              </span>
            </Button>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-border pt-3">
        <Button
          variant={activeModule === "settings" ? "default" : "outline"}
          size="icon"
          className="w-full"
          aria-current={activeModule === "settings" ? "page" : undefined}
          aria-label={isZh ? "打开设置" : "Open settings"}
          title={isZh ? "设置" : "Settings"}
          onClick={onOpenSettings}
        >
          <Settings className="h-4 w-4" />
        </Button>
      </div>
    </aside>
  );
}
