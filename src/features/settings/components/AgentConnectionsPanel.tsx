import { Button, Card, CardContent, CardHeader, CardTitle, Input } from "../../../shared/ui";

export type AgentConnectionsPanelProps = {
  l: (zh: string, en: string) => string;
  isDarkTheme: boolean;
  settingsAgentTypes: string[];
  selectedSettingsAgentType: string;
  newSettingsAgentInput: string;
  selectedSettingsRootDir: string;
  selectedSettingsRuleFile: string;
  selectedSettingsResolvedPath: string;
  onSelectSettingsAgentType: (agentType: string) => void;
  onNewSettingsAgentInputChange: (value: string) => void;
  onAddSettingsAgent: () => void;
  onRemoveSettingsAgent: (agentType: string) => void;
  onSelectedSettingsRootDirChange: (value: string) => void;
  onUseDefaultSelectedSettingsRootDir: () => void;
  onOpenSelectedSettingsAgentConfigInFinder: () => void;
  onSelectedSettingsRuleFileChange: (value: string) => void;
  selectedSettingsRootDirPlaceholder: string;
  selectedSettingsRuleFilePlaceholder: string;
  onSaveAgentConnections: () => void;
};

export function AgentConnectionsPanel({
  l,
  isDarkTheme,
  settingsAgentTypes,
  selectedSettingsAgentType,
  newSettingsAgentInput,
  selectedSettingsRootDir,
  selectedSettingsRuleFile,
  selectedSettingsResolvedPath,
  onSelectSettingsAgentType,
  onNewSettingsAgentInputChange,
  onAddSettingsAgent,
  onRemoveSettingsAgent,
  onSelectedSettingsRootDirChange,
  onUseDefaultSelectedSettingsRootDir,
  onOpenSelectedSettingsAgentConfigInFinder,
  onSelectedSettingsRuleFileChange,
  selectedSettingsRootDirPlaceholder,
  selectedSettingsRuleFilePlaceholder,
  onSaveAgentConnections,
}: AgentConnectionsPanelProps) {
  return (
    <div className="grid gap-4 xl:grid-cols-[220px_1fr]">
      <div className="h-fit space-y-2">
        <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{l("Agent 列表", "Agent List")}</div>
        <div className="space-y-2">
          {settingsAgentTypes.length === 0 ? (
            <div className="text-xs text-slate-500">{l("暂无 Agent，点击下方按钮添加。", "No agents yet. Add one below.")}</div>
          ) : (
            settingsAgentTypes.map((agentType) => {
              const isActive = selectedSettingsAgentType === agentType;
              const itemClass = isActive
                ? isDarkTheme
                  ? "border-blue-400/45 bg-blue-500/18"
                  : "border-blue-300 bg-blue-50"
                : isDarkTheme
                  ? "border-slate-600 bg-slate-900/35"
                  : "border-slate-200 bg-white";
              const buttonClass = isActive
                ? isDarkTheme
                  ? "text-blue-100 hover:bg-blue-500/20 hover:text-blue-50"
                  : "text-blue-700 hover:bg-blue-100/70"
                : isDarkTheme
                  ? "text-slate-200 hover:bg-slate-800/70 hover:text-slate-100"
                  : "text-slate-700 hover:bg-slate-100/70";

              return (
                <div
                  key={`settings-agent-${agentType}`}
                  className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 ${itemClass}`}
                >
                  <Button
                    variant="ghost"
                    className={`min-h-9 flex-1 justify-start px-2 ${buttonClass}`}
                    onClick={() => onSelectSettingsAgentType(agentType)}
                  >
                    {agentType}
                  </Button>
                  {agentType !== "codex" && agentType !== "claude" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-red-600 hover:text-red-700"
                      onClick={() => onRemoveSettingsAgent(agentType)}
                    >
                      {l("移除", "Remove")}
                    </Button>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Input
            value={newSettingsAgentInput}
            onChange={(event) => onNewSettingsAgentInputChange(event.currentTarget.value)}
            placeholder={l("输入 Agent 名称（如 cursor）", "Agent name (e.g. cursor)")}
          />
          <Button variant="outline" className="w-full" onClick={onAddSettingsAgent}>
            {l("新增 Agent", "Add Agent")}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {selectedSettingsAgentType
              ? l(`${selectedSettingsAgentType} 配置`, `${selectedSettingsAgentType} Settings`)
              : l("Agent 配置", "Agent Settings")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {selectedSettingsAgentType ? (
            <>
              <label className="block text-xs text-slate-500">
                {l("Global Config file（绝对路径）", "Global Config file (Absolute Path)")}
                <Input
                  value={selectedSettingsRootDir}
                  onChange={(event) => onSelectedSettingsRootDirChange(event.currentTarget.value)}
                  placeholder={selectedSettingsRootDirPlaceholder}
                />
              </label>

              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={onUseDefaultSelectedSettingsRootDir}>
                  {l("使用默认", "Use Default")}
                </Button>
                <Button variant="outline" onClick={onOpenSelectedSettingsAgentConfigInFinder}>
                  {l("在 Finder 中打开", "Open in Finder")}
                </Button>
              </div>

              <label className="block text-xs text-slate-500">
                {l("规则文件（相对路径）", "Rule File (Relative Path)")}
                <Input
                  value={selectedSettingsRuleFile}
                  onChange={(event) => onSelectedSettingsRuleFileChange(event.currentTarget.value)}
                  placeholder={selectedSettingsRuleFilePlaceholder}
                />
              </label>

              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                {l("解析路径：", "Resolved Path: ")}<code>{selectedSettingsResolvedPath || "-"}</code>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button onClick={onSaveAgentConnections}>{l("保存 Agent 配置", "Save Agent Settings")}</Button>
              </div>
            </>
          ) : (
            <div className="text-xs text-slate-500">{l("请先选择一个 Agent。", "Select an agent first.")}</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
