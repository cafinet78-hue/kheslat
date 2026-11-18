# GTA VI Shorts Bot: notes for Claude Code

The user speaks Persian. Reply in Persian unless they write in English.

## What it is
A Python app (`gtabot/`) that records GTA VI live streams, detects highlights, edits vertical Shorts
(gameplay top / user's facecam bottom) plus 16:9 compilations, and uploads them to YouTube.

## Run
- `venv\Scripts\python -m gtabot doctor`: checks dependencies and config (start here when debugging)
- `... web`: phone control panel (port 8080; Codespaces config in `.devcontainer/gta-shorts-bot`). `... run`: main loop. `... process <url|file>`: one-off test on a VOD. `... status`: list outputs.
- Logs: `data/bot.log`. State: `data/bot.db` (SQLite: recordings, clips, long_videos).

## Flow / files
- `discovery.py`: watched channels are checked via `streamlink --json`; auto-discovery uses yt-dlp
  (YouTube live search), the Twitch Helix API and the Kick public API.
- `recorder.py`: `streamlink --stdout | ffmpeg -f segment` writes 60 s `.ts` segments plus a CSV of
  segment times; chat goes to `chat.jsonl` (Twitch IRC, Kick Pusher websocket).
- `pipeline.py`: every `analysis_window_minutes`, concat segments, then score loudness + chat spikes
  and pick candidates. Whisper transcribes them, Claude (`ai.py`, structured output) picks the clips and
  writes the metadata. `editor.py` renders with ffmpeg and `thumbnail.py` (Pillow) makes covers.
  When a stream ends it builds the long video. `tick_upload` uploads one video per call, within
  the quota and gap limits.
- `youtube.py`: OAuth (client_secret.json -> token.json), resumable upload, thumbnails.set.

## Rules
- Never commit `.env`, `client_secret.json`, `token.json` or `config.yaml`.
- Keep the streamer credit (copyright).
