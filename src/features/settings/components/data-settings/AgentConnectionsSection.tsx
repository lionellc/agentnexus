import { Card } from "@douyinfe/semi-ui-19";
import { AgentPresetGrid } from "./AgentPresetGrid";
import type { AgentConnectionRow, AgentPresetRow, Translator } from "./types";

type AgentConnectionsSectionProps = {
  l: Translator;
  enabledAgentRows: AgentConnectionRow[];
  availableAgentPresetRows: AgentPresetRow[];
  agentConnectionSavingId: string | null;
  onEnableAgentPreset: (platform: string) => void;
  onStartEdit: (platform: string) => void;
  onDisableAgentConnection: (platform: string) => void;
  onReorderEnabledAgentRows: (orderedPlatforms: string[]) => void;
};

export function AgentConnectionsSection({
  l,
  enabledAgentRows,
  availableAgentPresetRows,
  agentConnectionSavingId,
  onEnableAgentPreset,
  onStartEdit,
  onDisableAgentConnection,
  onReorderEnabledAgentRows,
}: AgentConnectionsSectionProps) {
  return (
    <Card>
      <div>
        <h3>{l("Agents 配置", "Agents Settings")}</h3>
      </div>
      <div className="space-y-3 text-sm">
        <AgentPresetGrid
          l={l}
          enabledRows={enabledAgentRows}
          availableRows={availableAgentPresetRows}
          agentConnectionSavingId={agentConnectionSavingId}
          onEnableAgentPreset={onEnableAgentPreset}
          onStartEdit={onStartEdit}
          onDisableAgentConnection={onDisableAgentConnection}
          onReorderEnabledAgentRows={onReorderEnabledAgentRows}
        />
      </div>
    </Card>
  );
}
