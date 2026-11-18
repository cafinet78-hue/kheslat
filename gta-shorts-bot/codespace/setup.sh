#!/usr/bin/env bash
# Runs once when the Codespace is created: installs ffmpeg + Python packages.
set -e
cd "$(dirname "$0")/.."
echo "📦 Installing ffmpeg and fonts..."
sudo apt-get update -y && sudo apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core
echo "📦 Installing Python packages..."
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
[ -f config.yaml ] || sed 's/^whisper_model: .*/whisper_model: "base"/' config.example.yaml > config.yaml
[ -f .env ] || cp .env.example .env
mkdir -p assets data
echo "✅ Setup finished"
