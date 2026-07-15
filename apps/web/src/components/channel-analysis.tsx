"use client";

import { useEffect, useState } from "react";
import { BarChart3, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  triggerChannelAnalysis,
  fetchChannelDaily,
  type ChannelDailyRow,
} from "@/lib/data/api";

/** Compact analysis panel for one channel: a re-run button + what's been collected. */
export function ChannelAnalysis({ channelId }: { channelId: string }) {
  const [rows, setRows] = useState<ChannelDailyRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = async () => {
    setRows(await fetchChannelDaily(channelId, 90));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  const handleAnalyze = async () => {
    setBusy(true);
    setNote(null);
    try {
      const r = await triggerChannelAnalysis(channelId);
      setNote(r.queued ? "분석을 요청했습니다 · 백그라운드에서 처리됩니다" : "이미 분석이 진행 중입니다");
      // The worker runs async; re-pull stored data a bit later so new days show up.
      setTimeout(load, 8000);
    } catch {
      setNote("분석 요청에 실패했습니다");
    } finally {
      setBusy(false);
    }
  };

  const summary = rows && rows.length > 0 ? summarize(rows) : null;

  return (
    <div className="mt-3 border-t border-zinc-800 pt-3">
      <div className="flex items-center justify-between gap-3">
        {summary ? (
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
            <Metric label="조회수(90일)" value={fmt(summary.views)} />
            <Metric label="시청시간(시간)" value={fmt(Math.round(summary.watchMinutes / 60))} />
            <Metric label="구독자 순증" value={signed(summary.netSubs)} />
            <Metric label="수집일수" value={`${summary.days}일`} />
          </div>
        ) : rows === null ? (
          <span className="text-xs text-zinc-600">불러오는 중…</span>
        ) : (
          <span className="text-xs text-zinc-600 flex items-center gap-1.5">
            <BarChart3 className="w-3.5 h-3.5" />
            아직 수집된 분석 데이터가 없습니다
          </span>
        )}

        <Button
          onClick={handleAnalyze}
          disabled={busy}
          className="shrink-0 bg-zinc-800 text-zinc-200 hover:bg-zinc-700 text-xs h-8 px-3"
        >
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${busy ? "animate-spin" : ""}`} />
          {busy ? "요청 중…" : "분석"}
        </Button>
      </div>

      {note && <div className="mt-2 text-xs text-zinc-400">{note}</div>}
    </div>
  );
}

function summarize(rows: ChannelDailyRow[]) {
  let views = 0;
  let watchMinutes = 0;
  let netSubs = 0;
  for (const r of rows) {
    views += r.views;
    watchMinutes += r.estimatedMinutesWatched;
    netSubs += r.subscribersGained - r.subscribersLost;
  }
  return { views, watchMinutes, netSubs, days: rows.length };
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <span>
      <span className="text-zinc-500">{label} </span>
      <span className="font-medium text-zinc-200">{value}</span>
    </span>
  );
}

function fmt(n: number): string {
  return n.toLocaleString("ko-KR");
}

function signed(n: number): string {
  return (n > 0 ? "+" : "") + n.toLocaleString("ko-KR");
}
