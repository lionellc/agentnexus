import { Button } from "@douyinfe/semi-ui-19";
import { Empty, Table } from "@douyinfe/semi-ui-19";
import type { ReactNode } from "react";
import { useState } from "react";
import { Input } from "@douyinfe/semi-ui-19";
import type { ModelPricingItem, ModelPricingSyncResult, ModelUsageCurrency } from "../../../shared/types";
import { formatDecimal, formatInteger, formatTimestamp } from "../utils/usageFormat";

type PricingPanelProps = {
  l: (zh: string, en: string) => string;
  currency: ModelUsageCurrency;
  rows: ModelPricingItem[];
  syncResult: ModelPricingSyncResult | null;
  saving?: boolean;
  onSyncPricing: () => void;
  onSaveOverride: (input: {
    provider: string;
    model: string;
    currency: ModelUsageCurrency;
    inputCostPerMillion: number;
    outputCostPerMillion: number;
  }) => void;
};

export function PricingPanel({ l, currency, rows, syncResult, saving, onSyncPricing, onSaveOverride }: PricingPanelProps) {
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  const [inputCost, setInputCost] = useState("");
  const [outputCost, setOutputCost] = useState("");
  const columns: TableColumn[] = [
    { title: "provider", dataIndex: "provider", width: 140 },
    { title: "model", dataIndex: "model", width: 180 },
    {
      title: l("输入单价", "Input Cost"),
      dataIndex: "inputCostPerMillion",
      width: 140,
      render: (_value, item) => formatDecimal(item.inputCostPerMillion, 4),
    },
    {
      title: l("输出单价", "Output Cost"),
      dataIndex: "outputCostPerMillion",
      width: 140,
      render: (_value, item) => formatDecimal(item.outputCostPerMillion, 4),
    },
    { title: l("来源", "Source"), dataIndex: "source", width: 120 },
  ];

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{l("定价规则", "Pricing Rules")}</h3>
          <p className="text-xs text-slate-500">
            {l("当前仅刷新内置默认价格库；未接入外部在线价格源。手动覆盖优先于默认单价。", "Refreshes the built-in pricing catalog only; no external online pricing source is connected. Manual overrides take highest priority.")} · {formatInteger(rows.length)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button htmlType="button" onClick={onSyncPricing} disabled={saving}>
            {saving ? l("刷新中", "Refreshing") : l("刷新默认价格库", "Refresh Built-in Prices")}
          </Button>
          <Button htmlType="button" onClick={() => setOpen((value) => !value)}>
            {open ? l("收起", "Collapse") : l("展开", "Expand")}
          </Button>
        </div>
      </div>
      {syncResult ? (
        <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-slate-600">
          {l("默认价格库已刷新", "Built-in pricing refreshed")} · {formatInteger(syncResult.pricingRows)} {l("条", "rows")} · {syncResult.source}
          {syncResult.syncedAt ? ` · ${formatTimestamp(syncResult.syncedAt)}` : ""}
          {syncResult.fx ? ` · FX ${formatDecimal(syncResult.fx.rate, 4)} (${syncResult.fx.source})` : ""}
        </div>
      ) : null}
      {open ? (
        <>
          <div className="grid gap-2 md:grid-cols-5">
            <Input value={provider} onChange={(value) => setProvider(value)} placeholder="provider" />
            <Input value={model} onChange={(value) => setModel(value)} placeholder="model" />
            <Input value={inputCost} onChange={(value) => setInputCost(value)} placeholder={l("输入单价/百万", "Input cost / million")} />
            <Input value={outputCost} onChange={(value) => setOutputCost(value)} placeholder={l("输出单价/百万", "Output cost / million")} />
            <Button
              onClick={() =>
                onSaveOverride({
                  provider: provider.trim(),
                  model: model.trim(),
                  currency,
                  inputCostPerMillion: Number(inputCost),
                  outputCostPerMillion: Number(outputCost),
                })
              }
              disabled={saving || !provider.trim() || !model.trim()}
            >
              {l("保存覆盖", "Save Override")}
            </Button>
          </div>
          <Table
            rowKey={(item) => item ? `${item.source}-${item.provider}-${item.model}` : ""}
            columns={columns}
            dataSource={rows}
            pagination={false}
            scroll={{ x: 720 }}
            empty={<Empty title={l("暂无定价规则", "No pricing rules")} />}
          />
        </>
      ) : null}
    </div>
  );
}

type TableColumn = {
  title: string;
  dataIndex: string;
  width?: number;
  render?: (_value: unknown, record: ModelPricingItem) => ReactNode;
};
