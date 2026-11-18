"""Speech-to-text with faster-whisper (word timestamps for captions)."""
from __future__ import annotations

import logging
import tempfile
import threading
from pathlib import Path

from .media import extract_wav

log = logging.getLogger("whisper")
_model = None
_failed = False
_lock = threading.Lock()


def _load(name: str):
    global _model
    if _model is None:
        from faster_whisper import WhisperModel
        try:
            import ctranslate2
            device = "cuda" if ctranslate2.get_cuda_device_count() > 0 else "cpu"
        except Exception:  # noqa: BLE001
            device = "cpu"
        log.info("Loading Whisper model '%s' on %s (first time downloads it)...", name, device)
        _model = WhisperModel(name, device=device, compute_type="float16" if device == "cuda" else "int8")
    return _model


def transcribe(path: Path, start: float, dur: float, model_name: str = "small") -> list[dict]:
    """Returns words [{start, end, word}] with times relative to `path` (not to `start`)."""
    global _failed
    if _failed:
        return []
    try:
        with _lock:
            model = _load(model_name)
            with tempfile.TemporaryDirectory() as td:
                wav = extract_wav(path, start, dur, Path(td) / "a.wav")
                segs, _ = model.transcribe(str(wav), word_timestamps=True, vad_filter=True, beam_size=1)
                words = []
                for s in segs:
                    for w in s.words or []:
                        words.append({"start": start + w.start, "end": start + w.end,
                                      "word": w.word.strip()})
                return words
    except Exception as e:  # noqa: BLE001
        log.warning("Transcription unavailable (%s) - continuing without captions", e)
        if _model is None:
            _failed = True  # model could not load; don't retry every clip
        return []


def words_text(words: list[dict]) -> str:
    return " ".join(w["word"] for w in words)
