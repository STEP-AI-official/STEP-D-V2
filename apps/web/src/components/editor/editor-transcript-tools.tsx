"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { cn, formatTimecode } from "@/lib/utils";
import type { AnalysisTranscriptSegment } from "@/lib/data/api";

// ── AI appeal heatmap ────────────────────────────────────────────────────────

export interface HeatCell {
  /** segment-relative seconds */
  from: number;
  to: number;
  /** 0–1 */
  score: number;
}

/** Map transcript appeal scores onto the timeline's segment-relative axis.
 *  Returns null when no segment carries a usable score — the toggle disables. */
export function useAppealHeatmap(
  transcript: AnalysisTranscriptSegment[] | undefined,
  startOffset: number,
  duration: number,
): HeatCell[] | null {
  return useMemo(() => {
    if (!transcript || transcript.length === 0) return null;
    const cells: HeatCell[] = [];
    for (const seg of transcript) {
      const score = Number(seg.appealScore);
      if (!Number.isFinite(score)) continue;
      const start = Number(seg.start ?? 0);
      const from = Math.max(0, start - startOffset);
      const to = Math.min(duration, Number(seg.end ?? start + 3) - startOffset);
      if (to <= from) continue;
      cells.push({ from, to, score: Math.min(1, Math.max(0, score)) });
    }
    return cells.length > 0 ? cells : null;
  }, [transcript, startOffset, duration]);
}

function heatColor(score: number) {
  if (score < 0.3) return "rgba(113,113,122,0.45)"; // 회색 — 낮은 흥미도
  if (score < 0.6) return "rgba(250,204,21,0.5)"; // 노랑
  if (score < 0.8) return "rgba(249,115,22,0.55)"; // 주황
  return "rgba(239,68,68,0.65)"; // 빨강 — 훅 포인트
}

/** Thin colored strip over the main-track waveform. No stopPropagation — clicks
 *  bubble up to the timeline's click-to-seek handler. */
export function HeatmapStrip({ cells, duration }: { cells: HeatCell[]; duration: number }) {
  const pct = (v: number) => `${Math.min(100, Math.max(0, (v / Math.max(1, duration)) * 100))}%`;
  return (
    <div className="absolute inset-x-0 top-0 z-10 h-2">
      {cells.map((c, i) => (
        <div
          key={i}
          className="absolute inset-y-0"
          style={{ left: pct(c.from), width: pct(c.to - c.from), background: heatColor(c.score) }}
          title={`appeal: ${c.score.toFixed(2)}`}
        />
      ))}
    </div>
  );
}

// ── transcript search (⌘F / Ctrl+F) ──────────────────────────────────────────

export interface SearchHit {
  /** segment-relative seconds */
  time: number;
  text: string;
}

export function useTranscriptSearch(
  transcript: AnalysisTranscriptSegment[] | undefined,
  startOffset: number,
  duration: number,
  onJump: (sec: number) => void,
) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  // -1 = typed but not navigated yet; Enter from there lands on the first hit.
  const [active, setActive] = useState(-1);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const available = !!transcript && transcript.length > 0;

  const hits: SearchHit[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !transcript) return [];
    const out: SearchHit[] = [];
    for (const seg of transcript) {
      const text = (seg.text ?? "").trim();
      if (!text || !text.toLowerCase().includes(q)) continue;
      const time = Number(seg.start ?? 0) - startOffset;
      if (time < 0 || time > duration) continue;
      out.push({ time, text });
    }
    return out;
  }, [query, transcript, startOffset, duration]);

  useEffect(() => setActive(-1), [query]);

  const jumpTo = useCallback(
    (i: number) => {
      const hit = hits[i];
      if (!hit) return;
      setActive(i);
      onJump(hit.time);
    },
    [hits, onJump],
  );

  const step = useCallback(
    (dir: 1 | -1) => {
      if (hits.length === 0) return;
      const idx = active < 0 ? (dir === 1 ? 0 : hits.length - 1) : (active + dir + hits.length) % hits.length;
      jumpTo(idx);
    },
    [hits.length, active, jumpTo],
  );

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActive(-1);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // ⌘F / Ctrl+F opens & focuses · Esc closes and clears (markers vanish with hits).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        if (!available) return;
        e.preventDefault();
        setOpen(true);
        inputRef.current?.focus();
      } else if (e.key === "Escape" && open) {
        close();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [available, open, close]);

  return { available, open, setOpen, query, setQuery, hits, active, jumpTo, step, close, inputRef };
}

export type TranscriptSearch = ReturnType<typeof useTranscriptSearch>;

/** Search icon → expanding input with a result dropdown. Enter/Shift+Enter cycle hits. */
export function TranscriptSearchBar({ search }: { search: TranscriptSearch }) {
  const { available, open, setOpen, query, setQuery, hits, active, jumpTo, step, close, inputRef } = search;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        disabled={!available}
        className="rounded-md border border-zinc-700 p-1.5 text-zinc-400 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
        title={available ? "자막 검색 (Ctrl+F)" : "자막 데이터 없음"}
      >
        <Search className="size-3.5" />
      </button>
    );
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-1.5 rounded-md border border-zinc-600 bg-zinc-900 px-2 py-1">
        <Search className="size-3.5 shrink-0 text-zinc-500" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return; // 한글 IME 조합 확정 Enter 무시
            if (e.key === "Enter") {
              e.preventDefault();
              step(e.shiftKey ? -1 : 1);
            }
          }}
          placeholder="대사 검색…"
          className="w-36 bg-transparent text-xs text-zinc-200 outline-none placeholder:text-zinc-600"
        />
        {hits.length > 0 && (
          <span className="shrink-0 text-[10px] tabular-nums text-zinc-500">
            {active < 0 ? 0 : active + 1}/{hits.length}
          </span>
        )}
        <button onClick={close} className="shrink-0 text-zinc-500 hover:text-zinc-300" title="닫기 (Esc)">
          <X className="size-3.5" />
        </button>
      </div>
      {query.trim() !== "" && (
        <div className="absolute right-0 top-[calc(100%+4px)] z-50 max-h-56 w-80 overflow-y-auto rounded-md border border-zinc-700 bg-zinc-900 py-1 shadow-2xl">
          {hits.length === 0 ? (
            <div className="px-3 py-2 text-xs text-zinc-500">검색 결과 없음</div>
          ) : (
            hits.map((h, i) => (
              <button
                key={i}
                onClick={() => jumpTo(i)}
                className={cn(
                  "flex w-full items-baseline gap-2 px-3 py-1.5 text-left text-xs hover:bg-zinc-800",
                  i === active && "bg-zinc-800",
                )}
              >
                <span className="shrink-0 tabular-nums text-emerald-400">{formatTimecode(h.time)}</span>
                <span className="truncate text-zinc-300">{h.text}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
