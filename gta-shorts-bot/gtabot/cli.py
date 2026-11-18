"""Command line:  python -m gtabot <command>"""
from __future__ import annotations

import argparse
import importlib
import json
import logging
import shutil
import sys
from pathlib import Path

from .config import ROOT, env, load_config
from .log import setup_logging

log = logging.getLogger("cli")


def cmd_setup(_args) -> None:
    """Interactive wizard that writes config.yaml and .env."""
    import yaml

    print("\n=== GTA VI Shorts Bot - راه‌اندازی ===\n")
    cfg_path = ROOT / "config.yaml"
    base = yaml.safe_load((ROOT / "config.example.yaml").read_text(encoding="utf-8"))
    if cfg_path.exists():
        base.update(yaml.safe_load(cfg_path.read_text(encoding="utf-8")) or {})

    def ask(q, default=""):
        v = input(f"{q} [{default}]: ").strip().strip('"')
        return v or default

    base["facecam_video"] = ask("مسیر ویدیوی خودت (فیس‌کم) | Path to YOUR facecam video",
                                base.get("facecam_video", ""))
    print("استریمرها رو به شکل platform:channel وارد کن، با کاما جدا کن. مثال: kick:xqc, twitch:summit1g, youtube:@name")
    current = ", ".join(f"{w['platform']}:{w['channel']}" for w in base.get("watch") or [])
    raw = ask("Streamers", current)
    watch = []
    for part in raw.split(","):
        if ":" in part:
            p, c = part.split(":", 1)
            watch.append({"platform": p.strip().lower(), "channel": c.strip()})
    base["watch"] = watch
    base["content_language"] = ask("زبان تایتل‌ها | Title language", base.get("content_language", "English"))
    cfg_path.write_text(yaml.safe_dump(base, allow_unicode=True, sort_keys=False), encoding="utf-8")

    env_path = ROOT / ".env"
    if not env_path.exists():
        shutil.copy(ROOT / ".env.example", env_path)
    if not env("ANTHROPIC_API_KEY"):
        from dotenv import load_dotenv, set_key
        key = input("ANTHROPIC_API_KEY (از console.anthropic.com - خالی بذاری بدون Claude کار می‌کنه): ").strip()
        if key:
            set_key(str(env_path), "ANTHROPIC_API_KEY", key)
            load_dotenv(env_path, override=True)
    print(f"\n✅ ذخیره شد: {cfg_path}\nحالا:  python -m gtabot youtube-login  و بعد  python -m gtabot run\n")


def cmd_doctor(_args) -> None:
    cfg = load_config()
    ok = True

    def check(name, good, hint=""):
        nonlocal ok
        print(f"  {'✅' if good else '❌'} {name}" + ("" if good else f"   -> {hint}"))
        ok &= bool(good)

    print("\nChecking your setup:\n")
    check("ffmpeg", shutil.which("ffmpeg") and shutil.which("ffprobe"), "Install ffmpeg (install_windows.bat does it)")
    for mod in ["anthropic", "streamlink", "yt_dlp", "numpy", "PIL", "googleapiclient", "curl_cffi", "websocket"]:
        try:
            importlib.import_module(mod)
            check(mod, True)
        except Exception:  # noqa: BLE001
            check(mod, False, "pip install -r requirements.txt")
    try:
        importlib.import_module("faster_whisper")
        check("faster_whisper (captions)", True)
    except Exception:  # noqa: BLE001
        check("faster_whisper (captions)", False, "optional: pip install faster-whisper")
    check("config.yaml", (ROOT / "config.yaml").exists(), "python -m gtabot setup")
    face = cfg.facecam_video
    check(f"facecam video ({face})", face and Path(face).exists(), "set facecam_video in config.yaml")
    check("ANTHROPIC_API_KEY", env("ANTHROPIC_API_KEY"), "add it to .env (optional but recommended)")
    check("client_secret.json (YouTube)", (ROOT / "client_secret.json").exists(), "see README step 4")
    from . import youtube
    check("YouTube login", youtube.is_ready(), "python -m gtabot youtube-login")
    print("\nAll good! Run:  python -m gtabot run\n" if ok else "\nFix the ❌ items above.\n")


def cmd_youtube_login(_args) -> None:
    from . import youtube
    name = youtube.login()
    print(f"✅ Connected to YouTube channel: {name}")


def cmd_run(_args) -> None:
    from .bot import Bot
    Bot(load_config()).run()


def cmd_process(args) -> None:
    """Make shorts from a VOD URL or a local video file (good for testing)."""
    from .ai import AI
    from .db import DB
    from .pipeline import import_vod, tick_processing, tick_upload

    cfg = load_config()
    db = DB(cfg.data / "bot.db")
    rid = import_vod(cfg, db, args.source, args.channel)
    log.info("Imported as recording #%d, analysing...", rid)
    tick_processing(cfg, db, AI(cfg), set())
    if args.upload:
        tick_upload(cfg, db)
    cmd_status(args)


def cmd_upload(_args) -> None:
    from .db import DB
    from .pipeline import tick_upload
    cfg = load_config()
    tick_upload(cfg, DB(cfg.data / "bot.db"))


def cmd_status(_args) -> None:
    from .db import DB
    cfg = load_config()
    db = DB(cfg.data / "bot.db")
    print("\nRecent shorts:")
    for r in db.q("SELECT * FROM clips ORDER BY id DESC LIMIT 15"):
        m = json.loads(r["meta"])
        yt = f"https://youtube.com/shorts/{r['youtube_id']}" if r["youtube_id"] else ""
        print(f"  #{r['id']:<4} {r['status']:<9} {m.get('streamer', ''):<15} {m.get('title', '')[:50]:<50} {yt}")
        print(f"         {r['short_path']}")
    print("\nLong videos:")
    for r in db.q("SELECT * FROM long_videos ORDER BY id DESC LIMIT 5"):
        m = json.loads(r["meta"])
        print(f"  #{r['id']:<4} {r['status']:<9} {m.get('title', '')[:60]}  {r['path']}")
    print(f"\nUploads in last 24h: {db.uploads_last_24h()}\n")


def main() -> None:
    if sys.platform == "win32":
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except Exception:  # noqa: BLE001
            pass
    setup_logging()
    p = argparse.ArgumentParser(prog="gtabot", description="GTA VI Shorts Bot")
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("setup", help="interactive setup wizard").set_defaults(fn=cmd_setup)
    sub.add_parser("doctor", help="check everything is installed").set_defaults(fn=cmd_doctor)
    sub.add_parser("youtube-login", help="connect your YouTube channel").set_defaults(fn=cmd_youtube_login)
    sub.add_parser("run", help="start the bot (watch, record, edit, upload)").set_defaults(fn=cmd_run)
    sp = sub.add_parser("process", help="make shorts from a VOD url or a video file")
    sp.add_argument("source")
    sp.add_argument("--channel", help="streamer name for credit")
    sp.add_argument("--upload", action="store_true", help="also upload one video now")
    sp.set_defaults(fn=cmd_process)
    sub.add_parser("upload", help="upload the next pending video now").set_defaults(fn=cmd_upload)
    sub.add_parser("status", help="list made / uploaded videos").set_defaults(fn=cmd_status)
    args = p.parse_args()
    args.fn(args)
