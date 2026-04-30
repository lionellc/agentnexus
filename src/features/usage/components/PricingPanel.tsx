import { useState } from "react";

import { Button, Input } from "../../../shared/ui";
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
          <Button type="button" size="sm" variant="outline" onClick={onSyncPricing} disabled={saving}>
            {saving ? l("刷新中", "Refreshing") : l("刷新默认价格库", "Refresh Built-in Prices")}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setOpen((value) => !value)}>
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
            <Input value={provider} onChange={(event) => setProvider(event.target.value)} placeholder="provider" />
            <Input value={model} onChange={(event) => setModel(event.target.value)} placeholder="model" />
            <Input value={inputCost} onChange={(event) => setInputCost(event.target.value)} placeholder={l("输入单价/百万", "Input cost / million")} />
            <Input value={outputCost} onChange={(event) => setOutputCost(event.target.value)} placeholder={l("输出单价/百万", "Output cost / million")} />
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
          <div className="overflow-auto">
            <table className="min-w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border text-slate-500">
                  <th className="py-2 pr-3">provider</th>
                  <th className="py-2 pr-3">model</th>
                  <th className="py-2 pr-3">{l("输入单价", "Input Cost")}</th>
                  <th className="py-2 pr-3">{l("输出单价", "Output Cost")}</th>
                  <th className="py-2 pr-3">{l("来源", "Source")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => (
                  <tr key={`${item.source}-${item.provider}-${item.model}`} className="border-b border-border/60">
                    <td className="py-2 pr-3">{item.provider}</td>
                    <td className="py-2 pr-3">{item.model}</td>
                    <td className="py-2 pr-3">{formatDecimal(item.inputCostPerMillion, 4)}</td>
                    <td className="py-2 pr-3">{formatDecimal(item.outputCostPerMillion, 4)}</td>
                    <td className="py-2 pr-3">{item.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}
