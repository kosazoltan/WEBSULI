# S7b — végrehajtás (döntőbíró fél pontos plafon)

Terv: docs/specs/2026-11-18-tananyag-gyartas-minoseg-vegrehajtas.md (S7b szakasz), docs/specs/2026-11-18-tananyag-gyartas-minoseg.md

1. A pontozó ága: a meglévő egyedi indoklás-előtag (`SHORT_COMPLETE_PREFIX` = „A lényeg megvan.”, `isShortComplete`) — új mező nincs.
2. `combineVerdicts`: tömör ágon a döntőbíró nem emeli a fél pontot (a pontozó ítélete marad); `ARBITER_VERSION` arbiter-2 → arbiter-3.
3. Teszt: tömör + „ok” → 0,5; nem tömör hiányos + „ok” → 1; döntőbíró nélkül változatlan; verzió arbiter-3.
