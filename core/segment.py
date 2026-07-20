"""매칭된 롱폼 구간 하나를 LEARN 입력으로 만든다 (자막 + 장면·감정 요약).

왜 이 모듈이 따로 있나: LEARN 프롬프트는 구간별 `transcript_slice`와 `scene_summary`를
요구하는데, 그걸 얻자고 롱폼 전체(20~60분)를 파이프라인에 태우는 건 낭비다. 필요한 건
매칭된 40~60초뿐이라, **그 구간만** 받아서 처리한다. 회차 전체 분석 대비 1/20 수준.

비용 설계: 오디오와 대표 프레임을 **한 번의 Gemini 호출**에 함께 넣는다. STT 한 번 +
비전 한 번으로 나누면 호출이 2배가 되는데, 어차피 같은 구간을 보는 것이라 나눌 이유가 없다.

출력: {"transcript": str, "scene_summary": str, "emotion": str, "hook": str}
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

from google import genai
from google.genai import types

from .retry import call_with_retry

PROJECT = os.environ.get("GOOGLE_CLOUD_PROJECT") or "step-d"
# 프레임·음성은 개인정보(생체 포함)라 서울 리전 고정 — vision.py와 같은 이유.
LOCATION = os.environ.get("VERTEX_LOCATION") or "asia-northeast3"
MODEL = os.environ.get("SEGMENT_MODEL") or "gemini-2.5-flash"
N_FRAMES = 3

_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "transcript": {"type": "STRING", "description": "구간에서 들리는 대사를 순서대로. 없으면 빈 문자열."},
        "scene_summary": {"type": "STRING", "description": "무슨 상황인지 2~3문장. 인물의 행동·표정·화면 텍스트 포함."},
        "emotion": {"type": "STRING", "description": "구간을 지배하는 감정/분위기 한 단어 (예: 폭소, 긴장, 감동, 당황, 사이다)."},
        "hook": {"type": "STRING", "description": "이 구간이 시선을 잡는 장치 하나 (예: 반전, 돌직구, 갈등고조, 질문, 정보, 웃음, 공감)."},
    },
    "required": ["transcript", "scene_summary", "emotion", "hook"],
}

_PROMPT = """이 영상 구간은 롱폼에서 잘려 숏폼으로 발행된 부분이다.
왜 이 순간이 숏폼 소재로 뽑혔는지 판단할 수 있도록 정리하라.

- transcript: 들리는 대사를 순서대로. 화자 구분이 명확하면 "이름: 대사" 형식.
- scene_summary: 무슨 상황인지 2~3문장. 인물의 행동·표정 변화와 화면에 박힌 자막을 포함하라.
- emotion: 이 구간을 지배하는 감정/분위기 한 단어.
- hook: 시선을 잡는 장치 하나.

없는 것을 지어내지 마라. 대사가 없으면 transcript는 빈 문자열로 두고 화면만으로 설명하라."""


def _run(cmd: list[str]) -> None:
    subprocess.run(cmd, check=True, capture_output=True)


def cut_segment(src_url_or_path: str, start: float, end: float, out_path: str) -> None:
    """롱폼에서 구간만 잘라 낸다. URL이면 yt-dlp가 그 구간만 받는다(전체 다운로드 회피)."""
    dur = max(0.5, end - start)
    if src_url_or_path.startswith("http"):
        _run([
            "yt-dlp", "-q", "--no-playlist",
            "--download-sections", f"*{start}-{end}",
            # 구간 다운로드는 keyframe 단위라 정확히 맞추려면 재인코딩이 필요하다.
            "--force-keyframes-at-cuts",
            "-f", "bv*[height<=720]+ba/b[height<=720]/b",
            "-o", out_path, src_url_or_path,
        ])
    else:
        _run(["ffmpeg", "-v", "error", "-y", "-ss", str(start), "-t", str(dur),
              "-i", src_url_or_path, "-c", "copy", out_path])


def _frames(video: str, out_dir: Path, n: int = N_FRAMES) -> list[Path]:
    """구간 안에서 균등 간격 프레임 n장 (앞뒤 10%는 전환 프레임이라 피한다)."""
    out = []
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", video],
        capture_output=True, text=True,
    )
    try:
        dur = float((probe.stdout or "0").strip())
    except ValueError:
        dur = 0.0
    if dur <= 0:
        return out
    for i in range(n):
        t = dur * (0.15 + 0.7 * (i / max(1, n - 1)))
        p = out_dir / f"f{i}.jpg"
        try:
            _run(["ffmpeg", "-v", "error", "-y", "-ss", f"{t:.2f}", "-i", video,
                  "-frames:v", "1", "-vf", "scale=640:-2", str(p)])
            if p.exists():
                out.append(p)
        except subprocess.CalledProcessError:
            continue
    return out


def _audio(video: str, out_path: str) -> str | None:
    """16kHz 모노 WAV. 무음/오디오 없음이면 None."""
    try:
        _run(["ffmpeg", "-v", "error", "-y", "-i", video, "-vn",
              "-ac", "1", "-ar", "16000", out_path])
        return out_path if os.path.getsize(out_path) > 1024 else None
    except (subprocess.CalledProcessError, OSError):
        return None


def describe(video_path: str) -> dict:
    """구간 영상 → {transcript, scene_summary, emotion, hook} (Gemini 1회)."""
    client = genai.Client(vertexai=True, project=PROJECT, location=LOCATION)
    with tempfile.TemporaryDirectory() as td:
        tdp = Path(td)
        parts: list[types.Part] = []
        wav = _audio(video_path, str(tdp / "a.wav"))
        if wav:
            parts.append(types.Part.from_bytes(data=Path(wav).read_bytes(), mime_type="audio/wav"))
        for f in _frames(video_path, tdp):
            parts.append(types.Part.from_bytes(data=f.read_bytes(), mime_type="image/jpeg"))
        if not parts:
            return {"transcript": "", "scene_summary": "", "emotion": "", "hook": "",
                    "error": "오디오·프레임을 추출하지 못했습니다"}
        parts.append(types.Part.from_text(text=_PROMPT))

        resp = call_with_retry(lambda: client.models.generate_content(
            model=MODEL,
            contents=parts,
            config=types.GenerateContentConfig(
                temperature=0,
                response_mime_type="application/json",
                response_schema=_SCHEMA,
            ),
        ))
    return json.loads(resp.text or "{}")


def describe_url(url: str, start: float, end: float) -> dict:
    """유튜브 URL의 [start,end] 구간만 받아 설명한다 (워커 경로)."""
    with tempfile.TemporaryDirectory() as td:
        seg = str(Path(td) / "seg.mp4")
        cut_segment(url, start, end, seg)
        if not os.path.exists(seg):
            return {"transcript": "", "scene_summary": "", "emotion": "", "hook": "",
                    "error": "구간을 받지 못했습니다"}
        return describe(seg)


if __name__ == "__main__":
    if len(sys.argv) == 2:
        print(json.dumps(describe(sys.argv[1]), ensure_ascii=False))
    elif len(sys.argv) == 4:
        print(json.dumps(describe_url(sys.argv[1], float(sys.argv[2]), float(sys.argv[3])), ensure_ascii=False))
    else:
        print("usage: python -m core.segment <video> | <url> <start> <end>", file=sys.stderr)
        raise SystemExit(2)
