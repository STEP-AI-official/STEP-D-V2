# STEP-D V2 — Claude 컨텍스트

## 프로젝트 개요

AI 기반 쇼츠 자동 생성 B2B SaaS. 긴 영상(유튜브 URL 또는 MP4 업로드)을 입력받아
STT → AI 후보 탐지 → Gemini 비전 평가 → 경계 정제 → 9:16 쇼츠 렌더링 파이프라인으로
최대 8개 클립을 자동 생성한다. PPL 분석, YouTube 업로드, 편집 기능 포함.

**대상 고객:** 방송사·MCN·광고주 (한국어 콘텐츠 특화)  
**현재 단계:** Phase 3 완료, Phase 4 일부 완료. 영업 전 데모 단계.

---

## 모노레포 구조

```
STEP-D-V2/
├── apps/api/          # FastAPI 백엔드 (Python 3.12)
│   ├── app/
│   │   ├── api/routes.py        ← 모든 HTTP 엔드포인트 (1개 파일)
│   │   ├── api/youtube.py       ← YouTube OAuth·업로드·분석 엔드포인트
│   │   ├── core/config.py       ← 모든 설정값 (pydantic Settings)
│   │   ├── models.py            ← DB 모델 (Job, Clip, YouTubePublish, YouTubeChannel, User)
│   │   ├── schemas.py           ← Pydantic 응답 스키마
│   │   ├── services/
│   │   │   ├── pipeline.py      ← 메인 AI 파이프라인 (STT→후보→평가→렌더)
│   │   │   ├── candidates.py    ← 후보 탐지 + 경계 정제
│   │   │   ├── ffmpeg.py        ← 모든 ffmpeg 작업 (컷·렌더·자막·썸네일·무음탐지)
│   │   │   ├── gemini.py        ← Gemini API 호출 (비전·텍스트)
│   │   │   ├── subtitles.py     ← ASS 자막 생성
│   │   │   ├── scoring.py       ← Gemini(70%) + local(30%) 최종 점수
│   │   │   ├── korean_shorts.py ← 한국어 훅 키워드 점수 엔진
│   │   │   ├── ppl.py           ← PPL 분석 + 음성 언급 탐지
│   │   │   ├── youtube_analytics.py ← YouTube 성과 조회·댓글 요약
│   │   │   └── ...
│   │   └── prompts/
│   │       ├── title_options.py    ← 쇼츠 제목 생성 프롬프트 (5가지 바이럴 패턴)
│   │       └── clip_evaluation.py  ← Gemini 클립 평가 프롬프트
│   └── Dockerfile
├── apps/web/          # Next.js 프론트엔드 (TypeScript)
│   ├── app/page.tsx             ← 진입점 (ConsoleProvider + ConsoleShell 렌더만)
│   ├── app/components/console/
│   │   ├── ConsoleProvider.tsx  ← 모든 상태·핸들러 (≈1200줄, Context 노출)
│   │   ├── ConsoleShell.tsx     ← 레이아웃 (Sidebar+Topbar+스크린라우터)
│   │   └── screens/             ← Dashboard·Channels·Studio·Schedule·Commerce·Report·Settings
│   ├── app/components/ShortcutEditor.tsx ← 클립 에디터 컴포넌트
│   ├── lib/api.ts               ← 백엔드 API 클라이언트 함수 전체
│   └── lib/console/             ← theme·format·map·dummy 유틸
├── apps/docs/         ← 상세 문서 (architecture.md, feature-status.md, dev-guide.md)
├── docker-compose.prod.yml
└── Caddyfile
```

---

## AI 파이프라인 핵심 흐름

```
업로드/YouTube URL
  → extract_audio() → OpenAI Whisper → transcript.json (segments + words + timestamps)
  → detect_candidates() — 한국어 훅 키워드로 후보 구간 추출, local_score 계산
      · ANCHOR_PRE_ROLL = 2.5s, overlap_ratio < 0.35, 최대 30개
  → refine_candidates() — 발화 경계·문장 종결(다/요/죠/네 등) 스냅
      · start_lookback=8s, end_lookahead=10s, pre_pad=0.7s, post_pad=1.2s
  → Gemini Vision 평가 (최대 20개 후보, 클립당 7프레임)
      · hook/emotion/retention/shareability 점수
  → final_score = Gemini*0.70 + local*0.30
  → 상위 8개 cut_clip() → 9:16 1080×1920, blur background, ASS 자막
  → extract_thumbnail() → JPEG
  → Job.status = completed
```

---

## 주요 DB 모델 (models.py)

```python
Job: id(str UUID), status, input_path, duration, progress(0-100), metadata_json
Clip: id, job_id, rank, title, score, start_time, end_time, video_url, thumbnail_url,
      transcript, evaluation_json(creative_settings 포함), ppl_analysis_json
YouTubePublish: id, clip_id, status, youtube_video_id, metadata_json
YouTubeChannel: id, channel_id, access_token, refresh_token, is_default
```

