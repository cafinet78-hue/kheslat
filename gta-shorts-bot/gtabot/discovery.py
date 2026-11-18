"""Finds live GTA VI streams on Kick, Twitch and YouTube."""
from __future__ import annotations

import json
import logging
import subprocess
import sys
import time
from dataclasses import dataclass

import requests

from .config import Config, env

log = logging.getLogger("discovery")


@dataclass
class LiveStream:
    platform: str
    channel: str
    url: str
    title: str = ""
    category: str = ""
    viewers: int = 0

    @property
    def key(self) -> str:
        return f"{self.platform}:{self.channel.lower()}"


def channel_url(platform: str, channel: str) -> str:
    platform = platform.lower()
    if platform == "kick":
        return f"https://kick.com/{channel}"
    if platform == "twitch":
        return f"https://www.twitch.tv/{channel}"
    if platform == "youtube":
        if channel.startswith("http"):
            return channel
        handle = channel if channel.startswith("@") else f"@{channel}"
        return f"https://www.youtube.com/{handle}/live"
    raise ValueError(f"unknown platform {platform}")


def matches_game(cfg: Config, *texts: str) -> bool:
    blob = " ".join(t or "" for t in texts).lower()
    return any(k.lower() in blob for k in cfg.game_keywords)


def probe(url: str, timeout: int = 60) -> dict | None:
    """Ask streamlink whether a URL is live. Returns metadata dict or None."""
    try:
        out = subprocess.run([sys.executable, "-m", "streamlink", "--json", url],
                             capture_output=True, text=True, timeout=timeout,
                             encoding="utf-8", errors="replace")
        data = json.loads(out.stdout or "{}")
    except Exception as e:  # noqa: BLE001
        log.debug("probe failed for %s: %s", url, e)
        return None
    if data.get("error") or not data.get("streams"):
        return None
    return data.get("metadata") or {}


# --------------------------------------------------------------------------
# Watched channels
# --------------------------------------------------------------------------
def check_watched(cfg: Config) -> list[LiveStream]:
    found = []
    for item in cfg.watch or []:
        platform, channel = item["platform"].lower(), str(item["channel"]).strip()
        url = channel_url(platform, channel)
        meta = probe(url)
        if meta is None:
            continue
        title, category = meta.get("title") or "", meta.get("category") or ""
        if cfg.require_game_match and not matches_game(cfg, title, category):
            log.info("%s is live but not playing GTA VI (%s / %s)", channel, category, title[:60])
            continue
        found.append(LiveStream(platform, channel, url, title, category))
    return found


# --------------------------------------------------------------------------
# Auto discovery
# --------------------------------------------------------------------------
def discover_youtube(cfg: Config) -> list[LiveStream]:
    """Uses yt-dlp on a YouTube search with the 'Live' filter (no API quota needed)."""
    query = "GTA 6 live"
    url = f"https://www.youtube.com/results?search_query={query.replace(' ', '+')}&sp=EgJAAQ%253D%253D"
    try:
        out = subprocess.run([sys.executable, "-m", "yt_dlp", "--flat-playlist", "-J",
                              "--playlist-end", "20", url],
                             capture_output=True, text=True, timeout=120,
                             encoding="utf-8", errors="replace")
        data = json.loads(out.stdout or "{}")
    except Exception as e:  # noqa: BLE001
        log.warning("YouTube discovery failed: %s", e)
        return []
    res = []
    for e in data.get("entries") or []:
        title = e.get("title") or ""
        if e.get("live_status") not in (None, "is_live"):
            continue
        if not matches_game(cfg, title):
            continue
        viewers = int(e.get("concurrent_view_count") or 0)
        if viewers and viewers < cfg.auto_discover.get("min_viewers", 0):
            continue
        chan = e.get("channel") or e.get("uploader") or e.get("channel_id") or e["id"]
        res.append(LiveStream("youtube", chan, f"https://www.youtube.com/watch?v={e['id']}",
                              title, "GTA VI", viewers))
    return res


_twitch_token: dict = {}


