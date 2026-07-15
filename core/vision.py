"""
STEP D Core — Scene visual scoring (Gemini Vision on Vertex AI)

Scores each scene's representative frame for short-form worthiness, INDEPENDENT of
dialogue. This is what catches the blind spot: reaction shots, sight gags, and
inserts that carry the moment visually even when nobody is talking.

    scenes.json (프레임 + 대사)  →  Gemini Vision  →  vision_score / reason / tags

Reads scenes.json (from scenes.py), writes the vision fields back in place so the
admin Lab picks them up. Auth: ADC (no API key), same Vertex setup as refine.py.

Run:
    python -m core.vision core/scenes.json
    python -m core.vision core/scenes.json --limit 10   # 처음 10개만 (테스트)
"""
import json
import os
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass

from google import genai
from google.genai import types

PROJECT = os.environ.get("GOOGLE_CLOUD_PROJECT") or "step-d"
LOCATION = os.environ.get("VERTEX_LOCATION") or "us-central1"
MODEL = os.environ.get("GEMINI_MODEL") or "gemini-2.5-flash"
WORKERS = 6  # concurrent Vertex calls — enough to be quick, gentle on quota

PROMPT = """이 이미지는 한국어 예능/방송의 한 장면(대표 프레임)이다.
이 장면을 숏폼 클립으로 쓸 가치를 '시각적으로만' 평가하라. 대사가 없어도 화면만으로
의미가 크면 높게 준다.

평가 요소:
- 표정·리액션 (놀람·폭소·정색·오열 등 강한 감정)
- 움직임·액션·몸개그
- 화면에 박힌 방송 자막(편집자가 이미 중요하다고 표시한 신호 → 가점)
- 구도(클로즈업/강조)와 상황의 흥미도
- 단순 인트로/전환/평범한 대화 화면이면 낮게

score(0-100), reason(한국어 한 문장), tags(리액션/표정/액션/자막/구도/정적/전환/기타 중 1~3개)."""

SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "score": {"type": "INTEGER"},
        "reason": {"type": "STRING"},
        "tags": {"type": "ARRAY", "items": {"type": "STRING"}},
    },
    "required": ["score", "reason", "tags"],
}


def score_frame(client, frame_path: Path, dialogue: str) -> dict:
    img = frame_path.read_bytes()
    context = f"\n\n참고 — 이 장면에서 들리는 대사: \"{dialogue}\"" if dialogue else "\n\n(이 장면은 대사가 없다. 화면만으로 판단하라.)"
    resp = client.models.generate_content(
        model=MODEL,
        contents=[
            types.Part.from_bytes(data=img, mime_type="image/jpeg"),
            PROMPT + context,
        ],
        config=types.GenerateContentConfig(
            temperature=0.2,
            response_mime_type="application/json",
            response_schema=SCHEMA,
        ),
    )
    return json.loads(resp.text)


def score_scenes(scenes: list[dict], base_dir: Path, limit: int | None = None) -> list[dict]:
    client = genai.Client(vertexai=True, project=PROJECT, location=LOCATION)
    targets = [s for s in scenes if s.get("frame")]
    if limit:
        targets = targets[:limit]
    total = len(targets)
    done = [0]

    def work(scene: dict) -> None:
        frame = base_dir / scene["frame"]
        try:
            r = score_frame(client, frame, scene.get("text", ""))
            scene["vision_score"] = int(r.get("score", 0))
            scene["vision_reason"] = (r.get("reason") or "").strip()
            scene["vision_tags"] = r.get("tags", [])[:3]
        except Exception as e:
            scene["vision_score"] = None
            scene["vision_reason"] = f"(평가 실패: {str(e)[:80]})"
            scene["vision_tags"] = []
        done[0] += 1
        if done[0] % 10 == 0 or done[0] == total:
            print(f"   scored {done[0]}/{total}")

    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        list(ex.map(work, targets))

    return scenes


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python -m core.vision <scenes.json> [--limit N]")
        sys.exit(1)

    src = Path(sys.argv[1])
    limit = None
    if "--limit" in sys.argv:
        limit = int(sys.argv[sys.argv.index("--limit") + 1])

    scenes = json.loads(src.read_text(encoding="utf-8"))
    n = min(len(scenes), limit) if limit else len(scenes)
    print(f"시각 스코어링: {n} 장면 · 모델 {MODEL} (Vertex AI {PROJECT}/{LOCATION})")

    # frame paths in scenes.json are relative to the video's folder (scenes.py wrote them there)
    scenes = score_scenes(scenes, src.parent, limit=limit)

    src.write_text(json.dumps(scenes, ensure_ascii=False, indent=2), encoding="utf-8")

    scored = [s for s in scenes if s.get("vision_score") is not None]
    if scored:
        top = sorted(scored, key=lambda s: s["vision_score"], reverse=True)[:5]
        print(f"\n완료: {len(scored)} 장면 채점")
        print("상위 5 장면 (시각 점수):")
        for s in top:
            tm = f"{int(s['start']//60)}:{int(s['start']%60):02d}"
            tags = "/".join(s.get("vision_tags", []))
            dlg = "무음" if not s.get("text") else "대사"
            print(f"  [{tm}] {s['vision_score']:3d}점 · {dlg} · {tags} — {s['vision_reason'][:45]}")
    print(f"  → {src}")


if __name__ == "__main__":
    main()
