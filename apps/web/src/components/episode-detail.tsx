"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ChevronLeft, FileVideo, Search, Sparkles, Clapperboard, Send, Loader2 } from "lucide-react";
import { getMediaAnalysis, type MediaAnalysis } from "@/lib/data/api";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PipelineStrip } from "@/components/pipeline-strip";
import { RecommendationCard } from "@/components/recommendation-card";
import { PublishDialog } from "@/components/publish-dialog";
import { useAppData } from "@/lib/data/store";
import {
  ASPECT_RATIOS,
  CLIP_TYPES,
  DISTRIBUTION_CHANNELS,
  PIPELINE_STAGE_LABELS,
  targetAgeLabel,
} from "@/lib/constants";
import { formatDuration, formatTimecode } from "@/lib/utils";

type TabKey = "source" | "analyze" | "recommend" | "clips" | "distribute";
const TABS: { key: TabKey; label: string }[] = [
  { key: "source", label: "소스" },
  { key: "analyze", label: "분석" },
  { key: "recommend", label: "추천" },
  { key: "clips", label: "클립" },
  { key: "distribute", label: "배포" },
];

function isTab(v: string | undefined): v is TabKey {
  return !!v && TABS.some((t) => t.key === v);
}

export function EpisodeDetail({
  episodeId,
  initialTab,
}: {
  episodeId: string;
  initialTab?: string;
}) {
  const { getEpisode, recsForEpisode, clipsForEpisode } = useAppData();
  const [tab, setTabState] = useState<TabKey>(isTab(initialTab) ? initialTab : "recommend");
  const [publishClipId, setPublishClipId] = useState<string | null>(null);

  const episode = getEpisode(episodeId);

  function setTab(next: TabKey) {
    setTabState(next);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    window.history.replaceState(null, "", url.toString());
  }

  if (!episode) {
    return (
      <EmptyState
        icon={FileVideo}
        title="회차를 찾을 수 없습니다"
        description="삭제되었거나 잘못된 링크일 수 있습니다."
        action={
          <Link
            href="/programs"
            className="text-sm font-medium text-primary underline-offset-2 hover:underline"
          >
            콘텐츠로 돌아가기
          </Link>
        }
      />
    );
  }

  const recs = recsForEpisode(episodeId);
  const pendingRecs = recs.filter((r) => r.status === "pending").sort((a, b) => b.appeal - a.appeal);
  const clips = clipsForEpisode(episodeId);

  return (
    <>
      <Link
        href="/programs"
        className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-3.5" /> 콘텐츠
      </Link>

      <PageHeader
        title={episode.episodeNumber != null ? `${episode.programTitle} · ${episode.episodeNumber}화` : episode.programTitle}
        description={`방송 ${episode.broadDate} · ${targetAgeLabel(episode.targetAge)}`}
        actions={
          <StatusBadge tone={episode.pipeline.stageStatus}>
            {episode.pipeline.blockedReason ?? PIPELINE_STAGE_LABELS[episode.pipeline.stage]}
          </StatusBadge>
        }
      />

      {/* pipeline hub strip */}
      <Card className="mb-5 p-4">
        <div className="mb-2 text-xs font-semibold text-muted-foreground">파이프라인 진행</div>
        <PipelineStrip pipeline={episode.pipeline} />
        {episode.pipeline.note && (
          <div className="mt-2 text-xs text-muted-foreground">{episode.pipeline.note}</div>
        )}
        {episode.pipeline.blockedReason && (
          <div className="mt-2 text-xs text-status-error">⚠ {episode.pipeline.blockedReason}</div>
        )}
      </Card>

      {/* tabs */}
      <div className="mb-4 flex gap-1 border-b border-border">
        {TABS.map((t) => {
          const count =
            t.key === "recommend"
              ? pendingRecs.length
              : t.key === "clips"
                ? clips.length
                : undefined;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                tab === t.key
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
              {typeof count === "number" && count > 0 && (
                <span className="ml-1.5 text-xs text-muted-foreground">{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {tab === "source" && <SourceTab episodeId={episodeId} />}
      {tab === "analyze" && <AnalyzeTab episodeId={episodeId} />}

      {tab === "recommend" && (
        <div>
          {pendingRecs.length === 0 && recs.length === 0 && (
            <EmptyState
              icon={Sparkles}
              compact
              title="아직 추천이 생성되지 않았습니다"
              description="분석이 완료되면 추천이 자동으로 생성됩니다."
            />
          )}
          {pendingRecs.length > 0 && (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {pendingRecs.map((rec) => (
                <RecommendationCard key={rec.id} rec={rec} />
              ))}
            </div>
          )}
          {recs.some((r) => r.status !== "pending") && (
            <div className="mt-4">
              <div className="mb-2 text-xs font-semibold text-muted-foreground">처리됨</div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {recs
                  .filter((r) => r.status !== "pending")
                  .map((rec) => (
                    <RecommendationCard key={rec.id} rec={rec} />
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "clips" && (
        <div className="space-y-2">
          {clips.length === 0 ? (
            <EmptyState
              icon={Clapperboard}
              compact
              title="아직 이 회차의 클립이 없습니다"
              description="추천을 채택하면 클립이 여기에 생성됩니다."
            />
          ) : (
            clips.map((clip) => (
              <Card key={clip.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <div className="text-sm font-semibold">{clip.title}</div>
                  <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Badge>{CLIP_TYPES[clip.clipType]}</Badge>
                    <span>{ASPECT_RATIOS[clip.aspectRatio]}</span>
                    <span>· {formatDuration(clip.durationSec)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge
                    tone={clip.status === "encoding" ? "progress" : "done"}
                    pulse={clip.status === "encoding"}
                  >
                    {clip.status === "encoding" ? "인코딩 중" : clip.status === "ready" ? "준비 완료" : "배포됨"}
                  </StatusBadge>
                  <Link
                    href={`/editor/${clip.id}`}
                    className="text-xs font-medium text-primary underline-offset-2 hover:underline"
                  >
                    편집
                  </Link>
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {tab === "distribute" && (
        <div className="space-y-2">
          {clips.length === 0 ? (
            <EmptyState icon={Send} compact title="배포할 클립이 없습니다" />
          ) : (
            clips.map((clip) => (
              <Card key={clip.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="text-sm font-medium">{clip.title}</div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {clip.distributions.length === 0 && (
                    <span className="text-xs text-muted-foreground">미배포</span>
                  )}
                  {clip.distributions.map((d) => (
                    <StatusBadge
                      key={d.channel}
                      tone={d.status === "failed" ? "error" : d.status === "published" ? "done" : "warn"}
                    >
                      {DISTRIBUTION_CHANNELS[d.channel]} · {d.status === "failed" ? "실패" : d.status === "published" ? "게시" : "예약"}
                    </StatusBadge>
                  ))}
                  <Button size="xs" variant="outline" className="ml-1" onClick={() => setPublishClipId(clip.id)}>
                    채널별 배포
                  </Button>
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {publishClipId && (
        <PublishDialog clipIds={[publishClipId]} onClose={() => setPublishClipId(null)} />
      )}
    </>
  );
}

/** Source view — plays the real uploaded master when present, else the mock segments. */
function SourceTab({ episodeId }: { episodeId: string }) {
  const { mediaForEpisode, apiBase } = useAppData();
  const master = mediaForEpisode(episodeId, "master");

  if (master) {
    return (
      <Card className="overflow-hidden p-0">
        <div className="flex items-center gap-2 border-b border-border px-4 py-2.5 text-sm font-semibold">
          <FileVideo className="size-4" /> 업로드 마스터 · {master.filename}
        </div>
        <div className="bg-black">
          <video
            src={`${apiBase}${master.streamUrl}`}
            controls
            playsInline
            className="mx-auto max-h-[60vh] w-full object-contain"
          />
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1 px-4 py-3 text-xs text-muted-foreground">
          <span>해상도 <span className="tabular-nums text-foreground">{master.width}×{master.height}</span></span>
          <span>길이 <span className="tabular-nums text-foreground">{formatTimecode(master.durationSec)}</span></span>
          <span>코덱 <span className="text-foreground">{master.codec || "—"}</span></span>
          <span>오디오 <span className="text-foreground">{master.hasAudio ? "있음" : "없음"}</span></span>
          <span>용량 <span className="tabular-nums text-foreground">{(master.size / 1024 / 1024).toFixed(1)}MB</span></span>
        </div>
      </Card>
    );
  }

  const files = [
    { label: "마스터", segs: ["A", "B", "C"] },
    { label: "클린", segs: ["A", "B", "C"] },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {files.map((f) => (
        <Card key={f.label} className="p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <FileVideo className="size-4" /> {f.label} 세그먼트
          </div>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {f.segs.map((s) => (
              <li key={s} className="flex justify-between border-b border-border py-1 last:border-0">
                <span>MXF 세그먼트 {s}</span>
                <span className="tabular-nums">업로드됨</span>
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}

/** Real 3-Pass scene analysis from the content pipeline (content_analysis). */
function AnalyzeTab({ episodeId }: { episodeId: string }) {
  const { mediaForEpisode } = useAppData();
  const master = mediaForEpisode(episodeId, "master");
  const [analysis, setAnalysis] = useState<MediaAnalysis | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!master) return;
    let cancelled = false;
    const load = () =>
      getMediaAnalysis(master.id)
        .then((a) => !cancelled && setAnalysis(a))
        .catch(() => !cancelled && setAnalysis(null));
    setLoading(true);
    load().finally(() => !cancelled && setLoading(false));
    // While the worker is still analyzing, re-poll every 20s so it lights up on its own.
    const timer = setInterval(async () => {
      const a = await getMediaAnalysis(master.id).catch(() => null);
      if (!cancelled && a) {
        setAnalysis(a);
        if (a.status === "done" || a.status === "failed") clearInterval(timer);
      }
    }, 20_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [master?.id]);

  if (!master) {
    return (
      <EmptyState
        icon={Search}
        title="분석할 영상이 없어요"
        description="영상을 업로드하면 AI가 장면을 분석합니다."
      />
    );
  }

  const scenes = analysis?.data?.scenes ?? [];
  const status = analysis?.status;

  if (loading && !analysis) {
    return <Card className="p-8 text-center text-sm text-muted-foreground">분석 정보를 불러오는 중…</Card>;
  }
  if (status === "failed") {
    return (
      <EmptyState
        icon={Search}
        title="분석에 실패했어요"
        description={analysis?.error ?? "잠시 후 다시 시도해 주세요."}
      />
    );
  }
  if (!scenes.length) {
    return (
      <EmptyState
        icon={Loader2}
        title="AI가 장면을 분석하고 있어요"
        description="STT → 장면 분할 → 시각 채점 → 쇼츠 추천. 완료되면 이 탭과 추천 탭에 자동으로 표시됩니다."
      />
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5 text-sm font-semibold">
        <Search className="size-4" /> 장면 분석 · {scenes.length}개
      </div>
      <ul className="divide-y divide-border">
        {scenes.map((s, i) => {
          const names = s.on_screen_names ?? [];
          const desc = s.vision_reason || s.text || `장면 ${s.index ?? i + 1}`;
          return (
            <li key={s.index ?? i} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span className="tabular-nums text-xs text-muted-foreground">{formatTimecode(s.start)}</span>
              <span className="flex-1 truncate">{desc}</span>
              {typeof s.vision_score === "number" && (
                <span className="tabular-nums text-xs text-muted-foreground">{s.vision_score}</span>
              )}
              {names.length > 0 && (
                <span className="flex shrink-0 gap-1">
                  {names.slice(0, 3).map((t) => (
                    <Badge key={t} className="text-muted-foreground">
                      {t}
                    </Badge>
                  ))}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
