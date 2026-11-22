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

## 2026-11-21 — 2. vak kör (39e267a5)

Független vak ellenőr: NEM (1 blokkoló, 5 közepes, 1 kicsi). Tesztek: LC, LW, LS mint fent; LP = `tests/lesson-clip-shutdown-poll.test.ts`,
PW = `tests/lesson-clips.spec.ts` (valódi Chrome), DB = `tests/lesson-clips-db.integration.ts` (eldobható Postgres, `test:learning-db`).

- **L1 valódi, kód nélkül (tulajdonosi döntés 2026-11-21: „Mérés az első éles körben (Javasolt)”)** — a terv §4 / §8 és a használati útmutató 6. lépése rögzíti: marad az újramérés; az első éles kör kötelező mérése; 450 MB fölötti csúcsnál `off` és külön PR a futás közbeni figyelőre.
- **L2 valódi** — a leállítás jele (`AbortController`) minden szolgáltatói kérést, a lekérdezési várakozást (`pause`) és a letöltés `pipeline`-ját megszakítja; leállításkor minden szolgáltatói hiba `ClipAbortError`; a leállítás közben sikertelen fejezet nem kap hibás sort; `index.ts` mindig megszakít és a kör (advisory lock) lezárulását a pool zárása előtt kivárja (10 s). LP, LW „leállításkor a megszakítás miatt sikertelen fejezet…”.
- **L3 valódi** — a munkamappa neve a folyamatazonosítót viszi; a söprés a saját nem futó és a halott folyamat mappáját törli, az élő idegen és a futó saját munkáét kíméli; gyártó módban minden kör előtt fut (`maintenance`), kikapcsolt / kiszolgáló módban semmilyen fájlrendszer-munka nincs. LW „munkamappa-söprés…”, LS (idle: 0 karbantartás; auto: körönként 1). A korábbi söprés-teszt (a friss, azonosító nélküli mappa marad) változatlan.
- **L4 valódi** — a lekérésektől független lejárati időzítő törli a jelzést (a kész kisfilmek maradnak) és megszakítja a függő kérést. PW „ha a lekérdezés elakad…” (piros: a jelzés kint maradt; zöld).
- **L5 valódi (örökölt)** — `.learning-book-head .fusion-label { flex: 1 1 14rem }`: keskeny képernyőn a kisfilmjelzés / -gombok új sorba törnek. PW „álló mobilon…” (piros: választó 48 px; zöld: ≥ 150 px, 0 átfedés, nincs vízszintes görgetés; képernyőkép szemrevételezve).
- **L6 valódi** — `ClipStore.pruneOrphanMedia`: a kör a zár alatt, a fejezetek előtt törli a 24 óránál (`CLIP_ORPHAN_GRACE_MS`) régebbi, egyetlen `lesson_clips.clip`-ben sem hivatkozott médiát. LW „a kör a zár alatt… söpri az árva médiát…” (piros), DB „árva kisfilm-média…” (zöld; a DB-tesztet a javítás előtt nem futtattam, a piros evidencia az LW).
- **L7 valódi** — `safeProviderFetch`: kézi átirányítás-követés, minden lépés HTTPS, a kulcs csak a szolgáltató originjére, a lekérdezés nem hagyhatja el a szolgáltatót (legfeljebb 3 lépés). LW „átirányítás…”.

## 2026-11-22 — Copilot-review (30db697c)

Mind a négy szál valódi; javítás: `88814b2f`. Tesztek: LW, LP, DB mint fent; LC = `tests/lesson-clip.test.ts`.

