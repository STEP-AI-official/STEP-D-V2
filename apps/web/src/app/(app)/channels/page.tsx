"use client";

import { useEffect, useState, useCallback } from "react";
import { RefreshCw, TrendingUp, Eye, ThumbsUp, MessageCircle, Play, AlertCircle, Clock, Percent, Share2, UserPlus } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { StatTile } from "@/components/ui/stat-tile";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import {
  fetchYouTubeChannels,
  fetchChannelVideos,
  fetchChannelTrends,
  fetchVideoTrend,
  fetchVideoAnalytics,
  syncChannelVideos,
  type YouTubeChannelInfo,
  type VideoAnalytics,
} from "@/lib/data/api";
import type {
  YouTubeChannelVideo,
  ChannelTrendSummary,
  DailyTrend,
  VideoTrend,
} from "@/lib/types";

function fmt(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}만`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}천`;
  return String(n);
}

function fmtDate(ts: string | number): string {
  const d = new Date(ts);
  return d.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

/** Seconds → m:ss (average view duration). */
function fmtDur(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** YouTube Analytics traffic-source codes → Korean labels. */
const TRAFFIC_LABELS: Record<string, string> = {
  YT_SEARCH: "YouTube 검색",
  YT_RELATED: "추천 영상",
  YT_CHANNEL: "채널 페이지",
  SUBSCRIBER: "구독 피드",
  SHORTS: "Shorts 피드",
  PLAYLIST: "재생목록",
  EXT_URL: "외부 링크",
  NO_LINK_OTHER: "직접/기타",
  NO_LINK_EMBEDDED: "임베드",
  NOTIFICATION: "알림",
  ADVERTISING: "광고",
};
const trafficLabel = (s: string) => TRAFFIC_LABELS[s] ?? s;

export default function ChannelTrendsPage() {
  const [channels, setChannels] = useState<YouTubeChannelInfo[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [videos, setVideos] = useState<YouTubeChannelVideo[]>([]);
  const [trend, setTrend] = useState<DailyTrend[]>([]);
  const [summary, setSummary] = useState<ChannelTrendSummary | null>(null);
  const [videoTrend, setVideoTrend] = useState<VideoTrend | null>(null);
  const [videoAnalytics, setVideoAnalytics] = useState<VideoAnalytics | null>(null);
  const [loadingVideos, setLoadingVideos] = useState(false);
  const [loadingTrend, setLoadingTrend] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchYouTubeChannels()
      .then(setChannels)
      .catch((e) => setError(e.message));
  }, []);

  const loadChannelData = useCallback(async (channelId: string) => {
    setLoadingVideos(true);
    setLoadingTrend(true);
    setError(null);
    try {
      const [v, t] = await Promise.all([
        fetchChannelVideos(channelId),
        fetchChannelTrends(channelId, 30),
      ]);
      setVideos(v.videos);
      setTrend(t.trend);
      setSummary(t.summary);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoadingVideos(false);
      setLoadingTrend(false);
    }
  }, []);

  useEffect(() => {
    if (selectedId) loadChannelData(selectedId);
  }, [selectedId, loadChannelData]);

  const handleSync = async () => {
    if (!selectedId) return;
    setSyncing(true);
    setError(null);
    try {
      const res = await syncChannelVideos(selectedId);
      await loadChannelData(selectedId);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSyncing(false);
    }
  };

  const handleVideoClick = async (videoId: string) => {
    setVideoTrend(null);
    setVideoAnalytics(null);
    setError(null);
    // Independent so one failing (or empty) never blanks the other.
    const [vt, va] = await Promise.all([
      fetchVideoTrend(videoId, 30).catch(() => null),
      fetchVideoAnalytics(videoId).catch(() => null),
    ]);
    setVideoTrend(vt);
    setVideoAnalytics(va);
    if (!vt && !va) setError("영상 데이터를 불러오지 못했습니다.");
  };

  const selectedChannel = channels.find((c) => c.channelId === selectedId);

  return (
    <>
      <PageHeader
        title="채널 트렌드"
        description="YouTube 채널별 영상 조회수 추세와 성과 분석"
      />

      {/* Channel selector + sync */}
      <div className="mb-4 flex items-center gap-3">
        <select
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
          value={selectedId}
          onChange={(e) => { setSelectedId(e.target.value); setVideoTrend(null); }}
        >
          <option value="">— 채널 선택 —</option>
          {channels.map((ch) => (
            <option key={ch.channelId} value={ch.channelId}>
              {ch.channelName}
            </option>
          ))}
        </select>
        {selectedId && (
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
          >
            <RefreshCw className={`size-4 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "동기화 중..." : "YouTube 동기화"}
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-status-error/10 p-3 text-sm text-status-error">
          <AlertCircle className="size-4 shrink-0" />
          {error}
        </div>
      )}

      {selectedId && summary && (
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            icon={Eye}
            label="총 조회수"
            value={fmt(summary.totalViews)}
          />
          <StatTile
            icon={Play}
            label="영상 수"
            value={String(summary.videoCount)}
          />
          <StatTile
            icon={TrendingUp}
            tone={summary.growthPercent > 0 ? "done" : summary.growthPercent < 0 ? "error" : "idle"}
            label="최근 30일 성장률"
            value={`${summary.growthPercent > 0 ? "+" : ""}${summary.growthPercent.toFixed(1)}%`}
            sub="전기 대비"
          />
          <StatTile
            icon={Eye}
            tone="progress"
            label="최근 30일 조회수"
            value={fmt(summary.recentPeriodViews)}
            sub={`이전: ${fmt(summary.earlierPeriodViews)}`}
          />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Main chart */}
        <Card className="p-4 lg:col-span-2">
          <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
            <TrendingUp className="size-4 text-status-progress" />
            일별 총 조회수 추세 (30일)
            {loadingTrend && <span className="ml-auto animate-pulse text-xs text-muted-foreground">로딩 중...</span>}
          </h3>
          {trend.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              데이터가 없습니다. YouTube 동기화를 먼저 실행해주세요.
            </p>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(d: string) => d.slice(5)}
                    stroke="var(--color-muted-foreground)"
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={fmt}
                    stroke="var(--color-muted-foreground)"
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--color-background)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(value, name) => {
                      const labels: Record<string, string> = {
                        totalViews: "조회수",
                        totalLikes: "좋아요",
                      };
                      const key = String(name);
                      return [fmt(Number(value ?? 0)), labels[key] ?? key];
                    }}
                    labelFormatter={(label) => {
                      const d = String(label);
                      return `${d.slice(0, 4)}년 ${d.slice(5, 7)}월 ${d.slice(8)}일`;
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="totalViews"
                    stroke="var(--color-status-progress)"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        {/* Video list */}
        <Card className="flex flex-col overflow-hidden p-0">
          <div className="border-b border-border p-3">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold">
              <Play className="size-4" />
              영상 목록
              {videos.length > 0 && (
                <span className="ml-auto text-xs font-normal text-muted-foreground">
                  {videos.length}개
                </span>
              )}
            </h3>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loadingVideos ? (
              <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                <RefreshCw className="mr-2 size-4 animate-spin" />
                불러오는 중...
              </div>
            ) : videos.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {selectedId ? "동기화 후 영상이 표시됩니다." : "채널을 선택해주세요."}
              </p>
            ) : (
              <div className="divide-y divide-border">
                {videos.map((v) => (
                  <button
                    key={v.videoId}
                    onClick={() => handleVideoClick(v.videoId)}
                    className={`flex w-full gap-2 p-3 text-left text-xs transition hover:bg-muted/50 ${
                      videoTrend?.video.videoId === v.videoId ? "bg-muted/30" : ""
                    }`}
                  >
                    {v.thumbnail ? (
                      <img
                        src={v.thumbnail}
                        alt=""
                        className="mt-0.5 h-12 w-16 shrink-0 rounded object-cover"
                      />
                    ) : (
                      <div className="mt-0.5 flex h-12 w-16 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground">
                        <Play className="size-4" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="mb-1 truncate font-medium">{v.title}</p>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-muted-foreground">
                        <span className="flex items-center gap-0.5">
                          <Eye className="size-3" /> {fmt(v.viewCount)}
                        </span>
                        <span className="flex items-center gap-0.5">
                          <ThumbsUp className="size-3" /> {fmt(v.likeCount)}
                        </span>
                        <span className="flex items-center gap-0.5">
                          <MessageCircle className="size-3" /> {fmt(v.commentCount)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        {fmtDate(v.publishedAt)}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Per-video detail: views trend + rich analytics (avg duration/%, traffic, retention, comments) */}
      {(videoTrend || videoAnalytics) && (
        <Card className="mt-4 p-4">
          <div className="mb-3 flex items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold">
                {videoTrend?.video.title ?? videoAnalytics?.video.title}
              </h3>
              <p className="text-xs text-muted-foreground">
                {(() => {
                  const v = videoTrend?.video ?? videoAnalytics?.video;
                  return v ? `조회수 ${fmt(v.viewCount)} · 좋아요 ${fmt(v.likeCount)} · 댓글 ${fmt(v.commentCount)}` : "";
                })()}
              </p>
            </div>
            <button
              onClick={() => {
                setVideoTrend(null);
                setVideoAnalytics(null);
              }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              닫기
            </button>
          </div>

          {/* engagement summary (YouTube Analytics) */}
          {videoAnalytics &&
            (videoAnalytics.summary.averageViewDuration != null ||
              videoAnalytics.summary.averageViewPercentage != null ||
              videoAnalytics.summary.shares != null ||
              videoAnalytics.summary.subscribersGained != null) && (
              <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <StatTile
                  icon={Clock}
                  label="평균 시청 시간"
                  value={
                    videoAnalytics.summary.averageViewDuration != null
                      ? fmtDur(videoAnalytics.summary.averageViewDuration)
                      : "—"
                  }
                />
                <StatTile
                  icon={Percent}
                  tone={(videoAnalytics.summary.averageViewPercentage ?? 0) >= 50 ? "done" : "progress"}
                  label="평균 시청률"
                  value={
                    videoAnalytics.summary.averageViewPercentage != null
                      ? `${videoAnalytics.summary.averageViewPercentage.toFixed(0)}%`
                      : "—"
                  }
                />
                <StatTile icon={Share2} label="공유" value={fmt(videoAnalytics.summary.shares ?? 0)} />
                <StatTile
                  icon={UserPlus}
                  tone={(videoAnalytics.summary.subscribersGained ?? 0) > 0 ? "done" : "idle"}
                  label="구독 전환"
                  value={`+${fmt(videoAnalytics.summary.subscribersGained ?? 0)}`}
                />
              </div>
            )}

          {/* daily views trend */}
          {videoTrend && videoTrend.trend.length > 0 ? (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={videoTrend.trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(d: string) => d.slice(5)}
                    stroke="var(--color-muted-foreground)"
                  />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={fmt} stroke="var(--color-muted-foreground)" />
                  <Tooltip
                    contentStyle={{
                      background: "var(--color-background)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(value, name) => {
                      const labels: Record<string, string> = { views: "조회수", likes: "좋아요", comments: "댓글" };
                      const key = String(name);
                      return [fmt(Number(value ?? 0)), labels[key] ?? key];
                    }}
                  />
                  <Line type="monotone" dataKey="views" stroke="var(--color-status-progress)" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="likes" stroke="var(--color-status-done)" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="comments" stroke="var(--color-status-idle)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : videoTrend ? (
            <p className="py-3 text-center text-xs text-muted-foreground">
              일별 추세는 다음 동기화부터 쌓입니다.
            </p>
          ) : null}

          {/* traffic sources */}
          {videoAnalytics && videoAnalytics.trafficSources.length > 0 && (
            <div className="mt-4">
              <h4 className="mb-2 text-xs font-semibold text-muted-foreground">유입 경로</h4>
              <div className="space-y-1.5">
                {(() => {
                  const max = Math.max(...videoAnalytics.trafficSources.map((t) => t.views), 1);
                  return [...videoAnalytics.trafficSources]
                    .sort((a, b) => b.views - a.views)
                    .map((t) => (
                      <div key={t.source} className="flex items-center gap-2 text-xs">
                        <span className="w-20 shrink-0 text-muted-foreground">{trafficLabel(t.source)}</span>
                        <div className="h-3 flex-1 overflow-hidden rounded bg-muted">
                          <div className="h-full rounded bg-status-progress" style={{ width: `${(t.views / max) * 100}%` }} />
                        </div>
                        <span className="w-8 shrink-0 text-right tabular-nums">{fmt(t.views)}</span>
                      </div>
                    ));
                })()}
              </div>
            </div>
          )}

          {/* audience demographics */}
          {videoAnalytics && videoAnalytics.demographics.length > 0 && (
            <div className="mt-4">
              <h4 className="mb-2 text-xs font-semibold text-muted-foreground">시청자 층</h4>
              <div className="flex flex-wrap gap-1.5">
                {videoAnalytics.demographics.slice(0, 8).map((d, i) => (
                  <span key={i} className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                    {d.gender === "male" ? "남" : d.gender === "female" ? "여" : d.gender ?? ""}{" "}
                    {d.ageGroup?.replace("age", "") ?? ""} · {(d.percentage ?? 0).toFixed(0)}%
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* retention curve */}
          {videoAnalytics && videoAnalytics.retention.length > 0 && (
            <div className="mt-4">
              <h4 className="mb-2 text-xs font-semibold text-muted-foreground">시청 지속률</h4>
              <div className="h-32">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={videoAnalytics.retention}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis
                      dataKey="ratio"
                      tick={{ fontSize: 10 }}
                      tickFormatter={(v) => `${Math.round(Number(v) * 100)}%`}
                      stroke="var(--color-muted-foreground)"
                    />
                    <YAxis
                      tick={{ fontSize: 10 }}
                      tickFormatter={(v) => `${Math.round(Number(v) * 100)}%`}
                      stroke="var(--color-muted-foreground)"
                    />
                    <Line type="monotone" dataKey="watchRatio" stroke="var(--color-status-progress)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* top comments */}
          {videoAnalytics && videoAnalytics.comments.length > 0 && (
            <div className="mt-4">
              <h4 className="mb-2 text-xs font-semibold text-muted-foreground">인기 댓글</h4>
              <div className="space-y-2">
                {videoAnalytics.comments.slice(0, 5).map((cm, i) => (
                  <div key={i} className="rounded-md border border-border p-2 text-xs">
                    <div className="mb-0.5 flex items-center gap-2 text-muted-foreground">
                      <span className="font-medium text-foreground">{cm.author}</span>
                      <span className="flex items-center gap-0.5">
                        <ThumbsUp className="size-3" /> {fmt(cm.likeCount)}
                      </span>
                    </div>
                    <p className="line-clamp-2">{cm.text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {videoAnalytics?.fetchedAt && (
            <p className="mt-3 text-[10px] text-muted-foreground">
              애널리틱스 수집 {fmtDate(Number(videoAnalytics.fetchedAt))} · 수익 지표는 미포함(수익화·별도 권한 필요)
            </p>
          )}
        </Card>
      )}
    </>
  );
}