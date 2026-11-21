# Végrehajtási utasítás: a kisfilm-gyártás memóriabarát átkódolása

> Terv: `docs/specs/2026-11-10-kisfilm-memoria.md`. Útvonalak a `source/` alatt.

## T1 · `server/lesson-clips-providers.ts`
- `ffmpegQueue = limiter(1)`; `FFMPEG_ARGS(input, output)`: `-threads 1` a dekódolóra és a kódolóra, `-x264-params rc-lookahead=0:ref=1:bframes=0:sync-lookahead=0`.
- `downloadAndShrink(download, ffmpeg)`: a válasz törzse adatfolyamként az ideiglenes mappába, átkódolás a sorban, a kicsi kimenet beolvasása; hibánál `null`.
- A `video` szolgáltató a kész feladat címét `downloadAndShrink`-kel tölti le; a `shrink` megszűnik.

## T2 · `server/lesson-clips.ts`
- `ClipDeps.video` visszatérése `Buffer | null` (már átkódolva); a `shrink` mező törlődik.
- `CLIP_PARALLEL = 1`; `CLIP_RSS_LIMIT_BYTES = 320 MB` (review M2; eredetileg 360), az őr minden fejezet előtt is mér, a
  kihagyás-figyelmeztetés óránként legfeljebb egyszer; ffmpeg `killSignal: "SIGKILL"`; a letöltési hiba külön üzenet, a hibás
  törzs `cancel()`; a `clip-trial.ts` a `null` mozgóképet nem alakítja üres Bufferré (review M1); `runClipRound` a `opts.rss?.()` értékével dönt a kör kihagyásáról (naplózva); a `startLessonClipWorker` a `process.memoryUsage().rss`-t adja át.

## T3 · tesztek, próba
- `tests/lesson-clip.test.ts`: `FFMPEG_ARGS`. `tests/lesson-clip-worker.test.ts`: az új `video` felület, egy fejezet egyszerre, memóriaőr.
- `scripts/clip-trial.ts`: az új felület, a folyamat csúcsmemóriájának kiírása; élő futás egy fejezetre.
- Kapuk: lint, check, check:test, `npm test`, kisfilm-böngészőteszt.

## T4 · élesítés
PR → zöld CI → összevonás (tulajdonosi jóváhagyással) → a kézi kikapcsolási küszöb tulajdonosi jóváhagyása (`docs/fejezet-kisfilmek-hasznalat.md` 0. lépés; vak kör L10) → `LESSON_CLIPS_AUTO=on` → a Render memória- és eseménymérése az első kör alatt;
a szerver újraindulása esetén azonnali `off`.

## 2026-11-21 — vak kör (9ca9544f)

Független vak ellenőr: NEM. Leletenként (valódi / megcáfolt → javítás, teszt). Tesztek: `tests/lesson-clip.test.ts` (LC),
`tests/lesson-clip-worker.test.ts` (LW), `tests/lesson-clip-shutdown.test.ts` (LS, külön folyamat: a leállítás végleges modulállapot).

- **L1 valódi** — `makeChapterClip`: `Promise.allSettled` + megszakítójelző; hibánál a testvérjelenetek a következő lépésük (kép, kapu, tárolás, hang, mozgókép) előtt leállnak, a fejezet csak mindegyik lezárulása után tér vissza. LW „képhiba után a testvérjelenetek leállnak…”. Maradék: a hiba ELŐTT már beírt média megmarad (tartalom-hash, `ON CONFLICT DO NOTHING` — közös sor, törlése nem biztonságos).
- **L2 valódi** — `FFMPEG_ARGS`: globális `-filter_threads 1`. LC „az átkódolás szűrőlánca is egy szálon fut…”. Helyi ffmpeg 9.1 szintetikus mintán lefut; a Linuxos szálszám mérése UNVERIFIED.
- **L3 részben** — a sorból kivételkor újramér (határ fölött nincs ffmpeg, a jelenet állóképes). LW „a sorból kivételkor újramér…”. NOT DONE: futás közbeni memóriafigyelés / kill — tulajdonosi döntés (lásd a záró jelentés kérdését) és élő mérés.
- **L4 valódi** — kemény letöltési bájtkorlát (`CLIP_RAW_MAX_BYTES` 40 MB, `content-length` és adatfolyam-számláló), `-t 15`, a kimenet mérete beolvasás ELŐTT ellenőrizve (üres / > `CLIP_VIDEO_MAX_BYTES` → null), a beolvasás a sorban. LW „kemény bájtkorlát…”, LC (`-t`).
- **L5 valódi** — `stopLessonClipWorker` (időzítők le, új kör / fejezet nem indul, korlátos kivárás), `abortClipTranscodes` (SIGKILL, `ClipAbortError`: a megszakított fejezet nem kap hibás sort), `sweepStaleClipDirs` induláskor (`websuli-clip-` előtag, 1 óránál régebbi); `index.ts` leállítás és indítás bekötve. LS mindkét teszt, LW „leállításkor nem indul új fejezet…”, „induláskor a régi… munkamappák…”.
- **L6 valódi** — `limiter`: a felszabaduló hely közvetlenül a várakozóé. LC „a sor a felszabaduló helyet közvetlenül a várakozónak adja…” (piros: `A,C,B`; zöld: `A,B,C`, csúcs 1; siker és hiba ág).
- **L7 valódi** — `settleClips`: a várakozás lejártakor a „Készülnek a kisfilmek…” jelzés eltűnik. LW „a lejárt várakozás után…”. NOT DONE: a „várakozik / fut” állapot külön jelzése (API-bővítés, kanbanra javasolt).
- **L8 valódi (örökölt)** — a lekérdezési cím csak a szolgáltató HTTPS-originje lehet; a letöltés csak HTTPS, a kulcs csak a szolgáltató originjére megy; `-protocol_whitelist file`. LW „szolgáltatói címek…”. UNVERIFIED: a valódi `unsigned_urls` originje (idegen originnél kulcs nélkül tölt; ha az hitelesítést kér, a jelenet állóképes).
- **L9 valódi (örökölt)** — `intEnv`: csak biztonságos egész (a bájtra váltott is). LW „plafonok: a túlcsorduló számszöveg…”. A `lesson-covers.ts` azonos mintája hatókörön kívül (kanbanra javasolt).
- **L10 valódi** — `docs/fejezet-kisfilmek-hasznalat.md` 0. lépés: a kézi küszöb (javaslat 480 MB, Render-memória) tulajdonosi jóváhagyása a `LESSON_CLIPS_AUTO=on` előfeltétele; a 320 MiB-os automatikus RSS-őr külön határként leírva. A kód alapértelmezése változatlanul nem kapcsol be (`clipsMode`: csak a pontos `on` + kulcs). T4 kiegészítés: a bekapcsolás a jóváhagyott küszöbhöz kötött.
- **L11 valódi** — a régi időkorlát-teszt kettévált: HTTP-ág (minden platformon, átkódolás nem indul), csonkolt átkódolós teszt (`timeout`, `SIGKILL`, munkamappa eltűnik — minden platformon), és POSIX-teszt valódi gyerekkel, kifejezett `skip` jelöléssel Windowson (eddig néma `return` volt), az indulás jelzőfájllal és a munkamappa eltűnésével igazolva. Tesztet nem gyengítettünk: minden korábbi állítás megmaradt.
