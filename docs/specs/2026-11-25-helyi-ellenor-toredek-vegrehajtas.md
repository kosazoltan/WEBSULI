# Végrehajtás — helyi ellenőr töredékek

Terv: `docs/specs/2026-11-25-helyi-ellenor-toredek.md`.

1. RED: `scripts/qa/gates/local-review.test.mjs` — új teszt: nagy új-fájl hunk sorhatáron, helyes összefüggő `@@` fejlécekkel,
   `töredék i/n` jelöléssel bomlik; a prompt tartalmazza a darabhatár-szabályt.
2. GREEN: `scripts/qa/gates/local-review.mjs` — `splitHunk(header, hunk, max)` sorhatáron, számolt `@@` fejlécekkel; `buildPrompt`
   darabhatár-szabály.
3. Próbahiba: a sorhatár-vágás nélkül a teszt bukik.
4. Kapulánc → PR → zöld CI → merge.
