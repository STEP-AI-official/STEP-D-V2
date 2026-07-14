# Vercel 운영 메모 (STEP-D V2)

이 저장소(`STEP-AI-official/STEP-D-V2`)의 웹앱을 Vercel에서 다루는 법.
2026-07-14 기준. 삽질했던 함정들을 같이 적어둔다.

---

## 1. 프로젝트 좌표

| 항목 | 값 |
|------|-----|
| 팀 (scope) | `step-ai` — 표시명 "STEP AI" |
| 프로젝트 | `step-d-v2-web` |
| 프로덕션 URL | https://step-d-v2-web-step-ai.vercel.app |
| Root Directory | `apps/web` |
| 빌드 명령 | `next build --webpack` (`vercel.json`) |
| 배포 트리거 | GitHub `main` 푸시 → 자동 배포 |

> **주의:** 팀 슬러그는 `step-ai`다. CLI가 가끔 `step-ais-projects`라는 엉뚱한 스코프로
> 붙으려다 `Not authorized`를 뱉는데, 그건 옛 로그인 설정(`config.json`)의 잔재다.
> **항상 `--scope step-ai`를 명시하면 피할 수 있다.**

---

## 2. 토큰

토큰 값은 **이 문서에 적지 않는다** (문서는 커밋됨). 파일로 둔다:

```
gcp-keys/vercel-token.txt      ← 여기. gcp-keys/ 는 .gitignore 처리됨
```

**토큰 발급 시 스코프를 반드시 팀으로:**
Vercel → Account Settings → Tokens → Create
→ **Scope 드롭다운에서 "STEP AI" 팀 선택** (개인 계정으로 만들면 팀 프로젝트에 접근 못 해서
`You do not have access to the specified account` 로 막힌다. 실제로 한 번 겪었다.)

쓸 때는:

```bash
T=$(cat gcp-keys/vercel-token.txt)
vercel <명령> --token="$T" --scope step-ai
```

---

## 3. 환경변수 계약 (코드 기준)

코드가 실제로 읽는 건 **딱 3개**다. 그 외에 뭘 넣어도 아무 효과 없다.

| 변수 | 읽는 곳 | 값 | 비고 |
|------|---------|-----|------|
| `CLOUD_RUN_URL` | `src/app/api/proxy/[[...path]]/route.ts`, `src/lib/gcp-auth.ts` | `https://stepd-server-...run.app` | 서버 전용 |
| `GCP_SERVICE_ACCOUNT_KEY` | `src/lib/gcp-auth.ts` | 서비스 계정 JSON 전체 | 서버 전용 · 시크릿 |
| `NEXT_PUBLIC_API_URL` | `src/lib/data/api.ts` | **설정하지 말 것** | 아래 참고 |

### `NEXT_PUBLIC_API_URL`은 비워둬야 한다 ⚠️

```ts
// src/lib/data/api.ts
export const API_BASE = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "/api";
```

이게 **설정돼 있으면** 브라우저가 그 주소로 Cloud Run을 직접 호출한다. 그런데 Cloud Run은
IAM 보호라 ID 토큰이 필요하고, 브라우저는 그걸 못 만든다 → **403**.

비워두면 `/api`로 폴백 → `next.config.ts`의 rewrite → `/api/proxy/*` 라우트 →
Next 서버가 `GCP_SERVICE_ACCOUNT_KEY`로 ID 토큰을 발급해 붙임 → Cloud Run 도달. 이게 정상 경로다.

### 죽은 변수들 (2026-07-14 삭제함)

`API_PROXY_TARGET`, `NEXT_PUBLIC_API_PROXY`, `NEXT_PUBLIC_API_BASE_URL` — 구 STEPD 잔재로
코드가 전혀 읽지 않는다. 다시 넣지 말 것. (`apps/web/CLAUDE.md`에도 명시돼 있음)

### Preview 환경은 현재 깨져 있다

