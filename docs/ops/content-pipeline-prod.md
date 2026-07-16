# 콘텐츠 파이프라인 실서비스 배선

업로드한 영상을 AI가 분석해 쇼츠를 추천하는 파이프라인(core/)을 실서비스에 연결한 구조.
2026-07-16.

## 전체 흐름

```
웹 업로드 → apps/server(Cloud Run) /api/media/upload
      │        (대용량은 upload-init → 브라우저→GCS 직행 → finalize, 같은 꼬리로 합류)
      │  episode.pipeline={stage:analyze, progress:30} + content_analysis=pending
      │  + enqueue("content.analyze", {mediaId}, dedupeKey="content.analyze:<mediaId>")
      ▼
   job_queue (Cloud SQL — 코드 생성 테이블, 아래 함정 참고)
      ▼
워커 VM(stepd-worker, e2-small, GPU 없음)  ── content-pipeline.ts
      │  GCS에서 영상 다운로드 → python -m core.analyze
      │  (STT→정제→장면→프레임분석[시각채점+이름자막 통합 1호출]→쇼츠추천[장르 자동감지·후보→합성 2단계])
      │  · 단계별 체크포인트(stt/refined/scenes/shorts.json) — 재시도 시 완료 단계부터 재개
      │  · @@PROGRESS 라인 → episode.pipeline에 단계별 진행률 실시간 반영
      ▼
   content_analysis(mediaId, data=결과JSON) ← saveContentAnalysis
      ├─ 프레임+단계 산출물 → GCS analysis/{mediaId}/ 영구 저장 (data.framesBase)
      ├─ AI 쇼츠 → 회차 추천 보드에 기록 (writeRecommendationsFromShorts, 멱등·appeal은 AI 산출)
      └─ episode.pipeline={stage:recommend, stageStatus:done, progress:100}
      ▼
웹: 회차 상세 분석 탭이 GET /api/media/:id/analysis 조회 + 추천 & 채택 보드에 쇼츠 노출
```

**핵심: 전 단계가 GPU-free다** (STT까지 Gemini 오디오). e2-small 워커에서 그대로 돈다.
GPU VM 불필요.

**추천 보드 배선** — 분석이 끝나면 워커가 shorts를 회차의 추천 엔티티(kind=recommendation)로
변환해 기록한다(`content-pipeline.ts` `writeRecommendationsFromShorts`). 재실행 시 해당 회차의
기존 추천을 전부 지우고 다시 쓰는 멱등 동작이라 중복이 쌓이지 않고, rank 1이 보드 맨 앞에 온다.
업로드 시 휴리스틱 더미 추천은 더 이상 만들지 않는다 — 보드는 비어 있다가 AI 결과로 채워진다.

## 구성 요소

| 파일 | 역할 |
|------|------|
| `core/analyze.py` | 전 스테이지 오케스트레이터(단일 진입점). `python -m core.analyze <video> --out <dir>` → analysis.json |
| `core/asr.py` | STT provider 스위치. `STT_PROVIDER=gemini`(기본, 관리형) / `whisper`(로컬 GPU) |
| `apps/server/src/content-pipeline.ts` | 워커측 실행기: 영상 다운로드 → analyze.py 스폰(진행률 파싱) → 결과 DB 저장 + 프레임/산출물 GCS 영구 저장 + 추천 보드 기록 + episode.pipeline 갱신. 미디어별 고정 작업 디렉토리(`$TMP/stepd-content/<mediaId>`)로 재시도 시 체크포인트 재개, 48h TTL 청소 |
| `apps/server/src/queue.ts` | `content.analyze` 잡 타입 + `job_queue` 런타임 생성 |
| `apps/server/src/worker.ts` | `content.analyze` 케이스 → `runContentAnalyze` 호출 |
| `apps/server/src/db-pg.ts` | `content_analysis` 테이블(런타임 생성) + `markContentAnalysisPending`/`saveContentAnalysis`/`getContentAnalysis` |
| `apps/server/src/index.ts` | 업로드 시 enqueue + `GET /api/media/:id/analysis` + `POST /api/admin/queue/purge` |
| `deploy/worker-pipeline-setup.sh` | 워커 VM에 파이썬 파이프라인 설치 (최초 1회) |
| `deploy-worker.ps1` (루트) | 워커 코드 갱신(재배포) 스크립트 |

**⚠️ 스키마 함정:** `content_analysis`와 `job_queue`는 `apps/server/schema.sql`에 **없다**.
각각 db-pg.ts(initDb)와 queue.ts(initQueue)가 기동 시 `CREATE TABLE IF NOT EXISTS`로 런타임
생성한다. 새 DB를 schema.sql만으로 부트스트랩하면 이 둘이 빠져 보이지만, 서버/워커 첫 기동 때
자동으로 생긴다.

## 진행 상태와 실패 처리

- **진행 상태** — `content_analysis.status`(pending/done/failed)와 별개로, 워커가
  **episode.pipeline**에 실제 상태를 기록한다. 업로드 시 서버가
  `{stage:'analyze', stageStatus:'progress', progress:30}`으로 시작하고(index.ts), 이후
  analyze.py가 stdout으로 내보내는 `@@PROGRESS {stage,pct,note}` 라인을 워커가 파싱해
  단계별 진행률("음성 인식 12/40 윈도우", "프레임 분석 60/182" 등)을 실시간 반영한다
  (2% 또는 3초 간격 스로틀). 완료 시
  `{stage:'recommend', stageStatus:'done', progress:100, note:'AI 쇼츠 추천 N건'}`.
