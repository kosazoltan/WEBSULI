# Végrehajtás: FLAKE-KISFILM-RSS — a kisfilmworker leállítási tesztje ne függjön a tesztfolyamat memóriájától (2026-11-25)

Terv: `docs/specs/2026-11-25-flake-kisfilm-rss.md`.

Lelet (feladat-nyilvántartás): a `tests/lesson-clip-shutdown.test.ts` „az első kör elindult” ellenőrzése helyileg ingadozott — a
memóriaőr (`server/lesson-clips.ts`, `CLIP_RSS_LIMIT_BYTES` = 320 MB) a VALÓDI folyamat RSS-ét mérte, a tesztfolyamat 320–327 MB-ot
használt, és a kör kimaradt. A main ágon is reprodukálható (3 futásból 2 bukott).

1. RED: a teszt 400 MB-os ballaszttal determinisztikusan bukik (a memóriaőr a valódi RSS-t látja).
2. GREEN: a `startLessonClipWorker` gyártója opcionálisan `rss` mérőt adhat (teszt: 0 bájt); élesben változatlanul `process.memoryUsage().rss`.
3. Kapulánc, PR. Élesben nincs viselkedésváltozás (a mérő alapértéke azonos).

4. Review #599 (Copilot): a 400 MB-os ballaszt minden futáskor memóriát foglalt — helyette hívásszámláló igazolja a befecskendezett mérő használatát (a mérő kiiktatására a teszt determinisztikusan bukik).
