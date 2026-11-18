"""Small ffmpeg/ffprobe helpers."""
from __future__ import annotations

import json
import logging
import shutil
import subprocess
from pathlib import Path

import numpy as np

log = logging.getLogger("media")


def run(cmd: list, cwd: Path | None = None) -> None:
    cmd = [str(c) for c in cmd]
    r = subprocess.run(cmd, cwd=str(cwd) if cwd else None, capture_output=True,
                       text=True, encoding="utf-8", errors="replace")
    if r.returncode != 0:
        raise RuntimeError(f"ffmpeg failed: {' '.join(cmd[:6])}...\n{r.stderr[-2000:]}")


def has_ffmpeg() -> bool:
    return bool(shutil.which("ffmpeg") and shutil.which("ffprobe"))


def probe(path: Path) -> dict:
    r = subprocess.run(["ffprobe", "-v", "error", "-print_format", "json", "-show_format",
                        "-show_streams", str(path)], capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    return json.loads(r.stdout or "{}")


def duration(path: Path) -> float:
    try:
        return float(probe(path)["format"]["duration"])
    except Exception:  # noqa: BLE001
        return 0.0


def has_audio(path: Path) -> bool:
    return any(s.get("codec_type") == "audio" for s in probe(path).get("streams", []))


def concat(files: list[Path], out: Path) -> Path:
    lst = out.with_suffix(".txt")
    lst.write_text("".join(f"file '{Path(f).resolve().as_posix()}'\n" for f in files), encoding="utf-8")
    run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-f", "concat", "-safe", "0",
         "-i", lst, "-c", "copy", out])
    lst.unlink(missing_ok=True)
    return out


def loudness_per_second(path: Path) -> np.ndarray:
    """RMS loudness (dB) for each second of audio."""
    sr = 8000
    r = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-vn", "-ac", "1", "-ar", str(sr),
                        "-f", "s16le", "-"], capture_output=True)
    a = np.frombuffer(r.stdout, dtype=np.int16).astype(np.float32)
    if a.size < sr:
        return np.zeros(max(1, int(duration(path))))
    n = a.size // sr
    a = a[: n * sr].reshape(n, sr)
    rms = np.sqrt((a ** 2).mean(axis=1)) + 1e-6
    return 20 * np.log10(rms / 32768.0)


def frame(path: Path, t: float, out: Path, width: int = 640) -> Path | None:
    try:
        run(["ffmpeg", "-y", "-v", "error", "-ss", f"{max(0, t):.2f}", "-i", path, "-frames:v", "1",
             "-vf", f"scale={width}:-2", "-q:v", "3", out])
        return out if out.exists() else None
    except RuntimeError:
        return None


def extract_wav(path: Path, start: float, dur: float, out: Path) -> Path:
    run(["ffmpeg", "-y", "-v", "error", "-ss", f"{start:.2f}", "-t", f"{dur:.2f}", "-i", path,
         "-vn", "-ac", "1", "-ar", "16000", out])
    return out
