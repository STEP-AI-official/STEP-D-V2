"""
STEP D Core — Shorts recommendation (fusion)

Reads the analyzed scene timeline (scenes.json: per-scene visual analysis + dialogue
+ name captions + vision score) and asks Gemini to pick the best short-form clips —
grouping consecutive scenes into complete, self-contained bits (hook → payoff).

This is the product payoff: everything upstream (STT → refine → scenes → vision →
names) feeds one reasoning call that outputs "cut THIS 30s as a short, because …".

    scenes.json (장면별 분석 타임라인)  →  Gemini 추론  →  쇼츠 추천 [start,end,제목,이유]

Run:
    python -m core.recommend core/scenes.json
    python -m core.recommend core/scenes.json --n 8
"""
import json
import os
import sys
from pathlib import Path

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass

from google import genai
from google.genai import types

PROJECT = os.environ.get("GOOGLE_CLOUD_PROJECT") or "step-d"
LOCATION = os.environ.get("VERTEX_LOCATION") or "asia-northeast3"
MODEL = os.environ.get("GEMINI_MODEL") or "gemini-2.5-flash"

SYSTEM = """너는 예능 숏폼(쇼츠) 편집 전문가다. 아래는 한 예능 영상을 장면 단위로 분석한
타임라인이다. 각 줄: [장면번호] 시각~시각 (길이) | 화면분석 | 대사 | 등장인물(화면자막) | 시각점수(0-100).

이 영상에서 쇼츠로 만들면 가장 터질 구간을 골라라.
규칙:
- 하나의 쇼츠는 완결된 재미/서사 단위여야 한다: 훅(초반 시선강탈) → 전개 → 펀치라인/마무리.
- 여러 장면을 자연스럽게 이어 붙여 하나의 구간으로 (start=첫 장면 시작, end=끝 장면 끝).
- 길이는 15~60초 권장 (짧은 임팩트 컷은 15초 미만도 허용).
- 시각점수가 높은 리액션·표정·방송자막 순간을 우선 포함하되, 대사 맥락으로 '왜 웃긴지'가 서는 구간.
- 단순 정보전달/평범한 대화/인트로는 제외.

각 추천에 대해: rank, start(초), end(초), title(클릭 유도되는 한국어 제목), reason(왜 터지는지 한 문장),
scene_from/scene_to(포함 장면번호 범위), tags(리액션/폭소/반전/서사/자막 등)."""

SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "shorts": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "rank": {"type": "INTEGER"},
                    "start": {"type": "NUMBER"},
                    "end": {"type": "NUMBER"},
                    "title": {"type": "STRING"},
                    "reason": {"type": "STRING"},
                    "scene_from": {"type": "INTEGER"},
                    "scene_to": {"type": "INTEGER"},
                    "tags": {"type": "ARRAY", "items": {"type": "STRING"}},
                },
                "required": ["rank", "start", "end", "title", "reason"],
            },
        },
    },
    "required": ["shorts"],
}


def _mmss(s: float) -> str:
    return f"{int(s // 60)}:{int(s % 60):02d}"


def build_timeline(scenes: list[dict]) -> str:
    lines = []
    for s in scenes:
        names = ",".join(s.get("on_screen_names", []))
        vis = s.get("vision_reason", "")
        txt = (s.get("text") or "").strip() or "-"
        score = s.get("vision_score")
        lines.append(
            f"[{s['index']}] {_mmss(s['start'])}~{_mmss(s['end'])} ({s['duration']:.0f}s)"
            f" | 화면:{vis} | 대사:{txt} | 인물:{names or '-'} | 시각:{score if score is not None else '-'}"
        )
    return "\n".join(lines)


def recommend(scenes: list[dict], n: int = 5) -> list[dict]:
    client = genai.Client(vertexai=True, project=PROJECT, location=LOCATION)
    timeline = build_timeline(scenes)
    resp = client.models.generate_content(
        model=MODEL,
        contents=f"쇼츠 {n}개를 추천하라.\n\n=== 장면 타임라인 ===\n{timeline}",
        config=types.GenerateContentConfig(
            system_instruction=SYSTEM,
            temperature=0.3,
            response_mime_type="application/json",
            response_schema=SCHEMA,
        ),
    )
    data = json.loads(resp.text)
    return data.get("shorts", [])


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python -m core.recommend <scenes.json> [--n 5]")
        sys.exit(1)

    src = Path(sys.argv[1])
    n = int(sys.argv[sys.argv.index("--n") + 1]) if "--n" in sys.argv else 5

    scenes = json.loads(src.read_text(encoding="utf-8"))
    print(f"쇼츠 추천: {len(scenes)} 장면 분석 → {n}개 · {MODEL} (Vertex AI {PROJECT}/{LOCATION})")

    shorts = recommend(scenes, n=n)

    out = src.parent / "shorts.json"
    out.write_text(json.dumps(shorts, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"\n=== 추천 쇼츠 {len(shorts)}개 ===")
    for s in sorted(shorts, key=lambda x: x.get("rank", 99)):
        dur = s["end"] - s["start"]
        tags = "/".join(s.get("tags", []))
        print(f"  #{s.get('rank')} [{_mmss(s['start'])}~{_mmss(s['end'])}] {dur:.0f}s · {tags}")
        print(f"     『{s['title']}』")
        print(f"     {s['reason']}")
    print(f"\n  → {out}")


if __name__ == "__main__":
    main()
