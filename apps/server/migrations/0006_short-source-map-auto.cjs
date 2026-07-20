/* eslint-disable camelcase */
/**
 * short-source-map-auto — 구간을 누가 정했는지(사람/오디오 정렬)와 그 신뢰도를 남긴다.
 *
 * 왜: 롱폼 하나에서 숏폼이 16개씩 나오는 경우가 있어 구간을 전부 손으로 찍는 건 비현실적이다.
 * core/align.py 가 오디오 상호상관으로 구간을 자동 추정하는데, 배속·BGM 덧입힘·재편집이면
 * 틀릴 수 있다. 틀린 구간이 사람이 찍은 것과 구분 없이 섞이면 학습 데이터가 조용히 오염되므로
 * 출처(source)와 신뢰도(peak ratio)를 반드시 같이 저장한다. 사람이 확인하면 confirmed 로 승격.
 *
 * NON-DESTRUCTIVE: 순수 추가(ADD COLUMN IF NOT EXISTS). 기존 행은 'manual'로 남는다.
 *
 * @typedef {import('node-pg-migrate').MigrationBuilder} MigrationBuilder
 */
exports.shorthands = undefined;

/** @param {MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE short_source_map
      ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual';
  `);
  pgm.sql(`
    ALTER TABLE short_source_map
      ADD COLUMN IF NOT EXISTS confidence REAL;
  `);
  pgm.sql(`
    ALTER TABLE short_source_map
      ADD COLUMN IF NOT EXISTS confirmedAt BIGINT;
  `);
};

/** @param {MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.sql(`ALTER TABLE short_source_map DROP COLUMN IF EXISTS confirmedAt;`);
  pgm.sql(`ALTER TABLE short_source_map DROP COLUMN IF EXISTS confidence;`);
  pgm.sql(`ALTER TABLE short_source_map DROP COLUMN IF EXISTS source;`);
};
