import { cn } from "@/lib/utils";
import type { StatusTone } from "@/lib/constants";

/** Consistent status color system (plan §9) — one tone → one color, light & dark. */
const TONE_CLASSES: Record<StatusTone, string> = {
  idle: "bg-status-idle/10 text-status-idle border-status-idle/25",
  progress: "bg-status-progress/10 text-status-progress border-status-progress/25",
  done: "bg-status-done/10 text-status-done border-status-done/25",
  warn: "bg-status-warn/10 text-status-warn border-status-warn/25",
  error: "bg-status-error/10 text-status-error border-status-error/25",
};

export function StatusBadge({
  tone,
  children,
  className,
  pulse,
}: {
  tone: StatusTone;
  children: React.ReactNode;
  className?: string;
  /** Animate the leading dot — signals live/in-flight work (encoding, running). */
  pulse?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        TONE_CLASSES[tone],
        className,
      )}
    >
      <span className="relative flex size-1.5 items-center justify-center" aria-hidden>
        {pulse && (
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-75" />
        )}
        <span className="relative size-1.5 rounded-full bg-current" />
      </span>
      {children}
    </span>
  );
}
