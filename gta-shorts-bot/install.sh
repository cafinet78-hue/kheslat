#!/usr/bin/env bash
# macOS / Linux installer
set -e
cd "$(dirname "$0")"
if ! command -v ffmpeg >/dev/null; then
  if command -v brew >/dev/null; then brew install ffmpeg
  elif command -v apt-get >/dev/null; then sudo apt-get update && sudo apt-get install -y ffmpeg
  else echo "Please install ffmpeg first"; exit 1; fi
fi
python3 -m venv venv
venv/bin/python -m pip install --upgrade pip
venv/bin/python -m pip install -r requirements.txt
venv/bin/python -m gtabot setup
venv/bin/python -m gtabot doctor
echo "Done. Next: venv/bin/python -m gtabot youtube-login  then  venv/bin/python -m gtabot run"
