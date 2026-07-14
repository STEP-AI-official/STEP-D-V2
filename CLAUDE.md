# STEP-D — Claude 컨텍스트

> 2026-07-14 전면 교체. 이 리포는 더 이상 구 STEPD(Python FastAPI + VM)가 아니다.
> 구 코드는 `apps/api/`에 레거시로 남아 있을 뿐, 새 작업은 전부 `apps/web` + `apps/server`에서 한다.

## 제품 개요

운영자(방송사·MCN) 중심의 클립/쇼츠 스튜디오. 긴 영상을 올리면 추천 구간이 생성되고,
운영자가 **원클릭 채택**하면 해당 구간이 트림·인코딩되어 클립이 되고, 편집 후 멀티채널로 배포·추적한다.

```
업로드 → (ffprobe로 길이 파악) → 추천 구간 생성 → [사람] 채택/거절
                                                      ↓ 채택
                                          ffmpeg 트림·인코딩 → 클립 + 썸네일
                                                      ↓
                                            편집 → 배포(YouTube/Meta/SMR) → 성과
```

설계 배경·마일스톤(M0~M6)은 [docs/step-d-ux-plan.md](docs/step-d-ux-plan.md).

---

## 모노레포 구조 (pnpm workspace, Node ≥22)

```
apps/web/      Next.js 16 (App Router) + React 19 + Tailwind v4 + base-ui  → Vercel
apps/server/   Hono + PostgreSQL(Cloud SQL) + GCS + ffmpeg                 → Cloud Run
apps/api/      ⚠️ 레거시 (구 STEPD, Python FastAPI). 2026-06-30 이후 미사용.
               새 코드를 여기 넣지 말 것. 제거 여부 미결정.
docs/          UX 계획서·통합 매핑·백엔드 노트
packages/      비어 있음 (shared 자리만 있음)
```

`pnpm-workspace.yaml`의 `packages:`에 `apps/web`·`apps/server`가 등록돼 있어야
루트의 `pnpm -r build` / `pnpm --filter @stepd/server dev`가 동작한다.

---

## 백엔드 — apps/server

Hono 하나에 라우트를 전부 담은 단일 진입점 구조.

| 파일 | 역할 |
|------|------|
| `src/index.ts` | 모든 HTTP 라우트 (≈680줄). 여기 한 파일에 유지. |
| `src/db-pg.ts` | PostgreSQL 접근 전부. 엔티티는 JSON 블롭(`entity` 테이블) + 미디어/YouTube는 정규 테이블. |
| `src/ffmpeg.ts` | `hasFfmpeg` / `probe` / `captureThumbnail` / `trimEncode` |
| `src/pipeline.ts` | 추천 구간 생성 + ID 생성 |
| `src/storage-gcs.ts` | GCS 또는 로컬 파일 저장 (`GCS_BUCKET` 유무로 자동 판별) |
| `src/youtube.ts` | YouTube OAuth·채널 동기화 |
| `src/seed.ts` | 초기 시드 데이터 |
| `schema.sql` | 테이블 정의 |

**⚠️ 추천 구간 생성은 AI가 아니다.** `pipeline.ts`의 `buildRecommendations()`는
영상 길이를 2~5등분해 "오프닝·훅", "중반 핵심 장면" 같은 라벨을 붙이는 **휴리스틱**이다.
STT·Gemini 평가는 없다 (그 코드는 레거시 `apps/api`에만 있고 이식되지 않았다).

**⚠️ 배포(publish)도 아직 스텁이다.** `POST /api/distributions/publish`는 DB 상태만
`published`로 바꾼다. 실제 업로드는 하지 않는다. 반면 YouTube OAuth·채널 동기화·조회수
트렌드 조회는 실제로 동작한다.

**주요 라우트**
```
GET  /health                          # { ok: dbReady, ffmpeg }
GET  /api/state                       # 웹의 InitialData 전체 (엔티티 + 미디어)
GET  /api/media/:id/stream            # HTTP Range 스트리밍
GET  /api/media/:id/thumb
POST /api/media/upload                # 영상 업로드 → 회차 + 마스터 미디어 + 추천 생성
POST /api/recommendations/:id/adopt   # 채택 → ffmpeg 트림·인코딩 → 클립
POST /api/recommendations/:id/reject
POST /api/distributions/publish       # (스텁) 상태만 변경
POST /api/distributions/retry
GET  /api/youtube/auth · /callback · /channels · /sync/:id · /trends/:id · /videos/:id
```

