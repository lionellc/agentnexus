import { Button, Input, Select, Switch, Tag } from "@douyinfe/semi-ui-19";

import type { ChannelApiTestCase, ChannelApiTestCategory, ChannelApiTestProtocol } from "../../../shared/types";
import { categoryLabel } from "../utils/format";

type ChannelTestFormProps = {
  protocol: ChannelApiTestProtocol;
  model: string;
  baseUrl: string;
  apiKey: string;
  stream: boolean;
  category: ChannelApiTestCategory;
  caseMode: "specific" | "random";
  caseId: string;
  categoryCases: ChannelApiTestCase[];
  selectedCase: ChannelApiTestCase;
  running: boolean;
  canRun: boolean;
  l: (zh: string, en: string) => string;
  onChange: (patch: Partial<{
    protocol: ChannelApiTestProtocol;
    model: string;
    baseUrl: string;
    apiKey: string;
    stream: boolean;
    category: ChannelApiTestCategory;
    caseMode: "specific" | "random";
    caseId: string;
  }>) => void;
  onRun: () => void;
  onRunDiagnostic: () => void;
  onRunSampling: () => void;
};

export function ChannelTestForm({
  protocol,
  model,
  baseUrl,
  apiKey,
  stream,
  category,
  caseMode,
  caseId,
  categoryCases,
  selectedCase,
  running,
  canRun,
  l,
  onChange,
  onRun,
  onRunDiagnostic,
  onRunSampling,
}: ChannelTestFormProps) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="grid gap-4 lg:grid-cols-[180px_1fr_1fr_1fr]">
        <label className="space-y-1 text-sm">
          <span className="font-medium text-foreground">{l("协议", "Protocol")}</span>
          <Select
            value={protocol}
            className="w-full"
            optionList={[
              { label: "OpenAI-compatible", value: "openai" },
              { label: "Anthropic-compatible", value: "anthropic" },
            ]}
            onChange={(value) => onChange({ protocol: value as ChannelApiTestProtocol })}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium text-foreground">{l("模型", "Model")}</span>
          <Input value={model} placeholder="gpt-4.1-mini / claude-sonnet-4-5" onChange={(value) => onChange({ model: value })} />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium text-foreground">Base URL</span>
          <Input value={baseUrl} placeholder="https://api.example.com" onChange={(value) => onChange({ baseUrl: value })} />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium text-foreground">API Key</span>
          <Input mode="password" value={apiKey} placeholder={l("仅用于本次测试", "Only used for this test")} onChange={(value) => onChange({ apiKey: value })} />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-4">
        <label className="min-w-40 space-y-1 text-sm">
          <span className="font-medium text-foreground">{l("题型", "Case Type")}</span>
          <Select
            value={category}
            className="w-full"
            optionList={[
              { label: l("小请求", "Small Request"), value: "small" },
              { label: l("中等请求", "Medium Request"), value: "medium" },
              { label: l("大请求", "Large Request"), value: "large" },
              { label: l("连续追问型", "Follow-up"), value: "followup" },
            ]}
            onChange={(value) => onChange({ category: value as ChannelApiTestCategory })}
          />
        </label>
        <label className="min-w-36 space-y-1 text-sm">
          <span className="font-medium text-foreground">{l("选题方式", "Selection")}</span>
          <Select
            value={caseMode}
            className="w-full"
            optionList={[
              { label: l("指定题目", "Specific"), value: "specific" },
              { label: l("随机题目", "Random"), value: "random" },
            ]}
            onChange={(value) => onChange({ caseMode: value as "specific" | "random" })}
          />
        </label>
        <label className="min-w-64 space-y-1 text-sm">
          <span className="font-medium text-foreground">{l("题目", "Case")}</span>
          <Select
            value={caseId}
            className="w-full"
            disabled={caseMode === "random"}
            optionList={categoryCases.map((item) => ({
              label: item.label,
              value: item.id,
            }))}
            onChange={(value) => onChange({ caseId: String(value) })}
          />
        </label>
        <div className="flex items-center gap-2 pb-2 text-sm">
          <Switch checked={stream} onChange={(checked) => onChange({ stream: Boolean(checked) })} />
          <span className="text-foreground">{l("流式请求", "Streaming")}</span>
          {stream ? <Tag color="blue">{l("流", "Stream")}</Tag> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button theme="solid" type="primary" loading={running} disabled={!canRun || running} onClick={onRun}>
            {running ? l("测试中", "Running") : l("运行测试", "Run Test")}
          </Button>
          <Button disabled={!canRun || running} onClick={onRunDiagnostic}>
            {l("诊断探针", "Probe")}
          </Button>
          <Button disabled={!canRun || running} onClick={onRunSampling}>
            {l("路由采样", "Sampling")}
          </Button>
        </div>
      </div>
      <div className="mt-3 rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span className="font-medium text-foreground">{l("题库预览", "Case Preview")}</span>
          <Tag>{l(categoryLabel(category), categoryEnglishLabel(category))}</Tag>
          <Tag>{caseMode === "random" ? l(`随机 ${categoryCases.length} 题`, `${categoryCases.length} random cases`) : selectedCase.label}</Tag>
        </div>
        <pre className="max-h-28 overflow-auto whitespace-pre-wrap text-xs">
          {previewCase(selectedCase)}
        </pre>
      </div>
    </section>
  );
}

function categoryEnglishLabel(category: ChannelApiTestCategory) {
  switch (category) {
    case "small":
      return "Small Request";
    case "medium":
      return "Medium Request";
    case "large":
      return "Large Request";
    case "followup":
      return "Follow-up";
    default:
      return category;
  }
}

function previewCase(testCase: ChannelApiTestCase) {
  if (testCase.rounds?.length) {
    return testCase.rounds.map((round) => `${round.id}: ${round.prompt}`).join("\n");
  }
  return testCase.messages?.map((message) => `${message.role}: ${message.content}`).join("\n") ?? "";
}
