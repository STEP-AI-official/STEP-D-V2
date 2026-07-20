import { useState } from "react";
import type { LabScene } from "../types";
import { fmt, frameUrl } from "../util";

const scoreColor = (v: number): string => (v >= 70 ? "#4ade80" : v >= 45 ? "#fbbf24" : "#9a9aa6");

export default function ScenesTab({
  scenes,
  seek,
}: {
  scenes: LabScene[];
  seek: (t: number) => void;
}) {
  const [sort, setSort] = useState<"time" | "score">("time");
  const [silentOnly, setSilentOnly] = useState(false);

  let list = scenes.slice();
  if (silentOnly) list = list.filter((s) => !s.has_dialogue);
  if (sort === "score") list.sort((a, b) => (b.vision_score ?? -1) - (a.vision_score ?? -1));

  const scored = scenes.filter((s) => s.vision_score != null).length;
  const note = scored ? `· 시각채점 ${scored}/${scenes.length}` : "· 시각채점 전 (core.vision 실행)";

  return (
    <>
      <div className="toolbar">
        <button className={sort === "time" ? "on" : ""} onClick={() => setSort("time")}>
          시간순
        </button>
        <button className={sort === "score" ? "on" : ""} onClick={() => setSort("score")}>
          시각점수순
        </button>
        <button className={silentOnly ? "on" : ""} onClick={() => setSilentOnly((v) => !v)}>
          무음만
        </button>
        <span style={{ color: "var(--mut2)", fontSize: 12 }}>{note}</span>
      </div>

      <div className="grid">
        {list.map((s, i) => {
          const v = s.vision_score;
          const tags = s.vision_tags ?? [];
          const names = s.on_screen_names ?? [];
          const dur = s.duration ?? s.end - s.start;
          return (
            <div className="scene" key={i} onClick={() => seek(s.start)} title={s.vision_reason || ""}>
              <div className="thumb">
                {s.frame ? (
                  <img loading="lazy" src={frameUrl(s.frame)} alt="" />
                ) : (
                  <div style={{ aspectRatio: "16/9", background: "#000" }} />
                )}
                {v != null && (
                  <span className="vscore" style={{ color: scoreColor(v) }}>
                    {v}
                  </span>
                )}
              </div>
              <div className="meta">
                <div className="tr">
                  <span>
                    {fmt(s.start)}–{fmt(s.end)} · {dur.toFixed(1)}s
                  </span>
                  <span className={`badge ${s.has_dialogue ? "talk" : "silent"}`}>
                    {s.has_dialogue ? "대사" : "무음"}
                  </span>
                </div>
                {tags.length > 0 && (
                  <div className="vtags">
                    {tags.map((t, j) => (
                      <span className="vtag" key={j}>
                        {t}
                      </span>
                    ))}
                  </div>
                )}
                {names.length > 0 && <div className="names">🏷 {names.join(", ")}</div>}
                <div className={`dlg ${s.text ? "" : "empty"}`}>
                  {s.text || "(대사 없음 — 화면으로 판단)"}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
