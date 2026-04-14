import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { flushSync } from "react-dom";

import { translationApi } from "../../../shared/services/api";
import type { PromptAsset, PromptTranslationConflictStrategy, PromptTranslationDto } from "../../../shared/types";

export type PromptTranslationStage = "idle" | "running" | "reviewing";

export type PromptTranslationResult = {
  ok: boolean;
  text: string;
} | null;

type ToastLike = (payload: {
  title: string;
  description?: string;
  variant?: "default" | "destructive";
}) => void;

type LocalAgentTranslationStreamEvent = {
  requestId: string;
  stream: "stdout" | "stderr" | "lifecycle" | string;
  chunk: string;
  done: boolean;
  ts: string;
};

type RuntimeOutputBuffer = {
  stdout: string;
  stderr: string;
};

export type PromptTranslationRuntimeOutput = {
  setOpen: (open: boolean) => void;
  setRunning: (running: boolean) => void;
  setResult: (result: PromptTranslationResult) => void;
  setLifecycleText: (text: string) => void;
  clearFlushTimer: () => void;
  getBuffer: () => RuntimeOutputBuffer;
  setBuffer: (buffer: RuntimeOutputBuffer) => void;
  setOutput: (output: RuntimeOutputBuffer) => void;
  appendChunk: (stream: "stdout" | "stderr", chunk: string) => void;
  flushBuffer: () => void;
};

type UsePromptTranslationInput = {
  activeWorkspaceId: string | null;
  selectedPrompt: PromptAsset | null;
  detailContent: string;
  translationTargetLanguage: string;
  selectedModelProfileKey: string;
  localAgentTranslationStreamEvent: string;
  l: (zh: string, en: string) => string;
  projectBootingMessage: string;
  toast: ToastLike;
  unknownToMessage: (error: unknown, fallback: string) => string;
  unknownToCode: (error: unknown) => string | undefined;
  extractStdoutPreviewFromErrorMessage: (message: string) => string;
  waitForUiPaint: () => Promise<void>;
  runtimeOutput: PromptTranslationRuntimeOutput;
};

