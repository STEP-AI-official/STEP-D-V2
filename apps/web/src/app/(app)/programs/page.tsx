"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { PipelineStrip } from "@/components/pipeline-strip";
import { useAppData } from "@/lib/data/store";
import { PIPELINE_STAGE_LABELS, targetAgeLabel } from "@/lib/constants";
import { programSmrChecks } from "@/lib/publish/requirements";
import { UploadVideoButton } from "@/components/upload-video-dialog";
import type { Program } from "@/lib/types";

export default function ProgramsPage() {
  const { programs, episodes } = useAppData();

  return (
    <>
      <PageHeader
        title="콘텐츠"
        description="프로그램 → 회차. 각 회차의 파이프라인 진행 상태를 한눈에 보고, 클릭해 진행 허브로 이동합니다."
        actions={
          <>
            <UploadVideoButton />
            <Button size="sm">＋ 새 프로그램</Button>
          </>
        }
      />

      <div className="space-y-6">
        {programs.map((program) => {
          const eps = episodes.filter((e) => e.programId === program.id);
          return (
            <section key={program.id}>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold">{program.title}</h2>
                <Badge>{program.section}</Badge>
                <Badge>{targetAgeLabel(program.targetAge)}</Badge>
                <span className="text-xs text-muted-foreground">회차 {eps.length}</span>
                <SmrFeedReadiness program={program} />
              </div>
              <div className="space-y-2">
                {eps.map((ep) => (
                  <Link key={ep.id} href={`/episodes/${ep.id}`} className="block">
                    <Card interactive className="flex flex-wrap items-center justify-between gap-3 p-4">
                      <div className="min-w-40">
                        <div className="text-sm font-semibold">{ep.episodeNumber}화</div>
                        <div className="text-xs text-muted-foreground">방송 {ep.broadDate}</div>
                      </div>
                      <PipelineStrip pipeline={ep.pipeline} />
                      <div className="flex items-center gap-2">
                        <StatusBadge tone={ep.pipeline.stageStatus}>
                          {ep.pipeline.blockedReason ?? PIPELINE_STAGE_LABELS[ep.pipeline.stage]}
                        </StatusBadge>
                        <ChevronRight className="size-4 text-muted-foreground" />
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}

/** Program-level SMR feed readiness — the "프로그램 준비" step split out of per-clip publish. */
function SmrFeedReadiness({ program }: { program: Program }) {
  const checks = programSmrChecks(program);
  const missing = checks.filter((c) => !c.met);
  if (missing.length === 0) {
    return <StatusBadge tone="done">SMR 피드 준비 완료</StatusBadge>;
  }
  return (
    <StatusBadge tone="warn" className="cursor-default" >
      <span title={`미충족: ${missing.map((m) => m.label).join(", ")}`}>
        SMR 피드 {missing.length}개 미충족
      </span>
    </StatusBadge>
  );
}
