#!/usr/bin/env bash
# Instala (o reinstala) el LaunchAgent que ejecuta el chequeo diario a las 09:00.
set -euo pipefail

LABEL="cl.narce.solotodo-tracker"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
NODE_BIN_DIR="$(dirname "$(command -v node)")"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

mkdir -p "$PROJECT_DIR/logs" "$HOME/Library/LaunchAgents"

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>WorkingDirectory</key><string>$PROJECT_DIR</string>
  <key>ProgramArguments</key>
  <array>
    <string>$PROJECT_DIR/node_modules/.bin/tsx</string>
    <string>scripts/check-prices.ts</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict><key>PATH</key><string>$NODE_BIN_DIR:/usr/bin:/bin</string></dict>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>9</integer><key>Minute</key><integer>0</integer></dict>
  <key>StandardOutPath</key><string>$PROJECT_DIR/logs/check-prices.log</string>
  <key>StandardErrorPath</key><string>$PROJECT_DIR/logs/check-prices.log</string>
</dict>
</plist>
EOF

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "LaunchAgent instalado: $PLIST"
echo "Ejecutar ahora:  launchctl kickstart -k gui/$(id -u)/$LABEL"
echo "Log:             $PROJECT_DIR/logs/check-prices.log"
