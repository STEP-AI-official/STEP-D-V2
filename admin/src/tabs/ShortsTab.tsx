import type { LabShort } from "../types";
import { fmt } from "../util";

export default function ShortsTab({
  shorts,
  seek,
}: {
  shorts: LabShort[];
  seek: (t: number) => void;
}) {
  // rank 없는 항목은 뒤로 (원본과 동일하게 99로 취급).
  const list = [...shorts].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));

  if (!list.length) {
    return (
      <div className="empty-note">
        쇼츠 추천이 없습니다. <code>python -m core.recommend core/scenes.json</code> 실행 후 새로고침.
      </div>
    );
  }

  return (
    <div>
      {list.map((s, i) => {
        const dur = Math.round(s.end - s.start);
        const tags = s.tags ?? [];
        return (
          <div className="short" key={i} onClick={() => seek(s.start)}>
            <div className="rank">#{s.rank ?? "?"}</div>
            <div className="body">
              <div className="title">{s.title || ""}</div>
              <div className="sub">
                <b>
                  {fmt(s.start)} ~ {fmt(s.end)}
                </b>{" "}
                · {dur}초
              </div>
              <div className="reason">{s.reason || ""}</div>
              {tags.length > 0 && (
                <div className="stags">
                  {tags.map((t, j) => (
                    <span className="stag" key={j}>
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="play">▶</div>
          </div>
        );
      })}
    </div>
  );
}
