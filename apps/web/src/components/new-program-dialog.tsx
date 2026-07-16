"use client";

import { useState } from "react";
import { Plus, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppData } from "@/lib/data/store";
import { useToast } from "@/components/ui/toast";
import { TARGET_AGES, targetAgeLabel } from "@/lib/constants";

const SECTIONS = ["예능", "드라마", "시사·교양", "스포츠", "라이프", "기타"];

/** Header action on /programs: create the content root a program needs before any upload. */
export function NewProgramButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        ＋ 새 프로그램
      </Button>
      {open && <NewProgramDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function NewProgramDialog({ onClose }: { onClose: () => void }) {
  const { createProgram } = useAppData();
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [section, setSection] = useState(SECTIONS[0]);
  const [targetAge, setTargetAge] = useState<number>(0);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const t = title.trim();
    if (!t || busy) return;
    setBusy(true);
    try {
      await createProgram({ title: t, section, targetAge });
      toast({ title: "프로그램 생성됨", description: t, tone: "done" });
      onClose();
    } catch (err) {
      toast({ title: "생성 실패", description: err instanceof Error ? err.message : String(err), tone: "error" });
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={busy ? undefined : onClose} aria-hidden />
      <div className="relative w-full max-w-md rounded-xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">새 프로그램</h2>
          <button
            onClick={onClose}
            disabled={busy}
            className="text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-4 p-4">
          <div>
            <div className="mb-1.5 text-xs font-semibold text-muted-foreground">프로그램 제목</div>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
              placeholder="예: 전지적 참견 시점"
              className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="mb-1.5 text-xs font-semibold text-muted-foreground">장르</div>
              <select
                value={section}
                onChange={(e) => setSection(e.target.value)}
                className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {SECTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="mb-1.5 text-xs font-semibold text-muted-foreground">시청 등급</div>
              <select
                value={targetAge}
                onChange={(e) => setTargetAge(Number(e.target.value))}
                className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {TARGET_AGES.map((a) => (
                  <option key={a} value={a}>
                    {targetAgeLabel(a)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
          <Button variant="outline" size="sm" onClick={onClose} disabled={busy}>
            취소
          </Button>
          <Button size="sm" onClick={submit} disabled={!title.trim() || busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Plus />}
            만들기
          </Button>
        </div>
      </div>
    </div>
  );
}
