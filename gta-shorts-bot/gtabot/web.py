"""Mobile-friendly control panel:  python -m gtabot web
Start/stop the bot, change settings, upload your video, connect YouTube, watch the clips - from a phone."""
from __future__ import annotations

import json
import logging
import os
import re
import shutil
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import yaml

from . import youtube
from .config import ROOT, VIDEO_EXT, env, load_config

log = logging.getLogger("web")

STATE_FILE = ROOT / "data" / "panel.json"
SECRET_KEYS = ["ANTHROPIC_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN", "TWITCH_CLIENT_ID", "TWITCH_CLIENT_SECRET", "KICK_CLIENT_ID", "KICK_CLIENT_SECRET"]


class Panel:
    def __init__(self):
        self.bot = None
        self.job = ""  # text of the running "process VOD" job
        self.lock = threading.Lock()

    # --- persistent panel state (autostart after a restart) -------------
    def _state(self) -> dict:
        try:
            return json.loads(STATE_FILE.read_text())
        except Exception:  # noqa: BLE001
            return {}

    def _save_state(self, **kw) -> None:
        s = self._state()
        s.update(kw)
        STATE_FILE.parent.mkdir(exist_ok=True)
        STATE_FILE.write_text(json.dumps(s))

    # --- bot control ----------------------------------------------------
    def start(self) -> None:
        from .bot import Bot
        with self.lock:
            if self.bot and self.bot.running:
                return
            self.bot = Bot(load_config())
            self.bot.start()
            self._save_state(autostart=True)

    def stop(self) -> None:
        with self.lock:
            if self.bot:
                self.bot.stop()
            self.bot = None
            self._save_state(autostart=False)

    def process(self, source: str) -> None:
        if self.job:
            raise RuntimeError("Another video is already being processed")

        def work():
            from .ai import AI
            from .db import DB
            from .pipeline import import_vod, tick_processing
            try:
                cfg = load_config()
                db = DB(cfg.data / "bot.db")
                self.job = f"Downloading / importing {source}"
                import_vod(cfg, db, source)
                self.job = f"Analysing and editing {source} (can take a while)"
                tick_processing(cfg, db, AI(cfg), set())
            except Exception as e:  # noqa: BLE001
                log.exception("process failed")
                self.job = f"❌ Failed: {e}"
                threading.Timer(60, lambda: setattr(self, "job", "")).start()
                return
            self.job = ""
        threading.Thread(target=work, daemon=True).start()

    # --- settings -------------------------------------------------------
    @staticmethod
    def _cfg_file() -> dict:
        p = ROOT / "config.yaml"
        src = p if p.exists() else ROOT / "config.example.yaml"
        return yaml.safe_load(src.read_text(encoding="utf-8")) or {}

    def settings(self) -> dict:
        c = load_config()
        return {
            "streamers": "\n".join(f"{w['platform']}:{w['channel']}" for w in c.watch or []),
            "discover_youtube": bool(c.auto_discover.get("youtube")),
            "discover_twitch": bool(c.auto_discover.get("twitch")),
            "discover_kick": bool(c.auto_discover.get("kick")),
            "max_clips_per_stream": c.max_clips_per_stream,
            "content_language": c.content_language,
            "facecam_volume": c.facecam_volume,
            "youtube_enabled": bool(c.youtube.get("enabled")),
            "privacy": c.youtube.get("privacy", "public"),
            "keys": {k: bool(env(k)) for k in SECRET_KEYS},
        }

    def save_settings(self, d: dict) -> None:
        cfg = self._cfg_file()
        if "streamers" in d:
            watch = []
            for line in re.split(r"[\n,]+", d["streamers"]):
                if ":" in line:
                    p, ch = line.split(":", 1)
                    if p.strip().lower() in ("kick", "twitch", "youtube") and ch.strip():
                        watch.append({"platform": p.strip().lower(), "channel": ch.strip()})
            cfg["watch"] = watch
        ad = cfg.setdefault("auto_discover", {})
        for k in ("youtube", "twitch", "kick"):
            if f"discover_{k}" in d:
                ad[k] = bool(d[f"discover_{k}"])
        for k, cast in (("max_clips_per_stream", int), ("facecam_volume", float), ("content_language", str)):
            if k in d and str(d[k]).strip() != "":
                cfg[k] = cast(d[k])
        yt = cfg.setdefault("youtube", {})
        if "youtube_enabled" in d:
            yt["enabled"] = bool(d["youtube_enabled"])
        if d.get("privacy") in ("public", "unlisted", "private"):
            yt["privacy"] = d["privacy"]
        cfg["facecam_video"] = cfg.get("facecam_video") or "assets"
        (ROOT / "config.yaml").write_text(yaml.safe_dump(cfg, allow_unicode=True, sort_keys=False), encoding="utf-8")
        # secrets -> .env
        from dotenv import set_key
        envf = ROOT / ".env"
        if not envf.exists():
            shutil.copy(ROOT / ".env.example", envf)
        for k in SECRET_KEYS:
            v = (d.get("keys") or {}).get(k, "").strip()
            if v:
                set_key(str(envf), k, v)
                os.environ[k] = v

    # --- status -----------------------------------------------------------
    def state(self) -> dict:
        from .db import DB
        cfg = load_config()
        db = DB(cfg.data / "bot.db")
        clips = []
        for r in db.q("SELECT * FROM clips ORDER BY id DESC LIMIT 30"):
            m = json.loads(r["meta"])
            clips.append({"id": r["id"], "status": r["status"], "title": m.get("title", ""),
                          "streamer": m.get("streamer", ""), "youtube_id": r["youtube_id"],
                          "dur": round(r["end"] - r["start"])})
        longs = [{"id": r["id"], "status": r["status"], "title": json.loads(r["meta"]).get("title", ""),
                  "youtube_id": r["youtube_id"]}
                 for r in db.q("SELECT * FROM long_videos ORDER BY id DESC LIMIT 10")]
        recs = [{"channel": r["channel"], "platform": r["platform"], "status": r["status"],
                 "minutes": round(r["processed_until"] / 60)}
                for r in db.q("SELECT * FROM recordings ORDER BY id DESC LIMIT 8")]
        live = list(self.bot.recorders.keys()) if self.bot else []
        return {
            "running": bool(self.bot and self.bot.running), "recording_now": live, "job": self.job,
            "checks": {
                "ffmpeg": bool(shutil.which("ffmpeg")),
                "facecams": [f.name for f in cfg.facecams()],
                "claude": bool(env("ANTHROPIC_API_KEY") or env("CLAUDE_CODE_OAUTH_TOKEN")),
                "client_secret": youtube.CLIENT_SECRET.exists(),
                "youtube": youtube.is_ready(),
            },
            "uploads24h": db.uploads_last_24h(),
            "clips": clips, "longs": longs, "recordings": recs, "settings": self.settings(),
        }

    def set_clip_status(self, kind: str, cid: int, status: str) -> None:
        from .db import DB
        table = "clips" if kind == "clip" else "long_videos"
        db = DB(load_config().data / "bot.db")
        db.x(f"UPDATE {table} SET status=? WHERE id=? AND status IN ('rendered','skipped')", (status, cid))


