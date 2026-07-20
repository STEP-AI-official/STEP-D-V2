import { useState } from "react";
import type { LabSegment } from "../types";
import { fmt } from "../util";

export default function ScriptTab({
  raw,
  refined,
  seek,
}: {
  raw: LabSegment[];
  refined: LabSegment[];
  seek: (t: number) => void;
}) {
  const [mode, setMode] = useState<"refined" | "raw">("refined");
  const [diffOnly, setDiffOnly] = useState(false);

  // 정제 결과가 비어 있으면 원본으로 폴백. '바뀐 것만'은 소스를 바꾸지 않고 필터만 한다.
  const use = mode === "refined" && refined.length ? refined : raw;

  const rows = use
    .map((s, i) => {
      const changed =
        !!refined.length && !!raw[i] && (raw[i].text || "").trim() !== (refined[i]?.text || "").trim();
      if (diffOnly && !changed) return null;
      const txt = (s.text || "").trim();
      if (!txt) return null;
      return (
        <div className={`seg ${changed ? "diff" : ""}`} key={i} onClick={() => seek(s.start)}>
          <span className="ts">{fmt(s.start)}</span>
          <span>{txt}</span>
        </div>
      );
    })
    .filter(Boolean);

  return (
    <>
      <div className="toolbar">
        <button
          className={mode === "refined" && !diffOnly ? "on" : ""}
          onClick={() => {
            setMode("refined");
            setDiffOnly(false);
          }}
        >
          정제
        </button>
        <button
          className={mode === "raw" && !diffOnly ? "on" : ""}
          onClick={() => {
            setMode("raw");
            setDiffOnly(false);
          }}
        >
          원본
        </button>
        <button className={diffOnly ? "on" : ""} onClick={() => setDiffOnly((v) => !v)}>
          바뀐 것만
        </button>
      </div>

      <div>{rows.length ? rows : <div className="empty-note">표시할 자막이 없습니다.</div>}</div>
    </>
  );
}
