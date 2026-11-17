#!/usr/bin/env bash
# Codex-felhő telepítő a minőségkapukhoz (docs/codex-felhokornyezet.md „Minőségkapuk a felhőben”; docs/minosegkapuk.md).
# A környezet „Setup” parancsából hívandó (a beállítás a ChatGPT-fiókban él — a felvétel tulajdonosi lépés):
#   bash scripts/qa/codex-cloud-setup.sh
# Titkot nem kér és nem ír ki. Hibánál a hiányzó részt megnevezi; a kapuk maguk jelzik SKIP / NOT RUN-nal, ami nem futhat.
set -u

root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$root" || exit 1

major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
if [ "$major" -lt 22 ]; then
  echo "[codex-cloud-setup] HIBA: Node >= 22 kell (most: ${major}); a CI Node 24-en fut." >&2
  exit 1
fi

echo "[codex-cloud-setup] npm ci a source/ alatt (a kapuk az ESLint / tsc / tsx csomagokat innen futtatják)"
npm ci --prefix source --no-audit --no-fund || { echo "[codex-cloud-setup] HIBA: npm ci" >&2; exit 1; }

echo "[codex-cloud-setup] Playwright chromium (a gate:pr CI-azonos böngészős útjához)"
if ! (cd source && npx playwright install --with-deps chromium); then
  echo "[codex-cloud-setup] FIGYELEM: a Playwright-böngésző nem települt — a gate:pr böngészős lépése bukni fog; a többi kapu fut." >&2
fi

if command -v gh >/dev/null 2>&1; then
  echo "[codex-cloud-setup] gh: elérhető"
else
  echo "[codex-cloud-setup] FIGYELEM: nincs gh — a gate:push „zöld CI utáni push” lépése SKIP, a gate:merge nem futtatható (orkesztrátori lépés)."
fi

if command -v docker >/dev/null 2>&1; then
  echo "[codex-cloud-setup] docker: elérhető (DB-tesztek)"
else
  echo "[codex-cloud-setup] FIGYELEM: nincs Docker — a test:learning-db és a gate:pr DB-lépése nem fut (NOT RUN / bukás jelzi)."
fi

echo "[codex-cloud-setup] próbafutás: npm run gate:lint -- --fast"
npm run gate:lint -- --fast
