"""채널 포인트 규칙 학습 (LEARN) — 고성과 구간의 공통 특성을 규칙으로 뽑는다.

point_profile.py가 hook·emotion·길이의 '통계 대조'를 낸다면, 여기서는 그 통계 + 실제
자막·장면 텍스트를 **함께** Gemini에 주고, 사람이 읽고 적용할 수 있는 규칙으로 일반화한다.

왜 통계와 텍스트를 같이 주나: 통계만 주면 "반전 훅이 lift 1.4" 같은 숫자만 나오고 왜
그런지 모른다. 텍스트만 주면 모델이 근거 없이 지어낸다. 둘을 같이 줘야 "고성과는 명확한
한 방(주장/사건)이 있고 저성과는 상황 진행이라 뾰족한 순간이 없다" 같은 실행 가능한
규칙이 나온다.

출력: channel_point_profile — recommend.py 프롬프트에 그대로 넣을 수 있는 형태.
  {winning_patterns, avoid_patterns, optimal_length_sec, title_rules, confidence}

정직성: 표본이 작으면(각 tier <8) confidence를 낮추고 "방향성"으로만 낸다. 과장 금지.
"""

from __future__ import annotations

import json
import os
import sys

from google import genai
from google.genai import types

from .retry import call_with_retry
from .point_profile import analyze as stat_analyze

PROJECT = os.environ.get("GOOGLE_CLOUD_PROJECT") or "step-d"
LOCATION = os.environ.get("VERTEX_LOCATION") or "asia-northeast3"
MODEL = os.environ.get("GEMINI_MODEL") or "gemini-2.5-flash"

_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "channel": {"type": "STRING"},
        "winning_patterns": {
            "type": "ARRAY", "items": {
                "type": "OBJECT",
                "properties": {
                    "pattern": {"type": "STRING", "description": "고성과 구간의 공통 특성 한 줄"},
                    "why": {"type": "STRING", "description": "왜 이게 성과로 이어지는가"},
                    "evidence": {"type": "ARRAY", "items": {"type": "STRING"},
                                 "description": "근거가 된 실제 숏폼 제목들"},
                },
                "required": ["pattern", "why"],
            },
        },
        "avoid_patterns": {
            "type": "ARRAY", "items": {"type": "STRING",
                "description": "저성과 구간에 공통으로 결여됐거나 있던 것(피해야 할 특성)"},
        },
        "optimal_length_sec": {
            "type": "OBJECT",
            "properties": {"min": {"type": "INTEGER"}, "max": {"type": "INTEGER"}},
            "required": ["min", "max"],
        },
        "title_rules": {"type": "ARRAY", "items": {"type": "STRING"}},
        "confidence": {"type": "NUMBER", "description": "0~1. 표본이 작으면 낮게."},
    },
    "required": ["channel", "winning_patterns", "avoid_patterns", "optimal_length_sec", "confidence"],
}

_PROMPT = """너는 한국 방송·미디어 숏폼 편성 분석가다. 아래는 한 유튜브 채널에서 실제 발행된 숏폼을
성과(같은 시기 채널 중앙값 대비 배수)로 high/low로 나눈 것이다. 각 항목은 그 숏폼이 잘려 나온
롱폼 구간의 자막·장면요약·훅·감정·길이를 담는다.

목표: **고성과(high) 구간이 저성과(low) 구간과 무엇이 다른가**를 규칙으로 뽑아라.
- 비교(고성과 평균 vs 저성과 평균)가 아니라, 고성과가 되게 만든 **소스 구간의 특성**을 찾아라.
- 반드시 실제 사례(제목)를 근거로 대라. 근거 없는 추측 금지.
- 통계 요약(아래 STATS)과 실제 내용을 함께 보고 판단하라. 숫자만으로도, 인상만으로도 안 된다.
- 표본이 작으면 confidence를 낮춰라. 없는 확신을 만들지 마라.

=== STATS (hook/emotion/길이 통계 대조) ===
{stats}

=== HIGH tier 구간 ({high_n}건) ===
{high_block}

=== LOW tier 구간 ({low_n}건) ===
{low_block}
"""


def _block(pairs: list[dict]) -> str:
    lines = []
    for p in pairs:
        s = p["source"]
        lines.append(
            f"- [×{p['performance']['ratio']:.1f}] {(p['short'].get('title') or '')[:40]}\n"
            f"  훅:{s.get('hook','')} 감정:{s.get('emotion','')} 길이:{int(s.get('segLenSec',0))}초\n"
            f"  자막: {(s.get('transcript') or s.get('transcript_slice') or '')[:160]}\n"
            f"  장면: {(s.get('scene_summary') or '')[:160]}"
        )
    return "\n".join(lines)


def learn(export: dict, min_desc: int = 5) -> dict:
    pairs = export.get("pairs") if isinstance(export, dict) else export
    described = [p for p in pairs if (p.get("source") or {}).get("scene_summary")]
    high = [p for p in described if (p.get("performance") or {}).get("tier") == "high"]
    low = [p for p in described if (p.get("performance") or {}).get("tier") == "low"]

    if len(high) < min_desc or len(low) < min_desc:
        return {
            "channel": export.get("channelName", "") if isinstance(export, dict) else "",
            "ready": False,
            "message": f"표본 부족 (high {len(high)}, low {len(low)} — 각 {min_desc}건 이상 필요)",
            "stats": stat_analyze(pairs),
        }

    stats = stat_analyze(pairs)
    prompt = _PROMPT.format(
        stats=json.dumps(stats.get("reading", {}), ensure_ascii=False),
        high_n=len(high), low_n=len(low),
        high_block=_block(sorted(high, key=lambda p: -p["performance"]["ratio"])),
        low_block=_block(sorted(low, key=lambda p: p["performance"]["ratio"])),
    )

    client = genai.Client(vertexai=True, project=PROJECT, location=LOCATION)
    resp = call_with_retry(lambda: client.models.generate_content(
        model=MODEL, contents=prompt,
        config=types.GenerateContentConfig(
            temperature=0.2, response_mime_type="application/json", response_schema=_SCHEMA,
        ),
    ))
    profile = json.loads(resp.text or "{}")
    profile["ready"] = True
    profile["sample"] = {"high": len(high), "low": len(low), "described": len(described)}
    profile["stats"] = stats.get("reading", {})
    return profile


def main() -> None:
    if len(sys.argv) < 2:
        print("usage: python -m core.learn_profile <export.json> [min_desc]", file=sys.stderr)
        raise SystemExit(2)
    with open(sys.argv[1], encoding="utf-8") as f:
        export = json.load(f)
    min_desc = int(sys.argv[2]) if len(sys.argv) > 2 else 5
    print(json.dumps(learn(export, min_desc), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
