"""환경변수 로드 및 검증."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

ENV_PATH = Path(__file__).parent / ".env"


@dataclass(frozen=True)
class Config:
    supabase_url: str
    supabase_service_role_key: str
    callscreen_file_path: str
    blacklist_phones: tuple[str, ...]
    poll_interval_seconds: float
    log_level: str

    @classmethod
    def load(cls) -> "Config":
        load_dotenv(ENV_PATH)

        return cls(
            supabase_url=_required("SUPABASE_URL"),
            supabase_service_role_key=_required("SUPABASE_SERVICE_ROLE_KEY"),
            callscreen_file_path=_required("CALLSCREEN_FILE_PATH"),
            blacklist_phones=tuple(
                p.strip()
                for p in os.getenv("BLACKLIST_PHONES", "").split(",")
                if p.strip()
            ),
            poll_interval_seconds=float(os.getenv("POLL_INTERVAL_SECONDS", "1")),
            log_level=os.getenv("LOG_LEVEL", "INFO"),
        )


def _required(key: str) -> str:
    value = os.getenv(key)
    if not value:
        raise RuntimeError(f"환경변수 누락: {key} (.env 파일 확인)")
    return value
