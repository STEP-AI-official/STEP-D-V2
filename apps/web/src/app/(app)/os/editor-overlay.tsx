"use client";

/**
 * STEP D Review OS — CapCut-style editor overlay (design lines 903~1043 + controller 1723~1797).
 *
 * 풀스크린 fixed overlay. 메뉴바 · 도구 탭(7) · 좌측 도구 패널 · 중앙 플레이어 · 우측 세부정보 ·
 * 하단 타임라인(비디오 셀 · 자막 블록 · 오디오 웨이브). 대부분 데모 인터랙션이지만, 실 클립이면
 * "내보내기" 버튼을 진짜 exportClip API로 연결(부모에서 onExport로 전달).
 */
import { useEffect, useRef, useState } from "react";

export type EditorOverlayClip = {
  title: string;
  range: string;
  thumb: string;
  /** "9/16" | "16/9" */
  ratio: "9/16" | "16/9";
  durSec: number;
  /** 실 clip id — 있으면 내보내기 진짜 렌더. 없으면 데모 flash. */
  realClipId?: string | null;
};

type ToolKey = "media" | "audio" | "text" | "captions" | "sticker" | "effect" | "filter";

const TOOLS: [ToolKey, string, string][] = [
  ["media", "미디어", "M3 4h18v14H3zM9 9l4 3-4 3z"],
  ["audio", "오디오", "M9 18V6l10-2v12"],
  ["text", "텍스트", "M4 6V4h16v2M9 20h6M12 4v16"],
  ["captions", "자막", "M3 5h18v14H3zM7 11h4M7 14h7M14 11h3"],
  ["sticker", "스티커", "M15 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h9l7-7V5a2 2 0 0 0-2-2z"],
  ["effect", "효과", "M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"],
  ["filter", "필터", "M9 3a6 6 0 1 0 0 12A6 6 0 0 0 9 3zM15 9a6 6 0 1 0 0 12 6 6 0 0 0 0-12z"],
];
const TOOL_TITLE: Record<ToolKey, string> = { media: "미디어", audio: "오디오", text: "텍스트", captions: "자막", sticker: "스티커", effect: "효과", filter: "필터" };

type Ctrl =
  | { t: "slider"; label: string; def: number; disp: (v: number) => string }
  | { t: "chips"; label: string; opts: string[]; def?: number }
  | { t: "toggle"; label: string; def: boolean }
  | { t: "color"; label: string; colors: string[]; def?: number }
  | { t: "text"; label: string; val: string }
  | { t: "preset"; label: string };

const CTRL_DEF: Record<ToolKey, Ctrl[]> = {
  media: [
    { t: "chips", label: "화면 맞춤", opts: ["채우기", "맞춤", "원본"] },
    { t: "slider", label: "배율", def: 56, disp: (v) => Math.round(50 + v * 1.5) + "%" },
    { t: "slider", label: "회전", def: 0, disp: (v) => Math.round(v / 100 * 360) + "°" },
    { t: "toggle", label: "손떨림 보정", def: true },
  ],
  audio: [
    { t: "slider", label: "볼륨", def: 67, disp: (v) => Math.round(v * 1.5) + "%" },
    { t: "slider", label: "페이드 인", def: 20, disp: (v) => (v / 100 * 2).toFixed(1) + "s" },
    { t: "slider", label: "페이드 아웃", def: 35, disp: (v) => (v / 100 * 2).toFixed(1) + "s" },
    { t: "toggle", label: "배경 소음 제거", def: true },
  ],
  text: [
    { t: "text", label: "텍스트", val: "제목을 입력하세요" },
    { t: "chips", label: "폰트", opts: ["Pretendard", "고딕", "명조"] },
    { t: "slider", label: "크기", def: 53, disp: (v) => Math.round(24 + v * 0.96) + "px" },
    { t: "color", label: "색상", colors: ["#ffffff", "#8b7cf6", "#f5a524", "#ff6b78"] },
  ],
  captions: [],
  sticker: [
    { t: "chips", label: "카테고리", opts: ["인기", "예능", "감정", "화살표"] },
    { t: "preset", label: "스티커" },
  ],
  effect: [
    { t: "chips", label: "분류", opts: ["트렌드", "줌", "글리치", "빛샘"] },
    { t: "preset", label: "효과" },
  ],
  filter: [
    { t: "chips", label: "톤", opts: ["원본", "시네마", "비비드", "필름"] },
    { t: "preset", label: "필터" },
    { t: "slider", label: "강도", def: 70, disp: (v) => Math.round(v) + "%" },
  ],
};

