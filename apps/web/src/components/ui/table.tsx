import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Dense operator table primitives (§2). Standardizes header treatment, row
 * hover, borders and cell rhythm so clips / distribution / analytics tables
 * read as one system. Wrap in <Card className="overflow-hidden"> for framing.
 */
export function Table({ className, ...props }: React.HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn("w-full text-sm", className)} {...props} />
    </div>
  );
}

export function THead({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn(
        "border-b border-border bg-secondary/40 text-left text-xs font-medium text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function TBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={className} {...props} />;
}

export function TR({
  className,
  interactive,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement> & { interactive?: boolean }) {
  return (
    <tr
      className={cn(
        "border-b border-border last:border-0",
        interactive && "transition-colors hover:bg-accent/40",
        className,
      )}
      {...props}
    />
  );
}

export function TH({
  className,
  numeric,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <th
      className={cn("px-4 py-2.5 font-medium", numeric && "text-right", className)}
      {...props}
    />
  );
}

export function TD({
  className,
  numeric,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <td
      className={cn("px-4 py-3 align-middle", numeric && "text-right tabular-nums", className)}
      {...props}
    />
  );
}
