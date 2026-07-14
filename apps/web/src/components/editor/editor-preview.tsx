"use client";

import { Heart, MessageCircle, Send } from "lucide-react";
import { ASPECTS, type EditorState } from "@/lib/editor/presets";

/**
 * WYSIWYG preview canvas. Overlays are positioned by percentage over a fixed-aspect
 * stage, so what you see maps 1:1 to the eventual bake (plan §3 / §7.4). The video
 * band is a placeholder stand-in until real footage wires in at M6.
 */
export function EditorPreview({ state, videoUrl }: { state: EditorState; videoUrl?: string }) {
  const ratio = ASPECTS[state.aspect].ratio;

  return (
    <div className="flex h-full items-center justify-center">
      <div
        className="relative overflow-hidden rounded-lg shadow-2xl"
        style={{
          aspectRatio: ratio,
          height: ratio < 1 ? "min(72vh, 640px)" : undefined,
          width: ratio >= 1 ? "min(90%, 900px)" : undefined,
          maxHeight: "72vh",
          background: state.bg,
        }}
      >
        {/* video band — real footage when available, else a reframe stand-in */}
        <div
          className="absolute inset-x-0 flex items-center justify-center overflow-hidden bg-black"
          style={{
            top: "34%",
            height: state.aspect === "9:16" ? "34%" : state.aspect === "16:9" ? "100%" : "48%",
          }}
        >
          {videoUrl ? (
            <video
              key={videoUrl}
              src={videoUrl}
              controls
              playsInline
              className="size-full object-contain"
            />
          ) : (
            <div className="flex size-full items-center justify-center bg-gradient-to-br from-zinc-700 to-zinc-900 text-[11px] text-zinc-400">
              영상
            </div>
          )}
        </div>

        {/* title lines */}
        <div
          className="absolute px-4"
          style={{
            top: `${state.titleY}%`,
            left: 0,
            right: 0,
            textAlign: state.titleAlign,
          }}
        >
          {state.titleLines.map((line) => (
            <div
              key={line.id}
              style={{
                color: line.color,
                fontSize: line.size,
                fontWeight: 800,
                lineHeight: 1.15,
                textShadow: "0 2px 6px rgba(0,0,0,.5)",
              }}
            >
              {line.text || "제목을 입력하세요"}
            </div>
          ))}
        </div>

        {/* captions (karaoke sample) */}
        {state.captionsOn && (
          <div
            className="absolute inset-x-0 px-6 text-center"
            style={{ top: "72%" }}
          >
            <span
              className="rounded px-1 text-lg font-bold"
              style={{ color: "#fff", textShadow: "0 2px 6px rgba(0,0,0,.6)" }}
            >
              지금 이 장면이{" "}
              <span style={{ color: state.highlightColor }}>가장 먼저</span> 잡혀야 해요
            </span>
          </div>
        )}

        {/* channel badge */}
        {state.showChannel && (
          <div
            className="absolute inset-x-0 flex items-center justify-center gap-2"
            style={{ top: `${state.channelY}%` }}
          >
            <span className="flex size-6 items-center justify-center rounded-full bg-white/90 text-[10px] font-bold text-black">
              CH
            </span>
            <span className="text-sm font-semibold text-white" style={{ textShadow: "0 1px 3px rgba(0,0,0,.6)" }}>
              {state.channelName}
            </span>
          </div>
        )}

        {/* elements */}
        {state.elements.map((el) => (
          <div
            key={el.id}
            className="absolute -translate-x-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-sm font-bold"
            style={{
              left: `${el.x}%`,
              top: `${el.y}%`,
              background:
                el.type === "cta" ? state.accent : el.type === "sticker" ? "#FFD400" : "#ffffff",
              color: el.type === "arrow" ? state.accent : "#16120D",
              fontSize: el.type === "arrow" ? 40 : 14,
            }}
          >
            {el.text}
          </div>
        ))}

        {/* safe-area + mock Shorts UI */}
        {state.showSafeArea && (
          <>
            <div className="pointer-events-none absolute inset-[6%] rounded border border-dashed border-white/40" />
            <div className="absolute bottom-[12%] right-3 flex flex-col items-center gap-3 text-white/80">
              <Heart className="size-5" />
              <MessageCircle className="size-5" />
              <Send className="size-5" />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
