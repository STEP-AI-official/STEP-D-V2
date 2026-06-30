"""On-demand PPL (product placement) analysis for a rendered Short.

Samples frames from the rendered clip, asks Gemini to detect branded products
with bounding boxes, then aggregates the per-frame detections into a product
list (for sponsorship reporting + affiliate tagging) plus a per-frame overlay
track (for drawing boxes synced to playback). Boxes are normalized to 0..1 of
the rendered frame so the frontend can position them as percentages.
"""

import json
import math
from datetime import datetime
from typing import Any

from app.core.config import get_settings
from app.core.database import session_scope
from app.models import Clip
from app.services.ffmpeg import extract_frames
from app.services.gemini import detect_ppl
from app.services.storage import ensure_job_dirs, media_path_from_url


def _clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


def _norm_box(box: Any) -> list[float] | None:
    """Gemini returns [ymin, xmin, ymax, xmax] in 0-1000. Convert to
    [x, y, w, h] normalized 0..1, or None if the box is unusable."""
    if not isinstance(box, (list, tuple)) or len(box) != 4:
        return None
    try:
        ymin, xmin, ymax, xmax = (float(v) / 1000.0 for v in box)
    except (TypeError, ValueError):
        return None
    x, y = _clamp(xmin), _clamp(ymin)
    w, h = _clamp(xmax) - x, _clamp(ymax) - y
    if w <= 0.005 or h <= 0.005:
        return None
    return [round(x, 4), round(y, 4), round(w, 4), round(h, 4)]


def _sample_times(duration: float, settings) -> list[float]:
    interval = max(0.1, float(settings.ppl_sample_interval_seconds))
    if duration <= 0:
        return [0.0]
    count = max(1, min(int(settings.ppl_max_frames), math.ceil(duration / interval)))
    step = duration / count
    # Sample the centre of each segment so the first/last frames aren't black.
    return [round(min(duration - 0.05, (i + 0.5) * step), 2) for i in range(count)]


def _product_key(brand: str, product: str) -> str:
    return f"{brand.strip().lower()}|{product.strip().lower()}"


def _detect_voice_mentions(
    products: dict[str, dict[str, Any]],
    job_id: str,
    clip_start: float,
    clip_end: float,
    settings,
) -> None:
    """Scan STT transcript for brand/product name mentions within the clip's time range.
    Mutates each product entry to add a voice_mentions list."""
    transcript_path = (
        settings.storage_dir.resolve() / "jobs" / job_id / "transcripts" / "transcript.json"
    )
    if not transcript_path.exists():
        for entry in products.values():
            entry.setdefault("voice_mentions", [])
        return

    try:
        transcript = json.loads(transcript_path.read_text(encoding="utf-8"))
    except Exception:
        for entry in products.values():
            entry.setdefault("voice_mentions", [])
        return

    segments = transcript.get("segments") or []
    for entry in products.values():
        entry["voice_mentions"] = []

    for seg in segments:
        seg_start = float(seg.get("start") or 0.0)
        seg_end = float(seg.get("end") or 0.0)
        seg_text = str(seg.get("text") or "").strip()
        if seg_end < clip_start or seg_start > clip_end or not seg_text:
            continue
        seg_lower = seg_text.lower()
        for entry in products.values():
            candidates = []
            if entry["brand"] and entry["brand"] not in ("노브랜드", ""):
                candidates.append(entry["brand"].lower())
            if entry["product"] and entry["product"] not in ("상품", ""):
                candidates.append(entry["product"].lower())
            for name in candidates:
                if len(name) >= 2 and name in seg_lower:
                    entry["voice_mentions"].append({
                        "text": seg_text,
                        "video_time": round(seg_start, 2),
                        "clip_time": round(max(0.0, seg_start - clip_start), 2),
                    })
                    break


