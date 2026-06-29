# apps/web — 프론트엔드 Claude 컨텍스트

Next.js 16.3 (App Router), React 19, TypeScript 5.7.

> **2026-06-29 아키텍처 리팩토링**: 단일 `page.tsx` 3500줄 → Console 멀티스크린 구조로 전환.

---

## 핵심 파일 맵

| 파일/폴더 | 역할 |
|-----------|------|
| `app/page.tsx` | 진입점 (ConsoleProvider + ConsoleShell만 렌더) |
| `app/components/console/ConsoleProvider.tsx` | **모든 상태 + 핸들러** (≈1200줄). Context로 노출. |
| `app/components/console/ConsoleShell.tsx` | 레이아웃 (Sidebar + Topbar + 스크린 라우터 + 모달) |
| `app/components/console/Sidebar.tsx` | 좌측 네비게이션 |
| `app/components/console/Topbar.tsx` | 상단 바 |
| `app/components/console/GlobalModals.tsx` | 전역 모달들 (채널 선택, PPL 링크 등) |
| `app/components/console/DrilldownPanel.tsx` | 우측 드릴다운 패널 |
| `app/components/console/charts.tsx` | 차트 컴포넌트 |
| `app/components/console/Hoverable.tsx` | hover 유틸 |
| `app/components/console/ConsoleGlobalStyle.tsx` | 전역 CSS (hover 클래스 등) |
| `app/components/console/screens/` | **각 스크린** (아래 목록 참고) |
| `app/components/ShortcutEditor.tsx` | 클립 에디터. `EditorState`, `BurnOverlay` 타입 정의. |
| `lib/api.ts` | 백엔드 API 클라이언트 함수 + TypeScript 타입 전체 |
| `lib/console/theme.ts` | 색상 `C`, `card()`, `primaryBtn`, `ghostBtn` 등 스타일 헬퍼 |
| `lib/console/format.ts` | 숫자·날짜·진행률 포맷 유틸 |
| `lib/console/map.ts` | 백엔드 응답 → UI 모델 변환 (`mapBackendClip`, `mapChannel` 등) |
| `lib/console/dummy.ts` | 더미 데이터 (Commerce·Dashboard 데모용) |

---

## 스크린 목록 (nav key)

```
"dashboard"  → DashboardScreen.tsx  — 채널 성과 개요, KPI 카드, 최근 업로드
"channels"   → ChannelsScreen.tsx   — 채널별 상세 분석, 인사이트
"studio"     → StudioScreen.tsx     — 영상 업로드·처리·클립 편집 (기존 메인 기능)
"schedule"   → ScheduleScreen.tsx   — YouTube 발행 일정
"commerce"   → CommerceScreen.tsx   — 커머스/PPL 분석
"report"     → ReportScreen.tsx     — AI 대화형 분석 (POST /api/report/chat)
"settings"   → SettingsScreen.tsx   — 채널 설정, 스타일 노트
```

---

## 상태·핸들러 접근법 (ConsoleProvider 패턴)

**모든 상태와 핸들러는 `useConsole()` 훅으로 접근.**

```typescript
// ConsoleProvider.tsx 내부 — context value 예시
const value = {
  nav, setNav,                  // 현재 스크린 (NavKey)
  me, setMe,                    // 로그인 유저
  jobs, clips,                  // Job/Clip 목록
  view,                         // "idle" | "checking" | "processing" | "results"
  progress,                     // 0-100
  openProject, setOpenProject,  // 선택된 Job
  editorClip, setEditorClipId,  // ShortcutEditor에 열린 클립
  toast,                        // 토스트 메시지
  defChannel,                   // 기본 채널
  // ... 핸들러들: uploadFile(), importYouTube(), doRetrim(), saveShortcutEditor(), ...
};
```

```typescript
// 스크린 컴포넌트에서 사용
import { useConsole } from "../ConsoleProvider";

export function MyScreen() {
  const { nav, clips, toast } = useConsole();
  ...
}
```

---

## 새 스크린 추가 패턴

1. `app/components/console/screens/MyScreen.tsx` 생성
2. `ConsoleShell.tsx`에 import + 조건부 렌더 추가
   ```tsx
   {nav === "myscreen" && <MyScreen />}
   ```
