/**
 * Tunables for the channel-analysis pipeline — kept here (not scattered as magic
 * numbers) because they are the levers that protect the YouTube quota. Each per-video
 * `video.analyze` run costs 4 Analytics API calls, so the caps below decide how much
 * quota one channel sweep can spend.
 */

/** Uploads at or below this length are treated as Shorts (durationSec heuristic). */
export const SHORTS_MAX_DURATION_SEC = 180;

/**
 * Per channel.analyze completion, only the N most-recent uploads get queued for
 * per-video analytics. 30 × 4 Analytics calls = 120 calls per channel, per run.
 */
export const VIDEO_ANALYZE_MAX_VIDEOS = 30;

/** Under this age a video is "fresh": polled daily, and its comments are collected. */
export const FRESH_VIDEO_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** Re-pull per-video analytics this often for fresh (<7d) videos. */
export const VIDEO_ANALYZE_FRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;
/** …and this often once a video has aged past the fresh window. */
export const VIDEO_ANALYZE_AGED_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

/** Re-pull comments this often (fresh videos only). */
export const VIDEO_COMMENTS_INTERVAL_MS = 24 * 60 * 60 * 1000;
/** One page only — 100 relevance-ranked threads is enough signal without paginating. */
export const VIDEO_COMMENTS_MAX_RESULTS = 100;

/** A newly discovered upload is polled at high density for this long after publish. */
export const HOTWATCH_WINDOW_MS = 48 * 60 * 60 * 1000;
/** …at this cadence (the job re-enqueues itself with this delay until the window closes). */
export const HOTWATCH_POLL_MS = 60 * 60 * 1000;
