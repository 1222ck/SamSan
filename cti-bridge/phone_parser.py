"""콜사인 파일 파싱 + 발신/수신 분리.

콜사인은 발신·수신을 쌍으로 파일에 기록한다 (예: 발신 010-1234-5678 다음에 수신 055-673-7444).
짝수/홀수 인덱스로 구분하면 콜사인이 포맷을 바꿀 때 쉽게 깨지므로,
주유소 회선(수신번호) 블랙리스트로 명시적으로 걸러낸다.
"""

from __future__ import annotations

import re
from pathlib import Path

PHONE_PATTERN = re.compile(r"0\d{1,2}-\d{3,4}-\d{4}")
NORMALIZE_PATTERN = re.compile(r"[\s-]+")


def normalize_phone(phone: str) -> str:
    return NORMALIZE_PATTERN.sub("", phone)


def read_phones(file_path: Path) -> list[str]:
    """파일을 cp949로 디코드한 뒤 정규식으로 전화번호 추출."""
    with open(file_path, "rb") as f:
        data = f.read()
    text = data.decode("cp949", errors="ignore")
    return PHONE_PATTERN.findall(text)


def split_callers(
    phones: list[str], blacklist: tuple[str, ...]
) -> tuple[list[str], list[str]]:
    """블랙리스트(수신번호) 외 번호만 발신번호로 분류.

    Returns:
        (callers, ignored): callers는 INSERT 대상, ignored는 블랙리스트 매칭으로 무시된 번호.
    """
    blacklist_normalized = {normalize_phone(b) for b in blacklist}
    callers: list[str] = []
    ignored: list[str] = []
    for phone in phones:
        if normalize_phone(phone) in blacklist_normalized:
            ignored.append(phone)
        else:
            callers.append(phone)
    return callers, ignored
