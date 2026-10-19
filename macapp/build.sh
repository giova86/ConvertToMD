#!/usr/bin/env bash
# Builds dist/ConvertToMD.app (macOS only).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
BUILD="$ROOT/build/macapp"
rm -rf "$BUILD" "$ROOT/dist/ConvertToMD.app"
mkdir -p "$BUILD"

echo "▸ Frontend build"
(cd frontend && npm install --silent && npm run build)

echo "▸ App icon"
ICONSET="$BUILD/icon.iconset"; mkdir -p "$ICONSET"
SRC="frontend/public/favicon-dark.png"
for s in 16 32 128 256 512; do
  sips -z $s $s "$SRC" --out "$ICONSET/icon_${s}x${s}.png" >/dev/null
  sips -z $((s*2)) $((s*2)) "$SRC" --out "$ICONSET/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$BUILD/icon.icns"

echo "▸ Python environment"
PY="${PYTHON:-/Library/Frameworks/Python.framework/Versions/3.13/bin/python3}"; [ -x "$PY" ] || PY="$(command -v python3)"
"$PY" -m venv "$BUILD/venv"
"$BUILD/venv/bin/pip" install -q -r macapp/requirements.txt

echo "▸ PyInstaller"
"$BUILD/venv/bin/pyinstaller" --noconfirm --windowed --name ConvertToMD \
  --icon "$BUILD/icon.icns" \
  --osx-bundle-identifier com.giova86.converttomd \
  --add-data "$ROOT/frontend/dist:frontend_dist" \
  --paths "$ROOT/backend" \
  --hidden-import main --hidden-import converters --hidden-import settings_store --hidden-import llm_backends \
  --collect-all pymupdf --collect-submodules fitz \
  --collect-submodules uvicorn \
  --distpath "$ROOT/dist" --workpath "$BUILD/work" --specpath "$BUILD" \
  macapp/app.py

echo "✔ Built $ROOT/dist/ConvertToMD.app"
