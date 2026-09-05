"use client";

import * as React from "react";
import { cn } from "@/lib/utils/cn";
import { Icon } from "@/components/ui/Icon";

export interface ToastItem {
  id: string;
  message: string;
  variant?: "success" | "alert" | "undo";
  actionLabel?: string;
  onAction?: () => void;
}

interface ToastContextValue {
  toasts: ToastItem[];
  push: (toast: Omit<ToastItem, "id">) => void;
  dismiss: (id: string) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);

  const dismiss = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = React.useCallback(
    (toast: Omit<ToastItem, "id">) => {
      const id = crypto.randomUUID();
      setToasts((prev) => [...prev, { ...toast, id }]);
      const duration = toast.variant === "undo" ? 6000 : 2400;
      window.setTimeout(() => dismiss(id), duration);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ toasts, push, dismiss }}>
      {children}
      <ToastStack />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

function ToastStack() {
  const { toasts, dismiss } = useToast();
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex flex-col items-center gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            "pointer-events-auto flex animate-toast-in items-center gap-3 rounded-full px-4 py-2.5 font-mono text-xs shadow-panel",
            t.variant === "alert" ? "bg-ember text-white" : "bg-ink text-white border border-white/10",
          )}
        >
          <Icon
            name={t.variant === "alert" ? "solar:danger-triangle-linear" : "solar:check-circle-linear"}
            className={t.variant === "alert" ? "text-white" : "text-lime"}
          />
          <span>{t.message}</span>
          {t.actionLabel && (
            <button
              className="font-medium uppercase tracking-wider text-lime hover:text-lime-hi"
              onClick={() => {
                t.onAction?.();
                dismiss(t.id);
              }}
            >
              {t.actionLabel}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
