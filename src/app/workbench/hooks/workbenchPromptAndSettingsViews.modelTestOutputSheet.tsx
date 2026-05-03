import { SideSheet } from "@douyinfe/semi-ui-19";
import type { RefObject } from "react";

type ModelTestOutputSheetState = {
  open: boolean;
  setOpen: (open: boolean) => void;
  running: boolean;
  lifecycleText: string;
  result: { ok: boolean; text: string } | null;
  output: {
    stdout: string;
    stderr: string;
  };
  stderrRef: RefObject<HTMLPreElement | null>;
};

type BuildModelTestOutputSheetViewInput = {
  l: (zh: string, en: string) => string;
  modelTestOutputSheet: ModelTestOutputSheetState;
};

export function buildModelTestOutputSheetView({
  l,
  modelTestOutputSheet,
}: BuildModelTestOutputSheetViewInput) {
  return (
    <SideSheet visible={modelTestOutputSheet.open} onCancel={() => modelTestOutputSheet.setOpen(false)} footer={null} title={null}>
      <div className="w-[min(94vw,560px)] overflow-hidden sm:max-w-[560px]">
        <div className="flex h-full flex-col overflow-hidden">
          <div className="pr-8">
            <h2>{l("运行输出", "Runtime Output")}</h2>
            <p>
              {modelTestOutputSheet.running
                ? l("正在运行，输出会实时刷新。", "Running, output updates in real time.")
                : l("查看最近一次运行输出。", "Inspect latest runtime output.")}
            </p>
          </div>
          <div className="mt-4 flex-1 space-y-3 overflow-y-auto pr-1">
            {modelTestOutputSheet.lifecycleText ? (
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700">
                {modelTestOutputSheet.lifecycleText}
              </div>
            ) : null}
            {modelTestOutputSheet.result ? (
              <div
                className={`rounded-md border px-3 py-2 text-xs ${
                  modelTestOutputSheet.result.ok
                    ? "border-green-200 bg-green-50 text-green-700"
                    : "border-red-200 bg-red-50 text-red-700"
                }`}
              >
                {modelTestOutputSheet.result.text}
              </div>
            ) : null}
            <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
              <div className="text-[11px] font-medium text-slate-500">stdout</div>
              <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded border border-slate-200 bg-white p-2 text-[11px] text-slate-700">
                {modelTestOutputSheet.output.stdout || "-"}
              </pre>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
              <div className="text-[11px] font-medium text-slate-500">stderr</div>
              <pre
                ref={modelTestOutputSheet.stderrRef}
                className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded border border-slate-200 bg-white p-2 text-[11px] text-slate-700"
              >
                {modelTestOutputSheet.output.stderr || "-"}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </SideSheet>
  );
}
