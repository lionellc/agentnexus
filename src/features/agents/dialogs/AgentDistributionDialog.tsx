import { useMemo } from "react";
import { Checkbox } from "@douyinfe/semi-ui-19";
import { AlertTriangle } from "lucide-react";

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
import type { AgentRuleAccessCheck } from "../../../shared/types";

type AgentAssetItem = {
  id: string;
  name: string;
  latestVersion?: number | string | null;
};

type AgentConnectionItem = {
  id: string;
  agentType: string;
  enabled?: boolean;
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
  setAgentTargetIds: (
    updater: string[] | ((prev: string[]) => string[]),
  ) => void;
  agentRuleAccessCheck: AgentRuleAccessCheck | null;
  checkingAgentRuleAccess: boolean;
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
  agentRuleAccessCheck,
  checkingAgentRuleAccess,
  handleRunAgentDistribution,
}: AgentDistributionDialogProps) {
  const enabledAgentConnections = useMemo(
    () =>
      agentConnections.filter(
        (agent) => agent.enabled !== false && agent.agentType.trim(),
      ),
    [agentConnections],
  );
  const accessByAgent = useMemo(() => {
    const map = new Map<
      string,
      NonNullable<AgentRuleAccessCheck["targets"]>[number]
    >();
    agentRuleAccessCheck?.targets.forEach((target) => {
      map.set(target.agentType, target);
    });
    return map;
  }, [agentRuleAccessCheck]);
  const selectedEnabledAgentTypes = useMemo(
    () =>
      enabledAgentConnections
        .map((agent) => agent.agentType)
        .filter((agentType) => agentTargetIds.includes(agentType)),
    [agentTargetIds, enabledAgentConnections],
  );
  const selectedAccessTargets = useMemo(
    () =>
      selectedEnabledAgentTypes
        .map((agentType) => accessByAgent.get(agentType))
        .filter(
          (
            target,
          ): target is NonNullable<AgentRuleAccessCheck["targets"]>[number] =>
            Boolean(target),
        ),
    [accessByAgent, selectedEnabledAgentTypes],
  );
  const blockedTargets = selectedAccessTargets.filter(
    (target) => target.status !== "ready",
  );
  const hasBlockedTargets = blockedTargets.length > 0;
  const showAccessNotice = checkingAgentRuleAccess || hasBlockedTargets;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{l("应用规则", "Apply Rule")}</DialogTitle>
          <DialogDescription>
            {l(
              "确认规则资产与目标 Agent 后立即应用。",
              "Apply immediately after confirming rule asset and target agents.",
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <FormFieldset>
            <FormField>
              <FormLabel>{l("规则资产", "Rule Asset")}</FormLabel>
              <Select
                value={selectedAssetId ?? ""}
                onChange={(nextValue) => setSelectedAssetId(nextValue || null)}
                options={[
                  {
                    value: "",
                    label: l("请选择规则资产", "Select a rule asset"),
                  },
                  ...agentAssets.map((asset) => ({
                    value: asset.id,
                    label: `${asset.name} · v${asset.latestVersion ?? "-"}`,
                  })),
                ]}
                buttonClassName="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              />
            </FormField>
          </FormFieldset>
          <FormFieldset>
            <FormField>
              <FormLabel>{l("目标 Agent", "Target Agents")}</FormLabel>
              {enabledAgentConnections.length === 0 ? (
                <div className="rounded-md border border-slate-200 px-3 py-2 text-xs text-slate-500">
                  {l(
                    "基础设置中暂无启用的 Agent，请先启用后再应用。",
                    "No enabled agents in Settings. Enable one before applying.",
                  )}
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {enabledAgentConnections.map((target) => {
                    const checked = agentTargetIds.includes(target.agentType);
                    const access = accessByAgent.get(target.agentType);
                    const blocked = Boolean(
                      checked && access && access.status !== "ready",
                    );
                    return (
                      <label
                        key={target.id}
                        className={[
                          "flex min-h-9 items-center gap-2 rounded-md border px-3 text-xs",
                          checked
                            ? "border-slate-900 bg-slate-50 text-slate-900"
                            : "border-slate-200 bg-white text-slate-600",
                          blocked ? "border-amber-200 bg-amber-50" : "",
                        ].join(" ")}
                      >
                        <Checkbox
                          checked={checked}
                          onChange={(event) => {
                            if (event.target.checked) {
                              setAgentTargetIds((prev) =>
                                prev.includes(target.agentType)
                                  ? prev
                                  : [...prev, target.agentType],
                              );
                            } else {
                              setAgentTargetIds((prev) =>
                                prev.filter(
                                  (item) => item !== target.agentType,
                                ),
                              );
                            }
                          }}
                        />
                        <span className="font-medium">{target.agentType}</span>
                        {blocked ? (
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-700" />
                        ) : null}
                      </label>
                    );
                  })}
                </div>
              )}
            </FormField>
          </FormFieldset>
          {showAccessNotice ? (
            <div
              className={[
                "rounded-md border px-3 py-2 text-xs",
                hasBlockedTargets
                  ? "border-amber-200 bg-amber-50 text-amber-800"
                  : "border-slate-200 bg-slate-50 text-slate-600",
              ].join(" ")}
            >
              <div className="flex items-start gap-2">
                {hasBlockedTargets ? (
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                ) : null}
                <div className="min-w-0 space-y-1">
                  <div className="font-medium">
                    {checkingAgentRuleAccess
                      ? l(
                          "正在检查规则目录权限...",
                          "Checking rule directory access...",
                        )
                      : hasBlockedTargets
                        ? l(
                            "部分规则目录需要处理后才能应用",
                            "Some rule directories need attention before applying",
                          )
                        : null}
                  </div>
                  {hasBlockedTargets ? (
                    <div className="space-y-1">
                      {blockedTargets.slice(0, 2).map((target) => (
                        <div key={target.agentType} className="break-words">
                          <span className="font-medium">
                            {target.agentType}
                          </span>
                          {": "}
                          {target.message}
                          {target.advice ? `。${target.advice}` : ""}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {l("取消", "Cancel")}
          </Button>
          <Button
            onClick={() => void handleRunAgentDistribution()}
            disabled={
              !selectedAssetId ||
              selectedEnabledAgentTypes.length === 0 ||
              checkingAgentRuleAccess ||
              hasBlockedTargets
            }
          >
            {checkingAgentRuleAccess
              ? l("检查中...", "Checking...")
              : l("应用", "Apply")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