def build_ppl_analysis(clip: Clip, settings) -> dict[str, Any]:
    short_path = media_path_from_url(settings, clip.video_url)
    if not short_path.exists():
        raise FileNotFoundError(f"Rendered short not found for clip {clip.id}")

    duration = max(0.0, float(clip.end_time) - float(clip.start_time))
    times = _sample_times(duration, settings)

    dirs = ensure_job_dirs(settings, clip.job_id)
    prefix = f"ppl_{clip.rank:03d}"
    frame_paths = extract_frames(short_path, dirs["frames"], times, settings, prefix)
    try:
        raw_frames = detect_ppl(frame_paths, times, settings)
    finally:
        for path in frame_paths:
            try:
                path.unlink(missing_ok=True)
            except OSError:
                pass

    min_conf = float(settings.ppl_min_confidence)
    overlay_frames: list[dict[str, Any]] = []
    products: dict[str, dict[str, Any]] = {}
    step = duration / len(times) if times else 0.0

    for frame in raw_frames:
        if not isinstance(frame, dict):
            continue
        index = frame.get("frame_index")
        if not isinstance(index, int) or index < 0 or index >= len(times):
            continue
        timestamp = times[index]
        frame_dets: list[dict[str, Any]] = []
        for det in frame.get("detections") or []:
            if not isinstance(det, dict):
                continue
            confidence = _clamp(float(det.get("confidence") or 0.0))
            if confidence < min_conf:
                continue
            brand = str(det.get("brand") or "").strip()
            product = str(det.get("product") or "").strip()
            if not product and not brand:
                continue
            box = _norm_box(det.get("box"))
            if box is None:
                continue
            category = str(det.get("category") or "").strip()
            key = _product_key(brand or "노브랜드", product or category or "상품")

            entry = products.get(key)
            if entry is None:
                entry = {
                    "id": f"ppl_{len(products) + 1}",
                    "brand": brand or "노브랜드",
                    "product": product or category or "상품",
                    "category": category,
                    "confidence": confidence,
                    "first_seen": timestamp,
                    "last_seen": timestamp,
                    "frames_seen": 0,
                    "best_box": box,
                    "affiliate_url": "",
                }
                products[key] = entry
            entry["confidence"] = max(entry["confidence"], confidence)
            entry["first_seen"] = min(entry["first_seen"], timestamp)
            entry["last_seen"] = max(entry["last_seen"], timestamp)
            entry["frames_seen"] += 1
            if confidence >= entry["confidence"]:
                entry["best_box"] = box
            if category and not entry["category"]:
                entry["category"] = category

            frame_dets.append({
                "product_id": entry["id"],
                "brand": entry["brand"],
                "product": entry["product"],
                "box": box,
                "confidence": round(confidence, 3),
            })
        overlay_frames.append({"timestamp": timestamp, "detections": frame_dets})

    _detect_voice_mentions(products, clip.job_id, float(clip.start_time), float(clip.end_time), settings)

    product_list = []
    for entry in products.values():
        entry["exposure_seconds"] = round(entry["frames_seen"] * step, 2)
        entry["confidence"] = round(entry["confidence"], 3)
        product_list.append(entry)
    product_list.sort(key=lambda item: (item["exposure_seconds"], item["confidence"]), reverse=True)

    overlay_frames.sort(key=lambda item: item["timestamp"])

    return {
        "status": "done",
        "model": settings.gemini_model,
        "analyzed_at": datetime.utcnow().isoformat(),
        "duration_seconds": round(duration, 2),
        "frame_count": len(times),
        "products": product_list,
        "frames": overlay_frames,
    }


def analyze_clip_ppl(clip_id: str) -> dict[str, Any]:
    """Run PPL analysis for a clip and persist the result on the clip."""
    settings = get_settings()
    with session_scope() as db:
        clip = db.get(Clip, clip_id)
        if not clip:
            raise ValueError("Clip not found")
        analysis = build_ppl_analysis(clip, settings)
        clip.ppl_analysis_json = analysis
        return analysis


def update_ppl_affiliate_links(clip_id: str, links: dict[str, str]) -> dict[str, Any]:
    """Patch affiliate URLs for already-detected products (tagging workflow)."""
    with session_scope() as db:
        clip = db.get(Clip, clip_id)
        if not clip:
            raise ValueError("Clip not found")
        analysis = dict(clip.ppl_analysis_json or {})
        products = [dict(item) for item in analysis.get("products") or []]
        for product in products:
            if product.get("id") in links:
                product["affiliate_url"] = str(links[product["id"]] or "").strip()
        analysis["products"] = products
        clip.ppl_analysis_json = analysis
        return analysis


def delete_ppl_product(clip_id: str, product_id: str) -> dict[str, Any]:
    """Remove one detected product (and its frame detections) from a clip's PPL analysis."""
    with session_scope() as db:
        clip = db.get(Clip, clip_id)
        if not clip:
            raise ValueError("Clip not found")
        analysis = dict(clip.ppl_analysis_json or {})
        analysis["products"] = [
            dict(item) for item in analysis.get("products") or [] if item.get("id") != product_id
        ]
        frames: list[dict[str, Any]] = []
        for frame in analysis.get("frames") or []:
            new_frame = dict(frame)
            new_frame["detections"] = [
                d for d in (frame.get("detections") or []) if d.get("product_id") != product_id
            ]
            if new_frame["detections"]:
                frames.append(new_frame)
        analysis["frames"] = frames
        analysis["frame_count"] = len(frames)
        clip.ppl_analysis_json = analysis
        return analysis
