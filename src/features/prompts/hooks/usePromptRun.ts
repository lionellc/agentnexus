import { useCallback, useMemo, useState } from "react";

import { getPromptRunHistory, writePromptRunHistory } from "../../../shared/utils/promptRunHistory";
import { extractTemplateVariables, renderTemplatePreview } from "../../../shared/utils/template";

type ToastLike = (payload: {
  title: string;
  description?: string;
  variant?: "default" | "destructive";
}) => void;

type UsePromptRunInput = {
  activeWorkspaceId: string | null;
  selectedPrompt: { id: string; name: string } | null;
  detailName: string;
  detailContent: string;
  l: (zh: string, en: string) => string;
  toast: ToastLike;
  unknownToMessage: (error: unknown, fallback: string) => string;
};

type PromptRunRow = {
  id: string;
  name: string;
  content: string;
};

export function usePromptRun({
  activeWorkspaceId,
  selectedPrompt,
  detailName,
  detailContent,
  l,
  toast,
  unknownToMessage,
}: UsePromptRunInput) {
  const [promptRunOpen, setPromptRunOpen] = useState(false);
  const [promptRunFromDetail, setPromptRunFromDetail] = useState(false);
  const [promptRunPromptId, setPromptRunPromptId] = useState<string | null>(null);
  const [promptRunPromptName, setPromptRunPromptName] = useState("");
  const [promptRunContent, setPromptRunContent] = useState("");
  const [promptRunVariables, setPromptRunVariables] = useState<Record<string, string>>({});
  const [promptRunVariableOrder, setPromptRunVariableOrder] = useState<string[]>([]);
  const [promptRunVariableHistories, setPromptRunVariableHistories] = useState<Record<string, string[]>>({});

  const promptRunPreview = useMemo(
    () => renderTemplatePreview(promptRunContent, promptRunVariables),
    [promptRunContent, promptRunVariables],
  );

  const handleClosePromptRun = useCallback(() => {
    setPromptRunOpen(false);
    setPromptRunFromDetail(false);
    setPromptRunPromptId(null);
    setPromptRunPromptName("");
    setPromptRunContent("");
    setPromptRunVariables({});
    setPromptRunVariableOrder([]);
    setPromptRunVariableHistories({});
  }, []);

  const openPromptRun = useCallback((input: {
    promptId: string;
    promptName: string;
    content: string;
    fromDetail: boolean;
  }) => {
    const histories: Record<string, string[]> = {};
    const nextVariables: Record<string, string> = {};
    const variableOrder = extractTemplateVariables(input.content);
    const previousForSamePrompt =
      promptRunPromptId === input.promptId ? promptRunVariables : {};

    for (const variableName of variableOrder) {
      const history = activeWorkspaceId
        ? getPromptRunHistory({
            workspaceId: activeWorkspaceId,
            promptId: input.promptId,
            variableName,
          })
        : [];
      histories[variableName] = history;
      const previous = previousForSamePrompt[variableName];
      nextVariables[variableName] = previous?.trim() ? previous : history[0] ?? "";
    }

    setPromptRunFromDetail(input.fromDetail);
    setPromptRunPromptId(input.promptId);
    setPromptRunPromptName(input.promptName);
    setPromptRunContent(input.content);
    setPromptRunVariableOrder(variableOrder);
    setPromptRunVariableHistories(histories);
    setPromptRunVariables(nextVariables);
    setPromptRunOpen(true);
  }, [activeWorkspaceId, promptRunPromptId, promptRunVariables]);

  const handleCopyPromptDirect = useCallback(async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      toast({
        title: l("复制成功", "Copied"),
      });
    } catch (error) {
      toast({
        title: l("复制失败", "Copy failed"),
        description: unknownToMessage(error, l("未知错误", "Unknown error")),
        variant: "destructive",
      });
    }
  }, [l, toast, unknownToMessage]);

  const handleCopyPromptFromDetail = useCallback(async () => {
    if (!selectedPrompt) {
      return;
    }
    const promptId = selectedPrompt.id;
    const promptName = detailName.trim() || selectedPrompt.name;
    const content = detailContent;
    const variableOrder = extractTemplateVariables(content);
    if (variableOrder.length === 0) {
      await handleCopyPromptDirect(content);
      return;
    }
    openPromptRun({
      promptId,
      promptName,
      content,
      fromDetail: true,
    });
  }, [detailContent, detailName, handleCopyPromptDirect, openPromptRun, selectedPrompt]);

  const handleCopyPromptFromRow = useCallback(async (row: PromptRunRow) => {
    const variableOrder = extractTemplateVariables(row.content);
    if (variableOrder.length === 0) {
      await handleCopyPromptDirect(row.content);
      return;
    }
    openPromptRun({
      promptId: row.id,
      promptName: row.name,
      content: row.content,
      fromDetail: false,
    });
  }, [handleCopyPromptDirect, openPromptRun]);

  const handlePromptRunVariableChange = useCallback((variableName: string, value: string) => {
    setPromptRunVariables((prev) => ({
      ...prev,
      [variableName]: value,
    }));
  }, []);

  const handlePromptRunApplyHistory = useCallback((variableName: string) => {
    const latest = promptRunVariableHistories[variableName]?.[0];
    if (!latest) {
      return;
    }
    handlePromptRunVariableChange(variableName, latest);
  }, [handlePromptRunVariableChange, promptRunVariableHistories]);

  const handleCopyPromptRunPreview = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(promptRunPreview);
      if (activeWorkspaceId && promptRunPromptId) {
        const refreshedHistories: Record<string, string[]> = {};
        for (const variableName of promptRunVariableOrder) {
          const value = promptRunVariables[variableName]?.trim();
          if (!value) {
            continue;
          }
          const nextHistory = writePromptRunHistory(
            {
              workspaceId: activeWorkspaceId,
              promptId: promptRunPromptId,
              variableName,
            },
            value,
            {
              max: 1,
            },
          );
          refreshedHistories[variableName] = nextHistory;
        }
        for (const variableName of promptRunVariableOrder) {
          if (refreshedHistories[variableName]) {
            continue;
          }
          refreshedHistories[variableName] = getPromptRunHistory({
            workspaceId: activeWorkspaceId,
            promptId: promptRunPromptId,
            variableName,
          });
        }
        setPromptRunVariableHistories(refreshedHistories);
      }
      toast({ title: l("复制成功", "Copied") });
    } catch (error) {
      toast({
        title: l("复制失败", "Copy failed"),
        description: unknownToMessage(error, l("未知错误", "Unknown error")),
        variant: "destructive",
      });
    }
  }, [
    activeWorkspaceId,
    l,
    promptRunPreview,
    promptRunPromptId,
    promptRunVariableOrder,
    promptRunVariables,
    toast,
    unknownToMessage,
  ]);

  const handlePromptRunDialogOpenChange = useCallback((open: boolean) => {
    if (!open) {
      handleClosePromptRun();
      return;
    }
    setPromptRunOpen(true);
  }, [handleClosePromptRun]);

  return {
    promptRunOpen,
    promptRunFromDetail,
    promptRunPromptName,
    promptRunVariableOrder,
    promptRunVariables,
    promptRunVariableHistories,
    promptRunPreview,
    handlePromptRunDialogOpenChange,
    handleCopyPromptFromDetail,
    handleCopyPromptFromRow,
    handleClosePromptRun,
    handlePromptRunVariableChange,
    handlePromptRunApplyHistory,
    handleCopyPromptRunPreview,
  };
}