`CLOUD_RUN_URL`·`GCP_SERVICE_ACCOUNT_KEY`가 **Production에만** 설정돼 있다.
PR/브랜치 프리뷰 배포는 `GCP_SERVICE_ACCOUNT_KEY not set` 으로 죽는다.
프리뷰를 쓰려면 두 변수를 Preview에도 추가해야 한다 — 다만 서비스 계정 키가 프리뷰 배포까지
퍼지는 걸 감수해야 한다.

---

## 4. 자주 쓰는 명령

```bash
T=$(cat gcp-keys/vercel-token.txt)
V="vercel --token=$T --scope step-ai"

# 프로젝트 연결 (최초 1회, .vercel/ 생성 — gitignore됨)
vercel link --token="$T" --scope step-ai --project step-d-v2-web --yes

# 환경변수
$V env ls
$V env add  CLOUD_RUN_URL production            # 값은 프롬프트로 입력
$V env add  GCP_SERVICE_ACCOUNT_KEY production < gcp-keys/vercel-proxy-key.json
$V env rm   어떤변수 production --yes

# 배포 상태 / 로그
$V ls step-d-v2-web                              # 최근 배포 목록 + 상태
$V inspect <배포URL> --logs                      # 빌드 로그 (실패 원인은 여기서)

# 팀·프로젝트 확인
$V teams ls
$V project ls
```

> `NEXT_PUBLIC_*` 는 **빌드 시점에 번들로 구워진다.** 값을 바꾸면 반드시 재배포해야 반영된다.

---

## 5. 함정 모음 (실제로 당한 것들)

### ⛔ `apps/web` 에서 `npm install` 하지 말 것

이 저장소는 **pnpm 워크스페이스**다 (루트 `pnpm-lock.yaml` + `pnpm-workspace.yaml`).
pnpm으로 설치된 상태에서 `apps/web`에서 `npm install`을 돌리면, npm이 pnpm 심볼릭 링크를
그대로 락파일에 기록한다:

```json
"node_modules/clsx": { "resolved": "../../node_modules/.pnpm/clsx@2.1.1/...", "link": true }
```

Vercel은 root directory가 `apps/web`이라 거기 `package-lock.json`이 있으면 **npm으로 설치**하는데,
`../../node_modules/.pnpm/` 은 거기 존재하지 않는다 → **clsx·cva·exceljs·@base-ui/react·
@tailwindcss/postcss 등 13개가 아예 설치되지 않고 빌드 실패.**

> 실제로 이것 때문에 7시간 동안 배포 6개가 연속 `● Error` 났다.
> `Module not found: Can't resolve 'clsx'` 가 뜨면 이걸 의심할 것.

`package-lock.json`은 `.gitignore`에 넣어뒀다. 의존성 설치는 **루트에서 `pnpm install`**.

### 배포 보호(Deployment Protection)가 켜져 있다

`/` 든 `/api/state` 든 익명 요청은 Vercel SSO 로그인으로 302된다.
curl로 헬스체크가 안 되는 게 정상이다. 브라우저로 로그인해서 확인할 것.

### 로컬 `.vercel/project.json` 의 orgId가 낡을 수 있다

옛 팀 ID(`team_JnURKZ…`)를 물고 있으면 CLI가 접근 불가 스코프로 붙으려다 실패한다.
`rm -rf .vercel` 후 위의 `vercel link`를 다시 돌리면 된다.

---

## 6. 배포가 실패했을 때

```bash
T=$(cat gcp-keys/vercel-token.txt)
vercel ls step-d-v2-web --token="$T" --scope step-ai        # ● Error 인 배포 URL 확인
vercel inspect <그URL> --logs --token="$T" --scope step-ai  # 빌드 로그 확인
```

빌드 로그 앞부분에서 **어떤 패키지 매니저로 설치했는지** 먼저 볼 것.
`npm warn` / `npm fund` 가 보이면 위의 락파일 함정이다 (pnpm이어야 정상).