PANEL = Panel()


def _log_tail(n: int = 60) -> str:
    p = ROOT / "data" / "bot.log"
    if not p.exists():
        return ""
    with open(p, "rb") as f:
        f.seek(0, 2)
        f.seek(max(0, f.tell() - 20000))
        return "\n".join(f.read().decode("utf-8", "ignore").splitlines()[-n:])


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):  # quiet
        pass

    def _send(self, code: int, body: bytes, ctype: str = "application/json") -> None:
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _json(self, obj, code: int = 200) -> None:
        self._send(code, json.dumps(obj, ensure_ascii=False).encode())

    def _body_json(self) -> dict:
        n = int(self.headers.get("Content-Length") or 0)
        return json.loads(self.rfile.read(n) or b"{}")

    # ---------------------------------------------------------------
    def do_GET(self):  # noqa: N802
        u = urlparse(self.path)
        try:
            if u.path == "/":
                return self._send(200, PAGE.encode(), "text/html; charset=utf-8")
            if u.path == "/api/state":
                return self._json(PANEL.state())
            if u.path == "/api/log":
                return self._send(200, _log_tail().encode(), "text/plain; charset=utf-8")
            m = re.fullmatch(r"/media/(clip|thumb|long|longthumb)/(\d+)", u.path)
            if m:
                return self._media(m.group(1), int(m.group(2)))
            self._send(404, b"not found", "text/plain")
        except Exception as e:  # noqa: BLE001
            log.exception("GET %s", u.path)
            self._json({"error": str(e)}, 500)

    def _media(self, kind: str, mid: int) -> None:
        from .db import DB
        db = DB(load_config().data / "bot.db")
        if kind in ("clip", "thumb"):
            r = db.q("SELECT short_path, thumb_path FROM clips WHERE id=?", (mid,))
            path = r and (r[0]["short_path"] if kind == "clip" else r[0]["thumb_path"])
        else:
            r = db.q("SELECT path, thumb_path FROM long_videos WHERE id=?", (mid,))
            path = r and (r[0]["path"] if kind == "long" else r[0]["thumb_path"])
        if not path or not Path(path).exists():
            return self._send(404, b"missing", "text/plain")
        p = Path(path)
        size = p.stat().st_size
        ctype = "video/mp4" if p.suffix == ".mp4" else "image/jpeg"
        start, end = 0, size - 1
        rng = self.headers.get("Range")
        if rng and rng.startswith("bytes="):  # phones need range requests to play video
            a, _, b = rng[6:].partition("-")
            start = int(a) if a else max(0, size - int(b))
            end = int(b) if a and b else size - 1
            self.send_response(206)
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        else:
            self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(end - start + 1))
        self.end_headers()
        with open(p, "rb") as f:
            f.seek(start)
            left = end - start + 1
            while left > 0:
                chunk = f.read(min(1 << 20, left))
                if not chunk:
                    break
                try:
                    self.wfile.write(chunk)
                except (BrokenPipeError, ConnectionResetError):
                    return
                left -= len(chunk)

    def do_POST(self):  # noqa: N802
        u = urlparse(self.path)
        q = parse_qs(u.query)
        try:
            if u.path == "/api/start":
                PANEL.start()
            elif u.path == "/api/stop":
                PANEL.stop()
            elif u.path == "/api/settings":
                PANEL.save_settings(self._body_json())
            elif u.path == "/api/process":
                PANEL.process(self._body_json()["source"].strip())
            elif u.path == "/api/clip":
                d = self._body_json()
                PANEL.set_clip_status(d.get("kind", "clip"), int(d["id"]), d["status"])
            elif u.path == "/api/upload":
                return self._json(self._upload(q.get("kind", [""])[0], q.get("name", ["video.mp4"])[0]))
            elif u.path == "/api/delete-facecam":
                name = Path(self._body_json()["name"]).name
                (ROOT / "assets" / name).unlink(missing_ok=True)
            elif u.path == "/api/yt/url":
                return self._json({"url": youtube.remote_login_url()})
            elif u.path == "/api/yt/finish":
                return self._json({"channel": youtube.remote_login_finish(self._body_json()["pasted"])})
            else:
                return self._send(404, b"not found", "text/plain")
            self._json({"ok": True})
        except Exception as e:  # noqa: BLE001
            log.warning("POST %s failed: %s", u.path, e)
            self._json({"error": str(e)}, 400)

    def _upload(self, kind: str, name: str) -> dict:
        n = int(self.headers.get("Content-Length") or 0)
        if kind == "facecam":
            name = Path(name).name
            if Path(name).suffix.lower() not in VIDEO_EXT:
                raise ValueError("Please upload a video file (mp4/mov)")
            (ROOT / "assets").mkdir(exist_ok=True)
            dest = ROOT / "assets" / name
        elif kind == "client_secret":
            dest = youtube.CLIENT_SECRET
        else:
            raise ValueError("unknown upload kind")
        tmp = dest.with_suffix(dest.suffix + ".part")
        with open(tmp, "wb") as f:
            while n > 0:
                chunk = self.rfile.read(min(1 << 20, n))
                if not chunk:
                    break
                f.write(chunk)
                n -= len(chunk)
        if kind == "client_secret":
            data = json.loads(tmp.read_text(encoding="utf-8"))
            if "installed" not in data and "web" not in data:
                tmp.unlink()
                raise ValueError("This is not a Google OAuth client file")
        tmp.replace(dest)
        return {"ok": True, "saved": dest.name}


