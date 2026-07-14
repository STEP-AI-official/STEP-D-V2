"use client";

import { useEffect } from "react";
import { activeRepository } from "@/lib/data/repository";
import type { JobEvent } from "@/lib/types";

/**
 * Live job-progress subscription seam. With the mock repository this is a no-op;
 * at M6 `activeRepository.subscribeJobs` connects to the SPFN event stream (SSE)
 * so the job/alert center reflects real merge/analyze/encode/publish progress.
 */
export function useJobProgress(onEvent: (job: JobEvent) => void) {
  useEffect(() => {
    const unsub = activeRepository.subscribeJobs(onEvent);
    return unsub;
  }, [onEvent]);
}
