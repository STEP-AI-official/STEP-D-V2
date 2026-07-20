import type { LabCastPerson } from "../types";
import { fmt, portraitUrl } from "../util";

export default function CastTab({
  people,
  seek,
}: {
  people: LabCastPerson[];
  seek: (t: number) => void;
}) {
  if (!people.length) {
    return <div className="empty-note">출연진 정보가 없습니다.</div>;
  }

  return (
    <div>
      {people.map((p, i) => {
        const spans = p.appearances ?? [];
        const first = spans.length ? Math.min(...spans.map((a) => a.start)) : null;
        const last = spans.length ? Math.max(...spans.map((a) => a.end)) : null;
        const count = p.scene_count ?? spans.length;
        const aliases = [...new Set(p.aliases ?? [])].filter((a) => a !== p.name);
        const chips = spans.slice(0, 8);

        return (
          <div className="cast-card" key={i}>
            {p.portrait ? (
              <img className="portrait" src={portraitUrl(p.portrait)} alt="" loading="lazy" />
            ) : (
              // 인물 사진이 없으면 이름 첫 글자 원형 플레이스홀더.
              <div className="portrait ph">{(p.name || "?").slice(0, 1)}</div>
            )}
            <div className="cast-body">
              <div className="cast-name">
                {p.name || "?"}{" "}
                {p.status === "matched" ? (
                  <span className="cast-badge matched">확정</span>
                ) : (
                  <span className="cast-badge candidate">후보</span>
                )}{" "}
                {p.confidence != null && (
                  <span style={{ fontSize: 11, color: "var(--mut2)" }}>
                    conf {Number(p.confidence).toFixed(2)}
                  </span>
                )}
              </div>
              {aliases.length > 0 && <div className="cast-alias">🏷 {aliases.join(", ")}</div>}
              {p.description && <div className="cast-desc">{p.description}</div>}
              <div className="cast-stats">
                등장 {count}회
                {first != null && ` · 첫 등장 ${fmt(first)}`}
                {last != null && ` · 마지막 ${fmt(last)}`}
                {p.total_sec != null && ` · 총 ${Math.round(p.total_sec)}초`}
              </div>
              {chips.length > 0 && (
                <div className="cast-spans">
                  {chips.map((a, j) => (
                    <span className="cast-span" key={j} onClick={() => seek(a.start)}>
                      {fmt(a.start)}~{fmt(a.end)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
