# 2026-07-16 — 영상 파이프라인 실서비스화: 문제 해결 기록

> 대용량 영상 **업로드 → 재생 → AI 쇼츠 추천**을 실서비스에 연결하며 잡은 문제들.
> 핵심 원칙 하나로 수렴: **영상 바이트는 우리 서버(Cloud Run·Vercel 프록시)를 거치지 않는다 — 업로드도 재생도 GCS와 브라우저가 직접.**

---

## 한 줄 요약

| 영역 | 상태 |
|------|------|
| 대용량 업로드 | ✅ 브라우저→GCS 직접 resumable |
| 영상 재생 | ✅ GCS 서명 URL 직접 재생 + 조각mp4 자동 리먹스 |
| AI 쇼츠 추천 | ✅ 파이프라인 실증(16분 → 200장면·5쇼츠·5추천), 추천 보드 배선 |
| 프로그램 생성 | ✅ 라우트 + SMR 폼 |
| 운영 도구 | ✅ reset · queue/purge · remux admin 엔드포인트, 배포 스크립트 |

---

## 1. 대용량 영상 업로드 실패

**증상** — 실서버에서 큰 영상(수 GB, 몇 시간짜리)이 업로드 도중 실패.

**원인 — 바이트가 Cloud Run 서버를 통과해서 생기는 세 개의 벽**
1. 요청 32MB 상한 (Cloud Run이 인프라 단에서 거부)
2. 메모리 초과 — 파일 전체를 RAM + `/tmp`(tmpfs)에 이중 적재, 4Gi 인스턴스에서 OOM
3. 600초 요청 타임아웃

**해결** — 브라우저 → GCS **직접 resumable 업로드**(16MB 청크, 끊겨도 재개). 서버는 세션(1회용 티켓)만 발급.
- 서버: `POST /api/media/upload-init`(resumable 세션) + `POST /api/media/finalize`(회차·미디어 생성) — `apps/server/src/index.ts`
- `apps/server/src/storage-gcs.ts` — `createResumableSession`, `signedReadUrl`
- 웹: `apps/web/src/lib/data/api.ts` — `uploadVideo`(init → 청크 PUT → finalize)
- 이탈 방지 UI: `apps/web/src/components/upload-video-dialog.tsx`

---

## 2. 영상 재생 안 됨 (4단 중첩 버그)

원본 마스터가 브라우저에서 재생이 안 됐고, 원인이 **네 겹**이었다. 하나씩 벗겨냄.

### 2-1. 이중 `/api` (404)
서버 `mediaPublic.streamUrl`이 `/api/media/…`를 내보내는데, 웹이 `${apiBase}(=/api)${streamUrl}`로 합쳐 **`/api/api/media/…` → 404**.
→ 서버가 `/media/…`(프리픽스 없이) 내보내도록 수정. `apps/server/src/db-pg.ts` `mediaPublic`.

### 2-2. 스트림 500 (`Controller is already closed`)
GCS 스트림을 `ReadableStream`으로 수동 래핑하다가, 브라우저가 Range를 중간에 끊으면 **닫힌 컨트롤러에 enqueue → 500**.
→ `createReadStream`을 `Readable.toWeb`로 교체(백프레셔·취소·에러 자동 처리). `apps/server/src/storage-gcs.ts`.

### 2-3. Vercel 프록시가 대용량 응답에서 막힘
브라우저 → Vercel 프록시 → Cloud Run → GCS 경로에서 **74MB 응답이 프록시에서 병목**. Range 청크로 쪼개도 요청 수십 개 + 버벅임.
→ **바이트를 우리 서버로 안 나른다.** `GET /api/media/:id/stream-url`이 **GCS 서명 URL(JSON)**을 주고, 웹이 `<video src={서명URL}>`로 **GCS에 직접 range 요청**.
- 서버: `apps/server/src/index.ts` (`/api/media/:id/stream-url`, GCS면 `direct:true`)
- 웹: `getStreamUrl` — `apps/web/src/lib/data/api.ts`; `SourceTab`(episode-detail) · `editor-shell`이 이걸 사용
- (스트림 엔드포인트는 로컬 개발용 청크 서빙으로 잔존)

