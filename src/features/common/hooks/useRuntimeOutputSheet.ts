import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";

type RuntimeOutputBuffer = {
  stdout: string;
  stderr: string;
};

export type RuntimeOutputResult = {
  ok: boolean;
  text: string;
} | null;

export type UseRuntimeOutputSheetResult = {
  open: boolean;
  running: boolean;
  result: RuntimeOutputResult;
  output: RuntimeOutputBuffer;
  lifecycleText: string;
  setOpen: (open: boolean) => void;
  setRunning: (running: boolean) => void;
  setResult: (result: RuntimeOutputResult) => void;
  setOutput: (output: RuntimeOutputBuffer) => void;
  setLifecycleText: (text: string) => void;
  bufferRef: MutableRefObject<RuntimeOutputBuffer>;
  stderrRef: MutableRefObject<HTMLPreElement | null>;
  flushTimerRef: MutableRefObject<number | null>;
  appendChunk: (stream: "stdout" | "stderr", chunk: string) => void;
  flushBuffer: () => void;
  clearFlushTimer: () => void;
  setLifecycleFromRaw: (rawLifecycleText: string) => void;
};

export type UseRuntimeOutputSheetInput = {
  l: (zh: string, en: string) => string;
  flushIntervalMs?: number;
  previewLimit?: number;
};

function appendPreviewChunk(previous: string, chunk: string, limit: number): string {
  if (!chunk) {
    return previous;
  }
  const combined = previous + chunk;
  if (combined.length <= limit) {
    return combined;
  }
  return combined.slice(combined.length - limit);
}

function formatElapsedCompact(totalSeconds: number): string {
  const safeSeconds = Number.isFinite(totalSeconds) && totalSeconds > 0 ? Math.floor(totalSeconds) : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes}m ${seconds}s`;
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

export function useRuntimeOutputSheet({
  l,
  flushIntervalMs = 80,
  previewLimit = 32 * 1024,
}: UseRuntimeOutputSheetInput): UseRuntimeOutputSheetResult {
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RuntimeOutputResult>(null);
  const [output, setOutput] = useState<RuntimeOutputBuffer>({ stdout: "", stderr: "" });
  const [lifecycleText, setLifecycleText] = useState("");

  const bufferRef = useRef<RuntimeOutputBuffer>({ stdout: "", stderr: "" });
  const flushTimerRef = useRef<number | null>(null);
  const stderrRef = useRef<HTMLPreElement | null>(null);

  const clearFlushTimer = useCallback(() => {
    const timer = flushTimerRef.current;
    if (timer === null) {
      return;
    }
    window.clearTimeout(timer);
    flushTimerRef.current = null;
  }, []);

  const flushBuffer = useCallback(() => {
    clearFlushTimer();
    setOutput({
      stdout: bufferRef.current.stdout,
      stderr: bufferRef.current.stderr,
    });
  }, [clearFlushTimer]);

  const scheduleFlush = useCallback(() => {
    if (flushTimerRef.current !== null) {
      return;
    }
    flushTimerRef.current = window.setTimeout(() => {
      flushTimerRef.current = null;
      setOutput({
        stdout: bufferRef.current.stdout,
        stderr: bufferRef.current.stderr,
      });
    }, flushIntervalMs);
  }, [flushIntervalMs]);

  const appendChunk = useCallback(
    (stream: "stdout" | "stderr", chunk: string) => {
      if (!chunk) {
        return;
      }
      if (stream === "stdout") {
        bufferRef.current.stdout = appendPreviewChunk(bufferRef.current.stdout, chunk, previewLimit);
      } else {
        bufferRef.current.stderr = appendPreviewChunk(bufferRef.current.stderr, chunk, previewLimit);
      }
      scheduleFlush();
    },
    [previewLimit, scheduleFlush],
  );

  const setLifecycleFromRaw = useCallback(
    (rawLifecycleText: string) => {
      const next = rawLifecycleText.trim();
      if (!next) {
        return;
      }
      const runningSeconds = parseRunningLifecycleSeconds(next);
      if (runningSeconds !== null) {
        const compact = formatElapsedCompact(runningSeconds);
        setLifecycleText(l(`已处理 ${compact}`, `Processed ${compact}`));
        return;
      }
      if (next === "started") {
        setLifecycleText(l("已启动", "Started"));
        return;
      }
      if (next === "completed") {
        setLifecycleText(l("已完成", "Completed"));
        return;
      }
      if (next === "timeout") {
        setLifecycleText(l("已超时", "Timed out"));
        return;
      }
      if (next === "auth-required") {
        setLifecycleText(l("需要登录", "Auth required"));
        return;
      }
      if (next === "exec-failed") {
        setLifecycleText(l("执行失败", "Execution failed"));
        return;
      }
      if (next === "protocol-invalid") {
        setLifecycleText(l("输出协议异常", "Protocol invalid"));
        return;
      }
      setLifecycleText(next);
    },
    [l],
  );

  useEffect(() => {
    return () => {
      clearFlushTimer();
    };
  }, [clearFlushTimer]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const target = stderrRef.current;
    if (!target) {
      return;
    }
    target.scrollTop = target.scrollHeight;
  }, [open, output.stderr]);

  return {
    open,
    running,
    result,
    output,
    lifecycleText,
    setOpen,
    setRunning,
    setResult,
    setOutput,
    setLifecycleText,
    bufferRef,
    stderrRef,
    flushTimerRef,
    appendChunk,
    flushBuffer,
    clearFlushTimer,
    setLifecycleFromRaw,
  };
}
