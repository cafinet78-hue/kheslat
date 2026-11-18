#!/usr/bin/env bash
# Connect your Claude Pro/Max subscription to the bot:  bash claude.sh
cd "$(dirname "$0")"
export PATH="$HOME/.local/bin:$PATH"
if ! command -v claude >/dev/null; then
  echo "📦 Installing Claude Code..."
  curl -fsSL https://claude.ai/install.sh | bash
  export PATH="$HOME/.local/bin:$PATH"
fi
echo ""
echo "============================================================"
echo " 1) A link appears below. Open it (long-press -> Open)."
echo " 2) Log in with your Claude Pro account and press Authorize."
echo " 3) Copy the code it shows, paste it here, press Enter."
echo "============================================================"
echo ""
LOG=/tmp/claude-token.log
rm -f "$LOG"
script -q -c "claude setup-token" "$LOG"
TOKEN=$(python3 - "$LOG" <<'PY'
import re, sys
raw = open(sys.argv[1], encoding="utf-8", errors="ignore").read()
txt = re.sub(r"\x1b\[[0-9;?]*[ -/]*[@-~]", "", raw).replace("\r", "\n")
lines = [l.strip() for l in txt.split("\n")]
tok = ""
for i, l in enumerate(lines):
    m = re.search(r"sk-ant-oat\w*-[A-Za-z0-9_-]+", l)
    if m:
        tok = m.group(0)
        j = i + 1   # token may be wrapped onto following lines
        while j < len(lines) and re.fullmatch(r"[A-Za-z0-9_-]+", lines[j] or "#"):
            tok += lines[j]; j += 1
print(tok)
PY
)
if [ -z "$TOKEN" ]; then
  echo "Could not read the token automatically. Paste it here and press Enter:"
  read -r TOKEN
fi
if [ -z "$TOKEN" ]; then echo "❌ No token. Run again: bash claude.sh"; exit 1; fi
[ -f gta-shorts-bot/.env ] || cp gta-shorts-bot/.env.example gta-shorts-bot/.env
python3 - "$TOKEN" <<'PY'
import sys, re
p = "gta-shorts-bot/.env"
s = open(p, encoding="utf-8").read()
line = "CLAUDE_CODE_OAUTH_TOKEN=" + sys.argv[1]
s = re.sub(r"(?m)^CLAUDE_CODE_OAUTH_TOKEN=.*$", line, s) if "CLAUDE_CODE_OAUTH_TOKEN=" in s else s + "\n" + line + "\n"
open(p, "w", encoding="utf-8").write(s)
PY
echo ""
echo "✅ Claude Pro connected! Restarting the panel..."
exec bash go.sh
