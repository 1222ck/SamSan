"""last_count를 state.json에 영속화 — 재시작 시 중복 INSERT 방지."""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

STATE_FILE = Path(__file__).parent / "state.json"
KST = timezone(timedelta(hours=9))


def load_last_count() -> int | None:
    """state.json이 없거나 손상됐으면 None 반환 (호출 측에서 첫 실행으로 처리)."""
    if not STATE_FILE.exists():
        return None
    try:
        data = json.loads(STATE_FILE.read_text(encoding="utf-8"))
        return int(data["last_count"])
    except (json.JSONDecodeError, KeyError, ValueError, OSError):
        return None


def save_last_count(last_count: int) -> None:
    payload = {
        "last_count": last_count,
        "updated_at": datetime.now(KST).isoformat(),
    }
    STATE_FILE.write_text(
        json.dumps(payload, ensure_ascii=False),
        encoding="utf-8",
    )
