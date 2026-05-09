"""콘솔 + 일자별 회전 파일 로깅."""

from __future__ import annotations

import logging
import sys
from logging.handlers import TimedRotatingFileHandler
from pathlib import Path

LOG_DIR = Path(__file__).parent / "logs"
LOG_FILE = LOG_DIR / "cti-bridge.log"
LOG_FORMAT = "%(asctime)s [%(levelname)s] %(message)s"
BACKUP_DAYS = 7


def setup_logger(level: str = "INFO") -> logging.Logger:
    LOG_DIR.mkdir(exist_ok=True)

    formatter = logging.Formatter(LOG_FORMAT)

    file_handler = TimedRotatingFileHandler(
        LOG_FILE,
        when="midnight",
        backupCount=BACKUP_DAYS,
        encoding="utf-8",
    )
    file_handler.setFormatter(formatter)

    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(formatter)

    logger = logging.getLogger("cti_bridge")
    logger.setLevel(getattr(logging, level.upper(), logging.INFO))
    logger.handlers.clear()
    logger.addHandler(file_handler)
    logger.addHandler(console_handler)
    logger.propagate = False

    return logger
