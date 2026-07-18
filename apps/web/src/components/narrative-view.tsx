'use client';

import type { NarrativeData } from '@/lib/data/api';

/** 초 단위 → MM:SS */
function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function NarrativeView({ narrative }: { narrative: NarrativeData | null | undefined }) {
  if (!narrative) {
    return (
      <div className="flex items-center justify-center h-48 text-white/40 text-sm">
        서사 분석 데이터가 없습니다
      </div>
    );
  }

  const { full_summary, segments, characters, key_conflicts } = narrative;

  return (
    <div className="space-y-6 p-4">
      {/* ── 전체분석 ── */}
      <section>
        <h3 className="text-sm font-semibold text-cyan-300 mb-2">📖 전체 서사 요약</h3>
        <div className="bg-white/5 rounded-lg p-4 text-sm leading-relaxed text-white/80 whitespace-pre-wrap">
          {full_summary || '전체 요약 정보가 없습니다.'}
        </div>
      </section>

      {/* ── 구간별분석 ── */}
      {segments && segments.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-cyan-300 mb-3">📑 구간별 분석</h3>
          <div className="space-y-3">
            {segments.map((seg) => (
              <div key={seg.block_index} className="bg-white/5 rounded-lg p-3">
                <div className="flex items-start justify-between mb-1">
                  <h4 className="text-sm font-medium text-white">{seg.title}</h4>
                  <span className="text-xs text-white/40 shrink-0 ml-2">
                    {fmt(seg.start)} ~ {fmt(seg.end)}
                  </span>
                </div>
                <p className="text-xs text-white/60 mb-2">{seg.summary}</p>
                {seg.key_moments && seg.key_moments.length > 0 && (
                  <div className="space-y-0.5">
                    {seg.key_moments.map((km, i) => (
                      <div key={i} className="text-xs text-amber-300/70">▸ {km}</div>
                    ))}
                  </div>
                )}
                {seg.characters && seg.characters.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {seg.characters.map((c) => (
                      <span key={c} className="px-1.5 py-0.5 bg-white/10 rounded text-[10px] text-white/50">
                        {c}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── 인물분석 ── */}
      {characters && characters.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-cyan-300 mb-3">👤 인물 분석</h3>
          <div className="grid gap-3">
            {characters.map((c) => (
              <div key={c.name} className="bg-white/5 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium text-white">{c.name}</span>
                  {c.role && <span className="text-[10px] text-white/40">({c.role})</span>}
                  {c.total_screen_sec > 0 && (
                    <span className="text-[10px] text-blue-300/50 ml-auto">
                      {fmt(c.total_screen_sec)}
                    </span>
                  )}
                </div>
                {c.personality_traits && c.personality_traits.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-1">
                    {c.personality_traits.map((t) => (
                      <span key={t} className="px-1.5 py-0.5 bg-purple-500/10 rounded text-[10px] text-purple-300/70">
                        {t}
                      </span>
                    ))}
                  </div>
                )}
                {c.key_relationships && c.key_relationships.length > 0 && (
                  <div className="space-y-0.5">
                    {c.key_relationships.map((r) => (
                      <div key={r} className="text-[10px] text-white/40">🔗 {r}</div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── 갈등분석 ── */}
      {key_conflicts && key_conflicts.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-cyan-300 mb-3">⚡ 주요 갈등 / 핵심 사건</h3>
          <div className="space-y-3">
            {key_conflicts.map((cf, i) => (
              <div key={i} className="bg-white/5 rounded-lg p-3 border-l-2 border-amber-500/40">
                <div className="flex items-start justify-between mb-1">
                  <h4 className="text-sm font-medium text-white">{cf.title}</h4>
                  {cf.time_range && (
                    <span className="text-xs text-white/40 shrink-0 ml-2">
                      {fmt(cf.time_range.start)} ~ {fmt(cf.time_range.end)}
                    </span>
                  )}
                </div>
                <p className="text-xs text-white/60 mb-1">{cf.description}</p>
                {cf.participants && cf.participants.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-1">
                    {cf.participants.map((p) => (
                      <span key={p} className="px-1.5 py-0.5 bg-red-500/10 rounded text-[10px] text-red-300/70">
                        {p}
                      </span>
                    ))}
                  </div>
                )}
                {cf.resolution && (
                  <div className="text-[10px] text-white/40 italic">{cf.resolution}</div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
