"use client";

import { useEffect, useRef, useState } from "react";
import { Play, Pause, Scissors, Gauge, Volume2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatTimecode } from "@/lib/utils";
import type { EditorState } from "@/lib/editor/presets";

type Update = (patch: Partial<EditorState>) => void;
const SPEEDS = [0.5, 1, 1.5, 2];

/** Bottom transport: playhead (rAF), trim handles, speed, hook tools, ±sync fine-tune. */
export function EditorTimeline({
  state,
  update,
  duration,
}: {
  state: EditorState;
  update: Update;
  duration: number;
}) {
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const raf = useRef<number | undefined>(undefined);
  const last = useRef<number>(0);

  useEffect(() => {
    if (!playing) return;
    last.current = performance.now();
    const loop = (now: number) => {
      const dt = ((now - last.current) / 1000) * state.speed;
      last.current = now;
      setT((prev) => {
        const next = prev + dt;
        return next >= state.trimOut ? state.trimIn : next;
      });
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [playing, state.speed, state.trimIn, state.trimOut]);

  const pct = (v: number) => `${(v / Math.max(1, duration)) * 100}%`;
  const trimmedLen = Math.max(0, state.trimOut - state.trimIn);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <button
          onClick={() => setPlaying((v) => !v)}
          className="flex size-9 items-center justify-center rounded-full bg-white text-black"
        >
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
        </button>
        <span className="tabular-nums text-sm text-zinc-300">
          {formatTimecode(t)} <span className="text-zinc-600">/ {formatTimecode(duration)}</span>
        </span>
        <span className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
          컷 길이 {formatTimecode(trimmedLen)}
        </span>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => update({ speed: SPEEDS[(SPEEDS.indexOf(state.speed) + 1) % SPEEDS.length] })}
            className="inline-flex items-center gap-1 rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
          >
            <Gauge className="size-3.5" /> {state.speed}×
          </button>
          <HookToggle icon={Sparkles} label="첫 3초 훅" on={state.hookOn} onClick={() => update({ hookOn: !state.hookOn })} />
          <HookToggle icon={Volume2} label="무음 제거" on={state.silenceCut} onClick={() => update({ silenceCut: !state.silenceCut })} />
        </div>
      </div>

      {/* track with trim window + playhead */}
      <div className="relative h-9 rounded-md bg-zinc-800">
        <div
          className="absolute inset-y-0 rounded-md border border-emerald-500/60 bg-emerald-500/15"
          style={{ left: pct(state.trimIn), width: pct(trimmedLen) }}
        >
          <Scissors className="absolute -left-2 top-1/2 size-3.5 -translate-y-1/2 text-emerald-400" />
        </div>
        <div className="absolute top-0 h-full w-0.5 bg-white" style={{ left: pct(t) }} />
      </div>

      {/* trim controls + fine-tune */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-400">
        <label className="flex items-center gap-2">
          IN
          <input
            type="range"
            min={0}
            max={duration}
            step={0.1}
            value={state.trimIn}
            onChange={(e) => update({ trimIn: Math.min(Number(e.target.value), state.trimOut - 0.5) })}
            className="w-32"
          />
          <span className="tabular-nums">{formatTimecode(state.trimIn)}</span>
        </label>
        <label className="flex items-center gap-2">
          OUT
          <input
            type="range"
            min={0}
            max={duration}
            step={0.1}
            value={state.trimOut}
            onChange={(e) => update({ trimOut: Math.max(Number(e.target.value), state.trimIn + 0.5) })}
            className="w-32"
          />
          <span className="tabular-nums">{formatTimecode(state.trimOut)}</span>
        </label>

        <div className="ml-auto flex items-center gap-1.5">
          <span>싱크 미세조정</span>
          <button onClick={() => update({ offsetMs: state.offsetMs - 100 })} className="rounded border border-zinc-700 px-2 py-0.5 hover:bg-zinc-800">
            −100ms
          </button>
          <span className="w-14 text-center tabular-nums text-zinc-300">
            {state.offsetMs > 0 ? "+" : ""}
            {state.offsetMs}ms
          </span>
          <button onClick={() => update({ offsetMs: state.offsetMs + 100 })} className="rounded border border-zinc-700 px-2 py-0.5 hover:bg-zinc-800">
            +100ms
          </button>
        </div>
      </div>
    </div>
  );
}

function HookToggle({
  icon: Icon,
  label,
  on,
  onClick,
}: {
  icon: typeof Sparkles;
  label: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors",
        on ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-300" : "border-zinc-700 text-zinc-400 hover:bg-zinc-800",
      )}
    >
      <Icon className="size-3.5" /> {label}
    </button>
  );
}
