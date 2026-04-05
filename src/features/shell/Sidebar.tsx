import { Bot, LayoutGrid, Settings, Sparkles, Wrench } from "lucide-react";

import { Button, Badge } from "../../shared/ui";
import type { MainModule } from "./types";

type SidebarProps = {
  activeModule: MainModule;
  onChangeModule: (module: MainModule) => void;
  promptCount: number;
  skillCount: number;
  agentRulesCount: number;
  onOpenSettings: () => void;
};

const items: Array<{ module: MainModule; label: string; icon: typeof Sparkles }> = [
  { module: "prompts", label: "Prompts", icon: Sparkles },
  { module: "skills", label: "Skills", icon: Wrench },
  { module: "agents", label: "全局 Agent 规则", icon: Bot },
  { module: "settings", label: "设置", icon: Settings },
];

export function Sidebar({ activeModule, onChangeModule, promptCount, skillCount, agentRulesCount, onOpenSettings }: SidebarProps) {
  return (
    <aside className="flex h-full flex-col border-r border-slate-200 bg-slate-50/80 p-3">
      <div className="mb-4 flex items-center gap-2 rounded-lg bg-white p-3 shadow-sm">
        <div className="rounded-md bg-blue-600 p-2 text-white">
          <LayoutGrid className="h-4 w-4" />
        </div>
        <div>
          <div className="text-sm font-semibold text-slate-900">AgentNexus</div>
        </div>
      </div>

      <nav className="space-y-1">
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
              className="w-full justify-between"
              onClick={() => onChangeModule(item.module)}
            >
              <span className="flex items-center gap-2">
                <Icon className="h-4 w-4" />
                {item.label}
              </span>
              {count !== undefined ? <Badge variant={active ? "secondary" : "outline"}>{count}</Badge> : null}
            </Button>
          );
        })}
      </nav>

      <div className="mt-auto pt-4">
        <Button variant="outline" className="w-full" onClick={onOpenSettings}>
          打开设置
        </Button>
      </div>
    </aside>
  );
}
