"use client";

import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  fetchEpisodeCast,
  type EpisodeCastPerson,
  type EpisodeCastResponse,
} from "@/lib/data/api";
import { formatTimecode } from "@/lib/utils";
import type { StatusTone } from "@/lib/constants";

const STATUS_META: Record<string, { tone: StatusTone; label: string }> = {
  confirmed: { tone: "done", label: "확정" },
  matched: { tone: "progress", label: "매칭" },
  candidate: { tone: "idle", label: "후보" },
  rejected: { tone: "error", label: "제외" },
};

export function CastView({ mediaId }: { mediaId: string | undefined }) {
  const [data, setData] = useState<EpisodeCastResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!mediaId) return;
    let cancelled = false;
    setLoading(true);
    fetchEpisodeCast(mediaId)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mediaId]);

  if (!mediaId) return null;

  if (loading && !data) {
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground">
        인물 정보를 불러오는 중…
      </Card>
    );
  }

  if (!data || data.people.length === 0) {
    return (
      <EmptyState
        icon={Users}
        compact
        title="등장 인물이 없습니다"
        description="영상 분석 후 자동 감지됩니다."
      />
    );
  }

  return (
    <div className="space-y-2">
      <div className="text-[11px] font-semibold text-muted-foreground">
        감지된 인물 {data.people.length}명 (매칭 {data.matchedCount}명)
      </div>
      {data.people.map((p) => (
        <PersonCard key={`${p.name}:${p.castId ?? ""}`} person={p} />
      ))}
    </div>
  );
}

function PersonCard({ person }: { person: EpisodeCastPerson }) {
  const meta = person.status ? STATUS_META[person.status] : undefined;

  return (
    <Card className="p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold">{person.name}</span>
        {person.role && (
          <span className="text-[11px] text-muted-foreground">{person.role}</span>
        )}
        {meta && (
          <StatusBadge tone={meta.tone} className="ml-auto">
            {meta.label}
          </StatusBadge>
        )}
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        <span>
          {person.sceneCount ?? 0}개 장면 · 총 {Math.round(person.totalSec ?? 0)}초
        </span>
        {typeof person.confidence === "number" && person.confidence > 0 && (
          <span>신뢰도 {Math.round(person.confidence * 100)}%</span>
        )}
      </div>

      {person.appearances && person.appearances.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {person.appearances.map((a, i) => (
            <span
              key={i}
              className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground"
            >
              {formatTimecode(a.start)}~{formatTimecode(a.end)}
            </span>
          ))}
        </div>
      )}
    </Card>
  );
}
