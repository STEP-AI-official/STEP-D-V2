from __future__ import annotations

from collections.abc import Iterator

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response, StreamingResponse

from app.core.config import get_settings


router = APIRouter(prefix="/api/landing", tags=["landing"])

_CHUNK_SIZE = 4 * 1024 * 1024
_VIDEO_CONTENT_TYPE = "video/mp4"
_CACHE_CONTROL = "public, max-age=3600"
_INLINE_FILENAME = "aena-intro.mp4"


def _parse_range_header(range_header: str | None, size: int) -> tuple[int, int, bool]:
    if size <= 0:
        raise HTTPException(status_code=416, detail="Video object is empty.", headers={"Content-Range": "bytes */0"})
    if not range_header:
        return 0, size - 1, False

    unit, _, spec = range_header.partition("=")
    if unit.strip().lower() != "bytes" or "," in spec:
        raise HTTPException(status_code=416, detail="Unsupported range.", headers={"Content-Range": f"bytes */{size}"})

    start_text, sep, end_text = spec.strip().partition("-")
    if sep != "-":
        raise HTTPException(status_code=416, detail="Invalid range.", headers={"Content-Range": f"bytes */{size}"})

    try:
        if start_text == "":
            suffix_length = int(end_text)
            if suffix_length <= 0:
                raise ValueError
            start = max(size - suffix_length, 0)
            end = size - 1
        else:
            start = int(start_text)
            end = int(end_text) if end_text else size - 1
    except ValueError as exc:
        raise HTTPException(status_code=416, detail="Invalid range.", headers={"Content-Range": f"bytes */{size}"}) from exc

    if start < 0 or end < start or start >= size:
        raise HTTPException(status_code=416, detail="Range not satisfiable.", headers={"Content-Range": f"bytes */{size}"})

    return start, min(end, size - 1), True


def _landing_blob():
    from google.cloud import storage
    from google.api_core import exceptions as gcloud_exceptions

    settings = get_settings()
    if not settings.landing_video_gcs_bucket or not settings.landing_video_gcs_object:
        raise HTTPException(status_code=500, detail="Landing video GCS location is not configured.")

    blob = storage.Client().bucket(settings.landing_video_gcs_bucket).blob(settings.landing_video_gcs_object)
    try:
        blob.reload(timeout=30)
    except gcloud_exceptions.NotFound as exc:
        raise HTTPException(status_code=404, detail="Landing video not found.") from exc
    except gcloud_exceptions.Forbidden as exc:
        raise HTTPException(status_code=502, detail="API service account cannot read the landing video.") from exc
    return blob


def _iter_blob_range(blob, start: int, end: int) -> Iterator[bytes]:
    offset = start
    while offset <= end:
        chunk_end = min(offset + _CHUNK_SIZE - 1, end)
        yield blob.download_as_bytes(start=offset, end=chunk_end, timeout=60)
        offset = chunk_end + 1


@router.api_route("/video", methods=["GET", "HEAD"])
def landing_video(request: Request):
    blob = _landing_blob()
    size = int(blob.size or 0)
    start, end, partial = _parse_range_header(request.headers.get("range"), size)
    content_length = end - start + 1
    headers = {
        "Accept-Ranges": "bytes",
        "Cache-Control": _CACHE_CONTROL,
        "Content-Disposition": f'inline; filename="{_INLINE_FILENAME}"',
        "Content-Length": str(content_length),
        "X-Content-Type-Options": "nosniff",
    }
    if partial:
        headers["Content-Range"] = f"bytes {start}-{end}/{size}"

    status_code = 206 if partial else 200
    if request.method == "HEAD":
        return Response(status_code=status_code, headers=headers, media_type=_VIDEO_CONTENT_TYPE)

    return StreamingResponse(
        _iter_blob_range(blob, start, end),
        status_code=status_code,
        headers=headers,
        media_type=_VIDEO_CONTENT_TYPE,
    )
