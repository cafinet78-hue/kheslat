"""Loads config.yaml + .env into one object with sane defaults."""
from __future__ import annotations

import copy
import os
from pathlib import Path

import yaml
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent

DEFAULTS = {
    "facecam_video": "",
    "facecam_volume": 0.0,
    "stream_volume": 1.0,
    "game_keywords": ["gta 6", "gta vi", "gta6", "grand theft auto vi", "grand theft auto 6"],
    "require_game_match": True,
    "watch": [],
    "auto_discover": {"youtube": True, "twitch": False, "kick": False,
                      "min_viewers": 300, "languages": []},
    "max_parallel_recordings": 2,
    "check_interval_minutes": 5,
    "stream_quality": "720p60,720p,best",
    "analysis_window_minutes": 20,
    "clips_per_window": 2,
    "max_clips_per_stream": 5,
    "clip_min_seconds": 15,
    "clip_max_seconds": 55,
    "layout": {"top_ratio": 0.6, "gameplay_zoom": 1.0},
    "captions": True,
    "whisper_model": "small",
    "show_credit": True,
    "claude_model": "claude-opus-5-5",
    "content_language": "English",
    "channel_style": "High energy GTA 6 clips",
    "long_video": {"enabled": True, "min_clips": 4, "facecam_corner": True},
    "youtube": {"enabled": True, "privacy": "public", "max_uploads_per_day": 6,
                "min_gap_minutes": 60, "category_id": "20", "made_for_kids": False,
                "extra_tags": ["GTA 6", "GTA VI", "shorts"]},
    "data_dir": "data",
    "keep_raw_recordings": False,
}


class Config(dict):
    """dict with attribute access for top-level keys."""

    def __getattr__(self, item):
        try:
            return self[item]
        except KeyError as e:
            raise AttributeError(item) from e

    @property
    def data(self) -> Path:
        p = Path(self["data_dir"])
        if not p.is_absolute():
            p = ROOT / p
        p.mkdir(parents=True, exist_ok=True)
        return p


def _merge(base: dict, over: dict) -> dict:
    out = copy.deepcopy(base)
    for k, v in (over or {}).items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _merge(out[k], v)
        else:
            out[k] = v
    return out


def load_config(path: str | None = None) -> Config:
    load_dotenv(ROOT / ".env")
    cfg_path = Path(path) if path else ROOT / "config.yaml"
    user = {}
    if cfg_path.exists():
        user = yaml.safe_load(cfg_path.read_text(encoding="utf-8")) or {}
    cfg = Config(_merge(DEFAULTS, user))
    cfg["_path"] = str(cfg_path)
    return cfg


def env(name: str) -> str:
    return os.environ.get(name, "").strip()
