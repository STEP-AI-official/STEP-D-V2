import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

/**
 * Consistent empty / zero-result placeholder. Replaces the ad-hoc
 * `<Card className="p-6 text-center text-muted-foreground">` scattered across
 * screens so tone and spacing stay uniform.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  compact,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  /** Tighter padding for inline/nested contexts. */
  compact?: boolean;
}) {
  return (
    <Card
      className={cn(
        "flex flex-col items-center justify-center gap-2 text-center",
        compact ? "p-6" : "p-10",
        className,
      )}
    >
      {Icon && (
        <span className="mb-1 flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Icon className="size-5" />
        </span>
      )}
      <div className="text-sm font-medium text-foreground">{title}</div>
      {description && (
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </Card>
  );
}
