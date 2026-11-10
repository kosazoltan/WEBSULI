# Végrehajtási utasítás: a kisfilm-gyártás memóriabarát átkódolása

> Terv: `docs/specs/2026-11-10-kisfilm-memoria.md`. Útvonalak a `source/` alatt.

## T1 · `server/lesson-clips-providers.ts`
- `ffmpegQueue = limiter(1)`; `FFMPEG_ARGS(input, output)`: `-threads 1` a dekódolóra és a kódolóra, `-x264-params rc-lookahead=0:ref=1:bframes=0:sync-lookahead=0`.
- `downloadAndShrink(download, ffmpeg)`: a válasz törzse adatfolyamként az ideiglenes mappába, átkódolás a sorban, a kicsi kimenet beolvasása; hibánál `null`.
- A `video` szolgáltató a kész feladat címét `downloadAndShrink`-kel tölti le; a `shrink` megszűnik.

## T2 · `server/lesson-clips.ts`
- `ClipDeps.video` visszatérése `Buffer | null` (már átkódolva); a `shrink` mező törlődik.
- `CLIP_PARALLEL = 1`; `CLIP_RSS_LIMIT_BYTES = 360 MB`; `runClipRound` a `opts.rss?.()` értékével dönt a kör kihagyásáról (naplózva); a `startLessonClipWorker` a `process.memoryUsage().rss`-t adja át.

## T3 · tesztek, próba
- `tests/lesson-clip.test.ts`: `FFMPEG_ARGS`. `tests/lesson-clip-worker.test.ts`: az új `video` felület, egy fejezet egyszerre, memóriaőr.
- `scripts/clip-trial.ts`: az új felület, a folyamat csúcsmemóriájának kiírása; élő futás egy fejezetre.
- Kapuk: lint, check, check:test, `npm test`, kisfilm-böngészőteszt.

## T4 · élesítés
PR → zöld CI → összevonás (tulajdonosi jóváhagyással) → `LESSON_CLIPS_AUTO=on` → a Render memória- és eseménymérése az első kör alatt;
a szerver újraindulása esetén azonnali `off`.
