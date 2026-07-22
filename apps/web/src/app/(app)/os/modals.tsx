"use client";

/** STEP D Review OS — React port, modals (업로드·새 프로그램·배포·채널 등록).
 *  Wired to the real store: upload/create/publish hit the backend via useAppData(). */
import { useRef, useState } from "react";
import { DISTRIBUTION_CHANNELS, type DistributionChannel } from "@/lib/constants";
import type { Connections, MetaPlatform } from "@/lib/types";

const X = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}><path d="M6 6l12 12M18 6L6 18" /></svg>;
const Back = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}><path d="M15 6l-6 6 6 6" /></svg>;

function Overlay({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div onClick={onClose} className="fixed inset-0 z-[78] flex items-center justify-center bg-[rgba(5,6,9,.72)] p-[30px] backdrop-blur-[6px]">
      <div onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  );
}
function Head({ title, sub, onClose, onBack }: { title: string; sub?: string; onClose: () => void; onBack?: () => void }) {
  return (
    <div className="flex items-center gap-2.5 border-b border-[#232323] px-5 py-4">
      {onBack && <button onClick={onBack} className="flex text-[#707070] hover:text-[#eceef2]">{Back}</button>}
      <div><div className="grotesk text-[15px] font-bold tracking-[-.3px]">{title}</div>{sub && <div className="mt-px text-[11.5px] text-[#707070]">{sub}</div>}</div>
      <span className="flex-1" />
      <button onClick={onClose} className="text-[18px] leading-none text-[#707070] hover:text-[#eceef2]">✕</button>
    </div>
  );
}
const inputCls = "w-full rounded-[9px] border border-[#2b2b2b] bg-[#0a0a0a] px-3 py-2.5 text-[13px] text-[#e5e5e5] outline-none placeholder:text-[#5a5a5a]";
const labelCls = "mb-[7px] text-[11.5px] font-semibold text-[#9a9a9a]";

export type ProgramOpt = { id: string; title: string };
export type UploadInput = { file: File | null; url: string; programId: string; title: string; fast: boolean };

