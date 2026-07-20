import { useCallback, useEffect, useRef, useState } from "react";
import { API, fetchLabData } from "./api";
import type { LabCastPerson, LabData } from "./types";
import { fmt } from "./util";
import ShortsTab from "./tabs/ShortsTab";
import TimelineTab from "./tabs/TimelineTab";
import CastTab from "./tabs/CastTab";
import ScenesTab from "./tabs/ScenesTab";
import ScriptTab from "./tabs/ScriptTab";
import MatchTab from "./tabs/MatchTab";

type TabKey = "shorts" | "timeline" | "cast" | "scenes" | "script" | "match";

const TABS: { key: TabKey; label: string }[] = [
  { key: "shorts", label: "🔥 쇼츠 추천" },
  { key: "timeline", label: "🕐 타임라인" },
  { key: "cast", label: "👤 출연진" },
  { key: "scenes", label: "장면" },
  { key: "script", label: "자막" },
  { key: "match", label: "🔗 숏폼 매칭" },
];

export function castPeople(cast: LabData["cast"]): LabCastPerson[] {
  if (!cast) return [];
  return Array.isArray(cast) ? cast : (cast.people ?? []);
}

export default function App() {
  const [data, setData] = useState<LabData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("shorts");
  const [nowText, setNowText] = useState("—");
  const playerRef = useRef<HTMLVideoElement | null>(null);

  // The analysis payload is optional: the 매칭 tab works with no pipeline output at all,
  // so a failure here must not blank the app (the old vanilla Lab returned early and
  // rendered nothing, which would have hidden 매칭 entirely).
  useEffect(() => {
    fetchLabData()
      .then(setData)
      .catch((e: Error) => setErr(e.message));
  }, []);

  const seek = useCallback((t: number) => {
    const p = playerRef.current;
    if (!p) return;
    p.currentTime = t + 0.05; // nudge past the keyframe boundary
    void p.play();
  }, []);

  // Live playhead → current subtitle readout.
  useEffect(() => {
    const p = playerRef.current;
    if (!p || !data) return;
    const onTime = () => {
      const t = p.currentTime;
      const src = data.refined?.length ? data.refined : data.raw;
      const cur = (src ?? []).find((s) => s.start <= t && s.end >= t);
      setNowText(cur?.text || "—");
    };
    p.addEventListener("timeupdate", onTime);
    return () => p.removeEventListener("timeupdate", onTime);
  }, [data]);

  const st = data?.stats ?? {};
  const people = castPeople(data?.cast ?? null);
  const blocks = data?.timeline?.blocks ?? [];
  const counts: Record<TabKey, string> = {
    shorts: st.shorts ? `(${st.shorts})` : "",
    timeline: blocks.length ? `(${blocks.length})` : "",
    cast: people.length ? `(${people.length})` : "",
    scenes: st.scenes ? `(${st.scenes})` : "",
    script: st.refined || st.segments ? `(${st.refined || st.segments})` : "",
    match: "",
  };

  return (
    <>
      <header>
        <h1>STEP D Lab</h1>
        <span className="vid">{data?.video_name || "—"}</span>
        <div className="stats">
          <div><b>{st.duration ? fmt(st.duration) : "—"}</b> <span>길이</span></div>
          <div><b>{st.scenes ?? 0}</b> <span>장면</span></div>
          <div><b>{st.scenes_silent ?? 0}</b> <span>무음</span></div>
          <div><b>{st.segments ?? 0}</b> <span>자막</span></div>
        </div>
      </header>

      <div className={`wrap${tab === "match" ? " solo" : ""}`}>
        <div className="left">
          <video ref={playerRef} controls src={data?.video ? API + data.video : undefined} />
          <div className="now">
            <span className="t">현재 자막</span>
            <div>{nowText}</div>
          </div>
        </div>

        <div className="right">
          <div className="tabs">
            {TABS.map((t) => (
              <div
                key={t.key}
                className={`tab${tab === t.key ? " on" : ""}`}
                onClick={() => setTab(t.key)}
              >
                {t.label} <span>{counts[t.key]}</span>
              </div>
            ))}
          </div>

          <div className="pane">
            {tab === "match" ? (
              <MatchTab />
            ) : err ? (
              <div className="empty-note">분석 데이터를 불러오지 못했습니다: {err}</div>
            ) : !data ? (
              <div className="empty-note">불러오는 중…</div>
            ) : !data.video ? (
              <div className="empty-note">
                파이프라인 출력이 없습니다. 분석을 먼저 돌리거나, 🔗 숏폼 매칭 탭을 사용하세요.
              </div>
            ) : tab === "shorts" ? (
              <ShortsTab shorts={data.shorts ?? []} seek={seek} />
            ) : tab === "timeline" ? (
              <TimelineTab blocks={blocks} seek={seek} />
            ) : tab === "cast" ? (
              <CastTab people={people} seek={seek} />
            ) : tab === "scenes" ? (
              <ScenesTab scenes={data.scenes ?? []} seek={seek} />
            ) : (
              <ScriptTab raw={data.raw ?? []} refined={data.refined ?? []} seek={seek} />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
