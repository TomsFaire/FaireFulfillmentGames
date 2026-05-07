#!/usr/bin/env bash
# FFG Overlay Server — one-time setup for macOS
# Run once on the production machine: bash install.sh
# After this, the server starts automatically at login.

set -e

PLIST_LABEL="com.faire.ffg-server"
PLIST_DEST="$HOME/Library/LaunchAgents/${PLIST_LABEL}.plist"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OBS_DIR="$SCRIPT_DIR/obs"
SERVER_JS="$OBS_DIR/server.js"

echo ""
echo "  Faire Fulfillment Games — Server Install"
echo "  ──────────────────────────────────────────"
echo ""

# ── 1. Find node ──────────────────────────────────────────────────────────────
NODE_BIN="$(command -v node 2>/dev/null || true)"

if [ -z "$NODE_BIN" ]; then
  # Common Homebrew locations on Apple Silicon / Intel
  for candidate in /opt/homebrew/bin/node /usr/local/bin/node; do
    [ -x "$candidate" ] && NODE_BIN="$candidate" && break
  done
fi

if [ -z "$NODE_BIN" ]; then
  echo "  ✗  Node.js not found."
  echo "     Install it from https://nodejs.org (LTS) and re-run this script."
  exit 1
fi

NODE_VERSION="$("$NODE_BIN" --version)"
echo "  ✓  Node.js $NODE_VERSION at $NODE_BIN"

# ── 2. Check server file ──────────────────────────────────────────────────────
if [ ! -f "$SERVER_JS" ]; then
  echo "  ✗  obs/server.js not found. Make sure you're running this from the project root."
  exit 1
fi
echo "  ✓  Server found at $SERVER_JS"

# ── 3. Set up .env if missing ─────────────────────────────────────────────────
ENV_FILE="$OBS_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
  cp "$OBS_DIR/.env.example" "$ENV_FILE"
  echo "  ✓  Created obs/.env from template — fill in your Stagetimer credentials"
else
  echo "  ✓  obs/.env already exists"
fi

# ── 4. Write launchd plist ────────────────────────────────────────────────────
mkdir -p "$HOME/Library/LaunchAgents"

sed \
  -e "s|NODE_BIN|$NODE_BIN|g" \
  -e "s|SERVER_JS|$SERVER_JS|g" \
  -e "s|OBS_DIR|$OBS_DIR|g" \
  "$SCRIPT_DIR/ffg-server.plist.template" > "$PLIST_DEST"

echo "  ✓  Plist written to $PLIST_DEST"

# ── 5. Load (or reload) the service ──────────────────────────────────────────
# Unload silently in case it was already loaded from a previous install
launchctl unload "$PLIST_DEST" 2>/dev/null || true
launchctl load "$PLIST_DEST"
echo "  ✓  Service loaded — server is starting now"

# ── 6. Done ───────────────────────────────────────────────────────────────────
echo ""
echo "  Server running on  http://localhost:3000"
echo "  Logs               /tmp/ffg-server.log"
echo "  To view logs:      tail -f /tmp/ffg-server.log"
echo "  To stop:           launchctl unload $PLIST_DEST"
echo "  To uninstall:      launchctl unload $PLIST_DEST && rm $PLIST_DEST"
echo ""
echo "  The server will restart automatically at every login."
echo "  You can also toggle it in:"
echo "  System Settings → General → Login Items → Allow in Background"
echo ""
