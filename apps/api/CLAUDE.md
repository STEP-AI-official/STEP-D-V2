# apps/api — 백엔드 Claude 컨텍스트

FastAPI 백엔드. Python 3.12, SQLAlchemy ORM, Uvicorn.

## 핵심 파일 맵

| 파일 | 역할 |
|------|------|
| `app/api/routes.py` | **모든** HTTP 엔드포인트. 분리 금지. |
| `app/api/youtube.py` | YouTube OAuth·업로드·분석만 여기 |
| `app/core/config.py` | 설정값 전체. 환경변수로 오버라이드 가능. |
| `app/models.py` | Job, Clip, YouTubePublish, YouTubeChannel, User |
| `app/schemas.py` | Pydantic 응답 모델. ClipResponse에 job_id 포함. |
| `app/services/pipeline.py` | AI 파이프라인 진입점. `process_job()` 함수. |
| `app/services/candidates.py` | 훅 후보 탐지 + 문장 경계 정제 |
| `app/services/ffmpeg.py` | ffmpeg 작업 전부 (컷·렌더·자막·썸네일·무음탐지) |
| `app/services/gemini.py` | `call_vision_prompt()`, `call_text_prompt()` |
| `app/services/scoring.py` | `final_score()` = Gemini×0.70 + local×0.30 |
| `app/services/korean_shorts.py` | 한국어 훅 키워드 HOOK_CATEGORIES + 점수 함수 |
| `app/services/subtitles.py` | `build_ass_subtitles()` — ASS 자막 파일 생성 |
| `app/services/ppl.py` | PPL 브랜드 탐지 + 음성 언급 탐지 |
| `app/prompts/title_options.py` | 제목 생성 프롬프트 (5 바이럴 패턴) |
| `app/prompts/clip_evaluation.py` | Gemini 클립 평가 프롬프트 |

## 자주 쓰는 패턴

### 새 엔드포인트 추가
```python
# routes.py 맨 아래
@router.get("/jobs/{job_id}/my-feature")
def my_endpoint(job_id: str, db: Session = Depends(get_db)):
    job = db.get(Job, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    settings = get_settings()
    ...
    return {...}
```

### evaluation_json 접근
```python
evaluation = dict(clip.evaluation_json or {})
creative_settings = evaluation.get("creative_settings") or {}
editor_state = creative_settings.get("editor_state") or {}
hl_color = editor_state.get("hl")          # 자막 하이라이트 색상
captions_on = editor_state.get("captionsOn", True)
```

### Gemini 호출
```python
from app.services.gemini import call_vision_prompt, call_text_prompt, GeminiError

# 비전 (프레임 이미지)
result = call_vision_prompt(image_paths, prompt_text, schema, settings)

# 텍스트 전용
result_text = call_text_prompt(prompt, settings)
```

### 설정값 사용
```python
from app.core.config import get_settings
settings = get_settings()
settings.gemini_model           # "gemini-3.5-flash"
settings.storage_dir            # Path("./storage")
settings.final_clip_count       # 8
```

## 파이프라인 진행률 (progress %)

| 구간 | 작업 |
|------|------|
| 0–10 | 다운로드/업로드 |
| 10–30 | STT (Whisper) |
| 30–52 | 후보 탐지 |
| 52–80 | Gemini 평가 (후보당 누적) |
| 80–95 | 클립 렌더링 |
| 95–100 | 썸네일·DB 저장 |

## 중요 제약

- `transcript.json` 경로: `storage/jobs/{job_id}/transcripts/transcript.json`
  - 형식: `{segments: [{start, end, text}], words: [{start, end, word}]}`
- retrim/apply_creative 시 `editor_state.captionsOn`과 `editor_state.hl` 반드시 전달
- 한국어 문장 종결 판별: `candidates._is_sentence_end()` 사용
- CSV 한국어: `utf-8-sig` 인코딩 (Excel BOM 필요)
- 이미지 오버레이: `_prepare_burn_overlays()`로 path 검증 후 사용
