"""Supabase REST API로 incoming_calls INSERT.

supabase Python SDK 대신 requests로 직접 호출한다 — 의존성을 줄이고
Python 3.14 환경에서 pyiceberg(C 확장) 빌드 실패를 회피한다.
INSERT 한 건만 하면 되므로 SDK 전체가 필요하지 않다.
"""

from __future__ import annotations

import requests

INSERT_PATH = "/rest/v1/incoming_calls"
TIMEOUT_SECONDS = 10


class SupabaseInserter:
    def __init__(self, url: str, service_role_key: str) -> None:
        self._url = url.rstrip("/") + INSERT_PATH
        self._headers = {
            "apikey": service_role_key,
            "Authorization": f"Bearer {service_role_key}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        }

    def insert_call(self, phone: str) -> None:
        """발신번호 1건을 INSERT. received_at은 DB DEFAULT(now())로 채워짐."""
        response = requests.post(
            self._url,
            headers=self._headers,
            json={"phone": phone},
            timeout=TIMEOUT_SECONDS,
        )
        response.raise_for_status()
