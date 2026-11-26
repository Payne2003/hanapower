#!/usr/bin/env bash
# Tạo bộ cài Windows HanaMedia-Setup.exe từ commit hiện tại (cần makensis: apt-get install nsis).
#   bash scripts/build-installer.sh [thư-mục-đầu-ra]
set -euo pipefail
cd "$(dirname "$0")/.."
OUT_DIR="${1:-dist}"
VERSION="$(node -p "require('./package.json').version")"
STAGE="$(mktemp -d)"
trap 'rm -rf -- "$STAGE"' EXIT
git archive HEAD | tar -x -C "$STAGE"
mkdir -p "$OUT_DIR"
OUT="$(cd "$OUT_DIR" && pwd)/HanaMedia-Setup-${VERSION}.exe"
makensis -V2 -DSTAGE="$STAGE" -DVERSION="$VERSION" -DOUTFILE="$OUT" deploy/windows/installer.nsi
echo "Đã tạo: $OUT"
