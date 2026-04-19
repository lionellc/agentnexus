import { Button, Card, CardContent, CardHeader, CardTitle, DeleteIconButton } from "../../../../shared/ui";

import type { AgentConnectionRow, Translator } from "./types";

type AgentConnectionsSectionProps = {
  l: Translator;
  agentConnectionRows: AgentConnectionRow[];
  agentConnectionSavingId: string | null;
  onOpenCreate: () => void;
  onStartEdit: (platform: string) => void;
  onDeleteAgentConnection: (platform: string) => void;
};

export function AgentConnectionsSection({
  l,
  agentConnectionRows,
  agentConnectionSavingId,
  onOpenCreate,
  onStartEdit,
  onDeleteAgentConnection,
}: AgentConnectionsSectionProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>{l("Agents 配置", "Agents Settings")}</CardTitle>
        <Button size="sm" onClick={onOpenCreate}>
          {l("新增 Agent", "Add Agent")}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {agentConnectionRows.length === 0 ? (
          <div className="rounded-md border border-dashed border-slate-300 px-3 py-3 text-xs text-slate-500">
            {l("暂无 Agent 配置，请先新增一条。", "No agent settings yet. Add one.")}
          </div>
        ) : (
          <div className="space-y-2">
            {agentConnectionRows.map((row) => {
              const isDeleting = agentConnectionSavingId === `delete:${row.platform}`;
              return (
                <div key={row.platform} className="rounded-md border border-slate-200 px-3 py-3">
                  <div className="grid gap-2 md:grid-cols-[1fr_auto]">
                    <div className="grid gap-2 md:grid-cols-3">
                      <div className="text-xs text-slate-500">
                        <div>{l("名称", "Name")}</div>
                        <div className="font-medium text-slate-800">{row.platform}</div>
                      </div>
                      <div className="min-w-0 text-xs text-slate-500">
                        <div>{l("Global Config 目录", "Global Config Directory")}</div>
                        <div className="truncate font-mono text-slate-700">{row.rootDir || "-"}</div>
                      </div>
                      <div className="min-w-0 text-xs text-slate-500">
                        <div>{l("规则文件（相对路径）", "Rule File (Relative Path)")}</div>
                        <div className="truncate font-mono text-slate-700">{row.ruleFile || "-"}</div>
                      </div>
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onStartEdit(row.platform)}
                        disabled={isDeleting}
                      >
                        {l("编辑", "Edit")}
                      </Button>
                      <DeleteIconButton
                        size="sm"
                        variant="outline"
                        label={l("删除 Agent 配置", "Delete agent settings")}
                        onClick={() => onDeleteAgentConnection(row.platform)}
                        disabled={isDeleting}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
