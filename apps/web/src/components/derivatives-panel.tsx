"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Sparkles,
  Clapperboard,
  Search,
  Send,
  Layers,
  FileText,
  Flame,
  Loader2,
  BookOpen,
  Users,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { RecommendationCard } from "@/components/recommendation-card";
import { NarrativeView } from "./narrative-view";
import { CastView } from "./cast-view";
import { PublishDialog } from "@/components/publish-dialog";
import { useAppData } from "@/lib/data/store";
import {
  type AnalysisScene,
  type EpisodeCastResponse,
  type MediaFaces,
  fetchEpisodeCast,
  getMediaFaces,
  patchMediaFacesMapping,
  reanalyzeMedia,
} from "@/lib/data/api";
import { useMediaAnalysisPoll } from "@/lib/data/use-media-analysis";
import { useToast } from "@/components/ui/toast";
import {
  ASPECT_RATIOS,
  CLIP_TYPES,
  DISTRIBUTION_CHANNELS,
} from "@/lib/constants";
import { cn, formatDuration, formatTimecode } from "@/lib/utils";

type PanelTab = "recommend" | "clips" | "analyze" | "distribute";

const TABS: { key: PanelTab; label: string; icon: typeof Sparkles }[] = [
  { key: "recommend", label: "추천", icon: Sparkles },
  { key: "clips", label: "클립", icon: Clapperboard },
  { key: "analyze", label: "분석", icon: Search },
  { key: "distribute", label: "배포", icon: Send },
];

function isPanelTab(v: string | undefined): v is PanelTab {
  return !!v && TABS.some((t) => t.key === v);
}

/**
 * Right panel — derivatives overview in a tabbed layout.
 * Shows AI recommendations, finalized clips, detailed analysis, and distribution status.
 */
