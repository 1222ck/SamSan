"""CTI 브릿지 진입점.

콜사인이 갱신하는 전화수신목록 파일을 1초 간격으로 폴링하며
신규 발신번호를 Supabase incoming_calls에 INSERT한다.
"""

from __future__ import annotations

import logging
import sys
import time
from pathlib import Path

from config import Config
from logger_setup import setup_logger
from phone_parser import read_phones, split_callers
from state import load_last_count, save_last_count
from supabase_client import SupabaseInserter

FILE_LOCK_RETRY = 3
FILE_LOCK_BACKOFF_S = 0.5


def safe_read_phones(
    path: Path, log: logging.Logger
) -> list[str] | None:
    """파일 lock(PermissionError) 발생 시 500ms × 3회 재시도. 실패하면 None."""
    last_err: Exception | None = None
    for attempt in range(1, FILE_LOCK_RETRY + 1):
        try:
            return read_phones(path)
        except FileNotFoundError:
            log.error("파일 없음: %s", path)
            return None
        except PermissionError as e:
            last_err = e
            log.warning("파일 lock — 재시도 %d/%d", attempt, FILE_LOCK_RETRY)
            time.sleep(FILE_LOCK_BACKOFF_S)
        except OSError as e:
            log.error("파일 읽기 OSError: %s", e)
            return None
    log.error("파일 lock 재시도 한도 초과 — 이번 사이클 스킵 (%s)", last_err)
    return None


def initialize_baseline(
    file_path: Path, log: logging.Logger
) -> int:
    """첫 실행 — 현재 파일 라인 수를 기준점으로 잡고 이전 데이터는 무시."""
    initial = safe_read_phones(file_path, log)
    baseline = len(initial) if initial is not None else 0
    save_last_count(baseline)
    log.info("첫 실행 — 기준점 설정: 기존 %d건 무시", baseline)
    return baseline


def process_new_phones(
    new_phones: list[str],
    blacklist: tuple[str, ...],
    inserter: SupabaseInserter,
    log: logging.Logger,
) -> None:
    callers, ignored = split_callers(new_phones, blacklist)

    for phone in ignored:
        log.warning("블랙리스트 번호 무시: %s", phone)

    for phone in callers:
        try:
            inserter.insert_call(phone)
            log.info("INSERT 성공: %s", phone)
        except Exception as e:
            log.error("Supabase INSERT 실패 (%s): %s", phone, e)


def run_loop(cfg: Config, log: logging.Logger) -> int:
    file_path = Path(cfg.callscreen_file_path)
    inserter = SupabaseInserter(cfg.supabase_url, cfg.supabase_service_role_key)

    persisted = load_last_count()
    if persisted is None:
        last_count = initialize_baseline(file_path, log)
    else:
        last_count = persisted
        log.info("이전 상태 복구 — last_count=%d", last_count)

    log.info("대기중...")

    while True:
        phones = safe_read_phones(file_path, log)
        if phones is None:
            time.sleep(cfg.poll_interval_seconds)
            continue

        current_count = len(phones)
        if current_count > last_count:
            # 콜사인은 새 통화를 파일 상단(prepend)에 기록한다.
            # 따라서 신규 N건은 phones[0:N]. 시간순(오래된→최신)으로 INSERT 되도록 reverse.
            diff = current_count - last_count
            new_phones = list(reversed(phones[:diff]))
            process_new_phones(new_phones, cfg.blacklist_phones, inserter, log)
            last_count = current_count
            save_last_count(last_count)
        elif current_count < last_count:
            # 콜사인이 파일을 초기화/회전했을 가능성 — 새 기준점으로 재설정
            log.warning(
                "파일 라인 수 감소: %d → %d, 기준점 재설정",
                last_count,
                current_count,
            )
            last_count = current_count
            save_last_count(last_count)

        time.sleep(cfg.poll_interval_seconds)


def main() -> int:
    cfg = Config.load()
    log = setup_logger(cfg.log_level)

    log.info("CTI 브릿지 시작")
    log.info("감시 파일: %s", cfg.callscreen_file_path)
    log.info("폴링 간격: %.1fs", cfg.poll_interval_seconds)
    log.info("블랙리스트(%d개): %s", len(cfg.blacklist_phones), cfg.blacklist_phones)

    try:
        return run_loop(cfg, log)
    except KeyboardInterrupt:
        log.info("Ctrl+C 수신 — 정상 종료")
        return 0
    except Exception as e:
        log.exception("예상치 못한 오류로 종료: %s", e)
        return 1


if __name__ == "__main__":
    sys.exit(main())
