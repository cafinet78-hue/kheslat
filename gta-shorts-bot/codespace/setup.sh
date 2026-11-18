#!/usr/bin/env bash
# Runs once when the Codespace is created: installs ffmpeg + Python packages.
set -e
cd "$(dirname "$0")/.."
echo "📦 Installing ffmpeg and fonts..."
sudo apt-get update -y && sudo apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core
echo "📦 Installing Python packages..."
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
echo "📦 Installing Claude Code (for Claude Pro subscription)..."
command -v claude >/dev/null || [ -x "$HOME/.local/bin/claude" ] || (curl -fsSL https://claude.ai/install.sh | bash) || echo "⚠️ Claude Code install failed (optional)"
[ -f config.yaml ] || sed 's/^whisper_model: .*/whisper_model: "base"/' config.example.yaml > config.yaml
[ -f .env ] || cp .env.example .env
mkdir -p assets data
echo "✅ Setup finished"
