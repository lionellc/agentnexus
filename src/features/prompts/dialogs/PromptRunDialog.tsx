import { Button, Modal } from "@douyinfe/semi-ui-19";
import { Input } from "@douyinfe/semi-ui-19";
import { Copy } from "lucide-react";

export type PromptRunDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isZh: boolean;
  fromDetail: boolean;
  promptName: string;
  variableOrder: string[];
  variables: Record<string, string>;
  variableHistories: Record<string, string[]>;
  preview: string;
  onVariableChange: (variableName: string, value: string) => void;
  onApplyHistory: (variableName: string) => void;
  onCopyPreview: () => void;
  onCancel: () => void;
  copyDisabled?: boolean;
};

export function PromptRunDialog({
  open,
  onOpenChange,
  isZh,
  fromDetail,
  promptName,
  variableOrder,
  variables,
  variableHistories,
  preview,
  onVariableChange,
  onApplyHistory,
  onCopyPreview,
  onCancel,
  copyDisabled = false,
}: PromptRunDialogProps) {
  return (
    <Modal visible={open} onCancel={() => onOpenChange(false)} footer={null} title={null}>
      <div className="max-w-4xl">
        <div>
          <h2>{isZh ? "复制 Prompt" : "Copy Prompt"}</h2>
          <p>
            {fromDetail
              ? (isZh
                  ? `当前基于详情草稿复制：${promptName || "-"}`
                  : `Copying from detail draft: ${promptName || "-"}`)
              : (isZh
                  ? `当前基于列表项复制：${promptName || "-"}`
                  : `Copying from list item: ${promptName || "-"}`)}
          </p>
        </div>
        <div className="space-y-4">
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <div className="mb-2 text-xs font-medium text-slate-500">{isZh ? "变量输入" : "Variables"}</div>
            {variableOrder.length === 0 ? (
              <div className="text-xs text-slate-500">
                {isZh ? "当前 Prompt 不包含模板变量。" : "This prompt has no template variables."}
              </div>
            ) : (
              <div className="space-y-3">
                {variableOrder.map((variableName) => {
                  const history = variableHistories[variableName] ?? [];
                  return (
                    <div key={variableName} className="space-y-1">
                      <div className="text-xs font-medium text-slate-600">
                        {isZh ? "变量" : "Variable"}: {variableName}
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          value={variables[variableName] ?? ""}
                          onChange={(value) => onVariableChange(variableName, value)}
                          placeholder={isZh ? `请输入 ${variableName}` : `Enter ${variableName}`}
                        />
                        <Button
                          disabled={history.length === 0}
                          onClick={() => onApplyHistory(variableName)}
                        >
                          {isZh ? "历史记录" : "History"}
                        </Button>
                      </div>
                      {history.length > 0 ? (
                        <div className="line-clamp-1 text-[11px] text-slate-500">
                          {isZh ? "最近值：" : "Recent: "}
                          {history[0]}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <div className="mb-2 text-xs font-medium text-slate-500">{isZh ? "实时预览" : "Live Preview"}</div>
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md border border-slate-200 bg-white p-3 text-xs text-slate-700">
              {preview || "-"}
            </pre>
          </div>
        </div>
        <div>
          <Button onClick={onCancel}>
            {isZh ? "取消" : "Cancel"}
          </Button>
          <Button disabled={copyDisabled} onClick={onCopyPreview}>
            <Copy className="mr-1 h-4 w-4" />
            {isZh ? "复制预览内容" : "Copy Preview"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
