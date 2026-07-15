"use client";

import { Menu } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

/** Top app bar: mobile nav toggle · breadcrumb slot · theme. */
export function Topbar({ breadcrumb }: { breadcrumb?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border bg-background/80 px-4 backdrop-blur sm:gap-3 sm:px-5">
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event("toggle-sidebar"))}
        className="-ml-1 flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground lg:hidden"
        aria-label="메뉴 열기"
        title="메뉴"
      >
        <Menu className="size-5" />
      </button>

      <div className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{breadcrumb}</div>

      <ThemeToggle />
    </header>
  );
}
