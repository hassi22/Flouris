#!/usr/bin/env bash
# fix-electron.sh
# Re-extracts and re-signs Electron after npm install wipes the binary.

set -e

ELECTRON_DIR="$(cd "$(dirname "$0")/../../.." && pwd)/node_modules/electron"
DIST_DIR="$ELECTRON_DIR/dist"
VERSION=$(node -e "console.log(require('$ELECTRON_DIR/package.json').version)")
ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then PLATFORM="darwin-arm64"; else PLATFORM="darwin-x64"; fi

CACHE_BASE="$HOME/Library/Caches/electron"
ZIP=$(find "$CACHE_BASE" -name "electron-v${VERSION}-${PLATFORM}.zip" 2>/dev/null | head -1)

if [ -z "$ZIP" ]; then
  echo "Electron zip not cached — running install.js"
  node "$ELECTRON_DIR/install.js"
  ZIP=$(find "$CACHE_BASE" -name "electron-v${VERSION}-${PLATFORM}.zip" 2>/dev/null | head -1)
fi

if [ -z "$ZIP" ]; then
  echo "ERROR: Could not find Electron zip. Run: npm install in apps/desktop"
  exit 1
fi

echo "Extracting $ZIP → $DIST_DIR"
unzip -o -q "$ZIP" -d "$DIST_DIR"
printf "Electron.app/Contents/MacOS/Electron" > "$ELECTRON_DIR/path.txt"

echo "Signing Electron.app..."
xattr -cr "$DIST_DIR/Electron.app" 2>/dev/null || true
codesign --sign - --force --deep --preserve-metadata=entitlements "$DIST_DIR/Electron.app"

echo "✓ Electron $VERSION ready at $DIST_DIR"
