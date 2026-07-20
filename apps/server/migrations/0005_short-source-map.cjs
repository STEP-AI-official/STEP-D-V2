/* eslint-disable camelcase */
/**
 * short-source-map — 발행된 숏폼이 "어느 롱폼의 어느 구간"에서 나왔는지의 사람 매칭.
 *
 * 왜 필요한가: 채널의 기존 숏폼 백카탈로그에는 출처 정보가 전혀 없다. channel_videos 에는
 * parent/source 컬럼이 없고, 숏폼→롱폼을 되짚는 코드도 없다. 그래서 "고성과 숏폼이 롱폼의
 * 어떤 순간을 잡았나"를 학습하려면 이 연결을 사람이 만들어 줘야 한다(Lab 🔗 숏폼 매칭 탭).
 *
 * 키 설계: 숏폼 하나는 롱폼 한 구간에서 온다고 보고 shortVideoId 를 PK 로 둔다(재매칭은 upsert).
 * channel_videos.videoId 를 참조하지만 FK 는 걸지 않는다 — 채널 재동기화가 영상을 지웠다
 * 되살리는 흐름(deleteChannelVideosForChannel)에서 매칭이 통째로 날아가면 안 되기 때문이다.
 * 조회수·제목 같은 성과 데이터는 여기 복제하지 않는다. channel_videos 가 최신값을 갖고 있고,
 * 복제하면 즉시 낡는다.
 *
 * NON-DESTRUCTIVE: 순수 추가(CREATE TABLE IF NOT EXISTS). 기존 테이블/컬럼을 건드리지 않는다.
 *
 * @typedef {import('node-pg-migrate').MigrationBuilder} MigrationBuilder
 */
exports.shorthands = undefined;

/** @param {MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS short_source_map (
      shortVideoId TEXT PRIMARY KEY,       -- channel_videos.videoId (숏폼). FK 없음 — 위 주석 참고
      channelId    TEXT NOT NULL,          -- 소속 채널 (채널 단위 조회/내보내기용)
      longVideoId  TEXT NOT NULL,          -- channel_videos.videoId (출처 롱폼)
      segStart     REAL NOT NULL,          -- 롱폼 기준 시작 초
      segEnd       REAL NOT NULL,          -- 롱폼 기준 끝 초
      note         TEXT,                   -- 매칭하며 남긴 운영자 메모 (선택)
      createdAt    BIGINT NOT NULL,
      updatedAt    BIGINT NOT NULL,
      CONSTRAINT short_source_map_span_ck CHECK (segEnd > segStart)
    );
  `);
  pgm.sql(`CREATE INDEX IF NOT EXISTS short_source_map_channel_idx ON short_source_map (channelId);`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS short_source_map_long_idx ON short_source_map (longVideoId);`);
};

/** @param {MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS short_source_map;`);
};
