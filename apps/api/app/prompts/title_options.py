"""Prompt + response schema for generating Korean Shorts title options."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from app.models import Clip


TITLE_OPTION_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "options": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "overlay_text": {"type": "string"},
                    "style": {"type": "string"},
                    "reason": {"type": "string"},
                },
                "required": ["title", "overlay_text", "style", "reason"],
            },
        }
    },
    "required": ["options"],
}


def build_title_options_prompt(clip: "Clip") -> str:
    return f"""Return JSON only. Generate exactly 5 Korean YouTube Shorts title options for this clip.
Each option: title, overlay_text, style, reason.

━━ OUTPUT RULES ━━
title: 16–40자. 첫 두 단어가 스크롤을 멈추게 해야 함. 해시태그·에피소드 번호 금지.
overlay_text: 5–14자, 썸네일 굵은 자막용. 제목의 핵심 한 줄 요약이 아니라 보완적 문구.

━━ 제목 쓰는 법 ━━
▸ 대화·발화가 있으면 원문 그대로 인용해라.
  - 좋음: "야 너 나 좋아하냐고" 이 말 나왔을 때 분위기
  - 나쁨: 감정적으로 중요한 대화가 나오는 장면

▸ 행동이나 상황은 동사형으로, 구체적으로.
  - 좋음: 5년 후배한테 선배 소리 들은 날
  - 나쁨: 반전 있는 상황

▸ 숫자·시간·횟수가 있으면 무조건 써라.
  - 좋음: 3초 만에 분위기 박살낸 한마디
  - 나쁨: 분위기가 바뀐 순간

▸ 첫 2단어는 명사형 or 직접화법 따옴표로 시작.
  - 좋음: "어 잠깐만" 이게 왜 이렇게 웃기냐
  - 나쁨: 이 장면 진짜 뭐죠?

▸ 이모지: 감정 강화할 때 1–2개만. 없어도 됨.

━━ 절대 쓰지 마라 ━━
"실화냐", "레전드", "충격", "소름", "대박", "미쳤다" — 내용이 진짜 그 수준일 때만 허용.
"~하는 순간", "~한 장면", "~한 이유" 등 템플릿 어미 남발 금지.
"이거 보고 덤덤한 사람", "이거 모르면 손해" 류 과장 클리셰.

━━ 5가지 스타일 (각 1개씩) ━━

1. direct-quote
   트랜스크립트에서 가장 강렬한 실제 대사를 그대로 따와 제목 앞부분에 배치.
   예시: "야 그게 무슨 말이야" 이 말에 다들 멈춘 이유
   예시: "근데 그게 맞는 말이잖아" 아무도 반박 못한 순간

2. reaction-bait
   보는 사람이 본능적으로 반응(공감·분노·웃음)하게 만드는 구도.
   예시: 이거 공감하면 당신도 지쳤다는 증거입니다
   예시: 나였으면 그냥 일어나서 나갔다

3. reversal
   "알고 보니" "근데 사실" "결말이" 구도 — 끝을 보고 싶게.
   예시: 이기는 줄 알았는데 본인이 제일 당한 상황
   예시: 욱하는 줄 알았는데 이게 더 무서운 거였음

4. number-context
   숫자·시간·기간을 박아서 상황을 구체화.
   예시: 10년 지기한테 이 말 들은 날 관계 끝났음
   예시: 3번 참다가 4번째에 결국 터진 사람

5. curiosity-gap
   결정적인 정보를 하나 빼서 끝까지 보게 만드는 구도.
   예시: 이 말 한마디로 그 사람 완전히 변했다는 게 진짜임
   예시: 근데 문제는 이게 틀린 말이 아니라는 거야

━━ 클립 정보 ━━
현재 제목: {clip.title}
선정 이유: {clip.reason}
트랜스크립트:
{clip.transcript[:3000]}
"""
