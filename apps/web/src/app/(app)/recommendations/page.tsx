"use client";

import { useState } from "react";
import { Star, GitBranch, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/section-heading";
import { EmptyState } from "@/components/ui/empty-state";
import { RecommendationCard } from "@/components/recommendation-card";
import { LineageTrail } from "@/components/lineage-trail";
import { useAppData } from "@/lib/data/store";

export default function RecommendationsPage() {
  const { recommendations, episodes } = useAppData();
  const [episodeFilter, setEpisodeFilter] = useState<string>("all");

  const scoped =
    episodeFilter === "all"
      ? recommendations
      : recommendations.filter((r) => r.episodeId === episodeFilter);

  const pending = scoped.filter((r) => r.status === "pending").sort((a, b) => b.appeal - a.appeal);
  const elite = pending.filter((r) => r.appeal >= 4);
  const rest = pending.filter((r) => r.appeal < 4);
  const processed = scoped.filter((r) => r.status !== "pending");
  const adopted = scoped.filter((r) => r.status === "adopted");
  const rejected = scoped.filter((r) => r.status === "rejected");

  // Reject-reason distribution (pain B2 feedback loop).
  const rejectDist = rejected.reduce<Record<string, number>>((acc, r) => {
    const key = r.rejectReason ?? "기타";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const maxReject = Math.max(1, ...Object.values(rejectDist));

  const episodesWithRecs = episodes.filter((e) =>
    recommendations.some((r) => r.episodeId === e.id),
  );

  return (
    <>
      <PageHeader
        title="추천 & 채택"
        description="정예 추천을 우선 검토하고, [채택] 한 번으로 인코딩·등록까지 자동 진행합니다. 반려 시 사유를 남깁니다."
        actions={
          <select
            value={episodeFilter}
            onChange={(e) => setEpisodeFilter(e.target.value)}
            className="h-9 rounded-md border border-border bg-background px-3 text-sm"
          >
            <option value="all">전체 회차</option>
            {episodesWithRecs.map((e) => (
              <option key={e.id} value={e.id}>
                {e.programTitle} {e.episodeNumber}화
              </option>
            ))}
          </select>
        }
      />

      {pending.length === 0 && processed.length === 0 && (
        <EmptyState
          icon={Sparkles}
          title="검토할 추천이 없습니다"
          description="회차 분석이 끝나면 정예 추천이 여기에 우선 노출됩니다."
        />
      )}

      {elite.length > 0 && (
        <section className="mb-6">
          <SectionHeading icon={Star} iconClassName="text-status-warn">
            정예 추천 (appeal ≥ 4)
          </SectionHeading>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {elite.map((r) => (
              <RecommendationCard key={r.id} rec={r} />
            ))}
          </div>
        </section>
      )}

      {rest.length > 0 && (
        <section className="mb-6">
          <SectionHeading>그 외 후보</SectionHeading>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {rest.map((r) => (
              <RecommendationCard key={r.id} rec={r} />
            ))}
          </div>
        </section>
      )}

      {(adopted.length > 0 || rejected.length > 0) && (
        <section className="mb-6 grid gap-3 lg:grid-cols-2">
          {adopted.length > 0 && (
            <Card className="p-4">
              <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
                <GitBranch className="size-4 text-status-done" /> 채택 계보 ({adopted.length})
              </h3>
              <div className="space-y-2">
                {adopted.map((r) => (
                  <LineageTrail key={r.id} rec={r} />
                ))}
              </div>
            </Card>
          )}
          {rejected.length > 0 && (
            <Card className="p-4">
              <h3 className="mb-3 text-sm font-semibold">반려 사유 분포 ({rejected.length})</h3>
              <div className="space-y-2">
                {Object.entries(rejectDist)
                  .sort((a, b) => b[1] - a[1])
                  .map(([reason, count]) => (
                    <div key={reason} className="flex items-center gap-2 text-xs">
                      <span className="w-20 shrink-0 text-muted-foreground">{reason}</span>
                      <div className="h-4 flex-1 overflow-hidden rounded bg-muted">
                        <div
                          className="h-full rounded bg-status-error/60"
                          style={{ width: `${(count / maxReject) * 100}%` }}
                        />
                      </div>
                      <span className="w-6 text-right tabular-nums">{count}</span>
                    </div>
                  ))}
              </div>
            </Card>
          )}
        </section>
      )}

      {processed.length > 0 && (
        <section>
          <SectionHeading count={processed.length}>처리됨</SectionHeading>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {processed.map((r) => (
              <RecommendationCard key={r.id} rec={r} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