### 2-4. 조각 mp4(fMP4) → 일반 `<video>` 재생 불가 ★재생 최종 원인
업로드된 파일이 **fragmented MP4**였음: `ftyp → moov(1KB, 초기화만) → moof/mdat 조각 수백 개`. 정상 progressive mp4는 `moov(전체 샘플테이블) + mdat` 하나씩. fMP4는 MSE/DASH용이라 일반 `<video>`가 못 틀어 스피너.
→ `finalize`에서 **progressive로 리먹스**: `ffmpeg -c copy -movflags +faststart`(재인코딩 없이 컨테이너만 재조립, ~초 단위) 후 GCS 객체 교체. 1.5GB 이하만(Cloud Run RAM /tmp OOM 방지).
- `apps/server/src/ffmpeg.ts` — `remuxFaststart`
- `finalize`에 리먹스 블록, 기존 파일용 `POST /api/admin/remux/:id`
- 검증: 변환 후 `ftyp → moov(1MB, 전체 인덱스, 앞) → mdat` = 표준 progressive ✓

---

## 3. AI 쇼츠 추천이 안 뜸

### 3-1. 휴리스틱 더미 추천 제거
업로드 시 영상 길이를 등분해 "오프닝·훅" 라벨을 붙이던 `buildRecommendations` 휴리스틱을 **제거**(가짜로 보임). 진짜 구간은 AI 파이프라인이 채운다.

### 3-2. 쇼츠 → 추천 보드 배선 (없던 연결)
core 파이프라인은 `analysis.shorts`를 `content_analysis` 테이블에만 저장하고, **추천 보드는 `recommendation` 엔티티를 읽어** 서로 안 이어져 있었음.
→ 워커가 `content.analyze` 완료 후 `analysis.shorts` → recommendation 엔티티로 변환·저장. rank→appeal(1→5) 매핑, `kind="short"`, 썸네일 후보 3개, 회차 파이프라인 `recommend/done` 갱신.
- `apps/server/src/content-pipeline.ts` — `writeRecommendationsFromShorts`, `setEpisodePipeline`

### 3-3. ★근본 원인: 워커에 `GCS_BUCKET` 미설정
`content.analyze`가 한 번도 안 돌던 진짜 이유. 워커 env에 `GCS_BUCKET`이 없어 영상을 **로컬 디스크**(`storage/uploads/…`)에서 찾음 → **ENOENT → 워커 크래시**.
→ 워커 `/etc/stepd/worker.env`에 `GCS_BUCKET=stepd-media` 추가 + 재시작. 즉시 STT 시작·정상 동작.

### 3-4. `video.comments` 403 홍수가 content.analyze를 굶김
채널 파이프라인이 영상마다 댓글 잡을 넣는데, 토큰에 댓글 스코프가 없어 **403 → 5회 재시도 → 매 스케줄마다 재적재 → 큐 수백 개**. 단일스레드 워커가 여기 매여 content.analyze가 안 돎.
→ `fetchVideoComments`: 403은 재시도 무의미하니 `[]`로 스킵. `apps/server/src/youtube.ts`.
→ `POST /api/admin/queue/purge`: `video.*` 잡 + 좀비 content.analyze 삭제 + 재점화.

### 3-5. 좀비 잡 크래시루프
여러 번 리셋하며 **삭제된 미디어의 content.analyze 잡**이 남아 "media not found / ENOENT"로 워커를 크래시루프에 빠뜨림.
→ reset이 미디어 행 전부 삭제 + purge가 좀비 content.analyze(미디어 없는 것) 삭제.
→ `content-pipeline.ts` 다운로드 스트림에 `src.on("error", reject)` (스트림 에러가 워커를 안 죽이도록).
→ `worker.ts`에 `unhandledRejection`/`uncaughtException` 핸들러(긴 실행 중 생존).

**검증**: 16분 영상 1건이 `200 scenes, 5 shorts, 5 recs`로 완주 (워커 로그). **파이프라인 자체는 정상**, 좀비만 문제였음.

---

## 4. 분석 탭 목데이터 → 실데이터

회차 상세 "분석" 탭이 하드코딩 목(유재석/이영자/홍현희)이었음.
→ `getMediaAnalysis`로 실제 `content_analysis` 표시 + 20초 폴링(분석 중이면 "AI가 분석 중"). `apps/web/src/components/episode-detail.tsx`.