def _twitch_headers() -> dict | None:
    cid, secret = env("TWITCH_CLIENT_ID"), env("TWITCH_CLIENT_SECRET")
    if not cid or not secret:
        return None
    if _twitch_token.get("exp", 0) < time.time():
        r = requests.post("https://id.twitch.tv/oauth2/token", timeout=20, data={
            "client_id": cid, "client_secret": secret, "grant_type": "client_credentials"})
        r.raise_for_status()
        j = r.json()
        _twitch_token.update(tok=j["access_token"], exp=time.time() + j["expires_in"] - 60)
    return {"Client-Id": cid, "Authorization": f"Bearer {_twitch_token['tok']}"}


def discover_twitch(cfg: Config) -> list[LiveStream]:
    h = _twitch_headers()
    if not h:
        log.warning("Twitch discovery enabled but TWITCH_CLIENT_ID/SECRET missing in .env")
        return []
    try:
        g = requests.get("https://api.twitch.tv/helix/search/categories",
                         params={"query": "Grand Theft Auto VI"}, headers=h, timeout=20).json()
        games = [c for c in g.get("data", []) if matches_game(cfg, c["name"])]
        if not games:
            return []
        params = [("game_id", games[0]["id"]), ("first", "20")]
        for lang in cfg.auto_discover.get("languages") or []:
            params.append(("language", lang))
        s = requests.get("https://api.twitch.tv/helix/streams", params=params, headers=h, timeout=20).json()
    except Exception as e:  # noqa: BLE001
        log.warning("Twitch discovery failed: %s", e)
        return []
    return [LiveStream("twitch", st["user_login"], f"https://www.twitch.tv/{st['user_login']}",
                       st.get("title", ""), st.get("game_name", ""), st.get("viewer_count", 0))
            for st in s.get("data", [])
            if st.get("viewer_count", 0) >= cfg.auto_discover.get("min_viewers", 0)]


_kick_token: dict = {}


def discover_kick(cfg: Config) -> list[LiveStream]:
    cid, secret = env("KICK_CLIENT_ID"), env("KICK_CLIENT_SECRET")
    if not cid or not secret:
        log.warning("Kick discovery enabled but KICK_CLIENT_ID/SECRET missing in .env")
        return []
    try:
        if _kick_token.get("exp", 0) < time.time():
            r = requests.post("https://id.kick.com/oauth/token", timeout=20, data={
                "client_id": cid, "client_secret": secret, "grant_type": "client_credentials"})
            r.raise_for_status()
            j = r.json()
            _kick_token.update(tok=j["access_token"], exp=time.time() + int(j.get("expires_in", 3600)) - 60)
        h = {"Authorization": f"Bearer {_kick_token['tok']}"}
        cat_id = cfg.auto_discover.get("kick_category_id")
        if not cat_id:
            c = requests.get("https://api.kick.com/public/v1/categories",
                             params={"q": "Grand Theft Auto VI"}, headers=h, timeout=20).json()
            cats = [x for x in c.get("data", []) if matches_game(cfg, x.get("name", ""))]
            if not cats:
                return []
            cat_id = cats[0]["id"]
        params = {"category_id": cat_id, "sort": "viewer_count", "limit": 20}
        langs = cfg.auto_discover.get("languages") or []
        if langs:
            params["language"] = langs[0]
        s = requests.get("https://api.kick.com/public/v1/livestreams", params=params,
                         headers=h, timeout=20).json()
    except Exception as e:  # noqa: BLE001
        log.warning("Kick discovery failed: %s", e)
        return []
    out = []
    for st in s.get("data", []):
        slug = st.get("slug") or (st.get("channel") or {}).get("slug")
        if not slug or st.get("viewer_count", 0) < cfg.auto_discover.get("min_viewers", 0):
            continue
        out.append(LiveStream("kick", slug, f"https://kick.com/{slug}", st.get("stream_title", ""),
                              (st.get("category") or {}).get("name", ""), st.get("viewer_count", 0)))
    return out


def find_live_streams(cfg: Config) -> list[LiveStream]:
    streams: dict[str, LiveStream] = {}
    for s in check_watched(cfg):
        streams[s.key] = s
    ad = cfg.auto_discover or {}
    discovered: list[LiveStream] = []
    if ad.get("youtube"):
        discovered += discover_youtube(cfg)
    if ad.get("twitch"):
        discovered += discover_twitch(cfg)
    if ad.get("kick"):
        discovered += discover_kick(cfg)
    discovered.sort(key=lambda s: s.viewers, reverse=True)
    for s in discovered:
        streams.setdefault(s.key, s)
    # watched channels first, then most-viewed discovered streams
    return list(streams.values())
