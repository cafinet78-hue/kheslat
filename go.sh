#!/usr/bin/env bash
# One command to install (if needed) and start the GTA 6 Shorts Bot control panel:  bash go.sh
cd "$(dirname "$0")"
python -c "import streamlink, faster_whisper, googleapiclient" 2>/dev/null && command -v ffmpeg >/dev/null \
  || bash gta-shorts-bot/codespace/setup.sh
cd gta-shorts-bot
pkill -f "gtabot web" 2>/dev/null
echo ""
echo "============================================================"
echo "  ✅ Panel is starting. Go to PORTS tab -> 8080 -> 🌐"
echo "  Keep this terminal open."
echo "============================================================"
python -m gtabot web --host 0.0.0.0 --port 8080
