import { cn } from "@/lib/utils";

/** Low-key loading placeholder — used for encoding/in-flight states (§3). */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted", className)}
      aria-hidden
      {...props}
    />
  );
}
