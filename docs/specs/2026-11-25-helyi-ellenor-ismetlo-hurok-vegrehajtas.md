# Végrehajtás — helyi ellenőr ismétlő hurok

Terv: `docs/specs/2026-11-25-helyi-ellenor-ismetlo-hurok.md`.

1. RED: `scripts/qa/gates/local-review.test.mjs` — `classifyModelResponse` négy esete.
2. GREEN: `scripts/qa/gates/local-review.mjs` — `classifyModelResponse`; a `callModelOnce` a `loop` esetén üres tartalmat ad (→ felezés).
3. Valós mérés: a #587 diffjére ítélet születik.
4. Kapulánc → PR → zöld CI → merge.
