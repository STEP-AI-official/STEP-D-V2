"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PplAnalysis } from "@/lib/api";

const PPL_BOX_COLORS = ["#6C5CE7", "#27E0A0", "#5B8CFF", "#FFD400", "#FF49DB", "#15A088"];

type Box = [number, number, number, number];

// A box may persist this many seconds past its first/last keyframe (PAD). Two
// consecutive keyframes farther apart than maxGap are treated as separate
// on-screen segments (the product left and came back) — so the box hides in the
// gap instead of floating across it. maxGap is derived per-analysis from the
// frame sampling step so densely-curated tracks gate tightly while sparse
// Gemini-sampled tracks stay continuous between their samples.
const PAD = 0.45;

const lerp = (a: number, b: number, r: number) => a + (b - a) * r;

// Median spacing between sampled frame timestamps → adaptive gap threshold.
function gapThreshold(times: number[]): number {
  const diffs: number[] = [];
  for (let i = 1; i < times.length; i++) {
    const d = times[i] - times[i - 1];
    if (d > 0.001) diffs.push(d);
  }
  if (!diffs.length) return 2.6;
  diffs.sort((a, b) => a - b);
  const median = diffs[Math.floor(diffs.length / 2)];
  return Math.min(12, Math.max(2.6, median * 1.6));
}

// Interpolate a product's box at time t from its sorted keyframes, or null when
// the product isn't on screen at t (outside its window or inside a gap).
function sampleBox(kfs: { t: number; box: Box }[], t: number, maxGap: number): Box | null {
  if (!kfs.length) return null;
  const first = kfs[0];
  const last = kfs[kfs.length - 1];
  if (t <= first.t) return first.t - t <= PAD ? first.box : null;
  if (t >= last.t) return t - last.t <= PAD ? last.box : null;
  for (let i = 0; i < kfs.length - 1; i++) {
    const a = kfs[i];
    const b = kfs[i + 1];
    if (a.t <= t && t <= b.t) {
      if (b.t - a.t > maxGap) return null; // gap → product is off screen
      const r = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
      return [
        lerp(a.box[0], b.box[0], r),
        lerp(a.box[1], b.box[1], r),
        lerp(a.box[2], b.box[2], r),
        lerp(a.box[3], b.box[3], r),
      ];
    }
  }
  return null;
}

// 9:16 player that draws brand/product bounding boxes synced to playback.
// Boxes are normalized 0..1 of the rendered frame. The per-frame detections form
// a keyframe track per product; the box is interpolated between keyframes and
// hidden whenever the product is not on screen (no nearby detection).
export function PplOverlayPlayer({ analysis, videoUrl, poster, maxWidth = 300 }: { analysis: PplAnalysis; videoUrl?: string; poster?: string; maxWidth?: number }) {
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

  // Group per-frame detections into a sorted keyframe track per product id.
  const tracks = useMemo(() => {
    const byId = new Map<string, { brand: string; product: string; kfs: { t: number; box: Box }[] }>();
    const frames = [...(analysis.frames || [])].sort((a, b) => a.timestamp - b.timestamp);
    for (const f of frames) {
      for (const d of f.detections || []) {
        let tr = byId.get(d.product_id);
        if (!tr) {
          const meta = analysis.products.find((p) => p.id === d.product_id);
          tr = { brand: d.brand || meta?.brand || "", product: d.product || meta?.product || "", kfs: [] };
          byId.set(d.product_id, tr);
        }
        tr.kfs.push({ t: f.timestamp, box: d.box as Box });
      }
    }
    return byId;
  }, [analysis]);

  const maxGap = useMemo(
    () => gapThreshold([...(analysis.frames || [])].map((f) => f.timestamp).sort((a, b) => a - b)),
    [analysis]
  );

  // Boxes visible at the current playback time.
  const active = useMemo(() => {
    const out: { id: string; brand: string; product: string; box: Box }[] = [];
    tracks.forEach((tr, id) => {
      const box = sampleBox(tr.kfs, t, maxGap);
      if (box) out.push({ id, brand: tr.brand, product: tr.product, box });
    });
    return out;
  }, [tracks, t, maxGap]);

  return (
    <div style={{ position: "relative", width: "100%", maxWidth, margin: "0 auto", aspectRatio: "9 / 16", borderRadius: 12, overflow: "hidden", background: "#000", boxShadow: "0 10px 30px -16px rgba(0,0,0,.6)" }}>
      {videoUrl ? (
        <video ref={videoRef} src={videoUrl} controls playsInline preload="metadata" poster={poster} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", background: "#050505" }} />
      ) : poster ? (
        <div style={{ position: "absolute", inset: 0, backgroundImage: `url(${poster})`, backgroundSize: "cover", backgroundPosition: "center" }} />
      ) : null}
      {active.map((d) => {
        const color = colorFor(d.id);
        return (
          <div key={d.id} style={{ position: "absolute", left: `${d.box[0] * 100}%`, top: `${d.box[1] * 100}%`, width: `${d.box[2] * 100}%`, height: `${d.box[3] * 100}%`, border: `2px solid ${color}`, borderRadius: 5, boxShadow: "0 0 0 1px rgba(0,0,0,.45)", pointerEvents: "none", transition: "left .12s linear, top .12s linear, width .12s linear, height .12s linear" }}>
            <span style={{ position: "absolute", left: -2, top: d.box[1] < 0.08 ? "100%" : -19, whiteSpace: "nowrap", fontSize: 10, fontWeight: 800, color: "#fff", background: color, padding: "1px 5px", borderRadius: 4, boxShadow: "0 2px 6px rgba(0,0,0,.4)" }}>
              {d.brand} · {d.product}
            </span>
          </div>
        );
      })}
    </div>
  );
}
