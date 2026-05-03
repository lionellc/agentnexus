import { Select } from "@douyinfe/semi-ui-19";
import type { ModelUsageCurrency, ModelUsageStatus } from "../../../shared/types";

type SelectOption = { value: string; label: string };

type UsageFiltersBarProps = {
  l: (zh: string, en: string) => string;
  days: number;
  currency: ModelUsageCurrency;
  agent: string;
  model: string;
  status: ModelUsageStatus;
  agentOptions: string[];
  modelOptions: string[];
  loading?: boolean;
  onDaysChange: (value: number) => void;
  onCurrencyChange: (value: ModelUsageCurrency) => void;
  onAgentChange: (value: string) => void;
  onModelChange: (value: string) => void;
  onStatusChange: (value: ModelUsageStatus) => void;
};

const dayOptions = (l: (zh: string, en: string) => string): SelectOption[] => [
  { value: "0", label: l("当天", "Today") },
  { value: "7", label: "7d" },
  { value: "30", label: "30d" },
  { value: "90", label: "90d" },
];

const currencyOptions: SelectOption[] = [
  { value: "USD", label: "USD" },
  { value: "CNY", label: "CNY" },
];

const statusOptions = (l: (zh: string, en: string) => string): SelectOption[] => [
  { value: "", label: l("全部状态", "All Status") },
  { value: "success", label: l("成功", "Success") },
  { value: "failed", label: l("失败", "Failed") },
  { value: "unknown", label: l("未知", "Unknown") },
];

export function UsageFiltersBar({
  l,
  days,
  currency,
  agent,
  model,
  status,
  agentOptions,
  modelOptions,
  loading,
  onDaysChange,
  onCurrencyChange,
  onAgentChange,
  onModelChange,
  onStatusChange,
}: UsageFiltersBarProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="grid gap-3 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-500">{l("统计口径", "Metric Scope")}</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Select
              value={String(days)}
              optionList={dayOptions(l)}
              onChange={(value) => onDaysChange(Number(value))}
              aria-label={l("时间范围", "Range")}
              disabled={loading}
            />
            <Select
              value={currency}
              optionList={currencyOptions}
              onChange={(value) => onCurrencyChange(value as ModelUsageCurrency)}
              aria-label={l("币种", "Currency")}
              disabled={loading}
            />
            <Select
              value={agent}
              optionList={[
                { value: "", label: l("全部 Agent", "All Agents") },
                ...agentOptions.map((item) => ({ value: item, label: item })),
              ]}
              onChange={(value) => onAgentChange(String(value ?? ""))}
              aria-label={l("Agent", "Agent")}
              disabled={loading}
            />
            <Select
              value={model}
              optionList={[
                { value: "", label: l("全部模型", "All Models") },
                ...modelOptions.map((item) => ({ value: item, label: item })),
              ]}
              onChange={(value) => onModelChange(String(value ?? ""))}
              aria-label={l("模型", "Model")}
              disabled={loading}
            />
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-500">{l("定位异常", "Find Issues")}</p>
          <Select
            value={status}
            optionList={statusOptions(l)}
            onChange={(value) => onStatusChange(value as ModelUsageStatus)}
            aria-label={l("状态", "Status")}
            disabled={loading}
          />
        </div>
      </div>
    </div>
  );
}
