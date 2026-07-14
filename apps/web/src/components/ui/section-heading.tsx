import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Standard section label above a group of cards/rows (e.g. "내 액션 필요", "진행 중").
 * Keeps section typography and spacing consistent across screens.
 */
export function SectionHeading({
  children,
  count,
  icon: Icon,
  iconClassName,
  action,
  className,
}: {
  children: React.ReactNode;
  /** Optional trailing count, shown muted next to the label. */
  count?: number;
  icon?: LucideIcon;
  iconClassName?: string;
  /** Right-aligned action slot (e.g. a "전체 보기" link). */
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-3 flex items-center gap-2", className)}>
      <h2 className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
        {Icon && <Icon className={cn("size-4", iconClassName)} />}
        {children}
        {typeof count === "number" && count > 0 && (
          <span className="tabular-nums text-muted-foreground/70">({count})</span>
        )}
      </h2>
      {action && <div className="ml-auto">{action}</div>}
    </div>
  );
}
