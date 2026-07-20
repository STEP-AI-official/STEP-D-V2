# 계획서 — STEP D 채널 도메인 적응 학습 (코드 정합 개정판 v2)
### "롱폼의 어떤 포인트가 고성과가 되는가"를 학습해 추천 엔진을 강화한다
개정 2026-07-20 · ㈜스텝에이아이 · **기준: 현행 코드 실측 + [docs/research/highlight-model-feasibility.md](../research/highlight-model-feasibility.md)(2026-07-17)**

> v1 대비 변경: 매칭·라벨·모델 삽입 지점을 실제 코드에 맞춰 정정. 이 문서는 기존 실현가능성
> 조사 문서를 **실행 계획으로 구체화**한 것이며, 상세 근거는 그 문서(파일·라인 인용)를 따른다.
>
> **2026-07-20 코드 대조 시 정정된 2건**(원문 → 확인된 사실):
> 1. **§7 "라벨 유실"은 사실이 아니다.** 추천 재실행의 DELETE는 `status='pending'` 한정이라
>    (`content-pipeline.ts:306-307`, 내 커밋 이전부터 동일) **채택/거절 라벨은 덮이지 않고 영속한다.**
>    → 1단계의 "라벨 스냅샷 배치"는 라벨 보존 목적으로는 불필요하다(§6 참고).
> 2. 부록 라인 번호 일부가 낡아 있었다(adopt 900→**1520**, reject 941→**1570**,
>    link-video 1093→**1754**, `apply_profile_fit` 166→**170**, `fetchVideoAnalytics` 544→**553**).
>    `apply_learned_rerank :208` · `recommend :641` · `video_retention :166` · `content_analysis :220`은 정확.

---

## 0. 한 줄 요약
연결된 대형 채널의 **① 운영자 채택/거절 라벨 + ② 유튜브 리텐션 커브 + ③ 발행 숏폼 성과(연령보정 tier)** 를
피처와 조인해, `recommend.py`의 **예약된 재랭킹 자리(`apply_learned_rerank`)** 에 경량 학습 스코어러를 얹어
Gemini 추천을 채널 도메인에 맞게 보정한다. Gemini 파이프라인은 그대로 두고 **후처리 재랭킹만** 추가한다.

---

## 1. 코드 실측 — 이미 있는 것 / 없는 것 (v1 가정 정정)

| 요소 | 상태 | 실제 코드 |
|---|---|---|
| 숏폼→롱폼 **자동 매칭** | ✅ 있음 | `core/align.py`(오디오 상호상관, offset/score/peak_ratio, 임계 0.80·1.25) + 잡 `match.align`(`worker.ts:handleMatchAlign`) → **`short_source_map` 정규 테이블** |
| 매칭 검수 UI | ✅ 있음 | Lab `admin/src/tabs/MatchTab.tsx`(롱폼 선택→숏폼 다중선택→구간 지정→🎯자동추적) + `/api/lab/match/*` |
| **LEARN 데이터셋 export** | ✅ 있음 | `GET /api/lab/match/export/:channelId` — pair별 `short/performance/source`. **성과는 절대조회수 금지, ±90일 동시기 중앙값 대비 ratio·tier(high≥2/mid≥0.7/low)** |
| 운영자 채택/거절 라벨 | ✅ 영속 | `recommendation` 엔티티 adopted/rejected(+사유) (`index.ts:1520·1570`) |
| 리텐션 커브(구간 이탈) | ✅ 수집 | `youtube.ts:fetchVideoAnalytics :553` → `video_retention.curve` JSONB(audienceWatchRatio) |
| 후보 피처(대부분) | ✅ 영속 | `content_analysis.data.scenes[]`: heur 5신호(faces·motion·audio·caption·dialogue)+vision_score+hook+on_screen |
| 프로그램 프로파일 재랭킹 | ✅ 있음 | `profile.ts`(hookWeights 8종 등) → `recommend.py:apply_profile_fit :170`(`final=appeal×program_fit`) |
| **학습형 재랭킹 자리** | ⏳ **예약된 no-op** | `recommend.py:apply_learned_rerank :208` — 시그니처(`model`·`channel_ctx`)만 있고 미구현. **여기가 모델 삽입 지점** |
| 라벨↔피처 조인 배치 | ❌ 없음(신규) | 라벨=recommendation 엔티티, 피처=content_analysis — 조인 키 `episodeId+start/end` 배치 필요 |
| 후보 단위 피처 집계기 | ❌ 없음(신규) | scenes[] → 구간 피처 벡터 |
| 클립↔게시영상 폐루프 | ⚠️ 반자동 | `link-video :1754` 수동 경로 외에, **실업로드 성공 시 `worker.ts`가 `publishedVideoId`를 자동 기록**한다(단 `YOUTUBE_UPLOAD_ENABLED` 기본 off라 실적 0건) |

