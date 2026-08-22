#!/usr/bin/env bash
# ============================================================
# dsh-colleague one-click install to DSH web profile
#
# Usage:
#   bash scripts/install-to-dsh-web.sh
#
# What it does:
#   1. Build dist/
#   2. Install to web profile via dsh plugin --profile web add file://
#   3. Restart dsh web
#   4. Verify plugin is mounted
# ============================================================
set -euo pipefail

# ---- Colors ----
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[colleague]${NC} $1"; }
warn()  { echo -e "${YELLOW}[colleague]${NC} $1"; }
error() { echo -e "${RED}[colleague]${NC} $1" >&2; }

# ---- Locate plugin root ----
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
info "Plugin directory: $PLUGIN_DIR"

# ---- Check dsh command ----
DSH_BIN=""
if command -v dsh &>/dev/null; then
  DSH_BIN="dsh"
elif [ -x "$HOME/.npm/_npx/1e7f6d9597241db0/node_modules/@deepseek-ai/dsh/lib/bin.js" ]; then
  DSH_BIN="node $HOME/.npm/_npx/1e7f6d9597241db0/node_modules/@deepseek-ai/dsh/lib/bin.js"
else
  error "dsh command not found. Please install DeepSeek Harness first."
  exit 1
fi
info "DSH command: $DSH_BIN"

# ---- 1. Build ----
info "Step 1/4: Building plugin..."
cd "$PLUGIN_DIR"
if ! npx tsdown 2>&1 | tail -2; then
  error "Build failed"
  exit 1
fi
info "Build complete"

# ---- 2. Install to DSH web profile ----
info "Step 2/4: Installing to web profile..."

# Remove old version if already installed
$DSH_BIN plugin --profile web remove dsh-colleague 2>/dev/null || true
$DSH_BIN plugin --profile web remove colleague-plugin 2>/dev/null || true

# Install
if ! $DSH_BIN plugin --profile web add "file://$PLUGIN_DIR" 2>&1 | tail -5; then
  error "Installation failed"
  exit 1
fi
info "Installation complete"

# ---- 3. Restart DSH web ----
info "Step 3/4: Restarting DSH web..."
# Stop existing instance
if lsof -i :3080 -t &>/dev/null; then
  warn "Port 3080 is in use, stopping..."
  lsof -i :3080 -t 2>/dev/null | xargs kill -9 2>/dev/null || true
  sleep 2
fi

# Start new instance
DSH_PROFILE_DIR="$HOME/.dsh/profiles/web"
cd "$DSH_PROFILE_DIR"
nohup $DSH_BIN web > /tmp/dsh-web.log 2>&1 &
info "DSH web started (PID: $!)"

# Wait for startup
info "Waiting for DSH to start..."
for i in $(seq 1 30); do
  if curl -sf http://127.0.0.1:3080/ &>/dev/null; then
    info "DSH web is ready"
    break
  fi
  sleep 1
  if [ $i -eq 30 ]; then
    warn "DSH web startup timed out, check /tmp/dsh-web.log"
  fi
done

# ---- 4. Verify ----
info "Step 4/4: Verifying plugin..."
sleep 2

STATE=$(curl -sf http://127.0.0.1:3080/plugin-console/state 2>/dev/null || echo "")

if echo "$STATE" | python3 -c "
import sys, json
d = json.load(sys.stdin)
entries = [e for e in d.get('entries', []) if 'dsh-colleague' in e.get('entryId', '') or 'colleague' in e.get('entryId', '')]
if not entries:
    print('NOT_FOUND')
    sys.exit(1)
e = entries[0]
print(f\"status={e.get('fiberPhase')}, enabled={e.get('enabled')}, extra={e.get('extra')}\")
" 2>/dev/null; then
  info "Plugin verified: $(echo "$STATE" | python3 -c "
import sys, json
d = json.load(sys.stdin)
entries = [e for e in d.get('entries', []) if 'dsh-colleague' in e.get('entryId', '') or 'colleague' in e.get('entryId', '')]
e = entries[0]
print(f\"status={e.get('fiberPhase')}, enabled={e.get('enabled')}, extra={e.get('extra')}\")
")"
else
  warn "Plugin not found in plugin-console state, check DSH logs: /tmp/dsh-web.log"
fi

# Verify API route
API_STATE=$(curl -sf http://127.0.0.1:3080/plugins/dsh-colleague/state 2>/dev/null || curl -sf http://127.0.0.1:3080/plugins/colleague-plugin/state 2>/dev/null || echo "")
if [ -n "$API_STATE" ] && echo "$API_STATE" | python3 -c "
import sys, json
d = json.load(sys.stdin)
members = d.get('members', [])
print(f'members={len(members)}')
" 2>/dev/null; then
  info "API route OK"
else
  warn "API route not ready (webServer may not have registered yet)"
fi

echo ""
info "${GREEN}========================================${NC}"
info "${GREEN}  Installation complete!${NC}"
info "${GREEN}========================================${NC}"
echo ""
echo "  DSH Web:  http://127.0.0.1:3080"
echo "  Settings → Plugins → Plugin Management → you should see dsh-colleague"
echo "  Settings → Plugins → Plugin Config → you should see the Team Panel card"
echo ""
