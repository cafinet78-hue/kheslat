"""Tiny SQLite store for recordings, clips and uploads."""
from __future__ import annotations

import json
import sqlite3
import threading
import time
from pathlib import Path

_SCHEMA = """
CREATE TABLE IF NOT EXISTS recordings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    platform TEXT, channel TEXT, url TEXT, title TEXT,
    folder TEXT, started_at REAL, ended_at REAL,
    status TEXT DEFAULT 'recording',       -- recording | ended | done
    processed_until REAL DEFAULT 0,        -- seconds of stream already analysed
    long_status TEXT DEFAULT ''            -- '' | rendered | uploaded | skipped
);
CREATE TABLE IF NOT EXISTS clips (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recording_id INTEGER, start REAL, end REAL, score REAL,
    meta TEXT, short_path TEXT, wide_path TEXT, thumb_path TEXT,
    status TEXT DEFAULT 'rendered',        -- rendered | uploaded | failed | skipped
    youtube_id TEXT, created_at REAL, uploaded_at REAL
);
CREATE TABLE IF NOT EXISTS long_videos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recording_id INTEGER, path TEXT, thumb_path TEXT, meta TEXT,
    status TEXT DEFAULT 'rendered', youtube_id TEXT, created_at REAL, uploaded_at REAL
);
"""


class DB:
    def __init__(self, path: Path):
        self._lock = threading.RLock()
        self.conn = sqlite3.connect(str(path), check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self.conn.executescript(_SCHEMA)
        self.conn.commit()

    def q(self, sql: str, args: tuple = ()) -> list[sqlite3.Row]:
        with self._lock:
            return self.conn.execute(sql, args).fetchall()

    def x(self, sql: str, args: tuple = ()) -> int:
        with self._lock:
            cur = self.conn.execute(sql, args)
            self.conn.commit()
            return cur.lastrowid

    # --- helpers -------------------------------------------------------
    def add_recording(self, platform, channel, url, title, folder) -> int:
        return self.x("INSERT INTO recordings(platform,channel,url,title,folder,started_at) "
                      "VALUES(?,?,?,?,?,?)", (platform, channel, url, title, str(folder), time.time()))

    def add_clip(self, rec_id, start, end, score, meta: dict, short_path, wide_path, thumb_path) -> int:
        return self.x("INSERT INTO clips(recording_id,start,end,score,meta,short_path,wide_path,"
                      "thumb_path,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
                      (rec_id, start, end, score, json.dumps(meta, ensure_ascii=False),
                       str(short_path), str(wide_path or ""), str(thumb_path or ""), time.time()))

    def uploads_last_24h(self) -> int:
        since = time.time() - 86400
        a = self.q("SELECT COUNT(*) c FROM clips WHERE uploaded_at > ?", (since,))[0]["c"]
        b = self.q("SELECT COUNT(*) c FROM long_videos WHERE uploaded_at > ?", (since,))[0]["c"]
        return a + b

    def last_upload_time(self) -> float:
        a = self.q("SELECT MAX(uploaded_at) m FROM clips")[0]["m"] or 0
        b = self.q("SELECT MAX(uploaded_at) m FROM long_videos")[0]["m"] or 0
        return max(a, b)
