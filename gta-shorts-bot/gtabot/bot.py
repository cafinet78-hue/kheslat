"""Main loop: find live streams, record them, analyse, edit, upload. Runs until Ctrl+C."""
from __future__ import annotations

import logging
import re
import threading
import time
from datetime import datetime

from .ai import AI
from .config import Config
from .db import DB
from .discovery import find_live_streams
from .pipeline import tick_processing, tick_upload
from .recorder import Recorder

log = logging.getLogger("bot")


class Bot:
    def __init__(self, cfg: Config):
        self.cfg = cfg
        self.db = DB(cfg.data / "bot.db")
        self.ai = AI(cfg)
        self.recorders: dict[str, tuple[Recorder, int]] = {}
        self._stop = threading.Event()
        # anything left "recording" from a previous run is finished now
        self.db.x("UPDATE recordings SET status='ended' WHERE status='recording'")

    # ------------------------------------------------------------------
    def start(self) -> None:
        threads = [threading.Thread(target=self._loop, args=(self._discover, self.cfg.check_interval_minutes * 60),
                                    daemon=True, name="discover"),
                   threading.Thread(target=self._loop, args=(self._process, 30), daemon=True, name="process"),
                   threading.Thread(target=self._loop, args=(self._upload, 60), daemon=True, name="upload")]
        for t in threads:
            t.start()
        log.info("🚀 Bot is running.")

    def stop(self) -> None:
        log.info("Stopping... (recordings so far will be processed on next start)")
        self._stop.set()
        for rec, rid in self.recorders.values():
            rec.stop()
            self.db.x("UPDATE recordings SET status='ended' WHERE id=?", (rid,))
        self.recorders.clear()

    @property
    def running(self) -> bool:
        return not self._stop.is_set()

    def run(self) -> None:
        self.start()
        log.info("Press Ctrl+C to stop.")
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            self.stop()

    def _loop(self, fn, every: float) -> None:
        while not self._stop.is_set():
            try:
                fn()
            except Exception:  # noqa: BLE001
                log.exception("Error in %s", fn.__name__)
            self._stop.wait(every)

    # ------------------------------------------------------------------
    def _discover(self) -> None:
        # forget finished recorders
        for key, (rec, rid) in list(self.recorders.items()):
            if rec.finished.is_set():
                self.db.x("UPDATE recordings SET status='ended' WHERE id=?", (rid,))
                del self.recorders[key]
        free = self.cfg.max_parallel_recordings - len(self.recorders)
        if free <= 0:
            return
        live = find_live_streams(self.cfg)
        if self._stop.is_set():  # stopped while we were searching
            return
        log.info("Live GTA VI streams found: %s",
                 ", ".join(f"{s.channel}({s.platform})" for s in live) or "none")
        for s in live:
            if free <= 0:
                break
            if s.key in self.recorders:
                continue
            safe = re.sub(r"[^A-Za-z0-9_-]+", "_", s.channel)[:40]
            folder = self.cfg.data / "recordings" / f"{s.platform}_{safe}_{datetime.now():%Y%m%d_%H%M}"
            rec = Recorder(s.url, s.platform, s.channel, folder, self.cfg.stream_quality)
            rid = self.db.add_recording(s.platform, s.channel, s.url, s.title, folder)
            rec.start()
            self.recorders[s.key] = (rec, rid)
            free -= 1

    def _process(self) -> None:
        active = {rid for rec, rid in self.recorders.values() if not rec.finished.is_set()}
        for rec, rid in self.recorders.values():
            if rec.finished.is_set():
                self.db.x("UPDATE recordings SET status='ended' WHERE id=? AND status='recording'", (rid,))
        tick_processing(self.cfg, self.db, self.ai, active)

    def _upload(self) -> None:
        tick_upload(self.cfg, self.db)