- **4655721837 (SSRF)** — `88814b2f`: `safeProviderFetch` minden lépésnél (átirányításnál is) `checkFetchUrl` (HTTPS, 443-as port, hitelesítő adat és belső gépnév nélkül) + a gépnév MINDEN feloldott címe nyilvános (`isPublicAddress`, `server/studio/safe-fetch.ts` újrahasznosítva), a kapcsolat az ellenőrzött IP-hez rögzítve (`https.request`, rögzített `lookup`; `defaultProviderTransport`). LW „SSRF: belső IP-re, belső címre feloldódó gépnévre…” (piros: `Missing expected rejection: https://10.0.0.5/v.mp4`). A meglévő átirányítás- és címteszt, valamint LP csonkolt szállítást kap (valódi DNS / hálózat nélkül) — az állításaik változatlanok.
- **4655721873 (frissen lecserélt média)** — `88814b2f`: `lesson_clip_media.orphaned_at` (migráció `0044`, additív, idempotens; Drizzle-séma, harness). A söprés az először hivatkozatlanul talált sort jelöli, csak az árvaság türelmi ideje (24 óra) után töröl; újra beíráskor (`putMedia` ON CONFLICT) és újrahivatkozáskor a jelölés törlődik. DB „árva kisfilm-média: előbb árvának jelölődik…”. Dokumentált változás: a 2. vak kör DB-tesztje az első söprésre törlést várt (created_at-alapú türelmi idő) — ez most jelölés; LC migráció–séma teszt a későbbi `ADD COLUMN IF NOT EXISTS` migrációkat is beolvassa.
- **4655721897 (szorzatos költség)** — `88814b2f`: a hivatkozott azonosítók egyszer, átmeneti elsődleges kulcsos táblába (`clip_media_refs`), a jelölés és a törlés egyenlőséggel mér; törlés 200-as adagokban, söprésenként legfeljebb 50 adag. DB „árva kisfilm-média: sok árva sor korlátos adagokban…” (450 sor, 3 adag).
- **4655721937 (hangkapu a testvérhiba után)** — `88814b2f`: `speakChecked(…, alive)` minden hang- és hangkapuhívás előtt. LW „testvérjelenet hibája után a futó jelenet hangkapuja…” (piros: 3 hangkapu-hívás, várt 0).

## 2026-11-22 — 4. vak kör (1fd3a03e)

Független vak ellenőr: NEM (1 blokkoló, 1 közepes, 2 kicsi). Javítás: `f5de5dda`. Tesztek: LW, PW mint fent; LD = `tests/lesson-clip-shutdown-dns.test.ts`.

- **L1 részben valódi** — (a) a letöltési adapter pufferelése: mérve NEM valódi Node 24-en (a CI és a `package.json` `engines` is 24.x): a `Readable.toWeb` alapértelmezése lassú fogyasztónál ~32 KiB-ot tölt elő; kódváltozás nincs, a `webBody` kiemelve és LW „a HTTP-adapter választeste bájtalapú, kis sorral jön…” (≤ 256 KiB) rögzíti a korlátot (javítás előtt is zöld). (b) a lekérdezés `poll.text()`-je korlátlan volt: VALÓDI — `readLimitedText` 256 KiB-os korláttal, hibás státusznál a törzs lezárul. LW „a lekérdezés JSON-válasza bájtkorlátos…” (piros: `Missing expected rejection`).
- **L2 valódi** — a DNS-feloldás versenyez a kérés megszakítójelével (időkorlát + leállítás); a későn beérő feloldás után nem indul kérés (`throwIfAborted`). LW „a DNS-feloldás várakozását az időkorlát megszakítja…” (piros: 15 s-os tesztidőtúllépés), LD „leállítás: a letöltés függő DNS-feloldása azonnal megszakad…” (piros: időtúllépés; zöld: `ClipAbortError` < 2 s, 0 kérés, a munkamappa törlődik).
- **L3 valódi (örökölt)** — ismert függő állapotnál az átmeneti HTTP- / hálózati hiba után a kliens háromszoros időközzel újra kérdez (a teljes 30 perces kereten belül), a jelzés marad. PW „egy átmeneti 502 nem állítja le a várakozást…” (piros: a jelzés eltűnt).
- **L4 valódi (időzítési verseny)** — az ál-ffmpeg a `trap` UTÁN írja a jelzőfájlt; 2 s-os gyerek-időkorlát, 30 s-os tesztkeret. Windowson kihagyva: a javított teszt itt nem futott (UNVERIFIED a POSIX CI-ig).

## 2026-11-22 — I/O-osztály leltár

Tulajdonosi utasítás (2026-11-22): megközelítésváltás — a 4 vak kör minden lelete egy hibaosztály: „a kisfilm-folyamat minden
I/O-várakozása legyen bájtban ÉS időben korlátos, és a leállítás / időkorlát megszakítójelére azonnal álljon le, takarítással”. Az
alábbi tábla a diff MINDEN ilyen pontja (`source/` alatti útvonal, fej `378abd15`). Közös segédek: a védett út magja
`server/studio/safe-fetch.ts` `openPublicResponse` (újrahasznosítva — a saját HTTP-adapter megszűnt), `signal(ms)` (időkorlát +
leállítás), `readLimitedText` / `readLimitedBytes`, `rawToResponse`, `pause`, `withClipStatementTimeout`.

