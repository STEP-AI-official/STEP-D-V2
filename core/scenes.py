"""
STEP D Core — Scene segmentation (visual units)

Splits the whole video at shot/scene changes so EVERY moment becomes a candidate —
including silent ones the STT/VAD path misses (reaction shots, sight gags, inserts).
Each scene gets a representative frame; STT dialogue is attached where it overlaps.

    영상 ──장면전환──▶ [scene…]  →  대표 프레임  +  (겹치는 STT 대사)

A scene = { index, start, end, duration, frame, text, has_dialogue }.
Silent-but-meaningful scenes come out as has_dialogue=False (frame, no text) — those
are exactly what the dialogue-only pipeline was dropping.

Run:
    python -m core.scenes core/TpQgkCs0TzE.mp4
    python -m core.scenes core/TpQgkCs0TzE.mp4 --transcript core/refined_segments.json
"""
import json
import subprocess
import sys
from pathlib import Path
from typing import Optional

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass

from scenedetect import detect, ContentDetector


def detect_scenes(video_path: str, threshold: float = 27.0) -> list[tuple[float, float]]:
    """Shot boundaries as (start_sec, end_sec). Falls back to one whole-video scene."""
    scene_list = detect(video_path, ContentDetector(threshold=threshold))
    scenes = [(s.get_seconds(), e.get_seconds()) for s, e in scene_list]
    if not scenes:  # no cuts detected (static/continuous) — treat the video as one scene
        dur = _video_duration(video_path)
        scenes = [(0.0, dur)] if dur else []
    return scenes


def _video_duration(path: str) -> float:
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "quiet", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", path],
            capture_output=True, text=True, check=True,
        )
        return float(out.stdout.strip())
    except (subprocess.CalledProcessError, FileNotFoundError, ValueError):
        return 0.0


def extract_frame(video_path: str, t: float, out_path: str) -> bool:
    """Grab a single JPEG at time t (seconds). -ss before -i = fast seek."""
    try:
        subprocess.run(
            ["ffmpeg", "-y", "-v", "error", "-ss", f"{t:.3f}", "-i", video_path,
             "-frames:v", "1", "-q:v", "3", out_path],
            check=True,
        )
        return Path(out_path).exists()
    except (subprocess.CalledProcessError, FileNotFoundError):
        return False


def attach_transcript(scenes: list[tuple[float, float]], segments: list[dict]) -> list[dict]:
    """Attach each STT segment's text to the scene(s) whose time range it overlaps."""
    out = []
    for idx, (start, end) in enumerate(scenes, 1):
        texts = [
            (seg.get("text") or "").strip()
            for seg in segments
            if seg["end"] > start and seg["start"] < end and (seg.get("text") or "").strip()
        ]
        out.append({
            "index": idx,
            "start": round(start, 3),
            "end": round(end, 3),
            "duration": round(end - start, 3),
            "text": " ".join(texts),
            "has_dialogue": bool(texts),
        })
    return out


def build_scenes(
    video_path: str,
    segments: list[dict],
    frames_dir: Path,
    threshold: float = 27.0,
) -> list[dict]:
    print(f"장면 감지 중… (threshold={threshold})")
    boundaries = detect_scenes(video_path, threshold=threshold)
    print(f"   {len(boundaries)} 장면 감지")

    scenes = attach_transcript(boundaries, segments)

    frames_dir.mkdir(parents=True, exist_ok=True)
    print(f"대표 프레임 추출 중… → {frames_dir}")
    for sc in scenes:
        mid = (sc["start"] + sc["end"]) / 2
        fname = f"scene_{sc['index']:04d}.jpg"
        ok = extract_frame(video_path, mid, str(frames_dir / fname))
        sc["frame"] = f"{frames_dir.name}/{fname}" if ok else None

    return scenes


def _load_segments(transcript: Optional[str], video_path: str) -> list[dict]:
    """Prefer the refined transcript, then the pipeline output, else empty (frames only)."""
    candidates = []
    if transcript:
        candidates.append(Path(transcript))
    base = Path(video_path).parent
    candidates += [base / "refined_segments.json", base / "pipeline_output.json"]
    for p in candidates:
        if p and p.exists():
            data = json.loads(p.read_text(encoding="utf-8"))
            segs = data["segments"] if isinstance(data, dict) else data
            print(f"자막 소스: {p.name} ({len(segs)} 세그먼트)")
            return segs
    print("자막 소스 없음 — 프레임만 (대사 미첨부)")
    return []


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python -m core.scenes <video> [--transcript <segments.json>] [--threshold 27]")
        sys.exit(1)

    video = sys.argv[1]
    transcript = None
    threshold = 27.0
    if "--transcript" in sys.argv:
        transcript = sys.argv[sys.argv.index("--transcript") + 1]
    if "--threshold" in sys.argv:
        threshold = float(sys.argv[sys.argv.index("--threshold") + 1])

    segments = _load_segments(transcript, video)
    out_dir = Path(video).parent
    frames_dir = out_dir / "scene_frames"

    scenes = build_scenes(video, segments, frames_dir, threshold=threshold)

    json_path = out_dir / "scenes.json"
    json_path.write_text(json.dumps(scenes, ensure_ascii=False, indent=2), encoding="utf-8")

    talk = sum(1 for s in scenes if s["has_dialogue"])
    silent = len(scenes) - talk
    print()
    print(f"완료: {len(scenes)} 장면 · 대사있음 {talk} · 무음 {silent}")
    print(f"  → 무음 {silent}개는 기존 STT 파이프라인이 놓치던 후보")
    print(f"  JSON: {json_path}")
    print(f"  프레임: {frames_dir}/")


if __name__ == "__main__":
    main()
