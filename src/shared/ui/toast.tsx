import * as React from "react";
import { Toast as SemiToast } from "@douyinfe/semi-ui-19";

type ToastVariant = "default" | "destructive";
const DEFAULT_TOAST_DURATION_SECONDS = 3;

export interface ToastOptions {
  id?: string;
  title?: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
}

function renderToastContent(options: ToastOptions) {
  if (!options.title) {
    return options.description ?? "";
  }
  if (!options.description) {
    return options.title;
  }
  return (
    <div className="space-y-1">
      <div className="font-medium">{options.title}</div>
      <div>{options.description}</div>
    </div>
  );
}

function useToast() {
  const toast = React.useCallback((options: ToastOptions) => {
    const id = options.id ?? crypto.randomUUID();
    const toastOptions = {
      id,
      content: renderToastContent(options),
      duration: options.duration ?? DEFAULT_TOAST_DURATION_SECONDS,
    };
    if (options.variant === "destructive") {
      return SemiToast.error(toastOptions);
    }
    return SemiToast.info(toastOptions);
  }, []);

  const dismiss = React.useCallback((id: string) => SemiToast.close(id), []);

  return React.useMemo(() => ({ toast, dismiss }), [dismiss, toast]);
}

interface ToastProviderProps {
  children: React.ReactNode;
}

function ToastProvider({ children }: ToastProviderProps) {
  return children;
}

export { ToastProvider, useToast };
