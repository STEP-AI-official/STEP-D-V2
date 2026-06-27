from typing import Any

from app.services.candidates import Candidate


def clamp_score(value: object, default: int = 0) -> int:
    try:
        score = int(round(float(value)))
    except (TypeError, ValueError):
        score = default
    return max(0, min(100, score))


def normalize_score(value: object, default: int = 0) -> int:
    try:
        score = float(value)
        from_default = False
    except (TypeError, ValueError):
        score = float(default)
        from_default = True

    if not from_default and 0 < score <= 10:
        score *= 10
    return clamp_score(score, default=default)


def final_score(candidate: Candidate, evaluation: dict[str, Any]) -> int:
    gemini_score = normalize_score(evaluation.get("score"), default=int(candidate.local_score))
    # Gemini(시각적 품질) 70% + korean_shorts 특화 점수 30%
    weighted = gemini_score * 0.70 + candidate.local_score * 0.30
    return clamp_score(weighted)
