"""Supabase incoming_calls INSERT wrapper."""

from __future__ import annotations

from supabase import Client, create_client

TABLE = "incoming_calls"


class SupabaseInserter:
    def __init__(self, url: str, service_role_key: str) -> None:
        self._client: Client = create_client(url, service_role_key)

    def insert_call(self, phone: str) -> None:
        """발신번호 1건을 INSERT. received_at은 DB DEFAULT(now())로 채워짐."""
        self._client.table(TABLE).insert({"phone": phone}).execute()
