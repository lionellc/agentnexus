import * as React from "react";
import { createPortal } from "react-dom";
import { create } from "zustand";
import { X } from "lucide-react";

import { cn } from "../lib/cn";

type ToastVariant = "default" | "destructive";

export interface ToastOptions {
  id?: string;
  title?: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
}

interface ToastItem extends Required<Pick<ToastOptions, "id" | "variant" | "duration">> {
  title?: string;
  description?: string;
}

interface ToastState {
  toasts: ToastItem[];
  addToast: (options: ToastOptions) => string;
  dismissToast: (id: string) => void;
  removeToast: (id: string) => void;
}

const TOAST_EXIT_DELAY = 150;

const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  addToast: (options) => {
    const id = options.id ?? crypto.randomUUID();
    const variant = options.variant ?? "default";
    const duration = options.duration ?? 3000;

    set((state) => ({
      toasts: [...state.toasts, { id, title: options.title, description: options.description, variant, duration }],
    }));

    window.setTimeout(() => {
      get().dismissToast(id);
      window.setTimeout(() => {
        get().removeToast(id);
      }, TOAST_EXIT_DELAY);
    }, duration);

    return id;
  },
  dismissToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((toast) => toast.id !== id),
    }));
  },
  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((toast) => toast.id !== id),
    }));
  },
}));

function useToast() {
  const addToast = useToastStore((state) => state.addToast);
  const dismissToast = useToastStore((state) => state.dismissToast);

  return {
    toast: addToast,
    dismiss: dismissToast,
  };
}

interface ToastProviderProps {
  children: React.ReactNode;
}

function ToastProvider({ children }: ToastProviderProps) {
  return (
    <>
      {children}
      <ToastViewport />
    </>
  );
}

function ToastViewport() {
  const toasts = useToastStore((state) => state.toasts);
  const dismissToast = useToastStore((state) => state.dismissToast);

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="fixed right-4 top-4 z-[100] flex w-full max-w-sm flex-col gap-2">
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onDismiss={() => dismissToast(toast.id)} />
      ))}
    </div>,
    document.body,
  );
}

interface ToastProps {
  toast: ToastItem;
  onDismiss: () => void;
}

function Toast({ toast, onDismiss }: ToastProps) {
  return (
    <div
      role="status"
      className={cn(
        "rounded-md border bg-background p-4 shadow-md animate-fade-in",
        toast.variant === "destructive" && "border-destructive bg-destructive text-destructive-foreground",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          {toast.title && <p className="text-sm font-semibold leading-none">{toast.title}</p>}
          {toast.description && <p className="text-sm opacity-90">{toast.description}</p>}
        </div>
        <button
          type="button"
          aria-label="Close"
          className="rounded-sm opacity-70 transition-opacity hover:opacity-100"
          onClick={onDismiss}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export { ToastProvider, useToast };
