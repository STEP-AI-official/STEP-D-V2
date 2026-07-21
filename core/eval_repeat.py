"""반복·다중 홀드아웃 채점 — 엔진 실행 변동을 상쇄하고 프로파일 효과를 분리한다.

2026-07-21 발견: recommend는 temperature 0인데도 실행마다 결과가 다르다(같은 무프로파일
조건 5회가 Hit@5 0.00~0.67로 요동). 단발 A/B로는 프로파일 효과와 노이즈를 구분할 수 없다.
이 도구는 각 조건을 N회 반복해 **평균 Hit@N과 표준편차**를 내고, 여러 홀드아웃을 합산한다.

핵심 판정 기준: 프로파일 on의 평균이 off의 평균을 **표준편차를 넘어서** 상회해야 "효과 있음".
차이가 노이즈(σ) 안이면 미확정으로 정직하게 보고한다.

사용 (워커에서):
  python -m core.eval_repeat --runs 5 \
    --holdout LcMolKaPcrw=/tmp/ho_scenes.json \
    --holdout JppILjNTCok=/tmp/ho5_scenes.json \
    --truth /tmp/truth_all.json \
    --profile /tmp/ab_learned.json   # (선택) 있으면 on/off 둘 다, 없으면 off만
"""

from __future__ import annotations

import argparse
import json
import statistics
import sys

from .recommend import recommend
from .evaluate import _spans_from_shorts, _truth_from_export, evaluate


def _run_condition(scenes_by_ho: dict, truth_by_ho: dict, profile, runs: int, genre: str) -> dict:
    """조건(프로파일 유무) 하나를 runs회 반복. 각 회차는 모든 홀드아웃을 micro-average한다."""
    per_run_hits = []
    per_run_found = []
    for _ in range(runs):
        tot_truth = tot_found = tot_hit5 = 0
        for ho, scenes in scenes_by_ho.items():
            truth = truth_by_ho.get(ho, [])
            if not truth:
                continue
            sh = recommend(scenes, n=5, genre=genre, profile=profile)["shorts"]
            r = evaluate(_spans_from_shorts({"shorts": sh}), truth)
            tot_truth += r["truth_count"]
            tot_found += r["found"]
            tot_hit5 += round(r["hit@5"] * r["truth_count"])
        per_run_hits.append(tot_hit5 / max(1, tot_truth))
        per_run_found.append(tot_found)
    return {
        "runs": runs,
        "hit5_mean": round(statistics.mean(per_run_hits), 3),
        "hit5_stdev": round(statistics.pstdev(per_run_hits), 3) if len(per_run_hits) > 1 else 0.0,
        "hit5_min": round(min(per_run_hits), 3),
        "hit5_max": round(max(per_run_hits), 3),
        "per_run": [round(x, 3) for x in per_run_hits],
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--runs", type=int, default=5)
    ap.add_argument("--holdout", action="append", required=True, help="longVideoId=scenes.json ...")
    ap.add_argument("--truth", required=True)
    ap.add_argument("--profile", default=None, help="learn 결과 JSON — 있으면 on/off 둘 다 비교")
    ap.add_argument("--genre", default="variety")
    a = ap.parse_args()

    truth_export = json.load(open(a.truth, encoding="utf-8"))
    scenes_by_ho, truth_by_ho = {}, {}
    for spec in a.holdout:
        ho, path = spec.split("=", 1)
        sc = json.load(open(path, encoding="utf-8"))
        if isinstance(sc, dict):
            sc = sc.get("scenes", sc)
        scenes_by_ho[ho] = sc
        truth_by_ho[ho] = _truth_from_export(truth_export, ho)

    truth_total = sum(len(t) for t in truth_by_ho.values())
    result = {"holdouts": list(scenes_by_ho), "truth_total": truth_total, "runs": a.runs}

    off = _run_condition(scenes_by_ho, truth_by_ho, None, a.runs, a.genre)
    result["profile_off"] = off

    if a.profile:
        learned = json.load(open(a.profile, encoding="utf-8"))
        prof = learned.get("recommend_profile")
        on = _run_condition(scenes_by_ho, truth_by_ho, prof, a.runs, a.genre)
        result["profile_on"] = on
        # 판정: on 평균이 off 평균 + off σ 를 넘으면 "효과 있음", 아니면 "노이즈 내(미확정)"
        diff = on["hit5_mean"] - off["hit5_mean"]
        noise = max(off["hit5_stdev"], on["hit5_stdev"], 0.01)
        result["verdict"] = (
            "효과 있음 (차이 > 변동)" if diff > noise
            else "효과 없음 (off가 더 높음)" if diff < -noise
            else "미확정 (차이가 변동 안에 묻힘)"
        )
        result["diff"] = round(diff, 3)
        result["noise_sigma"] = round(noise, 3)

    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
