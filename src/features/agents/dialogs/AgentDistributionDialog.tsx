import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FormField,
  FormFieldset,
  FormLabel,
  Select,
} from "../../../shared/ui";

type AgentAssetItem = {
  id: string;
  name: string;
  latestVersion?: number | string | null;
};

type AgentConnectionItem = {
  id: string;
  agentType: string;
  rootDir?: string | null;
  ruleFile?: string | null;
  resolvedPath?: string | null;
};

export type AgentDistributionDialogProps = {
  l: (zh: string, en: string) => string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedAssetId: string | null;
  setSelectedAssetId: (value: string | null) => void;
  agentAssets: AgentAssetItem[];
  agentConnections: AgentConnectionItem[];
  agentTargetIds: string[];
  setAgentTargetIds: (updater: string[] | ((prev: string[]) => string[])) => void;
  defaultAgentRuleFile: (platform: string) => string;
  joinRuleFilePath: (rootDir: string, ruleFile: string) => string;
  handleRunAgentDistribution: () => Promise<void> | void;
};

export function AgentDistributionDialog({
  l,
  open,
  onOpenChange,
  selectedAssetId,
  setSelectedAssetId,
  agentAssets,
  agentConnections,
  agentTargetIds,
  setAgentTargetIds,
  defaultAgentRuleFile,
  joinRuleFilePath,
  handleRunAgentDistribution,
}: AgentDistributionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{l("应用规则", "Apply Rule")}</DialogTitle>
          <DialogDescription>{l("确认规则资产与目标 Agent 后立即应用。", "Apply immediately after confirming rule asset and target agents.")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <FormFieldset>
            <FormField>
              <FormLabel>{l("规则资产", "Rule Asset")}</FormLabel>
            <Select
              value={selectedAssetId ?? ""}
              onChange={(nextValue) => setSelectedAssetId(nextValue || null)}
              options={[
                { value: "", label: l("请选择规则资产", "Select a rule asset") },
                ...agentAssets.map((asset) => ({
                  value: asset.id,
                  label: `${asset.name} · v${asset.latestVersion ?? "-"}`,
                })),
              ]}
              buttonClassName="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            />
            </FormField>
          </FormFieldset>
          <div className="grid gap-2">
            {agentConnections.length === 0 ? (
              <div className="rounded-md border border-slate-200 px-3 py-2 text-xs text-slate-500">{l("暂无 Agent 连接，请先在设置中配置。", "No agent connections. Configure in Settings first.")}</div>
            ) : (
              agentConnections.map((target) => {
                const checked = agentTargetIds.includes(target.agentType);
                const mappedPath =
                  (String(target.ruleFile ?? "").trim() || defaultAgentRuleFile(target.agentType));
                const resolvedPath =
                  target.resolvedPath ||
                  (target.rootDir ? joinRuleFilePath(target.rootDir, mappedPath) : mappedPath);
                return (
                  <label key={target.id} className="flex items-center justify-between gap-3 rounded-md border border-slate-200 px-3 py-2 text-xs">
                    <span className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => {
                          if (event.currentTarget.checked) {
                            setAgentTargetIds((prev) => [...prev, target.agentType]);
                          } else {
                            setAgentTargetIds((prev) =>
                              prev.filter((item) => item !== target.agentType),
                            );
                          }
                        }}
                      />
                      {target.agentType}
                      {" · "}
                      {target.rootDir || l("(未配置 root_dir)", "(root_dir not configured)")}
                    </span>
                    <code>{resolvedPath}</code>
                  </label>
                );
              })
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {l("取消", "Cancel")}
          </Button>
          <Button onClick={() => void handleRunAgentDistribution()}>{l("应用", "Apply")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
