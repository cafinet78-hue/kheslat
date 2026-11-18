"""Claude: picks the best moments and writes titles / descriptions / thumbnail text."""
from __future__ import annotations

import base64
import random
import json
import logging
from pathlib import Path

from pydantic import BaseModel, Field

from .config import Config, env

log = logging.getLogger("claude")


# used only when no ANTHROPIC_API_KEY is set
FALLBACK_TITLES = [
    "{s} did NOT expect this in GTA 6 😳", "GTA 6 is actually insane 🤯 ({s})",
    "This GTA 6 moment broke {s} 😂", "{s} vs the cops in GTA 6 🚔",
    "Nobody talks about this in GTA 6... 👀", "{s}'s craziest GTA 6 moment 🔥",
    "GTA 6 physics are unreal 😂 ({s})", "Wait for it... GTA 6 edition 💀",
]
FALLBACK_HOOKS = ["WAIT FOR IT...", "HE DIDN'T EXPECT THIS", "GTA 6 IS INSANE", "WATCH TILL THE END",
                  "NO WAY THIS HAPPENED"]


class ClipChoice(BaseModel):
    candidate_id: int = Field(description="id of the candidate this clip comes from")
    start: float = Field(description="clip start in seconds (window timeline)")
    end: float = Field(description="clip end in seconds (window timeline)")
    virality: int = Field(description="1-10, how likely this is to go viral as a Short")
    title: str = Field(description="YouTube Shorts title, <= 80 chars, catchy, no clickbait lies")
    hook_text: str = Field(description="2-6 word on-screen hook shown in the first seconds")
    description: str = Field(description="2-3 sentence YouTube description")
    hashtags: list[str] = Field(description="5-10 hashtags without the # sign")
    thumbnail_text: str = Field(description="2-4 punchy words for the thumbnail")


class ClipSelection(BaseModel):
    clips: list[ClipChoice]


class LongVideoMeta(BaseModel):
    title: str = Field(description="YouTube title for the compilation, <= 90 chars")
    description: str = Field(description="description WITHOUT chapters (they are added automatically)")
    tags: list[str]
    thumbnail_text: str = Field(description="2-4 punchy words for the thumbnail")
    chapter_titles: list[str] = Field(description="one short chapter title per clip, same order")


SYSTEM = """You are the editor of a YouTube channel that posts GTA 6 (Grand Theft Auto VI) Shorts \
cut from live streams, with the channel owner's reaction cam under the gameplay.
Channel style: {style}
Write all titles, descriptions and on-screen text in {lang}.
Pick moments that work WITHOUT context: funny fails, insane stunts, chases, shocking reactions, \
beautiful scenery reveals, glitches, wins. Skip loading screens, menus, idle talking, sponsor reads \
and anything sexual, hateful or showing private info. Each clip must start right before the action \
(hook in the first 2 seconds) and end on the payoff. Never invent things that did not happen."""