**정정 요지**: 매칭·성과라벨·피처는 대부분 이미 코드에 있다. **순수 신규는 (a) 라벨↔피처 조인 배치, (b) 후보 피처 집계기, (c) 학습·서빙 코드**뿐.

### 1-1. 자동 매칭 실측치 (2026-07-20)
`core/align.py`의 채택 임계값은 추정이 아니라 실측으로 잡았다 — 하하PD `[ㅈㄸㄸ원정대5]`(61분) 롱폼과
실제 발행 숏폼 4건, 대조군 10건:

| 구분 | score | peak_ratio |
|---|---|---|
| 양성(진짜 그 롱폼에서 잘린 숏폼) | 0.886 ~ 0.998 | 1.66 ~ 1.82 |
| 음성(무관·다른 회차) | 0.403 ~ 0.601 | 1.00 ~ 1.09 |
| 합성 정답컷(동일 오디오) | 0.966 ~ 0.991 | — (오프셋 오차 4ms) |

→ `score ≥ 0.80 AND peak_ratio ≥ 1.25`. 양·음성 간격이 넓어 오탐/미탐 모두 여유가 있다.
**중요**: 이미 잘라낸 클립을 롱폼으로 쓰는 채널(예: ENA 나는솔로 클립)에서는 원본이 아니므로 매칭되지 않는다.
원본 롱폼이 존재하는 채널에서만 유효하다.

---

## 2. 라벨 — 무엇을 정답으로 쓰나 (코드 기준)
"제목→조회수"가 아니라, 이미 영속되는 3계열을 쓴다.

1. **운영자 채택/거절** (주력·저비용) — adopt=1 / reject=0(+사유). 자사 자산, 바우처와 무관.
   재분석해도 pending만 삭제되므로 **누적 보존된다**(위 정정 1).
2. **원본 롱폼 리텐션 커브** — 구간별 시청유지율. "원본의 어느 구간이 붙들었나" = 하이라이트 선정의 직접 라벨.
3. **발행 숏폼 성과 tier** — LEARN export의 연령보정 ratio(±90일 중앙값 대비). "우리가 뽑은 게 실제 터졌나"(검증용, 폐루프 자동화 후 편입).

> 초기에는 **①+② 로 학습**, ③은 폐루프 자동화(3단계) 후 편입. (feasibility §3-3)

---

## 3. 피처 — 대부분 이미 산출됨 + 채널 과적합 방지
후보 `[start,end]` 구간의 `scenes[]`를 집계해 피처 벡터를 만든다. **채널 과적합을 막기 위해 두 계열로 분리**(feasibility §5-3):

- **채널-공통(이식 가능)**: heur 5신호, vision_score(+`_prefiltered` 플래그), hook, 컷밀도, 자막·대사밀도, on_screen_names.
- **채널-특화(취향 보정)**: 채널 평균 리텐션 형태, 선호 훅 분포, 인구통계, length-fit → **원-핫 채널ID 금지, 채널 통계량으로 파라미터화**(신규 채널 콜드스타트 완화).
- 추가 여지(선택): 자막 감정밀도, 얼굴 면적비율, 음성 고조 — 초기엔 없이 시작.

> ⚠️ 조인 시 주의: `recFromShort`(`content-pipeline.ts`)가 엔티티로 옮길 때 **hook·program_fit·final_score를
> 버린다.** 따라서 라벨(recommendation)에서 hook을 바로 읽을 수 없고, `content_analysis.data.shorts`를
> 되읽어 `episodeId + start/end` 근사 매칭으로 붙여야 한다. 이게 (a) 조인 배치가 필요한 실제 이유다.

---

## 4. 모델 — 삽입 지점 · 종류 · 도입 시점
### 삽입 지점
`recommend.py`의 후처리 체인 `apply_profile_fit → validate_shorts` 사이, **예약된 `apply_learned_rerank`** 에 합류.
`final = appeal(Gemini) × program_fit × channel_fit × learned`. 모델 부재/저신뢰 시 **non-destructive 폴백**(현행 유지).

### 종류
**LightGBM/gradient boosting** (딥러닝 아님). 근거: 라벨 ~3,000 + 테이블형 피처엔 부스팅이 정합, CPU 학습, 워커 VM 서빙, `core/requirements.txt` ML 의존성 0건에서 가벼운 추가.
초기 타깃: **채택 이진분류(채택확률) 하나로 시작** → 이후 리텐션 LambdaMART 확장.

### 도입 시점 (= "학습형이 프롬프트형을 언제 이기나"의 코드화된 답)
팀 로드맵의 **2단계 오프라인 A/B 게이트**로 이미 정의됨: `content_analysis.data.shorts`를 읽어
(현행 Gemini 순위) vs (학습 재랭킹) 를 **채택률·리텐션 상위 일치도**로 비교, **채널/영상 hold-out**에서
현행을 **유의미하게 상회할 때만** 파이프라인 편입. 그 전엔 프롬프트+프로파일 유지.

---