Tesztek: LW = `tests/lesson-clip-worker.test.ts`, LC = `tests/lesson-clip.test.ts`, LS = `tests/lesson-clip-shutdown.test.ts`,
LP = `…-shutdown-poll`, LD = `…-shutdown-dns`, LR = `…-shutdown-retry`, DB = `tests/lesson-clips-db.integration.ts`,
PW = `tests/lesson-clips.spec.ts`, WG = `tests/web-gather-gpt.test.ts` (a közös mag eredeti tesztjei, változatlanul zöldek).

| # | Hely (fájl:sor) | Várakozás fajtája | Bájtkorlát | Időkorlát | Megszakítás (leállítás) | Takarítás | Igazoló teszt |
|---|---|---|---|---|---|---|---|
| 1 | `server/lesson-clips-providers.ts:329` | forgatókönyv + képkapu (OpenRouter chat) HTTP | 1 MiB (`bodyText`) | 90 s (`signal`) | `signal` + `guarded` → `ClipAbortError` | túllépésnél a törzs lezárul | LW „I/O-leltár: minden szolgáltatói választörzs bájtkorlátos…”; LP |
| 2 | `…providers.ts:340` | kép (OpenAI) HTTP | 24 MiB | 120 s | mint 1 | mint 1 | LW „I/O-leltár: … bájtkorlátos…” |
| 3 | `…providers.ts:346` | kép (OpenRouter) HTTP | 24 MiB | 120 s | mint 1 | mint 1 | LW „I/O-leltár: … bájtkorlátos…” |
| 4 | `…providers.ts:360` | mozgókép-beküldés HTTP | 1 MiB | 120 s | mint 1 | mint 1 | LW „I/O-leltár: … bájtkorlátos…” |
| 5 | `…providers.ts:369` | lekérdezési szünet | – (nincs adat) | 6 s / lépés, összesen 6 perc (`VIDEO_TIMEOUT_MS`) | `pause` → `ClipAbortError` azonnal | – | LP „a mozgókép-lekérdezés várakozása azonnal megszakad…” |
| 6 | `…providers.ts:370` | lekérdezés HTTP (védett út, csak a szolgáltató originje) | 256 KiB (`readLimitedText`); hibás státusznál a törzs lezárul | 60 s | `signal` | törzs lezárva | LW „a lekérdezés JSON-válasza bájtkorlátos…”; LW „átirányítás…” (idegen origin tiltva) |
| 7 | `server/studio/safe-fetch.ts:201` | DNS-feloldás | – | a kérés határideje | `abortable` + későn beérő feloldás után nincs kérés | – | LW „a DNS-feloldás várakozását az időkorlát megszakítja…”; LD; WG (DNS-időtúllépés) |
| 8 | `safe-fetch.ts:205` (`defaultRequest` `:105`) | kapcsolat + fejlécek (rögzített címre) | – | határidő + 60 s socket-tétlenség | `abortable` + `https` `signal` | `destroy` | LW „SSRF…”; WG |
| 9 | `safe-fetch.ts:210` | átirányítás | legfeljebb 3 lépés | határidő | lépésenként újraellenőrzés | előző válasz `destroy` | LW „átirányítás…”, „SSRF…” |
| 10 | `…providers.ts:59` (`rawToResponse`) | választörzs a védett útról | a hívóé (11, 6) | határidő | a jelre a kapcsolat lezárul, az olvasás hibával áll | `destroy` | LW „I/O-leltár: az elakadt letöltési törzs olvasását a kérés határideje megszakítja…” |
| 11 | `…providers.ts:271` | letöltés → lemez (`pipeline`) | 40 MiB (`byteLimit`) + `content-length` | 180 s (10 útján) | `pipeline` `signal` (leállítás) → `ClipAbortError` | munkamappa `rm` (`:305`) | LW „kemény bájtkorlát…”; LD |
| 12 | `…providers.ts:38` (`webBody`) | adapter előtöltése | ≈ 32 KiB (mérve, Node 24) | – | – | – | LW „a HTTP-adapter választeste … korlátos” |
| 13 | `…providers.ts:274` | ffmpeg-sor várakozása | – | tranzitív: 1 hely, a tartó ≤ 90 s + korlátos olvasás; ≤ 5 jelenet / fejezet | leállítás után új nem indul (`shuttingDown`) | – | LC „a sor a felszabaduló helyet közvetlenül a várakozónak adja…”; LS „… utána új nem indul” |
| 14 | `…providers.ts:283` | ffmpeg-gyerek | kimenet ≤ 2,5 MB (`stat` a beolvasás előtt), `-t 15`, `execFile` stdout ≤ 1 MiB (alap) | 90 s, `SIGKILL` | `abortClipTranscodes` → `SIGKILL` | munkamappa `rm` | LW „az időkorlát SIGKILL-lel él…”, „kemény bájtkorlát…”; LS |
| 15 | `…providers.ts:292` | kimenet beolvasása | ≤ 2,5 MB (előtte ellenőrizve) | helyi fájl | – | `rm` | LW „kemény bájtkorlát…” (túlméretes / üres) |
| 16 | `…providers.ts:260`, `:305` | munkamappa létrehozása / törlése | – | helyi | – | `finally` + körönkénti söprés | LW „az időkorlát SIGKILL-lel él… munkamappa…”, „munkamappa-söprés…” |
| 17 | `…providers.ts:210` | söprés (szinkron, helyi) | – | körönként egyszer | csak gyártó módban | régi / halott mappák | LW „munkamappa-söprés…”, „induláskor a régi…”; LS (idle: 0) |
| 18 | `…providers.ts:384`, `:398` | ElevenLabs-sor várakozása | – | tranzitív: 2 hely, a tartó ≤ 3 × 60 s + 7,5 s | a tartók `signal`-ja megszakad | – | LC „a sor a felszabaduló helyet…”, „ElevenLabs…” |
| 19 | `…providers.ts:384` | hang HTTP | 8 MiB (hiba: 1 MiB) | 60 s | mint 1 | mint 1 | LW „I/O-leltár: … bájtkorlátos…” |
| 20 | `…providers.ts:161` | 429 utáni várakozás | 429-es törzs lezárva (nem puffereli) | 2,5 / 5 s | `pause` → `ClipAbortError` | – | LR „leállítás: a 429 utáni újrapróbára várakozás azonnal megszakad…” |
| 21 | `…providers.ts:398` | hangkapu (ElevenLabs) HTTP | 1 MiB | 60 s | mint 1 | mint 1 | LW „I/O-leltár: … bájtkorlátos…” |
| 22 | `…providers.ts:411` | hangkapu (OpenAI) HTTP | 1 MiB | 60 s | mint 1 | mint 1 | LW „I/O-leltár: … bájtkorlátos…” |
| 23 | `server/lesson-clips-db.ts:21` | minden kisfilm-DB-lekérdezés | sorok kicsik; média ≤ 2,5 MB (14) | 15 s `statement_timeout` | a kört a leállítás kivárja (25) | tranzakció-visszagörgetés | DB „I/O-leltár: a kisfilm-adatréteg minden lekérdezése időkorlátos…” |
| 24 | `lesson-clips-db.ts:84` | árvamédia-söprés | 200 sor / adag, ≤ 50 adag | 15 s / utasítás | mint 23 | mint 23 | DB „árva kisfilm-média…” (2 teszt) |
| 25 | `lesson-clips-db.ts:108` | példányok közötti zár | – | nem blokkol (`pg_try_advisory_lock`), kapcsolódás ≤ 10 s | – | `finally` unlock + release | DB „I/O-leltár: a példányok közötti zár nem blokkol…” |
| 26 | `server/lesson-clips.ts:276` | jelenetek kivárása | – | tranzitív (1–22 sorok) | testvérhibánál `alive()` minden fizetős lépés előtt | – | LW „képhiba után a testvérjelenetek…”, „testvérjelenet hibája után … hangkapuja…” |
| 27 | `server/index.ts:715`, `:744` | szerverleállítás | – | 60 s + 10 s, a pool zárása előtt | `abortClipTranscodes` (minden jel) + `stopLessonClipWorker` | a kör (és a zár) lezárul | LS „leállítás: a kisfilmworker időzítői leállnak…”; LP, LD, LR — **a `index.ts` bekötése teszttel NEM igazolt** |
| 28 | `client/src/lesson-runtime/clips/useLessonClips.ts:52` | kliens-lekérdezés | – (saját szerver, fejezetenkénti kisfilmlista) | 30 perces keret, független lejárati időzítő; átmeneti hibánál 60 s-os újrapróba | `AbortController` (lejárat, leválás) | időzítők törölve | PW „ha a lekérdezés elakad…”, „egy átmeneti 502…” |

