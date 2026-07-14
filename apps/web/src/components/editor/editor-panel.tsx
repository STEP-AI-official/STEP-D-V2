"use client";

import { useState } from "react";
import { Type, UserCircle, LayoutTemplate, FileText, Palette, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  ASPECTS,
  BG_SWATCHES,
  CAPTION_STYLES,
  COLOR_SWATCHES,
  ELEMENT_DEFAULTS,
  TEMPLATE_PRESETS,
  type AspectKey,
  type CaptionStyle,
  type EditorElement,
  type EditorState,
  type ElementType,
} from "@/lib/editor/presets";

type Update = (patch: Partial<EditorState>) => void;
type TabKey = "text" | "channel" | "layout" | "captions" | "elements";

const TABS: { key: TabKey; label: string; icon: typeof Type }[] = [
  { key: "text", label: "텍스트", icon: Type },
  { key: "channel", label: "채널", icon: UserCircle },
  { key: "layout", label: "레이아웃", icon: LayoutTemplate },
  { key: "captions", label: "자막", icon: FileText },
  { key: "elements", label: "요소", icon: Palette },
];

export function EditorPanel({
  state,
  update,
  applyTpl,
}: {
  state: EditorState;
  update: Update;
  applyTpl: (id: EditorState["templateId"]) => void;
}) {
  const [tab, setTab] = useState<TabKey>("layout");

  return (
    <div className="flex h-full flex-col">
      <div className="flex border-b border-zinc-800">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] transition-colors",
                tab === t.key ? "bg-zinc-800 text-white" : "text-zinc-400 hover:text-white",
              )}
            >
              <Icon className="size-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
        {tab === "text" && <TextTab state={state} update={update} />}
        {tab === "channel" && <ChannelTab state={state} update={update} />}
        {tab === "layout" && <LayoutTab state={state} update={update} applyTpl={applyTpl} />}
        {tab === "captions" && <CaptionsTab state={state} update={update} />}
        {tab === "elements" && <ElementsTab state={state} update={update} />}
      </div>
    </div>
  );
}

// ── shared bits ──────────────────────────────────────────────────────────────
function Label({ children }: { children: React.ReactNode }) {
  return <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">{children}</div>;
}
function Toggle({ on, onChange, label }: { on: boolean; onChange: () => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between py-1 text-sm text-zinc-200">
      {label}
      <button
        onClick={onChange}
        className={cn("relative h-5 w-9 rounded-full transition-colors", on ? "bg-emerald-500" : "bg-zinc-700")}
      >
        <span className={cn("absolute top-0.5 size-4 rounded-full bg-white transition-all", on ? "left-4" : "left-0.5")} />
      </button>
    </label>
  );
}
function Swatches({ colors, value, onPick }: { colors: string[]; value: string; onPick: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {colors.map((c) => (
        <button
          key={c}
          onClick={() => onPick(c)}
          className={cn("size-6 rounded", value === c ? "ring-2 ring-white ring-offset-1 ring-offset-zinc-900" : "ring-1 ring-zinc-700")}
          style={{ background: c }}
          aria-label={c}
        />
      ))}
    </div>
  );
}
const field = "w-full rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-zinc-500";

