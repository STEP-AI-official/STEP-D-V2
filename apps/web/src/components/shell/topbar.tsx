"use client";

import { Menu, Search } from "lucide-react";
import { JobCenter } from "@/components/shell/job-center";
import { ThemeToggle } from "@/components/theme-toggle";

/** Top app bar: mobile nav toggle · breadcrumb slot · command palette (⌘K) · job center · theme · account. */
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

      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event("open-command-palette"))}
        className="hidden items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent sm:flex"
        aria-label="검색 및 명령"
        title="커맨드 팔레트 (⌘K)"
      >
        <Search className="size-4" />
        <span>검색 · 이동</span>
        <kbd className="ml-2 rounded border border-border bg-muted px-1.5 text-[10px] font-medium">
          ⌘K
        </kbd>
      </button>

      <JobCenter />
      <ThemeToggle />

      <div
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground"
        title="운영자 계정"
      >
        운
      </div>
    </header>
  );
}
