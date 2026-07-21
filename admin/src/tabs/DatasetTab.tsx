import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchLearnedProfile,
  fetchMatchExport,
  fetchMatchStatus,
  fetchOverview,
  getToken,
  runBulk,
  runBulkAll,
  runLearn,
  runSegment,
  type LearnedProfile,
  type LearnPair,
  type MatchStatus,
  type OverviewChannel,
} from "../api";
import { fmtDur, fmtLong, nfmt } from "../util";

/**
 * 매칭 작업의 산출물을 보는 화면.
 *
 * 위: 전 채널 현황 — 어디를 더 돌려야 하는지와 채널별 일괄 실행 버튼.
 * 아래: LEARN 데이터셋 — 매칭된 쌍과 연령보정 성과 티어. 학습에 넣기 전에 사람이
 * "이 데이터가 쓸 만한가"를 눈으로 확인하는 자리다. 티어가 한쪽으로 쏠려 있으면
 * (예: high만 잔뜩) 무엇이 차이를 만드는지 배울 수 없으므로 분포를 먼저 보여준다.
 */
export default function DatasetTab() {
  const [rows, setRows] = useState<OverviewChannel[]>([]);
  const [channelId, setChannelId] = useState("");
  const [pairs, setPairs] = useState<LearnPair[]>([]);
  const [tally, setTally] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [status, setStatus] = useState<MatchStatus | null>(null);
  const [learned, setLearned] = useState<LearnedProfile | null>(null);
  const token = getToken();

  // 선택 채널의 단계별 진행(매칭·설명·잡) + 학습된 규칙을 주기적으로 갱신.
  const refreshChannel = useCallback(async (id: string) => {
    if (!id) return;
    try {
      const [s, p] = await Promise.all([fetchMatchStatus(id), fetchLearnedProfile(id)]);
      setStatus(s);
      setLearned(p.profile);
    } catch {
      /* 부가 정보 — 실패해도 화면을 막지 않는다 */
    }
  }, []);

  useEffect(() => {
    void refreshChannel(channelId);
    const t = window.setInterval(() => void refreshChannel(channelId), 20_000);
    return () => window.clearInterval(t);
  }, [channelId, refreshChannel]);

  const loadOverview = useCallback(async () => {
    try {
      const r = await fetchOverview();
      setRows(r);
      setChannelId((cur) => cur || r.find((x) => x.matched > 0)?.channelId || r[0]?.channelId || "");
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
    }
  }, []);

  useEffect(() => {
    void loadOverview();
    const t = window.setInterval(() => void loadOverview(), 30_000);
    return () => window.clearInterval(t);
  }, [loadOverview]);

  useEffect(() => {
    if (!channelId) return;
    setLoading(true);
    fetchMatchExport(channelId)
      .then((r) => {
        setPairs(r.pairs);
        setTally(r.tally);
      })
      .catch((e: Error) => setMsg({ kind: "err", text: e.message }))
      .finally(() => setLoading(false));
  }, [channelId]);

  const totals = useMemo(() => {
    const t = { shorts: 0, matched: 0, auto: 0, remaining: 0, pending: 0, running: 0 };
    for (const r of rows) {
      t.shorts += r.shorts;
      t.matched += r.matched;
      t.auto += r.auto;
      t.remaining += r.remaining;
      t.pending += r.jobs.pending ?? 0;
      t.running += r.jobs.running ?? 0;
    }
    return t;
  }, [rows]);

  async function bulkOne(id: string) {
    setBusy(true);
    try {
      const r = await runBulk(id, 300);
      setMsg({ kind: "ok", text: `${r.queued}편 큐잉 (숏폼 ${r.shorts}개) · 예상 ${r.etaMinutes}분` });
      void loadOverview();
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function bulkAll() {
    if (!window.confirm("연동된 모든 채널에 자동 매칭을 겁니다. 진행할까요?")) return;
    setBusy(true);
    try {
      const r = await runBulkAll(300);
      setMsg({ kind: "ok", text: `채널 ${r.channels}곳 · ${r.queued}편 큐잉 · 예상 ${Math.round(r.etaMinutes / 60)}시간` });
      void loadOverview();
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function fillSegments() {
    setBusy(true);
    try {
      const r = await runSegment(channelId);
      setMsg({
        kind: "ok",
        text: r.missing === 0 ? "채울 구간이 없습니다 (이미 완료)" : `구간 설명 시작 — 미설명 ${r.missing}건 (롱폼 ${r.longforms ?? "?"}편)`,
      });
      void refreshChannel(channelId);
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function learnRules() {
    setBusy(true);
    try {
      await runLearn(channelId);
      setMsg({
        kind: "ok",
        text: "규칙 학습을 요청했습니다. 미설명 구간이 있으면 먼저 자동으로 채운 뒤 학습합니다 (몇 분~수십 분).",
      });
      void refreshChannel(channelId);
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  function downloadJson() {
    const blob = new Blob([JSON.stringify({ channelId, tally, pairs }, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `learn-dataset-${channelId}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const total = (tally.high ?? 0) + (tally.mid ?? 0) + (tally.low ?? 0);
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);

  return (
    <div>
      {/* ── 전 채널 현황 ─────────────────────────────────────────────── */}
      <div className="d-head">
        <b>채널 현황</b>
        <span className="m-msg">
          숏폼 {nfmt(totals.shorts)} · 매칭 <b className="m-picked">{nfmt(totals.matched)}</b> · 남음{" "}
          {nfmt(totals.remaining)}
          {totals.pending + totals.running > 0 && (
            <> · 잡 대기 {totals.pending} / 실행 {totals.running}</>
          )}
        </span>
        <button onClick={bulkAll} disabled={busy || !token} title="연동된 모든 채널을 한 번에">
          ⚡⚡ 전 채널 자동 매칭
        </button>
      </div>

      <div className="d-table">
        <div className="d-tr d-th">
          <span>채널</span><span>롱폼</span><span>숏폼</span><span>매칭</span>
          <span>미확인</span><span>남음</span><span>잡</span><span></span>
        </div>
        {rows.map((r) => (
          <div
            key={r.channelId}
            className={`d-tr${channelId === r.channelId ? " on" : ""}`}
            onClick={() => setChannelId(r.channelId)}
          >
            <span className="d-name">{r.channelName}</span>
            <span>{nfmt(r.longs)}</span>
            <span>{nfmt(r.shorts)}</span>
            <span className={r.matched ? "good" : ""}>{nfmt(r.matched)}</span>
            <span className={r.auto ? "warn" : ""}>{r.auto || "—"}</span>
            <span>{nfmt(r.remaining)}</span>
            <span>
              {r.jobs.running ? `▶${r.jobs.running} ` : ""}
              {r.jobs.pending ? `⏳${r.jobs.pending}` : ""}
              {!r.jobs.running && !r.jobs.pending ? "—" : ""}
            </span>
            <span>
              <button
                className="cap"
                disabled={busy || !token || r.remaining === 0}
                onClick={(e) => {
                  e.stopPropagation();
                  void bulkOne(r.channelId);
                }}
              >
                ⚡ 실행
              </button>
            </span>
          </div>
        ))}
      </div>

      {msg && <div className={`m-msg ${msg.kind}`} style={{ margin: "10px 0" }}>{msg.text}</div>}

      {/* ── 학습 파이프라인 (선택 채널) ────────────────────────────────── */}
      {channelId && (() => {
        const selName = rows.find((r) => r.channelId === channelId)?.channelName ?? channelId;
        const matched = status?.matched ?? 0;
        const described = status?.described ?? 0;
        const jobs = status?.jobs;
        const busyJobs = (jobs?.pending ?? 0) + (jobs?.running ?? 0) > 0;
        const step = (n: number, label: string, doneCount: number, totalCount: number, active: boolean) => {
          const done = totalCount > 0 && doneCount >= totalCount;
          return (
            <div className={`lp-step${done ? " done" : active ? " active" : ""}`}>
              <span className="lp-num">{done ? "✓" : n}</span>
              <div className="lp-body">
                <div className="lp-label">{label}</div>
                <div className="lp-sub">{totalCount > 0 ? `${doneCount} / ${totalCount}` : "—"}</div>
              </div>
            </div>
          );
        };
        return (
          <div style={{ marginTop: 22 }}>
            <div className="d-head">
              <b>🧠 학습 파이프라인 — {selName}</b>
              {busyJobs && <span className="m-msg">잡 실행중 {jobs?.running ?? 0} · 대기 {jobs?.pending ?? 0}</span>}
              {jobs?.failed ? <span className="m-msg err">실패 {jobs.failed}</span> : null}
            </div>

            <div className="lp-steps">
              {step(1, "① 매칭 (숏폼↔롱폼 구간)", matched, matched || 1, busyJobs)}
              {step(2, "② 구간 설명 (자막·장면)", described, matched, described < matched && busyJobs)}
              {step(3, "③ 규칙 학습", learned?.ready ? 1 : 0, 1, false)}
            </div>

            <div className="m-actions" style={{ marginTop: 10 }}>
              <button className="cap" disabled={busy || !token || matched === 0}
                onClick={() => bulkOne(channelId)} title="미매칭 숏폼을 롱폼에 자동 매칭">
                ⚡ 매칭 채우기
              </button>
              <button className="cap" disabled={busy || !token || described >= matched}
                onClick={fillSegments} title="매칭 구간의 자막·장면요약 생성">
                ✍️ 설명 채우기 ({matched - described} 남음)
              </button>
              <button className="save" disabled={busy || !token || matched === 0}
                onClick={learnRules} title="고성과 규칙 학습 → 채널 프로파일 저장">
                🧠 규칙 학습 실행
              </button>
              <span className="m-msg" style={{ marginLeft: 4 }}>
                버튼 하나로 됩니다 — 설명이 덜 됐으면 학습이 알아서 먼저 채웁니다.
              </span>
            </div>

            {/* 학습된 규칙 카드 */}
            {learned?.ready ? (
              <div className="lp-profile">
                <div className="lp-phead">
                  <b>학습된 채널 규칙</b>
                  <span className={`lp-conf ${(learned.confidence ?? 0) >= 0.7 ? "hi" : "mid"}`}>
                    신뢰도 {Math.round((learned.confidence ?? 0) * 100)}%
                  </span>
                  {learned.sample && (
                    <span className="m-msg">표본 high {learned.sample.high} / low {learned.sample.low}</span>
                  )}
                  {(learned.confidence ?? 0) < 0.7 && (
                    <span className="m-msg warn">· 표본 더 쌓이면 정확해집니다</span>
                  )}
                </div>
                <div className="lp-cols">
                  <div>
                    <div className="lp-ctitle good">✓ 고성과 패턴</div>
                    <ul>{(learned.winning_patterns ?? []).map((w, i) => (
                      <li key={i}><b>{w.pattern}</b>{w.why ? <span className="dim"> — {w.why}</span> : null}</li>
                    ))}</ul>
                  </div>
                  <div>
                    <div className="lp-ctitle bad">✗ 피해야 할 패턴</div>
                    <ul>{(learned.avoid_patterns ?? []).map((a, i) => <li key={i}>{a}</li>)}</ul>
                    {learned.optimal_length_sec && (
                      <div className="lp-len">최적 길이 <b>{learned.optimal_length_sec.min}~{learned.optimal_length_sec.max}초</b></div>
                    )}
                  </div>
                </div>
                <div className="m-hint">
                  이 규칙은 저장돼, 이 채널 영상을 분석할 때 추천 엔진에 자동으로 반영됩니다.
                </div>
              </div>
            ) : learned?.message ? (
              <div className="m-msg" style={{ marginTop: 8 }}>아직 학습 전: {learned.message}</div>
            ) : null}
          </div>
        );
      })()}

      {/* ── LEARN 데이터셋 ───────────────────────────────────────────── */}
      <div className="d-head" style={{ marginTop: 22 }}>
        <b>LEARN 데이터셋</b>
        <span className="m-msg">쌍 {pairs.length}건</span>
        <button onClick={downloadJson} disabled={!pairs.length}>⬇ JSON 내보내기</button>
      </div>

      {total > 0 && (
        <>
          <div className="d-bar">
            <span className="hi" style={{ width: `${pct(tally.high ?? 0)}%` }} />
            <span className="mi" style={{ width: `${pct(tally.mid ?? 0)}%` }} />
            <span className="lo" style={{ width: `${pct(tally.low ?? 0)}%` }} />
          </div>
          <div className="d-legend">
            <span><i className="hi" /> high {tally.high ?? 0} (2배 이상)</span>
            <span><i className="mi" /> mid {tally.mid ?? 0}</span>
            <span><i className="lo" /> low {tally.low ?? 0} (0.7배 미만)</span>
            <span className="d-note">
              성과는 절대 조회수가 아니라 <b>같은 시기(±90일) 채널 숏폼 중앙값 대비 배수</b>다.
              한쪽으로 쏠리면 무엇이 차이를 만드는지 학습할 수 없다.
            </span>
          </div>
        </>
      )}

      {loading ? (
        <div className="empty-note">불러오는 중…</div>
      ) : !pairs.length ? (
        <div className="empty-note">
          이 채널은 아직 매칭된 쌍이 없습니다. 위에서 ⚡ 실행을 눌러 자동 매칭을 걸어보세요.
        </div>
      ) : (
        <div className="d-table">
          <div className="d-tr d-pair d-th">
            <span>티어</span><span>배수</span><span>숏폼</span><span>조회</span>
            <span>구간</span><span>길이</span><span>출처 롱폼</span>
          </div>
          {[...pairs]
            .sort((a, b) => b.performance.ratio - a.performance.ratio)
            .map((p) => (
              <div key={p.pair_id} className="d-tr d-pair">
                <span className={`tier ${p.performance.tier}`}>{p.performance.tier}</span>
                <span>×{p.performance.ratio.toFixed(2)}</span>
                <span className="d-name">{p.short.title ?? p.pair_id}</span>
                <span>{nfmt(p.short.views)}</span>
                <span className="mono">
                  {fmtLong(p.source.segStart)}~{fmtLong(p.source.segEnd)}
                </span>
                <span>{fmtDur(p.source.segLenSec)}</span>
                <span className="d-name dim">{p.source.title ?? p.source.longVideoId}</span>
              </div>
            ))}
        </div>
      )}

      {pairs.length > 0 && (
        <div className="m-hint">
          다음 단계: 각 쌍의 <code>transcript_slice</code>·<code>scene_summary</code>(롱폼 구간의 자막·장면)를
          채우면 LEARN 프롬프트에 그대로 넣을 수 있습니다. 지금은 비어 있습니다.
        </div>
      )}
    </div>
  );
}