// ── tabs ─────────────────────────────────────────────────────────────────────
function TextTab({ state, update }: { state: EditorState; update: Update }) {
  function setLine(id: string, patch: Partial<EditorState["titleLines"][number]>) {
    update({ titleLines: state.titleLines.map((l) => (l.id === id ? { ...l, ...patch } : l)) });
  }
  return (
    <>
      <div>
        <Label>제목 (라인별 스타일)</Label>
        <div className="space-y-3">
          {state.titleLines.map((line) => (
            <div key={line.id} className="rounded-md border border-zinc-800 p-2">
              <input value={line.text} onChange={(e) => setLine(line.id, { text: e.target.value })} className={field} />
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="range"
                  min={16}
                  max={56}
                  value={line.size}
                  onChange={(e) => setLine(line.id, { size: Number(e.target.value) })}
                  className="flex-1"
                />
                <span className="w-8 text-right text-xs tabular-nums text-zinc-400">{line.size}</span>
                {state.titleLines.length > 1 && (
                  <button onClick={() => update({ titleLines: state.titleLines.filter((l) => l.id !== line.id) })} className="text-zinc-500 hover:text-red-400">
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </div>
              <div className="mt-2">
                <Swatches colors={COLOR_SWATCHES} value={line.color} onPick={(c) => setLine(line.id, { color: c })} />
              </div>
            </div>
          ))}
        </div>
        <Button
          size="xs"
          variant="secondary"
          className="mt-2"
          onClick={() =>
            update({
              titleLines: [
                ...state.titleLines,
                { id: `t${Date.now()}`, text: "새 줄", size: 24, color: "#FFFFFF" },
              ],
            })
          }
        >
          <Plus className="size-3.5" /> 줄 추가
        </Button>
      </div>
      <div>
        <Label>정렬</Label>
        <div className="flex gap-1">
          {(["left", "center", "right"] as const).map((a) => (
            <button
              key={a}
              onClick={() => update({ titleAlign: a })}
              className={cn("flex-1 rounded-md border py-1.5 text-xs", state.titleAlign === a ? "border-zinc-400 bg-zinc-800 text-white" : "border-zinc-700 text-zinc-400")}
            >
              {a === "left" ? "왼쪽" : a === "center" ? "가운데" : "오른쪽"}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

function ChannelTab({ state, update }: { state: EditorState; update: Update }) {
  return (
    <>
      <Toggle on={state.showChannel} onChange={() => update({ showChannel: !state.showChannel })} label="채널 표시" />
      <div>
        <Label>채널명</Label>
        <input value={state.channelName} onChange={(e) => update({ channelName: e.target.value })} className={field} />
      </div>
      <div>
        <Label>세로 위치 {state.channelY}%</Label>
        <input type="range" min={60} max={95} value={state.channelY} onChange={(e) => update({ channelY: Number(e.target.value) })} className="w-full" />
      </div>
    </>
  );
}

function LayoutTab({ state, update, applyTpl }: { state: EditorState; update: Update; applyTpl: (id: EditorState["templateId"]) => void }) {
  return (
    <>
      <div>
        <Label>템플릿 프리셋</Label>
        <div className="space-y-1.5">
          {TEMPLATE_PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => applyTpl(p.id)}
              className={cn(
                "w-full rounded-md border p-2 text-left transition-colors",
                state.templateId === p.id ? "border-zinc-400 bg-zinc-800" : "border-zinc-700 hover:bg-zinc-800/50",
              )}
            >
              <div className="text-sm font-medium text-white">{p.label}</div>
              <div className="text-[11px] text-zinc-400">{p.hint}</div>
            </button>
          ))}
        </div>
      </div>
      <div>
        <Label>종횡비</Label>
        <div className="grid grid-cols-4 gap-1">
          {(Object.keys(ASPECTS) as AspectKey[]).map((a) => (
            <button
              key={a}
              onClick={() => update({ aspect: a })}
              className={cn("rounded-md border py-1.5 text-xs", state.aspect === a ? "border-zinc-400 bg-zinc-800 text-white" : "border-zinc-700 text-zinc-400")}
            >
              {a}
            </button>
          ))}
        </div>
      </div>
      <div>
        <Label>배경</Label>
        <Swatches colors={BG_SWATCHES} value={state.bg} onPick={(c) => update({ bg: c })} />
      </div>
      <Toggle on={state.showSafeArea} onChange={() => update({ showSafeArea: !state.showSafeArea })} label="세이프 에어리어 · Shorts UI" />
    </>
  );
}

function CaptionsTab({ state, update }: { state: EditorState; update: Update }) {
  return (
    <>
      <Toggle on={state.captionsOn} onChange={() => update({ captionsOn: !state.captionsOn })} label="자막 표시" />
      <div>
        <Label>스타일</Label>
        <select value={state.captionStyle} onChange={(e) => update({ captionStyle: e.target.value as CaptionStyle })} className={field}>
          {(Object.entries(CAPTION_STYLES) as [CaptionStyle, string][]).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>
      <div>
        <Label>강조 색</Label>
        <Swatches colors={COLOR_SWATCHES} value={state.highlightColor} onPick={(c) => update({ highlightColor: c })} />
      </div>
      <div className="rounded-md border border-dashed border-zinc-700 p-2 text-[11px] text-zinc-400">
        자막은 STT(말자막)로 자동 생성됩니다. 실제 STT 연동은 M6에서 활성화됩니다. 원본에 자막이 있으면 자동으로 건너뜁니다.
      </div>
    </>
  );
}

function ElementsTab({ state, update }: { state: EditorState; update: Update }) {
  function add(type: ElementType) {
    const el: EditorElement = { id: `e${Date.now()}`, type, x: 50, y: 55, text: ELEMENT_DEFAULTS[type] };
    update({ elements: [...state.elements, el] });
  }
  const buttons: { type: ElementType; label: string }[] = [
    { type: "cta", label: "CTA 버튼" },
    { type: "sticker", label: "스티커" },
    { type: "arrow", label: "화살표" },
    { type: "bubble", label: "말풍선" },
  ];
  return (
    <>
      <div>
        <Label>요소 추가</Label>
        <div className="grid grid-cols-2 gap-1.5">
          {buttons.map((b) => (
            <Button key={b.type} size="sm" variant="secondary" onClick={() => add(b.type)}>
              <Plus className="size-3.5" /> {b.label}
            </Button>
          ))}
        </div>
      </div>
      {state.elements.length > 0 && (
        <div>
          <Label>추가된 요소</Label>
          <div className="space-y-1">
            {state.elements.map((el) => (
              <div key={el.id} className="flex items-center gap-2 rounded-md border border-zinc-800 p-2">
                <input
                  value={el.text}
                  onChange={(e) => update({ elements: state.elements.map((x) => (x.id === el.id ? { ...x, text: e.target.value } : x)) })}
                  className={cn(field, "flex-1")}
                />
                <button onClick={() => update({ elements: state.elements.filter((x) => x.id !== el.id) })} className="text-zinc-500 hover:text-red-400">
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
