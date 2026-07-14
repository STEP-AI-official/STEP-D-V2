import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import type { StatusTone } from "@/lib/constants";

const TONE_TEXT: Record<StatusTone, string> = {
  idle: "text-foreground",
  progress: "text-status-progress",
  done: "text-status-done",
  warn: "text-status-warn",
  error: "text-status-error",
};

export function StatTile({
  label,
  value,
  sub,
  icon: Icon,
  tone = "idle",
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: LucideIcon;
  /** Colors the value; defaults to neutral foreground. */
  tone?: StatusTone;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {Icon && <Icon className="size-3.5" />}
        {label}
      </div>
      <div className={cn("mt-1.5 text-2xl font-bold tabular-nums tracking-tight", TONE_TEXT[tone])}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </Card>
  );
}
