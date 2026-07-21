/* eslint-disable camelcase */
/**
 * channel-point-profile — 채널별 학습된 포인트 규칙(고성과 구간 특성)을 보관.
 *
 * core/learn_profile.py가 매칭 데이터에서 뽑은 규칙(winning_patterns·avoid_patterns·
 * optimal_length_sec·confidence)을 여기에 저장한다. 이후 그 채널의 영상을 분석할 때
 * recommend가 이 프로파일을 프롬프트 스티어링으로 써서 채널에 맞는 후보를 고른다.
 *
 * 왜 youtube_channels에 두나: 프로파일은 채널당 하나, 채널과 1:1이다. 별도 테이블은
 * 조인만 늘린다. JSONB로 둬 규칙 스키마가 진화해도 마이그레이션 없이 담긴다.
 *
 * NON-DESTRUCTIVE: 순수 추가(ADD COLUMN IF NOT EXISTS).
 *
 * @typedef {import('node-pg-migrate').MigrationBuilder} MigrationBuilder
 */
exports.shorthands = undefined;

/** @param {MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.sql(`ALTER TABLE youtube_channels ADD COLUMN IF NOT EXISTS pointProfile JSONB;`);
  pgm.sql(`ALTER TABLE youtube_channels ADD COLUMN IF NOT EXISTS pointProfileAt BIGINT;`);
};

/** @param {MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.sql(`ALTER TABLE youtube_channels DROP COLUMN IF EXISTS pointProfileAt;`);
  pgm.sql(`ALTER TABLE youtube_channels DROP COLUMN IF EXISTS pointProfile;`);
};
