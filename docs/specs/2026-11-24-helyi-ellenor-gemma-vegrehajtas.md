# Végrehajtás: helyi ellenőr Gemmára (2026-11-24)

Terv: `docs/specs/2026-11-24-helyi-ellenor-gemma.md`

1. Bukó teszt a `scripts/qa/gates/local-review.test.mjs`-ben: E1 (PASS lelet nélkül → `[]`; BLOCK lelet nélkül → `null`) és E2 (alapértelmezett modell).
2. Megvalósítás: `parseFindings`, `DEFAULT_MODEL`, a hívás opciói (a `repeat_penalty` kikerül).
3. Valós futás: `node scripts/qa/gates/local-review.mjs --base origin/main --head <B5a-1 fej>`.
4. Próbahiba: a PASS-ág kiiktatásával az E1-nek bukni kell.
5. Kapulánc: `gate:stage` → `gate:push` → helyi ellenőr → `gate:pr` → PR.