/* ─────────── UPLOAD (real) ─────────── */
export function UploadModal({ onClose, flash, defaultProg, programs, serverConnected, onUpload }: {
  onClose: () => void; flash: (m: string) => void; defaultProg?: string;
  programs: ProgramOpt[]; serverConnected: boolean;
  onUpload: (input: UploadInput) => Promise<void>;
}) {
  const [mode, setMode] = useState<"file" | "yt">("file");
  const [prog, setProg] = useState(defaultProg ?? programs[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  // 분석 모드 — 빠른(자막만) 기본. 정밀은 cast+portraits(화자 불명 씬만 vision fallback)+narrative까지.
  const [analyzeFast, setAnalyzeFast] = useState<boolean>(true);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const tab = (on: boolean) => `flex flex-1 items-center justify-center gap-1.5 rounded-[7px] py-2 text-[12.5px] font-semibold ${on ? "bg-[#161616] text-[#eceef2] shadow-[0_1px_0_#232323]" : "text-[#9a9a9a]"}`;

  const noProgram = programs.length === 0;
  const canSubmit = serverConnected && !noProgram && !busy && (mode === "file" ? !!file : !!url.trim());

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    try {
      await onUpload({ file: mode === "file" ? file : null, url: mode === "yt" ? url.trim() : "", programId: prog, title: title.trim(), fast: analyzeFast });
      onClose();
    } catch (e) {
      flash(e instanceof Error ? e.message : "업로드 실패");
      setBusy(false);
    }
  }

  return (
    <Overlay onClose={onClose}>
      <div className="w-[460px] max-w-full overflow-hidden rounded-2xl border border-[#2b2b2b] bg-[#131313] shadow-[0_24px_60px_rgba(0,0,0,.5)]">
        <Head title="원본 업로드" onClose={onClose} />
        <div className="flex flex-col gap-4 p-5">
          {!serverConnected && <div className="rounded-[9px] border border-[rgba(251,191,36,.3)] bg-[rgba(251,191,36,.1)] px-3 py-2.5 text-[11.5px] text-[#fbbf24]">백엔드 서버 미연결 — 업로드하려면 서버가 필요합니다.</div>}
          {serverConnected && noProgram && <div className="rounded-[9px] border border-[rgba(251,191,36,.3)] bg-[rgba(251,191,36,.1)] px-3 py-2.5 text-[11.5px] text-[#fbbf24]">먼저 프로그램을 만들어 주세요 (프로그램 → 새 프로그램).</div>}
          <div className="flex gap-1 rounded-[9px] border border-[#232323] bg-[#0e0e0e] p-1">
            <button onClick={() => setMode("file")} className={tab(mode === "file")}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 3v12M8 11l4 4 4-4M4 19h16" /></svg>파일 업로드</button>
            <button onClick={() => setMode("yt")} className={tab(mode === "yt")}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="2" y="5" width="20" height="14" rx="4" /><path d="M10 9l5 3-5 3z" /></svg>유튜브 링크</button>
          </div>
          <div><div className={labelCls}>프로그램</div><select value={prog} onChange={(e) => setProg(e.target.value)} className={inputCls}>{programs.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select></div>
          {/* 분석 모드 — 5분 청크 병렬은 공통. 정밀은 cast+portraits(vision fallback)+narrative 추가. */}
          <div>
            <div className={labelCls}>분석 모드</div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setAnalyzeFast(true)}
                className="rounded-[10px] border px-3 py-2.5 text-left transition-[border-color,background]"
                style={analyzeFast
                  ? { borderColor: "rgba(139,147,255,.5)", background: "rgba(139,147,255,.08)" }
                  : { borderColor: "#262626", background: "#161616" }}
              >
                <div className="text-[13px] font-bold" style={{ color: analyzeFast ? "#c3c8ff" : "#e5e5e5" }}>빠른 분석 <span className="text-[11px] font-normal text-[#707070]">· 기본</span></div>
                <div className="mt-0.5 text-[11px] leading-[1.4] text-[#9a9a9a]">STT → 자막 정제(화자 라벨) → 쇼츠 추천. 시각 분석 스킵.</div>
              </button>
              <button
                onClick={() => setAnalyzeFast(false)}
                className="rounded-[10px] border px-3 py-2.5 text-left transition-[border-color,background]"
                style={!analyzeFast
                  ? { borderColor: "rgba(45,212,191,.5)", background: "rgba(45,212,191,.08)" }
                  : { borderColor: "#262626", background: "#161616" }}
              >
                <div className="text-[13px] font-bold" style={{ color: !analyzeFast ? "#5eead4" : "#e5e5e5" }}>정밀 분석</div>
                <div className="mt-0.5 text-[11px] leading-[1.4] text-[#9a9a9a]">+ 출연자 타임라인·포트레이트(화자 불명 씬만 vision 활용) · 서사 요약.</div>
              </button>
            </div>
          </div>
          {mode === "file" ? (
            <>
              <input ref={fileRef} type="file" accept="video/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              <button type="button" onClick={() => fileRef.current?.click()} className="flex w-full flex-col items-center justify-center gap-2 rounded-[12px] border-2 border-dashed border-[#2b2b2b] px-4 py-7 text-center hover:border-[#3a3a3a]">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#707070" strokeWidth={1.8}><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M10 9l5 3-5 3z" /></svg>
                <div className="text-[13px] text-[#9a9a9a]">{file ? <span className="font-semibold text-[#e5e5e5]">{file.name}</span> : <>영상 파일을 <span className="font-semibold text-[#8b93ff]">클릭해서 선택</span></>}<div className="mt-0.5 text-[11px] text-[#5a5a5a]">mp4 · mov · webm · 길이 제한 없음</div></div>
              </button>
              <div><div className={labelCls}>제목</div><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="비우면 파일명 사용" className={inputCls} /></div>
            </>
          ) : (
            <>
              <div><div className={labelCls}>YouTube URL</div><input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=…" className={inputCls} /></div>
              <div className="flex gap-2 rounded-[9px] border border-[#232323] bg-[#0e0e0e] px-3 py-2.5"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#8b93ff" strokeWidth={2} className="mt-px flex-none"><circle cx="12" cy="12" r="10" /><path d="M12 8v5M12 16h.01" /></svg><span className="text-[11.5px] leading-[1.5] text-[#c3c8ff]">영상은 Worker에서 다운로드된 뒤 자동으로 AI 분석이 시작돼요.</span></div>
            </>
          )}
          <button onClick={submit} disabled={!canSubmit} className="w-full rounded-[9px] bg-[#6b74f0] py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#5a63e6] disabled:cursor-not-allowed disabled:opacity-50">{busy ? "업로드 중…" : "업로드"}</button>
        </div>
      </div>
    </Overlay>
  );
}

/* ─────────── NEW PROGRAM ─────────── */
const GENRES = ["예능", "드라마/영화", "뮤직", "시사", "교양", "라이프", "스포츠", "게임", "어린이", "뉴스", "애니"];
const AGES: [string, number][] = [["전체", 0], ["7세", 7], ["12세", 12], ["15세", 15], ["19세", 19]];
const CATS = ["드라마", "예능", "교양"];
const WEEK = ["월", "화", "수", "목", "금", "토", "일"]; // idx0=월 → SMR weekday (i+1)%7 (0=일)

export type NewProgramInput = { title: string; section: string; targetAge: number; cast: string[]; programCode?: string; category?: string; weekdays: number[] };
export function NewProgramModal({ onClose, flash, onCreate }: { onClose: () => void; flash: (m: string) => void; onCreate: (input: NewProgramInput) => Promise<void> }) {
  const [title, setTitle] = useState("");
  const [section, setSection] = useState(GENRES[0]);
  const [age, setAge] = useState(0);
  const [cast, setCast] = useState("");
  const [code, setCode] = useState("");
  const [days, setDays] = useState<Record<number, boolean>>({});
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      await onCreate({
        title: title.trim(), section, targetAge: age,
        cast: cast.split(",").map((c) => c.trim()).filter(Boolean),
        programCode: code.trim() || undefined,
        weekdays: Object.entries(days).filter(([, v]) => v).map(([i]) => (Number(i) + 1) % 7),
      });
      onClose();
    } catch (e) {
      flash(e instanceof Error ? e.message : "프로그램 생성 실패");
      setBusy(false);
    }
  }

  return (
    <Overlay onClose={onClose}>
      <div className="flex max-h-[90vh] w-[500px] max-w-full flex-col overflow-auto rounded-2xl border border-[#2b2b2b] bg-[#131313] shadow-[0_24px_60px_rgba(0,0,0,.5)]">
        <div className="sticky top-0 z-[2] bg-[#131313]"><Head title="새 프로그램" onClose={onClose} /></div>
        <div className="flex flex-col gap-4 p-5">
          <div><div className={labelCls}>프로그램 제목</div><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 전지적 참견 시점" className={inputCls} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><div className={labelCls}>장르</div><select value={section} onChange={(e) => setSection(e.target.value)} className={inputCls}>{GENRES.map((g) => <option key={g}>{g}</option>)}</select></div>
            <div><div className={labelCls}>시청 등급</div><select value={age} onChange={(e) => setAge(Number(e.target.value))} className={inputCls}>{AGES.map(([l, v]) => <option key={l} value={v}>{l}</option>)}</select></div>
          </div>
          <div><div className={labelCls}>출연자 <span className="font-normal text-[#5a5a5a]">· 쉼표로 구분 · 선택</span></div><input value={cast} onChange={(e) => setCast(e.target.value)} placeholder="이영자, 홍현희" className={inputCls} /></div>
          <div className="border-t border-[#232323] pt-4">
            <div className="text-[11px] font-bold tracking-[.3px] text-[#9a9a9a]">SMR 피드 정보</div>
            <p className="mb-3.5 mt-[3px] text-[11px] text-[#5a5a5a]">네이버 SMR 배포에 필요 · 비워도 프로그램은 생성돼요.</p>
            <div className="mb-3.5 mt-3.5 grid grid-cols-2 gap-3">
              <div><div className={labelCls}>프로그램 코드</div><input value={code} onChange={(e) => setCode(e.target.value)} placeholder="jamsi" className={inputCls} /></div>
              <div><div className={labelCls}>카테고리 <span className="font-normal text-[#5a5a5a]">· SMR 코드</span></div><select className={inputCls}><option value="">선택 안 함</option>{CATS.map((c) => <option key={c}>{c}</option>)}</select></div>
            </div>
            <div><div className={labelCls}>편성 요일</div><div className="flex gap-1.5">{WEEK.map((w, i) => (<button key={w} onClick={() => setDays((s) => ({ ...s, [i]: !s[i] }))} className="size-9 rounded-[8px] border text-[12.5px] font-semibold" style={days[i] ? { background: "#6b74f0", borderColor: "#6b74f0", color: "#fff" } : { background: "#0a0a0a", borderColor: "#2b2b2b", color: "#9a9a9a" }}>{w}</button>))}</div></div>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-[#232323] px-5 py-3.5">
          <button onClick={onClose} className="rounded-[9px] border border-[#2b2b2b] px-[15px] py-2 text-[12.5px] font-semibold text-[#9a9a9a] hover:border-[#3a3a3a] hover:text-[#e5e5e5]">취소</button>
          <button onClick={submit} disabled={!title.trim() || busy} className="flex items-center gap-1.5 rounded-[9px] bg-[#6b74f0] px-4 py-2 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#5a63e6] disabled:cursor-not-allowed disabled:opacity-50"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}><path d="M12 5v14M5 12h14" /></svg>{busy ? "생성 중…" : "만들기"}</button>
        </div>
      </div>
    </Overlay>
  );
}