3. `Sidebar.tsx`의 `NAV` 배열에 항목 추가
   ```typescript
   { key: "myscreen", label: "내 스크린" },
   ```
4. `ConsoleProvider.tsx`의 `NavKey` 타입에 추가
   ```typescript
   export type NavKey = "dashboard" | "channels" | ... | "myscreen";
   ```

---

## 새 상태/핸들러 추가 패턴

새 기능의 상태·API 호출은 **ConsoleProvider.tsx에만** 추가하고 Context로 노출.

```typescript
// ConsoleProvider.tsx 내부에 추가
const [myData, setMyData] = useState<MyType | null>(null);

const loadMyData = async (jobId: string) => {
  try {
    const result = await getMyFeature(jobId);
    setMyData(result);
  } catch (e) {
    setToast(errorMessage(e));
  }
};

// context value에 포함
return <ConsoleContext.Provider value={{ ..., myData, loadMyData }}>
```

스크린 컴포넌트는 `useConsole()` 로만 읽는다 — 직접 상태 선언/API 호출 금지.

---

## 테마 시스템 (lib/console/theme.ts)

```typescript
// 색상
C.ink        // 주 텍스트 (#0A0A14)
C.body       // 보조 텍스트
C.muted      // 힌트 텍스트
C.panel      // 패널 배경
C.line       // 구분선
C.violet     // 강조 (보라)
C.violetSoft // 강조 배경
C.cyan       // 보조 강조
C.danger     // 오류

// 스타일 헬퍼
card({ padding: "20px" })     // React style object
primaryBtn                     // 보라 버튼 style object
ghostBtn                       // 아웃라인 버튼 style object
input                          // 인풋 style object
```

---

## api.ts에 새 함수 추가 패턴

```typescript
export type MyFeatureResult = {
  job_id: string;
  items: { start: number; end: number }[];
};

export async function getMyFeature(jobId: string): Promise<MyFeatureResult> {
  return request<MyFeatureResult>(`/api/jobs/${jobId}/my-feature`);
}
```

---

## 스튜디오 탭 구조 (StudioScreen 내부)

```
view="checking"   — 자막 처리 방식 선택 (이미 있음 / AI로 생성)
view="processing" — AI 처리 진행률
view="results"    — 클립 결과 목록
  └─ 클립 상세 탭:
       "titles"   — 제목 5개 선택 + 썸네일 텍스트
       "overlay"  — 자막 스타일 (ShortcutEditor 열기)
       "youtube"  — YouTube 게시 + 성과
       "ppl"      — PPL 분석 + 리포트
       "edit"     — 무음 구간 탐지 (편집 제안)
```

---

## 주요 타입 (lib/api.ts)

```typescript
type Clip        { id, job_id, title, startSec, endSec, score, videoUrl, thumbnailUrl, transcript, ... }
type AuthUser    { id, email, name }
type NavKey      "dashboard"|"channels"|"studio"|"schedule"|"commerce"|"report"|"settings"
type SilenceReport  { segments: SilenceSegment[], total_silence_seconds, ... }
type PplReport      { brands: PplReportBrand[], job_id, total_clips, ... }
type ClipYouTubeStats { stats: { view_count, like_count, comment_count }, ... }
type CommentSummary  { summary, sentiment, themes, highlights }
type HighlightRenderResponse { clip_id, highlight_url, ... }
```

---

## 환경변수

```
NEXT_PUBLIC_API_BASE_URL=https://api.stepai.kr   # 프로덕션 (Vercel)
# 로컬: /api/* → Next.js rewrites → http://localhost:8010 (next.config.ts)
```

---

## 주의사항

- **상태 추가 위치**: ConsoleProvider.tsx. 스크린 컴포넌트는 presentational만.
- **스타일**: 인라인 style 객체 + theme.ts 헬퍼. Tailwind/CSS module 사용 금지.
- **아이콘**: `lucide-react` 사용 중 (Film, Upload, Sparkles 등).
- **더미 데이터**: `lib/console/dummy.ts` — Commerce/Dashboard 데모용. 실제 API 연결 시 교체 예정.
