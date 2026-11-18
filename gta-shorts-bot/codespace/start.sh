#!/usr/bin/env bash
# Runs every time the Codespace starts: launches the control panel on port 8080 in the background.
cd "$(dirname "$0")/.."
pkill -f "gtabot web" 2>/dev/null || true
mkdir -p data
setsid nohup python -m gtabot web --host 0.0.0.0 --port 8080 > data/panel.out 2>&1 < /dev/null &
echo "📱 Control panel starting on port 8080 (open the 'Ports' tab)"
