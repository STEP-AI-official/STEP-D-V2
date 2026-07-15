# OpenCut 통합 계획 (웹 에디터 고도화)

> 2026-07-15 조사. 결론: **통포크 금지, v0.3.0 태그에서 부품만 발췌 이식.**

## 조사 결과

| 항목 | 내용 |
|------|------|
| 라이선스 | **MIT** — 상용 SaaS 임베드·수정 자유, 저작권 고지만 유지 |
| 규모·활동 | 50.2k stars, 1,565 커밋, 최신 릴리스 v0.3.0 (2026-04) — 활발 |
| ⚠️ 핵심 반전 | **main 브랜치는 전면 재작성 중** — 에디터 코드가 제거된 빈 스캐폴드(Vite+TanStack Router, shadcn UI만 존재). 비즈니스 로직을 Rust(GPU 컴포지터, WASM)로 이전하는 중 |
| 안정 코드 | **v0.3.0 태그** — Next.js App Router, 에디터 컴포넌트 ~12,300 LOC, `opencut-wasm`(컴포지터) 의존 |
| 아키텍처 성격 | 로컬 우선(파일이 기기에, IndexedDB 저장, 브라우저 내 렌더) — **우리(서버 미디어 GCS + 서버 ffmpeg 렌더)와 정반대** |

## 왜 통포크가 아닌가

1. main이 재작성 중이라 포크해도 업스트림 추적이 무의미 (구조가 통째로 바뀌는 중).
2. 로컬 우선 모델이 우리 B2B 모델과 상충 — 방송 마스터를 브라우저에 내려받게 할 수 없음.
3. `opencut-wasm` GPU 컴포지터 의존 — 우리는 프리뷰를 `<video>` + 오버레이로, 최종 화질은 서버 렌더로 해결하므로 불필요한 복잡도.
4. 우리 레포에 이미 에디터 골격 존재 (`apps/web/src/components/editor/`: editor-shell·timeline·preview·panel) — 갈아엎을 이유 없음.

## 이식 계획

### Phase 1 — 검수 에디터 완성 (6개 조작: 리트림/자막/템플릿/콜드오픈/썸네일/제목)

기존 우리 에디터 유지 + v0.3.0에서 다음 부품의 **패턴·코드를 발췌**:

| 가져올 것 (v0.3.0 경로: apps/web/src/) | 용도 |
|------|------|
| `components/editor/panels/timeline/audio-waveform.tsx` | 웨이브폼 렌더 — 리트림 시 발화 경계를 눈으로 확인 (스냅 정제와 궁합) |
| `components/editable-timecode.tsx` | 타임코드 직접 입력 편집 |
| `panels/timeline/drag-line.tsx`, `drop-target.ts` | 드래그·스냅 인터랙션 로직 |
| `panels/preview/text-edit-overlay.tsx`, `transform-handles.tsx`, `snap-guides.tsx` | 프리뷰 위 자막 텍스트 인라인 편집·위치/크기 핸들·정렬 가이드 |

우리 것으로 대체하는 부분:
- 미디어 소스: 기존 `/api/media/:id/stream` (HTTP Range 스트리밍 이미 구현됨) — 프록시 해상도 제공
- 상태: `store.tsx`에 editor 상태 추가 (그들의 IndexedDB 프로젝트 스토어는 안 씀)
- 렌더: 서버 ffmpeg + render revision (그들의 브라우저 내 익스포트는 안 씀)
- 자막 프리뷰: CSS 오버레이로 근사 — "프리뷰는 근사치, 최종 화질은 서버 렌더"를 UI에 명시

### Phase 2 — (조건부) 멀티트랙 타임라인

Phase 1 출시 후 편집 로그에서 "6개 조작 밖" 요구가 실측으로 확인될 때만:
- v0.3.0 `panels/timeline/` 전체 이식 + zustand 스토어를 우리 데이터 모델로 감싸는 어댑터
- 그래도 컴포지터는 서버 렌더 유지. 그 이상이 필요하면 → 그건 프리미어 인계(XML/패널) 영역

## 작업 규칙

- 발췌 코드는 `apps/web/src/vendor/opencut/` 아래 격리, 파일 상단 MIT 저작권 고지 유지, NOTICE 파일에 출처 기재.
- 우리 수정은 vendor 밖에서 wrapping (업스트림 코드와 우리 코드 경계 명확히).
- v0.3.0 태그를 기준 커밋으로 고정해 참조 (`git fetch origin tag v0.3.0`). main은 재작성 완료 후 재평가.
- 스택 궁합: 그들도 React 19 + Tailwind (신버전은 base-ui까지 동일) — 스타일 이식 마찰 낮음.

## 순서 제안

1. 웨이브폼 + 타임코드 입력 + 리트림 스냅 재적용 (검수 체감 최대) — AP3 기간 내
2. 자막 오버레이 편집 (텍스트·위치·스타일) — AP3 기간 내
3. 편집 로그 계측 추가 (운영자가 실제로 뭘 고치는지) → Phase 2 여부 데이터로 결정