Összesítés: 28 sor. Teszttel nem igazolt: a 27. sor `index.ts`-bekötése (valódi SIGTERM-próba nincs; a részei — worker-stop,
megszakítás — tesztelve). Tranzitív időkorlát (a korlát a tartók korlátjából következik, nem saját időzítő): 13, 18, 26. Bájtkorlát
szándékosan nincs: 28 (saját szerver kis JSON-válasza). A POSIX valódi gyerekes teszt (14) Windowson kihagyva.

**A saját HTTP-adapter cseréje (2. pont):** megtörtént — a `server/studio/safe-fetch.ts` védett útjának magja kiemelve
(`openPublicResponse`, a `fetchPublicPage` is ezt használja, a WG-tesztek változatlanul zöldek), a nyers kérés elhagyható,
lépésenkénti fejléceket kap. A szolgáltatók fix végpontjai (1–4, 19, 21, 22) a globális `fetch`-et használják: a címük kódbeli állandó
(nem szolgáltatói válaszból jön), ezért SSRF-felületük nincs; POST-törzzsel mennek, amit a `safe-fetch` (GET-only) nem támogat.

Változott meglévő tesztek (dokumentált, nem gyengítés): a csonkolt szállítás a `safe-fetch` nyers kérését (`RawRequest`) adja a saját
`send` helyett; az átirányítás-teszt két üzenet-regexe a közös segéd szövegéhez igazodott (`/https/i`, `/Nem engedélyezett cél/`) — az
állítások (titkosítatlan / idegen célra nincs kérés) változatlanok. A DB statement_timeout-teszt a Drizzle által csomagolt `cause`-t
vizsgálja.

