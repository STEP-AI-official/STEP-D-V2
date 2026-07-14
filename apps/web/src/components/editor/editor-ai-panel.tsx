"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { formatTimecode } from "@/lib/utils";
import { RECOMMENDATION_KINDS } from "@/lib/constants";
import type { Recommendation } from "@/lib/types";

type AiTab = "analysis" | "shorts" | "clips";

/** Left AI panel — analysis scenes + shorts/clip candidates. Clicking a candidate
 *  applies its title + segment to the editor (reference → clip, StepD pattern). */
export function EditorAiPanel({
  recs,
  onApply,
}: {
  recs: Recommendation[];
  onApply: (rec: Recommendation) => void;
}) {
  const [tab, setTab] = useState<AiTab>("shorts");
  const shorts = recs.filter((r) => r.kind === "short");
  const clips = recs.filter((r) => r.kind === "clip");
  const scenes = [
    { t: 120, desc: "오프닝 · 게스트 등장" },
    { t: 742, desc: "이영자 리액션 하이라이트" },
    { t: 1210, desc: "몸개그 시퀀스" },
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="flex border-b border-zinc-800 text-xs">
        {(["analysis", "shorts", "clips"] as AiTab[]).map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={cn("flex-1 py-2.5", tab === k ? "bg-zinc-800 text-white" : "text-zinc-400 hover:text-white")}
          >
            {k === "analysis" ? "분석" : k === "shorts" ? "쇼츠 후보" : "클립 후보"}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2">
        {tab === "analysis" &&
          scenes.map((s) => (
            <div key={s.t} className="rounded-md border border-zinc-800 p-2 text-xs text-zinc-300">
              <div className="tabular-nums text-zinc-500">{formatTimecode(s.t)}</div>
              {s.desc}
            </div>
          ))}

        {(tab === "shorts" ? shorts : tab === "clips" ? clips : []).map((r) => (
          <button
            key={r.id}
            onClick={() => onApply(r)}
            className="w-full rounded-md border border-zinc-800 p-2 text-left transition-colors hover:border-zinc-600 hover:bg-zinc-800/50"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-zinc-200">{r.title}</span>
              <span className="shrink-0 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">
                {RECOMMENDATION_KINDS[r.kind]}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-2 text-[11px] text-zinc-500">
              <span className="tabular-nums">
                {formatTimecode(r.startTime)}–{formatTimecode(r.endTime)}
              </span>
              <span>appeal {r.appeal}</span>
            </div>
          </button>
        ))}

        {tab === "shorts" && shorts.length === 0 && (
          <div className="p-3 text-center text-xs text-zinc-500">쇼츠 후보 없음</div>
        )}
        {tab === "clips" && clips.length === 0 && (
          <div className="p-3 text-center text-xs text-zinc-500">클립 후보 없음</div>
        )}
      </div>
    </div>
  );
}