`evaluation_json` 내부:
- `creative_settings.editor_state.hl` — 자막 하이라이트 색상
- `creative_settings.editor_state.captionsOn` — 자막 on/off
- `creative_settings.burn_overlays` — 텍스트/이미지 오버레이 목록
- `render_revision` — 재렌더 횟수 (캐시 무효화용)

---

## API 엔드포인트 패턴

- 모든 API: `/api/...` prefix, `apps/api/app/api/routes.py` 단일 파일
- YouTube 관련만 `apps/api/app/api/youtube.py`
- 응답 스키마: `apps/api/app/schemas.py` (ClipResponse에 job_id 포함)

**자주 쓰는 엔드포인트:**
```
POST /api/upload                         # MP4 업로드
POST /api/jobs/from-youtube              # YouTube URL 임포트
GET  /api/jobs/{job_id}                  # 진행 상태
GET  /api/jobs/{job_id}/results          # 클립 목록
POST /api/clips/{clip_id}/retrim         # 시작/끝 재조정
POST /api/clips/{clip_id}/creative/apply # 템플릿·오버레이 적용
POST /api/clips/{clip_id}/ppl            # PPL 분석
GET  /api/jobs/{job_id}/ppl-report       # 브랜드 통합 리포트
GET  /api/jobs/{job_id}/ppl-report/csv   # CSV 내보내기
GET  /api/jobs/{job_id}/silence-report   # 무음 구간 탐지
GET  /api/clips/{clip_id}/youtube-stats  # 실시간 조회수·좋아요
GET  /api/youtube/clips/{clip_id}/comments?summarize=true  # AI 댓글 요약
```

---

## 스토리지 구조

```
/data (프로덕션) 또는 ./storage (로컬)
├── uploads/{job_id}/source.mp4
└── jobs/{job_id}/
    ├── transcripts/transcript.json   ← STT 결과 (segments + words + timestamps)
    ├── clips/short_001.mp4, .ass
    ├── thumbnails/short_001.jpg
    └── assets/                       ← 오버레이 이미지
```

---

## 설정 오버라이드 (config.py 기본값)

| 설정 | 기본값 | 메모 |
|------|--------|------|
| `GEMINI_MODEL` | gemini-3.5-flash | |
| `FINAL_CLIP_COUNT` | 8 | |
| `MIN_CLIP_SECONDS` | 20 | |
| `MAX_CLIP_SECONDS` | 75 | |
| `TARGET_CLIP_SECONDS` | 38 | |
| `SHORTS_SUBTITLE_FONT_NAME` | G마켓 산스 TTF Bold | VM env에서 Noto로 오버라이드 중 → 해제하면 G마켓 산스 적용 |
| `GEMINI_MAX_EVAL_CANDIDATES` | 20 | |
| `FRAME_COUNT_PER_CANDIDATE` | 7 | |

---

## VM 배포 방법 (중요!)

**VM: GCP Compute Engine, 프로젝트=step-d, zone=asia-northeast3-a, vm=shorts-api**  
**앱 위치: `/home/STEPAI05/app/`**  
**⚠️ SCP 방식 불가 (권한 문제). 반드시 git pull + docker compose 사용.**

```powershell
# 로컬에서 한 줄 배포
gcloud compute ssh shorts-api --project=step-d --zone=asia-northeast3-a `
  --command="sudo bash -c 'cd /home/STEPAI05/app && git pull origin main && docker compose --env-file apps/api/.env.production -f docker-compose.prod.yml up -d --build 2>&1'"
```

**환경변수 파일 (VM):**
- `/home/STEPAI05/app/.env` — Caddy용 (API_DOMAIN, ACME_EMAIL 등)
- `/home/STEPAI05/app/apps/api/.env.production` — FastAPI용 (API 키, DB URL 등)
- ⚠️ 절대 커밋하지 말 것

---

## 작업 규칙

- **배포는 명시적 요청 시에만.** "ㄱㄱ", "배포해줘" 같은 명령 없이 git push나 VM 배포 금지.
- **`.env*` 파일 절대 커밋 금지.**
- `apps/api/app/api/routes.py`는 1개 파일에 모든 엔드포인트 — 분리 금지.
- 새 엔드포인트 추가: routes.py 맨 아래에 추가, 스키마는 schemas.py에.
- 프론트 API 함수 추가: `apps/web/lib/api.ts`에 타입 + 함수 함께.
- 한국어 처리 관련은 반드시 `korean_shorts.py`의 HOOK_CATEGORIES 참고.

---

## 상세 문서

- [product-vision.md](apps/docs/product-vision.md) — 제품 비전·로드맵
- [architecture.md](apps/docs/architecture.md) — 전체 기술 스택·API 목록·인프라
- [feature-status.md](apps/docs/feature-status.md) — 기능별 완료 상태
- [dev-guide.md](apps/docs/dev-guide.md) — 로컬 개발·VM 배포 상세