/* ─────────── EDIT CAST — 프로그램의 출연자 명단 편집 (refine speaker 라벨 primary) ─────────── */
export function EditCastModal({ programTitle, initialCast, onClose, flash, onSave }: {
  programTitle: string;
  initialCast: string[];
  onClose: () => void;
  flash: (m: string) => void;
  onSave: (cast: string[]) => Promise<void>;
}) {
  const [text, setText] = useState(initialCast.join(", "));
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy) return;
    setBusy(true);
    // 쉼표·줄바꿈 둘 다 구분자로. 중복·공백 제거.
    const cast = Array.from(new Set(text.split(/[,\n]/).map((s) => s.trim()).filter(Boolean)));
    try {
      await onSave(cast);
      onClose();
    } catch (e) {
      flash(e instanceof Error ? e.message : "출연자 저장 실패");
      setBusy(false);
    }
  }

  const preview = Array.from(new Set(text.split(/[,\n]/).map((s) => s.trim()).filter(Boolean)));

  return (
    <Overlay onClose={onClose}>
      <div className="flex max-h-[90vh] w-[520px] max-w-full flex-col overflow-hidden rounded-2xl border border-[#2b2b2b] bg-[#131313] shadow-[0_24px_60px_rgba(0,0,0,.5)]">
        <Head title="출연자 편집" sub={programTitle} onClose={onClose} />
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-5">
          <div className="rounded-[9px] border border-[rgba(139,147,255,.25)] bg-[rgba(139,147,255,.08)] px-3 py-2.5">
            <div className="mb-1 text-[11.5px] font-bold text-[#c3c8ff]">이 명단이 refine speaker 라벨의 primary</div>
            <div className="text-[11.5px] leading-[1.5] text-[#9a9a9a]">쉼표(,) 또는 줄바꿈으로 구분. STT 오인식(예: 옥순→옥수)은 이 명단 기준으로 자동 정규화 시도. 이 명단에 없는 인물은 M1/F1... fallback으로 남아 사용자 검토용 flag가 됨.</div>
          </div>
          <div>
            <div className={labelCls}>출연자 명단</div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="영수, 영호, 영식, 영철, 광수, 상철, 영자, 영숙, 옥순, 정숙, 현숙, 순자"
              rows={5}
              className="w-full resize-none rounded-[9px] border border-[#2b2b2b] bg-[#0a0a0a] px-3 py-2.5 text-[13px] text-[#e5e5e5] outline-none placeholder:text-[#5a5a5a]"
            />
          </div>
          {preview.length > 0 && (
            <div>
              <div className={labelCls}>미리보기 · {preview.length}명</div>
              <div className="flex flex-wrap gap-1.5">
                {preview.map((n) => (
                  <span key={n} className="rounded-[6px] border border-[#2b2b2b] bg-[#161616] px-2 py-1 text-[11.5px] font-semibold text-[#cfcfcf]">{n}</span>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-[#232323] px-5 py-3.5">
          <button onClick={onClose} className="rounded-[9px] border border-[#2b2b2b] px-[15px] py-2 text-[12.5px] font-semibold text-[#9a9a9a] hover:border-[#3a3a3a] hover:text-[#e5e5e5]">취소</button>
          <button onClick={submit} disabled={busy} className="rounded-[9px] bg-[#6b74f0] px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-[#5a63e6] disabled:cursor-not-allowed disabled:opacity-50">{busy ? "저장 중…" : "저장"}</button>
        </div>
      </div>
    </Overlay>
  );
}

/* ─────────── DISTRIBUTE — 2-step: 플랫폼 → 채널 (design lines 813~857) ─────────── */
const PLATFORM_META: { key: DistributionChannel; name: string; color: string }[] = [
  { key: "youtube", name: "YouTube", color: "#ff6b78" },
  { key: "meta", name: "Meta (Instagram · Facebook)", color: "#5e9bff" },
  { key: "smr", name: "네이버 SMR", color: "#34d399" },
];

export type DistributePublish = { platform: DistributionChannel; metaPlatforms?: MetaPlatform[] };

export function DistributeModal({ clipTitle, connections, onClose, onPublish }: {
  clipTitle: string;
  connections: Connections;
  onClose: () => void;
  onPublish: (out: DistributePublish) => void;
}) {
  const [plat, setPlat] = useState<DistributionChannel | null>(null);
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const selMeta = plat && PLATFORM_META.find((p) => p.key === plat)!;

  // 플랫폼별 스텝 2 채널 리스트. 실 backend에는 계정별 세부 라우팅이 없어(단일 채널 flag),
  // 연결된 것만 최소한으로 노출. Meta는 인스타/페북 서페이스 선택을 여기서 함.
  type Row = { key: string; handle: string; sub: string; count?: string };
  let rows: Row[] = [];
  if (plat === "youtube") {
    rows = connections.youtube
      ? [{ key: "yt_main", handle: "@stepd_youtube", sub: "전 프로그램", count: "구독 42.1K" }]
      : [];
  } else if (plat === "meta") {
    rows = [
      ...(connections.metaInstagram ? [{ key: "instagram", handle: "@stepd_ig", sub: "Instagram Reels", count: "팔로워 12.4K" }] : []),
      ...(connections.meta ? [{ key: "facebook", handle: "@stepd_fb", sub: "Facebook Page", count: "팔로워 8.7K" }] : []),
    ];
  } else if (plat === "smr") {
    rows = [{ key: "smr_feed", handle: "SMR 피드", sub: "네이버 · 방송사 피드", count: "게시 채널 1" }];
  }
  const selCount = rows.filter((r) => sel[r.key]).length;

  function backStep() { setPlat(null); setSel({}); }
  function confirm() {
    if (!plat || selCount === 0) return;
    if (plat === "meta") {
      const metaPlatforms = rows.filter((r) => sel[r.key]).map((r) => r.key as MetaPlatform);
      onPublish({ platform: "meta", metaPlatforms });
    } else {
      onPublish({ platform: plat });
    }
  }

  return (
    <Overlay onClose={onClose}>
      <div className="w-[480px] max-w-full overflow-hidden rounded-2xl border border-[#2b2b2b] bg-[#131313] shadow-[0_24px_60px_rgba(0,0,0,.5)]">
        <Head title="배포" sub={clipTitle} onClose={onClose} onBack={plat ? backStep : undefined} />
        {!plat ? (
          <div className="p-5">
            <div className="mb-4 text-[12.5px] text-[#9a9a9a]">어느 플랫폼에 배포할까요?</div>
            <div className="flex flex-col gap-2.5">
              {PLATFORM_META.map((p) => {
                const cn = p.key === "youtube" ? (connections.youtube ? 1 : 0)
                  : p.key === "meta" ? (Number(connections.meta) + Number(connections.metaInstagram))
                  : 1;
                return (
                  <button key={p.key} onClick={() => setPlat(p.key)} className="flex items-center gap-3.5 rounded-[11px] border border-[#262626] bg-[#161616] px-[15px] py-3.5 text-left text-inherit transition-[background,border-color] hover:border-[#3a3a3a] hover:bg-[#1e1e1e]">
                    <span className="size-3 flex-none rounded-[3px]" style={{ background: p.color }} />
                    <span className="flex-1 text-[14px] font-bold">{p.name}</span>
                    <span className="text-[11.5px] text-[#707070]">{cn}개 채널</span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5a5a5a" strokeWidth={2.2}><path d="M9 6l6 6-6 6" /></svg>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="p-5">
            <div className="mb-3.5 flex items-center gap-2.5"><span className="size-3 flex-none rounded-[3px]" style={{ background: selMeta!.color }} /><span className="text-[14px] font-bold">{selMeta!.name} 채널 선택</span></div>
            {rows.length === 0 ? (
              <div className="rounded-[10px] border border-[#262626] bg-[#161616] px-3 py-6 text-center text-[12.5px] text-[#9a9a9a]">연결된 채널이 없어요. 배포채널에서 먼저 등록해 주세요.</div>
            ) : (
              <div className="mb-[18px] flex flex-col gap-2">
                {rows.map((r) => {
                  const on = !!sel[r.key];
                  return (
                    <button key={r.key} onClick={() => setSel((s) => ({ ...s, [r.key]: !s[r.key] }))} className="flex items-center gap-3 rounded-[10px] border px-3.5 py-3 text-left text-inherit transition-[border-color,background]" style={{ borderColor: on ? "rgba(139,147,255,.5)" : "#262626", background: on ? "rgba(139,147,255,.06)" : "#161616" }}>
                      <span className="flex size-[18px] flex-none items-center justify-center rounded-[5px] border" style={on ? { background: "#6b74f0", borderColor: "#6b74f0" } : { borderColor: "#3a3a3a" }}>{on && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3}><path d="M20 6L9 17l-5-5" /></svg>}</span>
                      <span className="flex-1"><span className="block text-[13.5px] font-bold">{r.handle}</span><span className="text-[11px] text-[#707070]">{r.sub}{r.count ? ` · ${r.count}` : ""}</span></span>
                    </button>
                  );
                })}
              </div>
            )}
            <button onClick={confirm} disabled={selCount === 0} className="w-full rounded-[9px] py-2.5 text-[13px] font-semibold disabled:cursor-not-allowed" style={selCount > 0 ? { background: "#6b74f0", color: "#fff" } : { background: "#1e1e1e", color: "#5a5a5a" }}>{selCount}개 채널에 배포 예약</button>
          </div>
        )}
      </div>
    </Overlay>
  );
}

/* ─────────── REGISTER CHANNEL — 2-step: 플랫폼 → OAuth (design lines 860~901) ─────────── */
const REGISTER_PLATS: { key: DistributionChannel; name: string; desc: string; color: string }[] = [
  { key: "youtube", name: "YouTube", color: "#ff6b78", desc: "채널 · 실시간 분석·배포처" },
  { key: "meta", name: "Meta (Instagram · Facebook)", color: "#5e9bff", desc: "Reels · 크로스포스팅" },
  { key: "smr", name: "네이버 SMR", color: "#34d399", desc: "포털 VOD 피드 · 방송사 계정" },
];

export function RegisterModal({ connections, onClose, onConnect }: {
  connections: Connections;
  onClose: () => void;
  onConnect: (platform: DistributionChannel) => void;
}) {
  const [plat, setPlat] = useState<DistributionChannel | null>(null);
  const selMeta = plat && REGISTER_PLATS.find((p) => p.key === plat)!;
  function backStep() { setPlat(null); }
  const isConnected = (p: DistributionChannel) =>
    p === "youtube" ? connections.youtube : p === "meta" ? (connections.meta || connections.metaInstagram) : false;

  return (
    <Overlay onClose={onClose}>
      <div className="w-[460px] max-w-full overflow-hidden rounded-2xl border border-[#2b2b2b] bg-[#131313] shadow-[0_24px_60px_rgba(0,0,0,.5)]">
        <Head title="채널 등록" onClose={onClose} onBack={plat ? backStep : undefined} />
        {!plat ? (
          <div className="p-5">
            <div className="mb-4 text-[12.5px] text-[#9a9a9a]">어떤 플랫폼의 계정을 추가할까요?</div>
            <div className="flex flex-col gap-2.5">
              {REGISTER_PLATS.map((p) => (
                <button key={p.key} onClick={() => setPlat(p.key)} className="flex items-center gap-3.5 rounded-[11px] border border-[#262626] bg-[#161616] px-[15px] py-3.5 text-left text-inherit transition-[background,border-color] hover:border-[#3a3a3a] hover:bg-[#1e1e1e]">
                  <span className="size-3 flex-none rounded-[3px]" style={{ background: p.color }} />
                  <span className="flex-1"><span className="block text-[14px] font-bold">{p.name}</span><span className="text-[11.5px] text-[#707070]">{p.desc}</span></span>
                  {isConnected(p.key) && <span className="rounded-full border border-[rgba(52,211,153,.3)] bg-[rgba(52,211,153,.1)] px-2 py-0.5 text-[10.5px] font-bold text-[#34d399]">연결됨</span>}
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5a5a5a" strokeWidth={2.2}><path d="M9 6l6 6-6 6" /></svg>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="p-5">
            <div className="mb-4 flex items-center gap-2.5"><span className="size-3 flex-none rounded-[3px]" style={{ background: selMeta!.color }} /><span className="text-[14px] font-bold">{selMeta!.name} 계정 연결</span></div>
            <div className="mb-1.5 text-[11.5px] font-semibold text-[#9a9a9a]">계정 핸들</div>
            <div className="mb-3.5 rounded-[9px] border border-[#2b2b2b] bg-[#161616] px-3.5 py-3 text-[13px] text-[#9a9a9a]">@channel_handle</div>
            <div className="mb-[18px] flex items-center gap-2.5 rounded-[10px] border border-[#232323] bg-[#121212] px-3 py-3">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#8b93ff" strokeWidth={2} className="flex-none"><path d="M12 2v6M12 22v-6M2 12h6M22 12h-6" /></svg>
              <span className="text-[11.5px] leading-[1.45] text-[#c3c8ff]">{selMeta!.name} 계정으로 로그인해 게시 권한을 승인하면 연결이 완료돼요.</span>
            </div>
            <button onClick={() => onConnect(plat)} className="w-full rounded-[9px] bg-[#6b74f0] py-2.5 text-[13px] font-semibold text-white hover:bg-[#5a63e6]">{selMeta!.name} 계정으로 연결</button>
          </div>
        )}
      </div>
    </Overlay>
  );
}