class AI:
    def __init__(self, cfg: Config):
        self.cfg = cfg
        self.enabled = bool(env("ANTHROPIC_API_KEY"))
        self.client = None
        if self.enabled:
            import anthropic
            self.client = anthropic.Anthropic()
        else:
            log.warning("ANTHROPIC_API_KEY not set - using simple automatic titles instead of Claude")

    def _system(self) -> str:
        return SYSTEM.format(style=self.cfg.channel_style, lang=self.cfg.content_language)

    def _parse(self, content: list, schema):
        """Structured-output request with server-side refusal fallback."""
        resp = self.client.beta.messages.parse(
            model=self.cfg.claude_model,
            max_tokens=16000,
            system=self._system(),
            messages=[{"role": "user", "content": content}],
            output_format=schema,
            output_config={"effort": "medium"},
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        )
        if resp.stop_reason == "refusal" or resp.parsed_output is None:
            raise RuntimeError(f"Claude returned no result (stop_reason={resp.stop_reason})")
        return resp.parsed_output

    # ------------------------------------------------------------------
    def select_clips(self, candidates: list[dict], streamer: str, stream_title: str,
                     max_clips: int) -> list[dict]:
        """candidates: [{id,start,end,score,transcript,chat:[...],frames:[Path]}]"""
        if not candidates or max_clips <= 0:
            return []
        if not self.enabled:
            return self._fallback(candidates, streamer, max_clips)
        cmin, cmax = self.cfg.clip_min_seconds, self.cfg.clip_max_seconds
        content: list = [{"type": "text", "text": (
            f"Streamer: {streamer}\nStream title: {stream_title}\n"
            f"Below are {len(candidates)} candidate moments detected by loudness and chat spikes. "
            f"Choose at most {max_clips} that would make great Shorts (choose fewer or none if they are boring). "
            f"Each clip must be {cmin}-{cmax} seconds and stay inside its candidate's [start,end] range.")}]
        for c in candidates:
            content.append({"type": "text", "text": json.dumps({
                "candidate_id": c["id"], "start": round(c["start"], 1), "end": round(c["end"], 1),
                "excitement_score": round(c["score"], 2),
                "louder_than_usual_db": c.get("loud_gain_db"), "chat_activity_x": c.get("chat_ratio"),
                "speech": c.get("transcript", "")[:1500],
                "chat_messages": c.get("chat", [])[:40]}, ensure_ascii=False)})
            for fp in c.get("frames", [])[:3]:
                content.append({"type": "image", "source": {
                    "type": "base64", "media_type": "image/jpeg",
                    "data": base64.b64encode(Path(fp).read_bytes()).decode()}})
        try:
            sel = self._parse(content, ClipSelection)
        except Exception as e:  # noqa: BLE001
            log.warning("Claude selection failed (%s) - using fallback", e)
            return self._fallback(candidates, streamer, max_clips)
        by_id = {c["id"]: c for c in candidates}
        out = []
        for ch in sorted(sel.clips, key=lambda x: -x.virality)[:max_clips]:
            c = by_id.get(ch.candidate_id)
            if not c:
                continue
            s = max(c["start"], min(ch.start, c["end"] - cmin))
            e = min(c["end"], max(ch.end, s + cmin))
            e = min(e, s + cmax)
            d = ch.model_dump()
            d.update(start=s, end=e, score=c["score"] + ch.virality)
            out.append(d)
        return out

    def _fallback(self, candidates, streamer, max_clips):
        out = []
        cmax = self.cfg.clip_max_seconds
        good = [c for c in candidates if c.get("hype", c["score"] >= 1.0)]  # only clear spikes
        for c in sorted(good, key=lambda x: -x["score"])[:max_clips]:
            s = max(c["start"], c.get("peak", c["start"]) - cmax * 0.6)
            e = min(c["end"], s + cmax)
            out.append({"candidate_id": c["id"], "start": s, "end": e,
                        "virality": 5, "score": c["score"],
                        "title": random.choice(FALLBACK_TITLES).format(s=streamer),
                        "hook_text": random.choice(FALLBACK_HOOKS),
                        "description": f"Crazy GTA 6 moment from {streamer}'s stream.",
                        "hashtags": ["gta6", "gtavi", "gta", "gaming", "shorts", "funny"],
                        "thumbnail_text": "GTA 6 IS INSANE"})
        return out

    # ------------------------------------------------------------------
    def long_video_meta(self, streamer: str, clips: list[dict]) -> dict:
        if not self.enabled:
            return {"title": f"GTA 6 - Best Moments of {streamer}'s Stream",
                    "description": f"The craziest GTA 6 moments from {streamer}.",
                    "tags": ["GTA 6", "GTA VI", streamer, "best moments"],
                    "thumbnail_text": "BEST MOMENTS",
                    "chapter_titles": [c.get("title", f"Moment {i+1}") for i, c in enumerate(clips)]}
        listing = "\n".join(f"{i+1}. {c.get('title')} - {c.get('description')}" for i, c in enumerate(clips))
        try:
            meta = self._parse([{"type": "text", "text": (
                f"Write metadata for a horizontal YouTube compilation video of the best GTA 6 moments "
                f"from {streamer}'s live stream. The clips, in order:\n{listing}")}], LongVideoMeta)
            return meta.model_dump()
        except Exception as e:  # noqa: BLE001
            log.warning("Claude long-video metadata failed (%s)", e)
            self.enabled, res = False, None
            try:
                res = self.long_video_meta(streamer, clips)
            finally:
                self.enabled = True
            return res