def serve(host: str = "127.0.0.1", port: int = 8080) -> None:
    if PANEL._state().get("autostart"):
        log.info("Bot was running before the restart - starting it again")
        try:
            PANEL.start()
        except Exception:  # noqa: BLE001
            log.exception("autostart failed")
    srv = ThreadingHTTPServer((host, port), Handler)
    log.info("📱 Control panel: http://%s:%d", "localhost" if host in ("0.0.0.0", "127.0.0.1") else host, port)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        PANEL.stop() if PANEL.bot else None


PAGE = r"""<!doctype html>
<html lang="fa" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>GTA 6 Shorts Bot</title>
<style>
:root{--bg:#0e0f13;--card:#181a21;--line:#2a2d38;--text:#eceef3;--mute:#9aa0ad;--acc:#ffcc00;--ok:#2ecc71;--bad:#ff5c5c}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.6 system-ui,Tahoma,sans-serif;padding:12px 14px 60px}
h1{font-size:20px;margin:4px 0 12px}h2{font-size:16px;margin:0 0 10px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px;margin-bottom:12px}
button{background:var(--acc);color:#000;border:0;border-radius:10px;padding:10px 14px;font-weight:700;font-size:15px}
button.sec{background:#2c303c;color:var(--text)}button.red{background:var(--bad);color:#fff}
button:disabled{opacity:.5}
input,textarea,select{width:100%;background:#0f1117;color:var(--text);border:1px solid var(--line);border-radius:9px;padding:9px;font-size:15px;direction:ltr}
label{display:block;color:var(--mute);font-size:13px;margin:10px 0 4px}
.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.row>*{flex:1}
.chk{display:flex;align-items:center;gap:8px;margin:6px 0}.chk input{width:auto}
.big{font-size:18px;padding:14px;width:100%}
.dot{display:inline-block;width:10px;height:10px;border-radius:50%;margin-left:6px}
.list li{margin:4px 0}ul{padding-right:18px;margin:0}
.ok{color:var(--ok)}.bad{color:var(--bad)}.mute{color:var(--mute);font-size:13px}
.clips{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
.clip{background:#0f1117;border:1px solid var(--line);border-radius:10px;overflow:hidden}
.clip video,.clip img{width:100%;display:block;background:#000}.clip .t{padding:6px 8px;font-size:12px}
.tag{display:inline-block;font-size:11px;padding:1px 7px;border-radius:20px;background:#2c303c}
pre{background:#0a0b0e;border-radius:10px;padding:10px;font-size:11px;max-height:260px;overflow:auto;direction:ltr;white-space:pre-wrap}
a{color:var(--acc)}
</style></head><body>
<h1>🎮 GTA 6 Shorts Bot</h1>

<div class="card">
  <h2><span id="dot" class="dot"></span><span id="runtxt">...</span></h2>
  <div id="now" class="mute"></div>
  <div style="margin-top:10px"><button id="startBtn" class="big" onclick="toggle()">...</button></div>
  <div id="job" class="mute" style="margin-top:8px"></div>
</div>

<div class="card">
  <h2>✅ چک‌لیست راه‌اندازی</h2>
  <ul class="list" id="checks"></ul>
</div>

<div class="card">
  <h2>🎥 ویدیوی خودت (پایین شورت‌ها)</h2>
  <div id="faces" class="mute"></div>
  <label>یه ویدیو از خودت انتخاب کن (۱ تا ۲ دقیقه، mp4)</label>
  <input type="file" id="faceFile" accept="video/*">
  <div style="margin-top:8px"><button onclick="upFace()">آپلود ویدیو</button> <span id="faceMsg" class="mute"></span></div>
</div>

<div class="card">
  <h2>📺 اتصال یوتیوب</h2>
  <label>۱) فایل client_secret.json (از Google Cloud، مراحلش توی README)</label>
  <input type="file" id="csFile" accept=".json,application/json">
  <div style="margin-top:8px"><button class="sec" onclick="upCS()">آپلود فایل</button> <span id="csMsg" class="mute"></span></div>
  <label>۲) دکمه زیر رو بزن، با اکانت یوتیوبت وارد شو و اجازه بده</label>
  <button onclick="ytStart()">اتصال به یوتیوب</button>
  <div id="ytStep" style="display:none">
    <p class="mute">بعد از اجازه دادن، صفحه‌ای باز می‌شه که «باز نمی‌شه / This site can't be reached». <b>عادیه.</b> آدرس اون صفحه (که با http://localhost:8090 شروع می‌شه) رو کامل کپی کن و اینجا بذار:</p>
    <input id="ytPaste" placeholder="http://localhost:8090/?code=...">
    <div style="margin-top:8px"><button onclick="ytFinish()">تمام</button> <span id="ytMsg" class="mute"></span></div>
  </div>
</div>

<div class="card">
  <h2>⚙️ تنظیمات</h2>
  <label>استریمرها (هر خط یکی، مثل kick:xqc یا twitch:summit1g یا youtube:@name)</label>
  <textarea id="streamers" rows="4" placeholder="kick:xqc&#10;twitch:summit1g"></textarea>
  <div class="chk"><input type="checkbox" id="d_youtube"><span>پیدا کردن خودکار استریم‌های GTA 6 در یوتیوب</span></div>
  <div class="chk"><input type="checkbox" id="d_twitch"><span>پیدا کردن خودکار در توییچ (کلید توییچ لازمه)</span></div>
  <div class="chk"><input type="checkbox" id="d_kick"><span>پیدا کردن خودکار در کیک (کلید کیک لازمه)</span></div>
  <div class="row">
    <div><label>شورت از هر استریم</label><input type="number" id="maxclips" min="1" max="20"></div>
    <div><label>صدای ویدیوی خودت (0 تا 1)</label><input type="number" id="facevol" step="0.1" min="0" max="1"></div>
  </div>
  <div class="row">
    <div><label>زبان تایتل‌ها</label><select id="lang"><option>English</option><option>Persian</option><option>Arabic</option><option>Turkish</option><option>Spanish</option></select></div>
    <div><label>نمایش در یوتیوب</label><select id="privacy"><option value="public">Public</option><option value="unlisted">Unlisted</option><option value="private">Private</option></select></div>
  </div>
  <div class="chk"><input type="checkbox" id="ytEnabled"><span>آپلود خودکار روی یوتیوب</span></div>
  <label>توکن اشتراک Claude Pro (CLAUDE_CODE_OAUTH_TOKEN) <span id="k_CLAUDE_CODE_OAUTH_TOKEN"></span></label>
  <input id="key_CLAUDE_CODE_OAUTH_TOKEN" type="password" placeholder="sk-ant-oat01-...">
  <label>یا کلید API (ANTHROPIC_API_KEY) <span id="k_ANTHROPIC_API_KEY"></span></label>
  <input id="key_ANTHROPIC_API_KEY" type="password" placeholder="sk-ant-api...">
  <details style="margin-top:8px"><summary class="mute">کلیدهای اختیاری توییچ و کیک</summary>
    <label>TWITCH_CLIENT_ID <span id="k_TWITCH_CLIENT_ID"></span></label><input id="key_TWITCH_CLIENT_ID" type="password">
    <label>TWITCH_CLIENT_SECRET <span id="k_TWITCH_CLIENT_SECRET"></span></label><input id="key_TWITCH_CLIENT_SECRET" type="password">
    <label>KICK_CLIENT_ID <span id="k_KICK_CLIENT_ID"></span></label><input id="key_KICK_CLIENT_ID" type="password">
    <label>KICK_CLIENT_SECRET <span id="k_KICK_CLIENT_SECRET"></span></label><input id="key_KICK_CLIENT_SECRET" type="password">
  </details>
  <div style="margin-top:12px"><button onclick="saveSettings()">ذخیره تنظیمات</button> <span id="setMsg" class="mute"></span></div>
  <p class="mute">اگه ربات روشنه، بعد از ذخیره یه بار خاموش و روشنش کن.</p>
</div>

<div class="card">
  <h2>🧪 ساخت شورت از یه ویدیوی ضبط‌شده (تست)</h2>
  <input id="vod" placeholder="https://www.twitch.tv/videos/... یا لینک یوتیوب/کیک">
  <div style="margin-top:8px"><button class="sec" onclick="processVod()">شروع</button> <span id="vodMsg" class="mute"></span></div>
</div>

<div class="card">
  <h2>🎬 شورت‌های ساخته‌شده</h2>
  <div class="mute" id="upl"></div>
  <div class="clips" id="clips"></div>
  <h2 style="margin-top:14px">📼 ویدیوهای بلند</h2>
  <div id="longs" class="mute"></div>
</div>

<div class="card">
  <h2>📜 گزارش (لاگ)</h2>
  <pre id="log"></pre>
</div>

<script>
let S=null, loaded=false;
const $=id=>document.getElementById(id);
async function api(path, body){
  const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body||{})});
  const j=await r.json(); if(j.error) throw new Error(j.error); return j;
}
function esc(s){return (s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
async function refresh(){
  try{ S=await (await fetch('/api/state')).json(); }catch(e){ return; }
  $('dot').style.background=S.running?'var(--ok)':'var(--bad)';
  $('runtxt').textContent=S.running?'ربات روشنه و داره کار می‌کنه':'ربات خاموشه';
  $('startBtn').textContent=S.running?'⏹ خاموش کردن ربات':'▶️ روشن کردن ربات';
  $('startBtn').className=S.running?'big red':'big';
  $('now').textContent=S.recording_now.length?('🔴 در حال ضبط: '+S.recording_now.join('، ')):(S.running?'منتظر لایو شدن استریمرها...':'');
  $('job').textContent=S.job||'';
  const c=S.checks, it=(ok,t,h)=>`<li class="${ok?'ok':'bad'}">${ok?'✅':'❌'} ${t}${ok||!h?'':' <span class="mute">('+h+')</span>'}</li>`;
  $('checks').innerHTML=it(c.ffmpeg,'FFmpeg نصبه','باید نصب بشه')+
    it(c.facecams.length,'ویدیوی خودت','بخش پایین، آپلود کن')+
    it(c.claude,'Claude وصله','اختیاری ولی خیلی بهتره: bash claude.sh')+
    it(c.client_secret,'فایل client_secret.json','بخش یوتیوب')+
    it(c.youtube,'یوتیوب وصله','بخش یوتیوب');
  $('faces').innerHTML=c.facecams.length?('ویدیوهای فعلی: '+c.facecams.map(f=>`${esc(f)} <a href="#" onclick="delFace('${esc(f)}');return false">حذف</a>`).join('، ')):'هنوز ویدیویی نذاشتی.';
  $('upl').textContent='آپلود در ۲۴ ساعت گذشته: '+S.uploads24h;
  $('clips').innerHTML=S.clips.map(x=>`<div class="clip">
     <video src="/media/clip/${x.id}" poster="/media/thumb/${x.id}" controls preload="none" playsinline></video>
     <div class="t">${esc(x.title)}<br><span class="tag">${x.status}</span> <span class="mute">${esc(x.streamer)} · ${x.dur}s</span>
     ${x.youtube_id?`<br><a target="_blank" href="https://youtube.com/shorts/${x.youtube_id}">مشاهده در یوتیوب</a>`:''}
     ${x.status=='rendered'?`<br><a href="#" onclick="clipSt(${x.id},'skipped');return false">آپلود نشه ✖</a>`:''}
     ${x.status=='skipped'?`<br><a href="#" onclick="clipSt(${x.id},'rendered');return false">برگردون به صف آپلود</a>`:''}
     </div></div>`).join('')||'<span class="mute">هنوز شورتی ساخته نشده.</span>';
  $('longs').innerHTML=S.longs.map(x=>`<div>🎞 <a target="_blank" href="/media/long/${x.id}">${esc(x.title)}</a> <span class="tag">${x.status}</span>
     ${x.youtube_id?` <a target="_blank" href="https://youtu.be/${x.youtube_id}">یوتیوب</a>`:''}</div>`).join('')||'هنوز ویدیوی بلندی ساخته نشده (بعد از تموم شدن یه استریم ساخته می‌شه).';
  if(!loaded){ loaded=true; const s=S.settings;
    $('streamers').value=s.streamers; $('d_youtube').checked=s.discover_youtube; $('d_twitch').checked=s.discover_twitch;
    $('d_kick').checked=s.discover_kick; $('maxclips').value=s.max_clips_per_stream; $('facevol').value=s.facecam_volume;
    $('lang').value=s.content_language; $('privacy').value=s.privacy; $('ytEnabled').checked=s.youtube_enabled; }
  for(const k in S.settings.keys){ const el=$('k_'+k); if(el) el.innerHTML=S.settings.keys[k]?'<span class="ok">(ذخیره شده)</span>':''; }
  try{ $('log').textContent=await (await fetch('/api/log')).text(); }catch(e){}
}
async function toggle(){ $('startBtn').disabled=true; try{ await api(S&&S.running?'/api/stop':'/api/start'); }catch(e){ alert(e.message) } $('startBtn').disabled=false; refresh(); }
async function upload(kind,inp,msg){
  const f=$(inp).files[0]; if(!f){ $(msg).textContent='اول فایل رو انتخاب کن'; return; }
  $(msg).textContent='در حال آپلود... ('+Math.round(f.size/1e6)+'MB)';
  const r=await fetch('/api/upload?kind='+kind+'&name='+encodeURIComponent(f.name),{method:'POST',body:f});
  const j=await r.json(); $(msg).textContent=j.error?('❌ '+j.error):'✅ ذخیره شد'; refresh();
}
function upFace(){ upload('facecam','faceFile','faceMsg') }
function upCS(){ upload('client_secret','csFile','csMsg') }
async function delFace(n){ if(confirm('حذف '+n+'؟')){ await api('/api/delete-facecam',{name:n}); refresh(); } }
async function ytStart(){ try{ const j=await api('/api/yt/url'); $('ytStep').style.display='block'; window.open(j.url,'_blank'); }catch(e){ alert(e.message) } }
async function ytFinish(){ $('ytMsg').textContent='...'; try{ const j=await api('/api/yt/finish',{pasted:$('ytPaste').value}); $('ytMsg').textContent='✅ وصل شد: '+j.channel; refresh(); }catch(e){ $('ytMsg').textContent='❌ '+e.message } }
async function saveSettings(){
  const keys={}; for(const k of ['ANTHROPIC_API_KEY','CLAUDE_CODE_OAUTH_TOKEN','TWITCH_CLIENT_ID','TWITCH_CLIENT_SECRET','KICK_CLIENT_ID','KICK_CLIENT_SECRET']){ keys[k]=$('key_'+k).value; $('key_'+k).value=''; }
  try{ await api('/api/settings',{streamers:$('streamers').value, discover_youtube:$('d_youtube').checked, discover_twitch:$('d_twitch').checked,
    discover_kick:$('d_kick').checked, max_clips_per_stream:$('maxclips').value, facecam_volume:$('facevol').value,
    content_language:$('lang').value, privacy:$('privacy').value, youtube_enabled:$('ytEnabled').checked, keys});
    $('setMsg').textContent='✅ ذخیره شد'; }catch(e){ $('setMsg').textContent='❌ '+e.message }
  refresh();
}
async function processVod(){ try{ await api('/api/process',{source:$('vod').value}); $('vodMsg').textContent='✅ شروع شد، وضعیتش بالای صفحه‌ست'; }catch(e){ $('vodMsg').textContent='❌ '+e.message } refresh(); }
async function clipSt(id,st){ await api('/api/clip',{id,status:st}); refresh(); }
refresh(); setInterval(refresh,6000);
</script></body></html>"""
