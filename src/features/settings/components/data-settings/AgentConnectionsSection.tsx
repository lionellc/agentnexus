import { Card, CardContent, CardHeader, CardTitle } from "../../../../shared/ui";

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
      <CardHeader>
        <CardTitle>{l("Agents 配置", "Agents Settings")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
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
      </CardContent>
    </Card>
  );
}
