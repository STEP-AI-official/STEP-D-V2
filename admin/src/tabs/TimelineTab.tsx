import type { LabTimelineBlock } from "../types";
import { fmt } from "../util";

export default function TimelineTab({
  blocks,
  seek,
}: {
  blocks: LabTimelineBlock[];
  seek: (t: number) => void;
}) {
  if (!blocks.length) {
    return (
      <div className="empty-note">
        타임라인 분석이 없습니다. <code>python -m core.timeline core/scenes.json</code> 실행 후 새로고침.
      </div>
    );
  }

  return (
    <div>
      {blocks.map((b, i) => {
        const kps = b.key_points ?? [];
        const who = (b.who ?? []).slice(0, 8).join(", ");
        return (
          <div className="tl-block" key={i}>
            <div className="tl-time" onClick={() => seek(b.start)} title="이 구간으로 이동">
              <b>{fmt(b.start)}</b>
              <span>~ {fmt(b.end)}</span>
              <span>▶</span>
            </div>
            <div className="tl-body">
              <div className="tl-label">{b.label || ""}</div>
              {b.summary && <div className="tl-summary">{b.summary}</div>}
              {kps.length > 0 && (
                <div className="tl-kps">
                  {kps.map((k, j) => (
                    <span className="tl-kp" key={j}>
                      {k}
                    </span>
                  ))}
                </div>
              )}
              <div className="tl-meta">
                {who && <span className="who">👤 {who}</span>}
                {b.scene_count != null && <span className="cnt">씬 {b.scene_count}개 →</span>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
