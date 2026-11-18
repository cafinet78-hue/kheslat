"""Records a live stream into short segments (streamlink -> ffmpeg) and logs chat."""
from __future__ import annotations

import csv
import json
import logging
import socket
import subprocess
import sys
import threading
import time
from pathlib import Path

log = logging.getLogger("recorder")


class Recorder:
    """Runs in its own thread until the stream ends or stop() is called."""

    SEGMENT_SECONDS = 60

    def __init__(self, url: str, platform: str, channel: str, folder: Path, quality: str):
        self.url, self.platform, self.channel = url, platform, channel
        self.folder = Path(folder)
        self.folder.mkdir(parents=True, exist_ok=True)
        self.quality = quality
        self.started_at = 0.0
        self.finished = threading.Event()
        self._stop = threading.Event()
        self._procs: list[subprocess.Popen] = []
        self.chat = ChatLogger(platform, channel, self.folder / "chat.jsonl", self)

    # ------------------------------------------------------------------
    def start(self) -> None:
        threading.Thread(target=self._run, name=f"rec-{self.channel}", daemon=True).start()

    def stop(self) -> None:
        self._stop.set()
        for p in self._procs:
            try:
                p.terminate()
            except Exception:  # noqa: BLE001
                pass

    def _run(self) -> None:
        retries, use_ytdlp = 0, False
        while not self._stop.is_set() and retries < 4:
            part = len(list(self.folder.glob("part*_segments.csv")))
            self._record_once(part, use_ytdlp)
            csv_file = self.folder / f"part{part:02d}_segments.csv"
            got = csv_file.exists() and csv_file.stat().st_size > 0
            if not got:
                # nothing recorded: switch tool (streamlink <-> yt-dlp) and try again
                use_ytdlp = not use_ytdlp
                log.info("Switching recorder to %s for %s", "yt-dlp" if use_ytdlp else "streamlink", self.channel)
            if self._stop.is_set():
                break
            # streamlink exits when the stream ends OR on a network hiccup: retry a few times
            retries += 1
            time.sleep(20)
            from .discovery import probe
            if probe(self.url) is None:
                break
        self.chat.stop()
        self.finished.set()
        log.info("Recording of %s finished", self.channel)

    def _record_once(self, part: int, use_ytdlp: bool = False) -> None:
        if use_ytdlp:
            sl_cmd = [sys.executable, "-m", "yt_dlp", "-q", "--no-part", "-f",
                      "best[height<=720]/best", "-o", "-", self.url]
        else:
            sl_cmd = [sys.executable, "-m", "streamlink", "--stdout", "--retry-open", "3",
                      self.url, self.quality]
            if self.platform == "twitch":
                sl_cmd[4:4] = ["--twitch-disable-ads"]
        seg_csv = self.folder / f"part{part:02d}_segments.csv"
        ff_cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", "pipe:0",
                  "-map", "0:v:0", "-map", "0:a:0?", "-c", "copy",
                  "-f", "segment", "-segment_time", str(self.SEGMENT_SECONDS),
                  "-reset_timestamps", "1",
                  "-segment_list", str(seg_csv), "-segment_list_type", "csv",
                  str(self.folder / f"part{part:02d}_seg_%05d.ts")]
        log.info("Recording %s (%s) -> %s", self.channel, self.url, self.folder)
        sl = subprocess.Popen(sl_cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        ff = subprocess.Popen(ff_cmd, stdin=sl.stdout, stderr=subprocess.DEVNULL)
        sl.stdout.close()
        self._procs = [sl, ff]
        now = time.time()
        if not self.started_at:
            self.started_at = now
            self.chat.start()
        # Remember wall-clock start of this part so segments map to a global timeline
        (self.folder / f"part{part:02d}_start.txt").write_text(str(now - self.started_at))
        ff.wait()
        sl.wait()


def list_segments(folder: Path) -> list[tuple[Path, float, float]]:
    """Return completed segments as (path, global_start, global_end) in stream seconds."""
    out = []
    for csv_path in sorted(Path(folder).glob("part*_segments.csv")):
        part = csv_path.name[:6]
        try:
            offset = float((Path(folder) / f"{part}_start.txt").read_text())
        except Exception:  # noqa: BLE001
            offset = out[-1][2] if out else 0.0
        with open(csv_path, newline="", encoding="utf-8") as f:
            for row in csv.reader(f):
                if len(row) < 3:
                    continue
                name, s, e = row[0], float(row[1]), float(row[2])
                p = Path(folder) / name
                if p.exists():
                    out.append((p, offset + s, offset + e))
    return out


# --------------------------------------------------------------------------
# Chat logging: chat activity is a great signal for "something crazy happened"
# --------------------------------------------------------------------------
class ChatLogger:
    def __init__(self, platform: str, channel: str, path: Path, rec: Recorder):
        self.platform, self.channel, self.path, self.rec = platform, channel, path, rec
        self._stop = threading.Event()

    def start(self) -> None:
        target = {"twitch": self._twitch, "kick": self._kick}.get(self.platform)
        if target:
            threading.Thread(target=self._safe, args=(target,), daemon=True,
                             name=f"chat-{self.channel}").start()

    def stop(self) -> None:
        self._stop.set()

    def _write(self, text: str) -> None:
        t = time.time() - self.rec.started_at
        with open(self.path, "a", encoding="utf-8") as f:
            f.write(json.dumps({"t": round(t, 2), "m": text[:200]}, ensure_ascii=False) + "\n")

    def _safe(self, fn) -> None:
        while not self._stop.is_set():
            try:
                fn()
            except Exception as e:  # noqa: BLE001
                log.debug("chat %s error: %s", self.channel, e)
            time.sleep(10)

    def _twitch(self) -> None:
        s = socket.create_connection(("irc.chat.twitch.tv", 6667), timeout=300)
        s.sendall(b"NICK justinfan%d\r\n" % (int(time.time()) % 100000))
        s.sendall(f"JOIN #{self.channel.lower()}\r\n".encode())
        buf = ""
        while not self._stop.is_set():
            data = s.recv(4096).decode("utf-8", "ignore")
            if not data:
                break
            buf += data
            *lines, buf = buf.split("\r\n")
            for line in lines:
                if line.startswith("PING"):
                    s.sendall(b"PONG :tmi.twitch.tv\r\n")
                elif " PRIVMSG " in line:
                    self._write(line.split(" :", 1)[-1])
        s.close()

    def _kick(self) -> None:
        import websocket
        from curl_cffi import requests as creq

        info = creq.get(f"https://kick.com/api/v2/channels/{self.channel}",
                        impersonate="chrome", timeout=20).json()
        room = info["chatroom"]["id"]
        ws = websocket.create_connection(
            "wss://ws-us2.pusher.com/app/32cbd69e4b950bf97679?protocol=7&client=js&version=8.4.0&flash=false",
            timeout=300)
        ws.send(json.dumps({"event": "pusher:subscribe",
                            "data": {"auth": "", "channel": f"chatrooms.{room}.v2"}}))
        while not self._stop.is_set():
            msg = json.loads(ws.recv())
            ev = msg.get("event", "")
            if ev == "pusher:ping":
                ws.send(json.dumps({"event": "pusher:pong", "data": {}}))
            elif "ChatMessageEvent" in ev:
                d = json.loads(msg.get("data") or "{}")
                self._write(d.get("content", ""))
        ws.close()
