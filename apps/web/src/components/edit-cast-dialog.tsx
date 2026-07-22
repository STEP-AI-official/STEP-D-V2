"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAppData } from "@/lib/data/store";
import { useToast } from "@/components/ui/toast";
import type { Program } from "@/lib/types";

/** Header/inline button that opens a cast editor for one program.
 *  cast는 refine speaker 라벨링·recommend 프롬프트에 primary source로 들어감 — 다음 재분석부터 반영. */
export function EditCastButton({ program }: { program: Program }) {
  const [open, setOpen] = useState(false);
  const cast = program.cast ?? [];
  const empty = cast.length === 0;
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
        title="이 프로그램의 출연자 명단 편집 — refine이 이 이름으로 speaker 라벨링"
        style={empty ? { color: "var(--color-status-warn)", borderColor: "var(--color-status-warn)" } : undefined}
      >
        출연자 <span className="mono ml-0.5 tabular-nums">{cast.length}</span>
      </Button>
      {open && <EditCastDialog program={program} onClose={() => setOpen(false)} />}
    </>
  );
}

function EditCastDialog({ program, onClose }: { program: Program; onClose: () => void }) {
  const { updateProgram } = useAppData();
  const { toast } = useToast();
  const initial = (program.cast ?? []).join(", ");
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);

  // 쉼표·줄바꿈 둘 다 구분자로 · 중복 제거
  const preview = Array.from(new Set(text.split(/[,\n]/).map((s) => s.trim()).filter(Boolean)));

  async function submit() {
    if (busy) return;
    setBusy(true);
    try {
      await updateProgram(program.id, { cast: preview });
      toast({ title: `출연자 ${preview.length}명 저장`, description: "다음 재분석부터 refine·recommend 프롬프트에 반영돼요.", tone: "done" });
      onClose();
    } catch (e) {
      toast({ title: "출연자 저장 실패", description: e instanceof Error ? e.message : "다시 시도해 주세요.", tone: "error" });
      setBusy(false);
    }
  }

  return (
    <div onClick={onClose} className="fixed inset-0 z-70 flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm">
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-[520px] max-w-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
      >
        <div className="flex items-center gap-2 border-b border-border px-5 py-4">
          <div>
            <div className="text-[15px] font-bold">출연자 편집</div>
            <div className="mt-0.5 text-[11.5px] text-muted-foreground">{program.title}</div>
          </div>
          <span className="flex-1" />
          <button onClick={onClose} className="text-lg leading-none text-muted-foreground hover:text-foreground">✕</button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-5">
          <div className="rounded-md border border-brand/25 bg-brand/5 px-3 py-2.5">
            <div className="mb-1 text-[11.5px] font-bold text-brand">refine speaker 라벨링의 primary source</div>
            <div className="text-[11.5px] leading-relaxed text-muted-foreground">쉼표(,) 또는 줄바꿈으로 구분. STT 오인식(예: 옥순→옥수)은 이 명단 기준으로 자동 정규화 시도. 명단에 없는 인물은 M1/F1... fallback으로 남아 검토용 flag가 됨.</div>
          </div>
          <div>
            <div className="mb-1 text-[11.5px] font-semibold text-muted-foreground">출연자 명단</div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="영수, 영호, 영식, 영철, 광수, 상철, 영자, 영숙, 옥순, 정숙, 현숙, 순자"
              rows={5}
              className="w-full resize-none rounded-md border border-input bg-background px-3 py-2.5 text-sm outline-none"
            />
          </div>
          {preview.length > 0 && (
            <div>
              <div className="mb-1 text-[11.5px] font-semibold text-muted-foreground">미리보기 · {preview.length}명</div>
              <div className="flex flex-wrap gap-1">
                {preview.map((n) => (
                  <span key={n} className="rounded border border-border bg-muted px-1.5 py-0.5 text-[11.5px] font-semibold">{n}</span>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <Button size="sm" variant="outline" onClick={onClose}>취소</Button>
          <Button size="sm" onClick={submit} disabled={busy}>{busy ? "저장 중…" : "저장"}</Button>
        </div>
      </div>
    </div>
  );
}