const PROP_SLIDERS: { label: string; def: number; disp: (v: number) => string }[] = [
  { label: "재생 속도", def: 40, disp: (v) => (0.5 + v / 100 * 1.5).toFixed(1) + "x" },
  { label: "불투명도", def: 100, disp: (v) => Math.round(v) + "%" },
  { label: "배율", def: 56, disp: (v) => Math.round(50 + v * 1.5) + "%" },
  { label: "회전", def: 0, disp: (v) => Math.round(v / 100 * 360) + "°" },
];

function fmt(s: number) { const m = Math.floor(s / 60), x = Math.floor(s % 60); return `${m}:${String(x).padStart(2, "0")}`; }

const PRESET_TILES = [
  "linear-gradient(135deg,#8b7cf6,#5a63e6)",
  "linear-gradient(135deg,#2dd4bf,#0e7490)",
  "linear-gradient(135deg,#f5a524,#b45309)",
  "linear-gradient(135deg,#ff6b78,#9f1239)",
  "linear-gradient(135deg,#5e9bff,#1e3a8a)",
  "linear-gradient(135deg,#a78bfa,#6d28d9)",
];

export function EditorOverlay({
  clip,
  onClose,
  onExport,
  flash,
}: {
  clip: EditorOverlayClip;
  onClose: () => void;
  /** 실 클립이면 exportClip API 호출을 여기서. 없으면 flash로 대체. */
  onExport: (realClipId: string | null | undefined) => void;
  flash: (m: string) => void;
}) {
  const [tool, setTool] = useState<ToolKey>("captions");
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [capSel, setCapSel] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [sliders, setSliders] = useState<Record<string, number>>({});
  const [chips, setChips] = useState<Record<string, number>>({});
  const [colors, setColors] = useState<Record<string, number>>({});
  const [toggles, setToggles] = useState<Record<string, boolean>>({});
  const [cuts, setCuts] = useState<number[]>([]);
  const playRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const dur = clip.durSec || 38;

  useEffect(() => () => { if (playRef.current) clearInterval(playRef.current); }, []);

  function togglePlay() {
    if (playRef.current) { clearInterval(playRef.current); playRef.current = null; setPlaying(false); return; }
    if (time >= dur) setTime(0);
    setPlaying(true);
    playRef.current = setInterval(() => {
      setTime((t) => {
        const nt = t + 0.1;
        if (nt >= dur) { if (playRef.current) { clearInterval(playRef.current); playRef.current = null; } setPlaying(false); return dur; }
        return nt;
      });
    }, 100);
  }
  function seek(e: React.MouseEvent<HTMLElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const p = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    setTime(p * dur);
  }
  function slideSet(key: string, e: React.MouseEvent<HTMLElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const p = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    setSliders((s) => ({ ...s, [key]: Math.round(p * 100) }));
  }
  function zoomSet(e: React.MouseEvent<HTMLElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const p = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    setZoom(0.5 + p * 2.5);
  }
  function bump(d: number) { setZoom((z) => Math.max(0.5, Math.min(3, z + d))); }

  const capData = [
    { time: "00:00", t0: 0, t1: Math.min(5, dur), text: '"나 진짜 오빠 없으면 안 될 것 같아"', short: '"오빠 없으면…"' },
    { time: "00:04", t0: Math.min(5, dur), t1: Math.min(9, dur), text: "— 영숙, 눈물 고백", short: "눈물 고백" },
    { time: "00:09", t0: Math.min(9, dur), t1: dur, text: "과연 오빠의 선택은?", short: "선택은?" },
  ];
  const capIdx = Math.min(capSel, capData.length - 1);
  const captionText = capData[capIdx].text;

  const ctrls = CTRL_DEF[tool];
  const zoomWidth = (zoom * 100) + "%";
  const zoomFill = ((zoom - 0.5) / 2.5 * 100) + "%";
  const playPct = (time / dur * 100) + "%";

  // 웨이브 · 셀 · 눈금 (design mock)
  const waves = Array.from({ length: 70 }, (_, i) => (24 + Math.abs(Math.sin(i * 0.7) * Math.cos(i * 0.3)) * 68) + "%");
  const cells = Array.from({ length: 8 });
  const ticks = Array.from({ length: 6 }, (_, i) => ({ label: fmt(Math.round(dur * i / 5)), left: (i / 5 * 100) + "%" }));

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-[#08090c]">
      {/* menu bar */}
      <div className="flex h-11 flex-none items-center gap-3 border-b border-[#222222] bg-[#0a0a0a] px-3.5">
        <button onClick={onClose} className="inline-flex items-center gap-1 border-none bg-transparent text-[12.5px] text-[#9a9a9a] hover:text-[#eceef2]">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}><path d="M15 6l-6 6 6 6" /></svg>
        </button>
        <div className="flex items-center gap-2">
          <div className="grotesk flex size-[22px] items-center justify-center rounded-md bg-[linear-gradient(135deg,#8b93ff,#5a63e6)] text-[12px] font-bold text-white">D</div>
          <span className="text-[12.5px] font-bold text-[#cfcfcf]">STEP D 편집기</span>
        </div>
        <span className="flex-1" />
        <div className="text-[12.5px] font-semibold text-[#cfcfcf]">{clip.title} <span className="mono font-normal text-[#6b6b6b]">· {clip.range}</span></div>
        <span className="flex-1" />
        <span className="rounded-[7px] border border-[#2b2b2b] bg-[#161616] px-2.5 py-1 text-[11px] font-semibold text-[#9a9a9a]">{clip.ratio === "9/16" ? "9:16 · 1080p" : "16:9 · 1080p"}</span>
        <button
          onClick={() => onExport(clip.realClipId)}
          className="flex items-center gap-1.5 rounded-lg bg-[#6b74f0] px-3.5 py-1.5 text-[12.5px] font-semibold text-white hover:bg-[#5a63e6]"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 3v12M8 11l4 4 4-4M4 19h16" /></svg>내보내기
        </button>
      </div>

      {/* tool tabs */}
      <div className="flex h-[58px] flex-none items-stretch gap-0.5 overflow-x-auto border-b border-[#222222] bg-[#0a0a0a] px-2.5">
        {TOOLS.map(([k, label, d]) => {
          const on = tool === k;
          return (
            <button key={k} onClick={() => setTool(k)} className="flex min-w-[60px] flex-none flex-col items-center gap-1.5 border-b-2 bg-transparent px-2 pb-2 pt-[9px] text-[11px] font-semibold transition-colors" style={{ borderColor: on ? "#6b74f0" : "transparent", color: on ? "#c7c1ff" : "#9a9a9a" }}>
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9}><path d={d} /></svg>
              {label}
            </button>
          );
        })}
      </div>

      {/* body */}
      <div className="flex min-h-0 flex-1">
        {/* left tool panel */}
        <div className="w-[300px] flex-none overflow-auto border-r border-[#222222] bg-[#0a0a0a] p-4">
          <div className="mb-3.5 text-[13.5px] font-bold">{TOOL_TITLE[tool]}</div>
          {tool === "captions" ? (
            <>
              <div className="mb-3 flex items-center gap-2 rounded-[9px] border border-[rgba(139,147,255,.25)] bg-[rgba(139,147,255,.08)] px-3 py-2.5">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a7adff" strokeWidth={2}><path d="M12 2v4M12 18v4M2 12h4M18 12h4" /></svg>
                <span className="text-[11.5px] text-[#c3c8ff]">AI가 음성을 자막으로 변환했어요. 클립을 눌러 편집하세요.</span>
              </div>
              <div className="flex flex-col gap-2">
                {capData.map((c, i) => {
                  const on = i === capIdx;
                  return (
                    <div key={i} onClick={() => { setCapSel(i); setTime(c.t0); }} className="cursor-pointer rounded-[9px] border px-3 py-2.5 transition-[border-color,background]" style={{ borderColor: on ? "#8b93ff" : "#262626", background: on ? "rgba(139,147,255,.1)" : "#161616" }}>
                      <div className="mono mb-1 text-[10px] text-[#707070]">{c.time}</div>
                      <div className="text-[12.5px] leading-[1.4] text-[#e5e5e5]">{c.text}</div>
                    </div>
                  );
                })}
              </div>
              <button onClick={() => flash("자막 클립 추가 (데모)")} className="mt-3 w-full rounded-lg border border-[#2b2b2b] bg-[#161616] py-2.5 text-[12px] font-semibold text-[#9a9a9a] hover:border-[#3a3a3a] hover:text-[#eceef2]">+ 자막 추가</button>
            </>
          ) : (
            <div className="flex flex-col gap-4">
              {ctrls.map((c) => {
                const key = `${tool}:${c.label}`;
                if (c.t === "slider") {
                  const v = sliders[key] ?? c.def;
                  return (
                    <div key={key}>
                      <div className="mb-2 flex items-baseline justify-between"><span className="text-[12px] font-semibold text-[#cfcfcf]">{c.label}</span><span className="mono text-[11px] text-[#9a9a9a]">{c.disp(v)}</span></div>
                      <div onClick={(e) => slideSet(key, e)} className="relative h-1.5 cursor-pointer rounded-full bg-[#1e1e1e]">
                        <div className="absolute inset-y-0 left-0 rounded-full bg-[#6b74f0]" style={{ width: v + "%" }} />
                        <div className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_1px_4px_rgba(0,0,0,.4)]" style={{ left: v + "%" }} />
                      </div>
                    </div>
                  );
                }
                if (c.t === "chips") {
                  const sel = chips[key] ?? 0;
                  return (
                    <div key={key}>
                      <div className="mb-2 text-[12px] font-semibold text-[#cfcfcf]">{c.label}</div>
                      <div className="flex flex-wrap gap-1.5">
                        {c.opts.map((o, i) => (
                          <button key={o} onClick={() => setChips((s) => ({ ...s, [key]: i }))} className="rounded-md border-none px-3 py-1.5 text-[11.5px] font-semibold" style={i === sel ? { background: "#6b74f0", color: "#fff" } : { background: "#1e1e1e", color: "#9a9a9a" }}>{o}</button>
                        ))}
                      </div>
                    </div>
                  );
                }
                if (c.t === "color") {
                  const sel = colors[key] ?? 0;
                  return (
                    <div key={key}>
                      <div className="mb-2 text-[12px] font-semibold text-[#cfcfcf]">{c.label}</div>
                      <div className="flex gap-2">
                        {c.colors.map((cx, i) => (
                          <button key={cx} onClick={() => setColors((s) => ({ ...s, [key]: i }))} className="size-[26px] cursor-pointer rounded-md" style={{ background: cx, border: i === sel ? "2px solid #8b93ff" : "1px solid #333333" }} />
                        ))}
                      </div>
                    </div>
                  );
                }
                if (c.t === "toggle") {
                  const on = toggles[key] ?? c.def;
                  return (
                    <div key={key}>
                      <div className="flex items-center justify-between">
                        <span className="text-[12px] font-semibold text-[#cfcfcf]">{c.label}</span>
                        <div onClick={() => setToggles((s) => ({ ...s, [key]: !on }))} className="relative h-[22px] w-[38px] cursor-pointer rounded-full transition-colors" style={{ background: on ? "#6b74f0" : "#333333" }}>
                          <div className="absolute top-[3px] size-4 rounded-full bg-white transition-all" style={on ? { right: 3 } : { left: 3 }} />
                        </div>
                      </div>
                    </div>
                  );
                }
                if (c.t === "text") {
                  return (
                    <div key={key}>
                      <div className="mb-2 text-[12px] font-semibold text-[#cfcfcf]">{c.label}</div>
                      <div className="rounded-lg border border-[#2b2b2b] bg-[#161616] px-3 py-2.5 text-[12.5px] text-[#9a9a9a]">{c.val}</div>
                    </div>
                  );
                }
                if (c.t === "preset") {
                  return (
                    <div key={key}>
                      <div className="mb-2 text-[12px] font-semibold text-[#cfcfcf]">{c.label}</div>
                      <div className="grid grid-cols-3 gap-2">
                        {PRESET_TILES.map((bg, i) => (
                          <div key={i} onClick={() => flash(`${c.label} 프리셋 ${i + 1} 적용`)} className="aspect-square cursor-pointer rounded-[9px] border border-[#2b2b2b]" style={{ background: bg }} />
                        ))}
                      </div>
                    </div>
                  );
                }
                return null;
              })}
            </div>
          )}
        </div>

        {/* center player */}
        <div className="flex min-w-0 flex-1 flex-col bg-[#0d0d0d]">
          <div className="flex h-[34px] flex-none items-center border-b border-[#222222] px-3.5 text-[12px] font-semibold text-[#9a9a9a]">플레이어 · 타임라인 01</div>
          <div className="flex flex-1 items-center justify-center p-6">
            <div className="relative max-h-[420px] min-h-[210px] overflow-hidden rounded-md shadow-[0_20px_60px_rgba(0,0,0,.5)] [container-type:inline-size]" style={{ background: clip.thumb, aspectRatio: clip.ratio.replace("/", " / "), height: "100%" }}>
              <div className="absolute inset-0" style={{ background: "radial-gradient(120% 90% at 30% 15%,rgba(255,255,255,.06),rgba(0,0,0,.35))" }} />
              <div className="absolute bottom-[14%] left-[6%] right-[6%] text-center font-extrabold text-white [font-size:clamp(11px,8cqw,20px)] [line-height:1.25] [letter-spacing:-.3px]" style={{ textShadow: "0 2px 0 #000,0 0 10px rgba(0,0,0,.7)" }}>{captionText}</div>
              <div className="absolute left-1/2 top-1/2 flex size-[52px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-[rgba(11,12,15,.4)] backdrop-blur-[4px]">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff" style={{ marginLeft: 2 }}><path d="M8 5v14l11-7z" /></svg>
              </div>
            </div>
          </div>
          {/* transport */}
          <div className="flex h-11 flex-none items-center gap-3.5 border-t border-[#222222] bg-[#0a0a0a] px-4">
            <span className="mono text-[12px] text-[#cfcfcf]">{fmt(time)} <span className="text-[#5a5a5a]">/ {fmt(dur)}</span></span>
            <span className="flex-1" />
            <button onClick={togglePlay} className="flex size-[30px] items-center justify-center rounded-full bg-[#6b74f0] text-white hover:bg-[#5a63e6]">
              {playing ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" /><rect x="14" y="5" width="4" height="14" /></svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
              )}
            </button>
            <span className="flex-1" />
            <div className="flex items-center gap-3 text-[#707070]">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9}><rect x="3" y="3" width="18" height="18" rx="2" /></svg>
              <span className="rounded-[5px] border border-[#333333] px-1.5 py-[2px] text-[11px] font-bold">{clip.ratio === "9/16" ? "9:16" : "16:9"}</span>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9}><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" /></svg>
            </div>
          </div>
        </div>

        {/* right properties */}
        <div className="w-[262px] flex-none overflow-auto border-l border-[#222222] bg-[#0a0a0a] p-4">
          <div className="mb-4 flex gap-0.5 rounded-[9px] border border-[#232323] bg-[#121212] p-0.5">
            {["기본", "애니메이션", "속도"].map((lb, i) => (
              <button key={lb} className="flex-1 cursor-pointer rounded-md border-none px-2 py-2 text-[12px] font-semibold" style={i === 0 ? { background: "#1e1e1e", color: "#eceef2" } : { background: "transparent", color: "#9a9a9a" }}>{lb}</button>
            ))}
          </div>
          <div className="mb-3.5 text-[12px] font-bold text-[#9a9a9a]">세부 정보</div>
          <div className="flex flex-col gap-4">
            {PROP_SLIDERS.map((p) => {
              const key = `prop:${p.label}`;
              const v = sliders[key] ?? p.def;
              return (
                <div key={key}>
                  <div className="mb-2 flex items-baseline justify-between"><span className="text-[12px] font-semibold text-[#cfcfcf]">{p.label}</span><span className="mono text-[11px] text-[#9a9a9a]">{p.disp(v)}</span></div>
                  <div onClick={(e) => slideSet(key, e)} className="relative h-1.5 cursor-pointer rounded-full bg-[#1e1e1e]">
                    <div className="absolute inset-y-0 left-0 rounded-full bg-[#6b74f0]" style={{ width: v + "%" }} />
                    <div className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_1px_4px_rgba(0,0,0,.4)]" style={{ left: v + "%" }} />
                  </div>
                </div>
              );
            })}
            <div className="border-t border-[#1f1f1f] pt-3.5 text-[11.5px] leading-[1.5] text-[#707070]">좌측 도구로 편집 요소를 추가하면 여기에서 세부 속성을 조정할 수 있어요.</div>
          </div>
        </div>
      </div>

      {/* bottom timeline */}
      <div className="flex h-[214px] flex-none flex-col border-t border-[#222222] bg-[#0a0a0a]">
        {/* toolbar */}
        <div className="flex h-11 flex-none items-center gap-0.5 border-b border-[#1f1f1f] px-3.5">
          <button className="flex size-[30px] items-center justify-center rounded-md border-none bg-transparent text-[#cfcfcf] hover:bg-[#1e1e1e]"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 5v14M5 12h14" /></svg></button>
          <button className="flex size-[30px] items-center justify-center rounded-md border-none bg-[#1e1e1e] text-[#cfcfcf]"><svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M4 2l14 8-6 1.5L15 18l-2 1-3-6-4 4z" /></svg></button>
          <div className="mx-1 h-[18px] w-px bg-[#2b2b2b]" />
          <button className="flex size-[30px] items-center justify-center rounded-md border-none bg-transparent text-[#9a9a9a] hover:bg-[#1e1e1e]"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3" /></svg></button>
          <button className="flex size-[30px] items-center justify-center rounded-md border-none bg-transparent text-[#9a9a9a] hover:bg-[#1e1e1e]"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M15 14l5-5-5-5M20 9H9a5 5 0 0 0 0 10h3" /></svg></button>
          <div className="mx-1 h-[18px] w-px bg-[#2b2b2b]" />
          <button onClick={() => { setCuts((c) => [...c, time]); flash(`${fmt(time)} 지점 분할`); }} className="flex items-center gap-1.5 rounded-md border-none bg-transparent px-2.5 py-1.5 text-[12px] font-semibold text-[#cfcfcf] hover:bg-[#1e1e1e]"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 3v18M6 8l-3 4 3 4M18 8l3 4-3 4" /></svg>분할</button>
          <button onClick={() => { if (cuts.length) { setCuts((c) => c.slice(0, -1)); flash("마지막 분할 제거"); } else flash("선택 항목 없음"); }} className="flex items-center gap-1.5 rounded-md border-none bg-transparent px-2.5 py-1.5 text-[12px] font-semibold text-[#cfcfcf] hover:bg-[#1e1e1e]"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" /></svg>삭제</button>
          <button className="flex items-center gap-1.5 rounded-md border-none bg-transparent px-2.5 py-1.5 text-[12px] font-semibold text-[#cfcfcf] hover:bg-[#1e1e1e]"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M13 3l-2 6h5l-4 12" /></svg>속도</button>
          <span className="flex-1" />
          <button onClick={() => bump(-0.25)} className="flex border-none bg-transparent p-1 text-[#707070] hover:text-[#cfcfcf]"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M5 12h14" /></svg></button>
          <div onClick={zoomSet} className="relative h-[5px] w-[96px] cursor-pointer rounded-full bg-[#1e1e1e]">
            <div className="absolute inset-y-0 left-0 rounded-full bg-[#3a4050]" style={{ width: zoomFill }} />
            <div className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#cfcfcf]" style={{ left: zoomFill }} />
          </div>
          <button onClick={() => bump(0.25)} className="flex border-none bg-transparent p-1 text-[#707070] hover:text-[#cfcfcf]"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 5v14M5 12h14" /></svg></button>
        </div>
        {/* tracks */}
        <div className="relative min-h-0 flex-1 overflow-auto px-4 py-2.5">
          <div className="relative min-w-full" style={{ width: zoomWidth }}>
            {/* ruler */}
            <div onClick={seek} className="mono relative mb-1.5 h-4 cursor-pointer text-[9.5px] text-[#6b6b6b]">
              {ticks.map((t) => <span key={t.left} className="absolute -translate-x-1/2" style={{ left: t.left }}>{t.label}</span>)}
            </div>
            {/* playhead */}
            <div className="pointer-events-none absolute bottom-0 top-2.5 z-[5] w-0.5 bg-[#eceef2]" style={{ left: playPct }}>
              <div className="absolute -left-1 -top-px size-2.5 rounded-[2px] bg-[#eceef2]" />
            </div>
            {/* video track */}
            <div className="relative mb-1.5 h-[46px] overflow-hidden rounded-lg border border-[#8b7cf6]">
              <div className="flex h-full gap-0.5">
                {cells.map((_, i) => <div key={i} className="flex-1" style={{ background: clip.thumb }} />)}
              </div>
              {cuts.map((t, i) => <div key={i} className="absolute inset-y-0 w-0.5 bg-[#fbbf24] shadow-[0_0_0_1px_rgba(0,0,0,.4)]" style={{ left: (t / dur * 100) + "%" }} />)}
            </div>
            {/* caption track */}
            <div className="relative mb-1.5 h-[26px]">
              {capData.map((c, i) => {
                const on = i === capIdx;
                return (
                  <div key={i} onClick={() => { setCapSel(i); setTime(c.t0); }} className="absolute inset-y-0 flex cursor-pointer items-center overflow-hidden whitespace-nowrap rounded-md border px-2 text-[10px] font-semibold text-[#cfe0ff]" style={{ left: (c.t0 / dur * 100) + "%", width: ((c.t1 - c.t0) / dur * 100) + "%", background: `rgba(94,155,255,${on ? 0.34 : 0.2})`, borderColor: on ? "#93c0ff" : "#5e9bff" }}>{c.short}</div>
                );
              })}
            </div>
            {/* audio track */}
            <div className="flex h-[34px] items-center gap-px overflow-hidden rounded-md border border-[rgba(52,211,153,.3)] bg-[rgba(52,211,153,.08)] px-1.5">
              {waves.map((h, i) => <div key={i} className="min-w-px flex-1 rounded-sm bg-[#34d399] opacity-70" style={{ height: h }} />)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