- **실패 경로** — 오류 시 워커가 `content_analysis`에 `status='failed'` + `error`(메시지
  1000자 절단)를 저장하되, **완료된 단계의 결과는 유실하지 않는다**: 작업 디렉토리의
  체크포인트에서 transcript/scenes를 회수해 `data={partial:true, stagesDone, …}`로 같이
  저장하고, 디렉토리 자체도 남겨 둔다. 큐가 지수 백오프로 재시도하면(기본 maxAttempts 5)
  같은 디렉토리의 체크포인트에서 **완료 단계를 건너뛰고 재개**한다 — STT 완료 후 vision에서
  죽어도 STT 비용을 다시 내지 않는다. 소진되면 `job_queue`에 `failed`로 남고, 작업
  디렉토리는 48h TTL 청소가 회수한다.

## 워커 VM 배포

**최초 1회 — 파이썬 환경 설치:**

```bash
# 워커에 파이썬 파이프라인 환경 설치 (ffmpeg + venv + core deps, GPU 불필요)
gcloud compute ssh stepd-worker --zone us-central1-a \
  --command "cd /opt/stepd && sudo git pull && sudo bash deploy/worker-pipeline-setup.sh"

# 워커 서비스 env에 파이썬 경로 추가 (systemd EnvironmentFile 또는 서비스에)
#   CORE_PYTHON=/opt/stepd/core/.venv/bin/python
# 그리고 워커 재시작
```

워커 SA(stepd-deployer)는 이미 `roles/aiplatform.user` 보유 → Vertex(Gemini) ADC 인증 자동, 키 불필요.

**이후 코드 갱신(재배포) — 루트 `deploy-worker.ps1`:**

```powershell
.\deploy-worker.ps1            # 재시작 생략은 -SkipRestart
```

VM에 SSH해 `git fetch` + `git reset --hard origin/main` + `systemctl restart stepd-worker`를
한 번에 실행한다. 워커는 tsx로 소스를 직접 실행하므로 빌드가 없고, `reset --hard`라 VM의 로컬
변경은 폐기된다(멱등). 파이썬 의존성이 바뀌었으면 worker-pipeline-setup.sh를 다시 돌려야 한다.

## 운영 복구 (큐가 막혔을 때)

- 업로드 enqueue는 dedupeKey `content.analyze:<mediaId>`를 쓴다. **pending/running인 동일
  키만** 충돌하는 부분 유니크 인덱스라, 끝난 잡은 다시 넣을 수 있고 재기동 시 중복이 안 생긴다
  (충돌 시 enqueue는 null 반환·스킵).
- `POST /api/admin/queue/purge` (body `{"confirm":"PURGE"}`) — video.* 잡 홍수에
  content.analyze가 굶을 때의 원샷 복구 라우트:
  1. `video.*` 백로그(pending/failed) 삭제 — 다음 채널 틱에 재생성되므로 안전
  2. 미디어가 이미 지워진 좀비 content.analyze 잡 삭제 ("media not found"로 영원히 실패하는 것들)
  3. 살아남은 content.analyze를 pending·attempts=0으로 리셋해 즉시 실행
  4. 모든 master 미디어에 analyze 잡 존재 보장 (잡이 유실/미생성된 경우 커버, dedupe가 중복 스킵)

## 잡 네임스페이스 (다른 트랙과 조율)

- **`content.*`** — 업로드 콘텐츠 분석 (이 문서, core/ 파이썬 파이프라인)
- **`channel.* / video.*`** — YouTube 채널·영상 애널리틱스 (별도 트랙, TS 구현 — [pipeline-current.md](pipeline-current.md))

둘은 같은 워커·큐·DB를 공유하되 잡 타입·핸들러·테이블이 분리돼 충돌하지 않는다.
큐 자체(클레임·백오프·dedupe)의 상세는 [worker-queue.md](worker-queue.md).

## 남은 것 (v1 이후)

1. ~~장면 프레임 호스팅~~ — **완료(2026-07-16).** 워커가 성공 시 프레임+단계 산출물을
   `analysis/{mediaId}/`로 GCS 업로드하고(`persistArtifacts`), 서버가
   `GET /api/media/:id/analysis/frames/:name`으로 스트리밍한다. admin reset이 prefix째 지운다.
   웹/Lab UI에서 이 프레임을 실제로 그리는 화면은 아직 없음(다음 단계).
2. **처리량** — 시각채점+이름자막을 프레임당 1호출로 통합해 이미지 호출이 절반이 됐다
   (8분 영상 182→91). 90분 회차도 ~500 호출 수준. 동시 회차가 몰리면 Vertex 리전 쿼터가
   천장(리뷰 R5) — 전역 레이트리미터·배치 API 오프로드 검토는 유효.
3. ~~진행 상태 세분화~~ — **완료(2026-07-16).** analyze.py `@@PROGRESS` → 워커 파싱 →
   episode.pipeline 반영 (위 섹션).
4. ~~admin 연결~~ — **완료(2026-07-16).** 회차 상세 분석 탭이
   `getMediaAnalysis`(apps/web/src/lib/data/api.ts)로 `/api/media/:id/analysis`(DB)를 읽어
   실제 content_analysis를 렌더한다(apps/web/src/components/episode-detail.tsx).
5. **장르 수동 지정** — 추천 장르는 현재 자동 감지(`--genre auto`)뿐. 프로그램/회차에
   장르 필드를 붙여 `content.analyze`에 넘기면 감지 호출 1회를 아끼고 오분류를 막는다.

## 로컬 테스트

```bash
# 오케스트레이터 단독 (전 스테이지)
core/.venv310/Scripts/python -m core.analyze core/영상.mp4 --out /tmp/out
# → /tmp/out/analysis.json (transcript + scenes + shorts)
```
