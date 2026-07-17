/* eslint-disable camelcase */

/**
 * cast-registry — per-program 출연자 레지스트리 + 회차별 "출연자 × 등장 구간" 타임라인.
 *
 * The B2B differentiator (master plan CX-1): a generic tool sees "20대 여성", STEP D sees
 * "23기 영숙". Identity comes from the lower-third NAME CAPTION the broadcaster already
 * burned in (core/ocr.py → scene.on_screen_names), matched against the registry here —
 * NOT from face recognition. No biometric data is stored by these tables; `evidence` holds
 * the OCR'd strings and `appearances` the scene spans, so every claim traces to a frame.
 *
 * Two tables, deliberately separate:
 *   program_cast  — the operator's roster. Long-lived, edited by hand, one row per person.
 *   episode_cast  — one analysis run's findings per media. Rebuilt on re-analysis.
 *
 * Trust: `status` starts at 'matched' (registry hit) or 'candidate' (unknown name). Nothing
 * is auto-promoted to 'confirmed' — that transition is an operator action, which is why it's
 * a column here rather than something core/cast.py could ever write.
 *
 * NON-DESTRUCTIVE: purely additive (CREATE TABLE IF NOT EXISTS). No existing table is
 * altered and no existing read path changes; content_analysis.data keeps its own `cast`
 * copy from the run. See docs/ops/migrations.md.
 *
 * @typedef {import('node-pg-migrate').MigrationBuilder} MigrationBuilder
 */

exports.shorthands = undefined;

/** @param {MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS program_cast (
      castId     TEXT PRIMARY KEY,
      programId  TEXT NOT NULL,                    -- entities(kind='program') id — JSONB entity, so no FK
      name       TEXT NOT NULL,                    -- canonical name the timeline normalizes onto ('영숙')
      aliases    JSONB NOT NULL DEFAULT '[]'::jsonb,  -- other captions for the same person ('23기 영숙')
      role       TEXT NOT NULL DEFAULT '',         -- 'MC' | '고정출연' | '게스트' | …
      season     TEXT NOT NULL DEFAULT '',         -- 기수/시즌 ('23기') — same name recurs across seasons
      note       TEXT NOT NULL DEFAULT '',
      createdAt  BIGINT NOT NULL,
      updatedAt  BIGINT NOT NULL
    );
  `);
  pgm.sql(`CREATE INDEX IF NOT EXISTS program_cast_program_idx ON program_cast (programId);`);
  // One canonical name per program+season: '23기 영숙' and '24기 영숙' coexist, duplicates don't.
  pgm.sql(`
    CREATE UNIQUE INDEX IF NOT EXISTS program_cast_program_name_season_key
      ON program_cast (programId, lower(name), lower(season));
  `);

  pgm.sql(`
    CREATE TABLE IF NOT EXISTS episode_cast (
      mediaId     TEXT NOT NULL,                   -- media(id) — the analyzed episode file
      name        TEXT NOT NULL,                   -- registry name when matched, else the OCR'd caption
      castId      TEXT,                            -- NULL = unmatched candidate (not in the registry)
      status      TEXT NOT NULL DEFAULT 'candidate', -- 'matched' | 'candidate' | 'confirmed' | 'rejected'
      matchType   TEXT NOT NULL DEFAULT 'none',    -- 'exact' | 'alias' | 'fuzzy' | 'none'
      confidence  REAL NOT NULL DEFAULT 0,         -- 0–1, evidence-weighted (never 1.0 from OCR alone)
      role        TEXT NOT NULL DEFAULT '',
      sceneCount  INTEGER NOT NULL DEFAULT 0,      -- scenes whose name caption evidences this person
      totalSec    REAL NOT NULL DEFAULT 0,         -- summed appearance seconds
      evidence    JSONB NOT NULL DEFAULT '[]'::jsonb,  -- raw OCR strings behind the normalized name
      appearances JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{start,end,scenes:[i],source:'gemini'|'ocr'}]
      createdAt   BIGINT NOT NULL,
      updatedAt   BIGINT NOT NULL,
      -- Keyed by the resolved name: a re-analysis upserts the same people instead of duplicating.
      PRIMARY KEY (mediaId, name)
    );
  `);
  pgm.sql(`CREATE INDEX IF NOT EXISTS episode_cast_cast_idx ON episode_cast (castId);`);
};

/**
 * Reverse of `up`. Safe to drop: both tables are new (no prior production data) and
 * episode_cast is regenerable from content_analysis.data.cast by re-running the analysis.
 * program_cast is operator-entered — dropping it loses that roster, which is why `down`
 * is a rollback path only, not a routine operation.
 * @param {MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS episode_cast;`);
  pgm.sql(`DROP TABLE IF EXISTS program_cast;`);
};
