"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, Loader2, X, Film, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAppData } from "@/lib/data/store";
import { useToast } from "@/components/ui/toast";

/** Header action: open the real-video upload dialog (needs the backend). */
export function UploadVideoButton({ programId, variant = "outline" }: { programId?: string; variant?: "outline" | "default" } = {}) {
  const { serverConnected } = useAppData();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        size="sm"
        variant={variant}
        onClick={() => setOpen(true)}
        disabled={!serverConnected}
        title={serverConnected ? "실제 영상 업로드" : "백엔드 서버가 필요합니다 (pnpm dev:server)"}
      >
        <Upload /> 영상 업로드
      </Button>
      {open && <UploadDialog onClose={() => setOpen(false)} defaultProgramId={programId} />}
    </>
  );
}

function fmtSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function fmtEta(sec: number): string {
  if (!isFinite(sec) || sec <= 0) return "계산 중…";
  if (sec < 60) return `약 ${Math.ceil(sec)}초`;
  if (sec < 3600) return `약 ${Math.ceil(sec / 60)}분`;
  const h = Math.floor(sec / 3600);
  const m = Math.ceil((sec % 3600) / 60);
  return `약 ${h}시간 ${m}분`;
}

function UploadDialog({ onClose, defaultProgramId }: { onClose: () => void; defaultProgramId?: string }) {
  const { programs, uploadVideo } = useAppData();
  const { toast } = useToast();
  const router = useRouter();
  const [programId, setProgramId] = useState(defaultProgramId ?? programs[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);
  const [speed, setSpeed] = useState(0); // bytes/sec, smoothed
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const sampleRef = useRef<{ t: number; bytes: number } | null>(null);

  // Guard a long upload against accidental loss: warn on tab close / refresh / hard nav.
  // (The modal overlay itself blocks in-app sidebar clicks while busy.)
  useEffect(() => {
    if (!busy) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [busy]);

  function pick(f: File | null | undefined) {
    if (!f) return;
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ""));
  }

  // Derive an upload speed (EMA) + ETA from the coarse percent ticks.
  function handleProgress(p: number) {
    setPct(p);
    if (!file) return;
    const now = performance.now();
    const bytes = (p / 100) * file.size;
    const prev = sampleRef.current;
    if (prev && now > prev.t && bytes > prev.bytes) {
      const inst = ((bytes - prev.bytes) / (now - prev.t)) * 1000; // bytes/sec
      setSpeed((s) => (s === 0 ? inst : s * 0.6 + inst * 0.4));
    }
    sampleRef.current = { t: now, bytes };
  }

  async function submit() {
    if (!file || busy) return;
    setBusy(true);
    setPct(0);
    setSpeed(0);
    sampleRef.current = { t: performance.now(), bytes: 0 };
    try {
      const episodeId = await uploadVideo(file, programId, title || file.name, handleProgress);
      toast({ title: "업로드 완료", description: `${file.name} · 회차·추천 생성됨`, tone: "done" });
      onClose();
      router.push(`/episodes/${episodeId}?tab=recommend`);
    } catch (err) {
      toast({ title: "업로드 실패", description: err instanceof Error ? err.message : String(err), tone: "error" });
      setBusy(false);
    }
  }

  const uploadedBytes = file ? Math.min(file.size, (pct / 100) * file.size) : 0;
  const remaining = file ? Math.max(0, file.size - uploadedBytes) : 0;
  const etaSec = speed > 0 ? remaining / speed : Infinity;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={busy ? undefined : onClose} aria-hidden />
      <div className="relative w-full max-w-md rounded-xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">실제 영상 업로드</h2>
          <button
            onClick={onClose}
            disabled={busy}
            title={busy ? "업로드 중에는 닫을 수 없습니다" : "닫기"}
            className="text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-4 p-4">
          <div>
            <div className="mb-1.5 text-xs font-semibold text-muted-foreground">프로그램</div>
            <select
              value={programId}
              onChange={(e) => setProgramId(e.target.value)}
              disabled={busy}
              className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              {programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </div>

          {/* drop zone — locked while uploading */}
          <div
            onClick={busy ? undefined : () => inputRef.current?.click()}
            onDragOver={(e) => {
              if (busy) return;
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              if (busy) return;
              e.preventDefault();
              setDragOver(false);
              pick(e.dataTransfer.files?.[0]);
            }}
            className={cn(
              "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors",
              busy ? "cursor-not-allowed opacity-60" : "cursor-pointer",
              dragOver ? "border-primary bg-primary/5" : "border-border hover:bg-accent/40",
            )}
          >
            <Film className="size-6 text-muted-foreground" />
            {file ? (
              <div className="text-sm">
                <div className="font-medium">{file.name}</div>
                <div className="text-xs text-muted-foreground tabular-nums">{fmtSize(file.size)}</div>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                영상 파일을 끌어다 놓거나 <span className="font-medium text-primary">클릭해서 선택</span>
                <div className="text-xs">mp4 · mov · webm 등 · 길이 제한 없음</div>
              </div>
            )}
            <input
              ref={inputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => pick(e.target.files?.[0])}
            />
          </div>

          {file && !busy && (
            <div>
              <div className="mb-1.5 text-xs font-semibold text-muted-foreground">제목</div>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={file.name}
                className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          )}

          {busy && (
            <div className="space-y-3">
              <div>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    {pct < 100 ? "업로드 중…" : "서버 처리 중 (프로브·썸네일·추천)…"}
                  </span>
                  <span className="font-medium tabular-nums">{pct}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full rounded-full transition-[width]",
                      pct < 100 ? "bg-primary" : "animate-pulse bg-status-progress",
                    )}
                    style={{ width: `${Math.max(2, pct)}%` }}
                  />
                </div>
                {pct < 100 && (
                  <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground tabular-nums">
                    <span>
                      {fmtSize(uploadedBytes)} / {fmtSize(file!.size)}
                    </span>
                    <span>{speed > 0 ? `${fmtSize(speed)}/s · 남은 시간 ${fmtEta(etaSec)}` : "속도 측정 중…"}</span>
                  </div>
                )}
              </div>

              <div className="flex items-start gap-2 rounded-md border border-status-warn/30 bg-status-warn/10 px-3 py-2 text-xs text-status-warn">
                <AlertTriangle className="mt-px size-4 shrink-0" />
                <span>
                  업로드가 끝날 때까지 이 창을 닫거나 페이지를 <b>새로고침·이동하지 마세요.</b> 큰 영상은 시간이 걸릴 수 있습니다.
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
          <Button variant="outline" size="sm" onClick={onClose} disabled={busy}>
            취소
          </Button>
          <Button size="sm" onClick={submit} disabled={!file || busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Upload />}
            {busy ? (pct < 100 ? "업로드 중…" : "처리 중…") : "업로드"}
          </Button>
        </div>
      </div>
    </div>
  );
}
