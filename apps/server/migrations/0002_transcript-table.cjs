/* eslint-disable camelcase */

/**
 * transcript-table — single canonical STT transcript store (per uploaded media).
 *
 * Until now the transcript lived only inside content_analysis.data.transcript (the
 * whole analyze.py blob). That coupled the transcript to the analysis run and left
 * every future consumer (C 자막/캡션, D 콘텐츠분석, F 프레이밍, H 하이라이트) to re-parse
 * the blob. This table gives them ONE shared source keyed by mediaId.
 *
 * Both levels are preserved: `segments` is a JSONB array of
 *   { start, end, text, words: [{ word, start, end, probability }] }
 * i.e. utterance-level segments with word-level timestamps nested inside (word timings
 * come from the whisper path; the Gemini path yields words:[] — hasWords records which).
 * JSONB (not a normalized words table) matches the codebase convention (content_analysis,
 * video_analytics, …) and every consumer reads the whole transcript at once.
 *
 * NON-DESTRUCTIVE: purely additive (CREATE TABLE IF NOT EXISTS). content_analysis keeps
 * its own `data.transcript` copy untouched, so existing web/editor reads are unaffected;
 * this table is written alongside it. See docs/ops/migrations.md.
 *
 * @typedef {import('node-pg-migrate').MigrationBuilder} MigrationBuilder
 */

exports.shorthands = undefined;

/** @param {MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS transcript (
      mediaId       TEXT PRIMARY KEY,
      language      TEXT NOT NULL DEFAULT 'ko',
      provider      TEXT,                              -- 'gemini' | 'whisper' | …
      source        TEXT NOT NULL DEFAULT 'refined',   -- 'refined' (post-cleanup) | 'raw' (pre-cleanup)
      segmentCount  INTEGER NOT NULL DEFAULT 0,
      wordCount     INTEGER NOT NULL DEFAULT 0,
      hasWords      BOOLEAN NOT NULL DEFAULT FALSE,
      segments      JSONB NOT NULL DEFAULT '[]'::jsonb,
      createdAt     BIGINT NOT NULL,
      updatedAt     BIGINT NOT NULL
    );
  `);
};

/**
 * Reverse of `up`. Safe to drop: this table is new (no prior production data) and its
 * contents are a redundant copy of content_analysis.data.transcript.
 * @param {MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS transcript;`);
};