## 5. 파이프라인 상태 거짓 표시

업로드 직후 회차 파이프라인이 `recommend/done`("추천 생성됨")으로 **거짓** 초록.
→ 업로드 = `analyze/progress`("AI 장면 분석 중"), 워커가 완료 시 `recommend/done`으로 실반영.

## 6. 프로그램 생성 기능 부재

`＋ 새 프로그램` 버튼에 onClick이 없고 서버 생성 라우트도 없어 **프로그램이 0개 → 업로드가 program not found로 실패**.
→ `POST /api/programs` + 새 프로그램 다이얼로그(제목·장르·시청등급·출연자 + SMR: 프로그램코드·카테고리·편성요일). `docs/plans/publish-fields-ux-plan.md` 기준.

## 7. 추천 채택 전역 탭 통합

전역 "추천 & 채택" 보드는 어느 회차 건지 안 보여 혼란 → **nav에서 제거**, 회차 상세 "추천" 탭(콘텐츠→회차→추천)으로 통합. 대시보드 인박스는 이미 `/episodes/:id?tab=recommend`로 링크.

---

## 인프라 변경 (실서버)

| 항목 | 내용 |
|------|------|
| 버킷 CORS | `gs://stepd-media` — 브라우저 직접 업로드/재생 허용 (`stepd.stepai.kr` · PUT/GET · Content-Range) |
| 서비스계정 signBlob | `stepd-deployer`에 Token Creator(자기 자신) — 서명 URL 생성 |
| 워커 env | `/etc/stepd/worker.env`에 `GCS_BUCKET=stepd-media` |
| 워커 git remote | org 변경(`STEP-AI-official` → `STEP-AI-organization`) 반영 + read 토큰 |

## 새 admin 엔드포인트 (`apps/server/src/index.ts`)

- `POST /api/media/upload-init` · `POST /api/media/finalize` — 대용량 직접 업로드
- `GET /api/media/:id/stream-url` — 재생용 서명 URL
- `POST /api/admin/reset` — 콘텐츠 전체 초기화 (`{confirm:"RESET"}`)
- `POST /api/admin/queue/purge` — 큐 홍수·좀비 정리 + content.analyze 재점화 (`{confirm:"PURGE"}`)
- `POST /api/admin/remux/:id` — 기존 영상 progressive 리먹스
- `POST /api/programs` — 프로그램 생성

## 배포 스크립트

- `deploy.ps1` — 서버 전용 Cloud Run 배포(`gcloud builds submit` + /health)
- `deploy-worker.ps1` — 워커 VM `git reset --hard origin/main` + 재시작

---

## 남은 것 / 주의

- **긴 영상 처리량**: 16분 영상은 Gemini 수백 호출로 수십 분 소요(비동기라 문제는 아님). 초대용량은 Vertex 리전 쿼터 천장 주의.
- **초대용량(>1.5GB) 리먹스**: Cloud Run RAM /tmp OOM 방지로 스킵됨. 필요 시 디스크 기반 워커 리먹스로 이관.
- **댓글 스코프**: `video.comments`는 재동의 전까지 빈 값. 홍수는 위 fix로 멈춤.
- **워커 배포**: youtube 403 fix·크래시 핸들러 반영하려면 `deploy-worker.ps1` 1회 실행.
- **`apps/api` 레거시**: 이번 작업과 무관(구 STEPD).

---

## 교훈

1. **영상 바이트는 앱 서버로 나르지 말 것** — 업로드(GCS resumable)도 재생(GCS 서명 URL)도 직접. 프록시/서버 경유가 병목·OOM·타임아웃의 근원이었다.
2. **업로드 파일은 progressive mp4로 정규화** — 유저 파일은 fMP4일 수 있고 브라우저가 못 튼다. 인제스트에서 `-c copy -movflags +faststart` 리먹스.
3. **워커 환경변수·좀비 잡이 조용한 킬러** — GCS_BUCKET 하나 빠져서 파이프라인 전체가 안 돌았고, 리셋 남발이 크래시루프를 만들었다. 상태 초기화는 미디어 행 + 큐 잡을 함께.
