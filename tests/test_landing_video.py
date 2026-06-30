import sys
from pathlib import Path

import pytest
from fastapi import HTTPException


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "apps" / "api"))

from app.api.landing import _parse_range_header  # noqa: E402


def test_parse_range_header_full_response():
    assert _parse_range_header(None, 1000) == (0, 999, False)


def test_parse_range_header_open_ended():
    assert _parse_range_header("bytes=100-", 1000) == (100, 999, True)


def test_parse_range_header_suffix():
    assert _parse_range_header("bytes=-250", 1000) == (750, 999, True)


def test_parse_range_header_clamps_end():
    assert _parse_range_header("bytes=900-2000", 1000) == (900, 999, True)


def test_parse_range_header_rejects_invalid_range():
    with pytest.raises(HTTPException) as exc:
        _parse_range_header("bytes=1000-1001", 1000)
    assert exc.value.status_code == 416
