import logging
import sys

from .config import ROOT


def setup_logging() -> None:
    (ROOT / "data").mkdir(exist_ok=True)
    fmt = logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s", "%H:%M:%S")
    root = logging.getLogger()
    root.setLevel(logging.INFO)
    sh = logging.StreamHandler(sys.stdout)
    sh.setFormatter(fmt)
    fh = logging.FileHandler(ROOT / "data" / "bot.log", encoding="utf-8")
    fh.setFormatter(fmt)
    root.handlers = [sh, fh]
    for noisy in ("httpx", "googleapiclient", "urllib3", "faster_whisper"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