## 2026-11-22 — 6. vak kör (91c02d2c, utólagos) — javító PR `fix/kisfilm-leallitas-hatarido`

- **L1 valódi (blokkoló)** — a kemény megszakítás eddig a Stúdió-kivárás és az ürítések UTÁN futott (legrosszabb esetben 298 s után,
  a 295 s-os kényszerkilépés mögött). Most `shutdownLessonClips(abortClipTranscodes, 60_000, 10_000)` a leállítás elején indul,
  párhuzamosan: 60 s kivárás → azonnali megszakítás → ≤ 10 s lezárás (kész ≤ 70 s). A legrosszabb esetű időszámítás az `index.ts`-ben
  a lánc mellett. Teszt: `tests/lesson-clip-shutdown-deadline.test.ts` (a megszakítás 60 s-nál fut, miközben a Stúdió-kivárás tart;
  forrás-őr: a lánc a `waitForActiveRuns` előtt, utána nincs külön megszakítás).
- **L4 valódi** — a szolgáltatói letöltés hibája strukturált kódot (`REDIRECT_NO_LOCATION`, `TOO_MANY_REDIRECTS`, `FORBIDDEN_TARGET`,
  `NON_PUBLIC_TARGET`, `BAD_URL`, `FETCH_FAILED`) és csak a hostot viszi; a query értéke nem kerül hibaüzenetbe és naplóba. Teszt:
  LW „szolgáltatói letöltési hiba: … a query értékét nem”. Dokumentált változás: az átirányítás-teszt két üzenet-regexe a kódokra vált
  (`/BAD_URL/`, `/FORBIDDEN_TARGET/`) — az állítás (nincs kérés titkosítatlan / idegen célra) változatlan.

### Kanban-jegyek (ebben a PR-ban nem javítva)

- **K-418-L2 (közepes)** — az árvamédia-söprésnek nincs teljes határideje és leállítási jele: 50 adag × 15 s `statement_timeout`
  elméletben 750 s; elnémult PG-kapcsolatnál a `statement_timeout` nem korlátozza a Node várakozását; a nyers lock/unlock a
  határidőn kívül fut. Javasolt: teljes söprési határidő, leállításkor új adag tiltása, kliensoldali megszakítás, a nem megbízható
  zárkapcsolat eldobása (nem visszaadása a poolnak). Teszt: shutdown közben futó többadagos söprés.
- **K-418-L3 (közepes)** — a fejezet párhuzamos képválaszaira nincs közös bájtkeret: 4 × 24 MiB törzs + a `Buffer.concat` célbuffer
  ≈ 120 MiB számított csúcs a képolvasásban (nem mért OOM). Javasolt: közös bájtkeret vagy szűk sor a nagy képolvasásra / dekódolásra,
  a határokat a példány tartalékából méretezve; mérés több egyidejű szolgáltatói törzzsel.
- **K-418-L5 (kicsi)** — az első `/clips` kérés átmeneti 502-je után nincs újrapróba (csak ismert `pending` után). Javasolt: az első
  hálózati / 5xx hibát is korlátosan, csendben újrapróbálni a 30 perces kereten belül; az érvényes `pending:false` lezár. Teszt:
  Playwright, első kérés 502 → `pending:true` → kész.