export function DerivativesPanel({
  episodeId,
  initialTab,
}: {
  episodeId: string;
  initialTab?: string;
}) {
  const { recsForEpisode, clipsForEpisode } = useAppData();
  const [tab, setTabState] = useState<PanelTab>(isPanelTab(initialTab) ? initialTab : "recommend");
  const [publishClipId, setPublishClipId] = useState<string | null>(null);

  function setTab(next: PanelTab) {
    setTabState(next);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    window.history.replaceState(null, "", url.toString());
  }

  const recs = recsForEpisode(episodeId);
  const pendingRecs = recs.filter((r) => r.status === "pending").sort((a, b) => b.appeal - a.appeal);
  const clips = clipsForEpisode(episodeId);

  return (
    <div className="flex h-full flex-col">
      {/* Tab bar — Review OS underline tabs */}
      <div className="mb-4 flex gap-1 border-b border-border">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
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
                "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-[13px] font-semibold transition-colors",
                active
                  ? "border-brand text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-3.5" />
              {t.label}
              {typeof count === "number" && count > 0 && (
                <span className="ml-0.5 rounded-md bg-brand/15 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-brand">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Panel content */}
      <div className="flex-1 overflow-y-auto pr-1">
        {tab === "recommend" && <RecommendTab recs={recs} pendingRecs={pendingRecs} />}
        {tab === "clips" && <ClipsTab clips={clips} />}
        {tab === "analyze" && <AnalyzeTab episodeId={episodeId} />}
        {tab === "distribute" && (
          <DistributeTab clips={clips} onPublish={setPublishClipId} />
        )}
      </div>

      {publishClipId && (
        <PublishDialog clipIds={[publishClipId]} onClose={() => setPublishClipId(null)} />
      )}
    </div>
  );
}

/* ── Sub-tabs ── */

function RecommendTab({
  recs,
  pendingRecs,
}: {
  recs: ReturnType<typeof useAppData>["recsForEpisode"] extends (...a: any[]) => infer R ? R : never;
  pendingRecs: ReturnType<typeof useAppData>["recsForEpisode"] extends (...a: any[]) => infer R ? R : never;
}) {
  if (pendingRecs.length === 0 && recs.length === 0) {
    return (
      <EmptyState
        icon={Sparkles}
        compact
        title="아직 추천이 없습니다"
        description="분석 완료 후 자동 생성됩니다."
      />
    );
  }

  return (
    <div className="space-y-4">
      {pendingRecs.length > 0 && (
        <div>
          <div className="mb-2 text-[11px] font-semibold text-muted-foreground">
            🔥 신규 추천 ({pendingRecs.length})
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {pendingRecs.map((rec) => (
              <RecommendationCard key={rec.id} rec={rec} />
            ))}
          </div>
        </div>
      )}
      {recs.some((r) => r.status !== "pending") && (
        <div>
          <div className="mb-2 text-[11px] font-semibold text-muted-foreground">
            처리 완료
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {recs
              .filter((r) => r.status !== "pending")
              .map((rec) => (
                <RecommendationCard key={rec.id} rec={rec} />
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ClipsTab({
  clips,
}: {
  clips: ReturnType<typeof useAppData>["clipsForEpisode"] extends (...a: any[]) => infer R ? R : never;
}) {
  if (clips.length === 0) {
    return (
      <EmptyState
        icon={Clapperboard}
        compact
        title="아직 클립이 없습니다"
        description="추천을 채택하면 생성됩니다."
      />
    );
  }

  return (
    <div className="space-y-2">
      {clips.map((clip) => (
        <Card key={clip.id} className="p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold leading-snug">{clip.title}</div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                <Badge>{CLIP_TYPES[clip.clipType]}</Badge>
                <span>{ASPECT_RATIOS[clip.aspectRatio]}</span>
                <span>· {formatDuration(clip.durationSec)}</span>
              </div>
            </div>
            <StatusBadge
              tone={clip.status === "encoding" ? "progress" : "done"}
              pulse={clip.status === "encoding"}
            >
              {clip.status === "encoding" ? "인코딩" : clip.status === "ready" ? "준비" : "배포"}
            </StatusBadge>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <Link
              href={`/editor/${clip.id}`}
              className="text-xs font-medium text-primary underline-offset-2 hover:underline"
            >
              편집기 열기
            </Link>
          </div>
        </Card>
      ))}
    </div>
  );
}

/** Vision score → color class */
function scoreColorClass(v: number): string {
  return v >= 70 ? "text-status-done" : v >= 45 ? "text-status-warn" : "text-muted-foreground";
}

type AnalyzeView = "shorts" | "scenes" | "script" | "narrative" | "cast";

function AnalyzeTab({ episodeId }: { episodeId: string }) {
  const app = useAppData();
  const { mediaForEpisode, episodes, programs } = app;
  const { toast } = useToast();
  const master = mediaForEpisode(episodeId, "master");
  const { analysis, loading } = useMediaAnalysisPoll(master?.id);
  const [view, setView] = useState<AnalyzeView>("shorts");
  const [retrying, setRetrying] = useState<false | "fast" | "full">(false);
  const [castData, setCastData] = useState<EpisodeCastResponse | null>(null);
  const [faces, setFaces] = useState<MediaFaces | null>(null);
  const [pendingMap, setPendingMap] = useState<Record<string, string>>({});
  const [savingMap, setSavingMap] = useState(false);

  const masterId = master?.id;
  useEffect(() => {
    if (!masterId) return;
    let cancelled = false;
    fetchEpisodeCast(masterId).then((d) => { if (!cancelled) setCastData(d); }).catch(() => {});
    return () => { cancelled = true; };
  }, [masterId]);

  // faces.json 20초 폴링 — 분석 진행 중에도 완성되는 대로 나타남
  useEffect(() => {
    if (!masterId) return;
    let alive = true;
    const load = () => { getMediaFaces(masterId).then((f) => { if (alive) setFaces(f); }).catch(() => {}); };
    load();
    const t = window.setInterval(load, 20000);
    return () => { alive = false; clearInterval(t); };
  }, [masterId]);

  // 프로그램 cast — 매핑 dropdown 옵션 소스
  const episode = episodes.find((e) => e.id === episodeId);
  const program = episode ? programs.find((p) => p.id === episode.programId) : null;
  const programCast = program?.cast ?? [];

  async function retryAnalysis(fast: boolean) {
    if (!master || retrying) return;
    setRetrying(fast ? "fast" : "full");
    try {
      await reanalyzeMedia(master.id, fast);
      toast({ title: `${fast ? "빠른" : "정밀"} 재분석 시작`, description: "AI 분석을 다시 큐에 넣었습니다. 진행률은 위 파이프라인에서 확인하세요.", tone: "progress" });
    } catch (e) {
      toast({ title: "재분석 요청 실패", description: e instanceof Error ? e.message : "다시 시도해 주세요.", tone: "error" });
    } finally {
      setRetrying(false);
    }
  }

  if (!master) {
    return <EmptyState icon={Search} compact title="분석할 영상이 없어요" />;
  }
  if (loading && !analysis) {
    return <Card className="p-6 text-center text-sm text-muted-foreground">분석 정보를 불러오는 중…</Card>;
  }
  if (analysis?.status === "failed") {
    return (
      <EmptyState
        icon={Search}
        compact
        title="분석 실패"
        description={analysis.error ?? "재시도 필요"}
        action={
          <div className="flex gap-1.5">
            <Button size="sm" variant="outline" onClick={() => retryAnalysis(true)} disabled={!!retrying}>
              {retrying === "fast" ? "요청 중…" : "빠른 재분석"}
            </Button>
            <Button size="sm" onClick={() => retryAnalysis(false)} disabled={!!retrying}>
              {retrying === "full" ? "요청 중…" : "정밀 재분석"}
            </Button>
          </div>
        }
      />
    );
  }

  const data = analysis?.data;
  const scenes = data?.scenes ?? [];
  const shorts = [...(data?.shorts ?? [])].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
  const transcript = (data?.transcript ?? []).filter((s) => (s.text ?? "").trim());
  const narrative = data?.narrative;

  if (!scenes.length && !shorts.length && !transcript.length && !narrative) {
    return (
      <EmptyState
        icon={Loader2}
        compact
        title="분석 진행 중…"
        description="STT → 장면 분할 → Vision 채점"
      />
    );
  }

  const faceClusters = faces?.clusters ?? {};
  const faceCount = Object.keys(faceClusters).length;
  const subTabs: { key: AnalyzeView; label: string; icon: typeof Flame; count: number }[] = [
    { key: "shorts", label: "쇼츠 추천", icon: Flame, count: shorts.length },
    { key: "scenes", label: "장면", icon: Layers, count: scenes.length },
    { key: "script", label: "자막", icon: FileText, count: transcript.length },
    { key: "narrative", label: "서사", icon: BookOpen, count: narrative?.segments?.length ?? 0 },
    { key: "cast", label: "인물", icon: Users, count: faceCount || (castData?.people?.length ?? 0) },
  ];

  return (
    <div className="space-y-2">
      {/* 재분석 바 — cast 바꾼 뒤 트리거하면 지문 바뀐 스테이지만 재실행 */}
      <div className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/30 px-2.5 py-1.5">
        <span className="flex-1 text-[11px] text-muted-foreground">파이프라인 재실행 · cast·프로파일 바꾼 뒤 트리거</span>
        <Button size="xs" variant="outline" onClick={() => retryAnalysis(true)} disabled={!!retrying}>
          {retrying === "fast" ? "요청 중…" : "빠른 재분석"}
        </Button>
        <Button size="xs" onClick={() => retryAnalysis(false)} disabled={!!retrying}>
          {retrying === "full" ? "요청 중…" : "정밀 재분석"}
        </Button>
      </div>
      <div className="flex rounded-lg border border-border p-0.5">
        {subTabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setView(t.key)}
              className={cn(
                "flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1.5 text-[11px] font-medium",
                view === t.key ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-3" /> {t.label} · {t.count}
            </button>
          );
        })}
      </div>

      {view === "shorts" && (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-border">
            {shorts.map((s, i) => (
              <li key={i} className="flex gap-3 px-3 py-2.5">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md bg-status-warn/10 text-[11px] font-bold text-status-warn">
                  #{s.rank ?? i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold">{s.title || "제목 없음"}</div>
                  <div className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
                    {formatTimecode(s.start)}~{formatTimecode(s.end)} · {Math.round(s.end - s.start)}초
                  </div>
                  {s.reason && <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{s.reason}</p>}
                  {s.tags && s.tags.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {s.tags.map((t) => (
                        <Badge key={t} className="text-muted-foreground">{t}</Badge>
                      ))}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {view === "scenes" && <ScenesView scenes={scenes} />}

      {view === "narrative" && <NarrativeView narrative={narrative} />}

      {view === "cast" && (
        faceCount === 0 ? (
          <CastView mediaId={master?.id} />
        ) : (
          <FaceClustersView
            mediaId={master.id}
            apiBase={app.apiBase}
            faces={faces!}
            programCast={programCast}
            pendingMap={pendingMap}
            setPendingMap={setPendingMap}
            savingMap={savingMap}
            onSave={async () => {
              if (!master || savingMap || Object.keys(pendingMap).length === 0) return;
              setSavingMap(true);
              try {
                await patchMediaFacesMapping(master.id, pendingMap);
                setPendingMap({});
                const fresh = await getMediaFaces(master.id);
                setFaces(fresh);
                toast({ title: "매핑 저장됨", description: "refined.speaker 필드도 rename 됐어요.", tone: "done" });
              } catch (e) {
                toast({ title: "매핑 저장 실패", description: e instanceof Error ? e.message : "다시 시도해 주세요.", tone: "error" });
              } finally {
                setSavingMap(false);
              }
            }}
          />
        )
      )}

      {view === "script" && (
        <Card className="max-h-[50vh] overflow-y-auto">
          <ul className="divide-y divide-border">
            {transcript.map((s, i) => (
              <li key={i} className="flex gap-2 px-3 py-1.5 text-[12px]">
                <span className="shrink-0 tabular-nums text-[11px] text-muted-foreground">{formatTimecode(s.start)}</span>
                <span>{s.text}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

/** Scene list — color-coded vision score, dialogue/silent, tags, on-screen names, dialogue. */
function ScenesView({ scenes }: { scenes: AnalysisScene[] }) {
  const [sort, setSort] = useState<"time" | "score">("time");
  const [silentOnly, setSilentOnly] = useState(false);

  let list = silentOnly ? scenes.filter((s) => !s.has_dialogue) : scenes;
  if (sort === "score") list = [...list].sort((a, b) => (b.vision_score ?? -1) - (a.vision_score ?? -1));
  const scored = scenes.filter((s) => s.vision_score != null).length;

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <div className="flex rounded-md border border-border p-0.5">
          <button
            onClick={() => setSort("time")}
            className={cn("rounded px-2 py-1 text-[11px] transition", sort === "time" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}
          >시간순</button>
          <button
            onClick={() => setSort("score")}
            className={cn("rounded px-2 py-1 text-[11px] transition", sort === "score" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}
          >시각점수순</button>
        </div>
        <button
          onClick={() => setSilentOnly((v) => !v)}
          className={cn("rounded-md border border-border px-2 py-1 text-[11px] transition", silentOnly ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}
        >무음만</button>
        <span className="text-[11px] text-muted-foreground">시각채점 {scored}/{scenes.length}</span>
      </div>
      <ul className="divide-y divide-border">
        {list.map((s, i) => (
          <li key={s.index ?? i} className="px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="tabular-nums text-[11px] text-muted-foreground">
                {formatTimecode(s.start)}{s.end != null ? `–${formatTimecode(s.end)}` : ""}
              </span>
              {typeof s.vision_score === "number" && (
                <span className={cn("tabular-nums text-[11px] font-bold", scoreColorClass(s.vision_score))}>{s.vision_score}</span>
              )}
              <span className={cn("rounded-full px-1.5 py-0.5 text-[9px]", s.has_dialogue ? "bg-status-done/10 text-status-done" : "bg-status-warn/10 text-status-warn")}>
                {s.has_dialogue ? "대사" : "무음"}
              </span>
              {s.on_screen_names && s.on_screen_names.length > 0 && (
                <span className="ml-auto flex flex-wrap gap-1">
                  {s.on_screen_names.slice(0, 3).map((t) => (
                    <Badge key={t} className="text-muted-foreground">🏷 {t}</Badge>
                  ))}
                </span>
              )}
            </div>
            {(s.vision_reason || s.text) && (
              <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">{s.vision_reason || s.text}</p>
            )}
            {s.vision_tags && s.vision_tags.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {s.vision_tags.map((t) => (
                  <Badge key={t} className="text-muted-foreground">{t}</Badge>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function DistributeTab({
  clips,
  onPublish,
}: {
  clips: ReturnType<typeof useAppData>["clipsForEpisode"] extends (...a: any[]) => infer R ? R : never;
  onPublish: (id: string) => void;
}) {
  if (clips.length === 0) {
    return <EmptyState icon={Send} compact title="배포할 클립이 없습니다" />;
  }

  return (
    <div className="space-y-2">
      {clips.map((clip) => (
        <Card key={clip.id} className="p-3">
          <div className="text-[13px] font-medium">{clip.title}</div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {clip.distributions.length === 0 && (
              <span className="text-[11px] text-muted-foreground">미배포</span>
            )}
            {clip.distributions.map((d) => (
              <StatusBadge
                key={d.channel}
                tone={d.status === "failed" ? "error" : d.status === "published" ? "done" : "warn"}
              >
                {DISTRIBUTION_CHANNELS[d.channel]} · {d.status === "failed" ? "실패" : d.status === "published" ? "게시" : "예약"}
              </StatusBadge>
            ))}
            <Button size="xs" variant="outline" className="ml-auto" onClick={() => onPublish(clip.id)}>
              채널별 배포
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}

function FaceClustersView({
  mediaId,
  apiBase,
  faces,
  programCast,
  pendingMap,
  setPendingMap,
  savingMap,
  onSave,
}: {
  mediaId: string;
  apiBase: string;
  faces: MediaFaces;
  programCast: string[];
  pendingMap: Record<string, string>;
  setPendingMap: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  savingMap: boolean;
  onSave: () => Promise<void>;
}) {
  const clusters = faces.clusters ?? {};
  const savedMap = faces.mapping ?? {};
  const effectiveMap: Record<string, string> = { ...savedMap, ...pendingMap };
  const pendingCount = Object.keys(pendingMap).length;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-brand/25 bg-brand/5 px-2.5 py-2 text-[11px] text-brand">
        <span className="flex-1">
          {Object.keys(clusters).length}개 인물 그룹 · {faces.labeled_segments ?? 0} 세그먼트 라벨링. 매핑 저장 시 refined.speaker 전체 rename.
          {programCast.length === 0 && <span className="mt-1 block text-status-warn">⚠ 프로그램에 등록된 cast가 없어요 — 프로그램 편집에서 출연자부터 넣어주세요.</span>}
        </span>
        <Button size="xs" onClick={onSave} disabled={pendingCount === 0 || savingMap}>
          {savingMap ? "저장 중…" : pendingCount > 0 ? `${pendingCount}개 매핑 저장` : "저장할 매핑 없음"}
        </Button>
      </div>
      <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
        {Object.entries(clusters)
          .sort((a, b) => b[1].count - a[1].count)
          .map(([label, meta]) => {
            const currentValue = effectiveMap[label] ?? "";
            const isPending = pendingMap[label] != null;
            return (
              <Card key={label} className="p-2.5" style={isPending ? { borderColor: "var(--color-brand)" } : undefined}>
                <div className="mb-1.5 flex items-center gap-1.5">
                  <span className="rounded-md px-1.5 py-0.5 text-[11px] font-bold" style={{ background: meta.gender_hint === "M" ? "rgba(94,155,255,.15)" : "rgba(245,165,36,.15)", color: meta.gender_hint === "M" ? "#5e9bff" : "#f5a524" }}>{label}</span>
                  <span className="text-[10.5px] text-muted-foreground">{meta.count}회</span>
                  <span className="ml-auto text-[10px] text-muted-foreground/70">{meta.gender_hint === "M" ? "남" : "여"}</span>
                </div>
                <div className="mb-1.5 grid grid-cols-3 gap-1">
                  {meta.representative_frames.map((fp) => {
                    const name = fp.split("/").pop() ?? fp;
                    const url = `${apiBase}/media/${mediaId}/analysis/faces/${name}`;
                    return (
                      <div key={fp} className="relative aspect-square overflow-hidden rounded border border-border bg-muted">
                        <img src={url} alt={label} loading="lazy" className="absolute inset-0 size-full object-cover" />
                      </div>
                    );
                  })}
                </div>
                <select
                  value={currentValue}
                  onChange={(e) => setPendingMap((prev) => ({ ...prev, [label]: e.target.value }))}
                  className="w-full rounded border border-input bg-background px-2 py-1 text-[11.5px]"
                >
                  <option value="">— 선택 안 함 —</option>
                  {programCast.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
                {savedMap[label] && !isPending && (
                  <div className="mt-1 text-[10.5px] text-status-done">✓ 저장됨 · {savedMap[label]}</div>
                )}
                {isPending && (
                  <div className="mt-1 text-[10.5px] text-brand">● 저장 대기 · {pendingMap[label] || "(삭제)"}</div>
                )}
              </Card>
            );
          })}
      </div>
    </div>
  );
}