function createRequestId(): string {
  const nativeCrypto = globalThis.crypto as Crypto | undefined;
  if (nativeCrypto?.randomUUID) {
    return nativeCrypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function parseRunningLifecycleSeconds(value: string): number | null {
  const matched = value.match(/^running:(\d+)\s+min\s+(\d+)\s+s$/);
  if (!matched) {
    return null;
  }
  const minutes = Number.parseInt(matched[1] ?? "0", 10);
  const seconds = Number.parseInt(matched[2] ?? "0", 10);
  if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) {
    return null;
  }
  return Math.max(0, minutes * 60 + seconds);
}

function formatElapsedMinSec(totalSeconds: number): string {
  const safeSeconds = Number.isFinite(totalSeconds) && totalSeconds > 0 ? Math.floor(totalSeconds) : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes} min ${seconds} s`;
}

export function usePromptTranslation({
  activeWorkspaceId,
  selectedPrompt,
  detailContent,
  translationTargetLanguage,
  selectedModelProfileKey,
  localAgentTranslationStreamEvent,
  l,
  projectBootingMessage,
  toast,
  unknownToMessage,
  unknownToCode,
  extractStdoutPreviewFromErrorMessage,
  waitForUiPaint,
  runtimeOutput,
}: UsePromptTranslationInput) {
  const [promptTranslationLoading, setPromptTranslationLoading] = useState(false);
  const [promptTranslationRunning, setPromptTranslationRunning] = useState(false);
  const [promptTranslationStage, setPromptTranslationStage] = useState<PromptTranslationStage>("idle");
  const [promptTranslationResult, setPromptTranslationResult] = useState<PromptTranslationResult>(null);
  const [promptTranslationElapsedSeconds, setPromptTranslationElapsedSeconds] = useState(0);
  const [promptTranslations, setPromptTranslations] = useState<PromptTranslationDto[]>([]);
  const [selectedPromptTranslationId, setSelectedPromptTranslationId] = useState<string | null>(null);

  const promptTranslationStartedAtRef = useRef<number | null>(null);
  const promptTranslationElapsedTimerRef = useRef<number | null>(null);
  const streamUnlistenRef = useRef<UnlistenFn | null>(null);

  const selectedPromptTranslation = useMemo(
    () => promptTranslations.find((item) => item.id === selectedPromptTranslationId) ?? null,
    [promptTranslations, selectedPromptTranslationId],
  );

  const promptTranslationElapsedLabel = useMemo(
    () => formatElapsedMinSec(promptTranslationElapsedSeconds),
    [promptTranslationElapsedSeconds],
  );

  const stopPromptTranslationElapsedTimer = useCallback(() => {
    const timer = promptTranslationElapsedTimerRef.current;
    if (timer !== null) {
      window.clearInterval(timer);
      promptTranslationElapsedTimerRef.current = null;
    }
    promptTranslationStartedAtRef.current = null;
  }, []);

  const startPromptTranslationElapsedTimer = useCallback(() => {
    stopPromptTranslationElapsedTimer();
    const startedAt = Date.now();
    promptTranslationStartedAtRef.current = startedAt;
    setPromptTranslationElapsedSeconds(0);
    promptTranslationElapsedTimerRef.current = window.setInterval(() => {
      const now = Date.now();
      const begin = promptTranslationStartedAtRef.current ?? now;
      setPromptTranslationElapsedSeconds(Math.max(0, Math.floor((now - begin) / 1000)));
    }, 1000);
  }, [stopPromptTranslationElapsedTimer]);

  const cleanupStreamListener = useCallback(() => {
    const unlisten = streamUnlistenRef.current;
    if (!unlisten) {
      return;
    }
    streamUnlistenRef.current = null;
    unlisten();
  }, []);

  const loadPromptTranslationsByCurrentPrompt = useCallback(async (nextLanguage?: string) => {
    if (!activeWorkspaceId || !selectedPrompt) {
      setPromptTranslations([]);
      setSelectedPromptTranslationId(null);
      return;
    }

    setPromptTranslationLoading(true);
    try {
      const rows = await translationApi.listPromptTranslations({
        workspaceId: activeWorkspaceId,
        promptId: selectedPrompt.id,
        promptVersion: selectedPrompt.activeVersion,
        targetLanguage: nextLanguage?.trim() ? nextLanguage.trim() : undefined,
        limit: 50,
      });
      setPromptTranslations(rows);
      setSelectedPromptTranslationId((prev) => {
        if (prev && rows.some((item) => item.id === prev)) {
          return prev;
        }
        return rows[0]?.id ?? null;
      });
    } catch (error) {
      toast({
        title: l("读取译文失败", "Failed to load translations"),
        description: unknownToMessage(error, l("未知错误", "Unknown error")),
        variant: "destructive",
      });
    } finally {
      setPromptTranslationLoading(false);
    }
  }, [activeWorkspaceId, l, selectedPrompt, toast, unknownToMessage]);

  const runPromptTranslation = useCallback(async (initialStrategy?: PromptTranslationConflictStrategy) => {
    if (!activeWorkspaceId || !selectedPrompt) {
      toast({ title: projectBootingMessage, variant: "destructive" });
      return;
    }
    const targetLanguage = translationTargetLanguage.trim();
    if (!targetLanguage) {
      toast({
        title: l("请先输入目标语言", "Please input target language"),
        variant: "destructive",
      });
      return;
    }

    const requestId = createRequestId();
    let strategy = initialStrategy;

    flushSync(() => {
      setPromptTranslationRunning(true);
      setPromptTranslationStage("running");
      setPromptTranslationResult(null);
      startPromptTranslationElapsedTimer();
      runtimeOutput.setOpen(true);
      runtimeOutput.setRunning(true);
      runtimeOutput.setResult(null);
      runtimeOutput.setLifecycleText(l("准备运行...", "Preparing..."));
      runtimeOutput.clearFlushTimer();
      runtimeOutput.setBuffer({ stdout: "", stderr: "" });
      runtimeOutput.setOutput({ stdout: "", stderr: "" });
    });

    await waitForUiPaint();

    try {
      if (isTauri()) {
        streamUnlistenRef.current = await listen<LocalAgentTranslationStreamEvent>(
          localAgentTranslationStreamEvent,
          (event) => {
            const payload = event.payload;
            if (!payload || payload.requestId !== requestId) {
              return;
            }
            if (payload.stream === "stdout") {
              runtimeOutput.appendChunk("stdout", payload.chunk ?? "");
              return;
            }
            if (payload.stream === "stderr") {
              runtimeOutput.appendChunk("stderr", payload.chunk ?? "");
              return;
            }
            if (payload.stream === "lifecycle") {
              const lifecycleText = (payload.chunk ?? "").trim();
              if (!lifecycleText) {
                return;
              }
              runtimeOutput.setLifecycleText(lifecycleText);
              if (lifecycleText === "started") {
                setPromptTranslationStage("running");
                return;
              }
              const lifecycleSeconds = parseRunningLifecycleSeconds(lifecycleText);
              if (lifecycleSeconds !== null) {
                setPromptTranslationElapsedSeconds(lifecycleSeconds);
              }
            }
          },
        );
      }

      while (true) {
        try {
          const created = await translationApi.runPromptTranslation({
            workspaceId: activeWorkspaceId,
            promptId: selectedPrompt.id,
            promptVersion: selectedPrompt.activeVersion,
            sourceText: detailContent,
            targetLanguage,
            profileKey: selectedModelProfileKey || undefined,
            strategy,
            applyMode: "immersive",
            requestId,
          });
          await loadPromptTranslationsByCurrentPrompt(targetLanguage);
          setSelectedPromptTranslationId(created.id);
          setPromptTranslationStage("reviewing");
          setPromptTranslationResult({
            ok: true,
            text: l(
              "翻译完成，已保存为该 Prompt 的翻译资产，可直接复用。",
              "Translation completed and saved as a prompt translation asset for reuse.",
            ),
          });

          const buffer = runtimeOutput.getBuffer();
          if (!buffer.stdout) {
            runtimeOutput.setBuffer({
              ...buffer,
              stdout: JSON.stringify(
                {
                  translatedText: created.translatedText,
                  targetLanguage: created.targetLanguage,
                },
                null,
                2,
              ),
            });
          }

          runtimeOutput.flushBuffer();
          runtimeOutput.setResult({ ok: true, text: l("翻译完成", "Translation completed") });
          runtimeOutput.setLifecycleText(l("已完成", "Completed"));
          toast({ title: l("翻译完成", "Translation completed") });
          break;
        } catch (error) {
          const code = unknownToCode(error);
          if (code === "TRANSLATION_CONFLICT" && !strategy) {
            const overwrite = window.confirm(
              l(
                "同版本同语言已有译文。\n确定：覆盖现有译文\n取消：另存新译文",
                "A translation already exists for this version and language.\nOK: overwrite\nCancel: save as new variant",
              ),
            );
            strategy = overwrite ? "overwrite" : "save_as";
            continue;
          }
          throw error;
        }
      }
    } catch (error) {
      const message = unknownToMessage(error, l("未知错误", "Unknown error"));
      const stdoutPreview = extractStdoutPreviewFromErrorMessage(message);
      const buffer = runtimeOutput.getBuffer();
      runtimeOutput.setBuffer({
        stdout: !buffer.stdout && stdoutPreview ? stdoutPreview : buffer.stdout,
        stderr: !buffer.stderr ? message : buffer.stderr,
      });
      runtimeOutput.flushBuffer();

      setPromptTranslationStage("idle");
      setPromptTranslationResult({ ok: false, text: message });
      runtimeOutput.setResult({ ok: false, text: message });
      runtimeOutput.setLifecycleText(l("执行失败", "Execution failed"));
      toast({
        title: l("翻译失败", "Translation failed"),
        description: message,
        variant: "destructive",
      });
    } finally {
      cleanupStreamListener();
      runtimeOutput.flushBuffer();
      stopPromptTranslationElapsedTimer();
      setPromptTranslationRunning(false);
      runtimeOutput.setRunning(false);
    }
  }, [
    activeWorkspaceId,
    cleanupStreamListener,
    detailContent,
    extractStdoutPreviewFromErrorMessage,
    l,
    loadPromptTranslationsByCurrentPrompt,
    localAgentTranslationStreamEvent,
    projectBootingMessage,
    runtimeOutput,
    selectedModelProfileKey,
    selectedPrompt,
    startPromptTranslationElapsedTimer,
    stopPromptTranslationElapsedTimer,
    toast,
    translationTargetLanguage,
    unknownToCode,
    unknownToMessage,
    waitForUiPaint,
  ]);

  useEffect(() => {
    if (promptTranslationRunning) {
      return;
    }
    if (selectedPromptTranslation) {
      setPromptTranslationStage("reviewing");
      return;
    }
    setPromptTranslationStage((prev) => (prev === "running" ? "running" : "idle"));
  }, [promptTranslationRunning, selectedPromptTranslation]);

  useEffect(() => {
    if (!selectedPrompt) {
      setPromptTranslations([]);
      setSelectedPromptTranslationId(null);
      setPromptTranslationStage("idle");
      setPromptTranslationResult(null);
      setPromptTranslationElapsedSeconds(0);
      stopPromptTranslationElapsedTimer();
      return;
    }

    setPromptTranslationStage("idle");
    setPromptTranslationResult(null);
    setPromptTranslationElapsedSeconds(0);
    stopPromptTranslationElapsedTimer();
  }, [selectedPrompt, stopPromptTranslationElapsedTimer]);

  useEffect(() => {
    if (!selectedPrompt || !activeWorkspaceId) {
      return;
    }
    void loadPromptTranslationsByCurrentPrompt(translationTargetLanguage);
  }, [selectedPrompt, activeWorkspaceId, translationTargetLanguage, loadPromptTranslationsByCurrentPrompt]);

  useEffect(() => {
    return () => {
      cleanupStreamListener();
      stopPromptTranslationElapsedTimer();
    };
  }, [cleanupStreamListener, stopPromptTranslationElapsedTimer]);

  return {
    promptTranslationLoading,
    promptTranslationRunning,
    promptTranslationStage,
    promptTranslationResult,
    promptTranslationElapsedLabel,
    promptTranslations,
    selectedPromptTranslationId,
    selectedPromptTranslation,
    runPromptTranslation,
    setPromptTranslationStage,
    setPromptTranslationResult,
    setSelectedPromptTranslationId,
    loadPromptTranslationsByCurrentPrompt,
  };
}
