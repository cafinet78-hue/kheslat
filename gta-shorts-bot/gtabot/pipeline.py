"""Highlight detection -> clip selection -> editing -> long video -> upload queue."""
from __future__ import annotations

import json
import threading
import logging
import time
from pathlib import Path

import numpy as np

from . import editor, youtube
from .ai import AI
from .config import Config
from .db import DB
from .media import concat, frame, loudness_per_second, run
from .recorder import list_segments
from .thumbnail import make_thumbnail
from .transcriber import transcribe, words_text

log = logging.getLogger("pipeline")

CHAT_DELAY = 6  # chat reacts a few seconds after the moment happens


def _z(x: np.ndarray) -> np.ndarray:
    sd = x.std()
    return (x - x.mean()) / sd if sd > 1e-6 else np.zeros_like(x)


def _smooth(x: np.ndarray, k: int) -> np.ndarray:
    if len(x) < k:
        return x
    # pad with edge values (zero-padding would create fake peaks at the window edges)
    xp = np.pad(x, (k // 2, k - 1 - k // 2), mode="edge")
    return np.convolve(xp, np.ones(k) / k, mode="valid")


def _load_chat(folder: Path) -> list[tuple[float, str]]:
    p = folder / "chat.jsonl"
    if not p.exists():
        return []
    out = []
    for line in p.read_text(encoding="utf-8", errors="ignore").splitlines():
        try:
            j = json.loads(line)
            out.append((float(j["t"]), j.get("m", "")))
        except Exception:  # noqa: BLE001
            continue
    return out


def find_candidates(cfg: Config, window: Path, win_start: float, chat: list, n: int) -> list[dict]:
    loud = loudness_per_second(window)
    length = len(loud)
    loud_s = _smooth(np.clip(loud, -60, 0), 3)
    score = _z(loud_s)
    counts = np.zeros(length)
    for t, _ in chat:
        i = int(t - win_start - CHAT_DELAY)
        if 0 <= i < length:
            counts[i] += 1
    if counts.sum() > 20:
        score = 0.8 * score + 1.5 * _z(_smooth(counts, 5))
    # Pick peaks with minimum spacing
    sep = max(cfg.clip_min_seconds, 45)  # two moments this far apart can be two shorts
    order = np.argsort(-score)
    peaks: list[int] = []
    for i in order:
        if len(peaks) >= n:
            break
        if all(abs(i - p) >= sep for p in peaks):
            peaks.append(int(i))
    cands = []
    for k, p in enumerate(sorted(peaks)):
        s = max(0.0, p - cfg.clip_max_seconds * 0.6)
        e = min(float(length), p + cfg.clip_max_seconds * 0.4 + 5)
        if e - s < cfg.clip_min_seconds:
            continue
        msgs = [m for t, m in chat if s <= t - win_start <= e + CHAT_DELAY]
        loud_gain = float(loud_s[p] - np.median(loud_s))
        lo, hi = max(0, p - 10), min(length, p + 10)
        chat_ratio = float(counts[lo:hi].mean() / counts.mean()) if counts.sum() > 20 else 0.0
        cands.append({"id": k, "start": s, "end": e, "peak": p, "score": float(score[p]), "chat": msgs,
                      "loud_gain_db": round(loud_gain, 1), "chat_ratio": round(chat_ratio, 1),
                      # a real "moment": clearly louder than usual or chat exploding
                      "hype": loud_gain >= 6 or chat_ratio >= 3})
    return cands


def process_window(cfg: Config, db: DB, ai: AI, rec, segs: list, final: bool) -> int:
    folder = Path(rec["folder"])
    t0, t1 = segs[0][1], segs[-1][2]
    already = db.q("SELECT COUNT(*) c FROM clips WHERE recording_id=?", (rec["id"],))[0]["c"]
    remaining = cfg.max_clips_per_stream - already
    made = 0
    if remaining > 0:
        window = concat([s[0] for s in segs], folder / f"window_{int(t0):06d}.ts")
        try:
            made = _make_clips(cfg, db, ai, rec, window, t0, min(remaining, cfg.clips_per_window))
        finally:
            window.unlink(missing_ok=True)
    # Keep the last ~clip_max seconds for the next window, so a moment that happens right at the
    # border is not cut in half (duplicates are filtered in _make_clips).
    keep = [] if final else [s for s in segs if s[1] >= t1 - cfg.clip_max_seconds]
    if len(keep) >= len(segs):
        keep = []
    done = segs[: len(segs) - len(keep)]
    if not cfg.keep_raw_recordings:
        for s in done:
            Path(s[0]).unlink(missing_ok=True)
    next_start = keep[0][1] if keep else t1
    db.x("UPDATE recordings SET processed_until=? WHERE id=?", (next_start, rec["id"]))
    log.info("[%s] analysed %d-%ds of stream -> %d new clip(s)", rec["channel"], t0, t1, made)
    return made


def _make_clips(cfg, db, ai, rec, window: Path, t0: float, max_clips: int) -> int:
    folder = Path(rec["folder"])
    cands = find_candidates(cfg, window, t0, _load_chat(folder), n=min(8, max_clips * 3 + 1))
    # drop moments we already clipped (windows overlap a little)
    done = [(r["start"] - t0, r["end"] - t0) for r in
            db.q("SELECT start, end FROM clips WHERE recording_id=?", (rec["id"],))]
    cands = [c for c in cands if not any(min(c["end"], e) - max(c["start"], s) > 0.3 * (c["end"] - c["start"])
                                         or s <= c["peak"] <= e for s, e in done)]
    if not cands:
        return 0
    fdir = folder / "frames"
    fdir.mkdir(exist_ok=True)
    for c in cands:
        span = c["end"] - c["start"]
        c["frames"] = [f for f in (frame(window, c["start"] + span * r, fdir / f"c{c['id']}_{i}.jpg", 512)
                                   for i, r in enumerate((0.3, 0.6, 0.85))) if f]
        # speech is only needed up front when Claude chooses; otherwise transcribe just the picks (faster)
        c["words"] = transcribe(window, c["start"], span, cfg.whisper_model) if ai.enabled else []
        c["transcript"] = words_text(c["words"])
    picks = ai.select_clips(cands, rec["channel"], rec["title"] or "", max_clips)
    by_id = {c["id"]: c for c in cands}
    out_dir = cfg.data / "output" / f"{rec['id']:04d}_{rec['platform']}_{rec['channel']}"
    out_dir.mkdir(parents=True, exist_ok=True)
    domains = {"twitch": "twitch.tv", "kick": "kick.com"}
    credit = ""
    if cfg.show_credit:
        d = domains.get(rec["platform"])
        credit = f"{d}/{rec['channel']}" if d else rec["channel"]
    made = 0
    for p in picks:
        n = db.q("SELECT COUNT(*) c FROM clips")[0]["c"] + 1
        base = out_dir / f"short_{n:04d}"
        words = by_id.get(p["candidate_id"], {}).get("words", [])
        if cfg.captions and not words:
            words = transcribe(window, p["start"], p["end"] - p["start"], cfg.whisper_model)
        face = cfg.facecam_for(n)
        try:
            short = editor.render_short(cfg, window, p["start"], p["end"], base.with_suffix(".mp4"),
                                        words, p.get("hook_text", ""), credit, face, facecam_offset=n * 37)
            wide = None
            if cfg.long_video.get("enabled"):
                wide = editor.render_wide(cfg, window, p["start"], p["end"],
                                          out_dir / f"wide_{n:04d}.mp4", credit, face, facecam_offset=n * 37)
            mid = (p["start"] + p["end"]) / 2
            thumb = make_thumbnail(window, mid, p.get("thumbnail_text", ""), base.with_suffix(".jpg"),
                                   face, vertical=True)
            # keep a frame for the long-video thumbnail
            frame(window, mid, out_dir / f"frame_{n:04d}.jpg", 1920)
        except Exception as e:  # noqa: BLE001
            log.error("Render failed: %s", e)
            continue
        meta = dict(p, streamer=rec["channel"], platform=rec["platform"], url=rec["url"])
        db.add_clip(rec["id"], t0 + p["start"], t0 + p["end"], p["score"], meta, short, wide, thumb)
        made += 1
        log.info("✅ New short: %s  (%s)", short.name, p.get("title"))
    return made


# --------------------------------------------------------------------------
def tick_processing(cfg: Config, db: DB, ai: AI, active_ids: set[int]) -> None:
    """Analyse any recording that has enough new footage."""
    win = cfg.analysis_window_minutes * 60
    for rec in db.q("SELECT * FROM recordings WHERE status IN ('recording','ended')"):
        is_live = rec["id"] in active_ids and rec["status"] == "recording"

        def pending():
            until = db.q("SELECT processed_until p FROM recordings WHERE id=?", (rec["id"],))[0]["p"]
            return [s for s in list_segments(Path(rec["folder"])) if s[1] >= until - 0.5]

        segs = pending()
        while segs and segs[-1][2] - segs[0][1] >= win:
            batch = [s for s in segs if s[2] - segs[0][1] <= win + 1] or segs[:1]
            process_window(cfg, db, ai, rec, batch, final=False)
            segs = pending()
        if is_live:
            continue
        # stream is over: analyse the rest, then build the long video
        if segs and segs[-1][2] - segs[0][1] >= cfg.clip_min_seconds * 2:
            process_window(cfg, db, ai, rec, segs, final=True)
        db.x("UPDATE recordings SET status='done', ended_at=? WHERE id=?", (time.time(), rec["id"]))
        build_long_for(cfg, db, ai, rec)


def build_long_for(cfg: Config, db: DB, ai: AI, rec) -> None:
    if not cfg.long_video.get("enabled"):
        return
    clips = db.q("SELECT * FROM clips WHERE recording_id=? AND wide_path!='' ORDER BY start", (rec["id"],))
    clips = [c for c in clips if Path(c["wide_path"]).exists()]
    if len(clips) < int(cfg.long_video.get("min_clips", 4)):
        log.info("[%s] only %d clips - skipping long video", rec["channel"], len(clips))
        return
    metas = [json.loads(c["meta"]) for c in clips]
    out_dir = Path(clips[0]["wide_path"]).parent
    out, starts = editor.build_long_video([Path(c["wide_path"]) for c in clips], out_dir / "long_video.mp4")
    meta = ai.long_video_meta(rec["channel"], metas)
    best = max(range(len(clips)), key=lambda i: clips[i]["score"])
    thumb = make_thumbnail(out, starts[best] + 2, meta.get("thumbnail_text", ""),
                           out_dir / "long_thumb.jpg", cfg.facecam_for(0), vertical=False)
    meta["chapters"] = editor.chapters_text(starts, meta.get("chapter_titles", []))
    meta.update(streamer=rec["channel"], platform=rec["platform"], url=rec["url"])
    db.x("INSERT INTO long_videos(recording_id,path,thumb_path,meta,created_at) VALUES(?,?,?,?,?)",
         (rec["id"], str(out), str(thumb or ""), json.dumps(meta, ensure_ascii=False), time.time()))
    log.info("🎬 Long video ready: %s", out)


# --------------------------------------------------------------------------
def _credit_line(meta: dict) -> str:
    return f"🎮 Gameplay: {meta.get('streamer')} - {meta.get('url')}"


_upload_lock = threading.Lock()


def tick_upload(cfg: Config, db: DB) -> None:
    if not _upload_lock.acquire(blocking=False):
        return  # another upload is running
    try:
        _tick_upload(cfg, db)
    finally:
        _upload_lock.release()


def _tick_upload(cfg: Config, db: DB) -> None:
    yc = cfg.youtube
    if not yc.get("enabled") or not youtube.is_ready():
        return
    if db.uploads_last_24h() >= int(yc.get("max_uploads_per_day", 6)):
        return
    if time.time() - db.last_upload_time() < float(yc.get("min_gap_minutes", 60)) * 60:
        return
    extra = list(yc.get("extra_tags") or [])
    # a long video waiting? upload it first (they are rarer), otherwise the best short
    lv = db.q("SELECT * FROM long_videos WHERE status='rendered' ORDER BY created_at LIMIT 1")
    if lv:
        row, table = lv[0], "long_videos"
        m = json.loads(row["meta"])
        desc = f"{m.get('description', '')}\n\n{m.get('chapters', '')}\n\n{_credit_line(m)}"
        args = (Path(row["path"]), m["title"], desc, m.get("tags", []) + extra, row["thumb_path"])
    else:
        rows = db.q("SELECT * FROM clips WHERE status='rendered' ORDER BY score DESC, created_at LIMIT 1")
        if not rows:
            return
        row, table = rows[0], "clips"
        m = json.loads(row["meta"])
        title = m["title"] if "#shorts" in m["title"].lower() else f"{m['title'][:90]} #Shorts"
        tags = " ".join("#" + h.lstrip("#").replace(" ", "") for h in m.get("hashtags", []))
        desc = f"{m.get('description', '')}\n\n{_credit_line(m)}\n\n{tags} #Shorts"
        args = (Path(row["short_path"]), title, desc, m.get("hashtags", []) + extra, row["thumb_path"])
    video, title, desc, tags, thumb = args
    if not video.exists():
        db.x(f"UPDATE {table} SET status='failed' WHERE id=?", (row["id"],))
        return
    try:
        vid = youtube.upload(video, title, desc, tags, yc.get("privacy", "public"),
                             str(yc.get("category_id", "20")), bool(yc.get("made_for_kids", False)),
                             Path(thumb) if thumb else None)
        db.x(f"UPDATE {table} SET status='uploaded', youtube_id=?, uploaded_at=? WHERE id=?",
             (vid, time.time(), row["id"]))
    except Exception as e:  # noqa: BLE001
        log.error("Upload failed: %s", e)
        if "quota" in str(e).lower():
            # pretend we uploaded so we wait for the gap before trying again
            db.x(f"UPDATE {table} SET uploaded_at=? WHERE id=?", (time.time(), row["id"]))
        else:
            db.x(f"UPDATE {table} SET status='failed' WHERE id=?", (row["id"],))


# --------------------------------------------------------------------------
def import_vod(cfg: Config, db: DB, source: str, channel: str | None = None) -> int:
    """Turn a downloaded VOD / local file into a 'finished recording' so the normal pipeline handles it."""
    import subprocess
    import sys

    vods = cfg.data / "vods"
    vods.mkdir(exist_ok=True)
    title, platform = "", "file"
    if source.startswith("http"):
        log.info("Downloading %s ...", source)
        tpl = str(vods / "%(uploader)s_%(id)s.%(ext)s")
        r = subprocess.run([sys.executable, "-m", "yt_dlp", "-f", "bv*[height<=1080]+ba/b", "-N", "8",
                            "--merge-output-format", "mp4", "-o", tpl, "--print", "after_move:filepath",
                            "--print", "before_dl:%(uploader)s|%(title)s", source],
                           capture_output=True, text=True, encoding="utf-8", errors="replace")
        lines = [ln for ln in r.stdout.splitlines() if ln.strip()]
        if r.returncode != 0 or not lines:
            raise RuntimeError(f"Download failed:\n{r.stderr[-1500:]}")
        path = Path(lines[-1])
        up, _, title = lines[0].partition("|")
        channel = channel or up
        platform = "kick" if "kick.com" in source else "twitch" if "twitch.tv" in source else "youtube"
    else:
        path = Path(source)
        if not path.exists():
            raise FileNotFoundError(source)
    channel = channel or path.stem
    folder = cfg.data / "recordings" / f"vod_{int(time.time())}_{channel}"
    folder.mkdir(parents=True, exist_ok=True)
    run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", path, "-map", "0:v:0", "-map", "0:a:0?",
         "-c", "copy", "-f", "segment", "-segment_time", "60", "-reset_timestamps", "1",
         "-segment_list", folder / "part00_segments.csv", "-segment_list_type", "csv",
         folder / "part00_seg_%05d.ts"])
    (folder / "part00_start.txt").write_text("0")
    rid = db.add_recording(platform, channel, source, title, folder)
    db.x("UPDATE recordings SET status='ended' WHERE id=?", (rid,))
    return rid
