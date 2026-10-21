#!/usr/bin/env bash
# 펫 그림 코드(src/pet)를 숙제앱(homework/app/src/pet)에 복사한다.
# 숙제앱의 '🐾 우리 펫' 구경 화면이 같은 그림을 쓴다. 펫 그림을 고치면 이걸 다시 돌릴 것.
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
dest="${HOMEWORK_APP:-$here/../homework/app}/src/pet"
mkdir -p "$dest"
rm -f "$dest"/*.ts "$dest"/*.tsx
for f in "$here"/src/pet/*.ts "$here"/src/pet/*.tsx; do
  { echo "// ⚠️ gom-tamagotchi/src/pet 에서 복사됨 (scripts/sync-to-homework.sh). 여기서 고치지 말 것."; cat "$f"; } > "$dest/$(basename "$f")"
done
echo "copied $(ls "$dest" | wc -l) files → $dest"
