"""Video editing with ffmpeg: vertical Shorts (gameplay top / facecam bottom) and long compilations."""
from __future__ import annotations

import logging
from pathlib import Path

from .config import Config
from .media import concat, duration, has_audio, run

log = logging.getLogger("editor")

W, H = 1080, 1920
ENC = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-r", "30",
       "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2", "-movflags", "+faststart"]


def _esc(text: str) -> str:
    return text.replace("\\", "/").replace("{", "(").replace("}", ")").replace("\n", " ")


def _ts(t: float) -> str:
    t = max(0.0, t)
    h, m = int(t // 3600), int(t % 3600 // 60)
    return f"{h}:{m:02d}:{t % 60:05.2f}"


def build_ass(path: Path, words: list[dict], clip_start: float, clip_dur: float, hook: str,
              credit: str, top_h: int, captions: bool, play_res=(W, H)) -> Path:
    pw, ph = play_res
    lines = [
        "[Script Info]", "ScriptType: v4.00+", f"PlayResX: {pw}", f"PlayResY: {ph}",
        "WrapStyle: 0", "ScaledBorderAndShadow: yes", "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, "
        "Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, "
        "Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
        "Style: Cap,Arial,78,&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,7,3,5,40,40,0,1",
        "Style: Hook,Arial,104,&H0000F0FF,&H00FFFFFF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,8,4,8,40,40,0,1",
        "Style: Credit,Arial,34,&H40FFFFFF,&H00FFFFFF,&H80000000,&H00000000,-1,0,0,0,100,100,0,0,1,3,0,3,20,20,0,1",
        "", "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ]
    if hook:
        lines.append(f"Dialogue: 2,{_ts(0)},{_ts(min(3.5, clip_dur))},Hook,,0,0,0,,"
                     f"{{\\pos({pw // 2},{int(ph * 0.06)})\\fad(150,300)}}{_esc(hook.upper())}")
    if credit:
        lines.append(f"Dialogue: 1,{_ts(0)},{_ts(clip_dur)},Credit,,0,0,0,,"
                     f"{{\\pos({pw - 20},{top_h - 15})}}{_esc(credit)}")
    if captions and words:
        chunk: list[dict] = []
        chunks = []
        for w in words:
            if w["end"] < clip_start or w["start"] > clip_start + clip_dur:
                continue
            if chunk and (len(chunk) >= 3 or w["start"] - chunk[-1]["end"] > 0.6):
                chunks.append(chunk)
                chunk = []
            chunk.append(w)
        if chunk:
            chunks.append(chunk)
        for i, ch in enumerate(chunks):
            s = ch[0]["start"] - clip_start
            e = ch[-1]["end"] - clip_start
            if i + 1 < len(chunks):
                e = min(max(e, s + 0.3), chunks[i + 1][0]["start"] - clip_start)
            text = " ".join(w["word"] for w in ch).upper()
            color = "\\c&H0000F0FF&" if i % 2 else ""
            lines.append(f"Dialogue: 0,{_ts(s)},{_ts(e)},Cap,,0,0,0,,"
                         f"{{\\pos({pw // 2},{top_h})\\fscx90\\fscy90\\t(0,90,\\fscx100\\fscy100){color}}}"
                         f"{_esc(text)}")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return path


def render_short(cfg: Config, src: Path, start: float, end: float, out: Path, words: list[dict],
                 hook: str, credit: str, facecam_offset: float = 0.0) -> Path:
    dur = end - start
    top_h = int(H * float(cfg.layout.get("top_ratio", 0.6))) // 2 * 2
    bot_h = H - top_h
    zoom = float(cfg.layout.get("gameplay_zoom", 1.0))
    ass = build_ass(out.with_suffix(".ass"), words, start, dur, hook, credit, top_h, cfg.captions)
    face = Path(cfg.facecam_video) if cfg.facecam_video else None
    use_face = bool(face and face.exists())
    inputs = ["-ss", f"{start:.2f}", "-t", f"{dur:.2f}", "-i", str(Path(src).resolve())]
    if use_face:
        fdur = duration(face) or 1
        inputs += ["-stream_loop", "-1", "-ss", f"{facecam_offset % fdur:.2f}", "-i", str(face.resolve())]
        vf = (f"[0:v]scale=-2:{int(top_h * zoom) // 2 * 2},crop={W}:{top_h},setsar=1[top];"
              f"[1:v]scale={W}:{bot_h}:force_original_aspect_ratio=increase,crop={W}:{bot_h},setsar=1[bot];"
              f"[top][bot]vstack=inputs=2,fps=30,subtitles={ass.name}[v]")
    else:  # no facecam: blurred background + centered gameplay
        vf = (f"[0:v]split[a][b];[a]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},"
              f"boxblur=20:5[bg];[b]scale={W}:-2[fg];[bg][fg]overlay=0:(H-h)/2,fps=30,"
              f"subtitles={ass.name}[v]")
    sv, fv = float(cfg.stream_volume), float(cfg.facecam_volume)
    if use_face and fv > 0 and has_audio(face):
        af = f";[0:a]volume={sv}[a0];[1:a]volume={fv}[a1];[a0][a1]amix=inputs=2:duration=first[a]"
    else:
        af = f";[0:a]volume={sv}[a]"
    cmd = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", *inputs,
           "-filter_complex", vf + af, "-map", "[v]", "-map", "[a]", "-t", f"{dur:.2f}", *ENC, out.name]
    run(cmd, cwd=out.parent)
    return out


def render_wide(cfg: Config, src: Path, start: float, end: float, out: Path, credit: str,
                facecam_offset: float = 0.0) -> Path:
    """16:9 version of a clip (for the long compilation), facecam in the corner."""
    dur = end - start
    ass = build_ass(out.with_suffix(".ass"), [], start, dur, "", credit, 1080, False, (1920, 1080))
    face = Path(cfg.facecam_video) if cfg.facecam_video else None
    use_face = bool(face and face.exists() and cfg.long_video.get("facecam_corner", True))
    inputs = ["-ss", f"{start:.2f}", "-t", f"{dur:.2f}", "-i", str(Path(src).resolve())]
    base = ("[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,"
            "pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1[g]")
    if use_face:
        fdur = duration(face) or 1
        inputs += ["-stream_loop", "-1", "-ss", f"{facecam_offset % fdur:.2f}", "-i", str(face.resolve())]
        vf = (base + ";[1:v]scale=480:270:force_original_aspect_ratio=increase,crop=480:270,"
              "pad=488:278:4:4:white[f];[g][f]overlay=W-w-30:H-h-30,fps=30,"
              f"subtitles={ass.name}[v]")
    else:
        vf = base + f";[g]fps=30,subtitles={ass.name}[v]"
    af = f";[0:a]volume={float(cfg.stream_volume)}[a]"
    run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", *inputs, "-filter_complex", vf + af,
         "-map", "[v]", "-map", "[a]", "-t", f"{dur:.2f}", *ENC, out.name], cwd=out.parent)
    return out


def build_long_video(parts: list[Path], out: Path) -> tuple[Path, list[float]]:
    """Concatenate wide clips. Returns the output and chapter start times."""
    starts, t = [], 0.0
    for p in parts:
        starts.append(t)
        t += duration(p)
    concat(parts, out)
    return out, starts


def chapters_text(starts: list[float], titles: list[str]) -> str:
    rows = []
    for i, s in enumerate(starts):
        s = 0 if i == 0 else s
        title = titles[i] if i < len(titles) else f"Moment {i + 1}"
        rows.append(f"{int(s // 60):d}:{int(s % 60):02d} {title}")
    return "\n".join(rows)