**환경변수**
```
DATABASE_URL        Cloud SQL 접속 문자열 (없으면 DB 초기화 실패 — 서버는 뜨지만 API는 실패)
GCS_BUCKET          있으면 GCS 모드, 없으면 로컬 파일 모드
STEPD_STORAGE_DIR   로컬 모드일 때 저장 경로
GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / PUBLIC_URL    YouTube OAuth
PORT                Cloud Run이 주입 (8080). cloudbuild에서 직접 설정 금지 — 예약 변수.
```

**ffmpeg은 로컬 파일만 읽는다.** GCS 모드에서 트림·썸네일을 하려면 반드시 `/tmp`로 먼저
내려받아야 한다. 그리고 Cloud Run의 `/tmp`는 **RAM(tmpfs)** 이므로 작업 후 반드시 지울 것 —
안 지우면 업로드마다 메모리가 쌓여 OOM 난다.

---

## 프론트 — apps/web

```
src/app/(app)/          앱 셸(사이드바+상단바) 안의 화면들
  page.tsx              /                 오늘 할 일 (Inbox)
  programs/             /programs         콘텐츠(프로그램·회차)
  episodes/[id]/        /episodes/:id     회차 상세 (파이프라인 허브)
  recommendations/      /recommendations  추천 & 채택 보드
  clips/                /clips            클립
  distribution/         /distribution     배포
  analytics/            /analytics        성과
  channels/             /channels         채널 트렌드
  system/               /system           시스템 (YouTube 채널 연동)
src/app/(editor)/editor/[id]/   풀스크린 에디터
src/app/landing/        /landing          마케팅 랜딩 (구 STEPD에서 보존)
src/app/register/       /register         외부 협력자용 YouTube 채널 등록
src/components/ui/      디자인 시스템 프리미티브 (Card·Button·Table·EmptyState…)
src/components/shell/   AppShell·Sidebar·Topbar·JobCenter·CommandPalette
src/lib/data/           store.tsx(상태) · repository.ts(심) · api.ts(서버 클라이언트) · mock.ts(시드)
```

**데이터 레이어의 핵심:** `store.tsx`가 기동 시 `fetchState()`로 서버를 찔러보고,
**실패하면 조용히 목 데이터로 폴백**한다. 그래서 화면이 멀쩡해 보여도 실제로는 서버와
연결되지 않았을 수 있다. 연결 여부는 `NEXT_PUBLIC_API_URL`과 `/api/state` 응답으로 직접 확인할 것.

`repository.ts`의 `apiRepository`는 아직 throw 스텁 (M6에 연결 예정).

**환경변수:** `NEXT_PUBLIC_API_URL` (없으면 `http://localhost:4000`).
`NEXT_PUBLIC_API_BASE_URL`은 구 STEPD 것이며 **이 코드는 읽지 않는다.**

**경로 별칭:** `@/*` → `./src/*` (tsconfig.json). 코드가 `src/` 아래 있으므로 `./*`가 아니다.

---

## 배포

**서버 (Cloud Run — project=step-d, region=us-central1, service=stepd-server)**
```powershell
gcloud builds submit --config=cloudbuild.yaml --project=step-d
```
루트 `cloudbuild.yaml`이 `apps/server/Dockerfile`로 빌드 → Artifact Registry → Cloud Run 배포.
이미지에 ffmpeg이 포함된다. Cloud SQL·시크릿 연결은 cloudbuild.yaml의 `--set-secrets` 참고.

**웹 (Vercel)** — `apps/web`. `NEXT_PUBLIC_API_URL`을 Cloud Run URL로 지정해야 실서버에 붙는다.

---

## 작업 규칙

- **배포는 명시적 요청 시에만.** "ㄱㄱ", "배포해줘" 없이 git push·Cloud Build 실행 금지.
- **`.env*`, `gcp-keys/` 절대 커밋 금지.** (2026-07-14에 개인키가 공개 리포에 올라간 사고 있었음 — 커밋 전 `git status` 확인)
- 서버 라우트는 `apps/server/src/index.ts` 한 파일에 유지 — 분리하지 말 것.
- 프론트 API 함수 추가: `apps/web/src/lib/data/api.ts`에 타입 + 함수 함께.
- 새 화면 추가: `src/app/(app)/<route>/page.tsx` + `src/lib/nav.ts`의 `NAV` 배열에 항목 추가.
- 검증: `apps/server`는 `npx tsc --noEmit`, `apps/web`은 `npx next build` (타입체크 포함).

---

## 상세 문서

- [docs/step-d-ux-plan.md](docs/step-d-ux-plan.md) — UX 재설계 계획·IA·마일스톤
- [docs/integration-map.md](docs/integration-map.md) — 백엔드 연결 매핑
- [docs/backend-notes.md](docs/backend-notes.md) — 백엔드 설계 노트
