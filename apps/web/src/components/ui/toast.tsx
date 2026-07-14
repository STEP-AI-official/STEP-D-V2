"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CheckCircle2, Info, Loader2, TriangleAlert, X, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StatusTone } from "@/lib/constants";

export interface ToastOptions {
  title: string;
  description?: string;
  /** Drives icon + accent color. Defaults to "done". */
  tone?: StatusTone;
  /** ms before auto-dismiss; 0 keeps it until closed. Default 4000. */
  duration?: number;
}

interface ToastItem extends Required<Omit<ToastOptions, "description" | "duration">> {
  id: number;
  description?: string;
  duration: number;
}

const ToastContext = createContext<((o: ToastOptions) => void) | null>(null);

const TONE_STYLES: Record<StatusTone, { icon: typeof Info; ring: string; text: string }> = {
  idle: { icon: Info, ring: "border-status-idle/30", text: "text-status-idle" },
  progress: { icon: Loader2, ring: "border-status-progress/30", text: "text-status-progress" },
  done: { icon: CheckCircle2, ring: "border-status-done/30", text: "text-status-done" },
  warn: { icon: TriangleAlert, ring: "border-status-warn/30", text: "text-status-warn" },
  error: { icon: XCircle, ring: "border-status-error/30", text: "text-status-error" },
};

let counter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const toast = useCallback(
    (o: ToastOptions) => {
      counter += 1;
      const id = counter;
      const item: ToastItem = {
        id,
        title: o.title,
        description: o.description,
        tone: o.tone ?? "done",
        duration: o.duration ?? 4000,
      };
      setToasts((prev) => [...prev, item]);
      if (item.duration > 0) {
        const timer = setTimeout(() => dismiss(id), item.duration);
        timers.current.set(id, timer);
      }
    },
    [dismiss],
  );

  useEffect(() => {
    const map = timers.current;
    return () => map.forEach((t) => clearTimeout(t));
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div
        className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2"
        role="region"
        aria-label="알림"
      >
        {toasts.map((t) => {
          const meta = TONE_STYLES[t.tone];
          const Icon = meta.icon;
          return (
            <div
              key={t.id}
              role="status"
              className={cn(
                "pointer-events-auto flex items-start gap-2.5 rounded-lg border bg-popover p-3 shadow-lg",
                "animate-in slide-in-from-bottom-2 fade-in duration-200",
                meta.ring,
              )}
            >
              <Icon className={cn("mt-0.5 size-4 shrink-0", meta.text, t.tone === "progress" && "animate-spin")} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-popover-foreground">{t.title}</div>
                {t.description && (
                  <div className="mt-0.5 text-xs text-muted-foreground">{t.description}</div>
                )}
              </div>
              <button
                onClick={() => dismiss(t.id)}
                className="-m-1 shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
                aria-label="닫기"
              >
                <X className="size-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

/** Fire operator feedback toasts (채택/배포/반려/재시도 등). */
export function useToast() {
  const toast = useContext(ToastContext);
  if (!toast) throw new Error("useToast must be used within <ToastProvider>");
  return { toast };
}
