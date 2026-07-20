import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  deleteMatch,
  fetchMatchChannels,
  fetchMatchData,
  getToken,
  saveMatch,
  setToken,
} from "../api";
import type { LabChannel, LabChannelVideo, LabMatchData, LabSourceMap } from "../types";
import { fmtLong, nfmt, parseTime } from "../util";

// ── YouTube IFrame API ───────────────────────────────────────────────────────
// The source longforms live on YouTube, not in our GCS, so the native <video> player the
// rest of the Lab uses can't scrub them. The IFrame API gives getCurrentTime()/seekTo(),
// which is all the range picker needs — and costs no download.

interface YTPlayer {
  getCurrentTime: () => number;
  getDuration: () => number;
  seekTo: (s: number, allow: boolean) => void;
  destroy: () => void;
}
declare global {
  interface Window {
    YT?: { Player: new (el: HTMLElement, opts: unknown) => YTPlayer };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let ytApi: Promise<void> | null = null;
function loadYouTubeApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  if (ytApi) return ytApi;
  ytApi = new Promise<void>((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(s);
  });
  return ytApi;
}

/** A YouTube player whose instance is handed back so the parent can read its playhead. */
function YouTubeFrame({
  videoId,
  className,
  onPlayer,
}: {
  videoId: string;
  className?: string;
  onPlayer?: (p: YTPlayer | null) => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const cbRef = useRef(onPlayer);
  cbRef.current = onPlayer;

  useEffect(() => {
    let player: YTPlayer | null = null;
    let cancelled = false;
    void loadYouTubeApi().then(() => {
      if (cancelled || !hostRef.current || !window.YT) return;
      player = new window.YT.Player(hostRef.current, {
        videoId,
        playerVars: { enablejsapi: 1, rel: 0, modestbranding: 1 },
      });
      cbRef.current?.(player);
    });
    return () => {
      cancelled = true;
      cbRef.current?.(null);
      try {
        player?.destroy();
      } catch {
        /* already gone */
      }
    };
  }, [videoId]);

  // YT.Player REPLACES this node, so it must be a bare div it can swallow.
  return (
    <div className={className}>
      <div ref={hostRef} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}

// ── 매칭 화면 ────────────────────────────────────────────────────────────────

type Filter = "all" | "todo" | "done";

export default function MatchTab() {
  const [channels, setChannels] = useState<LabChannel[]>([]);
  const [channelId, setChannelId] = useState("");
  const [data, setData] = useState<LabMatchData | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [selected, setSelected] = useState<string>("");
  const [longId, setLongId] = useState("");
  const [segStart, setSegStart] = useState("");
  const [segEnd, setSegEnd] = useState("");
  const [note, setNote] = useState("");
  const [filter, setFilter] = useState<Filter>("todo");
  const [query, setQuery] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [token, setTok] = useState(getToken());

  const longPlayer = useRef<YTPlayer | null>(null);

  useEffect(() => {
    fetchMatchChannels()
      .then((cs) => {
        setChannels(cs);
        setChannelId((cur) => cur || cs[0]?.channelId || "");
      })
      .catch((e: Error) => setErr(e.message));
  }, []);

  const reload = useCallback((id: string) => {
    if (!id) return;
    setLoading(true);
    fetchMatchData(id)
      .then((d) => {
        setData(d);
        setErr(null);
      })
      .catch((e: Error) => setErr(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setSelected("");
    setData(null);
    reload(channelId);
  }, [channelId, reload]);

  const mapByShort = useMemo(() => {
    const m = new Map<string, LabSourceMap>();
    for (const x of data?.maps ?? []) m.set(x.shortVideoId, x);
    return m;
  }, [data]);

  const shorts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.shorts ?? [])
      .filter((s) => {
        const done = mapByShort.has(s.videoId);
        if (filter === "todo" && done) return false;
        if (filter === "done" && !done) return false;
        return !q || s.title.toLowerCase().includes(q);
      })
      .sort((a, b) => b.viewCount - a.viewCount);
  }, [data, filter, query, mapByShort]);

  const short = useMemo(
    () => (data?.shorts ?? []).find((s) => s.videoId === selected) ?? null,
    [data, selected],
  );

  // Candidate sources: a short can only come from a longform published no later than it.
  const longs = useMemo(() => {
    const all = data?.longs ?? [];
    if (!short) return all;
    const t = Date.parse(short.publishedAt);
    const before = all.filter((l) => Date.parse(l.publishedAt) <= t + 24 * 3600 * 1000);
    return before.length ? before : all;
  }, [data, short]);

  function pick(s: LabChannelVideo) {
    setSelected(s.videoId);
    setMsg(null);
    const ex = mapByShort.get(s.videoId);
    setLongId(ex?.longVideoId ?? "");
    setSegStart(ex ? String(Math.round(ex.segStart)) : "");
    setSegEnd(ex ? String(Math.round(ex.segEnd)) : "");
    setNote(ex?.note ?? "");
  }

  const capture = (which: "start" | "end") => {
    const p = longPlayer.current;
    if (!p) {
      setMsg({ kind: "err", text: "롱폼 플레이어가 아직 준비되지 않았습니다." });
      return;
    }
    const t = Math.max(0, Math.round(p.getCurrentTime()));
    if (which === "start") setSegStart(String(t));
    else setSegEnd(String(t));
    setMsg(null);
  };

  const startSec = parseTime(segStart);
  const endSec = parseTime(segEnd);
  const lenSec = startSec != null && endSec != null ? endSec - startSec : null;
  const lenBad = lenSec != null && (lenSec <= 0 || lenSec > 180);
  const canSave =
    !!selected && !!longId && startSec != null && endSec != null && !lenBad && !saving && !!token;

  async function onSave() {
    if (!canSave || startSec == null || endSec == null) return;
    setSaving(true);
    try {
      await saveMatch({
        shortVideoId: selected,
        channelId,
        longVideoId: longId,
        segStart: startSec,
        segEnd: endSec,
        note: note.trim() || undefined,
      });
      setMsg({ kind: "ok", text: "저장했습니다." });
      reload(channelId);
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!selected) return;
    try {
      await deleteMatch(selected);
      setMsg({ kind: "ok", text: "매칭을 삭제했습니다." });
      setLongId("");
      setSegStart("");
      setSegEnd("");
      setNote("");
      reload(channelId);
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
    }
  }

  const doneCount = data?.maps.length ?? 0;
  const totalShorts = data?.shorts.length ?? 0;

  return (
    <div>
      <div className="toolbar">
        <select value={channelId} onChange={(e) => setChannelId(e.target.value)}>
          {channels.map((c) => (
            <option key={c.channelId} value={c.channelId}>
              {c.channelName}
              {c.subscribers ? ` (${nfmt(c.subscribers)})` : ""}
            </option>
          ))}
        </select>
        <button className={filter === "todo" ? "on" : ""} onClick={() => setFilter("todo")}>
          미매칭
        </button>
        <button className={filter === "done" ? "on" : ""} onClick={() => setFilter("done")}>
          매칭됨
        </button>
        <button className={filter === "all" ? "on" : ""} onClick={() => setFilter("all")}>
          전체
        </button>
        <input
          placeholder="숏폼 제목 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span className="m-msg">
          매칭 <b className="m-picked">{doneCount}</b> / 숏폼 {totalShorts}
        </span>
        {!token && (
          <input
            placeholder="쓰기 토큰 입력"
            onBlur={(e) => {
              if (!e.target.value.trim()) return;
              setToken(e.target.value);
              setTok(getToken());
            }}
          />
        )}
      </div>

      {err && <div className="m-msg err" style={{ marginBottom: 10 }}>불러오기 실패: {err}</div>}
      {!token && (
        <div className="m-msg err" style={{ marginBottom: 10 }}>
          저장하려면 쓰기 토큰이 필요합니다 (서버 LAB_WRITE_TOKEN 값). 위 입력칸에 넣으면 이 브라우저에 저장됩니다.
        </div>
      )}

      <div className="m-wrap">
        <div className="m-col">
          {loading ? (
            <div className="empty-note">불러오는 중…</div>
          ) : !shorts.length ? (
            <div className="empty-note">해당하는 숏폼이 없습니다.</div>
          ) : (
            <div className="m-list">
              {shorts.map((s) => {
                const done = mapByShort.has(s.videoId);
                return (
                  <div
                    key={s.videoId}
                    className={`m-item${selected === s.videoId ? " on" : ""}`}
                    onClick={() => pick(s)}
                  >
                    {s.thumbnail ? <img src={s.thumbnail} alt="" /> : <img alt="" />}
                    <div className="b">
                      <div className="t">{s.title}</div>
                      <div className="s">
                        조회 {nfmt(s.viewCount)} · {s.publishedAt.slice(0, 10)}
                        {done && <span className="done"> · 매칭됨</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="m-col">
          {!short ? (
            <div className="empty-note">왼쪽에서 숏폼을 고르면 출처 롱폼과 구간을 지정할 수 있습니다.</div>
          ) : (
            <div className="m-panel">
              <h3>{short.title}</h3>
              <div className="m-players">
                <YouTubeFrame
                  key={short.videoId}
                  videoId={short.videoId}
                  className="m-short-fr"
                />
                <div>
                  <select
                    value={longId}
                    onChange={(e) => {
                      setLongId(e.target.value);
                      setMsg(null);
                    }}
                    style={{ width: "100%", marginBottom: 10 }}
                  >
                    <option value="">— 출처 롱폼 선택 —</option>
                    {longs.map((l) => (
                      <option key={l.videoId} value={l.videoId}>
                        {l.publishedAt.slice(0, 10)} · {fmtLong(l.durationSec)} · {l.title}
                      </option>
                    ))}
                  </select>

                  {longId ? (
                    <YouTubeFrame
                      key={longId}
                      videoId={longId}
                      className="m-long-fr"
                      onPlayer={(p) => (longPlayer.current = p)}
                    />
                  ) : (
                    <div className="empty-note" style={{ padding: 60 }}>
                      롱폼을 선택하면 재생하며 구간을 지정할 수 있습니다.
                    </div>
                  )}
                </div>
              </div>

              <div className="m-range">
                <button className="cap" onClick={() => capture("start")}>
                  ⏱ 시작 지점 지정
                </button>
                <input value={segStart} onChange={(e) => setSegStart(e.target.value)} placeholder="시작" />
                <button className="cap" onClick={() => capture("end")}>
                  ⏱ 끝 지점 지정
                </button>
                <input value={segEnd} onChange={(e) => setSegEnd(e.target.value)} placeholder="끝" />
                {startSec != null && (
                  <button className="cap" onClick={() => longPlayer.current?.seekTo(startSec, true)}>
                    ▶ 시작으로 이동
                  </button>
                )}
                <span className={`len${lenBad ? " bad" : ""}`}>
                  {lenSec == null
                    ? "구간 미지정"
                    : lenBad
                      ? `길이 ${Math.round(lenSec)}초 — 0초 초과 180초 이하여야 합니다`
                      : `길이 ${Math.round(lenSec)}초 (${fmtLong(startSec!)} ~ ${fmtLong(endSec!)})`}
                </span>
              </div>

              <div className="m-range">
                <input
                  style={{ width: 320, textAlign: "left" }}
                  placeholder="메모 (선택)"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>

              <div className="m-actions">
                <button className="save" disabled={!canSave} onClick={onSave}>
                  {saving ? "저장 중…" : "매칭 저장"}
                </button>
                {mapByShort.has(selected) && (
                  <button className="del" onClick={onDelete}>
                    매칭 삭제
                  </button>
                )}
                {msg && <span className={`m-msg ${msg.kind}`}>{msg.text}</span>}
              </div>

              <div className="m-hint">
                시간은 초 또는 <code>m:ss</code>로 입력할 수 있습니다. ±2~3초 오차는 규칙 학습에 문제되지 않습니다.
                <br />
                잘된 숏폼만 모으지 마세요 — 성과가 갈린 사례가 섞여야 “무엇이 차이를 만들었나”를 뽑을 수 있습니다.
                조회수는 게시 시점 때문에 그대로 비교하면 안 되므로, 같은 시기 채널 중앙값 대비 배수로 자동 환산합니다.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
