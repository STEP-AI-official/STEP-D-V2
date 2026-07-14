"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, Loader2, X, Film } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAppData } from "@/lib/data/store";
import { useToast } from "@/components/ui/toast";

/** Header action: open the real-video upload dialog (needs the backend). */
export function UploadVideoButton() {
  const { serverConnected } = useAppData();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
        disabled={!serverConnected}
        title={serverConnected ? "실제 영상 업로드" : "백엔드 서버가 필요합니다 (pnpm dev:server)"}
      >
        <Upload /> 영상 업로드
      </Button>
      {open && <UploadDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function fmtSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function UploadDialog({ onClose }: { onClose: () => void }) {
  const { programs, uploadVideo } = useAppData();
  const { toast } = useToast();
  const router = useRouter();
  const [programId, setProgramId] = useState(programs[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function pick(f: File | null | undefined) {
    if (!f) return;
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ""));
  }

  async function submit() {
    if (!file || busy) return;
    setBusy(true);
    setPct(0);
    try {
      const episodeId = await uploadVideo(file, programId, title || file.name, setPct);
      toast({ title: "업로드 완료", description: `${file.name} · 회차·추천 생성됨`, tone: "done" });
      onClose();
      router.push(`/episodes/${episodeId}?tab=recommend`);
    } catch (err) {
      toast({ title: "업로드 실패", description: err instanceof Error ? err.message : String(err), tone: "error" });
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={busy ? undefined : onClose} aria-hidden />
      <div className="relative w-full max-w-md rounded-xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">실제 영상 업로드</h2>
          <button onClick={onClose} disabled={busy} className="text-muted-foreground hover:text-foreground disabled:opacity-40">
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-4 p-4">
          <div>
            <div className="mb-1.5 text-xs font-semibold text-muted-foreground">프로그램</div>
            <select
              value={programId}
              onChange={(e) => setProgramId(e.target.value)}
              className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </div>

          {/* drop zone */}
          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              pick(e.dataTransfer.files?.[0]);
            }}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors",
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
                <div className="text-xs">mp4 · mov · webm 등</div>
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

          {file && (
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
            <div>
              <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                <span>{pct < 100 ? "업로드 중…" : "서버 처리 중 (프로브·썸네일·추천)…"}</span>
                <span className="tabular-nums">{pct}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-[width]"
                  style={{ width: `${pct < 100 ? pct : 100}%` }}
                />
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
            업로드
          </Button>
        </div>
      </div>
    </div>
  );
}
