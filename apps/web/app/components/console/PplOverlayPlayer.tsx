"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PplAnalysis } from "@/lib/api";

const PPL_BOX_COLORS = ["#6C5CE7", "#27E0A0", "#5B8CFF", "#FFD400", "#FF49DB", "#15A088"];

// 9:16 player that draws brand/product bounding boxes synced to playback.
// Boxes are normalized 0..1 of the rendered frame. Ported from the original app.
export function PplOverlayPlayer({ analysis, videoUrl, poster }: { analysis: PplAnalysis; videoUrl?: string; poster?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [t, setT] = useState(0);
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return undefined;
    const onTime = () => setT(v.currentTime);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("seeked", onTime);
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("seeked", onTime);
    };
  }, []);
  const colorFor = (id: string) => {
    const idx = analysis.products.findIndex((p) => p.id === id);
    return PPL_BOX_COLORS[(idx < 0 ? 0 : idx) % PPL_BOX_COLORS.length];
  };
  const detections = useMemo(() => {
    if (!analysis.frames.length) return [];
    let best = analysis.frames[0];
    for (const f of analysis.frames) {
      if (Math.abs(f.timestamp - t) < Math.abs(best.timestamp - t)) best = f;
    }
    return best.detections;
  }, [analysis, t]);
  return (
    <div style={{ position: "relative", width: "100%", maxWidth: 260, margin: "0 auto", aspectRatio: "9 / 16", borderRadius: 12, overflow: "hidden", background: "#000", boxShadow: "0 10px 30px -16px rgba(0,0,0,.6)" }}>
      {videoUrl ? (
        <video ref={videoRef} src={videoUrl} controls playsInline preload="metadata" poster={poster} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", background: "#050505" }} />
      ) : poster ? (
        <div style={{ position: "absolute", inset: 0, backgroundImage: `url(${poster})`, backgroundSize: "cover", backgroundPosition: "center" }} />
      ) : null}
      {detections.map((d, i) => {
        const color = colorFor(d.product_id);
        return (
          <div key={`${d.product_id}-${i}`} style={{ position: "absolute", left: `${d.box[0] * 100}%`, top: `${d.box[1] * 100}%`, width: `${d.box[2] * 100}%`, height: `${d.box[3] * 100}%`, border: `2px solid ${color}`, borderRadius: 5, boxShadow: "0 0 0 1px rgba(0,0,0,.45)", pointerEvents: "none", transition: "all .12s linear" }}>
            <span style={{ position: "absolute", left: -2, top: d.box[1] < 0.08 ? "100%" : -19, whiteSpace: "nowrap", fontSize: 10, fontWeight: 800, color: "#fff", background: color, padding: "1px 5px", borderRadius: 4, boxShadow: "0 2px 6px rgba(0,0,0,.4)" }}>
              {d.brand} · {d.product}
            </span>
          </div>
        );
      })}
    </div>
  );
}