## 5. 파일럿 실증 재해석 (정직)
연동 채널(드나드나) 발행 숏폼 48 + 롱폼 30 실조회수로 예비 검증한 결과:
- 견고: 동일 회차 롱폼→숏폼 조회수 평균 9.28배 → **포인트 선정이 성과를 좌우**.
- 견고(음성): **제목 표면 피처만으론 예측 불가**(LOOCV 0.479, AUC 0.385).
- 방향성(미확정): 채널 콘텐츠·맥락 학습 시 0.604(AUC 0.59), 단 **p=0.097·표본 48로 통계적 미확정**.
→ 시사점: 표면 피처가 아니라 **코드에 이미 있는 콘텐츠 피처(heur·vision·리텐션)** 로, 위 A/B 게이트로 제대로 검증해야 한다.

---

## 6. 로드맵 (코드 매핑 · feasibility §7 준용)
- **1단계 — 오프라인 데이터셋(신규 학습 없음)**: 라벨↔피처 조인 배치 + 후보 피처 집계기 + 리텐션 구간 매핑
  → `(피처 → 라벨)` 데이터셋. **병목의 대부분.**
  (v1의 "라벨 스냅샷 배치"는 제외 — 채택/거절은 이미 영속한다. 다만 **거절 사유 스키마화**는 남는다:
  현재 `rejectReason`이 자유 문자열이라 부정 라벨의 세분화가 불가능하다.)
- **2단계 — 학습 + 오프라인 A/B(파이프라인 미변경·무위험)**: LightGBM 채택확률 학습(채널 hold-out) → 현행 vs 재랭킹 비교 → 게이트.
- **3단계 — 편입(non-destructive) + 폐루프**: `apply_learned_rerank` 활성화 + 실업로드 활성화(`YOUTUBE_UPLOAD_ENABLED`)로
  발행 성과 라벨 편입 → 재학습 주기화. 채널 늘면 채널-특화 통계·추가 피처 확장.

---

## 7. 리스크 (코드 근거)
- **NCC 바우처 분리(최우선)**: "데이터 학습 활용"과 "라벨링 수행 주체(콴엔터 명의 3,000클립)"는 **서류·저장소·정산에서 물리 분리**. 자사가 라벨링을 대행한 것처럼 섞이면 반려·환수. 자사 채택/거절 라벨을 주력으로 두어 바우처 의존도↓.
- ~~**라벨 유실**~~ → **정정**: 재분석 DELETE는 pending 한정이라 채택/거절은 보존된다(`content-pipeline.ts:306-307`).
  남는 실제 위험은 **거절 사유가 비구조 문자열**이라는 점(부정 라벨을 세분화할 수 없다).
- **채널 과적합/누수**: 채널-공통·특화 분리, 채널 통계 파라미터화, **영상 단위 hold-out 강제**.
- **매칭 적용 범위**: 원본 롱폼이 없는 채널(이미 잘린 클립을 롱폼으로 올리는 편성)에는 오디오 매칭이 성립하지 않는다(§1-1).
- **폐루프 미완결**: 실업로드가 기본 off → ①②로 먼저 학습, ③은 활성화 후.
- **라벨 희소성**: 저트래픽 영상 리텐션 400(빈 커브) → 최소표본 게이트.
- **PII/리전**: 프레임·자막 개인정보 → 서울 리전·접근통제 유지, 크로스보더 금지.

---

## 8. 산출물 & 성공 기준
- 산출물: 오프라인 데이터셋(라벨↔피처) · LightGBM 재랭커 · **오프라인 A/B 리포트(현행 vs 재랭킹)** · (게이트 통과 시) `apply_learned_rerank` PR.
- 성공 기준(기술): 채널 hold-out에서 재랭킹이 **채택률·리텐션 상위 일치도**를 현행 대비 유의미 상회.
- 성공 기준(사업): 위 실증을 IR·영업 레퍼런스로. **엔진 강화 주장은 오프라인 A/B(프록시 아님)로만 확정.**

---

## 부록 — 핵심 코드 위치 (2026-07-20 실측)
- 매칭: `core/align.py` · `worker.ts:handleMatchAlign`(match.align, content 레인) · `db-pg.ts:upsertShortSourceMap`(short_source_map, migrations/0005·0006)
- LEARN export: `GET /api/lab/match/export/:channelId` · Lab `admin/src/tabs/MatchTab.tsx`
- 추천·재랭킹: `core/recommend.py`(`recommend` :641, `apply_profile_fit` :170, **`apply_learned_rerank` :208 예약**, `validate_shorts` :446)
- 프로파일: `apps/server/src/profile.ts`(`normalizeProfile`) · `/api/programs/profile/generate`
- 라벨: `index.ts`(adopt :1520, reject :1570, link-video :1754)
- 성과·리텐션: `youtube.ts:fetchVideoAnalytics :553` · `db-pg.ts`(video_retention :166, content_analysis :220)
- 설계 근거(정본): [docs/research/highlight-model-feasibility.md](../research/highlight-model-feasibility.md)
