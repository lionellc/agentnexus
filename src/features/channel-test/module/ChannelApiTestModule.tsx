import { Button } from "@douyinfe/semi-ui-19";
import { useState } from "react";

import { EmptyState } from "../../common/components/EmptyState";
import { ChannelTestCaseManager } from "../components/ChannelTestCaseManager";
import { ChannelTestForm } from "../components/ChannelTestForm";
import { ChannelTestResultsTable } from "../components/ChannelTestResultsTable";
import { useChannelApiTestController } from "../hooks/useChannelApiTestController";

type ChannelApiTestModuleProps = {
  l: (zh: string, en: string) => string;
  workspaceId: string | null;
};

export function ChannelApiTestModule({ l, workspaceId }: ChannelApiTestModuleProps) {
  const controller = useChannelApiTestController(workspaceId);
  const [page, setPage] = useState<"testbench" | "cases">("testbench");

  if (!workspaceId) {
    return (
      <EmptyState
        title={l("请先创建并激活工作区", "Create and activate a workspace first")}
        description={l("激活工作区后再运行渠道 API 测试。", "Activate a workspace before running channel API tests.")}
      />
    );
  }

  if (page === "cases") {
    return (
      <ChannelTestCaseManager
        cases={controller.cases}
        loading={controller.casesLoading}
        l={l}
        onBack={() => setPage("testbench")}
        onSave={controller.saveCase}
        onDelete={controller.deleteCase}
      />
    );
  }

  return (
    <section className="flex h-full min-h-0 flex-col gap-4 overflow-auto p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{l("渠道 API 测试台", "Channel API Testbench")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {l(
              "选择协议、模型、Base URL 和题库，手动测试渠道首字、用时和响应体。",
              "Choose a protocol, model, base URL, and case to test latency and responses.",
            )}
          </p>
        </div>
        <Button onClick={() => setPage("cases")}>{l("题库管理", "Case Library")}</Button>
      </div>
      <ChannelTestForm
        protocol={controller.form.protocol}
        model={controller.form.model}
        baseUrl={controller.form.baseUrl}
        apiKey={controller.form.apiKey}
        stream={controller.form.stream}
        category={controller.form.category}
        caseMode={controller.form.caseMode}
        caseId={controller.form.caseId}
        categoryCases={controller.categoryCases}
        selectedCase={controller.selectedCase}
        running={controller.running}
        canRun={controller.canRun}
        l={l}
        onChange={controller.updateForm}
        onRun={controller.run}
        onRunDiagnostic={controller.runDiagnostic}
        onRunSampling={controller.runSampling}
      />
      {controller.error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {controller.error}
        </div>
      ) : null}
      <ChannelTestResultsTable
        items={controller.items}
        total={controller.total}
        page={controller.page}
        pageSize={controller.pageSize}
        loading={controller.loading}
        l={l}
        onPageChange={controller.loadRuns}
      />
    </section>
  );
}
