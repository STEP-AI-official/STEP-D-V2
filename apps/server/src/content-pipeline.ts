/**
 * Content-analysis job runner (worker side).
 *
 * Pulls the uploaded video, runs the GPU-free Python pipeline (core/analyze.py:
 * STT → refine → scenes → vision → names → shorts), and stores the result JSON in
 * content_analysis. Kept in its own module so worker.ts only needs a one-line case.
 *
 * The pipeline is spawned as `python -m core.analyze` — set CORE_PYTHON to the
 * worker's venv (core/.venv/bin/python); locally it defaults to core/.venv310.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";

import { getMedia, saveContentAnalysis, prependEntity, getPool } from "./db-pg.ts";
import { createReadStream, parseObjectPath } from "./storage-gcs.ts";
import { newId } from "./pipeline.ts";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const CORE_PYTHON =
  process.env.CORE_PYTHON ||
  path.join(REPO_ROOT, "core", ".venv310", "Scripts", "python.exe");

async function downloadToTemp(storedPath: string, dest: string): Promise<void> {
  // Works for both GCS and the local-storage fallback (createReadStream abstracts it).
  const web = createReadStream(parseObjectPath(storedPath));
  await new Promise<void>((resolve, reject) => {
    const out = fs.createWriteStream(dest);
    Readable.fromWeb(web as any).pipe(out).on("finish", () => resolve()).on("error", reject);
  });
}

function runAnalyze(videoPath: string, outDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      CORE_PYTHON,
      ["-u", "-m", "core.analyze", videoPath, "--out", outDir],
      {
        cwd: REPO_ROOT,
        env: {
          ...process.env,
          PYTHONPATH: "",
          PYTHONIOENCODING: "utf-8",
          PYTHONUTF8: "1",
          STT_PROVIDER: process.env.STT_PROVIDER || "gemini",
          GOOGLE_CLOUD_PROJECT: process.env.GOOGLE_CLOUD_PROJECT || "step-d",
          VERTEX_LOCATION: process.env.VERTEX_LOCATION || "asia-northeast3",
        },
        stdio: ["ignore", "inherit", "inherit"],
      },
    );
    proc.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`core.analyze exited ${code}`)),
    );
    proc.on("error", reject);
  });
}

// One AI-recommended short from core/recommend.py.
type Short = { rank?: number; start?: number; end?: number; title?: string; reason?: string; tags?: string[] };

/** Map an AI short → a recommendation entity matching the web's board shape. */
function recFromShort(episodeId: string, s: Short) {
  const start = Number(s.start) || 0;
  const end = Math.max(start + 1, Number(s.end) || start + 1);
  const id = newId("r");
  const mid = start + (end - start) * 0.4;
  const rank = typeof s.rank === "number" ? s.rank : 3;
  return {
    id,
    episodeId,
    kind: "short",
    title: s.title || "쇼츠 추천",
    appeal: Math.max(1, Math.min(5, 6 - rank)), // rank 1 → appeal 5 (surfaced first)
    startTime: start,
    endTime: end,
    editNote: s.reason || "",
    tags: Array.isArray(s.tags) ? s.tags : [],
    status: "pending",
    thumbnailCandidates: [
      { id: `${id}-t1`, label: "시작", time: start + 0.5 },
      { id: `${id}-t2`, label: "핵심", time: mid },
      { id: `${id}-t3`, label: "끝", time: Math.max(start + 1, end - 1) },
    ],
    selectedThumbnailId: `${id}-t2`,
    adoptedClipId: null,
  };
}

/**
 * Surface the AI shorts on the episode's recommendation board.
 * Idempotent: clears any prior recs for the episode first, so a re-run replaces
 * rather than duplicates.
 */
async function writeRecommendationsFromShorts(episodeId: string, shorts: Short[]): Promise<number> {
  await getPool().query(
    "DELETE FROM entities WHERE kind = 'recommendation' AND data->>'episodeId' = $1",
    [episodeId],
  );
  const sorted = [...shorts].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
  // Insert worst-rank first so prepend leaves rank 1 at the front of the board.
  for (let i = sorted.length - 1; i >= 0; i--) {
    const rec = recFromShort(episodeId, sorted[i]);
    await prependEntity("recommendation", rec.id, rec);
  }
  return sorted.length;
}

/** Run the full content pipeline for one uploaded media and persist the result. */
export async function runContentAnalyze(mediaId: string): Promise<void> {
  const media = await getMedia(mediaId);
  if (!media) throw new Error(`content.analyze: media ${mediaId} not found`);

  const work = fs.mkdtempSync(path.join(os.tmpdir(), `stepd-content-${mediaId}-`));
  const videoPath = path.join(work, `source${path.extname(media.filename) || ".mp4"}`);

  try {
    await downloadToTemp(media.path, videoPath);
    await runAnalyze(videoPath, work);

    const analysis = JSON.parse(fs.readFileSync(path.join(work, "analysis.json"), "utf-8"));
    // Scene frames live under work/scene_frames and are discarded with the temp dir.
    // v1 stores transcript + scenes(metadata/scores) + shorts; frame hosting comes later.
    await saveContentAnalysis(mediaId, { data: analysis });

    const shorts: Short[] = Array.isArray(analysis?.shorts) ? analysis.shorts : [];
    // Surface the AI shorts on the episode's recommendation board (the product payoff).
    let wrote = 0;
    if (media.episodeId && shorts.length) {
      try {
        wrote = await writeRecommendationsFromShorts(media.episodeId, shorts);
      } catch (e) {
        console.error(`[worker] content.analyze ${mediaId}: failed to write recommendations`, e);
      }
    }
    console.log(
      `[worker] content.analyze ${mediaId}: ${analysis?.scenes?.length ?? 0} scenes, ${shorts.length} shorts, ${wrote} recs`,
    );
  } catch (err: any) {
    await saveContentAnalysis(mediaId, { error: String(err?.message ?? err).slice(0, 1000) });
    throw err;
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}
