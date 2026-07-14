import { cn } from "@/lib/utils";
import { PIPELINE_STAGES, PIPELINE_STAGE_LABELS, type PipelineStage } from "@/lib/constants";
import type { EpisodePipeline } from "@/lib/types";

/**
 * Compact left→right pipeline stage strip for an episode (plan §7.2).
 * Stages before the current one read as done; the current one carries the tone;
 * later stages are idle. This is the atom that answers "이 회차 지금 어디까지?".
 */
export function PipelineStrip({ pipeline }: { pipeline: EpisodePipeline }) {
  const currentIdx = PIPELINE_STAGES.indexOf(pipeline.stage);

  function stageState(stage: PipelineStage, idx: number): "done" | "current" | "todo" {
    if (idx < currentIdx) return "done";
    if (idx === currentIdx) return "current";
    return "todo";
  }

  const currentTone = pipeline.stageStatus;

  return (
    <div className="flex items-center gap-1">
      {PIPELINE_STAGES.map((stage, idx) => {
        const state = stageState(stage, idx);
        return (
          <div key={stage} className="flex items-center gap-1">
            <div
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium",
                state === "done" && "bg-status-done/10 text-status-done",
                state === "current" && currentTone === "progress" && "bg-status-progress/10 text-status-progress",
                state === "current" && currentTone === "done" && "bg-status-done/15 text-status-done",
                state === "current" && currentTone === "error" && "bg-status-error/10 text-status-error",
                state === "current" && currentTone === "warn" && "bg-status-warn/10 text-status-warn",
                state === "current" && currentTone === "idle" && "bg-muted text-muted-foreground",
                state === "todo" && "text-muted-foreground/50",
              )}
            >
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  state === "done" && "bg-status-done",
                  state === "current" && "bg-current",
                  state === "todo" && "bg-current/40",
                )}
              />
              {PIPELINE_STAGE_LABELS[stage]}
            </div>
            {idx < PIPELINE_STAGES.length - 1 && (
              <span className="text-muted-foreground/30" aria-hidden>
                ›
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
