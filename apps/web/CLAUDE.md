# apps/web — 프론트엔드 Claude 컨텍스트

Next.js 16.3 (App Router), React 19, TypeScript 5.7. 단일 페이지 앱 구조.

## 핵심 파일

| 파일 | 역할 |
|------|------|
| `app/page.tsx` | **메인 대시보드 전체.** 약 3500줄. 모든 상태·핸들러·UI가 여기. |
| `app/components/ShortcutEditor.tsx` | 클립 편집기. `EditorState`, `BurnOverlay` 타입 정의. |
| `lib/api.ts` | 백엔드 API 호출 함수 + TypeScript 타입 전체. |

## page.tsx 구조 (대략적 위치)

```
1–600    imports, 타입 정의, 유틸 함수
600–700  useState 선언 (jobs, clips, 탭 상태, 각종 busy 플래그)
700–900  데이터 fetch 핸들러 (loadJobs, loadClips, loadSilenceReport...)
900–1500 편집 핸들러 (doRetrim, doApplyTemplate, saveShortcutEditor...)
1500–    JSX — 사이드바, 클립 목록, 클립 상세(4탭: 제목/자막스타일/유튜브/PPL + 편집제안)
```

## 클립 상세 탭 구조

```
"titles"   — 제목 5개 선택 + 썸네일 텍스트 + 재생성 버튼
"overlay"  — 자막 스타일 (ShortcutEditor 열기)
"youtube"  — YouTube 게시 + 실시간 성과 조회
"ppl"      — PPL 분석 + 음성 언급 뱃지 + 전체 PPL 리포트 + CSV
"edit"     — 무음 구간 탐지 (편집 제안) → loadSilenceReport(jobId) 호출
```

## 새 기능 추가 패턴

### 1. api.ts에 타입 + 함수 추가
```typescript
export type MyFeatureResult = {
  job_id: string;
  items: { start: number; end: number }[];
};

export async function getMyFeature(jobId: string): Promise<MyFeatureResult> {
  return request<MyFeatureResult>(`/api/jobs/${jobId}/my-feature`);
}
```

### 2. page.tsx에 import 추가
```typescript
import { getMyFeature, type MyFeatureResult } from "@/lib/api";
```

### 3. 상태 선언 (useState 블록 근처)
```typescript
const [myData, setMyData] = useState<Record<string, MyFeatureResult>>({});
const [myBusy, setMyBusy] = useState<Record<string, boolean>>({});
```

### 4. 핸들러
```typescript
const loadMyFeature = async (jobId: string) => {
  setMyBusy(s => ({ ...s, [jobId]: true }));
  try {
    const result = await getMyFeature(jobId);
    setMyData(s => ({ ...s, [jobId]: result }));
  } catch (e) {
    showToast("실패: " + errorMessage(e));
  } finally {
    setMyBusy(s => ({ ...s, [jobId]: false }));
  }
};
```

## 주요 타입 (lib/api.ts)

```typescript
type Clip {
  id, job_id, title, startSec, endSec, score
  videoUrl, thumbnailUrl, transcript
  pplAnalysis?: PplAnalysis
  voiceMentions?: VoiceMention[]
}

type SilenceReport { segments: SilenceSegment[], total_silence_seconds, ... }
type PplReport     { brands: PplReportBrand[], job_id, total_clips, ... }
type ClipYouTubeStats { stats: { view_count, like_count, comment_count }, ... }
type CommentSummary  { summary, sentiment, themes, highlights }
```

## 환경변수

```
NEXT_PUBLIC_API_BASE_URL=https://api.stepai.kr   # 프로덕션 (Vercel)
# 로컬은 /api/* → Next.js rewrites → http://localhost:8010
```

`next.config.ts`에 rewrites 설정으로 로컬 개발 시 CORS 없이 백엔드 연결.
