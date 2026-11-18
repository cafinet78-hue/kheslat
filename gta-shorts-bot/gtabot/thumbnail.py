"""Thumbnails (cover images) with Pillow: gameplay frame + your face + big bold text."""
from __future__ import annotations

import logging
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFont, ImageOps

from .media import duration, frame

log = logging.getLogger("thumb")

FONT_CANDIDATES = [
    "C:/Windows/Fonts/impact.ttf", "C:/Windows/Fonts/ariblk.ttf", "C:/Windows/Fonts/arialbd.ttf",
    "/System/Library/Fonts/Supplemental/Impact.ttf", "/Library/Fonts/Arial Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf",
]


def _font(size: int) -> ImageFont.FreeTypeFont:
    for f in FONT_CANDIDATES:
        if Path(f).exists():
            return ImageFont.truetype(f, size)
    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        return ImageFont.load_default()


def _wrap(draw, text, font, max_w):
    words, lines, cur = text.split(), [], ""
    for w in words:
        test = f"{cur} {w}".strip()
        if draw.textlength(test, font=font) <= max_w or not cur:
            cur = test
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def _draw_text(img: Image.Image, text: str, box_w: int, y: int, size: int, x_center: int) -> None:
    d = ImageDraw.Draw(img)
    size_now = size
    while True:
        font = _font(size_now)
        lines = _wrap(d, text.upper(), font, box_w)
        if len(lines) <= 3 or size_now < 40:
            break
        size_now -= 8
    colors = [(255, 230, 0), (255, 255, 255)]
    for i, line in enumerate(lines):
        w = d.textlength(line, font=font)
        d.text((x_center - w / 2, y + i * size_now * 1.05), line, font=font,
               fill=colors[i % 2], stroke_width=max(4, size_now // 12), stroke_fill=(0, 0, 0))


def make_thumbnail(src_video: Path, t: float, text: str, out: Path, facecam: str | None,
                   vertical: bool = False) -> Path | None:
    tw, th = (1080, 1920) if vertical else (1280, 720)
    try:
        with tempfile.TemporaryDirectory() as td:
            fp = frame(src_video, t, Path(td) / "g.jpg", width=1920)
            if not fp:
                return None
            game = ImageOps.fit(Image.open(fp).convert("RGB"), (tw, th))
            game = ImageEnhance.Contrast(ImageEnhance.Color(game).enhance(1.35)).enhance(1.15)
            # dark gradient for text readability
            grad = Image.new("L", (1, th))
            for yy in range(th):
                grad.putpixel((0, yy), int(170 * max(0, 1 - yy / (th * 0.55))))
            shade = Image.new("RGB", (tw, th), (0, 0, 0))
            game.paste(shade, (0, 0), grad.resize((tw, th)))
            if facecam and Path(facecam).exists():
                ft = (duration(Path(facecam)) or 2) * 0.37
                fp2 = frame(Path(facecam), ft, Path(td) / "f.jpg", width=1280)
                if fp2:
                    fw, fh = (int(tw * 0.9), int(th * 0.33)) if vertical else (int(tw * 0.38), int(th * 0.62))
                    face = ImageOps.fit(Image.open(fp2).convert("RGB"), (fw, fh))
                    face = ImageOps.expand(face, border=8, fill=(255, 230, 0))
                    pos = ((tw - face.width) // 2, th - face.height - 60) if vertical else \
                          (tw - face.width - 25, th - face.height - 25)
                    game.paste(face, pos)
            if vertical:
                _draw_text(game, text, tw - 100, 140, 130, tw // 2)
            else:
                _draw_text(game, text, int(tw * 0.58), 40, 110, int(tw * 0.31))
            game.save(out, "JPEG", quality=92)
            return out
    except Exception as e:  # noqa: BLE001
        log.warning("Thumbnail failed: %s", e)
        return None
