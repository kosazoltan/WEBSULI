# Végrehajtás — Játékélmény (J0–J9), közös többjátékos mód, párbaj és játékos-fiók (JM0–JM11), évfolyam-bank (JB)

Terv (kötelező forrás, döntései nem bírálhatók felül): `docs/specs/2026-11-16-jatekok-jatekelmeny.md`.
Szabály: `docs/agent-haromfazisu-munka.md` (ez a 2. fázis). Kiindulás: `main` HEAD `86a39ae2`.
Minden sorszám-horgony a `86a39ae2` állapot szerint, kódból ellenőrizve (Grep + részolvasás, 2026-11-16). Ha a `main`
időközben változott, a horgonyt a megadott függvény- / konstans- / testid-név alapján keresd meg újra (`grep -n`), a
sorszám csak tájékoztató. Rövidítések: `P/` = `source/client/src/pages/`, `GE/` = `source/client/src/game-engine/`,
`L/` = `source/client/src/lib/`, `T/` = `source/tests/`, `S/` = `source/server/`.

Szeletek és sorrend (részletek a hullámtervben, H. fejezet):

| Szelet | Ág | Tartalom | Modell | Becsült diff |
|---|---|---|---|---|
| J0a | `feat/jatek-j0a-determinizmus` | `shared/game-rng.ts`, fix lépés (`loop.ts`), rázás / hitstop (`feel.ts`), mini-Director, determinizmus-őr | Opus | ~450 sor (ebből ~200 teszt) |
| J0b | `feat/jatek-j0b-learning-core` | tanulási mag: típusok, ismétlési sor, áramlat, kombó, hullám, menet-statisztika, kérdés-ütemező, szimulációs harness, etikai és score-őr | Opus | ~650 sor (ebből ~350 teszt) |
| J0c | `feat/jatek-j0c-play-ui` | közös UI: `InlineQuestion`, `WhyButton`, `ResultReview`, felolvasás, beállítás, teszt-kampó bővítés, hang-receptek, „play-lab” próbaoldal, `game-win-paths` esetfájlokra bontása | Opus | ~550 sor |
| J1a/b/c | `feat/jatek-j1{a,b,c}-szokoar` | Szökőár: mag + sávfutás / kapukérdés / mentőöv, Örvény + Nagy Hullám / Hallott szó | Opus | 3 × ~400 |
| J2a/b | `feat/jatek-j2{a,b}-szoletra` | Szólétra: mag + szó-kapaszkodó + rivális / kövek, Szélsas, hallás utáni kérdés, kötél | Opus | 2 × ~400 |
| J3a/b/c | `feat/jatek-j3{a,b,c}-kockavadasz` | Kockavadász: kérdés nélküli bányászat + Rúna-zár / nappal–éjjel, sebző mobok / Kraft + Kő-gólem | Opus | 3 × ~450 |
| J4a/b | `feat/jatek-j4{a,b}-matek` | Matek: Neon védőtorony mag + drón-célpont / hullámok, Hibagyár, Zéró-robot, Számlánc, Becslő-bomba | Opus | 2 × ~450 |
| J5a/b | `feat/jatek-j5{a,b}-brainrot` | Brain Rot: aréna-mozgás + Ketrec-zár + valós óra / rivális, Visszalopás, Arany lény, Tolvajkirály | Opus | 2 × ~450 |
| J6a/b | `feat/jatek-j6{a,b}-aszteroida` | Aszteroida: kapuk megszüntetése + Kristály-válasz + életalapú vég / Gyenge pont, Mentő-pajzs, `recordRun` javítás | Sonnet (a), Opus (b) | 2 × ~350 |
| J7a/b/c | `feat/jatek-j7{a,b,c}-tornado` | Tornado: javítások (horgony, fejlesztések, pont-bontás, `MATH_4`, `runStreak`) / útelágazás + turbó / zajpálya + műszer-kalibrálás + szupercella | Sonnet (a), Opus (b, c) | 3 × ~400 |
| J8 | `feat/jatek-j8-meta` | meta-fejlődés (szint, feloldás, gyűjtemény, csillag) + játéklista-kártyák | Sonnet | ~450 |
| J9 | `feat/jatek-j9-zaras` | záró mérés: szimulációs mátrix, bot-futás, teljesítmény, átfogó review, éles próba, retro | Opus | ~300 + mérési dokumentum |
| JM0 | `fix/jatek-jm0-adatvedelem` | ranglista becenévre, e-mail ki a naplóból, score sebességkorlát + opcionális `runId` | Sonnet | ~200 |
| JM1 | `feat/jatek-jm1-parbaj-arena` | `shared/duel/` szabálymotor (kész, #447; az egyeszközös aréna a JM1r-ben megszűnt) | Opus | ~450 |
| JM1r | `refactor/jatek-jm1r-egyeszkozos-torles` | egyeszközös aréna + `match.ts` törlése, bot-szimuláció és arany visszajátszás a `room-machine`-re, megjelenítő komponensek kiemelése, tervszöveg (D20) | Opus | ~−2100 / +700 |
| JM2 | `feat/jatek-jm2-rt-reteg` | Socket.IO `/api/rt/`, jegy, szoba-állapotgép, korlátok, drain, status, szerveroldali kérdéssor (`MP_MODE` off) | Opus | ~500 (két commitcsoport) |
| JM3a/b | `feat/jatek-jm3{a,b}-online-parbaj` | a: online párbaj 2 főre (szoba, kód / link / QR, váróterem, meccs, eredmény, visszavágó) + gépi ellenfél; b: 3–4 fő, reakciók, kirúgás, értesítések, offline e2e, szóbankos párbaj | Opus | ~900 + ~400 |
| JM4a/b/c | `feat/jatek-jm4{a,b,c}-…` | Matek / Szólétra / Szökőár online | Sonnet (b), Opus (a, c) | 3 × ~300 |
| JM5a–d | `feat/jatek-jm5{a..d}-…` | Kockavadász / Aszteroida / Brain Rot / Tornado azonos seed + állás-sáv | Sonnet | 4 × ~300 |
| JM6 | `feat/jatek-jm6-kihivas` | aszinkron kihívás-link | Sonnet | ~300 |
| JM7a/b | `feat/jatek-jm7{a,b}-fiok` | admin-jogosultsági mátrix + `player_accounts` + e-mailes belépés / játékos Google, becenév, avatar, fiókoldal | Opus | 2 × ~450 |
| JM8a/b | `feat/jatek-jm8{a,b}-pontkonyv` | pontkönyv szerver / kliens | Opus (a), Sonnet (b) | 2 × ~400 |
| JM9 | `feat/jatek-jm9-baratok` | barátok, heti baráti ranglista, párbaj-mérleg | Sonnet | ~400 |
| JM10 | `feat/jatek-jm10-osztaly` | osztálytermi mód | Sonnet | ~350 |
| JM11 | `feat/jatek-jm11-zaras` | terhelés, megfigyelhetőség, deploy-őr, átfogó review, retro | Opus | ~250 |
| JB | `feat/jatek-jb-evfolyam-bank` | évfolyam-bank 90 → ≥ 270 / évfolyam | Opus (gyártás) + Sonnet (vak megoldó) | adatfájl |

Kanban: a jegyeket az orkesztrátor veszi fel a repo-táblába (`D:\repo\WEBSULI\.hermes\kanban.db`) a szeletnevekkel
(`FEAT(jatekok): J<n><x> – <név>`); az alügynök csak jegyzetet ír (K.1/7).

---

## K — Közös rész (minden szeletre érvényes; minden alügynök ELŐSZÖR ezt olvassa el)

### K.1 Munkarend, kapuk, tesztintegritás, böngészős próba, commit / push / PR, záró jelentés

Az előző funkció K-része **változatlanul érvényes**, ott részletesen kifejtve:
`docs/specs/2026-11-15-jatekok-mobil-szobank-vegrehajtas.md` **K.1** (munkafa, `npm ci --prefix source`, a hat kapu
külön Bash-hívásban saját kilépési kóddal, célzott teszt, `npm run test:e2e -- tests/<spec>` vagy
`npx playwright test -c playwright.game-mobile.config.ts`, fájl írása eszközzel, kanban-jegyzet, hatókör, merge
tilalma), **K.2** (háromfázisú kapu), **K.3** (tesztintegritás), **K.4** (böngészős próba, képernyőképek), **K.5**
(commit üzenet fájlból, `.audit-ok` mindkét helyre külön hívásban, push külön hívásban, PR-leírás kötelező elemei),
**K.6** (záró jelentés formátuma). Ebben a funkcióban a következő eltérésekkel és kiegészítésekkel:

1. **Munkafa útvonala:** `.claude/worktrees/jatek-j<n><x>`; ág a fenti táblázat szerint; PR-cím:
   `feat(jatekok): J<n><x> – <rövid név>`; a PR-leírás első sora `J<n><x> / J0–J9` és a kanban-jegy.
2. **Háromfázisú kapu (K.2 megfelelője):** a szelet ELSŐ commitja ebben a fájlban a saját fejezeted `**Állapot:**` sorát
   írja át: `**Állapot:** folyamatban — ág <ág>, munkafa <útvonal>, kanban #<id>`. Csak a saját soradat. A kód külön,
   későbbi commitban. PR előtt: `node scripts/qa/three-phase-check.mjs --base origin/main` → `[három-fázis] OK: …`.
   **A kapu szabálya (CI „Háromfázisú rend”):** a PR SAJÁT diffjének tartalmaznia kell `docs/specs/*-vegrehajtas.md`
   változást, és ez nem lehet későbbi commitban, mint az első kódcommit — ezért az első commit mindig a szelet
   állapotsora. Pusholt ágon a sorrend utólag nem javítható (rebase / force-push tilos): csak új ággal és új PR-ral
   (`docs/agent-csapdak.md` C-37).
3. **Képernyőképek (K.4 megfelelője):** `docs/measurements/jatekok-jatekelmeny/J<n><x>/<játék>-<sz>x<m>-<állapot>.jpg`,
   JPEG q70, szeletenként ≤ 10 db, egyenként ≤ 150 KB. Kötelező állapotok játékszeletben: `start`, `play`,
   `question` (nyitott, nem blokkoló kérdés a játék közben), `wrong` (hibás válasz utáni megoldás-kijelzés), `boss`
   (ahol a szelet hozza), `result`. Nézetek: 360×640, 390×844, 844×390 (Tornado: a fekvő elsődleges).
4. **Commit-üzenet vége:** `Co-Authored-By: <a ténylegesen dolgozó modell neve> <noreply@anthropic.com>`.
5. **Modell-szint:** a táblázat „Modell” oszlopa; Opus-szintű a közös szerződést, nagy játéklap-átírást vagy új
   játékmagot érintő munka; Sonnet-szintű a jól körülírt javítás / bekötés.
6. **Stop and Ask** (AGENTS.md): közös fájl módosítása a saját szeleteden kívül → ORKESZTRÁTOR-KÉRÉS a záró jelentésben,
   nem módosítod. Közös fájlok ebben a funkcióban: `GE/play/*` (csak J0a–J0c, J8), `source/shared/game-rng.ts` (csak J0a), `source/shared/duel/*` (csak JM1, JM2, JM1r, JM3a/b), `S/realtime/*` (csak JM2, JM3a/b, JM11), `GE/game-test-hooks.ts` (csak J0c),
   `L/audioEngine.ts` (csak J0c, J8), `L/tts.ts` (senki), `GE/mobile/*` (senki; ha kell: ORKESZTRÁTOR-KÉRÉS),
   `source/client/src/index.css` (csak J0c, J8), `P/Games.tsx` (csak J8), `T/support/game-mobile-quality.ts` (senki;
   a játékszelet a saját `T/game-mobile-cases/<játék>.ts` esetfájlját módosítja), `source/client/src/App.tsx` (csak J0c).
7. **Közös tesztfájlok, régiónként:** `T/game-feedback-wiring-guard.test.ts` — a SpeedQuiz-ág (77–116. sor) csak J4a,
   a WordLadder-teszt (120–133. sor) csak J2a; a `WIRED` lista (33–41. sor) változatlan. `T/game-explanation-pause.spec.ts`
   csak J2a. `T/game-win-paths.spec.ts` J0c-ben játékonkénti esetfájlokra bomlik (`T/game-win-cases/<id>.ts`), utána
   mindenki csak a saját esetfájlját módosítja.
8. **Spec-változás jelölése tesztben:** `// SPEC-VÁLTOZÁS 2026-11-16 (docs/specs/2026-11-16-jatekok-jatekelmeny.md 9.)`
   — csak a terv 9. szakaszában felsorolt esetekre; a helyettesítő teszt az új (nem lazább) követelményt méri.
9. **Ellenőrzés-lánc:** minden kapu külön hívásban, kimenet fájlba, `echo "<kapu>=$?"` (memória „Ellenőrzés-lánc”);
   az e2e-t a CI-vel azonos úton is (`npm run test:e2e -- tests/<spec>`), nem csak Vite-tal (C-33).
10. **Scratchpad:** párhuzamos alügynök saját almappát használ (`<scratchpad>/j<n><x>/`) (C-30 megelőzés 3).
11. **Spec-változásos tesztek szeletenként:** a terv 9. szakaszának táblázata (fájl:sor) pontosan megmondja, melyik szelet
    melyik meglévő tesztet cseréli (`T/remaining-learning.spec.ts:39-106` és `T/learning-flow.browser.ts:148-175` és
    `T/coupon-lesson.browser.ts:4-43` → J6a; `T/remaining-learning.spec.ts:123-133` → J1a; `T/coupon-expired-layer.browser.ts:117-126`
    → J5a; `T/game-viewport-experience.spec.ts:120-146` és a G-1 őr 77–116. sora → J4a; a G-1 őr 120–133. sora és
    `T/game-explanation-pause.spec.ts` → J2a). Ezen kívül meglévő teszt nem módosulhat; a tiszta függvényeket néző tesztek
    (pl. `T/tsunami-think-time.test.ts` a `tsunamiQuizSeconds`-ot, `T/brainrot-tuning.test.ts` a kor-fagyasztás tiszta
    függvényét) változatlanok maradnak — a függvények megmaradnak akkor is, ha a lap már nem hívja őket.
12. **Flag-fegyelem (JM):** minden többjátékos / fiók-szelet úgy kerül a mainre, hogy a flag (`MP_MODE`, `MP_GAMES`,
    `PLAYER_ACCOUNTS`, `PLAYER_POINTS`) alapértéke mellett semmi félkész nem látszik; a flag-állítás (Render env) az
    orkesztrátor lépése a szelet ellenőrzése után, az aktív futások őre mellett.

### K.2 Új közös szerződések (J0b, J0c hozza létre; a játékszeletek erre építenek)

A pontos interfészek a J0b és J0c fejezetben. Összefoglaló a szerződés-pontokról, amelyektől eltérni csak orkesztrátori
jóváhagyással szabad:

- **Kérdés-életciklus:** a játék a `QuestionDirector`-tól kap `QuestionPresentation`-t (`tick` vagy `request`), a
  válaszcélokat a saját világában rajzolja (kapu, drón, ketrec …), és a választást `director.answer(id, optionIndex,
  simNowMs)`-mel adja vissza; lejáratkor `director.expire(simNowMs)`. A director idempotens a kérdés-azonosítóra.
- **A szimuláció a kérdés alatt fut:** a játék a kérdés alatt a `presentation.slowMo` (≥ 0,35) szorzóval lépteti a
  szimulációt; 0 csak szünet / „Miért?” / kupon / háttér esetén.
- **Hibás válasz:** a játék ≥ 1,8 mp-ig kijelzi a helyes célt (`reveal`), a director az ismétlési sorba teszi a tételt,
  blokkoló kártya NINCS; a `WhyButton` a `QuizFeedbackCard`-ot nyitja szünettel (a `buildFeedback` hívás és a
  `<QuizFeedbackCard` JSX a lapon marad — G-1 őr).
- **Forrásrend:** menet közbeni esedékes ismétlés → nem látott tananyag → menetek közötti esedékes ismétlés (legfeljebb
  minden 2. kérdés) → új tétel (szóbank / évfolyam-bank / kézi bank, a játék meglévő választó logikájával). Kupon módban
  csak tananyag (meglévő szabály).
- **Meglévő testid-ek maradnak (terv 9.):** a kérdés-sáv játékonként a régi azonosítókat hordozza (`ts-quiz`, `ts-prompt`,
  `ts-option-<i>`, `ts-quiz-pause`, `wl-prompt`, `wl-option-<i>`, `bc-quiz`, `bc-prompt`, `bc-quiz-pause`, `sq-answers`,
  `br-quiz`, `br-quiz-pause`, `tornado-quiz`, `sa-quiz-pause`) — az `InlineQuestion` `testId` / `optionTestId` / `pauseTestId`
  propjain át; a `play-question` / `play-option-<i>` csak az alapérték (próbaoldal, új játékrészek).
- **Kompatibilis álnév:** a `forceState({ phase: "quiz" })` minden átírt játékban azonnal nyit egy kérdést.
- **Determinizmus (J0a):** a sim seedelt `createRng`-et használ (`source/shared/game-rng.ts`), a hurok `createFixedLoop`-ot,
  a kérdés alatti lassítás `loop.setTimeScale(presentation.slowMo)`; a `probe().simTime` a `loop.simTimeMs()`.
- **Teszt-kampó:** `forceState({ question: true })` azonnali kérdést nyit; a `probe()` kötelező mezői minden átírt
  játékban: `simTime` (ms), `questionOpen` (0/1), `questionsAnswered`, `questionsCorrect`, `fps`, `band`, `intensity`.
  A kérdés-sáv gyökere `data-testid="play-question"`, a válaszcélok DOM-gombjai `data-testid="play-option-<i>"`
  `correctDataAttrs`-szal (vászonra rajzolt célpontnál is van láthatatlan, de elérhető DOM-gomb-réteg a
  billentyűzetes / akadálymentes választáshoz — terv 8.11).
- **Determinizmus:** a játékmag RNG-je `createRng(readGameSeed() ?? seedFrom(gameId, …))` (`createRng`, `seedFrom` a
  `@shared/game-rng`-ből; `readGameSeed` a `GE/game-test-hooks.ts`-ből). A seedet a játéklap állítja elő és adja át a
  magnak; a sim-magban `Date.now` / `Math.random` tilos (őr: `T/game-sim-determinism-guard.test.ts`). A régi
  `mulberry32(… ?? Date.now())` minta csak a meglévő hívóknál marad, új kódba nem kerül.
  Jutalom-kiosztásban `Math.random` tilos (őr: J0b `game-ethics-guard`).
- **Menet-statisztika:** a `ResultScreen` `correct` / `total` a director `stats()`-ából jön; a `recordRun`
  (`L/achievements.ts:250`) `correctAnswers` / `wrongAnswers` mezői valós kérdés-számok.
- **Pontszám-szerződés:** `POST /api/games/score` zod-sémája (`S/routes.ts:1298-1304`) és a `gameId`-k változatlanok;
  `runStreak` = a menet legjobb kombó-sorozata (`ComboState.best`).

#### Megvalósult eltérések (J0a #442, J0b #444) — ezek az érvényesek a fenti szerződés helyett

A pontos szignatúrát mindig a forrásból olvasd (`GE/play/*`, gyűjtő-export `@/game-engine/play`; `source/shared/game-rng.ts`;
`T/support/game-sim.ts`).

- **Hitstop = a hurok tartása:** `FixedLoop.holdFor(ms)` + `holdRemainingMs()` (additív); a `feel.hitstop` ezt kéri, NEM a
  `setTimeScale(0)`-t (az felülírná a hitstop alatt kért szünetet, és a lejárat a hívási sorrendtől függne). A hitstop csak azt
  tolja el, MIKOR fut egy lépés a valós időben, azt nem, MI történik benne. Valós időhöz kötött óra (kupon, menet-időkorlát) ne a
  sim-időből számoljon.
- **`setTimeScale` korlátoz:** (0; 0,35) → 0,35, > 1 → 1, negatív → 0, NaN → `RangeError`.
- **`shakeOffset().rot` radián** (CSS-hez `rot * 180 / Math.PI`).
- **RNG:** `createRng(3)` ≡ `createRng("3")`; `seedFrom` `:`-tal fűz, a részen belüli `:` és `\` escape-elt. Minden `rng`
  paraméter `RandomSource` (`() => number` vagy `Rng`), `toRandom(rng)` egységesít.
- **Director-küszöbök:** csúcs `PEAK_ENTER = 0.7`, pihenő `RELAX_ENTER = 0.25`.
- **A `simNowMs` a LASSÍTATLAN kérdés-óra:** szünetben áll, a `slowMo` NEM lassítja (különben a 4 mp-es ablak 0,35×-nél
  11,4 valós mp lenne, J10). A játék a nem szüneteltetett valós időt (vagy lépésszám × `SIM_STEP_MS`-t) adja át, ne a
  lassított világ-időt.
- **Egy director = egy menet:** a `createQuestionDirector` maga hívja a `review.startRun()`-t; hibás konfigurációra `RangeError`.
- **Ismétlés arány-korláttal:** a menet bármely pontján `ismétlések + 1 ≤ 0,3 × (sorszám + 1)` (nem merev „minden 3.”); menet
  közbeni sorrend három sávban (időben visszahozható → késő → többi); `dueInRun(runIndex, exclude?)`,
  `dueAcrossRuns(now, exclude?)`; a `record(q, "correct", …)` sorban nem lévő kulcsra nem csinál semmit.
- **Az ismétlési sor KÖZÖS a hét játékban:** a provider által vissza nem állítható (idegen) kulcsot a director a menet végéig
  átugorja és a sorban hagyja (nem torlaszolja el a sort); 60 nappal az esedékesség után kikerül (`REVIEW_STALE_MS`).
- **`play/clock.ts` `wallClockMs()`:** CSAK a menetek közötti (naptári) térközhöz; szimulációban tilos.
- **`RunStatsSnapshot`:** új mezők `minGapBossSec`, `reviewReturnWithin10`; `minGapSec` csak az ütemezett / játék kérte
  indításokat méri; `perMinute` a teljes menetidőre vetít; adat híján a minimumok `Infinity`.
- **Harness:** `skillRoll = u / skill`, a játék akkor ítél sikert, ha `skillRoll < 1`; a `SimGame` maga hívja a director
  `expire`-jét lejáratkor.
- **Új score-hívás** `runId: newScoreRunId()`-vel (JM0, `game-score-contract-guard`).

#### Megvalósult eltérések (J4a pilot #451 és a közös utójavítás — `fix/jatek-play-kozos-utojavitas`, kanban #51)

**Állapot (közös utójavítás):** kész — #457 (ef43d4ca, 2026-11-16), kanban #51; a J2a-ból maradt 2. közös utójavítás (index.css régi Szólétra-szabályok, `revealCorrectMs`, `rng` opció, narancs hibás lap) nem indult

- **Évfolyamhoz kötött ismétlés (#451):** `PlayQuestion.grade`, `ReviewItem.grade` (`{ v: 1, rev: 2 }`), `reviewFitsGrade`,
  `inferReviewGrade`; a director a menet `config.grade`-jét bélyegzi és csak azonos évfolyamú ismétlést ad vissza.
- **Közös meghajtó-minta (#451):** a lap és a node-szimuláció UGYANAZT a meghajtót hívja (fix lépés, időskála, hitstop) — saját
  `dt × timeScale` lépéssel a sim más ellenfélsort mér (a `waves.ts` lépésenként fogyaszt RNG-t).
- **`calm()` a kezdő fázisban (utójavítás a):** a mini-Director `calm()`-ja alacsony szintnél (`intensity < RELAX_ENTER`) a
  kezdő „buildup” fázisban is igaz — különben csúcs nélküli menetben csak a kényszerített (maxGap) kérdések jöttek.
- **`createQuestionUi` React-mentes fájlban (b):** `play/questionUi.ts`; a `useQuestionDirector.ts` re-exportálja.
- **Érintés mozgó célpontra (c):** `pointerTapHandlers` (`play/pointerTap.ts`) — felengedéskor véglegesít, ha az ujj a cél
  AKTUÁLIS dobozán belül (± tűrés) vagy alig mozdult; elhúzás / `pointercancel` = visszavonás; mutatónként; NEM `click`
  (több ujjnál a nem elsődleges mutatóra nincs `click`).
- **Mozgó cél a mobil mérőben (d):** `GameMobileCase.quizMoving` — stabil doboz helyett N egymást követő mintán érintési
  méretű és a képernyőn belüli cél; a meglévő esetek viselkedése változatlan.
- **A K.1 „`onRetry=` → 0 találat” elfogadási grep pontosítása (e):** a tiltás a MAGYARÁZÓKÁRTYA újrapróbájára vonatkozik
  (`<QuizFeedbackCard … onRetry=` / `retryTask`), nem a `ResultScreen` „Új futam” (új menet) propjára; a grep:
  `grep -nE "<QuizFeedbackCard[^>]*onRetry=|retryTask" P/<lap>.tsx` → 0 találat.

### K.3 Etikai ellenőrzőlista (minden játékszelet PR-leírásában pipálva)

- [ ] nincs veszteségkerüléssel fenyegető szöveg vagy visszaszámláló a menün kívül (terv 4.2);
- [ ] jutalom determinisztikus, `Math.random` nincs a jutalom-kódban; nincs jutalomdoboz;
- [ ] a menet vége után nincs automatikus újraindítás;
- [ ] a hibás válasz szövege bátorító (a `buildFeedback` `ageBand: "kid"` hangneme, `GE/feedback.ts:116`);
- [ ] a kupon-réteg mindenek fölött (a `coupon-expired-all-games.spec.ts` zöld);
- [ ] csökkentett mozgásnál nincs rázás / villogás (M9 zöld);
- [ ] `T/game-ethics-guard.test.ts` zöld.

### K.4 Mobiljáték-minőségi kapu — 30 pont (szeletenként KÖTELEZŐEN kitöltendő)

> Forrás: `kutatas/4-jatekfejlesztoi-gyakorlat.md` 11. fejezet (a forrásolt szabályok ott, [F]-hivatkozásokkal). Minden
> játékszelet (J1–J8, JM3–JM5) PR-leírása a 30 pontot tartalmazza: `[x]` + bizonyíték (teszt / mérés / grep / képernyőkép),
> vagy `N/A` + ok (pl. 2D-s Matek-réteg a three-pontoknál). Nem teljesített pont: NOT DONE + ok + javító szelet. A
> küszöbszámok a kutatás javaslatai (nem forrásadatok), valódi eszközön nem igazoltak — ezért mérjük őket.

**Teljesítmény**
1. A renderer `createGameRenderer`-rel jön létre (`GE/three-look/renderer.ts`), a pixelarány ≤ tier-plafon (low 1 / medium 1,5 / high 2; `GE/three-look/tier.ts:39-42`).
2. Low tieren ≤ 120, medium tieren ≤ 200 rajzolási hívás (`renderer.info.render.calls`, `?perf=1` mód).
3. A sim / update hurokban nincs `new THREE.*`, tömbmásolás vagy closure-gyártás (grep-kapu).
4. Lövedék, részecske, ellenség és lebegő szöveg poolból jön, a kapacitás előre rögzített.
5. Ismétlődő tárgyak `InstancedMesh` / `BatchedMesh`-ben; mozgatás után `computeBoundingSphere()`.
6. Árnyék csak medium / high tieren; statikus világban `shadowMap.autoUpdate = false`.
7. `webglcontextlost` kezelve (szünet + „Grafika újraindítása” gomb), a cleanup minden geometriát, anyagot, textúrát eldob; a `renderer.info.memory` 10 → 60 s között nem nő.
8. 4× CPU-lassítással nincs 50 ms feletti hosszú feladat játék közben.

**Hurok és szerkezet**
9. Fix 1/60 s-os szimulációs lépés akkumulátorral (`GE/play/loop.ts`), képkockánként ≤ 5 lépés, interpolált rajz.
10. A képkocka-hurokban nincs React `setState`; a HUD ≤ 10 Hz-es pillanatképet kap.
11. A fázisok explicit állapotgépen mennek át (`menu / countdown / playing / paused / result`; a kérdés a `playing` alatti
    al-állapot), tiltott átmenet tesztmódban hibát dob.
12. A sim-ben egyetlen seedelt RNG (`source/shared/game-rng.ts`); `Math.random` / `Date.now` / `performance.now` nincs a sim-ben (J0a grep-őr).
13. Azonos seed → azonos pálya és kérdéssor (arany visszajátszás, `node --test`).

**Bemenet**
14. A játékvászon `touch-action: none`, a menük `manipulation`; a vezérlők `setPointerCapture`-t használnak, és `pointercancel`-re / `lostpointercapture`-re lezárnak.
15. Két ujj egyszerre működik (joystick + akció), Playwright-teszttel igazolva (C-34: mutációval, nem csak eseménnyel).
16. Minden érintési cél ≥ 48 CSS px, az akciógombok ≥ 64 px, egymástól ≥ 12 px-re; balkezes tükrözés elérhető.
17. Van egyujjas vezérlési mód.

**Játékérzet és akadálymentesség**
18. Minden találat kép + hang (+ ahol támogatott, rezgés) visszajelzést ad ugyanabban a képkockában (< 100 ms).
19. A rázás trauma²-alapú és plafonozott (`GE/play/feel.ts`); csökkentett mozgásnál 0, helyette nem mozgó jelzés.
20. Nincs 3/s-nál gyakoribb teljes képernyős villanás, és nincs telített piros villanás (a hibajelzés narancs / körvonal).
21. Minden ellenséges támadásnak ≥ 400 ms (bossnál ≥ 600 ms) előjelzése van.
22. Hang: az `AudioContext` gesztusra indul, rejtett lapon szünetel; ≤ 8 egyidejű effekt; a némítás tartósan tárolva.

**Tananyag-integráció és tervezés**
23. A kérdés eredménye 2 s-on belül játékbeli következményt hoz (fegyver, horgony, sáv, érc), nem csak pontot.
24. A rossz válasz nem okoz azonnali menetvégét, csak erőforrást vesz el (kivétel: a mentőöv / mentő-pajzs utolsó esélye, ahol a menet már véget érne).
25. Az első 30 s tanító szakasz: egy mechanika, halál nélkül, szöveg ≤ 1 sor.
26. A menet íve 2–5 perc (botmérés: a medián ebben a sávban).

**Etika és többjátékos mód**
27. Nincs valódi pénz, loot box, időkorlátos ajánlat, „elveszíted”-üzenet vagy elrejtett kilépés (K.3, `T/game-ethics-guard.test.ts`).
28. Párbajban a pontot a szerver számolja, a helyes választ a kliens a `round_reveal` előtt nem kapja meg, és csak az első válasz számít.
29. Megszakadt kapcsolat után a játékos ≤ 60 s-on belül visszatér, és teljes állapotot kap.
30. Személyes adat nem kerül URL-be, naplóba vagy szobakódba; a vendég beceneve generált, a regisztrálté szűrt.

### K.5 Kötelező kódszabályok (20) — a review ezeket kéri számon

> Forrás: `kutatas/4-jatekfejlesztoi-gyakorlat.md` (J-, P-, T-, S-, D-, E-, H-, Q-, M-ajánlások), a szerkesztett, kötelező
> változat. Megsértésük review-lelet (fájl:sor).

- **KSZ-1** Rétegrend: `L/<játék>/` sim (tiszta TS) → three-nézet (csak olvas és interpolál) → React UI. A sim nem hív
  hangot, DOM-ot, three-t, Reactot; eseményeket bocsát ki (`hit`, `pickup`, `question`, `bossPhase`), ezekből a nézet és a hang dolgozik.
- **KSZ-2** Egyetlen seedelt RNG a sim-ben (`createRng(seed)` a `source/shared/game-rng.ts`-ből); kozmetikai szóráshoz
  külön `fxRng`. `Math.random` csak a sim-en kívül, kozmetikára.
- **KSZ-3** A seed: `seedFrom(gameId, dátum | szobakód | kihívás, kör)`; a napi kihívás az `L/dailyChallenge.ts` FNV-mintájára épülhet.
- **KSZ-4** Fix 1/60 s lépés, ≤ 5 lépés / képkocka, interpoláció (`GE/play/loop.ts`); a kérdés alatti lassítás a
  loop szorzója (≥ 0,35), nem a `dt` torzítása.
- **KSZ-5** A forró hurokban nincs allokáció (`new THREE.*`, `[...arr]`, `.map/.filter` új tömbbel, closure); modul-szintű
  ideiglenes vektorok (minta: `P/TornadoHunter200.tsx:2450-2510`).
- **KSZ-6** Pool minden gyakran születő objektumra (lövedék, aszteroida, drón, kapu, részecske, lebegő szám); „halott” elem `visible = false`.
- **KSZ-7** Ismétlődő tárgy `InstancedMesh`; különböző alak közös anyaggal `BatchedMesh`.
- **KSZ-8** Minden renderer `createGameRenderer` + `webglcontextlost` / `webglcontextrestored` kezelés (a mostani eltérés:
  `P/BlockCraftQuiz.tsx:1815`, `P/SpaceAsteroidQuiz.tsx:1340`, `P/TornadoHunter200.tsx:1438` saját `new THREE.WebGLRenderer`).
- **KSZ-9** React `setState` nincs a képkocka-hurokban; a HUD 10 Hz-es pillanatképet kap (mostani eltérés: Brain Rot
  entitás-tömbök React-állapotban `P/BrainRotSteal.tsx:324-325, 853-868`; Szökőár `setSafeZoneX` a hurokban `P/TsunamiEscapeEnglish.tsx:1159`).
- **KSZ-10** Képernyőrázás csak a `feel.addTrauma`-n át (trauma², lecsengés, plafon), csökkentett mozgásnál 0; hitstop
  40–120 ms valós időben, 150 ms-on belül nem ismétlődik, csak a sim áll (hang és részecske-kezdőlöket nem).
- **KSZ-11** Előjelzés → esemény → utóhatás: ellenséges támadás és kérdés-kapu előtt ≥ 400 ms (boss ≥ 600 ms) vizuális előjelzés.
- **KSZ-12** Megbocsátó bemenet: sávváltás-puffer 120 ms; a célpont találati gömbje 15–25%-kal nagyobb a látványnál.
- **KSZ-13** Bemenet → visszajelzés < 100 ms; koppintásra `pointerdown`-on reagálunk, a válasz-véglegesítés `pointerup`-on a célon belül.
- **KSZ-14** Minden mutató `pointerId` alapján; `setPointerCapture`, `pointerup` / `pointercancel` / `lostpointercapture` lezár.
- **KSZ-15** Mini-Director (`GE/play/director.ts`): intenzitás-fázisok; az ütemezett kérdés a pihenő / lecsengés fázisra esik;
  a rossz válasz erőforrást vesz el, nem életet.
- **KSZ-16** Gumiszalag csak kicsi és nyílt: lemaradáskor legfeljebb +10% segítség / −10% ellenséges tempó; párbajban a
  pontokra nincs gumiszalag.
- **KSZ-17** Hang: egy közös `AudioContext`, `resume()` az indító gesztuson, `visibilitychange`-re felfüggesztés, ≤ 8
  egyidejű effekt (típusonként ≤ 3), ugyanaz az effekt 40 ms-on belül nem indul újra; hangfájl csak CC0, licencnaplóval.
- **KSZ-18** Minden fontos hangnak vizuális párja van; semmi nem csak hangon közöl információt.
- **KSZ-19** Többjátékosban a szerver a tekintély: a kliens szándékot küld (opcióindex, haladás), a pontot és a helyességet a
  szerver számolja; minden kliensüzenet `cid` + zod-validálás; csak az első válasz számít.
- **KSZ-20** Személyes adat (e-mail, valódi név, token) nem kerül URL-be, naplóba, szobakódba, Socket.IO-eseménybe; a
  belépőjegy a Socket.IO `auth` mezőjében megy.

### K.6 Szimulációs harness és determinizmus (J0a, J0b hozza létre; minden játékszelet használja)

Minden játék a saját `L/<játék>/sim.ts` (vagy a meglévő `lib/` könyvtárában) modulban **`createSimGame(opts)`**-t
exportál, amely a játék TISZTA magját (pacing, ütemező, pontozás, vesztési feltétel) futtatja React és three.js
nélkül, a `T/support/game-sim.ts` `SimGame` interfésze szerint (J0b). A játékszelet tesztje (`T/<játék>-sim.test.ts`)
20 seeddel × 180 mp-et futtat a `SIM_AVERAGE` játékossal, és a terv 6.2 küszöbeit ellenőrzi (medián). Kérdés nélküli
módban (`questions: false`) igazolja, hogy a menet végigjátszható és van vesztési feltétel. Arany visszajátszás: fix
seed + rögzített bemenetsor → a végállapot hash-e egyezik (ugyanazon a gépen).

**Közös meghajtó (J4a pilot, kötelező):** a sim NE saját `dt × timeScale` lépéssel fusson — a lap és a sim ugyanazt a
meghajtót hívja (fix lépésű hurok, időskála, hitstop, esemény-ürítés; minta: `L/speedMath/core.ts` `createTowerDriver`),
és egy teszt igazolja, hogy lépés-indexhez kötött bemenettel eltérő képkocka-időknél bitre azonos az állapot (a J4a pilot tanulsága: más lépésméretű sim más ellenfélsort mért).

**A játéklap determinizmus-őre (`T/game-sim-determinism-guard.test.ts` `GAME_PAGE_ALLOW`, J4a):** a sim-mag mellett a
játéklap játékmenet-kódja sem húzhat `Math.random`-ot / `Date.now`-t (feladat-, elterelő-, célpont-sorsolás a menet seedelt
RNG-jéből; a közös választók `rng` paramétert fogadnak: `pickGradeQuiz({ rng })`, `createVocabSource({ rng })`,
`pickFreshTask({ rng })`). Egy átírt lap felvétele: a `GAME_PAGE_ALLOW` objektumba új kulcs a lap fájlnevével, értéke a
megengedett előfordulások listája `{ re, why }` alakban — CSAK a seedelt forrás lusta alapértéke vagy tisztán kozmetikai,
a játék kimenetelét nem érintő hívás, indoklással. Az őr az engedélyezett mintákat kivágja, a maradékban a két tiltott
forrást keresi, és bukik, ha egy engedélyezett minta már nincs a lapon (elavult lista). A nézet-kód `performance.now`-ja
(rAF, hang-ritkítás) megengedett. Kozmetikai véletlenhez külön `fxRng` (seedelt) ajánlott.

**Játékonkénti átalakítási méret (determinizmus, a 4. kutatás leletei kódból újraellenőrizve, 2026-11-16):** a táblázat
sora az adott játék „a” al-szeletének kötelező része.

| Játék | `Math.random` a lapon (+ lib) | Saját renderer `createGameRenderer` nélkül | React-állapot / változó `dt` a hurokban | Becsült kiemelés |
|---|---|---|---|---|
| Szökőár (J1a) | 3 | nincs (a jelenet `GE/scenes/TsunamiScene3D.tsx`) | `setSafeZoneX` a hurokban (`:1159`); változó `dt` (`:1116`) | közepes (a futás új mag) |
| Szólétra (J2a) | 0 | nincs | nincs játékhurok (időzítők) | kicsi |
| Kockavadász (J3a) | 31 (+ `L/voxelcraft.ts` 4) | `P/BlockCraftQuiz.tsx:1815` (`antialias: true` fixen) | változó `dt` a `step`-ben | nagy (világgenerálás seedelése) |
| Matek (J4a) | 4 | nincs (`MathTowerScene3D` a közös réteggel) | `setInterval` óra (`:1613-1645`) | közepes (új mag) |
| Brain Rot (J5a) | 13 (+ `L/brainRotTuning.ts` 1) | nincs (`BrainRotArena3D`) | entitás-tömbök React-állapotban (`:324-325, 853-868`); változó `dt` (`:834`) | nagy (állapot ki a Reactból) |
| Aszteroida (J6a) | 17 | `P/SpaceAsteroidQuiz.tsx:1340` | változó `dt` (`:1503`) | közepes |
| Tornado (J7a) | 4 (+ `L/tornado/questions.ts` 3, `wind.ts` 1) | `P/TornadoHunter200.tsx:1438` | futás-seed `Math.random`-mal (`:1924`); változó `dt` (`:1547`) | közepes |

### K.7 Cloze rövid játék-alak (hibajavítás)

**Állapot:** kész — #455 (62f50954, 2026-11-16), kanban #50

- **Tünet:** a szóbank hiányos mondatos kérdése a játékban „Melyik illik a mondatba? <mondat _____-val> (Magyarul:
  <teljes fordítás>)”. (1) Hosszú: a `fitsAllViewports(...).ok` (a szint évfolyamán: 0→3., 1→5., 2→7., 3→9., 4→11.)
  a 6614 cloze-tételből csak 38,3% (a 0. szinten 0%, az 1.-en 4–14%); a `promptFits` szűrő hátrasorolja, így a cloze
  eltűnne a játékokból. (2) Elárulja a választ: a fordításban a helyes opció `hu`-ja szó szerint 71,4%-ban, tő-egyezéssel
  85,2%-ban benne van (nyelvenként 83–87%).
- **Mérés (teljes bank, scratchpad `cloze/`):** a prompt részei (medián szó): előtag 4 / mondat 5–7 / fordítás 5–7. A
  fordítás nélküli mondat 98,9%-ban `ok`. A fordítás NÉLKÜL, a mostani (azonos szófajú, bármely témájú) elterelőkkel
  150 tételes kézi mintán (nyelvenként 50) 36 tételnél (24%) több opció is védhető; a hibák zöme rövid keret
  („_____ ist warm.”, „Je lis _____.”) vagy azonos / rokon témájú elterelő (szín, szám, ruha, időjárás). A fordítás
  kitakart szóval sem segítene: a „_____ ist warm” → „A _____ meleg” ugyanúgy kétértelmű, és a hossz a 0. szinten
  27–46%-ra vinné az `ok` arányt.
- **Terv (additív `clozeStyle: "full" | "game"`; a „full” a mostani viselkedés és az alapértelmezés):** a játék-alak
  (a) csak a mondat a hiányjellel — előtag és fordítás nélkül; (b) csak ha a hiányon kívül ≥ 4 szó van a mondatban
  (különben a bejegyzés más kérdéstípust kap); (c) elterelő: azonos kind és szófaj (a névelő / szófaj ne árulja el), de
  sem azonos, sem rokon téma (szómező-párok), és a hiány előtti „a / an”, francia elízió („d’”, „l’”) vagy teljes alak
  („de”, „le”, „je” …) hangtani kényszerének megfelel; a `meaningsOverlap` és a fordítás-alapú kizárás megmarad; ha
  nincs 3 ilyen elterelő, a forrás az alaptípusra esik vissza; (d) a teljes mondat + fordítás a magyarázatban marad
  („Miért?”, megoldás-kijelzés). A játékok a `useVocabQuizSource`-on át kapják. Mellékes lelet: a `vocabPlayQuestion`
  `speakText`-je mindig a helyes term, a felolvasás (alap BE) így a magyar→cél és a cloze kérdésnél a kérdés
  megjelenésekor kimondja a választ — a generátor additív `VocabQuiz.speakText` mezőt ad (nem áruló szöveg), a
  bekötés közös fájlt és meglévő tesztet érint: ORKESZTRÁTOR-KÉRÉS.
- **Finomítás a vak ellenőrzés után (3 × 200 tétel, független megoldó, kulcs nélkül):** (e) szűk létigés keret
  („_____ ist alt und groß.”, „Our teacher is always _____.”: pontosan 4 szó, benne létige) csak 5 szóval — e keretekben
  17% volt a több védhető opció, a többiben 6%; (f) visszaható ige mellé visszaható, nem visszaható mellé nem
  visszaható elterelő; (g) kifejezésnél azonos mondattani alak (mondat / igei / határozói / névszói, zárt szólisták +
  végződés) — a határozós egyetlen opció felszíni jelből kitalálható volt; (h) német / francia főnévnél azonos névelő
  (nem, szám; névelő nélküli mellé névelő nélküli). Eredmény (végső szabály, teljes bank): a cloze-képes bejegyzések
  57,6%-a kap játék-alakú cloze-t (EN 71,7 / DE 45,9 / FR 51,6%; a többi más kérdéstípust), ezek 98,3%-a `ok`
  (szintenként 84,1–100%); a vak megoldó 200/200 egyezés, 7% több védhető, 2% triviális.
- **Második kör — review #455 (Codex, „I go to school _____.” + „by bus” / „every morning”):** a fenti (e)–(h) szabályok
  után is maradt 7% több védhető opció, és a hibás „rossz” jelzés tanulási kárt okoz, ezért az egyértelműség
  ELSŐBBSÉGET kap a mennyiséggel szemben. Az új, ezt felváltó EGYÉRTELMŰSÉGI SZABÁLY: játék-alakú cloze csak akkor
  készül, ha mindhárom elterelő a hiány helyére NYELVTANILAG nem illik — (1) csak angol, egyszavas, kisbetűs bejegyzés
  (kifejezésből soha: a határozós / igei kifejezés szabad bővítmény, a mondat nélküle is teljes; a hiányos magyar
  fordítás itt nem segít, mert a „_____ járok iskolába.” a „minden reggel”-t sem zárja ki); (2) az elterelő más,
  a célszófaj helyén nem álló szófajú (főnév → melléknév, melléknév → ige, ige → melléknév, határozószó → ige);
  (3) kettős szófajú szó nem elterelő (a bankban a célszófajjal is szerepel; `DUAL_USE` lista; szín; felsőfok);
  (4) a keret nem enged átjárást (jelzői melléknév / főnév, „make / keep / get / be” után ige, segédige / „to” / „go”
  után határozószó); (5) „a / an” hangtani kényszer. Német / francia játék-alakú cloze NINCS: a rétegzett vak mintán a
  más szófajú elterelős német / francia tételek 97%-a a végződésből (-en / -er) megoldható volt, az azonos szófajú
  pedig a keretbe illhet. Érintett bejegyzések (a teljes bank, nyelv × szint, scratchpad `cloze/kizarasi-okok.md`):
  kifejezés EN 861 / DE 737 / FR 704; szófaj (DE / FR: minden) EN 41 / DE 1306 / FR 1294; keret-őr EN 461; rövid EN 11;
  nagybetűs EN 5. Marad: EN 1194 (a cloze-képes angol bejegyzések 46,4%-a; szintenként 39,8–49,4%), DE 0, FR 0; a
  játék-alakú cloze-ok 100%-a `ok`. A játékban a szóbank-kérdések közt a cloze aránya (3000 `next()`, mért) angolul 29,9% → 14,5%,
  németül 30,9% → 0, franciául 31,8% → 0. A felolvasás: megjelenéskor `speakText` (cloze: a mondat „…”-tal), a helyes szó a
  kimenetel után (`speakAfter`) — ugyanaz a felosztás, mint a Szólétra `speechPlan`-je (#454). Vak megoldó körök
  (200 tétel, rétegzett, a fele határeset; „több helyes” jelölés): S1 2 (1,0%, „violet” főnévként) → színek ki, DE / FR
  ki; S2 0; S3 2 (1,0%, „my eldest”, „the damp”) → felsőfok, főnevesülő melléknév ki; S4 4 (2,0%, „a cross”) → a bank
  melléknevei közül a főnévként / igeként is élők ki; S5 0; S6 (végső szabály) 0. Egyezés minden körben 100%.
- **Érintett fájlok:** `GE/vocab/questionGenerator.ts`, `GE/vocab/vocabSource.ts`, `GE/vocab/useVocabQuizSource.ts`,
  új `T/vocab-cloze-game.test.ts`, új `T/play-lab-cloze-game.spec.ts`, `P/PlayLab.tsx` (egy additív `?q=cloze-game`
  próbatétel). A hét játéklap, a `GE/play/*` és a meglévő tesztek nem változnak.
- **Elfogadás:** a teljes bankon minden alkalmas bejegyzés × MINDEN lehetséges elterelő-jelölt a szabálynak megfelel
  (független szófaj-tábla, kettős szófaj, szín, felsőfok, hangtan); minden generált játék-alakú cloze: pontosan egy
  helyes opció, nincs fordítás, a prompt és a felolvasás nem tartalmazza a választ; DE / FR: nincs játék-alak;
  `en0-city-024` regresszió; `fitsAllViewports(...).ok` szintenként ≥ 95% (mért 100%); a „full” alak és a meglévő
  vocab-tesztek változatlanul zöldek; a rétegzett vak mintán a „több helyes” jelzés < 1% (S6: 0/200); böngészős próba
  a play-labban 360×640, 390×844, 844×390.

---

## J0a — Determinizmus és játékérzet: seedelt RNG, fix lépés, rázás / hitstop, mini-Director, őrök

**Állapot:** kész — #442 (19aa86e6, 2026-11-16), kanban #36
**Cél-mondatok:** G1, G8 (előfeltétel), G10 (előfeltétel). **Elfogadás:** J19 (közös rész), J11 (feel), K.4 9/12/13/19.
**Modell:** Opus. **Becsült diff:** ~450 sor (ebből ~200 teszt).

### Fájlok (csak ezek)

Új: `source/shared/game-rng.ts`, `GE/play/loop.ts`, `GE/play/feel.ts`, `GE/play/director.ts`, `T/game-rng.test.ts`,
`T/game-loop.test.ts`, `T/game-feel.test.ts`, `T/game-director.test.ts`, `T/game-sim-determinism-guard.test.ts`.
Módosítandó: `GE/game-test-hooks.ts` NEM (a `mulberry32` marad a meglévő hívóknak; az új kód a `game-rng`-et használja).

### Horgonyok

- Meglévő seed-segédek: `GE/game-test-hooks.ts:34-52` (`readGameSeed`, `mulberry32`); napi kihívás FNV-1a
  `L/dailyChallenge.ts:97-118` (`fnv1a`);
  seedelt opció-keverő `source/shared/option-order.ts`.
- `useReducedMotion`, `motionScale`: `GE/useReducedMotion.ts:27, 57`.
- Közös rAF-réteg: `GE/three-look/useThreeScene.ts:100-139` (dt-plafon 0,05).

### Szerződés

```ts
// source/shared/game-rng.ts — kliens ÉS szerver (párbaj-kérdéssor) használja; DOM-mentes
export type Rng = { next(): number /* [0,1) */; int(maxExclusive: number): number; pick<T>(arr: readonly T[]): T; shuffle<T>(arr: readonly T[]): T[]; state(): [number, number, number, number] };
/** xmur3 hash a seed-szövegből → sfc32 (128 bit állapot). */
export function createRng(seed: string | number): Rng;
/** Stabil seed-szöveg részekből: seedFrom("tsunami-english", "2026-11-16", "K7QM2X", 3). */
export function seedFrom(...parts: ReadonlyArray<string | number>): string;
export function restoreRng(state: readonly [number, number, number, number]): Rng;

// GE/play/loop.ts
export const SIM_STEP_MS = 1000 / 60;
export type FixedLoop = {
  /** A rAF valós `nowMs`-ével hívandó; legfeljebb 5 lépést futtat; visszaadja az interpolációs alphát (0..1). */
  frame(nowMs: number): number;
  setTimeScale(scale: number): void;   // 0 = szünet; 0.35..1 = kérdés alatti lassítás; 1 = normál
  timeScale(): number;
  simTimeMs(): number;                 // a probe().simTime forrása
  reset(): void;
};
export function createFixedLoop(step: (dtMs: number) => void, opts?: { maxSteps?: number; maxFrameMs?: number /* alap 250 */ }): FixedLoop;

// GE/play/feel.ts
export type Feel = {
  addTrauma(amount: number): void;     // 0..1, összeadódik, plafon 1
  shakeOffset(out: { x: number; y: number; rot: number }, viewportH: number): void; // trauma², sima zaj, max 1% magasság, max 2.5° forgás
  hitstop(ms: number): void;           // 40..120; 150 ms-on belül nem ismétlődik; a loop timeScale-jét állítja átmenetileg 0-ra
  update(realDtMs: number): void;      // lecsengés 0.8/s
  tween(t: number, kind: "outCubic" | "inOutQuad" | "outBack"): number;
};
export function createFeel(opts: { reducedMotion: boolean; loop?: FixedLoop; fxRng: () => number }): Feel;

// GE/play/director.ts (mini-Director; a J0b flow.ts intensity-jét fázisokra bontja)
export type DirectorPhase = "buildup" | "peak" | "fade" | "relax";
export type IntensityDirector = {
  /** Jelzések: sérülés +0.25, rossz válasz +0.1, közeli veszély +0.05/s; egyébként −0.15/s (harc közben nem csökken). */
  signal(kind: "damage" | "wrong" | "nearThreat" | "combat", dtSec?: number): void;
  update(dtSec: number): void;
  phase(): DirectorPhase;
  intensity(): number;                 // 0..1
  /** Kérdés-ütemezéshez: true a relax / fade fázisban, vagy ha a peak 4 s-nál tovább tart. */
  calm(): boolean;
};
export function createIntensityDirector(opts?: { peakSec?: [number, number]; relaxSec?: [number, number] }): IntensityDirector;
// Alap: peak 2–4 s, relax 8–15 s (mobilmenethez rövidítve).
```

### Lépések

1. Állapot-sor commit (K.1/2).
2. `game-rng.ts` (sfc32 + xmur3, a kutatás 4 [F29e] szerint; saját implementáció, külső csomag nélkül).
3. `loop.ts`, `feel.ts` (saját easing és 1D zaj, nincs új függőség), `director.ts`.
4. `T/game-sim-determinism-guard.test.ts`: a `source/shared/game-rng.ts`, `source/shared/duel/**`, `GE/play/{loop,director,
   flow,combo,waves,reviewQueue,runStats,questionDirector}.ts` és minden `source/client/src/lib/*/sim.ts`, `lib/*/core.ts`
   fájl komment-szűrt szövegében (a `T/game-feedback-wiring-guard.test.ts:23-27` `stripComments` mintája) tiltja:
   `Math.random`, `Date.now`, `performance.now`, `document.`, `window.`, `from "three"`, `from "react"`. A még nem létező
   útvonalakat a glob üresen hagyja (a teszt nem bukik attól, hogy egy játék magja még nincs kiemelve).
5. Tesztek: rng (azonos seed → azonos 10 000 elemű sorozat; `seedFrom` stabil; `shuffle` permutáció; eloszlás durva
   ellenőrzése χ²-vel 10 kosárra), loop (60 Hz-en 1 s = 60 lépés; 250 ms-os ugrásnál legfeljebb 5 lépés; `timeScale 0.35`
   → 1 s alatt ~21 lépés; alpha 0..1), feel (trauma lecseng; `reducedMotion` → offset 0; hitstop 150 ms-on belül nem
   ismétlődik), director (fázisok sorrendje, `calm()` a relax-ban true).

### Parancsok

`cd source && node --import tsx --test tests/game-rng.test.ts tests/game-loop.test.ts tests/game-feel.test.ts tests/game-director.test.ts tests/game-sim-determinism-guard.test.ts`, majd a hat kapu (K.1). UI nincs → böngészős próba NOT RUN (indokolva).

### Elfogadás (J0a)

- [ ] Minden új teszt zöld; `npm test` zöld; a `source/shared/game-rng.ts` szerverből is importálható (`npm run check` és `npm run build` zöld).
- [ ] Játéklap nem változott.

---

## J0b — Közös tiszta réteg: típusok, ismétlési sor, áramlat, kombó, hullám, statisztika, ütemező, harness, őrök

**Állapot:** kész — #444 (bf804bfb, 2026-11-16), kanban #38
**Függ:** J0a merge (a director és a harness a `createRng`-et használja: `rng: () => number` helyett `Rng` is átadható, a `rng.next` a függvény). **Cél-mondatok:** G3, G4, G6. **Elfogadás:** J2, J3, J4, J6, J7, J8, J10, J12, J13 (logikai szinten; a játékonkénti
igazolás a J1–J7-ben).

### Fájlok (csak ezek)

Új: `GE/play/types.ts`, `GE/play/reviewQueue.ts`, `GE/play/flow.ts`, `GE/play/combo.ts`, `GE/play/waves.ts`,
`GE/play/runStats.ts`, `GE/play/questionDirector.ts`, `GE/play/index.ts`, `T/support/game-sim.ts`,
`T/game-review-queue.test.ts`, `T/game-flow.test.ts`, `T/game-combo-waves.test.ts`, `T/game-question-director.test.ts`,
`T/game-sim-harness.test.ts`, `T/game-ethics-guard.test.ts`, `T/game-score-contract-guard.test.ts`.
Módosítandó: `GE/vocab/vocabSource.ts` (additív `questionFor`), `GE/vocab/index.ts` (export), `T/vocab-source*.test.ts`
helyett új eset a `T/game-question-director.test.ts`-ben (a meglévő vocab-tesztek változatlanok).

### Horgonyok

- `FourChoiceQuiz`: `source/client/src/types/gameQuiz.ts:2-9`.
- `VocabSource` típus és `createVocabSource`: `GE/vocab/vocabSource.ts:12-34`; a `next()` naplózása `:125-135`.
- `generateVocabQuestion`: `GE/vocab/questionGenerator.ts:251`; `pickQuestionType`: `:68-74, 98-103`.
- `StorageLike` + hibatűrő tároló-minta: `GE/vocab/seenHistory.ts:37-42, 69, 77-107`.
- Adaptív sáv: `GE/difficulty.ts:28-37` (`DIFFICULTY_FLOOR = 0.15`, +0,10 / −0,15), `nextDifficulty` `:57`,
  `startingDifficulty` `:82`; `GE/adaptiveSession.ts:10-34`.
- Seedelt RNG: `createRng(readGameSeed() ?? seedFrom(gameId, …))` — `createRng`, `seedFrom` a `@shared/game-rng`-ből
  (J0a), `readGameSeed` a `GE/game-test-hooks.ts`-ből; a `mulberry32` csak a meglévő hívóké.
- Score zod-séma: `S/routes.ts:1298-1304`.

### Szerződés (TypeScript — pontosan így)

```ts
// GE/play/types.ts
import type { FourChoiceQuiz } from "@/types/gameQuiz";
import type { VocabLang } from "@/data/vocabBank/types";

export type PlayGameId =
  | "tsunami-english" | "word-ladder-hu-en" | "block-craft-quiz" | "speed-quiz-math"
  | "brain-rot-steal" | "space-asteroid-quiz" | "tornado-hunter-200";

export type QuestionSourceKind = "material" | "review" | "vocab" | "grade" | "bank" | "coupon";

export type PlayQuestion = {
  /** Stabil tétel-kulcs: "vocab:<lang>:<vocabId>" | "grade:<id>" | "mat:<id vagy normalizePrompt>" | "bank:<gameId>:<id>". */
  key: string;
  quiz: FourChoiceQuiz;
  source: QuestionSourceKind;
  subject?: string;
  lang?: VocabLang;
  /** A felolvasandó célnyelvi szöveg (nyelvi tételnél). */
  speakText?: string;
  /** Kupon-bónuszhoz: a szerver által kiadott tétel azonosítója (`GE/claimCouponBonus.ts`). */
  couponItemId?: string;
};

export type PresentedOption = { label: string; originalIndex: number; correct: boolean };

export type QuestionPresentation = {
  id: number;                 // menetenként növekvő
  question: PlayQuestion;
  isReview: boolean;
  options: PresentedOption[]; // 3 vagy 4, seedelten keverve; pontosan egy correct
  windowMs: number;           // windowMsFor() szerint
  slowMo: number;             // 0.35..1 — a szimuláció szorzója a kérdés alatt
  startedAtSimMs: number;
  reason: "scheduled" | "trigger" | "boss" | "rescue";
};

export type QuestionResult = "correct" | "wrong" | "timeout" | "aborted";

export type QuestionOutcome = {
  id: number;
  key: string;
  result: QuestionResult;
  pickedOriginalIndex: number | null;
  correctOriginalIndex: number;
  responseMs: number;
};
```

```ts
// GE/play/reviewQueue.ts
import type { StorageLike } from "@/game-engine/vocab";
export const GAME_REVIEW_KEY = "websuli.gameReview.v1";
export const REVIEW_CAP = 400;
export const BOX_INTERVAL_MS: readonly [number, number, number, number, number] =
  [0, 86_400_000, 3 * 86_400_000, 7 * 86_400_000, 21 * 86_400_000];
export type ReviewBox = 0 | 1 | 2 | 3 | 4;
export type ReviewPayload =
  | { kind: "vocab"; lang: VocabLang; vocabId: string }
  | { kind: "grade"; id: string }
  | { kind: "quiz"; quiz: FourChoiceQuiz; source: "material" | "bank"; subject?: string };
export type ReviewItem = {
  key: string; box: ReviewBox; dueAt: number; dueInRun: number | null; lastSeen: number;
  wrong: number; correct: number; payload: ReviewPayload;
};
export type ReviewQueue = {
  /** Kimenet rögzítése. wrong/timeout → box 0, dueInRun = runIndex + 3..6 (seedelt); correct → box+1, dueAt = now + BOX_INTERVAL_MS[box], dueInRun = null; aborted → nincs változás. */
  record(q: PlayQuestion, result: QuestionResult, runIndex: number): void;
  /** Menet közben esedékes (dueInRun <= runIndex) tétel, a legkorábbi; különben null. */
  dueInRun(runIndex: number): ReviewItem | null;
  /** Menetek között esedékes (box 0 korábbi menetből, vagy dueAt <= now); a legkorábban esedékes. */
  dueAcrossRuns(now: number): ReviewItem | null;
  /** Új menet: a korábbi menetek dueInRun értékei null-ra állnak (box 0 tételek dueAcrossRuns-ként jönnek). */
  startRun(): void;
  size(): number;
  snapshot(): readonly ReviewItem[];
};
export function createReviewQueue(
  storage: StorageLike | null,
  opts?: { now?: () => number; rng?: () => number; cap?: number },
): ReviewQueue;
// Tárolt alak: { v: 1, items: Record<string, ReviewItem> }. Ismeretlen v → üres; sérült JSON / kivétel → memória, kivétel nélkül.
// Payload vágás: prompt ≤ 300, opció ≤ 120, explanation ≤ 400 karakter. Cap felett a legnagyobb box + legrégebbi lastSeen dobódik.
```

```ts
// GE/play/flow.ts
export type FlowSignal =
  | { kind: "answer"; correct: boolean; responseMs: number; windowMs: number }
  | { kind: "game"; good: boolean; weight?: number }; // pl. sérülés: good=false; tiszta szakasz: good=true
export type FlowController = {
  push(s: FlowSignal): void;
  /** Kérdés-sáv: a GE/difficulty.ts nextDifficulty szabálya (padló 0.15, plafon 0.95). */
  band(): number;
  /** Játék-intenzitás 0..1: exponenciális mozgóátlag (α = 0.15) a válasz- és játékjelekből; gyors jó válasz (< 50% ablak) +, hiba / sérülés −. */
  intensity(): number;
  successRate(lastN?: number): number;
};
export function createFlowController(opts: { startBand: number; startIntensity?: number }): FlowController;
```

```ts
// GE/play/combo.ts
export type ComboState = { count: number; multiplier: 1 | 2 | 3 | 4 | 5; best: number };
export const COMBO_STEPS: readonly number[] = [0, 3, 6, 10, 15]; // count küszöbök → ×1..×5
export function createCombo(): ComboState;
export function comboCorrect(s: ComboState): ComboState;
export function comboBreak(s: ComboState): ComboState; // count 0, multiplier 1, best megmarad

// GE/play/waves.ts
export type WaveEnemy = { kind: string; cost: number; weight: number };
export type WaveSpec = { id: string; budget: number; enemies: readonly WaveEnemy[]; spawnEverySec: number; miniboss?: string; boss?: string };
export type WaveDirector = {
  index(): number;
  current(): WaveSpec;
  /** dtSec játékidőben; intensity 0..1 a spawn-tempót ±30%-kal skálázza. Visszaadja a most születő ellenfelek fajtáját. */
  tick(dtSec: number, intensity: number): string[];
  onCleared(count?: number): void;
  waveDone(): boolean; // a költségvetés elfogyott és minden ellenfél eltűnt
  next(): boolean;     // következő hullám; false, ha nincs több
  done(): boolean;
};
export function createWaveDirector(script: readonly WaveSpec[], rng: () => number): WaveDirector;

// GE/play/runStats.ts
export type RunStatsSnapshot = {
  asked: number; answered: number; correct: number; wrong: number; timeouts: number;
  distinctKeys: number; reviewsAsked: number; perMinute: number;
  maxGapSec: number; minGapSec: number; firstSource: QuestionSourceKind | null;
  simSeconds: number;
  freshWindow40Distinct: number; // az ÚJ (nem ismétlés) kérdések legrosszabb 40-es ablakának különböző tételszáma
  reviewShare: number;           // ismétlések / összes kérdés
  reviewReturnWithin6: number;   // a hibázott tételek hányada, amely a 3.–6. következő kérdésként visszatért
};
export type RunStats = { onAsk(p: QuestionPresentation, simMs: number): void; onOutcome(o: QuestionOutcome): void; snapshot(simMs: number): RunStatsSnapshot };
export function createRunStats(opts?: { warmupSec?: number /* alap 10 */ }): RunStats;
```

```ts
// GE/play/questionDirector.ts
export type QuestionProvider = {
  /** Nem látott tananyag-tétel (a játék meglévő pickUnseenMaterial-ágával). */
  material(): PlayQuestion | null;
  /** Új tétel a játék meglévő választójával (szóbank / évfolyam-bank / kézi bank), a band szerint. */
  fresh(ctx: { band: number; subject?: string }): PlayQuestion | null;
  /** Ismétlés újraépítése: vocab → VocabSource.questionFor, grade → a bank id-je, quiz → a pillanatkép. */
  restore(item: ReviewItem): PlayQuestion | null;
  /** Kupon mód: csak material() adhat kérdést. */
  couponOnly: boolean;
};
export type DirectorConfig = {
  gameId: PlayGameId;
  optionCount: 3 | 4;
  minGapMs: number;        // terv 6.2: ≥ 1500
  maxGapMs: number;        // terv 6.2 játékonkénti maximum
  targetPerMin: number;    // terv 6.2 játékonkénti küszöb
  baseWindowMs: number;    // rövid tétel alap ablaka (2500..6000)
  slowMo: number;          // 0.35..1
  grade: number | null;
  bossMinGapMs?: number;   // alap 800
  warmupMs?: number;       // alap 10000 — ennyi ideig nincs ütemezett kérdés (trigger lehet)
};
export type QuestionDirector = {
  /** Játékidőben hívja a játék; ha az ütemezés szerint kérdés jár ÉS ctx.calm (nincs épp kritikus játékhelyzet vagy maxGap közel), új presentationt ad. */
  tick(simNowMs: number, ctx: { calm: boolean }): QuestionPresentation | null;
  /** A játék kér kérdést (érc elérve, boss-fázis, mentőöv). minGap-et tart (boss: bossMinGapMs), kivéve reason="rescue". */
  request(reason: "trigger" | "boss" | "rescue", simNowMs: number): QuestionPresentation | null;
  active(): QuestionPresentation | null;
  /** Idempotens: második hívás ugyanarra az id-re null. optionIndex a PresentedOption tömb indexe. */
  answer(id: number, optionIndex: number, simNowMs: number): QuestionOutcome | null;
  expire(simNowMs: number): QuestionOutcome | null;
  abort(): QuestionOutcome | null; // kuponlejárat / kilépés
  /** A legutóbbi hibás kimenet a WhyButton-hoz (buildFeedback bemenete). */
  lastWrong(): { quiz: FourChoiceQuiz; pickedOriginalIndex: number | null } | null;
  wrongList(): readonly { quiz: FourChoiceQuiz; pickedOriginalIndex: number | null }[]; // ResultReview
  band(): number;
  intensity(): number;
  stats(simNowMs: number): RunStatsSnapshot;
  flow: FlowController;
};
export function windowMsFor(prompt: string, grade: number | null, baseMs: number): number;
// = min(9000, clamp(baseMs + max(0, len(prompt) − 60) × 50, 2500, 9000) × (grade 3–4 ? 1.25 : 1)) — mindig ≤ 9000 ms.
export function createQuestionDirector(opts: {
  config: DirectorConfig; provider: QuestionProvider; review: ReviewQueue; rng: () => number;
  startBand: number; now?: () => number;
}): QuestionDirector;
// Forrásrend (terv 4.1/5, K.2): review.dueInRun → provider.material → review.dueAcrossRuns → provider.fresh, AZZAL a
// korláttal, hogy ismétlés (in-run vagy cross-run) legfeljebb minden 3. kérdés lehet (ismétlési arány ≤ 30%), és egy tétel
// menetenként legfeljebb 2-szer tér vissza (utána a cross-run sorba kerül). Kupon módban csak material. Egy menetben ugyanaz
// a key csak ismétlésként jöhet újra (az új kérdések között nincs duplikátum, J6).
// Ütemezés (kérdés-INDÍTÁSOK közötti célrés): 60000 / (targetPerMin × 1.1) × (1 − 0.25 × intensity), [minGapMs, maxGapMs]
// közé vágva; ha az utolsó
// kérdés óta eltelt idő ≥ maxGapMs − 1000, a tick a calm-tól függetlenül indít.
// 3 opciónál: a helyes + 2 elterelő seedelten a 3-ból; originalIndex megőrződik.
// Minden outcome → review.record, flow.push(answer), runStats.onOutcome.
```

```ts
// GE/vocab/vocabSource.ts — ADDITÍV bővítés (a meglévő mezők változatlanok)
export type VocabSource = { /* … meglévő … */
  /** A megadott bejegyzésből kérdés NAPLÓZÁS nélkül (ismétléshez). Ismeretlen id → null. */
  questionFor(vocabId: string): VocabQuiz | null;
};
```

```ts
// T/support/game-sim.ts
export type SimPlayer = { accuracy: number; reactionMedianMs: number; skill: number };
export const SIM_AVERAGE: SimPlayer;   // { accuracy: 0.75, reactionMedianMs: 2800, skill: 0.8 }
export const SIM_YOUNG: SimPlayer;     // { accuracy: 0.75, reactionMedianMs: 3500, skill: 0.7 } (3–4. évf.)
export const SIM_STRONG: SimPlayer;    // { accuracy: 0.95, reactionMedianMs: 1800, skill: 0.9 }
export const SIM_WEAK: SimPlayer;      // { accuracy: 0.45, reactionMedianMs: 4000, skill: 0.6 }
export type SimInput = { skillRoll: number }; // a játék a skill-dobásból dönti el a kitérés / célzás sikerét
export type SimGame = {
  step(dtMs: number, input: SimInput): void;
  question(): { id: number; correctOption: number; windowMs: number; optionCount: number } | null;
  answer(id: number, option: number): void;
  done(): boolean;
  won(): boolean;
  stats(): RunStatsSnapshot;
  simTimeMs(): number;
  band(): number;
  intensity(): number;
};
export type SimGameFactory = (opts: { seed: number; grade: number; questions: boolean }) => SimGame;
export function runSim(factory: SimGameFactory, player: SimPlayer, opts: { seed: number; seconds: number; grade?: number; questions?: boolean; dtMs?: number }): { stats: RunStatsSnapshot; won: boolean; durationSec: number };
export function medianOf(values: readonly number[]): number;
// A játékos-modell: reakcióidő log-normális (σ = 0.35) a mediánnal, mulberry32(seed ^ 0x9e37); ha a reakció > windowMs → timeout.
```

### Lépések

1. Állapot-sor commit (K.1/2).
2. `GE/play/types.ts`, `combo.ts`, `waves.ts`, `runStats.ts`, `flow.ts` a szerződés szerint. A `flow.band()` a
   `nextDifficulty`-t (`GE/difficulty.ts:57`) hívja az utolsó válaszok listájával (nem duplikálja a szabályt).
3. `GE/play/reviewQueue.ts` a hibatűrő tároló-mintával (`GE/vocab/seenHistory.ts:77-107` mintájára, saját kóddal).
4. `GE/vocab/vocabSource.ts`: `questionFor(vocabId)` — a bejegyzést id alapján megkeresi, `pickQuestionType` +
   `generateVocabQuestion`, **nem** hív `history.mark`-ot.
5. `GE/play/questionDirector.ts` a szerződés szerint; `windowMsFor` exportálva.
6. `GE/play/index.ts` gyűjtő-export.
7. `T/support/game-sim.ts` és egy **referencia-játék** csak teszthez (`T/game-sim-harness.test.ts`-ben definiált
   `toyGame`: egy sávfutó, amelyben kérdés nélkül 2 % / mp eséllyel akadályba fut a skill szerint), amely a directort
   használja — ezen bizonyítjuk, hogy a harness működik.
8. Tesztek (lent).
9. `T/game-ethics-guard.test.ts`: a hét játéklap (`P/*.tsx` a WIRED listából), `GE/play/*.tsx?`, `GE/mobile/*.tsx`,
   `source/client/src/components/GameNextGoalBar.tsx` komment-szűrt szövegén (a `game-feedback-wiring-guard.test.ts`
   `stripComments` mintája, 23–27. sor) a tiltott minták: `/elveszíted|elveszik a|megszakad a sorozat|ne hagyd ki|csak ma|utolsó esély|siess/i`
   → 0 találat; és a `GE/play/` alatti fájlokban `Math.random` → 0 találat. (A hét játéklap `Math.random`-ját NEM tiltja
   — vizuális zaj megengedett; a jutalom-kódot a J8 `meta.ts` őre nézi.) Megjegyzés: a „Siess” szó jelenleg nem fordul
   elő a listázott fájlokban (ellenőrizve: `grep -rn -i "siess"` a fenti fájlokon, 2026-11-16 — 0 találat).
10. `T/game-score-contract-guard.test.ts`: a `S/routes.ts` forrásában a score-séma szövege pontosan
    `z.object({ gameId: z.string().min(1).max(64), difficulty: z.enum(["easy","normal","hard"]), runXp: z.number().int().min(0).max(200000), runStreak: z.number().int().min(0).max(10000), runSeconds: z.number().int().min(0).max(86400) })`
    szóköz-normalizálva szerepel (az aktuális szöveget a megvalósító a forrásból másolja be, és a teszt azt rögzíti);
    a `P/Games.tsx` `FALLBACK_CATALOG` azonosítói (`P/Games.tsx:103-200`) a hét `PlayGameId`-val egyeznek.

### Tesztek (új) és elvárásuk (a szabályból levezetve)

- `T/game-review-queue.test.ts`: (1) hibás → `dueInRun` a runIndex+3…+6 tartományban, 1000 seedből mind; (2) jó
  box 0→1, `dueAt = now + 1 nap`; (3) `startRun` után a box 0 tétel `dueAcrossRuns`-ként jön; (4) sérült JSON / dobó
  tároló → működik, kivétel nélkül; (5) ismeretlen `v` → üres; (6) cap 400 felett a szabály szerinti dobás; (7) payload
  vágás.
- `T/game-flow.test.ts`: `SIM_STRONG`-mintájú 95% helyes sorozat → 30 válaszon belül `band ≥ 0.75` és `intensity` nő;
  45% → `band ≤ 0.35`, `intensity` csökken (J8); padló 0,15 / plafon 0,95.
- `T/game-combo-waves.test.ts`: lépcsők 3/6/10/15; `comboBreak` megtartja a `best`-et; a hullám-költségvetés
  determinisztikus seeddel; intensity 0 / 1 → spawn-tempó ±30%.
- `T/game-question-director.test.ts`: (1) tananyag-elsőbbség szimulációval: 3 tananyag-tétel + szóbank → az első 3
  kérdés tananyag, utána nincs ismétlődő tananyag (C-34 H1 tanulsága); (2) hibás tétel a 3.–6. következő kérdésként
  (J4); (3) kupon módban csak tananyag; (4) `answer` idempotens; (5) 3 opciós megjelenítés: pontosan 1 helyes, az
  `originalIndex` visszaképezhető; (6) `windowMsFor`: 40 karakter / grade 7 / base 4000 → 4000; 160 karakter → 9000-re
  vágva; grade 3 → ×1,25, de 160 karakter / grade 3 → 9000 (felső vágás); (7) minGap / maxGap tartása 10 000 tick-en;
  (7b) ismétlési arány ≤ 30% és menetenként ≤ 2 visszatérés / tétel 75%-os és 45%-os szimulált válaszsorral; (7c) a
  75%-os sorral a hibázott tételek ≥ 95%-a a 3.–6. következő kérdés; (8) az ÚJ kérdések 40-es ablakában nincs duplikátum 300 kérdésnél,
  ha a `fresh` forrás elég nagy (J6).
- `T/game-sim-harness.test.ts`: a `toyGame`-mel `runSim` determinisztikus (ugyanaz a seed → ugyanaz az eredmény);
  `perMinute` és `maxGapSec` a director beállításaival összhangban.
- `T/game-ethics-guard.test.ts`, `T/game-score-contract-guard.test.ts` (fent).

### Parancsok

```bash
cd /d/repo/WEBSULI/.claude/worktrees/jatek-j0b/source && node --import tsx --test tests/game-review-queue.test.ts tests/game-flow.test.ts tests/game-combo-waves.test.ts tests/game-question-director.test.ts tests/game-sim-harness.test.ts tests/game-ethics-guard.test.ts tests/game-score-contract-guard.test.ts > /tmp/j0a-unit.txt 2>&1; echo "unit=$?"; tail -15 /tmp/j0a-unit.txt
```
Utána a hat kapu (K.1). UI nincs → böngészős próba és képernyőkép nem kell (PR-ben: „NOT RUN: Playwright — nincs UI
változás”).

### Elfogadás (J0b)

- [ ] Minden új teszt zöld; `npm test` zöld (a meglévő vocab-tesztek változatlanul).
- [ ] A `VocabSource` bővítése additív (a meglévő tesztek, pl. `T/vocab-*.test.ts`, módosítás nélkül zöldek).
- [ ] Egyetlen játéklap sem változott (`git diff --stat origin/main -- source/client/src/pages` üres).

### UNKNOWN

- U-J0b-1: a `@/data/vocabBank/types` import-útvonala a `GE/play/types.ts`-ből — felderítés: `grep -n "VocabLang" GE/vocab/index.ts`.
- U-J0b-2: a `tsconfig.test.json` lefedi-e a `T/support/*.ts`-t — felderítés: `npm run check:test` a lépés után.

---

## J0c — Közös UI: kérdés-sáv, „Miért?”, eredmény-lista, felolvasás, beállítás, teszt-kampó, hang, próbaoldal

**Állapot:** kész (#446, 57bd1b0e) · **Állapot (J0c-b — hosszú kérdés koppintás nélkül olvasható):** kész — #450 (59a647f2), kanban #46
**Függ:** J0b merge. **Cél-mondatok:** G3, G6. **Elfogadás:** J1 (próbaoldalon), J5, J14, J16 (komponens-szinten).

### Fájlok (csak ezek)

Új: `GE/play/InlineQuestion.tsx`, `GE/play/WhyButton.tsx`, `GE/play/ResultReview.tsx`, `GE/play/speech.ts`,
`GE/play/gameSettings.ts`, `GE/play/useQuestionDirector.ts`, `P/PlayLab.tsx` (csak teszt-kampóval él),
`T/game-win-cases/<id>.ts` (7 fájl), `T/play-lab.spec.ts`, `T/game-play-speech.test.ts`, `T/game-settings.test.ts`.
Módosítandó: `GE/game-test-hooks.ts` (additív mezők), `L/audioEngine.ts` (új receptek), `source/client/src/index.css`
(`.play-question*` a `@layer components`-ben, C-32), `source/client/src/App.tsx` (feltételes `/__play-lab` útvonal),
`T/game-win-paths.spec.ts` (az esetek kiemelése a `T/game-win-cases/`-be — tiszta átrendezés, az elvárások szó szerint
ugyanazok), `GE/play/index.ts`.

### Horgonyok

- `GameForcePatch`: `GE/game-test-hooks.ts:11-19`; `WebsuliGameTestApi`: `:20-24`; `installGameTestApi`: `:59`.
- `buildFeedback`: `GE/feedback.ts:116`; `QuizFeedbackCardProps`: `GE/QuizFeedbackCard.tsx:29-38`.
- `useModalLayer`, `usePauseMenuOpen`: `GE/mobile/modalLayer.ts:21-138`.
- `speak`, `readAloudEnabled`, `speechSupported`, `prefersReducedMotion`: `L/tts.ts:19-48` (LS-4 szabály: `:1-10`).
- `beep` és a meglévő effektek: `L/audioEngine.ts:116-200`.
- `--game-*` változók: `source/client/src/index.css:389-412`.
- Útvonalak: `source/client/src/App.tsx:35-41` (lazy), `:95-102` (Route).
- `game-win-paths` GAMES tábla: `T/game-win-paths.spec.ts:10-23`.

### Szerződés

```ts
// GE/game-test-hooks.ts — ADDITÍV
export type GameForcePatch = { /* … meglévő mezők … */
  /** true → a játék azonnal nyit egy kérdést (director.request("trigger")). */
  question?: boolean;
};
// A probe() visszatérésében az átírt játékok kötelezően adják: simTime, questionOpen, questionsAnswered,
// questionsCorrect, fps, band, intensity (K.2). A típus marad Record<string, number|string|null>.

// GE/play/gameSettings.ts
export const GAME_SETTINGS_KEY = "websuli.gameSettings.v1";
export type GameSettings = { v: 1; tts: boolean };
export function loadGameSettings(storage: StorageLike | null): GameSettings; // hiba / ismeretlen v → { v: 1, tts: true }
export function saveGameSettings(storage: StorageLike | null, s: GameSettings): void;
export function useGameSettings(): [GameSettings, (patch: Partial<Omit<GameSettings, "v">>) => void];

// GE/play/speech.ts
export const SPEECH_LANG: Record<VocabLang, string> = { en: "en-GB", de: "de-DE", fr: "fr-FR" };
/** Felolvasás a játékban: csak ha settings.tts && readAloudEnabled({readAloud:true, reducedMotion, supported}) && a játékos már koppintott (armed). */
export function createGameSpeech(deps: { speak: (t: string, lang: string) => void; supported: () => boolean; reducedMotion: () => boolean }): {
  arm(): void;                       // az indító gomb kattintás-kezelőjéből hívandó
  say(text: string, lang: VocabLang): boolean; // true, ha elhangzott
  available(): boolean;
};

// GE/play/useQuestionDirector.ts — React-kötés
export function useQuestionDirector(opts: {
  config: DirectorConfig; provider: QuestionProvider; startBand: number; seed: number;
}): { director: QuestionDirector; reset(seed: number, startBand: number): void };
// A review queue egyetlen példány laponként (createReviewQueue(safeLocalStorage())); reset() → review.startRun().

// GE/play/InlineQuestion.tsx
export type InlineQuestionSkin = "ocean" | "rock" | "mine" | "neon" | "arena" | "space" | "storm";
export type InlineQuestionProps = {
  presentation: QuestionPresentation | null;
  remainingMs: number;
  /** "bar": csak prompt + időcsík (a válaszcélok a játékvilágban); "buttons": + 3/4 nagy gomb (mentőöv, kraft, kalibrálás). */
  mode: "bar" | "buttons";
  /** A világban rajzolt célokhoz is kötelező akadálymentes gombsor: "bar" módban vizuálisan rejtett (sr-only), de fókuszálható. */
  onPick: (optionIndex: number) => void;
  reveal: { correctOptionIndex: number; pickedOptionIndex: number | null } | null;
  skin: InlineQuestionSkin;
  onSpeak?: () => void;      // 🔊 gomb, ha a tétel nyelvi és a beszéd elérhető
  onWhy?: () => void;        // „Miért?” — csak reveal közben és utána 4 mp-ig látszik
  disabled?: boolean;        // szünetben
  testId?: string;           // alap "play-question"; a játékok a régi azonosítójukat adják (K.2), pl. "ts-quiz"
  promptTestId?: string;     // pl. "ts-prompt", "wl-prompt", "bc-prompt"
  optionTestId?: (i: number) => string; // alap i => `play-option-${i}`; pl. i => `ts-option-${i}`
  pauseTestId?: string;      // ha megadva, a sávban szünetgomb (onPause), pl. "ts-quiz-pause" (a forrás-őrök onClick={pauseGame} mintát várnak)
  onPause?: () => void;
};
// DOM: gyökér data-testid="play-question", role="group", aria-live="polite" a promptra; gombok data-testid="play-option-<i>"
// + correctDataAttrs; nem modális (nincs useModalLayer, nincs inert háttér); z-index a HUD fölött, a --game-z-overlay (80) alatt.
// A prompt két sorra vág (line-clamp 2), "Mutasd" gomb → onWhy-hoz hasonlóan szünetet kér a lapon (terv 8.9).

// GE/play/WhyButton.tsx
export type WhyButtonProps = { visible: boolean; onOpen: () => void };
// A lap felelőssége: onOpen → pause (meglévő szünet-állapot, a PauseMenu NÉLKÜL) + <QuizFeedbackCard card={buildFeedback({...director.lastWrong(), attempt: 1, ageBand: "kid"})} onDismiss={resume} />.
// A kártya a meglévő modális réteget használja (QuizFeedbackCard, z 90) — a „kártya alatt áll az óra” szabály érvényes.

// GE/play/ResultReview.tsx
export type ResultReviewProps = { items: readonly { quiz: FourChoiceQuiz; pickedOriginalIndex: number | null }[]; max?: number /* alap 5 */ };
// A ResultScreen `extra` slotjába (GE/mobile/ResultScreen.tsx ResultScreenProps.extra) kerül; címe „Gyakorold még”; tételenként prompt, a választott (áthúzva) és a helyes válasz, explanation ≤ 160 karakter. data-testid="result-review".
```

Hang-receptek (`L/audioEngine.ts`, additív, a meglévő `beep` felett): `sfxGate()` (felfelé csúszó 2 hang), `sfxCombo(level: 1|2|3|4|5)`
(hangmagasság a szinttel), `sfxBossHit()`, `sfxBossDefeat()`, `sfxWhoosh()`, `sfxStumble()`, `sfxRescue()`.
Mindegyik `isMuted()`-ot tiszteli (a meglévő minta szerint).

### Lépések

1. Állapot-sor commit.
2. `game-test-hooks.ts` additív bővítés; a `T/game-test-hooks-guard.test.ts` változatlanul zöld.
3. `gameSettings.ts`, `speech.ts` (+ egységtesztek a függőség-befecskendezéssel: nincs beszéd `armed` előtt, csökkentett
   mozgásnál, `tts: false`-nál, nem támogatott böngészőben; a nyelvi kód leképezés).
4. `useQuestionDirector.ts`, `InlineQuestion.tsx`, `WhyButton.tsx`, `ResultReview.tsx`; CSS a `@layer components`-be
   (`.play-question`, `.play-question-option`, `.play-question-timer`, a `--game-*` változókkal; 360 px szélességen a
   gombok ≥ 48 px, betű ≥ 12 px).
5. Hang-receptek.
6. `P/PlayLab.tsx`: egyszerű 2D vászon, egy mozgó pötty (a „szimuláció”), `useQuestionDirector` egy fix kézi bankkal
   (8 tétel, a fájlban), `InlineQuestion` „buttons” módban, `WhyButton` + `QuizFeedbackCard`, `ResultReview` a végén;
   `installGameTestApi` probe-bal (`simTime`, `questionOpen`, …). Az `App.tsx`-ben a Route csak
   `GAME_TEST_HOOKS_ENABLED` mellett regisztrálódik (lazy import, a production bundle-be nem kerül —
   `T/game-test-hooks-guard.test.ts` opcionális ága ezt méri).
7. `T/game-win-paths.spec.ts` → a `GAMES` tábla elemei `T/game-win-cases/<id>.ts`-be (egy fájl = egy `export default`
   objektum, ugyanazokkal az értékekkel), a spec importálja őket; az elvárások szövege változatlan.
8. `T/play-lab.spec.ts` (Playwright, `test.use({ serviceWorkers: "block" })` első sorként): (a) nyitott kérdés alatt a
   `probe().simTime` 1 mp alatt ≥ 350 ms-ot nő (J1); (b) hibás válasz után ≤ 2,5 mp-en belül nincs `[role="dialog"]`,
   és a `simTime` teljes sebességgel nő (J5); (c) „Miért?” → `quiz-feedback` látható, a `simTime` nem nő; bezárás után
   újra nő (J5); (d) a hibázott tétel a 3.–6. következő kérdésként jön (J4, `?seed=42`); (e) eredmény után
   `result-review` látszik (J16); (f) M2/M3 a kérdés-állapotban 360×640-en (a `T/support/game-mobile-quality.ts`
   segédeivel).

### Parancsok

Egység: `node --import tsx --test tests/game-play-speech.test.ts tests/game-settings.test.ts`. Böngésző:
`npm run test:e2e -- tests/play-lab.spec.ts tests/game-win-paths.spec.ts` (CI-azonos út, C-33). Hat kapu (K.1).
Képernyőkép: a próbaoldalról `question`, `wrong`, `result` 390×844-en.

### Elfogadás (J0c)

- [ ] `T/play-lab.spec.ts` (a)–(f) zöld; `T/game-win-paths.spec.ts` változatlan elvárásokkal zöld.
- [ ] A production buildben nincs `__play-lab` / `PlayLab` (`WEBSULI_CHECK_PROD_BUNDLE=1 node --import tsx --test tests/game-test-hooks-guard.test.ts` a `npm run build` után).
- [ ] Játéklap nem változott.

### UNKNOWN

- U-J0c-1: a `navigator.userActivation` elérhetősége a cél-böngészőkben — a `speech.ts` saját `armed` jelzőre épül, ezért nem függ tőle.
- U-J0c-2: a Web Speech `de-DE` / `fr-FR` hang megléte a CI chromiumában — az egységteszt függőség-befecskendezéssel fut; a böngészős próba a hangot nem méri.

---

## J1 — Szökőár szökés: „Hegyre fel!” (J1a, J1b, J1c)

**Állapot (J1a):** nem kezdődött · **Állapot (J1b):** nem kezdődött · **Állapot (J1c):** nem kezdődött
**Függ:** J0c merge. **Cél-mondatok:** G1–G6. **Elfogadás:** J-TS, J1–J11, J14, J16, M1–M12. Terv: 5.1.

### Fájlok

`P/TsunamiEscapeEnglish.tsx`, `GE/tsunamiTiming.ts`, `GE/scenes/TsunamiScene3D.tsx`, új `L/tsunami/core.ts`,
`L/tsunami/sim.ts`, `L/tsunami/obstacles.ts`, tesztek: `T/tsunami-core.test.ts`, `T/tsunami-sim.test.ts`, a meglévő
`T/tsunami-mobile.test.ts`, `T/tsunami-think-time.test.ts` (lásd lent), `T/game-mobile-cases/tsunami-english.ts`,
`T/game-win-cases/tsunami-english.ts`, új `T/tsunami-play.spec.ts`.

### A mostani kód horgonyai

- Fázisok: `P/TsunamiEscapeEnglish.tsx:530` (`"menu" | "play" | "quiz" | "over" | "won"`); szünet `:660-665`;
  `phaseNowRef` `:619-623`.
- Fő ciklus: `gameLoop` `:1108-1212`; rajz-fojtás 24 fps `:507, 1192-1197`; kvíz-trigger `:1172-1181`; XP / mp
  `:1183-1190`; víz `:1131-1145`; zóna `:1155-1160`.
- Kérdés-választás: `pickQuiz` `:828-908` (forrásrend: `pickUnseenMaterial` `:860`, szóbank `:740, 867-869`,
  `pickGradeQuiz` `:871`, kupon `:885-888`, kézi bankok `:81-480`, szerver-bank `:720-773`).
- Kvíz-dialógus: `:1821-1918` (`fixed inset-0`, `:1827`); kiértékelés `onAnswer` `:1223-1318`; időtúllépés `:1323-1334`;
  magyarázat `:1214-1221, 1972`.
- Győzelem / vég: `:1289-1300`, `endGame` `:1041-1045`; score `:1341-1369`; jelvények / napi `:1392-1414`;
  `ResultScreen` `:1920-1945`.
- Vezérlők: joystick + Sprint `:1776-1806, 1102-1106`; billentyű `:1063-1087`.
- Teszt-API: `:986-1018`; XP-kulcsok `:72-73, 1047-1061`; nehézségi preset `:484-506`.
- Időzítés: `GE/tsunamiTiming.ts:10-22` (`QUIZ_TIMEOUT_SEC`, `QUIZ_MIN_SEC`).

### J1a — mag + háromsávos futás + Kapukérdés (a régi kvíz-fázis megszűnik)

1. Állapot-sor commit.
2. `L/tsunami/core.ts` — tiszta mag: `TsunamiState` (`lane: 0|1|2`, `y` (ugrás), `distance`, `speed`, `waveGap` (m),
   `obstacles[]`, `gates: { atDistance, presentationId, laneOptions: [optIdx,optIdx,optIdx] } | null`, `shellCount`,
   `stage`, `stumbleMs`, `shieldMs`), `step(state, input: { laneDelta: -1|0|1; jump: boolean }, dtMs, tuning, rng)`,
   `placeGate(state, presentation)` (3–4 mp-nyi távolságra a sebességből), `resolveGate(state)` → `{ laneIndex }`.
   A víz a `waveGap` csökkenése: tempó = alap × (0,8 + 0,4 × intensity); ütközés: `stumbleMs = 800`, `waveGap −= 6`;
   jó kapu: turbó 1,5 mp és `waveGap += 12`; rossz kapu: `stumbleMs = 800`. Vég: `waveGap <= 0` → (J1b-ig) vége.
   Győzelem: `distance >= levelDistance` (pályánként a meglévő nehézségi preset szerint: easy 1200 m, normal 1600 m,
   hard 2000 m — a régi 6/8/10 jó válasz helyett).
3. `L/tsunami/obstacles.ts`: seedelt akadály-generátor sávonként, minimális rés a reakcióidőhöz (sebesség × 0,9 mp),
   az első 30 mp-ben ritkább (Q7). Kapu-ablak alatt (a kapu előtti 4 mp) a kapu sávjaiban nincs akadály („kapu-pillanat”).
4. `L/tsunami/sim.ts`: `createSimGame` (K.6) a maggal + `createQuestionDirector` egy szintetikus provider-rel (200
   kézi tétel a teszthez).
5. `P/TsunamiEscapeEnglish.tsx`:
   - fázisok: a `"quiz"` fázis megszűnik (`:530`), helyette `"play"` alatt aktív `presentation`;
   - `useQuestionDirector` (`config`: `optionCount: 3`, `minGapMs: 1500`, `maxGapMs: 15000`, `targetPerMin: 5`,
     `baseWindowMs: 4500`, `slowMo: 0.6`, `grade`); a provider `material()` / `fresh()` a meglévő `pickQuiz` ágait
     bontja két függvényre (`:828-908`) — a forrásrend és a kupon-szabály marad; `restore()` a payload szerint;
   - `gameLoop` (`:1108-1212`) a `core.step`-et hívja; a director `tick` → `placeGate`; a kapu elérésekor
     `director.answer(id, laneOptions[lane], simNow)`;
   - érintés: vízszintes húzás (≥ 30 px) = sávváltás, felfelé = ugrás (a meglévő joystick helyett; a `touchAction:
     "none"` minta marad — `T/game-touch-controls.test.ts` őr); billentyű ←/→/↑ (és A/D/W);
   - `InlineQuestion` `mode="bar"` (a prompt a felső sávban, `skin="ocean"`), hibánál `reveal` 1,8 mp (a helyes kapu
     zölden villan a 3D jelenetben is), `WhyButton` + a meglévő `QuizFeedbackCard` (`:1972` környéke) a „Miért?”-re;
   - a régi dialógus (`:1821-1918`) és a `setInterval`-os kvíz-óra (`:1323-1334`) törlődik;
   - HUD: távolság / cél, hullám-távolság sáv (`progress`), kagyló, kombó (`GameHud` stat-limit 4, Q6);
   - pont: kagyló × 5 + jó kapu × 30 × kombó-szorzó + távolság / 10; `runXp` = menet-pont; `runStreak` = `combo.best`;
   - teszt-API (`:986-1018`): `forceState({ question: true })`, probe a K.2 mezőkkel + `waveGap`, `distance`.
6. `GE/scenes/TsunamiScene3D.tsx`: három sáv, futó animáció folyamatosan (a `:1063` „csak play-ben animál” marad),
   kapuk (3 felirat-sík, `sprites.ts` szöveg-sprite mintával, UNKNOWN U-J1-1), akadály-készlet (pool, Q8), a hullám
   a játékos mögött a `waveGap` szerint. Költségkeret: `LOOK_BUDGET` (`GE/three-look/tier.ts:27-43`).
7. Tesztek: `T/tsunami-core.test.ts` (sávváltás, ugrás, ütközés, kapu-feloldás, győzelem távolságra, kapu-pillanatban
   nincs akadály a kapu sávjaiban); `T/tsunami-sim.test.ts` (J2 ≥ 5/perc, J3 ≤ 15 mp, ≥ 1,5 mp, J9 2–5 perc medián,
   kérdés nélküli mód: végigjátszható és van vereség).
8. Meglévő tesztek: `T/tsunami-think-time.test.ts` a régi 24–32 mp-es kvízidőt (`GE/tsunamiTiming.ts`) méri — a
   tsunamiTiming függvényei maradnak (a menetközi „mentőöv” J1b-ben használja a `tsunamiQuizSeconds`-ot a
   `windowMsFor` helyett? NEM: a J1b a `windowMsFor`-t használja); ha a teszt a lap viselkedését nézi, SPEC-VÁLTOZÁS
   jelöléssel a J10 válaszablakot ellenőrző esetre cserélendő — **előbb olvasd el a tesztet**, és csak a terv 9.
   szakaszával összhangban módosíts; ha a teszt csak a `tsunamiTiming.ts` tiszta függvényeit nézi, változatlan marad.
   `T/tsunami-mobile.test.ts`: olvasd el; a mobilkeret-elvárások (GameShell, touch) maradnak.
9. Esetfájlok: a K.2 két szabálya (régi testid-ek + `phase: "quiz"` álnév) miatt a `T/game-mobile-cases/tsunami-english.ts`
   várhatóan változatlan; ha mégis módosul: `quizScope: '[data-testid="ts-quiz"]'`, `answerWrong` a `[data-testid^="play-option-"][data-correct="false"]` első
   elemére kattint (a sr-only gombsor fókuszálható — Playwright `click({ force: true })` helyett `focus` + `Enter`, hogy
   a láthatósági ellenőrzés ne bukjon; UNKNOWN U-J1-2). `T/game-win-cases/tsunami-english.ts`: `force: { phase: "won" }`
   (a `correctCount` elhagyható, ha a lap már nem használja — a `resultTestId: "ts-won"` marad).
10. `T/tsunami-play.spec.ts`: J1 (simTime kérdés alatt), J5 (hibás kapu után nincs dialógus), kapu-válasz a `play-option`
    gombsoron át, 3 nézet, képernyőképek.

### J1b — Mentőöv, Örvény-miniboss, Nagy Hullám főellenfél, szakaszok

1. Állapot-sor commit.
2. `core.ts`: `stage` (tengerpart → falu → erdő → hegyoldal, `levelDistance / 4` szakaszonként), szakaszvégi
   **Örvény**: 3 kapu 1,2 mp-es résekkel (`director.request("boss")` háromszor, `bossMinGapMs: 800`); **Nagy Hullám** a
   cél előtti 15%-ban: 4 kapu gyorsuló ütemben; mind jó = `waveGap += 40` és +300 pont, „Hullám visszaverve!”.
3. **Mentőöv:** `waveGap <= 0` első alkalommal → `director.request("rescue")`, `InlineQuestion mode="buttons"`
   (4 opció, `slowMo: 0.35`); jó = `shieldMs = 3000`, `waveGap = 20`; rossz / lejárt = vége (a helyes válasz
   `reveal`-lel 1,8 mp, majd `ResultScreen`).
4. `ResultScreen` `extra`: `ResultReview` (`director.wrongList()`); csillag: `computeStars` a kapu-pontossággal.
5. Tesztek: core (Örvény-sor időzítése, mentőöv egyszer menetenként), sim (J9 menethossz a szakaszokkal), spec (boss
   képernyőkép, mentőöv `buttons` mód M2).

### J1c — Hallott szó, szó-buborék, finomhangolás

1. Állapot-sor commit.
2. Szó-buborék (nyelvi tárgynál, `subject === "english"` vagy vegyes módban angol tétel): felvételkor
   `speech.say(speakText, "en")` (J0c `createGameSpeech`, `arm()` a start gomb kezelőjében), és a következő
   kapukérdés ennek a tételnek a jelentését kérdezi (`provider.fresh` előtt a buborék tétele, ha van). Ha a beszéd
   nem elérhető: a buborék kiírja a szót (terv 5.1 Q3).
3. Beállítás: a `StartScreen` `settings` részébe „Felolvasás” kapcsoló (`useGameSettings`), ≥ 48 px (C-30 tünet 2).
4. Hang: `sfxGate`, `sfxStumble`, `sfxRescue`, `sfxCombo`; rezgés: jó kapu `success`, rossz `error` (M10).
5. Finomhangolás a sim alapján (J2, J3, J9 küszöbök); J11 mérés low-tier + 4× CPU-lassítással (`T/tsunami-play.spec.ts`
   kiegészítés, CDP `Emulation.setCPUThrottlingRate`, `probe().fps` medián ≥ 30).
6. Tesztek: `T/game-play-speech.test.ts`-hez nem nyúlsz (J0c); új eset a `T/tsunami-core.test.ts`-ben: buborék → következő
   kapu a buborék tétele.

### Elfogadás (J1)

- [ ] J-TS teljesül (J1a: futás + kapu + távolság-győzelem; J1b: mentőöv + Örvény + Nagy Hullám; J1c: hallott szó).
- [ ] `T/tsunami-sim.test.ts`: J2 ≥ 5/perc, J3 ≤ 15 mp és ≥ 1,5 mp, J6, J7, J9; kérdés nélküli mód OK.
- [ ] `T/tsunami-play.spec.ts`: J1, J5, J11 (J1c), M2/M3 kérdés-állapotban; a mobil mérő (`-g tsunami`) zöld.
- [ ] `game-win-paths` (`tsunami-english`), `coupon-expired-all-games.spec.ts`, `vocab-cross-game-log.spec.ts`,
  `T/game-feedback-wiring-guard.test.ts` (import + JSX esetek) zöldek.
- [ ] K.3 etikai és K.4 30 pontos minőségi kapu és K.5 kódszabályok kitöltve a PR-ben.

### UNKNOWN

- U-J1-1 (felderítve 2026-11-16): a `GE/three-look/sprites.ts` csak fény-sprite-ot exportál (`glowTexture`, `createGlowSprite`, `isSharedLookTexture`), szöveg-sprite nincs → a kapu-felirat DOM-réteg a vászon fölött (a sávok vetített x-pozíciójára, `Vector3.project`), vagy a J1a-ban egy `CanvasTexture`-alapú felirat-sprite (pool, KSZ-6).
- U-J1-2: a `game-mobile-quality` segéd `answerWrong` hívási módja — felderítés: `grep -n "answerWrong" T/support/game-mobile-quality.ts`.
- U-J1-3: a 3 sáv 360 px szélességen kényelmes-e a vászon arányaival — a J1a képernyőképein ellenőrizendő; ha nem, a kapu-feliratok két sorra törnek.

---

## J2 — Szólétra: „Szikla-verseny” (J2a, J2b)

**Állapot (J2a):** kész — #454 (d5c91060, 2026-11-16), kanban #45 · **Állapot (J2b):** nem kezdődött
**Függ:** J0c merge. Párhuzamosan futhat a J4-gyel. **Elfogadás:** J-WL, J1–J10, J14, J16, M1–M12. Terv: 5.2.

### Fájlok

`P/WordLadderHuEn.tsx`, `L/wordLadderLogic.ts`, `L/wordLadderLevels.ts`, `GE/scenes/LadderScene3D.tsx`, új
`L/wordLadder/core.ts`, `L/wordLadder/sim.ts`, tesztek: `T/word-ladder-core.test.ts`, `T/word-ladder-sim.test.ts`,
`T/word-ladder-play.spec.ts`, `T/game-feedback-wiring-guard.test.ts` (csak a WordLadder-teszt, 114–127. sor),
`T/game-explanation-pause.spec.ts`, `T/game-mobile-cases/word-ladder-hu-en.ts`, `T/game-win-cases/word-ladder-hu-en.ts`.
A meglévő `T/word-ladder-logic.test.ts`, `-levels`, `-vocab`, `-validate`, `-en-bank`, `-de`, `-fr`, `-3d-wiring`,
`-3d-review` tesztek: olvasd el mindet; ami a `wordLadderLogic.ts` tiszta függvényeit nézi (`nextRung`, `xpForCorrect`,
mérföldkövek), az változatlan marad (a függvények maradnak).

### A mostani kód horgonyai

- Fázisok `P/WordLadderHuEn.tsx:106` (`"menu" | "quiz" | "reveal" | "step" | "won"`); szünet `:264-267`;
  futamidő-intervallum `:595-600`; lépéslánc `runStepChain` `:717-761`; konstansok `:82-84`.
- Kérdés: `tiers` / `allTiers` `:377-465`; szóbank-készlet `:404-433`; `nextUnseen` `:530-533`; első kérdés `:535-540,
  604-608`; tartós napló `:614-619`; `onAnswer` `:771-844`; magyarázó kártya `:836-840, 763-769`.
- Panel `:1188-1283`; `QuizBoard3D` `:1196-1207`; HUD XP-hiba `:1104-1107`; score `:866-884`; jelvények `:886-912`;
  `finishWon` `:632-647`; `ResultScreen` `:1390-1413`; teszt-API `:335-348`; `?rung=` `:572-577`.
- Logika: `L/wordLadderLogic.ts:31-68` (mérföldkövek), `:88-103` (XP, fok, sorozat-felirat), `:113-128` (szövegek).
- Pályák: `L/wordLadderLevels.ts:14-56`.

### J2a — mag, szó-kapaszkodó, rivális, vereség, a kötelező animáció megszűnése

1. Állapot-sor commit.
2. `L/wordLadder/core.ts`: `LadderState` (`rung`, `targetRung` (a pálya hossza, `wordLadderLevels`), `rival: { rung,
   speed }`, `stunMs`, `ropeCharges`, `rocks[]` — J2b), `step(state, dtMs, intensity, rng)` — a rivális tempója
   `baseRungPerSec × (1 + 0,15 × clamp((rung − rival.rung)/4, −1, 1))` (gumiszalag), alap a pályából úgy, hogy a
   `SIM_AVERAGE` játékos ~60–70%-ban nyerjen; `answer(state, correct)`: jó +1 fok (kombó ×2-től +2), rossz: `stunMs =
   600`, fok −1 (0 alatt 0). Vég: `rung >= targetRung` → győzelem; `rival.rung >= targetRung` → vereség.
3. `L/wordLadder/sim.ts` (K.6).
4. `P/WordLadderHuEn.tsx`: a `"quiz" | "reveal" | "step"` fázisok helyett `"play"`; `useQuestionDirector`
   (`optionCount: 4`, `minGapMs: 1500`, `maxGapMs: 8000`, `targetPerMin: 10`, `baseWindowMs: 4500`, `slowMo: 1` —
   a mászás maga a válasz, de a rivális a kérdés alatt is mászik, J1); a provider a meglévő `tiers` / szóbank-készlet /
   `nextUnseen` logikából (`:377-465, 530-533`); a tartós napló (`markAsked` / `markExternal`, `:614-619`) a
   **megjelenítéskor** marad (a szóbank-motor szerződése), az ismétlést a review queue kezeli;
   - a kapaszkodók: a 4 opció a falon 2×2 elrendezésben (DOM-gombok a 3D jelenet fölött, ≥ 48 px, `play-option-<i>`,
     `skin="rock"`; az `InlineQuestion` `mode="bar"` adja a promptot és az időcsíkot);
   - a `runStepChain` 900 + 620 ms-os lánca (`:717-761`, `:82-84`) megszűnik: lépés-animáció 250 ms, a következő kérdés
     azonnal (a director `minGapMs` szerint);
   - hibánál: a választott kapaszkodó „letörik”, a helyes 1,8 mp-ig zölden világít (`reveal`), a rivális mászik tovább;
     `WhyButton` + `QuizFeedbackCard`;
   - vereség: `ResultScreen` `won=false`, cím „Majdnem! <n> fok hiányzott.”, `ResultReview`;
   - HUD: fok / cél, rivális-távolság (`progress`), kombó; a HUD-hiba (`:1104-1107`) javítva: a menet-XP látszik;
   - score: `difficulty` a pálya-sávból (`easy` 1–3, `normal` 4–7, `hard` 8–10 — a meglévő enum), `runStreak = combo.best`;
   - teszt-API (`:335-348`): `forceState({ question: true })` + probe (K.2 + `rung`, `rivalRung`).
5. `GE/scenes/LadderScene3D.tsx`: második (rivális) mászó a `rival.rung` szerint, más színnel; a meglévő mérföldkő-tájak.
6. **Spec-változás (terv 9.):** `T/game-feedback-wiring-guard.test.ts` 114–127. sora („a kártya bezárása indítja a
   lépés-láncot”) és `T/game-explanation-pause.spec.ts` → SPEC-VÁLTOZÁS jelöléssel cserélendő erre: (a) hibás válasz
   után a helyes kapaszkodó `data-state="correct"` legalább 1,8 mp-ig; (b) nincs `[role="dialog"]` a „Miért?” nélkül;
   (c) „Miért?” → `quiz-feedback` látható és a `probe().simTime` nem nő; (d) bezárás után a kérdés-sor folytatódik. A
   `WIRED`-esetek (import, `buildFeedback(`, `<QuizFeedbackCard`) változatlanok.
7. Tesztek: `T/word-ladder-core.test.ts` (gumiszalag, vereség, kombó-lépés, stun), `T/word-ladder-sim.test.ts` (J2 ≥ 10,
   J3 ≤ 8 mp, J9 medián 2–5 perc a 14 fokos pályán; `SIM_AVERAGE` nyerési arány 50–80%), `T/word-ladder-play.spec.ts`.

### J2b — hulló kövek, Szélsas főellenfél, hallás utáni kérdés, kötél-turbó

1. Állapot-sor commit.
2. `core.ts`: kövek (sávonként, figyelmeztető árnyék 1 mp-cel előtte), kitérés balra / jobbra húzással (két oszlop),
   találat = −1 fok + `stunMs 400`; az első 30 mp-ben nincs kő (Q7). **Szélsas:** a cél előtti 3 fok 3 gyors
   kérdés (`request("boss")`), közben szélroham (a kapaszkodók oldalra mozognak, ügyesség); legyőzve = zászló.
3. **Kötél:** 3 jó egymás után = `ropeCharges = 1`, a következő helyes válasz +3 fok.
4. **Hallás utáni kérdés:** minden 4. szóbank-kérdésnél a prompt helyett 🔊 + „Mit hallasz?” (a `speech.say(term,
   lang)` az indító koppintás után; a kapaszkodókon a magyar jelentések, `target-to-hu` típus). Ha a beszéd nem
   elérhető (csökkentett mozgás, nem támogatott, kikapcsolt): a szó kiírva jelenik meg (J14 kapu).
5. Beállítás: „Felolvasás” kapcsoló a `StartScreen` `settings`-ben.
6. Tesztek: core (kő-ütemezés, Szélsas-sor, kötél), sim (J3 továbbra is ≤ 8 mp), spec (boss és hallás képernyőkép).

### Elfogadás (J2)

- [ ] J-WL teljesül; a 900 + 620 ms-os kötelező animáció nincs (a `L/wordLadderLogic.ts`/lap konstansai törölve vagy
  nem használtak — `grep -n "620\|900" P/WordLadderHuEn.tsx` csak indokolt találat).
- [ ] `T/word-ladder-sim.test.ts` J2, J3, J6, J7, J9 zöld; a SPEC-VÁLTOZÁS-os tesztek az új követelményt mérik.
- [ ] A meglévő `word-ladder-*` egységtesztek és a `vocab-cross-game-log.spec.ts` (`:49-52`) zöldek.
- [ ] Mobil mérő `-g word-ladder` zöld; képernyőképek.

### UNKNOWN

- U-J2-1 (felderítve): a `vocab-cross-game-log.spec.ts:49-57` a `wl-start`, `wl-option-*`, `wl-prompt` testid-eket használja → a kapaszkodó-gombok megtartják a `wl-option-<i>`, a prompt a `wl-prompt` azonosítót (K.2), a teszt változatlan. (Korábbi kérdés: a régi panel testid-jeit használja-e (`wl-option-*`) — felderítés: `grep -n "wl-" T/vocab-cross-game-log.spec.ts`; ha igen, a kapaszkodó-gombok a régi `wl-option-<i>` testid-et is hordozzák (kettős testid nem lehetséges → a gomb `data-testid="play-option-<i>"`, és a teszt a `play-option` szelektorra frissül SPEC-VÁLTOZÁS nélkül, mert csak szelektor-csere, az elvárás változatlan — ezt a PR-leírásban külön jelezd).

---

## J3 — Kockavadász: „Rúnabánya” (J3a, J3b, J3c)

**Állapot (J3a):** nem kezdődött · **Állapot (J3b):** nem kezdődött · **Állapot (J3c):** nem kezdődött
**Függ:** J0c merge (a 4. hullámban, a J1/J2/J4 tapasztalata után). **Elfogadás:** J-BC, J1–J11, J16, M1–M12. Terv: 5.3.

### Fájlok

`P/BlockCraftQuiz.tsx`, `L/voxelcraft.ts`, `L/blockCraftSubjects.ts`, új `L/blockcraft/core.ts`, `L/blockcraft/mobs.ts`,
`L/blockcraft/sim.ts`, tesztek: `T/blockcraft-core.test.ts`, `T/blockcraft-mobs.test.ts`, `T/blockcraft-sim.test.ts`,
`T/blockcraft-play.spec.ts`, `T/game-mobile-cases/block-craft-quiz.ts`, `T/game-win-cases/block-craft-quiz.ts`; a meglévő
`T/blockcraft-mobile.test.ts`, `T/blockcraft-subject-mapping.test.ts`, `T/blockcraft-two-finger.spec.ts` zöldek maradnak.

### A mostani kód horgonyai

- Fázisok `P/BlockCraftQuiz.tsx:1118`; pályák `LEVELS` `:132-205`; óra `:1425-1438`; `adaptiveTimeBudget` `:1649`.
- `step` `:2197-2346`; loop-vezérlés `:2396-2408`; fizika `L/voxelcraft.ts:335`; `vMineable` `L/voxelcraft.ts:67-69`;
  mobok `L/voxelcraft.ts:229-250`; víz / leesés `:2248-2252`.
- Kvíz-trigger: `tryMineAt` `:1578-1597`, `tryMineLook` `:2655-2659`, koppintás-bányászás `:2739-2768`.
- `pickQuiz` `:1454-1554`; összefésülés `:1334-1366`; kiértékelés `onAnswer` `:2418-2537`; `dismissFeedback`
  `:2410-2416`; idő-csökkentés `:2422-2425`; XP `XP_BY_TILE` `:472-490`, `:2479-2513`.
- Kvíz-modál `:3104-3183`; kártya `:3199`; HUD `:2782-2807`; vezérlők `:2996-3050`; Escape-tiltás `:2589-2591`.
- Score `:2555-2569` (`runStreak` hiba `:2562`); jelvények `:2606-2617` (`wrongAnswers: 0`, `perfect` hiba `:2610, 2614`).
- Teszt-API `:1228-1257`.

### J3a — kérdés nélküli bányászat (tartás), Rúna-zár, a régi modál megszűnése, adathibák

1. Állapot-sor commit.
2. `L/blockcraft/core.ts`: bányászási idő blokktípusonként (fű / föld 0,4 mp, kő 0,8, érc 1,2 — tartással; a koppintás
   egy „ütés”, 3 ütés = egy blokk koppintós módban), rúnaérc-elhelyezés (seedelt; a director `maxGapMs: 15000` szerint a
   játékos 8 blokkos körzetében mindig legyen egy, ha nincs: `spawnRuneOreNear`), `RuneLock` (a 3–4 rúnakő pozíciója az
   érc körül, opció-indexszel).
3. `P/BlockCraftQuiz.tsx`:
   - a `tryMineAt` (`:1578-1597`) sima blokknál nem nyit kvízt, a tartás-idő után kiüti a blokkot (hotbarba kerül);
     a mozgás nem nullázódik (a `releaseMovement` / `releasePointerLock` ág csak a régi kvíznél kellett);
   - rúnaérc érintésekor `director.request("trigger")` → `RuneLock` a világban (3D rúnakövek a feliratokkal, U-J3-1) +
     `InlineQuestion mode="bar"` (`skin="mine"`), a rúnakő kiütése = `director.answer`; jó: dupla érc; rossz: kisebb
     zsákmány, a helyes rúna 1,8 mp-ig világít;
   - a `"quiz"` fázis és a modál (`:3104-3183`) megszűnik; a `QuizFeedbackCard` csak a „Miért?”-re;
   - az idő-csökkentés (`:2422-2425`) megszűnik: a pálya ideje nem függ a válaszok helyességétől;
   - pálya-cél: „N rúnaérc” (a régi „N blokk” helyett; a `LEVELS` célszámai: 3/4/5/6/7 rúnaérc);
   - adathibák: `runStreak = combo.best` (`:2562`), `recordRun` `wrongAnswers` és `perfect` a director statisztikából
     (`:2606-2617`);
   - teszt-API (`:1228-1257`): `forceState({ question: true })` (rúnaérc + zár a játékos előtt), probe K.2 mezők.
4. `L/blockcraft/sim.ts` (K.6): a sim egyszerűsített „rácson járó” modell (a voxel-fizika nélkül): blokkok,
   rúnaércek távolsága, bányászási idő.
5. Tesztek: `T/blockcraft-core.test.ts` (sima blokk kérdés nélkül; rúnaérc mindig elérhető 15 mp-en belül;
   zár-feloldás), `T/blockcraft-sim.test.ts` (J2 ≥ 7/perc, J3 ≤ 15 mp; kérdés nélküli mód — J3a-ban még nincs
   vereség: a sim ezt az esetet J3b-ig `won()`-nal jelzi; a „van vesztési feltétel” pont J3b elfogadása).

### J3b — nappal–éjjel ciklus, sebző mobok, kard, életek

1. Állapot-sor commit.
2. `L/blockcraft/mobs.ts`: egyszerű viselkedés (zombi: közelít, csontváz: 8 blokkról lő 2 mp-enként, pók: ugrik);
   csak éjszaka (60 mp) aktív, nappal 90 mp; sebzés 1 szív, 3 szív; kard: koppintás közelről (időzítés: 0,4 mp
   „lendítés”), 2 találat = mob legyőzve, XP.
3. Vereség: 0 szív → `over`; a régi „óra lejár” (`:1425-1438`) helyett a menet a ciklus végén (2. nappal vége) ér véget,
   ha addig nincs jelzőtűz.
4. Az éjszaka az első 30 mp-ben nem kezdődhet (Q7); a mob-sűrűség az `intensity` szerint.
5. Tesztek: `T/blockcraft-mobs.test.ts`; sim: kérdés nélküli módban van vereség; spec: éjszakai képernyőkép.

### J3c — Kraft-kérdés, Kő-gólem főellenfél, jelzőtűz-győzelem

1. Állapot-sor commit.
2. Kraft-asztal: 2 inline kérdés `mode="buttons"` (a képernyő alján, a világ fut — a mobok ilyenkor is mozognak, de az
   asztal 3 blokkos körzetében 50%-kal lassabban); mindkettő jó = vas csákány / kard (+50% bányászás / sebzés).
3. **Kő-gólem:** a 2. éjszaka végén; 3 gyenge pont = 3 válasz (`request("boss")` sor), a helyes rúna ütése ×4 sebzés,
   rossz = visszalökés; két fázis (Q11); legyőzve + jelzőtűz = győzelem.
4. `ResultReview`, csillagok; hang (`sfxBossHit`, `sfxBossDefeat`).
5. Tesztek: core (kraft, gólem-fázisok), sim (J9 menethossz 2–5 perc), spec (boss, kraft képernyőkép; J11 fps).

### Elfogadás (J3)

- [ ] J-BC teljesül; `grep -n "setPhase(\"quiz\")" P/BlockCraftQuiz.tsx` → 0 találat.
- [ ] `T/blockcraft-sim.test.ts` J2, J3, J6, J7, J9 zöld; kérdés nélküli módban vereség lehetséges (J3b után).
- [ ] `T/blockcraft-two-finger.spec.ts`, `T/games-pointer-controls.spec.ts`, mobil mérő `-g block-craft` zöld (C-33:
  CI-azonos úton is).

### UNKNOWN

- U-J3-1 (felderítve): szöveg-sprite nincs a közös rétegben (lásd U-J1-1) → `CanvasTexture`-felirat vagy a rúnakövek
  színkódoltak (A/B/C/D betű + szín), a válasz-szöveg a kérdés-sávban a betűvel párosítva.
- U-J3-2: a `T/blockcraft-mobile.test.ts` mely kvíz-elemeket vár — felderítés: olvasd el a lépés előtt.

---

## J4 — Gyors matek sprint: „Neon védőtorony” (J4a, J4b) — D1 alapértelmezés

**Állapot (J4a):** kész — #451 (b82ea71d), kanban #44 · **Állapot (J4b):** folyamatban — ág feat/jatek-j4b-matek-foellenfel, munkafa .claude/worktrees/jatek-j4b, kanban #51
**Függ:** J0c merge. Párhuzamosan a J2-vel. **Elfogadás:** J-SQ, J1–J10, J16, M1–M12. Terv: 5.4.

### Fájlok

`P/SpeedQuizMath.tsx`, `GE/speedQuizTiming.ts`, `source/client/src/components/MathTowerScene3D.tsx`, új
`L/speedMath/core.ts`, `L/speedMath/sim.ts`, tesztek: `T/speed-math-core.test.ts`, `T/speed-math-sim.test.ts`,
`T/speed-math-play.spec.ts`, `T/game-feedback-wiring-guard.test.ts` (csak a SpeedQuiz-ág, 79–110. sor),
`T/game-mobile-cases/speed-quiz-math.ts`, `T/game-win-cases/speed-quiz-math.ts`. A meglévő
`T/speed-quiz-mobile.test.ts`, `T/speed-quiz-explanations.test.ts`, `T/think-time.test.ts`: olvasd el; a tiszta
függvényeket (feladatgenerátor, időzítés) nézők változatlanok.

### A mostani kód horgonyai

- Fázisok `P/SpeedQuizMath.tsx:38`; szünet `:1384`; feedback `:1409`; játékóra `setInterval` `:1613-1645`, `if (feedback)
  return;` `:1610`.
- Feladat: `TEACHER_BANK` / `generatedTaskForGrade` `:1319-1330, 592`; `pickFreshTask` `GE/no-repeat.ts:113-133`;
  számjegy-választás `:1339-1349`; futáson belüli kizárás `:1489-1490`.
- Kiértékelés `handleAnswer` `:1651-1728`; hibakártya `:1500-1546`; retry `:1534-1546`; pont `:1688-1697`; élet `:1396`.
- Megjelenítés `:2018-2135`; „Tanári bank / Generált” `:2036-2038`; torony `:2014`; befejezés `:1586-1591`; score
  `:1759-1779`; jelvények `:1782-1808`; eredmény `:2159-2188`; teszt-API `:1413-1424`.
- Időzítés `GE/speedQuizTiming.ts:7-18, 37-48, 56-59`.

### J4a — Neon védőtorony mag, drón-célpont, pajzs, hullámok

1. Állapot-sor commit.
2. `L/speedMath/core.ts`: `TowerState` (`shield: 3..5`, `drones: { id, optionIndex, x, y, vy }[]`, `wave`, `kills`),
   `spawnDronesFor(presentation)` (a 4 opció 4 drónon, seedelt x), `step(dtMs, intensity)` (sebesség: a válaszablakból
   számolt, hogy a drón az ablak végén érjen a toronyhoz), `hit(droneId)` → `{ correct }`, `reachTower()` → pajzs −1
   (ha a helyes drón ér be); rossz drón lövése: pajzs −1. Hullámok `createWaveDirector` 5 hullámmal (hullámonként 6–10
   feladat).
3. `P/SpeedQuizMath.tsx`:
   - `useQuestionDirector` (`optionCount: 4`, `minGapMs: 1500`, `maxGapMs: 6000`, `targetPerMin: 10`, `baseWindowMs: 4500`
     — 3–4. évf. ×1,25, `slowMo: 1`); a provider `fresh()` a meglévő feladatgenerátort hívja (`:1319-1349`) — a 68% /
     32% arány és a `pickFreshTask` marad; `material()` → null (a Matek most sem kér tananyagot — a forrásrend többi
     része érvényes); `restore()` a payload pillanatképből;
   - a 4 számgomb (`:2088-2135`) helyett a drónok DOM-gombként a 3D torony fölötti rétegen (≥ 48 px, `play-option-<i>`,
     a feliratuk a szám), `InlineQuestion mode="bar"` a feladattal (`skin="neon"`);
   - a 45 mp-es kérdésidő (`GE/speedQuizTiming.ts:56-59`) a `windowMsFor`-ra cserélődik (a `speedQuizTiming.ts`
     függvényei maradnak, ha más teszt nézi őket);
   - a hibakártya (`:1500-1546`) és a retry megszűnik a játékmenetből; a `QuizFeedbackCard` csak a „Miért?”-re;
     a „Tanári bank / Generált” felirat (`:2036-2038`) törlődik;
   - vég: pajzs 0 → `over`; győzelem: 5. hullám vége (J4b-ben a főellenfél után);
   - pont: alap 10 × kombó-szorzó + gyorsasági bónusz (a meglévő `scoreCorrectAnswer`, `GE/retry-policy.ts:30-43`,
     `attempt: 1`); `runStreak = combo.best`;
   - teszt-API (`:1413-1424`): `forceState({ question: true })`, probe K.2 + `shield`, `wave`.
4. `MathTowerScene3D.tsx`: a torony marad, a drónok 3D-ben (pool), lézer-effekt, robbanás `SparkleField`-del.
5. **Spec-változás (terv 9.):** `T/game-feedback-wiring-guard.test.ts` SpeedQuiz-ága (79–110. sor: „rossz válasz ága nem
   léptet automatikusan”, „a magyarázat olvasása közben áll az óra”, „0 életnél nincs Újrapróbálom”) → SPEC-VÁLTOZÁS
   jelöléssel: (a) a hibás ágban `director.answer` után `reveal` ≥ 1800 ms (forrásbeli konstans-ellenőrzés:
   `REVEAL_MS\s*=\s*1800` vagy nagyobb) és nincs `setTimeout(nextTask`; (b) a „Miért?” ága szünetet tart (`if (whyOpen)
   return;` minta a játékórában); (c) a retry-gomb nincs a játékmenetben (a `QuizFeedbackCard`-on nincs `onRetry=`, `retryTask` nincs; a `ResultScreen` „Új futam”-ja megengedett — K.2 e) — mert a
   retry a megmutatott megoldás visszakoppintása volt (terv 3.1). A `WIRED` esetek változatlanok.
6. Tesztek: `T/speed-math-core.test.ts` (drón-ütemezés az ablakhoz, pajzs-szabályok, egy válasz / kérdés — multitouch
   idempotencia), `T/speed-math-sim.test.ts` (J2 ≥ 10, J3 ≤ 6 mp, J9 medián 2–5 perc), `T/speed-math-play.spec.ts`.

### J4b — Hibagyár miniboss, Zéró-robot főellenfél, Számlánc, Becslő-bomba

1. Állapot-sor commit.
2. **Számlánc:** ×3 kombótól a következő feladat első operandusa az előző eredmény (a generátor hívása `seedOperand`
   paraméterrel — ha a generátor nem támogatja, a láncfeladat egy kis helyi generátorból jön: `a ± b` / `a × b` az
   évfolyam számkörében; U-J4-1).
3. **Becslő-bomba:** 20 mp-enként „Melyik nagyobb?” 2 opcióval (`optionCount` felülírás a presentationban — a
   director `request("trigger")` 2 opciós változata: a provider `fresh` helyett egy helyi `estimateTask()`; ez NEM kerül
   az ismétlési sorba, nem számít a J6-ba — kivétel dokumentálva a sim-tesztben); jó = minden drón eltűnik.
4. **Hibagyár** (3. hullám után): két feladat egyszerre, két drónsor (bal / jobb fél), 2 aktív presentation — a
   director egyszerre egyet kezel, ezért a Hibagyár két egymást követő `request("boss")` 0,8 mp-es eltolással, a
   második sor a képernyő másik felén (szerződés-kiegészítés nem kell).
5. **Zéró-robot** (5. hullám után): 3 láncolt feladat, páncél-szegmensek; két fázis (Q11); legyőzve = győzelem.
6. `ResultReview`, csillag, hang (`sfxCombo`, `sfxBossHit`, `sfxBossDefeat`), rezgés.
7. Tesztek: core (lánc, bomba, boss-fázisok), sim (J2/J3 a bossokkal is), spec (boss képernyőkép, J11 fps).

#### Megvalósult eltérések (J4b, mérés alapján)

- **A rossz válasz / lejárat nem visz pajzsot** (a terv 5.4 „rossz drón = pajzs −1” helyett): a kombó és vele a lövés ereje
  vész el (≤ 2 s látható következmény). A 20 seedes mérés szerint −1 pajzzsal a gyengébb és a lassú számoló rosszabbul járt a
  kérdésekkel, mint nélkülük; most minden játékosmodellnél kérdéssel ≤ annyi a vereség (`T/speed-math-sim.test.ts` „J4b —
  a kérdés egyik játékosmodellnél sem büntet”). A pajzs az ügyességi játék (fosztogatók, kísérők) tétje.
- **Zéró-robot ritmusa:** 6 szegmens (a felénél 2. fázis), két főellenfél-kérdés között 3,2 mp; jó válasz = szegmens + kábulat,
  rossz = előjelzett (≥ 600 ms) ellencsapás, amelyet a töltő mag megérintése kivéd; a főellenfél lövése az utolsó pajzsot nem
  viszi el (a vereség a kísérőktől jöhet); nyitott kérdés alatt nem támad. A „3 láncolt feladat” a Számlánc: minden
  főellenfél-feladat első operandusa az előző eredménye (`createTowerTasks`).
- **Hibagyár:** két fogaskerék (két gyenge-pont kérdés egymás után, a kérdés-rés a ritmus szerint), közben gyárt; nincs két
  egyidejű kérdés (a director egyszerre egyet kezel).
- **Kérdés nélkül is legyőzhető** (K.6): a mag-találatok repesztik a páncélt (Zéró-robot: 2 megszakított töltés = 1 szegmens;
  Hibagyár: 5 mag-találat = 1 fogaskerék).
- **Becslő-bomba:** a director `request("trigger")` a forrás kétopciós tételével (a `buildOptions` két célt ad); közös,
  additív `PlayQuestion.noReview` — nem kerül az ismétlési sorba, és a `runStats` visszatérési / változatossági mérése sem
  számolja.

### Elfogadás (J4)

- [ ] J-SQ teljesül; `grep -nE "Tanári bank|<QuizFeedbackCard[^>]*onRetry=|retryTask" P/SpeedQuizMath.tsx` → 0 találat (a
  pontosítás oka: K.2 „Megvalósult eltérések” e — a `ResultScreen` „Új futam” propja új menet, nem újrapróba).
- [ ] `T/speed-math-sim.test.ts` J2, J3, J6, J9 zöld; a SPEC-VÁLTOZÁS-os őr-esetek az új követelményt mérik.
- [ ] `game-win-paths` (`speed-quiz-math`), mobil mérő `-g speed-quiz` zöld; képernyőképek.

### UNKNOWN

- U-J4-1: a `generatedTaskForGrade` paraméterezhető-e operandussal — felderítés: `sed -n 560,640p P/SpeedQuizMath.tsx`.
- U-J4-2: `MathTowerScene3D` költsége további drónokkal low-tier-en — J11 mérés dönti el; túllépésnél a drónok 2D DOM-elemek.

### J4-utójavítás — a megoldás-kijelzés az első képkockától számít (main CI 43943054869)

**Állapot:** folyamatban — ág `fix/jatek-kijelzes-elso-kepkocka`, munkafa `.claude/worktrees/jatek-kijelzes`.

**Gyökérok (mérve).** A main CI-ban a `speed-math-play.spec.ts:69` bukott („a megoldás ≥ 1,8 mp-ig látszik” + a
`quiz-feedback` nem jelent meg):
1. *Mérési torzulás:* a teszt a Playwright oldaláról mért (`waitForTimeout(1500)` + parancs-oda-vissza utak), ami a lassú,
   szoftveres WebGL-es CI-n 2 mp fölé nyúlt — a már lezárt kijelzést nézte.
2. *Mozgó gomb:* a „Miért?” koppintás a kijelzés végére esett, amikor a kártya „Miért?”-csippé, majd új feladattá alakul.
3. *Termékoldali rés:* a koppintás két képkocka közé esik; a `pick()` az előző képkocka órájával indította a kijelzést, a
   zöld cél viszont csak a következő képkockán látszik. SwiftShader + 6× CPU-lassítás mellett a LÁTHATÓ kijelzés 1815–1936 ms
   volt a `REVEAL_WRONG_MS = 2000` helyett.

**Lépések (AI-végrehajtás).**
1. `GE/play/questionUi.ts`: a kijelzés (`rev.until`) és a hozzá tartozó „Miért?”-ablak a válasz utáni ELSŐ `frame()`-től
   számít (`Math.max`, csak hosszabbodhat); a képkockán belüli lezárás (lejárat) nem tolódik. Mind a hét játék és a Párbaj
   ugyanazt kapja.
2. `T/game-play-question-ui.test.ts`: új determinisztikus eset (két képkocka közti koppintás → a kijelzés és a „Miért?” a
   következő képkockától; képkockán belüli lejárat nem tolódik); mutációs próbán bukik. A meglévő 4 esetben SPEC-VÁLTOZÁS:
   a válasz után azonos órájú élesítő képkocka, az állítások változatlanok.
3. `T/speed-math-play.spec.ts`: a kijelzés hossza lapon belül, képkockánként (a `game-explanation-pause.spec.ts` mintája), a
   mérce ≥ 1,8 mp változatlan; a „Miért?” a kijelzés alatt, álló gombon.
4. Ellenőrzés: célzott egységtesztek, check / lint / check:test, teljes mobil mérő + meta-mérő, `game-explanation-pause`,
   Párbaj e2e-k; SwiftShader + 4× lassítás, előtte / utána 2×10 ismétlés.

**Elfogadás.** A kijelzés lapon mért hossza lassított gépen is ≥ 1,8 mp; a fenti ellenőrzések zöldek; a CI zöld.

---

## J5 — Brain Rot Lopás: „Lény-aréna” (J5a, J5b)

**Állapot (J5a):** nem kezdődött · **Állapot (J5b):** nem kezdődött
**Függ:** J0c merge (3. hullám). **Elfogadás:** J-BR, J1–J10, J16, M1–M12. Terv: 5.5.

### Fájlok

`P/BrainRotSteal.tsx`, `L/brainRotPhysics.ts`, `L/brainRotTuning.ts`, `GE/scenes/BrainRotArena3D.tsx`, új
`L/brainRot/core.ts`, `L/brainRot/rival.ts`, `L/brainRot/sim.ts`, tesztek: `T/brainrot-core.test.ts`,
`T/brainrot-rival.test.ts`, `T/brainrot-sim.test.ts`, `T/brainrot-play.spec.ts`, `T/game-mobile-cases/brain-rot-steal.ts`,
`T/game-win-cases/brain-rot-steal.ts`. A meglévő `T/brainrot-physics.test.ts`, `T/brainrot-tuning.test.ts`: olvasd el;
ha a kvíz alatti „kor-fagyasztást” (`L/brainRotTuning.ts:76-86`) rögzítik, az a terv 5.5 szerint megszűnik → SPEC-VÁLTOZÁS
jelöléssel az új követelményre („a kérdés alatt az óra és a lények mozgása 0,6× sebességgel fut”) cserélendő; a
fizika-esetek (pattogás, határok) változatlanok.

### A mostani kód horgonyai

- Fázisok `P/BrainRotSteal.tsx:117`; óra `:810-824` (90 s, `:120`); rAF `:827-943`; spawn `:846-857` (2,2 s, `:122`);
  max 8 lény `:124`; fojtás `:860`; lejárat `:875, 899-908` (setState-updaterben mellékhatás — javítandó).
- Elkapás `handleCatchBrainRot` `:563-576`; DOM-lények `:1192-1229`; kor-fagyasztás `:740-752`.
- `pickQuiz` `:460-522` (kupon `:443, 471`); kiértékelés `onAnswer` `:593-692`; `dismissFeedback` `:586-590`; retry XP
  `:653`; elkapás-szám `:661`; kombó `:651-667`.
- Modál `:1288-1373`; kártya `:1375`; HUD `:1146-1159`; score `:946-960`; jelvények `:973-982`; napi `:985-988`;
  pálya `:993-998`; eredmény `:1385-1423`; teszt-API `:305-316, 774-794`.

### J5a — aréna-mozgás, menekülő lények, Ketrec-zár, valós óra

1. Állapot-sor commit.
2. `L/brainRot/core.ts`: játékos pozíció + sebesség (joystick), lények menekülési vektora (távolodás a játékostól,
   falnál csúszás; a `stepBrainRot` pattogó mozgása, `L/brainRotPhysics.ts:43-69`, a menekülési komponenssel bővítve),
   elkapás = érintkezés (sugár), `CageLock` (4 ketrec az aréna négy negyedében, opció-index; a lény „küszködik”, a
   játékos sebessége −20%, amíg a ketrecbe nem ér, max `windowMs`).
3. `P/BrainRotSteal.tsx`:
   - a koppintásos elkapás (`:563-576`, `:1192-1229`) helyett mozgásos (joystick a `VirtualJoystick`-kal, a meglévő
     érintésvezérlő-minták szerint; a lények DOM-elemek maradhatnak, pozíciójuk a magból);
   - elkapáskor `director.request("trigger")` → `CageLock` + `InlineQuestion mode="bar"` (`skin="arena"`); a ketrecbe
     futás = `director.answer`; jó: megtartva + kombó; rossz: a lény elszökik (J5b-től a riválishoz), a helyes ketrec
     1,8 mp-ig világít;
   - **valós óra:** a 90 mp a kérdés alatt is jár (a `:810-824` `phase === "play"` feltétel a kérdés alatt is igaz,
     mert nincs `"quiz"` fázis); a kor-fagyasztás (`:740-752`) megszűnik, a kérdés alatt a szimuláció `slowMo: 0.6`;
   - a retry / felfedett válasz visszakoppintása megszűnik (`:586-590, 653, 661`); a modál (`:1288-1373`) megszűnik;
   - a setState-updater mellékhatás (`:899-908`) javítva (a számlálás a magban, nem a `filter`-ben);
   - score: `runXp` = menet-pont, `runStreak = combo.best`;
   - teszt-API: `forceState({ question: true })` (egy lény a játékos mellett elkapva), probe K.2.
4. `L/brainRot/sim.ts`; tesztek: core (menekülés, elkapás, ketrec-feloldás, óra a kérdés alatt), sim (J2 ≥ 8, J3 ≤ 12 mp).

### J5b — rivális tolvaj, Visszalopás-párbaj, Arany lény, fordulók, Tolvajkirály

1. Állapot-sor commit.
2. `L/brainRot/rival.ts`: a rivális a legközelebbi szabad lényre megy (A* nélkül, egyenes + falcsúszás), tempója az
   `intensity` szerint ±20%; a rossz ketrecből szökött lény a riválisé.
3. **Visszalopás:** ha a rivális a játékostól ≤ 3 egységre kap el lényt, `request("trigger")` `slowMo: 0.35`,
   `mode="buttons"`; jó = a lény a játékosé.
4. **Arany lény:** 20 mp-enként egy, a kérdés `band + 0,2` sávból (a provider `fresh({ band })` paraméterével), érték ×3.
5. **Fordulók:** 90 / 60 / 60 mp, közöttük fejlesztés-választás (3 kártya, determinisztikus kínálat a forduló
   eredményéből, nem véletlen), a 3. forduló a **Tolvajkirály**: a rivális a játékos ketreceiből is lop (5 mp-enként egy
   Visszalopás-esély); győzelem: több lény a riválisnál; döntetlen: 15 mp hosszabbítás.
6. `ResultReview`, csillag; hang, rezgés.
7. Tesztek: `T/brainrot-rival.test.ts`, core (fordulók, arany), sim (J9 medián 2–5 perc a három fordulóval; kérdés
   nélküli módban vereség lehetséges a rivális miatt), spec (rivális, boss-forduló képernyőkép, J11 fps).

### Elfogadás (J5)

- [ ] J-BR teljesül; az óra a kérdés alatt jár (spec: `probe().simTime` és a hátralévő idő csökken nyitott kérdésnél).
- [ ] `T/brainrot-sim.test.ts` J2, J3, J6, J7, J9 zöld.
- [ ] Mobil mérő `-g brain-rot`, `game-win-paths` (`brain-rot-steal`), `coupon-expired-all-games.spec.ts` zöld.

### UNKNOWN

- U-J5-1: a `GE/scenes/BrainRotArena3D.tsx` pointer-events nélküli dekoráció (`:777`) — a mozgásos játékhoz elég-e a DOM-
  lény réteg teljesítménye 8 lény + 4 ketrec + rivális mellett; J11 mérés dönti el.

---

## J6 — Galaktikus Aszteroida: folyamatos lövöldözős kérdés-kristályokkal (J6a, J6b)

**Állapot (J6a):** folyamatban – 2026-11-17, ág feat/jatek-j6a-aszteroida-kristaly, munkafa .claude/worktrees/jatek-j6a, kanban #81 · **Állapot (J6b):** nem kezdődött
**Függ:** J0c merge (3. hullám). **Elfogadás:** J-SA, J1–J10, J16, M1–M12. Terv: 5.6.

### Fájlok

`P/SpaceAsteroidQuiz.tsx`, `L/spaceAsteroid/physics.ts`, `L/spaceAsteroid/aimAssist.ts`, új `L/spaceAsteroid/crystals.ts`,
`L/spaceAsteroid/sim.ts`, tesztek: `T/space-asteroid-crystals.test.ts`, `T/space-asteroid-sim.test.ts`,
`T/space-asteroid-play.spec.ts`, `T/space-asteroid-wiring-guard.test.ts` (olvasd el — lásd lent),
`T/game-mobile-cases/space-asteroid-quiz.ts`, `T/game-win-cases/space-asteroid-quiz.ts`.

### A mostani kód horgonyai

- Fázisok `P/SpaceAsteroidQuiz.tsx:179-180`; rAF `:1500-1511`; `tick` `:1541-1840` (kilépés nem-play fázisban
  `:1542-1548`); óra `:1149-1162` (`ROUND_LIMIT_SEC` `:206`); power-up időzítő `:1165-1178`.
- Kvíz: `enqueueQuiz` `:1185-1191`; kiváltók `:1258` (start), `:1803-1820` (hullám vége), `:2153-2187` (`handleHit`);
  `pickQuiz` `:1011-1082`; `onAnswer` `:1271-1331`; `dismissFeedback` `:1263-1269`; modál `:3010-3110` (`:3017`);
  Escape `:2606-2621`; kártya `:3199`.
- Ellenfelek / boss `:1626-1700, 1854-1930`; spawn `:1194-1200, 1608-1621`; pickup `:2105-2109, 2189-2230`; hamis
  toast `:2195`; pontozás `:1986-2001`.
- Befejezés `:1950-1960`; score `:2588-2600`; `recordRun` hiba `:2633-2634`; napi / pálya / legjobb `:2642-2662`;
  eredmény `:3119-3150`; teszt-API `:814-845`.

### J6a — a kapuk megszüntetése, Kristály-válasz, életalapú vég (Sonnet)

1. Állapot-sor commit.
2. `L/spaceAsteroid/crystals.ts`: `spawnCrystals(presentation, bounds, rng)` → 3–4 kristály (opció-index, lassú
   lebegés a felső harmadban, nem ütközik a játékossal), `hitCrystal(id)` → `{ correct }`; rossz kristály → 3 apró
   szikla (a meglévő `splitRock` mintára, `L/spaceAsteroid/physics.ts:168-182`).
3. `P/SpaceAsteroidQuiz.tsx`:
   - a kvíz-kiváltók megszűnnek: induló (`:1258`), hullám-vége kapu (`:1803-1820` — a hullám folyamatosan vált, 2 mp
     „HULLÁM n” felirattal), ütközés-kvíz (`:2153-2187` — az ütközés csak élet −1 és 2 mp sérthetetlenség);
   - a `"quiz"` fázis és a modál (`:3010-3110`) megszűnik; a `tick` a kérdés alatt fut (`slowMo: 0.7`);
   - `useQuestionDirector` (`optionCount: 4`, `minGapMs: 1500`, `maxGapMs: 20000`, `targetPerMin: 4`, `baseWindowMs: 5500`)
     a `tick`-ben → `spawnCrystals`; a lövedék-kristály ütközés = `director.answer`; jó = fejlesztés (az `intensity`
     szerint: alacsonynál pajzs, közepesnél hármas lövés, magasnál bomba); rossz = hasadás, a helyes kristály 1,8 mp-ig
     világít;
   - célzássegéd (`aimAssist.ts`) a kristályokra NEM vonatkozik (a választás a játékosé; U-J6-1);
   - **életalapú vég:** `ROUND_LIMIT_SEC` (`:206`) óra megszűnik, 8 hullám + boss; a HUD „mp” helyett hullám / élet;
   - a hamis „Megúsztál egy kvízt!” toast (`:2195`) → „+1 élet!”;
   - `recordRun` (`:2633-2634`): `correctAnswers` / `wrongAnswers` a director statisztikából;
   - teszt-API: `forceState({ question: true })`, probe K.2.
4. `T/space-asteroid-wiring-guard.test.ts`: olvasd el; ha a „kvíz-kapu” bekötését rögzíti (pl. `enqueueQuiz` hívás a
   hullám végén), SPEC-VÁLTOZÁS jelöléssel a „kristály-kérdés bekötve: `director.tick` a `tick`-ben és
   `director.answer` a kristály-ütközésben” esetre cserélendő; a nem kvíz-esetek változatlanok.
5. Tesztek: crystals (spawn, ütközés, hasadás), sim (J2 ≥ 4, J3 ≤ 20 mp, kérdés nélküli módban vereség), spec.

### J6b — Gyenge pont a bossnál, Mentő-pajzs, Ufó-anyahajó miniboss (Opus)

1. Állapot-sor commit.
2. Boss (`:1854-1884`): 3–4 feliratozott gyenge pont (`request("boss")`), helyes találat ×5 sebzés, rossz visszaverődő
   lövés; a 3 fázis megmarad (Q11).
3. Ufó-anyahajó a 4. hullám után (két gyenge pont-kérdés).
4. **Mentő-pajzs:** az utolsó élet elvesztésekor egyszer menetenként `request("rescue")`, `mode="buttons"`, `slowMo: 0.35`.
5. `ResultReview`, csillag; hang (`sfxBossHit` stb.).
6. Tesztek: core / sim (J9 medián 3–5 perc), spec (boss képernyőkép, J11 fps).

### Elfogadás (J6)

- [ ] J-SA teljesül; `grep -n "enqueueQuiz\|ROUND_LIMIT_SEC" P/SpaceAsteroidQuiz.tsx` → 0 találat (vagy csak törölt).
- [ ] `T/space-asteroid-sim.test.ts` J2, J3, J6, J7, J9 zöld; `recordRun` valós számokkal (egységteszt a statisztikára).
- [ ] A meglévő `space-asteroid-*.test.ts` (aim-assist, physics, visible-bounds, quiz-slot) zöld.

### UNKNOWN

- U-J6-1: a célzássegéd (`aimAssist.ts`) kizárható-e célpont-típusonként — felderítés: `sed -n 1,80p L/spaceAsteroid/aimAssist.ts`.
- U-J6-2: a `space-asteroid-quiz-slot.test.ts` a `pickQuiz` slot-logikáját nézi — a provider `fresh()` ugyanazt a
  logikát hívja, így várhatóan zöld; felderítés: olvasd el.

---

#### Megvalósult eltérések (J6a — Kristály-válasz, kapuk nélkül; kanban #81; J6b ezekre épül)

- **Meghajtó:** a lap és a szimuláció közös `createAsteroidDriver` (`L/spaceAsteroid/sim.ts`): fix 1/60 s-os `createFixedLoop`,
  a nyitott kérdés alatti `slowMo: 0.7` időskála, `createFeel` (hitstop, rázás: a lap a kamerát a `feel.shakeOffset`-ből mozgatja),
  mini-Director (`pace`: sérülés → `damage`, közeli veszély → `nearThreat`, rossz válasz → `wrong`) és a kérdés-sáv képkockája
  (`q.frame(clock, { calm })` → a director `tick`-je). A világ egy lépése az `opts.step`: a lapon a `tick(1/60)`, a szimulációban
  az `createAsteroidWorld`. **A szimuláció a SZABÁLYOK modellje, nem a 3D lap másolata** (hullám-képlet, hasadás, életek, 2 mp
  sérthetetlenség, boss 90 HP / 3 fázis, kristály-következmények, a FELVEHETŐ ELEMEK — élet / pajzs / erő / bomba — és az évfolyam-
  sáv szerinti könnyítés közös kóddal (`physics.ts`); a lövedék-fizikát és a célzást egy ügyességi dobás helyettesíti, kalibrált
  küszöbökkel — a valós ügyesség nem mérhető, UNVERIFIED). Review #486 óta: a sim ugyanazt a pickup-táblát (`dropChance`,
  `pickDropKind`, `applyPickupEffect`) és ugyanazt a „csak a hajót érő ellenfél ütközik” szabályt használja, mint a lap. A lapon mért kérdés/perc és szimuláció-arány:
  `T/space-asteroid-play.spec.ts`.
- **A kristály ÁLLÓ célpont** (`CRYSTAL_DRIFT_X / Y = 0`; a modul a nem nulla lebegést is kezeli): ujjal így könnyebb eltalálni /
  megérinteni, a kristályok soha nem fedik egymást, és a mobil mérők (M2, joystick-mérő) stabil dobozt várnak. A „lassú lebegés” a
  nézeté: a 3D kristály billeg, a gomb fénye lüktet (csökkentett mozgásnál nem).
- **A kristály-zóna a kérdés-kártya ALATT van, nem „a felső harmadban”:** keskeny telefonon (360×640) a HUD + kártya a vászon
  felső harmadát elfoglalja. A zóna a kártya BECSÜLT aljától indul (tiszta becslő: `promptLayout` / `estimateLines`, a képernyő és a
  prompt a MAG bemenete — KSZ-1), legalább 72 px magas; hosszú kérdésnél lejjebb csúszik. A zónát a kérdés megjelenésekor EGYSZER
  számoljuk (review #486: a rajzoló kód nem ír vissza a mag állapotába, nincs képkockánkénti DOM-mérés / újrazónázás); a kristályok a
  JÁTÉKTÉR (±9 egység) fölött maradnak.
- **Élesítési idő és szándékos célzás (review #486 M2, K.3 / KSZ-11):** a kristály a megjelenése után `CRYSTAL_ARM_MS` = 500 ms-ig
  „élesedik” (látható előjelzés, `data-armed="false"`), ez alatt a lövedék nem választ (a koppintás / 1–4 billentyű szándékos, célzott művelet, azonnal válaszol — a közös mérő M10 is így kattint); és csak olyan lövedék választ,
  amelynek tűz-megnyomása a kristály megjelenése + élesítés UTÁN történt (`bulletCountsAsAnswer`): a tartott tűz és a kérdés előtt
  kilőtt lövedék soha nem „válaszol” — a gyerek olvasás nélkül, véletlenül nem lő rossz választ. (Tulajdonosi döntésre: a tűz-
  felengedés + újranyomás szabály alapértelmezett; ha túl szigorú, a J6b előtt lazítható.)
- **Két út ugyanahhoz a válaszhoz:** a 3D kristályt a lövedék találja el (`crystalAt`, találati gömb +20%), a hozzá tartozó DOM-gomb
  (≥ 48 px, `pointerTapHandlers`: pointer-alapú, több ujjnál is) érintéssel / billentyűvel (1–4) is választ. Mindkettő `q.pick`; a
  választ a director idempotensen egyszer fogadja. A célzássegéd csak az ellenfeleket kapja (**U-J6-1: igen, kizárható — és ki is
  van zárva**). A felirat ≤ 22 karakter (`crystalLabelsFit`): a hosszabb opciójú tétel hátrébb sorolódik (`promptFits`, az
  évfolyam-bank választóban „látottnak” véve); ha mégis ilyen jön (tananyag, kupon-mód; a banki tételek ~5,7%-a, a leghosszabb
  válasz 38 karakter — mérve a `T/space-asteroid-rules.test.ts`-ben), a kristályokon a SORSZÁM áll, a válaszok TELJES szövege a
  vászonra nyíló „Válaszok” listán (`sa-answers`, törés, nincs vágás, a legrosszabb tétel becsült magassága a vászon 72%-án belül,
  fölötte görgethető) olvasható; a lista a kérdéssel együtt MAGÁTÓL megnyílik (orkesztrátori döntés, review #486 Ú5 — így nem lehet olvasás nélkül kilőni egy számozott kristályt), nyitva tartása alatt a világ és a kérdés-óra áll; a gyerek zárja be, és csak utána indul az élesítés (a „Válaszok” gomb újranyitja, a zárás újra indítja az élesítést), az 1–4 billentyű és a lista
  gombjai válaszolnak, a „Vissza a pályához” gomb bezárja, a „Válaszok” gomb újranyitja — NINCS csonkolás (review #486 K2;
  a „2 sorra vág” engedmény megszűnt).
- **U-J6-2:** a `space-asteroid-quiz-slot.test.ts` változatlanul zöld; forrás-őre a `pickGradeSlotWithVocab({ pick: () => pickGradeQuiz({
  grade: sharedGrade …` és a `vocab?.next(` / `markGradeQuizSeen(seen, vq)` mintát rögzíti — a provider `fresh()` ezt a szöveget
  őrzi (a tananyag-ág, a `material()`, a szóbank-hívás előtt áll: a `vocab-game-wiring` sorrend-őre is zöld).
- **Hullámok:** 8 hullám + a 9. hullámban a főellenfél (`BOSS_WAVE`); a hullám-képlet (`waveEnemyCount`, `waveSpawnInterval`,
  `pickEnemyKind`, `pickRockSize`, `enemyHp`, `waveBaseVy`) a `physics.ts`-ben, a lap és a sim közös. Az ellenfelek érkezési
  magassága a látható sáv teteje fölött (`SPAWN_Y_MIN / MAX` = 8,6–10,2; a kamera a játéksíkból +8,15-ig lát): a korábbi 12,6–14,2
  magasságról a szikla 4–5 mp-ig a kép fölött utazott, így „az első sziklák 1 mp-nél” nem teljesült volna.
- **Tanító szakasz (K.4/25):** a menet első 30 mp-ében (`TUTORIAL_SEC`) az ütközés nem von le életet (a kép / hang / rázás megvan, 2 mp
  sérthetetlenség), az első 8 mp-ben egy soros súgó (`sa-hint`: „Bal ujj: mozgás · jobb ujj: tűz”); a találat színe narancs
  (K.4/20: nincs telített piros villanás). A szimuláció ugyanezt a szabályt modellezi.
- **Győzelem véglegessége (review #486 M1):** a főellenfél halálának pillanatában a menet eldőlt: utána az ütközés / lövedék nem sebez
  (`lifeLossOutcome`, a lap és a szimuláció közös szabálya), az eredmény nem írható felül (`endRun(false)` a győzelmet megtartja);
  e2e: `forceState({ bossFinale: true })` — egy élet, elesett főellenfél, a hajón repülő ellenséges lövedék → „Legyőzted a főellenfelet!”.
- **Interpolált rajz (K.4/9, KSZ-4):** a fix lépés előző és mostani helyzete között a rajz az `alpha`-val interpolál (`interpolate`).
- **A pálya sűrűségét a JÁTÉK-intenzitás hajtja (review #486 Ú1 / V1, terv 4.1/6, KSZ-16):** `waveSpawnInterval(wave, intensity)` =
  hullám-képlet × `SPAWN_BASE_SCALE` (1,2) × (1 + `intensity` × `SPAWN_RELIEF_MAX`); a `pace.intensity()` (sérülés +0,25, közeli
  veszély +0,05/s, rossz válasz +0,1) a lemaradás-könnyítést legfeljebb **+10%-ra** korlátozza (KSZ-16: legfeljebb ±10%). A KÉRDÉS-sáv
  (a jó / rossz válasz sávja) a pálya sűrűségét NEM hajtja, csak a kérdések nehézségét / ablakát. Pontosan: a rossz válasz is ad
  +0,1 intenzitást, ez legfeljebb **+1%** átmeneti ritkítás az érkezésben (a 3 apró szikla jóval nagyobb, ellenkező hatású); a jó
  válasz nem ritkít. Így a jó válasz mindig előny. A kicsiknek (3–4. évfolyam) a könnyítés az évfolyam-szabályból jön (`gradeEase`: 1,3×
  ritkább érkezés, 0,85× sebesség), nem a plafon emeléséből. Sim-teszt: 2 évfolyamsáv (3–4., „5. évfolyamtól” — a világ az 5. évfolyamtól
  nem függ az évfolyamtól, csak a kérdésbank, ezért ez EGY számítás) × 20 / 45 / 75 / 95%: a győzelem a pontossággal nem csökken
  (−1/20 tűréssel), és kérdéssel nem kevesebb, mint kérdés nélkül.
- **A szimuláció bot-kalibrációja (UNVERIFIED a valós gyerek-ügyességre; a győzelmi számok a korábbi PR-táblákkal NEM összehasonlíthatók,
  mert a modell azóta változott: közös szabálymag, felvehető elemek, oldalirányú átfedés, intenzitás-hajtotta sűrűség):**
  `DODGE_IMPACT` = 0,40 (a hajó oszlopába érő ellenfél kikerülésének küszöbe: ügyességi dobás < küszöb → kitérés; a lap
  ütközés-vizsgálatát helyettesíti), `DODGE_FIGHTER` = 0,95 és `DODGE_BOSS` = 0,8 (a vadászgép / főellenfél lövésének kikerülése; a
  lövés előjelzett, de a bot reakciója véges), `LATERAL_OVERLAP` = 0,6 (ekkora eséllyel ér az ellenfél a hajó oszlopába; kis szikla:
  `0,55 + 0,15 × méret` szorzóval kisebb eséllyel, a hitbox kisebb), `PICKUP_CATCH_EASE` = 0,85 (a hulló elemet ekkora ügyességi
  küszöbbel éri el). Az értékeket úgy választottuk, hogy a tervezett viselkedés-tulajdonságok teljesüljenek: az erős modell végigviszi,
  a gyenge kérdés nélkül nem, a kérdés segít (az `Ú1` teszt), a menet ~3 perc — nem a valós ügyességből mérve. Javasolt horgony (jegyre
  kerül): a lapon szkriptelt játékos ütközés / perc mérése, amelyhez a `DODGE_*` és a `LATERAL_OVERLAP` illeszthető.
- **Teszt-elvárások és bot-konstansok átvilágítása (teszt-integritás, 2026-11-17):**
  - `T/space-asteroid-crystals.test.ts:89` („a kristály nem ér a hajó legfelső helyére”): eredeti elvárás `hit-alj > PLAYER_Y_MAX + 1,5`
    (a 40ac73b4 commitban, a kristály-zóna merev „hajó fölötti padló + rés” tervével); a 9f0d08c5 commit `− 0,3`-ra lazította, amikor a zónát a
    kérdés-kártya alá csúsztattuk (hosszú kérdésnél a zóna a hajó felső sávjába nyúlhat). A lazítás a TESZT bemenetén (normál zóna) NEM volt
    szükséges: a `+1,5` a mai kóddal is teljesül — **mérce-igazítás volt, nem spec-változás, ezért visszaállítva `+1,5`-re** (a szűk zóna esetét
    a „felső perembe kapaszkodó minimum-magasság” teszt külön őrzi).
  - Bot-konstansok (`sim.ts`: `DODGE_IMPACT` 1,2 → 0,40, `DODGE_FIGHTER` 1,2 → 0,95, `DODGE_BOSS` 1,1 → 0,8, `PICKUP_CATCH_EASE` 0,95 → 0,85): a
    6a3c42df-i modell minden nem lelőtt ellenfelet ütköztetett és nem ismert felvehető elemet; a #486 M3 után a sim a lap szabályait
    (felvehető elemek, oldalirányú átfedés) használja, ezért a küszöbök újrahangolása a MODELLVÁLTÁS következménye, nem a bukás elkerülése.
    Mérés (20 seed, 900 mp, ugyanazon a mai játékkódon, győzelem kérdéssel / nélkül):

    | konstansok | AVG | STRONG | WEAK | YOUNG (3. évf.) |
    |---|---|---|---|---|
    | régi: 1,2 / 1,2 / 1,1 / 0,95 | 20 / 20 | 20 / 20 | 11 / 3 | 19 / 18 |
    | b526c8cd: 0,65 / 1,1 / 0,85 / 0,95 | 20 / 19 | 20 / 20 | 4 / 0 | 17 / 14 |
    | mai: 0,40 / 0,95 / 0,8 / 0,85 | 18 / 13 | 20 / 19 | 3 / 0 | 14 / 5 |

    Az új küszöbök a botot NEHEZEBBEN játszatják (kevesebb győzelem) — az elfogadási pontok NEM könnyebben teljesülnek: a régi értékekkel a „kérdés
    nélkül is el lehet veszíteni” (gyenge: 3/20 nyer) és az „átlagos játékos olykor veszít” (20/20) elbukna, vagyis a régi értékek a mai modellben
    LAZÁBBAK voltak. A kalibráció a gyerek modellezése, nem a teszt kiszolgálása.
- **Tartott tűz jelzése:** ha a lövedék átmegy a kristályon (nem élesített / régi nyomás), „Engedd el a tűzgombot, és lőj újra a válaszhoz!”
  jelenik meg 3,5 mp-re, amíg a gyerek lövéssel egyszer még nem válaszolt (`sa-hold-hint`).
- **Átméretezés nyitott kérdésnél:** a mag új aréna-méretből újraszámolja a kristályok helyét (`rezoneCrystals`), az élesítés újraindul.
- **Évfolyam-sáv (review #486 M3):** 3–4. évfolyamon a világ könnyebb (`gradeEase`: ritkább érkezés, lassabb ellenfél), hogy a tudás
  segítsen és egy harmadikos-negyedikes végigvigye; a szimuláció győzelmi arány-állításai: `SIM_YOUNG` ≥ 12/20 kérdéssel, és minden
  modellre kérdéssel nem több a vereség, mint nélküle.
- **HUD:** a képkocka-hurok ref-eket ír, a React ≤ 10 Hz-es pillanatképet kap (`publishHud`, KSZ-9); idő helyett hullám / élet, a
  sáv a menet előrehaladása. A pajzs- és erő-időzítő a tick-ben, játékidőben fogy (a `setInterval` kör-óra megszűnt).
- **Kanban #69 (havi audit):** a menüben (osztályválasztó / kezdőképernyő) a `render` azonnal kilép — a jelenet nem rajzol. A
  `requestGameFrame` (#477, lejárt kupon) a hurokban változatlanul megvan.
- **K.4/7:** `createGameRenderer`, `webglcontextlost` → szünet + „Grafika újraindítása” (új vászon + új renderer, a futó ellenfelek
  meshe a rajzoláskor újraépül); a shader-előmelegítés (`renderer.compile`) a menü alatt fut.
- **Spec-változás (terv 9.), a K.1/11 listán túl:** a `T/space-asteroid-mobile.test.ts` 4 esete a „quiz” fázis / kör-óra / saját
  `shakeRef` megszűnése miatt (SPEC-VÁLTOZÁS 2026-11-17 jelöléssel, a szigor megtartásával), mellette a K.1/11 három esete
  (`remaining-learning.spec.ts`, `learning-flow.browser.ts`, `coupon-lesson.browser.ts`) és a wiring-guard új esetei. A `wave_10` jelvény
  („érj el a 10. hullámig”) átnevezése / küszöbe orkesztrátor-kérés (`L/achievements.ts` közös fájl).
- **J6b-nek:** a főellenfél a pálya tetején áll (`targetY` = 8,5 ≈ a látható sáv teteje: a teste fele a kép fölött) — a gyenge
  pontoknak lejjebb kell kerülniük; a `feel` és a `pace` a `driverRef.current`-ből érhető el; az új kérdés-fajták a
  `q.request("boss" | "rescue", clock)`-on át jönnek, a kristály-réteg (`crystalsRef`, `onCrystalOutcome`) a rendes kérdésé.
- **Nem teljesült (NOT DONE, jelölve a PR K.4 kitöltésében):** K.4/4–5 (a sziklák / lövedékek poolból, `InstancedMesh`: a lap a
  régi építés-spawnonként modellt őrzi), K.4/8 (a 4×-es CPU-lassításon 6–16 db 50–125 ms-os hosszú feladat 40 mp alatt: a React-újrarajzolás
  és az elemépítés), K.4/9 teljesült (interpoláció).

## Joystick-reakció (hibajavítás, kanban #49)

**Állapot:** kész — #456 (9038fce2, 2026-11-16), kanban #49; a valódi telefonos próba (a tulajdonosé) még hátravan — UNVERIFIED

**Tünet (tulajdonos, valódi telefon, 2026-11-16):** „Mindegyik játékban a telefonon lévő ujjas joystick nagyon lassan
reagál, és nem lehet finoman vezérelni vele se az autót, se a viharvadász játékot.” Érintett: a négy tárcsás játék
(Tornado, Kockavadász, Aszteroida, Szökőár).

**A vizsgálat terve (előbb gyökérok, méréssel):** a teljes lánc ujjtól a képernyőig, szakaszonként mért számmal:
(1) pointer-esemény → tárcsa-érték (React-render eseményenként, holtjáték mérete / alakja, a kitérés → érték görbe,
a sugár kis telefonon, lebegő közép, az érték útja a hurokig); (2) tárcsa-érték → játék (mintavétel képkockánként,
bemenet-simítás, kormány-szögsebesség, tehetetlenség, kamera-késés); (3) képkocka-idő (dt-alapú-e). Mérés Playwright
mobil-emulációval, CDP érintés-eseményekkel, 1× / 4× / 6× CPU-lassítással: bemenet–válasz késés, lépcsőválasz 63% / 90%,
állandósult válasz 5–100% kitérésnél, render-szám a lapon.

**Érintett fájlok:** `GE/joystick.ts`, `GE/VirtualJoystick.tsx`, `L/tornado/controls.ts` (és ha a mérés oda mutat:
`L/tornado/drive.ts`, `L/spaceAsteroid/physics.ts`), a négy lap tárcsa-bekötése (kis, célzott diff), a mérő-spec
és egységtesztek.

**Elfogadás:** bemenet–válasz késés 60 fps-en ≤ 3 képkocka, lassított CPU-n a képkocka-idővel arányos; lépcsőválasz
90%-a a kormány-bemenetre ≤ ~120 ms; folytonos görbe, a legkisebb stabil korrekció ≤ a maximum 10%-a; a tárcsa
húzása nem renderel újra a lapon; a korábbi javítások (`retireJoystickDrag`, több ujj, `touch-action`) és M1–M12 zöld.

**Gyökérok (mérve, `T/joystick-response.spec.ts`, Pixel 7 emuláció, CDP-érintés, 1× / 4× / 6× CPU):**
1. **Egymásra rakott holtsávok — a fő ok, mind a négy játékban.** A tárcsa saját 0,15-ös holtsávja (`GE/joystick.ts`
   `JOYSTICK_DEAD_ZONE`) UTÁN a játékok még egy küszöböt tettek rá: a Kockavadász, az Aszteroida és a Szökőár a
   `joystickToDirections` 0,35-ös küszöbét (négy logikai irány) — mérve a sugár 40%-áig semmi, 55%-nál már 86–100%; a
   Tornado kormánya 0,2-es tengely-holtsávot + négyzetes görbét (`L/tornado/controls.ts`) — a sugár 30%-áig 0, 40%-nál 5%,
   55%-nál 20%. Ez a „nagyon lassan reagál” (az ujj ~25–30 px-et megy, mire bármi történik) és a „nem lehet finoman”
   (utána digitális teljes sebesség).
2. **Aszteroida: állandó gyorsulás** (`L/spaceAsteroid/physics.ts` 28 egység/s², a fél kitérés is végsebességre
   gyorsított): a mozgás 63/90%-a 185/244 ms, 4× CPU-n 266/306 ms.
3. **A tárcsa gombja React-állapot** (`setKnob` minden `pointermove`-ra): 30 mozgásra 33–50 tárcsa-render, a gomb egy
   képkockával a játék bemenete UTÁN látszott (bemenet 2,6–3,1 kk, gomb 3,5–3,7 kk).
4. **Szökőár:** `playerXRef.current = playerX` minden renderben a 24 Hz-es állapot-pillanatképet írta vissza a hurok
   pozíciójára (≤ 42 ms mozgást vont vissza), a figura 24 Hz-cel lépett.
A bemenet → hurok késés NEM volt ok: a böngésző az érintést a képkockához igazítva kézbesíti (esemény → kezelő ~44 ms
emulációban), a játékok a kezelőtől számítva ≤ 1 képkockán belül olvassák (ref, képkockánként, simítás nélkül); a
Tornado kamerája merev, nem késik; minden mozgás dt-alapú.

**Javítás:** `GE/joystick.ts` `joystickCurve` / `shapeJoystick` (egy holtsáv, utána folytonos `(1−e)·t + e·t³` görbe,
e = 0,4); a három irány-játék analóg tárcsa-értéket olvas ref-ből; a Tornado kormánya második holtsáv nélkül
(`joystickCurve`, e = 0,85) + lassú sebességnél határozottabb kanyar (`lowSpeedTurnBoost`, végsebességen változatlan);
az Aszteroida célsebesség-követő (τ = 0,05 s); a `VirtualJoystick` gombja DOM-transzformációval, React-render nélkül,
`lostpointercapture` + `pointerId`-szűrés; a Szökőár figurája képkockánként a DOM-on át mozog. Spec-változás:
`T/tornado-touch-drive.test.ts` nyílt hurkú (korrekció nélküli) küszöbe — lásd a teszt `SPEC-VÁLTOZÁS` megjegyzését.

A mért előtte / utána tábla a PR-leírásban.

---

## J7 — Tornado Hunter 200: üldözés kérdés-útjelzőkkel (J7a, J7b, J7c)

**Állapot (J7a):** folyamatban – 2026-11-17, ág feat/jatek-j7a-tornado-javitasok, munkafa .claude/worktrees/jatek-j7a, kanban #82 · **Állapot (J7b):** nem kezdődött · **Állapot (J7c):** nem kezdődött
**Függ:** J0c merge (4. hullám). **Elfogadás:** J-TH, J1–J10, J12, J16, M1–M12. Terv: 5.7.

### Fájlok

`P/TornadoHunter200.tsx`, `L/tornado/{questions,scoring,levels,upgrades,vehicles,drive,wind,world}.ts`, új
`L/tornado/junctions.ts`, `L/tornado/stormPath.ts`, `L/tornado/sim.ts`, tesztek: `T/tornado-junctions.test.ts`,
`T/tornado-storm-path.test.ts`, `T/tornado-sim.test.ts`, `T/tornado-play.spec.ts`,
`T/game-mobile-cases/tornado-hunter-200.ts`, `T/game-win-cases/tornado-hunter-200.ts`. A 29 meglévő `T/tornado-*`
teszt zöld marad; ami a roam-kvízt vagy a horgony-kvízt rögzíti, azt olvasd el a módosítás előtt (U-J7-1).

### A mostani kód horgonyai

- Képernyők / fázisok `P/TornadoHunter200.tsx:207-208`; szünet `:1191`; rAF `:1544-1551`; `stepRef` `:1949-2173`
  (szimuláció csak `seeking`/`approach`-ban `:1977, 1985`); HUD 10 Hz `:2160`.
- Kérdés: `raiseQuiz` `:1335-1369`; roam-trigger `:2077-2088`; horgony `:1680-1700` (a hiba `:1694-1699`); `answerQuiz`
  `:1845-1904`; `resolveAnchor` `:1808-1842`; overlay `:2306-2349`; ütemezés `L/tornado/questions.ts:101-150`; választás
  `:470-553`; `MATH_4` `:356-366`.
- Tornádó-pálya `:2047-2050`; fejlesztések hatása `:2018-2019` vs. garázs `:690-694`; pont `L/tornado/scoring.ts:126-177`
  (bontás `:157-169`, horgony `:46-87`).
- Befejezés `finishRun` `:1704-1792` (`runStreak` hiba `:1766`); eredmény `:2399-2436`; teszt-API `:279-295, 1584-1612`.

### J7a — javítások (Sonnet)

1. Állapot-sor commit.
2. Horgony csak a sávban (`:1694-1699`): a ⚓ gomb a sávon kívül letiltott (vizuálisan is), kérdés csak a sávban.
3. Fejlesztések hatása (`:2018-2019`): `tires` → tapadás (kanyar-csúszás), `chassis` → ütközési sebzés-tűrés,
   `anchor` → horgony-készenléti idő, `instruments` → a mérési sáv szélessége, `stability` → szélsodrás-tűrés; a
   garázs statsávjai (`:690-694`) ugyanazokat a számokat mutatják (közös függvény az `upgrades.ts`-ben).
4. Pont-bontás (`L/tornado/scoring.ts:157-169`) az eredményképernyőn (`ResultScreen` `extra`).
5. `MATH_4` (`L/tornado/questions.ts:356-366`): az angol tételek az angol bankba, a `MATH_4` matek tételekkel (a meglévő
   matek-bankokból vagy a `pickGradeQuiz` matek ágából); teszt: `T/tornado-*.test.ts` új esete — „csak matek” módban
   nincs angol tétel.
6. `runStreak` (`:1766`): a menet legjobb sorozata.
7. Tesztek: egységtesztek a fenti 5 pontra (`T/tornado-upgrades-effect.test.ts`, `T/tornado-math4.test.ts`).
   *Megvalósítási megjegyzés (2026-11-17, #482):* a horgony-fejlesztés (3. pont) a készenléti időt adja, ezért a `T/tornado-mobile-shell.test.ts` szó szerinti `2600` elvárása `effRef.current.anchorHoldMs`-ra cserélődött (`// SPEC-VÁLTOZÁS`, az alap `ANCHOR_HOLD_BASE_MS` = 2600 ms külön tesztelt; a játékóra és a friss `finishRun` szigora megmaradt) — ez a J7 elfogadási sorának „roam-kvíz megszűnése” indokán kívüli, a terv 5.7 „Javítás” pontjából következő csere.

### J7b — útelágazás (Q1), turbó-töltés (Q3), a roam-kvíz megszűnése (Opus)

1. Állapot-sor commit.
2. `L/tornado/junctions.ts`: seedelt elágazás-pontok az úthálózaton (`L/tornado/world.ts` chunkjai, U-J7-2) 15–20 mp
   menetidőnként; 3 út, a helyes rövidebb (a célirány felé), a két rossz kerülő (+8–12 mp); táblák a válaszokkal
   (3D sík, olvasható méretben fekvő nézetben).
3. `P/TornadoHunter200.tsx`: a roam-kvíz (`:2077-2088`, `questions.ts:101-150`) és a megállító overlay (`:2306-2349`)
   megszűnik; `useQuestionDirector` (`optionCount: 3`, `minGapMs: 1500`, `maxGapMs: 20000`, `targetPerMin: 4`,
   `baseWindowMs: 5500`, `slowMo: 1`); az elágazás elérése (melyik útra hajtott) = `director.answer`; a kérdés-sáv
   (`InlineQuestion mode="bar"`, `skin="storm"`) fekvő nézetben a képernyő tetején, a vezetés nem áll.
4. Turbópad: 25–30 mp-enként a padon szó / feladat (`request("trigger")`, `mode="buttons"` a jobb oldali hüvelykujj-
   zónában, 2 oszlop), jó = nitró 3 mp.
5. Tesztek: `T/tornado-junctions.test.ts` (elágazás-ütemezés, a helyes út rövidebb, 3 opció visszaképezhető), sim
   (J2 ≥ 4/perc, J3 ≤ 20 mp).

### J7c — zaj-alapú tornádópálya, Műszer-kalibrálás (Q2), szupercella (Opus)

1. Állapot-sor commit.
2. `L/tornado/stormPath.ts`: seedelt simított zaj (pl. két szinusz-összeg + véletlen fázis — külső zaj-könyvtár nélkül)
   a fix kör (`:2047-2050`) helyett; nehezebb szinteken kettéválás (két tölcsér, a mérés bármelyiknél érvényes).
3. **Műszer-kalibrálás:** horgony után 3 gyors inline kérdés (`request("trigger")` × 3, `mode="buttons"`), közben a
   sávban kell maradni (a jármű lassan sodródik, kormányozni kell); adatminőség = jó válaszok / 3; a meglévő
   `anchorOutcome` (`scoring.ts:46-87`) az adatminőséggel súlyoz.
4. **Szupercella** (szintenként a végső szakasz): a mérési sáv szűkül, a szél erősödik (két fázis, Q11).
5. `ResultReview`, csillag; hang.
6. Tesztek: `T/tornado-storm-path.test.ts` (determinizmus, a pálya a pályaterületen belül), sim (J9 medián 2–5 perc;
   kérdés nélküli módban vereség), spec (fekvő nézet, elágazás és kalibrálás képernyőkép, J11 fps).

#### #84 — a `material-quizzes` tétel valódi tantárgya (a J7b-hez csatolt kiegészítés, külön PR)

**Állapot (#84):** folyamatban – 2026-11-17, ág fix/material-quizzes-subject, munkafa .claude/worktrees/jatek-j7b-84, kanban #84
(a J7b — `feat/jatek-j7b-tornado-utelagazas` — erre épül; a méret miatt külön, első PR).

1. **Tünet:** a végpont csak `topic`-ot ad, ami a régi Stúdió-exportoknál a lecke CÍME — a J7a óta a Tornado „csak matek” /
   „csak angol” módja konzervatív, így a címmel exportált valódi matek / angol leckék csak vegyes módban jönnek; a
   cím-heurisztikának két maradék hamis pozitívja van (üres téma + „Hund magyarul:” → biztos angol; „matek: angol
   számnevek” → biztos matek).
2. **Szerver (`S/gameQuizBankService.ts`, `S/routes.ts`):** a `material-quizzes` tétel opcionális `subject` mezőt kap
   (`quizTopic`-alak): kanonikus tételnél a lecke tantárgya (= a tétel `topic`-ja, `canonical-quiz-bank.ts`); régi
   exportnál a lecke (a `lessonId`-n vagy az anyagán át, a legfrissebb verzió) tudástérképének tantárgya, egyetlen,
   `json` nélküli lekérdezéssel; a generátor `english` / `math` / `nature` / `hungarian` témájú régi sorainál a téma;
   egyébként a mező HIÁNYZIK. A `quiz-bank` végpont (gyorsítótár, lenyomat, bájtazonosság) nem változik; a régi kliensek
   és a többi játék (Aszteroida) a mezőt figyelmen kívül hagyja.
3. **Kliens (`L/tornado/questions.ts` `materialSubject`):** a `subject` dönt (angol / matek biztos, más tantárgy
   bizonytalan); tantárgy nélkül a cím-heurisztika marad, a két hamis pozitív nélkül.
4. **Tesztek:** DB-integrációs (`T/quiz-bank-scale-db.integration.ts`: a tétel a lecke tantárgyát kapja — anyagon át,
   `lessonId`-n át, kanonikusan, generátor-témából; tantárgy nélküli régi sor → a mező hiányzik, a route JSON-jában is);
   kliens (`T/tornado-material-subject.test.ts`: a J7a 22 cím-témája és 15 téma / kérdés esete a `subject`-tel; a két
   hamis pozitív `T/tornado-math4.test.ts`-ben SPEC-VÁLTOZÁS jelöléssel, szigorúbb elvárással).

### Elfogadás (J7)

- [ ] J-TH teljesül; a vezetés a kérdés alatt nem áll (spec: `probe().simTime` és a jármű pozíciója változik nyitott kérdésnél).
- [ ] `T/tornado-sim.test.ts` J2, J3, J6, J7, J9 zöld; a 29 meglévő `tornado-*` teszt zöld (SPEC-VÁLTOZÁS csak a terv 9.
  szakaszával összhangban, a roam-kvíz megszűnése miatt — minden ilyen eset a PR-leírásban felsorolva).
- [ ] `tornado-hunter-render.spec.ts`, mobil mérő `-g tornado` (fekvő), `game-win-paths` zöld.

### UNKNOWN

- U-J7-1: mely `tornado-*` tesztek rögzítik a roam / horgony kvízt — felderítés: `grep -ln "raiseQuiz\|roam\|tornado-quiz" T/tornado-*`.
- U-J7-2: az úthálózat elágazási pontjainak elérhetősége a `world.ts`-ben — felderítés: `grep -n "export" L/tornado/world.ts`; ha nincs út-gráf, az elágazás „virtuális kapu”: három jelölt folyosó a nyílt terepen, a választás az áthajtás irányából.

---

## J8 — Meta-fejlődés és játéklista

**Állapot:** nem kezdődött
**Függ:** J1–J7 legalább a/b al-szeletei (a gyűjtemény-elemek és csillagok forrása). **Modell:** Sonnet.
**Elfogadás:** J17, J18, J13 (jutalom), J16. Terv: 4.2, 7.

### Fájlok

Új: `GE/play/meta.ts`, `GE/play/PlayerLevelBadge.tsx`, `T/game-meta.test.ts`, `T/games-lobby-meta.spec.ts`.
Módosítandó: `P/Games.tsx`, `GE/mobile/ResultScreen.tsx` NEM (a szint és a feloldás a játéklapok `extra` slotjában),
a hét játéklap egy-egy sora (feloldás-rögzítés a menet végén — a J1–J7 által már bekötött `ResultScreen` `extra`
mellé), `L/audioEngine.ts` (`sfxUnlock`), `source/client/src/index.css` (kártya-kiegészítés, `@layer components`).

### Szerződés

```ts
// GE/play/meta.ts
export const META_KEY = "websuli.meta.v1";
export type MetaState = {
  v: 1;
  cosmetics: Partial<Record<PlayGameId, string[]>>;
  equipped: Partial<Record<PlayGameId, string>>;
  collection: Partial<Record<PlayGameId, string[]>>;
};
/** Játékos-szint az összes XP-ből (L/achievements.ts LifetimeStats.totalXp): level n-hez szükséges XP = 100 × n × (n + 1) / 2. */
export function playerLevel(totalXp: number): { level: number; intoLevel: number; forNext: number };
export type UnlockRule = { id: string; gameId: PlayGameId; kind: "cosmetic" | "collection" | "world"; when: (run: RunStatsSnapshot & { won: boolean; bossDefeated: boolean; stars: 1 | 2 | 3 }) => boolean; title: string };
export const UNLOCK_RULES: readonly UnlockRule[]; // játékonként ≥ 4 szabály, mind determinisztikus feltétel
export function applyRun(state: MetaState, gameId: PlayGameId, run: Parameters<UnlockRule["when"]>[0]): { state: MetaState; unlocked: UnlockRule[] };
export function loadMeta(storage: StorageLike | null): MetaState;  // hiba / ismeretlen v → üres
export function saveMeta(storage: StorageLike | null, s: MetaState): void;
```

### Lépések

1. Állapot-sor commit.
2. `meta.ts` + tesztek (szint-görbe: 0 XP → 1. szint; 100 → 2.; 300 → 3.; feloldás determinisztikus; `Math.random`
   nincs — a `T/game-ethics-guard.test.ts` a `GE/play/` alatt ezt már őrzi).
3. `UNLOCK_RULES` játékonként (pl. Szökőár: „Első Nagy Hullám legyőzve” → kozmetika „szörfdeszka”; Kockavadász: „Kő-gólem”
   → gyűjtemény; Brain Rot: minden lény-típus elkapva → gyűjtemény-elem), a szövegek magyarul, fenyegetés nélkül.
4. A játéklapok menet-végén `applyRun` (egy hívás a `ResultScreen` megnyitásakor), az új feloldás az `extra`-ban
   („Új: …”, `sfxUnlock`).
5. `P/Games.tsx`: a kártyákon (`:344-370`) legjobb pont (`readBest`, `GE/mobile/bestScore.ts`), csillagok (pálya-
   rendszerből: `websuli.levels.<gameId>.<grade>` — a feloldott pálya-szám), a gyűjtemény-számláló; a lap tetején
   `PlayerLevelBadge` (szint + sáv). A „Mai kihívás” sáv (`:294-320`) változatlan.
6. `T/games-lobby-meta.spec.ts`: a kártyákon megjelenik a legjobb pont és a csillag egy előre beírt localStorage-ből;
   M1–M3 a listán 3 nézetben.

### Elfogadás (J8)

- [ ] J17, J18 teljesül; `T/game-meta.test.ts`, `T/games-lobby-meta.spec.ts`, `T/game-ethics-guard.test.ts` zöld.
- [ ] A meglévő `T/games-lobby-mobile*.spec.ts` (felderítés: `ls T | grep lobby`) zöld.

### J8-belépő — „Belépés” / „Fiókom” belépő a Játékok oldalán (a J8 fejezetből kiemelt, minimális rész)

**Állapot:** folyamatban – 2026-11-16, ág feat/jatek-fiok-belepo, munkafa .claude/worktrees/jatek-fiok-belepo, kanban #60
**Függ:** JM7a, JM7b (main) · **Modell:** Sonnet · **Ok:** a `/belepes` és a `/fiok` oldalra a felületen sehol nincs mutató
gomb, így a `PLAYER_ACCOUNTS` bekapcsolása semmit nem érne (a gyerek nem találná a regisztrációt).
**Cél:** a Játékok oldalon, CSAK bekapcsolt flag mellett: „Belépés” gomb (kijelentkezve) → `/belepes`; „Fiókom” gomb
(becenév + avatar a szerverről) → `/fiok`. Kikapcsolt flagnél a mai kinézet bitre változatlan.
**Nem-cél:** szerverkód, séma, a flag alapértéke, más játéklap, a J8 többi része (meta, szint, kártya-kiegészítés).
**Fájlok:** új `source/client/src/components/PlayerEntry.tsx`, `source/tests/player-entry.test.ts`,
`source/tests/player-entry.spec.ts`; módosítandó: `source/client/src/pages/Games.tsx` (egyetlen sor: a komponens felcsatolása
a fejléc alatt — a #464 is érinti a fájlt, ezért a változás egyhelyes), `source/client/src/index.css` (csak ha a komponens
nem megoldható a meglévő osztályokkal).
**Lépések:** (1) állapot-sor commit; (2) a komponens (a flag KI / töltés / hiba → semmit nem renderel); (3) felcsatolás
a `Games.tsx`-ben; (4) egység- és e2e-teszt, képernyőképek 360×640, 390×844, 844×390 méretben kijelentkezve és belépve;
(5) PR, CI, review.
**Elfogadás:** flag KI → a DOM-ban nincs belépő (teszt); BE + kijelentkezve → „Belépés” ≥ 48 px, `/belepes`-re visz; BE +
belépve → „Fiókom” a szerver-becenévvel és avatarral, `/fiok`-ra visz; hosszú becenév nem töri az elrendezést; tiltott fiók
→ „Fiókom” `/fiok`-ra; a `games-lobby-mobile` spec és a mobil mérő zöld.

---

## J9 — Záró mérés, átfogó review, éles próba, retro

**Állapot:** nem kezdődött
**Függ:** J1–J8 merge. **Modell:** Opus. **Elfogadás:** J2, J3, J9, J11, J15, P1–P3.

### Lépések

1. Állapot-sor commit.
2. **Szimulációs mátrix:** `T/game-sim-matrix.test.ts` — a hét `createSimGame` × {`SIM_AVERAGE`, `SIM_YOUNG`,
   `SIM_STRONG`, `SIM_WEAK`} × 20 seed; táblázat a `docs/measurements/2026-11-xx-jatekelmeny-matrix.md`-be (kérdés/perc,
   max rés, menethossz, nyerési arány, egyedi tételek), a terv 6.2 küszöbeihez mérve; a hét játék átlaga ≥ 6,8 (J2).
3. **Bot-futás böngészőben:** `T/game-autoplay.spec.ts` — játékonként 120 mp a `play-option` gombokon (75%-ban a
   `data-correct="true"`, különben rossz; reakció 2,8 mp), a `probe()` számlálóiból kérdés/perc és `simTime`-arány;
   a szimuláció és a böngésző eltérése ≤ 25%.
4. **Teljesítmény:** low-tier (`?look=low`) + CDP 4× CPU-lassítás, játékonként 30 mp, `probe().fps` medián ≥ 30 (J11).
5. **Mobil mátrix:** a teljes `game-mobile-quality` 7 játék × 3 nézet, CI-azonos úton (C-33).
6. **Átfogó review** (AGENTS.md „Review guidelines”): a teljes funkció (J0–J8) — adatszerződés a director ↔ játék ↔
   ResultScreen ↔ score között; regresszió (névtelen / bejelentkezett / kupon); a `localStorage`-kulcsok; etika (4.2);
   PR-kommentként, fájl:sor evidenciával, kritikus leletnél refuter-kör.
7. **Éles próba:** merge után (az orkesztrátor végzi, az aktív futások őre után) a hét játék megnyitása a production
   domainen mobil nézetben (domain-felderítés: `grep -rn "https://" render.yaml source/vercel.json | grep -v onrender`,
   vagy a tulajdonos által ismert cím — UNKNOWN), konzolhiba nélkül, egy-egy menet.
8. **Retro** (`docs/handoffs/2026-11-xx-jatekelmeny-retro.md`) mért tényekből; új csapdák a `docs/agent-csapdak.md`-be;
   kanban, memória, munkafa-higiénia (P3).

### Elfogadás (J9)

- [ ] A mátrix-dokumentum minden 6.2 küszöböt teljesít (vagy NOT DONE + ok + javító szelet).
- [ ] `npm run verify` zöld a `main`-en (J15 / P1); átfogó review PR-kommentben (P2); retro (P3).

---

## JM — Közös többjátékos mód, párbaj, játékos-fiók, pontgyűjtés (JM0–JM11) és JB

Terv: 10. szakasz (10.3 csatorna, 10.4 fiók és admin-elválasztás, 10.5 párbaj-szabály, 10.6 pontok, 10.7 módok, 10.8 szobák,
10.9 gyermekvédelem). Közös szabályok: K.1/12 (flag-fegyelem), K.5 KSZ-19/20, K.4 28–30. Minden JM-szelet PR-leírása
tartalmazza a 10.9 gyermekvédelmi ellenőrzőlistát pipálva.

### JM-K Közös szerződés (JM1 és JM2 hozza létre)

```ts
// source/shared/duel/rules.ts — tiszta TS (KSZ-1, J19 őr alatt)
export const DUEL_HP = 100;
export const DUEL_BASE_DAMAGE = 10;
export const DUEL_ROUNDS = 7;
export const DUEL_MAX_TIEBREAKS = 2;
export const SPEED_BANDS: readonly { maxRatio: number; bonus: number }[] = [
  { maxRatio: 0.25, bonus: 2.5 }, { maxRatio: 0.5, bonus: 1.5 }, { maxRatio: 0.75, bonus: 0.5 },
]; // bónusz ≤ 25% az alapsebzéshez; a ratio = elfogadott idő / saját válaszablak
export const TIE_MS = 200;
export type DuelAnswer = { playerId: string; correct: boolean; acceptedMs: number | null; windowMs: number };
export type DuelRoundOutcome = { damageTo: Record<string, number>; speedBonus: Record<string, number>; fastestCorrect: string | null };
export function scoreRound(answers: readonly DuelAnswer[], alive: readonly string[]): DuelRoundOutcome; // sebzés egyenlően oszlik a többi élő játékos közt; rossz válasz 0 és nincs levonás
export type DuelState = { hp: Record<string, number>; round: number; tiebreaks: number; stats: Record<string, { correct: number; answered: number; bestStreak: number; streak: number; fastestMs: number | null /* az acceptedTimeMs().acceptedMs-ből, suspicious kör kihagyva */ }> };
export function createDuel(playerIds: readonly string[]): DuelState;
export function applyRound(s: DuelState, o: DuelRoundOutcome, answers: readonly DuelAnswer[]): DuelState;
export type DuelVerdict = { finished: boolean; needTiebreak: boolean; winners: string[]; coWin: boolean; podium: string[][] };
export function verdict(s: DuelState): DuelVerdict; // 7 kör vagy egy kivételével mind 0 HP; holtversenynél ≤ 2 döntő, utána közös győzelem
export const MAX_LATENCY_SLACK_MS = 400;
export const HUMAN_MIN_MS = 200;
/** A szerver mérése az elsődleges (review #440). serverRtMs = beérkezés − round:open kiküldése (szerveróra);
 *  medianRttMs = a kapcsolat utolsó 5 clock:ping mintájának mediánja.
 *  slack = min(MAX_LATENCY_SLACK_MS, max(0, medianRttMs)) (NaN → 0);
 *  ha clientRtMs hiányzik / nem véges (NaN, ±Infinity) / ≤ 0 → acceptedMs = serverRtMs;
 *  különben acceptedMs = clamp(clientRtMs, max(0, serverRtMs − slack), serverRtMs).
 *  speedEligible = acceptedMs ≥ HUMAN_MIN_MS; alatta a válasz helyes marad, bónusz 0, suspicious = true. */
export function acceptedTimeMs(clientRtMs: number | null | undefined, serverRtMs: number, medianRttMs: number): { acceptedMs: number; speedEligible: boolean; suspicious: boolean };
// KÖTELEZŐ egységtesztek (T/duel-rules.test.ts): clientRtMs = 0 → serverRtMs; negatív → serverRtMs; NaN / Infinity / undefined → serverRtMs;
// clientRtMs > serverRtMs → serverRtMs (felső vágás); clientRtMs < serverRtMs − slack → serverRtMs − slack (alsó vágás);
// a kettő között → clientRtMs; medianRttMs = 5000 → slack 400 (plafon); medianRttMs negatív / NaN → slack 0;
// acceptedMs = 150 → speedEligible false, suspicious true, bónusz 0; az ablakon túl érkező válasz → ROUND_CLOSED (nem kerül ide).
// A protokoll többi kliensmezője is hitelesítés nélküli állítás: optionIndex egész és a saját kérdés opciószámán belül;
// round = az aktuális kör; reactionId ∈ REACTIONS; room:create settings zárt értékkészlet (rounds 3–10, mode enum);
// run:progress score monoton és a game-score-rules másodpercenkénti plafonja alatt (túllépés → plafon + suspicious).

// source/shared/duel/questions.ts — a kérdéssor seedelt építése (szerver: online szoba, S/realtime/question-provider.ts; kliens: gépi ellenfél, JM3a)
export type DuelQuestion = { key: string; prompt: string; options: string[]; correctIndex: number; explanation?: string; grade: number; windowMs: number };
export function buildRoundQuestion(args: { seed: string; round: number; grade: number; band: number; subjects?: string[]; used: Set<string> }): DuelQuestion | null;
// pickGradeQuiz (GE/gradeQuiz.ts:75) a közös band-del, a saját évfolyamból; az opció-sorrend a shared/option-order.ts keverőjével; windowMs a windowMsFor szabállyal (J0b).

// source/shared/duel/protocol.ts — Socket.IO események (zod; PROTOCOL_VERSION = 1)
// Kliens → szerver: "room:create" {cid, gameId, mode: "duel" | "race" | "parallel", settings: {rounds?, band?}} · "room:join" {cid, code}
//   · "room:ready" {cid, ready} · "room:start" {cid} · "round:answer" {cid, round, optionIndex, clientRtMs}
//   · "run:progress" {score, stage} (≤ 1 Hz) · "react" {cid, reactionId} · "room:leave" {cid} · "room:rematch" {cid}
//   · "room:kick" {cid, playerId} · "clock:ping" {t0}
// Szerver → kliens: "welcome" {playerId, nickname, avatar, resumeToken, serverTs, limits, protocol}
//   · "room:state" {seq, code, gameId, mode, phase, hostId, players[{id, nickname, avatar, ready, connected, hp?, score?}], round, deadlineTs}
//   · "round:open" {seq, round, question: {prompt, options}, openedAtServerTs, deadlineTs}   ← játékosonként (saját évfolyam!), helyes index NÉLKÜL
//   · "round:reveal" {seq, round, correctIndex, explanation?, results[{playerId, correct, acceptedMs, damage}], hp}
//   · "match:result" {seq, podium: string[][], winners, coWin, stats[{playerId, accuracy, correct, fastestMs, bestStreak}], saved}
//   · "progress:update" {players[{id, score, stage}]} · "react" {playerId, reactionId} · "notice" {code: "SERVER_RESTART" | "ROOM_EXPIRING" | "RUNS_PRIORITY"}
//   · "error" {cid?, code} · "clock:pong" {t0, serverTs}
export const ERROR_CODES: readonly ["BAD_MESSAGE","UNSUPPORTED_VERSION","RATE_LIMITED","ROOM_NOT_FOUND","ROOM_FULL","ROOM_STARTED","NOT_HOST","ALREADY_IN_ROOM","ALREADY_ANSWERED","ROUND_CLOSED","INVALID_TICKET","CAPACITY","FEATURE_DISABLED","GAME_NOT_ENABLED"];

// source/shared/duel/room-machine.ts — tiszta reducer, injektált idővel
export type RoomPhase = "lobby" | "countdown" | "round_open" | "round_reveal" | "finished" | "aborted";
export type RoomEvent = { type: "join" | "leave" | "ready" | "start" | "answer" | "tick" | "disconnect" | "reconnect" | "rematch" | "kick" | "drain"; /* … mezők a protokoll szerint … */ };
export function reduceRoom(state: RoomState, ev: RoomEvent, nowMs: number): { state: RoomState; effects: RoomEffect[] };
// effects: "emitState" | "openRound" | "reveal" | "result" | "persist" | "close"; az időzítőket a szerver-réteg futtatja.

// source/shared/duel/reactions.ts — előre megírt reakciók (szabad szöveg nincs)
export const REACTIONS: readonly { id: string; label: string }[]; // „Szép volt!”, „Gratulálok!”, „Visszavágó?”, 👏, 🎉, 😮
// source/shared/nicknames.ts — vendég-becenév: két listából (melléknév + állat), seedelt választás; névszűrő a regisztrált becenévhez
export function guestNickname(seed: string): string;
export function nicknameProblems(nick: string): string[]; // trágárság (shared/hu-lexicon.ts bővítése vagy saját lista), e-mail / telefonszám / URL-minta, 3–16 karakter, betű/szám/szóköz
```

---

### JM0 — Adatvédelmi javítás (fióktól független, azonnal kiadható)

**Állapot:** kész — PR #443 (ág fix/jatek-jm0-adatvedelem-2, kanban #37, 2026-11-16) · **Függ:** — · **Modell:** Sonnet · **Elfogadás:** JM-A1, JM-A2
**Fájlok:** `S/gameScoreService.ts`, `S/auth.ts`, `S/routes.ts` (score-végpont és `:1510`), `S/index.ts` (limiter-bekötés),
új `S/lib/mask-email.ts`, `T/jm0-privacy-guards.test.ts`, `T/game-score-contract-guard.test.ts` (ha a J0b már létrehozta:
az opcionális `runId` mezővel bővítve — SPEC-VÁLTOZÁS a terv 2. szakasza szerint, additív).
**Horgonyok:** `formatDisplayName` `S/gameScoreService.ts:56-61`, a lekérdezés `:67-90` (`firstName`, `lastName` `:74-75`);
e-mail-naplók `S/auth.ts:72, 86, 96, 105`, `S/routes.ts:1510`; score zod `S/routes.ts:1298-1304`, kezelő `:1306-1338`;
limiterek `S/index.ts:362-460`; `ViewDedup` `S/lib/view-dedup.ts:10`.
**Lépések:**
1. Állapot-sor commit.
2. Ranglista-név: `formatDisplayName` helyett `displayHandle(userId)` = `"Játékos #" + 4 jegyű, a felhasználó-azonosítóból
   HMAC-cel (a `SESSION_SECRET`-ből levezetett kulccsal) képzett szám` — valódi név nem kerül a válaszba (a lekérdezés a
   `firstName` / `lastName` mezőt nem is kéri). JM7 után a játékos beceneve váltja (ha a felhasználónak van összekapcsolt
   játékos-fiókja — JM8).
3. `S/lib/mask-email.ts`: `maskEmail("anna@example.com") → "a***@e***.com"`; a fenti 5 naplósor maszkolt formát ír.
4. `POST /api/games/score` (a régi út; a `runId` itt csak az újraküldés-dedup kulcsa, NEM csalásvédelem — egy kliens új
   `runId`-kkel ugyanúgy küldhet, mint ma; a valódi hihetőség-ellenőrzés a JM8 szerver által kiadott runjaié): limiter
   60 / 15 perc / IP (a meglévő `clientIpKeyGenerator`-ral); opcionális `runId:
   z.string().uuid().optional()`; ha van, `ViewDedup` mintájú memóriabeli TTL-halmaz (24 óra, 50 000 elem) → ismételt
   `runId` 200 `{ ok: true, duplicate: true }`, írás nélkül. A 7 játék kliense menetenként `crypto.randomUUID()`-t küld
   (egy soros bővítés a meglévő hívásokban: `P/BlockCraftQuiz.tsx:2555-2569`, `P/TsunamiEscapeEnglish.tsx:1347-1361`,
   `P/SpaceAsteroidQuiz.tsx:2588-2600`, `P/SpeedQuizMath.tsx:1766-1772`, `P/BrainRotSteal.tsx:946-960`,
   `P/TornadoHunter200.tsx:1779-1789`, `P/WordLadderHuEn.tsx:866-884`) — ha egy játékszelet épp ugyanazt a lapot
   módosítja, a sort az a szelet veszi át (ORKESZTRÁTOR egyeztet; párhuzamosnál előbb a JM0 kerül be).
5. Tesztek: `T/jm0-privacy-guards.test.ts` — (a) a `S/gameScoreService.ts` ranglista-lekérdezése nem választ `firstName`
   / `lastName` mezőt; (b) a `S/` alatt nincs `logger.*(` hívás, amelynek sablonjában `email}` / `${email` szerepel
   maszkolás nélkül (regex-őr, komment-szűrve); (c) `maskEmail` egységteszt; (d) a dedup-halmaz egységteszt.
6. Kliens: `P/Games.tsx:250-262` ranglista-megjelenítés a „Játékos #…” nevet mutatja (szövegcsere nem kell, a mező ugyanaz).
**Ellenőrzés:** hat kapu; `npm run test:e2e -- tests/game-win-paths.spec.ts` (a score-hívás nem tört el).
**UNKNOWN:** U-JM0-1: van-e más nyilvános végpont, amely `users.first_name`-et ad ki játékkontextusban — felderítés:
`grep -n "firstName" S/routes.ts | grep -n "games\|leader"`.

---

### JM1 — Szabálymotor + egyeszközös Párbaj aréna

**Állapot:** kész — PR #447 (2026-11-16); az egyeszközös aréna (4–5. lépés) a JM1r-ben megszűnt (D20) · **Függ:** J0a (`game-rng`), J0b (`windowMsFor`) · **Modell:** Opus · **Elfogadás:** JM-A3 (szabálymotor-rész), J19
**Fájlok:** új `source/shared/duel/{rules,questions,reactions}.ts`, `source/shared/nicknames.ts`, `P/DuelArena.tsx`,
`source/client/src/App.tsx` (útvonal `/games/parbaj` — ORKESZTRÁTOR: J0c után a JM1 az App.tsx egyetlen módosítója),
`P/Games.tsx` (egy kártya a listán — ha a J8 párhuzamosan fut, a kártyát a J8 adja hozzá; ORKESZTRÁTOR egyeztet),
`T/duel-rules.test.ts`, `T/duel-questions.test.ts`, `T/nicknames.test.ts`, `T/duel-arena.spec.ts`.
**Lépések:**
1. Állapot-sor commit.
2. `rules.ts` a JM-K szerint; egységtesztek: 2 játékos, mindkettő jó → mindkettő sebez; sávhatárok (0,25 / 0,5 / 0,75);
   rossz válasz 0 és nincs levonás; 7 kör után holtverseny → döntő; 2 döntő után még holtverseny → `coWin`; 3–4 főnél a
   sebzés-elosztás; a gyorsasági bónusz sosem haladja meg az alap 25%-át (tulajdonság-alapú teszt 10 000 véletlen körrel,
   seedelt).
3. `questions.ts`: vegyes évfolyam — 4. és 7. évfolyamos játékos ugyanabban a körben a saját évfolyamából kap tételt,
   ugyanabból a `tier`-ből (`tierForBand`, `GE/gradeQuiz.ts:39`); ugyanaz a seed → ugyanaz a sorozat; nincs ismétlés a
   meccsen belül.
4. `P/DuelArena.tsx`: fekvő vagy álló, két térfél (egymással szemben forgatott felső fél álló módban), mindkét térfélen a
   saját évfolyam-választó (a `GradeLevelPicker` mintájára), 7 kör, közös kör-óra, életerő-sávok, „csapás” animáció
   (`feel.addTrauma`), haptika, a kör után a helyes válasz + magyarázat 2 mp-ig, dobogó, „Visszavágó”, helyi párbaj-mérleg
   (`websuli.duelRecord.v1`, csak helyben). A két térfél egyidejű érintése: `pointerId`-alapú (KSZ-14).
5. `T/duel-arena.spec.ts` (Playwright, 844×390 és 390×844): két térfél válaszgombjai külön `pointerId`-vel kattintva
   (CDP-n két érintés — C-34: a hatást a DOM-ban / probe-on igazolni), a győzteshirdetés megjelenik, M1–M3.
**UNKNOWN:** U-JM1-1: a `client/src/data/gradeQuizBank` importálható-e a `source/shared/`-ből tiszta úton (a `@shared` alias
iránya) — felderítés: `grep -n "paths" source/tsconfig.json`; ha nem, a `questions.ts` a bankot paraméterként kapja.

**SPEC-VÁLTOZÁS 2026-11-16 (tulajdonosi döntés, D20 / G12):** a 4. lépés (`P/DuelArena.tsx`, osztott képernyő, forgatott
felső térfél) és az 5. lépés (`T/duel-arena.spec.ts`) érvényét veszti; a `shared/duel/match.ts` egyeszközös motor törlődik.
Megmarad: `rules.ts`, `questions.ts`, `reactions.ts`, `shared/nicknames.ts` és tesztjeik. A J19 arany visszajátszása és a
bot-szimuláció a `room-machine`-en él tovább (JM1r).

---

### JM1r — Az egyeszközös aréna megszüntetése (D20)

**Állapot:** kész — #460 (e1852e89, 2026-11-16), kanban #52 (a JM3 jegye) · **Függ:** JM2 (main), JM7b (main) · **Modell:** Opus · **Elfogadás:** JM-A3 (új szöveg), J19
**Fájlok:** törlés: `P/DuelArena.tsx`, `T/duel-arena.spec.ts`, `T/duel-match.test.ts` (az átvitel után), `source/shared/duel/match.ts`;
módosítás: `source/client/src/App.tsx` (a `DuelArena` lazy import és a `/games/parbaj` útvonal ki), `P/Games.tsx` (a párbaj-sáv és
a `Swords` import ki), `source/shared/duel/index.ts` (a `match` re-export ki), `source/shared/duel/questions.ts`
(`export const DUEL_BASE_WINDOW_MS = 6000`), `S/realtime/question-provider.ts` (ezt importálja), `T/duel-rules.test.ts` és
`T/duel-vocab-retry.test.ts` (csak megjegyzés); új: `T/duel-bot-sim.test.ts`, `source/client/src/components/duel/*` (az aréna
újrahasznosítható megjelenítő részei: életerő-sáv, időjelző, kérdéskártya, 2×2 válaszrács betűméret-illesztéssel, ítélet-sáv,
eredménykártya, hangok / rezgés — hívó nélkül, a JM3a építi be; komponens-egységteszttel) ; `git mv docs/measurements/jatekok-jatekelmeny/JM1
docs/measurements/jatekok-jatekelmeny/JM1-megszunt`.
**Lépések:** 1. Állapot-sor + a terv és e fájl D20-szövegei (első commit). 2. `T/duel-bot-sim.test.ts` a `reduceRoom`-on
(`join` / `ready` / `start` / `answer` / `tick`): (a) arany visszajátszás — azonos seed + esemény-sor →
`deepEqual` állapot és hatás, más seed → más kérdéskulcsok; (b) 3000 meccs a JM1 három forgatókönyvével és küszöbeivel
(pontosabb ≥ 80%; pontos-lassú ≥ 60% és ≥ 200 különbség; azonos pontosságnál a gyorsabb többször nyer, a lassabb ≥ 10%),
mindig `finished`, ≤ 7 + 2 kör; (c) 200 meccs a valódi bankkal, 4. vs 8. évfolyam, ismétlés nélkül. ZÖLD előbb, csak utána
törlés. 3. Megjelenítő komponensek kiemelése (`components/duel/`). 4. Törlések és módosítások. 5. Kapuk: `npm test`, `check`,
`check:test`, `lint`, `build`, `npm run test:e2e -- tests/games-lobby-mobile.spec.ts`, `three-phase-check`. 6. Böngészős próba:
`/games` 360×640 / 390×844 / 844×390 — a párbaj-sáv nincs, nincs túlcsordulás; `/games/parbaj` → „nem található”.
**Teszt-integritás:** a törölt tesztek a megszűnt funkció tesztjei (dokumentált spec-változás, D20); a szabály-tesztek
(`duel-rules`, `duel-questions`, `nicknames`, `duel-vocab-retry`, `rt-*`) érintetlenek, a bot-szimuláció és a determinizmus átvitt.

---

### JM2 — Socket.IO réteg (`/api/rt/`), szoba-állapotgép, szerveroldali kérdéssor — `MP_MODE` alapból `off`

**Állapot:** kész — #452 (f06c35df, 2026-11-16), kanban #48; `MP_MODE` alapból `off`, élesben kikapcsolva · **Függ:** JM1 · **Modell:** Opus · **Elfogadás:** JM-A4, JM-A6, JM-A7, JM-A8
**Fájlok:** `source/package.json` (+`socket.io`, +`socket.io-client` — pontos, legalább 2 hetes kiadású verzió, MIT;
a PR rögzíti a csomagméretet), új `source/shared/duel/{protocol,room-machine}.ts`, `S/realtime/{gateway,registry,ticket,
question-provider,metrics,index}.ts`, `S/routes/rt.ts` (`POST /api/rt/ticket`, `GET /api/rt/status`), `S/index.ts`
(bekötés a `registerRoutes` után + `drain` a `gracefulShutdown` elején), `S/routes.ts` (CSRF-kivétel lista bővítése az
`/api/rt/ticket`-re origin-allowlisttel — a meglévő minta `S/routes.ts:789-818`), tesztek: `T/rt-protocol.test.ts`,
`T/rt-room-machine.test.ts`, `T/rt-gateway.test.ts` (folyamaton belüli `http.Server` + `socket.io-client`), `T/rt-ticket.test.ts`.
**Horgonyok:** `createServer(app)` `S/routes.ts:4240`; `server.listen` `S/index.ts:678`; SIGTERM `S/index.ts:685-729`; Vite HMR
`S/vite.ts:28` (az `/api/rt/` útvonal nem ütközhet vele: a Socket.IO csak a saját `path`-ját kezeli); `isE2eMode`
`S/lib/e2e-mode.ts:7`; `isOriginAllowed` `S/lib/allowed-origins.ts`; `clientIpKeyGenerator` `S/lib/client-ip.ts`; a
learner-token HMAC-mintája `S/lib/learner-token.ts:14-32`; vészfék-minta `S/index.ts:563-564`.
**Lépések:**
1. Állapot-sor commit.
2. Függőség-felvétel (`npm install --prefix source socket.io@<pontos> socket.io-client@<pontos>`), a `package-lock.json` a
   PR-ban; ARM64 + x64: tiszta JS csomagok (natív rész nincs — `npm run doctor:arch` zöld).
3. `protocol.ts` (zod diszkriminált uniók a JM-K szerint), `room-machine.ts` (tiszta reducer; tesztek injektált órával:
   lobby → countdown → 7 kör → finished; gazda-váltás; időtúllépés; duplikált válasz → `ALREADY_ANSWERED`;
   újracsatlakozás pillanatképpel; `drain` → aborted részeredménnyel).
4. `S/realtime/ticket.ts`: `POST /api/rt/ticket` → `{ ticket, expiresIn: 60, directUrl? }`; HMAC (kulcs:
   `HMAC(SESSION_SECRET, "rt-ticket-v1")`), tartalom `{kind: "guest" | "player" | "admin", id, nickname, avatar, exp,
   nonce}`, egyszer használatos (nonce-halmaz 60 s TTL); vendégnél `id` véletlen, `nickname = guestNickname(seed)`;
   játékosnál (JM7 után) a `req.session.player`; adminnál a `req.user`. Korlát: 10 / perc / IP.
5. `gateway.ts`: `new Server(httpServer, { path: "/api/rt/", serveClient: false, maxHttpBufferSize: 4096,
   pingInterval: 25000, pingTimeout: 20000, connectionStateRecovery: { maxDisconnectionDuration: 60000 }, cors: { origin:
   getAllowedOrigins(), credentials: true }, allowRequest: (req, cb) => cb(null, isOriginAllowed(req.headers.origin)) })`;
   a `connection` előtt middleware: `socket.handshake.auth.ticket` ellenőrzése (URL-ben soha); `MP_MODE` szerint
   `FEATURE_DISABLED`; kapacitás (`MP_MAX_ROOMS`, gyártás alatt `MP_MAX_ROOMS_DURING_RUNS`); üzenet-token-bucket 20/s;
   minden bejövő esemény zod-validálva; `MP_GAMES` engedélylista (`GAME_NOT_ENABLED`).
6. `registry.ts`: `Map<code, Room>`, kódgenerátor (6 jel, ábécé `ABCDEFGHJKMNPQRSTUVWXYZ23456789`), TTL-takarító (lobby 15
   perc, finished 5 perc), egy játékos egy szobában; az időzítők a reducer `effects`-ei szerint.
7. `question-provider.ts`: a JM1 `buildRoundQuestion` szerveroldalon; játékosonként saját évfolyam; a kérdés a szerverről
   megy, a `correctIndex` csak a reveal-ben.
8. Gyártási elsőbbség: az aktív futások száma — felderítés a lépés elején: `grep -n "active\|inflight\|running" S/index.ts`
   a `gracefulShutdown` (685–729) környékén és a workflow-modulban; ha nincs exportált számláló, egy kis `getActiveRunCount()`
   export a meglévő nyilvántartásból (UNVERIFIED név).
9. `GET /api/rt/status` → `{ enabled, mode, activeRooms, activeMatches }` (nyilvános, PII nélkül); `drain(deadlineMs)`
   bekötve a SIGTERM-láncba (új szoba tiltva, `notice SERVER_RESTART`, 240 s után részeredmény + bontás).
10. Naplózás: `rt.room.created/finished/aborted` szobakód-hash-sel, játékosszámmal; név / e-mail / IP nélkül (KSZ-20).
11. Tesztek (lent) + a JM2 nem ad UI-t: a kliens gombja a JM3-ban jön, így a main változatlanul működik (`MP_MODE=off`).
**Tesztek:** `T/rt-protocol.test.ts` (jó / rossz üzenetek), `T/rt-room-machine.test.ts` (fent), `T/rt-ticket.test.ts`
(lejárt, újrahasznált, hamis aláírás → `INVALID_TICKET`), `T/rt-gateway.test.ts` (folyamaton belüli szerver: idegen origin →
elutasítás; `MP_MODE=off` → `FEATURE_DISABLED`; `admin` módban vendég nem hoz létre szobát; két kliens egy szobában 3 kört
lejátszik; a `round:open` nem tartalmaz `correctIndex`-et; 4 KB feletti üzenet → bontás; `drain` → részeredmény).
**SPEC-VÁLTOZÁS 2026-11-16 (review #452, független biztonsági review, orkesztrátori döntés):**
- Socket.IO-út: `/api/rt/io` (nem `/api/rt/`) — az Engine.IO előtag-egyezéssel szűr, különben a `/api/rt/ticket` és
  `/api/rt/status` HTTP-végpontot is elnyelné; `addTrailingSlash: false`, pontos útvonal-egyezés.
- `MP_MODE=off`: a Socket.IO egyáltalán nem csatolódik fel, a kérdésbank nem töltődik be (az út az Expresshez jut, 404) — a
  JM-A4 „`FEATURE_DISABLED`” elutasítása a futás közben kikapcsolt (`off`-ra állított) felcsatolt rétegre él.
- Leállítás: a 240 s-os kifutás helyett RÖVID, rendezett lezárás — SIGTERM-re a futó meccs azonnal részeredménnyel zárul
  (`reason: SERVER_RESTART`), a lezáró üzenetre `MP_DRAIN_WINDOW_MS` (alap 2,5 s) ablak, utána a meglévő sorrend; szoba
  nélkül azonnal. Indok: a Render a SIGTERM előtt az új példányra váltja a forgalmat, a régi memóriájában élő meccs a
  polling-klienseknek úgysem folytatódhatna, a nyitva hagyott listener viszont új munkát fogadhatna. Védelem: a telepítés
  előtti őr a `GET /api/rt/status` `activeMatches` értékére.
- Gyorsaság (10.5): a késés-keret a szerver által mért `clock:probe` oda-vissza idők MINIMUMA, plafon `RT_LATENCY_SLACK_CAP_MS`
  = 120 ms (nem a medián, nem 400 ms) — a nyugta késleltetésével nem fújható fel; a „leggyorsabb helyes válasz” statisztika
  a szerver nyers mérése. A `shared/duel/rules.ts` `acceptedTimeMs`-e változatlan (a hívó adja a kisebb keretet).
- Nyilvános státusz: `{ enabled, mode, games, available, activeMatches, protocol }`; a részletes (szobák, kapcsolatok,
  gyártási elsőbbség) `GET /api/admin/rt/status` admin-őr mögött. Jegy SESSION_SECRET nélkül sehol (nincs tartalék-kulcs).

**UNKNOWN:** U-JM2-1: a Vercel-rewrite a Socket.IO polling-kéréseit (GET hosszú várakozással, POST) gond nélkül
továbbítja-e (dokumentáció szerint ≤ 120 s proxy-idő, a long-poll ≤ 25 s) — felderítés: a JM3 előtt egy Vercel Preview-
deployon (`MP_MODE=admin`) a `transports: ["polling"]` kényszerítésével két böngészőből egy meccs; mérés: kör-késés.
U-JM2-2: WebSocket-upgrade a Vercel-rewrite-on — ugyanott `transports: ["websocket"]`-tel kipróbálva; ha nem megy, a
polling marad (tervezett viselkedés).

---

### JM3a — Online párbaj 2 főre + gépi ellenfél: szoba, meghívás, váróterem, meccs, győzteshirdetés

**Állapot:** folyamatban — 2026-11-16, ág feat/jatek-jm3a-online-parbaj, munkafa .claude/worktrees/jatek-jm3a, kanban #52 · **Függ:** JM1r · **Modell:** Opus · **Elfogadás:** JM-A3, JM-A3b, JM-A4 (kliens + admin-mód
csatlakozás), JM-A5 (első fele)
**Tulajdonosi döntések (2026-11-16, kötelezők):** (1) csak hálózati közös játék — egyeszközös mód nincs (D20); (2) szobát csak
játékos-fiók, párosított tanulói profil vagy (admin módban) admin nyithat, csatlakozni vendégként is lehet a kóddal / linkkel,
generált becenévvel (D21); (3) gépi ellenfél, hogy a párbaj egyedül is játszható legyen (D22); (4) a szóbankos (angol /
német / francia) nyelvi párbaj a JM3b-ben jön, most tantárgyi kérdések (D23); (5) csalásvédelem baráti szinten (D24).
**Fájlok:** új `P/DuelOnline.tsx` (`/games/parbaj` és `/games/parbaj/:kod`), a JM1r `source/client/src/components/duel/*`
komponenseire épülő meccs- / váróterem- / eredmény-nézetek, kliens-meghajtók (hálózati: `rtClient`; helyi: a `room-machine` a
kliensen, gépi játékossal), új `source/shared/duel/bot.ts` (seedelt gépi játékos), `source/client/src/components/QrImage.tsx`
(a `PairQr` kiemelve), `source/client/src/App.tsx`, `P/Games.tsx` (belépő), `S/routes/rt.ts` + `S/realtime/gateway.ts` +
`S/realtime/ticket.ts` (szobanyitási jog), `S/realtime/question-provider.ts` (olvasási idő-alapú ablak), tesztek:
`T/rt-gateway.test.ts` / `T/rt-ticket.test.ts` bővítés, `T/duel-local.test.ts` (gépi ellenfél determinizmus),
`T/duel-online.spec.ts` (két `browser.newContext()`, valódi Socket.IO), `T/duel-bot.spec.ts` (gépi meccs valódi érintéssel).
**Szobanyitás / csatlakozás (D21, JM-A4):** `off` → a hálózati belépő nem látszik (a gépi ellenfél igen); `admin` → nyitás csak
admin-munkamenettel, csatlakozás kóddal bárkinek (vendég is) — a jegy-végpont és a kézfogás is intent szerint dönt, a réteg
admin-jogot nem ad; `on` → nyitás játékos-fiókkal (`PLAYER_ACCOUNTS` mellett), párosított tanulói profillal vagy adminként,
vendég nem nyithat (barátságos „Lépj be / párosítsd a profilod” út), csatlakozás bárkinek.
**Megjelenítés:** egy játékos nézőpontja — saját kérdés + 2×2 válaszrács nagyban, az ellenfél kicsiben (becenév, életerő,
„válaszolt” jelzés); kör-számláló, időjelző, „Döntő kérdés!” szalag a kérdés fölött (az ablakot nem rövidíti); felfedés (helyes
válasz, sebzés, ki volt a gyorsabb); győzteshirdetés (győztes / közös győzelem, pontosság, leggyorsabb helyes, legjobb sorozat;
a vesztes is elismerést kap); „Visszavágó”. Szünet nincs (kilépés megerősítéssel). Hálózati állapotok gyerekbarát magyar
szöveggel (kapcsolódás, újracsatlakozás 60 s-os helymegtartással, ellenfél kiesett / visszatért, szoba megszűnt, szerver frissül,
tele a szerver, érvénytelen / lejárt kód); minden hibaállapotból van kiút. Gépi ellenfélnél ugyanez a felület, „Gép” jelöléssel.
**Válaszablak:** az olvasási időhöz igazodik (a J0c `fitsAllViewports` / olvasási idő szabálya, ≤ 9 s) a szerver- és a helyi
meghajtóban is; ha kell, az olvasási idő-számítás additívan a `shared/` alá kerül.
**Lépések:** 1. Állapot-sor. 2. Szerver: szobanyitási jog (D21) + olvasási idő-alapú ablak, tesztekkel. 3. `shared/duel/bot.ts`
+ helyi meghajtó + determinizmus-teszt. 4. Megjelenítő nézetek a `components/duel/*`-ból, egy megjelenítő két meghajtóval.
5. `P/DuelOnline.tsx`: kezdő („Gép ellen”, „Szoba létrehozása”, „Csatlakozás kóddal”), váróterem (nagy kód, „Megosztás”
`navigator.share` / másolás tartalékkal, QR gombra, játékoslista, „Kész vagyok”, gazda „Indítás”), meccs, eredmény,
visszavágó, hibaállapotok (`RT_ERROR_TEXT`). 6. Belépő a `/games` listán. 7. e2e: két kontextus (A nyit, B kóddal; teljes meccs
→ győzteshirdetés → visszavágó; B hálózata kör közben megszakad és visszatér; A kilép; érvénytelen kód; vendég nem nyit;
`admin` módban a nem admin csatlakozhat, nem nyithat; long-polling-only futás); gépi meccs érintéssel; M1–M3 360×640,
390×844, 844×390. 8. Bevezetés (orkesztrátor): merge → `MP_MODE=admin` élesben → két eszközös éles próba: U-JM2-1 (polling a
Vercel-rewrite-on, kör-késés), U-JM2-2 (WebSocket-frissítés, `transport.name`) → jegyzőkönyv `docs/measurements/`.
**UNKNOWN:** U-JM3-1: `MP_DIRECT_URL` (tulajdonosi aldomain) — opcionális; ha nincs, a polling út az alap.

#### JM3a-2 — A #464 független review-jának utómunkája (az `MP_MODE=on` előtt kötelező)

**Állapot:** folyamatban — 2026-11-16, ág fix/jatek-jm3a2-utomunka, munkafa .claude/worktrees/jatek-jm3a2, kanban #61 / #52 · **Függ:** JM3a (#464) · **Modell:** Opus
**Forrás:** `review-464` „Ellenőrző kör” (ÚJ-2…ÚJ-5, K4 maradéka, A3, A7) + orkesztrátori kérés (meta-mérő).
**Lépések (sorrendben):**
1. ÚJ-4: az online e2e futásonként egyedi tanulónévvel / azonosítóval dolgozik (ugyanazon az adatbázison az újrafuttatás és a CI `retries` is zöld lehet).
2. ÚJ-2: a folytatási token minden sikeres visszaülésnél (folytatás és új jeggyel saját helyre ülés) cserélődik, a régi azonnal érvénytelen; szerveroldali lejárat (a helymegtartás vége / szoba lezárása); a kiütött (régebbi) lapfül érthető zárást kap („A játék egy másik lapon folytatódik”), nem 60 s „Kapcsolódás újra…”-t. Egység- és gateway-teszt.
3. K4 maradéka: az elfogadott visszavágó után nem kell újra „Kész” + „Indítás” (mindkét fél kész → azonnali visszaszámlálás); a 45 s-os lejárat a NEM kérő gyereket nem dobja ki a győzteshirdetésről (a kérdés eltűnik, az eredmény marad); a kérő kilépésekor a kérdés azonnal zárul érthető szöveggel.
4. ÚJ-3: a visszavágó-kérdés 844×390-en nem csúszik az eredménykártyára.
5. ÚJ-5: a „megtelt a szoba” képernyő nem hálózati hiba-képernyő (saját ikon, „Új szoba nyitása” / „Vissza a játékokhoz”).
6. e2e az online kilépésre (`leave()` → az ellenfél azonnal értesül, nem lát 60 s „Kapcsolódik…”-ot).
7. e2e emberi tempóban (≥ 200 ms), a „Leggyorsabb helyes” számértékkel.
8. A Párbaj nem-játék képernyői (kezdő, beállítás, váróterem, megtelt szoba, győzteshirdetés, visszavágó-kérés) a meta-mérő (`tests/game-meta-quality.spec.ts`, X1–X8; 360×640, 412×915, 844×390) alatt, a bukások javítva.
**Elfogadás:** a fenti tesztek zöldek; a kapusor (`npm test`, `check`, `check:test`, `lint`, `build`, e2e) zöld; rövid biztonsági ellenőrzés a token-forgatásra.

##### JM3a-2/R — A visszavágó állapotgépe (PR #476 review: Codex 4591991467 / 4591991474, vercel 4592016885 / 4592016895 / 4592016905)

**Gyökérok:** a visszavágó két igazságforrásból élt — a szerver `rematchPending` jelzője (ki kért, nem tudta) és a kliens helyi
`iAskedRematch` / 45 s-os időzítője. Ebből jött mindhárom hiba: (1) egyidejű kérésnél mindkét kliens „kérő”, senki nem
fogadhat el; (2) kilépés + új belépő után a kliens régi állapota ragad; (3) a kérő saját ismételt `ready`-je elfogadásnak
számított. **Javítás:** az egyetlen igazságforrás a szerver `RoomState.rematch` mezője, a kliens nézete ebből számolódik
(`room:state.rematch`), saját visszavágó-állapotot nem tart.

**Szerveroldali állapot:** `rematch: { by, status, deadlineMs, result } | null` — `by` a kérő, `status` ∈ `pending` (kért, vár) /
`accepted` (elfogadva, de a másik fél épp nincs kapcsolatban) / `expired` (45 s alatt nem jött válasz) / `left` (valamelyik fél
kilépett); `result` a lezárt meccs győzteshirdetése (újratöltés után is ez látszik); `deadlineMs` a `pending` lejárata (45 s).

**Tervezési döntés (új belépő):** az első meccs után a szoba **nem fogad új játékost** (`join` → `ROOM_STARTED` „Ebben a szobában
már elkezdődött a játék.”), ha `matchNo > 0`. Indok: a link egy csoportban maradhat — idegen ülne be a kilépett barát helyére, a
gazda pedig nem tudná, hogy ki jött. A tulajdonosi döntés (szobát regisztrált nyit, kóddal vendég csatlakozhat) az ELSŐ
csatlakozásra szólt; meccs után a kód csak visszavágóra él. A bent maradó gyerek az „Új szoba” gombbal friss kódot kap.
Ugyanazon helyre a saját folytatási tokenjével (újratöltés, hálózatkiesés) továbbra is visszaül, ez nem új belépés.

Jelölés: A a gazda, B a vendég, X a kérő, Y a másik fél. „Lát” = a kliens nézete (`DuelOnline` `ResultView` / `LobbyView`).

| Állapot (szerver) | X / Y lát | kér (X) | kér (Y) | elfogad = `ready:true` (Y) | „Most nem” (Y) = kilép | `ready` (X) / `ready:false` (Y) | kilép (X) | csatlakozik (új Z) | lejár (45 s) | megszakad (Y) → visszatér |
|---|---|---|---|---|---|---|---|---|---|---|
| **R** eredmény (`finished`, `rematch=null`) | mindkettő: győzteshirdetés + „Visszavágó” gomb | → **P(X)**; ha Y már kilépett → **L** | → **P(Y)** | `BAD_PHASE`, marad **R** | → R (a maradó „Visszavágó”-ja → **L**) | `BAD_PHASE`, marad **R** | → R (mint balra) | `ROOM_STARTED` | (a `finishedTtl` zárja a szobát) | marad **R** |
| **P(X)** X kért (`lobby`, `pending`) | X: eredmény + „várjuk Y válaszát” (`duel-rematch-waiting`); Y: eredmény + „X visszavágót kér!” Benne vagyok / Most nem (`duel-rematch-ask`) | no-op (nem indít) | **kölcsönös** → `countdown` | → `countdown` (ha mindkettő kapcsolatban), különben → **ACC** | → **L** | no-op (nem indít) | → **L** | `ROOM_STARTED` | → **E(X)** | marad **P(X)** (a lejárat fut; a türelmi idő végén → **L**) |
| **ACC** elfogadva, X épp nincs kapcsolatban | mindkettő: eredmény + várakozás | no-op | no-op | no-op | → **L** | no-op | → **L** | `ROOM_STARTED` | nincs lejárat | X visszatér → `countdown`; türelmi idő vége → **L** |
| **E(X)** lejárt | X: eredmény + „Y nem válaszolt” + Visszavágó; Y: eredmény + „X visszavágót kért — ha mégis…” + Visszavágó (`duel-rematch-expired`) | → **P(X)** (új 45 s) | → **P(Y)** | no-op (a kérdés már nem él) | → **L** | no-op | → **L** | `ROOM_STARTED` | marad **E** (a váróterem-TTL zárja) | marad **E(X)** |
| **L** kilépett | a maradó: eredmény + „a barátod kilépett — a visszavágó most elmarad” (`duel-rematch-gone`), „Új szoba” | `NOT_ENOUGH_PLAYERS` | — | no-op | — | no-op | — | `ROOM_STARTED` | marad **L** (a váróterem-TTL zárja) | marad **L** |
| **countdown** (kölcsönös / elfogadott) | mindkettő: visszaszámlálás, `rematch=null` | — | — | — | — | — | — | — | — | — |

**Független review (315a4abf) javításai ebben a PR-ban:**
- **K1 — nyugtázott token-forgatás (döntés).** Két lehetőség volt: (a) a forgatás a kliens nyugtájával véglegesedik; (b) időalapú átfedés, amíg a helynek nincs élő kapcsolata. **Az (a)-t választjuk.** Indok: az elveszett `welcome` után a szerver a halott kapcsolatot még a ping-időtúllépésig élőnek látja, így a (b) feltétele épp a hiba esetén nem teljesülne; a nyugta viszont pontosan azt méri, hogy az új token megérkezett-e.
  - Működés: a `welcome` Socket.IO-nyugtát kér. A kliens a token átvétele után nyugtáz.
  - Amíg a nyugta nem jön meg, a hely ELŐZŐ tokenje is visszaültet. Ez legfeljebb `RT_RECONNECT_GRACE_MS` (60 s) ideig tart, és csak ugyanarra a helyre szól. Ismételt elvesztésnél az előző token marad a tartalék, a közbülső, soha meg nem érkezett token érvénytelen.
  - A nyugta után az előző token azonnal érvénytelen. A `room:join` saját helyre ülése (új jegy) azonnali, kemény forgatás marad.
  - A meglévő garanciák megmaradnak. Két egyidejű visszaülésből egy hely-birtokos marad, a másik `SESSION_MOVED`-ot kap. Lecserélt, nyugtázott tokennel nem lehet visszaülni. A 6 órás lejárat marad. A token nem kerül URL-be, naplóba vagy más játékos `room:state`-jébe.
- **K1 utójavítás (visszaellenőrzés 7c97da5f, Ú1 + Ú2; vercel 4593486002) — döntés:**
  - *Melyik token a tartalék:* a kézfogásban bemutatott token dönt.
    - Ha a JELENLEGI tokennel jött, az bizonyítja, hogy a kliens megkapta (nyugtának számít). Ilyenkor a jelenlegi lesz az új tartalék, a régebbi tartalék törlődik.
    - Ha a TARTALÉKKAL jött, a jelenlegi token soha nem érkezett meg. Ilyenkor a jelenlegi törlődik, a tartalék marad.
    - Így a kliensnél ténylegesen meglévő token sosem törlődik (Ú1).
  - *Kemény határ:* egy token tartalékidejét EGYSZER, a tartalékká válásakor rögzítjük. A határ az utódjának első kiadásától számított `RT_RECONNECT_GRACE_MS` (60 s), és többé nem frissül.
    - A tartalékkal végzett visszaülés nem hosszabbít. Egy régi tokent tehát nyugtázatlan visszaülések sorával sem lehet a határon túl életben tartani (Ú2).
    - A láncnak minden tagja korlátos. Új tartalékot csak a jelenlegi token bemutatása hoz létre, ami birtoklást bizonyít, és ilyenkor a régebbi tartalék azonnal törlődik.
    - Az elvetett lehetőség az egyetlen rögzített felső korlát volt a lánc kezdetétől. Ez egy hosszú, sokszor szakadozó meccsben a jogos klienst is kizárná.
- **K3:** lejáratkor (`expired`) mindenki „kész” jelzése törlődik, így a gazda `start`-ja nem indíthat egy lejárt kérésre. A táblázat kiegészül a `start` és a `kick` eseménnyel (lent).
- **K4:** az „Új szoba” gomb a győzteshirdetésen csak annak látszik, aki szobát nyithat (ugyanaz a `canCreate`, mint a megtelt-szoba képernyőn). A vendég a „Párbaj” kezdőlapra jut (kód beírása / belépés).

| Állapot | `start` (gazda, nyers) | `kick` (gazda, nyers) |
|---|---|---|
| **R** | `BAD_PHASE` | kivett fél → R (a maradó „Visszavágó”-ja → **L**) |
| **P(X)** | X = vendég (kész) → `countdown` (a gazda indítása = elfogadás); X = gazda → `NOT_ENOUGH_PLAYERS` (Y nem fogadott el) | → **L** |
| **ACC** | `NOT_ENOUGH_PLAYERS` (X nincs kapcsolatban) | → **L** |
| **E(X)** | `NOT_ENOUGH_PLAYERS` (lejáratkor senki sem kész — K3) | → **L** |
| **L** | `NOT_ENOUGH_PLAYERS` | `NOT_IN_ROOM` (nincs kit) |

**Tesztek:** `tests/rt-room-machine.test.ts` tábla-vezérelt blokk (minden cella egy eset: kiinduló állapot + esemény → várt
`rematch.status` / fázis / hiba); nyers Socket.IO-próba a `tests/support/rt-harness.ts`-szel (kérő + kérő `room:ready` → nincs
indulás; egyidejű `room:rematch` → visszaszámlálás); e2e két kontextussal egyszerre nyomva (mindkettő `duel-countdown`), és a
kilépés utáni új belépő `ROOM_STARTED`-ot kap, a maradó a `duel-rematch-gone` + „Új szoba” képernyőt látja.

### JM3b — 3–4 fő, reakciók, kirúgás, értesítések, újracsatlakozás e2e, szóbankos párbaj

**Állapot:** nem kezdődött · **Függ:** JM3a, JM7b · **Modell:** Opus · **Elfogadás:** JM-A5 (teljes), JM-A4 (`on`)
**Lépések:** 3–4 fős elrendezés (ellenfél-chipek, dobogó); reakciósáv (`REACTIONS`, ≤ 1/s) a váróteremben, a felfedésen és az
eredményen; gazda „Kirúgás”; `notice` szövegek (`ROOM_EXPIRING`, `PLAYER_LEFT`, `KICKED`, `RUNS_PRIORITY`); szóbankos
(angol / német / francia) nyelvi párbaj (D23): szerveroldali szóbank-forrás + `RT_SUBJECTS` bővítés, a gépi ellenfélnél is;
e2e: B `context.setOffline(true)` 5 s a 2. körben → visszatér, ugyanazt az állapotot látja; 3 kontextusos meccs; vendégnek a
győzteshirdetésen „Lépj be, hogy a győzelmeid megmaradjanak”. Bevezetés: `PLAYER_ACCOUNTS=on` (ha még nem) → `MP_MODE=on`.

---

### JM4a/b/c — Kvízjátékok online: Matek sprint (a), Szólétra (b), Szökőár (c)

**Állapot (JM4a/b/c):** nem kezdődött · **Függ:** JM3b + J4 (a) / J2 (b) / J1 (c) · **Modell:** Opus (a, c), Sonnet (b)
**Elfogadás:** JM-A9 (kvíz-rész). **Fájlok:** a játék lapja és magja (`P/SpeedQuizMath.tsx` + `L/speedMath/*`; `P/WordLadderHuEn.tsx`
+ `L/wordLadder/*`; `P/TsunamiEscapeEnglish.tsx` + `L/tsunami/*`), `S/realtime/question-provider.ts` (játékonkénti
kérdésforrás: Matek — a `shared/`-be emelt tiszta feladatgenerátor `(seed, grade, band) → kérdés`; Szólétra — a szóbank
`generateVocabQuestion` + seed; Szökőár — évfolyam-bank / szóbank), `T/<játék>-online.spec.ts`.
**Lépések (mindháromban):** állapot-sor commit → a `?szoba=<kód>` belépéskor a lap online módba vált: a director helyett a
`useDuelBridge` adja a kérdést (a megjelenítés a játék saját mechanikája: drón / kapaszkodó / kapu), a pontozás a szerveré,
a HUD-on `LiveStandings` (ellenfelek életereje / fokszáma); a szóló hurok (ellenfelek, kövek, akadályok) seedelten fut, de a
meccs kimenetét csak a szerver-körök döntik (KSZ-19) → a meccs végén `RoomResult`. Matek: a feladatgenerátor kiemelése
`source/shared/speed-math-tasks.ts`-be (a `P/SpeedQuizMath.tsx:592` `generatedTaskForGrade` és a `TEACHER_BANK` `:1319-1330`
tiszta részei; U-JM4-1: van-e DOM-függőség — felderítés: olvasd el a függvényt).
**Tesztek:** két kontextusos spec játékonként (egy meccs, győzteshirdetés), a szóló mód regressziója (`game-win-paths`, mobil mérő).

---

### JM5a–d — 3D játékok azonos seeddel + élő állás-sáv: Kockavadász (a), Aszteroida (b), Brain Rot (c), Tornado (d)

**Állapot:** nem kezdődött · **Függ:** JM3b + J3 / J6 / J5 / J7 (a seedelt mag) · **Modell:** Sonnet · **Elfogadás:** JM-A9 (3D-rész)
**Lépések:** állapot-sor commit → mód `parallel`: a szerver a szoba indításakor `seed`-et küld (`room:state`-ben), mindenki a
saját gépén a saját pályáját játssza ugyanazzal a seeddel (KSZ-3); 1 Hz-es `run:progress {score, stage}`; a szerver
plauzibilitás-plafont alkalmaz (a JM8 `shared/game-score-rules.ts`-ét, ha már kész; addig játékonkénti konstans);
`LiveStandings` a HUD-on; a menet végén a pontszám-sorrend dönt (döntetlen → közös győzelem); `RoomResult`. A kérdéseket a
helyi director adja (seedelt, saját évfolyam) — tudásalapú kör itt nincs, ezért a győzelmi pont a játék saját pontja.
**Tesztek:** két kontextus: azonos seed → azonos első 3 kérdés-kulcs és pálya-hash (probe); állás-sáv frissül; eredmény.

---

### JM6 — Aszinkron kihívás-link (mind a hét játék)

**Állapot:** nem kezdődött · **Függ:** J1–J7 (seedelt magok) · **Modell:** Sonnet · **Elfogadás:** JM-A10
**Fájlok:** `S/routes/challenge.ts` (`POST /api/games/challenge` → aláírt token; állapotmentes, DB nélkül), `GE/play/challenge.ts`,
a hét játéklap eredményképernyője (`extra`: „Kihívom a barátom” gomb → link másolása / megosztás), `T/challenge-token.test.ts`,
`T/challenge-link.spec.ts`.
**Szerződés:** token = base64url(`{v:1, g: gameId, s: seed, gr: grade-sáv, sc: score, cr: correct, t: total, exp}`) + HMAC
(kulcs `HMAC(SESSION_SECRET, "challenge-v1")`), **név és azonosító nélkül**; link `/games/<id>?kihivas=<token>`; a megnyitó
ugyanazzal a seeddel játszik, a végén „A barátod: 1240 pont — te: 1310 pont” összevetés. Lejárat 14 nap; korlát 20 / óra / IP.

---

### JM7a — Admin-jogosultsági mátrix + játékos-fiók alap (e-mailes kód) — `PLAYER_ACCOUNTS` bevezetési flag

**Állapot:** kész — #445 (9bda1373, 2026-11-16), kanban #39; `PLAYER_ACCOUNTS` élesben kikapcsolva · **Függ:** JM0 · **Modell:** Opus · **Elfogadás:** JM-A12 (teljes), JM-A11 (e-mail út)
**Fájlok:** `source/migrations/0040_player_accounts.sql`, `source/shared/schema.ts` (új táblák: `player_accounts`,
`player_auth_codes`), új `S/player/{auth-routes,session,require-player,codes,email-template}.ts`, `S/routes.ts` (bekötés
`/api/player/*`), `S/resend.ts` (új levél-sablon hívása — a meglévő küldő), kliens: `P/PlayerLogin.tsx` (`/belepes`),
`source/client/src/hooks/usePlayer.ts`, `source/client/src/pages/AdminStats.tsx` (kliens-őr pótlása, a `P/admin.tsx:342-351`
mintájára), tesztek: `T/admin-authz-matrix.test.ts`, `T/admin-route-guard.test.ts`, `T/player-codes.test.ts`,
`T/player-auth.db.test.ts` (eldobható DB-vel, a `npm run test:learning-db` harness mintájára — U-JM7-1), `T/player-admin-isolation.spec.ts`.
**Séma (0040, additív, `IF NOT EXISTS`):**
```sql
CREATE TABLE IF NOT EXISTS player_accounts (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  email varchar(254) NOT NULL UNIQUE,              -- kisbetűsítve; más felhasználónak soha nem látszik
  email_verified_at timestamptz,
  nickname varchar(24), nickname_key varchar(32) UNIQUE, avatar_key varchar(32),
  friend_code char(8) UNIQUE,                       -- JM9 használja
  linked_learner_id varchar REFERENCES learners(id) ON DELETE SET NULL,
  google_sub varchar(64) UNIQUE,                    -- JM7b; a Google-profil neve NEM tárolódik
  banned_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), last_seen_at timestamptz
);
CREATE TABLE IF NOT EXISTS player_auth_codes (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  email_normalized varchar(254) NOT NULL,           -- a megerősítendő cím (trim + kisbetű + NFC); ebből lesz a fiók; 1 nap után törlődik
  email_hash char(64) NOT NULL,                     -- HMAC(email_normalized): korlátozáshoz és a kódos kereséshez
  code_hash char(64) NOT NULL,                      -- HMAC(6 jegyű kód)
  link_hash char(64) NOT NULL UNIQUE,               -- HMAC(32 bájtos átlátszatlan link-token); a token nem tartalmaz e-mailt
  attempts integer NOT NULL DEFAULT 0, expires_at timestamptz NOT NULL, used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS player_auth_codes_email_idx ON player_auth_codes (email_hash, created_at);
```
Visszaállás: `PLAYER_ACCOUNTS=off` → a `/api/player/*` 404, a kliens a régi viselkedést mutatja; a táblák maradhatnak.
A Drizzle-séma és a migráció egyezése: a meglévő migrációs ellenőrzés (felderítés: `grep -n "migrat" source/package.json`).
**Lépések:**
1. Állapot-sor commit.
2. **ELSŐKÉNT az őrök** (a regisztráció előtt): `T/admin-route-guard.test.ts` — a szerver-app felépítése DB nélkül nem
   triviális (U-JM7-1), ezért kétlépcsős: (a) statikus router-verem bejárás: egy tesztsegéd (`T/support/route-inventory.ts`)
   az `express()` alkalmazást a `registerRoutes`-szal felépíti e2e-módban (ha a harness engedi), és a `app._router.stack`
   (beleértve a felcsatolt routereket) minden rétegéről kiírja: metódus, útvonal, a köztes függvények neve; az admin
   előtagok (`/api/admin`, `/api/studio`) és az útvonalankénti admin-lista (terv 10.4) minden elemén kötelező az
   `isAuthenticatedAdmin` jelenléte, különben a teszt bukik (d) pont; ha a futásidejű felépítés nem megy, forrásszintű
   tartalék: a `S/**` `app.(get|post|put|patch|delete)\(` és `router.*` regisztrációinak elemzése és a router-szintű
   `use(isAuthenticatedAdmin)` minták felismerése (a felmérés 2026-11-16-i listája a referencia). (b) `T/admin-authz-matrix.test.ts`
   (eldobható DB-vel): a fenti, generált lista × {vendég, e-mail-kódos játékos, Google-os játékos (JM7b után — addig
   munkamenet-szinten szimulált `session.player`), tiltott játékos, nem admin `users`, admin} → csak az admin 2xx (vagy a
   végpont saját validációs 4xx-e), mindenki más 401 / 403.
3. Munkamenet: `req.session.player = { id }` — `S/player/session.ts` `setPlayerSession(req, id)` a `req.session.regenerate`
   mintával (`S/auth.ts:221`), **`req.login` nélkül**; `requirePlayer` (tiltott → 403). Rögzítő teszt: játékos-belépés után a
   `GET /api/auth/user` `null` (nincs `req.user`), és az `isAuthenticatedAdmin` 401.
4. E-mailes kód: `POST /api/player/auth/start {email}` → mindig 202 (nem szivárogtatja ki, létezik-e a fiók); 6 jegyű kód
   (`crypto.randomInt`) + 32 bájtos link-token, HMAC-hash-ként tárolva, kód 10 perc, link 15 perc, egyszer használható;
   korlát: 3 / 15 perc / e-mail-hash, 10 / 15 perc / IP. A start a normalizált címet a kódrekordba írja
   (`email_normalized`) — így a linkes út is ismeri a megerősítendő címet (review #440).
   **Beváltás (egy közös út):** `POST /api/player/auth/verify`, kérés-alak (zod, diszkriminált unió):
   `{ kind: "code", email: string, code: string /* 6 számjegy */ }` vagy `{ kind: "link", linkToken: string /* 43 jel base64url */ }`.
   (1) Rekord-keresés: kódnál az `email_hash = HMAC(normalize(email))` legfrissebb, nem lejárt, nem használt rekordja és
   `code_hash`-egyezés (sikertelen próbálkozás → `attempts + 1`, 5 után érvénytelen); linknél `link_hash = HMAC(linkToken)`.
   (2) Egyszeri felhasználás atomikusan: `UPDATE player_auth_codes SET used_at = now() WHERE id = $1 AND used_at IS NULL AND
   expires_at > now() RETURNING email_normalized` — 0 sor esetén egységes `{ ok: false, code: "INVALID_OR_EXPIRED" }` (400).
   (3) Közös `confirmVerifiedEmail(email_normalized)`: `INSERT INTO player_accounts (email, email_verified_at) VALUES ($1, now())
   ON CONFLICT (email) DO UPDATE SET email_verified_at = COALESCE(player_accounts.email_verified_at, now()) RETURNING id,
   nickname, banned_at` — két párhuzamos megerősítés ugyanarra a címre egy fiókot ad (`UNIQUE(email)` + upsert), és a
   `player_accounts.email NOT NULL` mindig a kódrekord címéből teljesül. (4) Tiltott fiók → 403. (5) `setPlayerSession`.
   Válasz: `{ ok: true, player: { id, nickname: string | null, needsProfile: boolean } }`. Teszt (`T/player-auth.db.test.ts`):
   a kódos és a linkes út ugyanazt a fiókot adja; két párhuzamos `verify` ugyanarra a címre → 1 sor; ugyanaz a link kétszer →
   a második `INVALID_OR_EXPIRED`; lejárt rekord; 5 rossz kód után zár.
   **Link:** `https://websuli.vip/belepes/link#t=<linkToken>` — a token a URL-töredékben (fragment) van, így szerver- és
   proxy-naplóba sem kerül; az e-mail-cím soha nincs az URL-ben. A megerősítő oldal a töredékből kiolvassa és POST-tal
   váltja be (a levelező linkellenőrzője így nem használja el);
   `Referrer-Policy: no-referrer`, `Cache-Control: no-store`. CSRF: a `/api/player/auth/*` origin-allowlistes kivétel (a
   meglévő `/api/login` mintájára, `S/routes.ts:789-818`), a többi `/api/player/*` CSRF-tokenes.
5. Napló: e-mail soha (csak `maskEmail` vagy hash); a levél tárgya / szövege magyar, gyerekbarát.
6. Kliens: `/belepes` (e-mail → kód beírása; a linkről érkezve megerősítés), `usePlayer()` (`GET /api/player/me`); a
   játéklista „Belépés” gombja csak `PLAYER_ACCOUNTS` mellett látszik (`GET /api/player/status`).
7. Kliens admin-őr: az `AdminStats.tsx` a `admin.tsx:342-351` mintájára (nem admin → átirányítás, lekérdezés `enabled:
   !!user?.isAdmin`); `T/player-admin-isolation.spec.ts`: friss játékos-munkamenettel a `/admin`, `/admin/stats`,
   `/admin/help` közvetlen URL-je a `/`-ra irányít, és a hálózati naplóban nincs `/api/admin*` / `/api/studio*` 2xx.
**Bevezetés:** merge `PLAYER_ACCOUNTS=off`-fal → a JM7b után együtt kapcsolja be az orkesztrátor (D11: ellenőrzés után élesben `on`).
**UNKNOWN:** U-JM7-1: a szerver-app tesztben felépíthető-e (a `registerRoutes` DB- és env-igénye) — felderítés: a
`source/scripts/run-learning-db-tests.ts` és a `T/*.db.test.ts` minták megnyitása; ha nem, a mátrix-teszt az e2e-harness
(`npm run test:e2e`) alatt fut egy `request`-kontextussal.

### JM7b — Játékos Google-út, becenév + avatar, tanulói profil összekapcsolása, fiókoldal, adatletöltés / törlés, admin-tiltás

**Állapot:** kész — #449 (50605100, 2026-11-16), kanban #43; `PLAYER_ACCOUNTS` élesben kikapcsolva · **Függ:** JM7a · **Modell:** Opus · **Elfogadás:** JM-A11, JM-A12 (Google-ág), JM-A15
**Fájlok:** `S/player/google.ts`, `S/auth.ts` (csak a callback elágazás — lásd lent), `S/player/account-routes.ts`,
`S/routes.ts` (admin „Játékosok” végpontok az `adminRouter` alatt → az `isAuthenticatedAdmin` automatikusan véd),
`source/shared/nicknames.ts` (szűrő), kliens: `P/PlayerAccount.tsx` (a `/profile` utódja; a régi `Profile.tsx` helyi adatai
vendégnél maradnak), `P/admin.tsx` (új fül „Játékosok”: lista becenévvel, tiltás / feloldás), tesztek:
`T/player-google-flow.test.ts`, `T/nickname-filter.test.ts`, `T/player-account.db.test.ts`, `T/player-account.spec.ts`.
**Játékos Google-út (külön, deny by default):** `GET /auth/player/google` beállítja `req.session.oauthFlow = "player"`, és
egy **külön nevű** Passport-stratégiát indít (`"google-player"`, ugyanazzal a kliens-azonosítóval és **ugyanazzal a
callback URL-lel** — így a Google-konzolban nincs teendő); a meglévő `/auth/google/callback` kezelő az
`oauthFlow === "player"` ágon a `"google-player"` stratégiát hívja, amely a `verify`-ban NEM hív `upsertUser`-t, hanem a
Google-profil megerősített e-mailjével (`emails[0].verified` — ha hamis: elutasítás) `player_accounts` sort keres / hoz
létre (`google_sub`), és `setPlayerSession`-t hív `req.login` nélkül; a `session.oauthFlow` a callbackben törlődik.
Rögzítő teszt: az `ADMIN_EMAIL`-lel egyező e-mail a játékos-úton is csak játékos-munkamenetet kap (`GET /api/auth/user`
null, admin-végpont 401). U-JM7b-1: a meglévő Google-stratégia callback-regisztrációjának pontos helye — felderítés:
`sed -n 94,170p S/auth.ts`.
**Fiók:** becenév-választás az első belépéskor (szabad, `nicknameProblems` szűrő, ütközésnél `#1234`), avatar 24 előre
gyártott SVG-ből (a design-asset bank mintájára; fotófeltöltés nincs); `POST /api/player/link-learner` (az eszközön tárolt
`websuli.learnerToken`-t fejlécben küldi, a szerver `resolveLearner`-rel ellenőrzi, `S/learners.ts:83`); `GET
/api/player/export` (JSON: fiók + pontkönyv, e-mail csak a saját exportban); `DELETE /api/player/account` (kaszkád;
megerősítő párbeszéd a kliensen); tiltás: admin „Játékosok” fül → `banned_at`.
**Rögzítve a független biztonsági review (#449) után:** (1) közös callback URL marad (Google-konzolban nincs teendő), de a
folyamat fajtáját a `state` dönti el (`p.` előtag + a munkamenetben state-enként tárolt PKCE-rekord; egyetlen, felülírható
munkamenet-jelző nincs) — egy párhuzamos játékos-folyamat az admin-belépést nem hiúsítja meg; (2) a becenév ENGEDÉLYLISTÁS
(ASCII betű / számjegy, magyar ékezetes betűk, szóköz, `_`, `-`), a JM1 `nicknameProblems` erre delegál; (3) a tanulói
összekapcsolás friss belépést és a fiók becenevét megnevező megerősítést kér, a tokenrotáció bontja, admin is bonthatja;
**a játékos-felületre tanulói adat (név, évfolyam, eredmény) ebben a szeletben NEM kerül — ha egy későbbi szelet hozna,
új független biztonsági review kell**; (4) az export engedélylistás, belső azonosító nélkül; (5) a fióktörlés a fiók címére
küldött egyszeri, célhoz kötött kódot kér, és értesítő levél megy róla.

### JM7b-utójavítás (N1, N3) — a független biztonsági újraellenőrzés két lelete

**Állapot:** kész — #461 (13160155, 2026-11-16), kanban #56 · **Függ:** JM7b · **Modell:** Opus · **Elfogadás:** JM-A11 (becenév-szűrő), JM-A15 (törlés)
**Cél:** (N1, KÖZEPES) a foglalt-név és a trágárság-szűrő ne legyen kijátszható a kis L / nagy I / `1` felcserélésével
(`ADMlN`, `WEBSULl`, `GECl`, `BUZl`, `PlCSA`, `NlGGER` ma átmegy); (N3, ALACSONY) idegen ne akaszthassa meg 24 órára a
fióktörlést a cím közös hibás-próba plafonjának (és levélkeretének) kimerítésével. **Nem cél:** N2 (tiltott játékos
adatai — tulajdonosi döntés), séma / migráció, `PLAYER_ACCOUNTS` flag (KI marad), `S/auth.ts` és a Google-út (JM7c-1),
`shared/duel/*`, `S/realtime/*` (JM3a), `rn ~ m` / `vv ~ w` hasonmások (külön döntés).
**Fájlok:** `source/shared/player-nickname.ts`, `S/player/store.ts`, `S/player/codes.ts`, `S/player/account-routes.ts`,
`S/player/auth-routes.ts`, tesztek: `T/nickname-filter.test.ts`, `T/player-account-db.integration.ts`.
**Lépések:**
1. N1 — EGY közös összetéveszthetőség-normalizálás (`confusableFold`: ékezet le, kisbetű, `0→o`, `1 / l / I / | / ! → i`);
   erre épül a foglaltsági kulcs (`nicknameKey`) ÉS a tartalomszűrő alakja (`foldNickname`, + a többi leet-csere). A
   tiltott / foglalt tövek és a kivétel-szavak ugyanígy normalizálva hasonlítódnak össze, így a becenév MINDEN l↔I↔1
   olvasata egyszerre vizsgált (a két normalizálás nem térhet el újra). Az ismétlés-összevonás csak az eredetileg dupla
   betű nélküli tövekre (a „segg” / „root” / „staff” szabály változatlan). Az e-mail-szolgáltató-lista is ezen az alakon.
   Hamis tiltás ellen: gyakori ártatlan nevek ellenpróbája; ha egy név csak az egyik olvasatban ütközik, a tő a
   kivétellistára kerül (a meglévő `ROOT_EXCEPTIONS` / `RESERVED_EXCEPTIONS` mintájára). A szerver (`account-routes.ts`)
   és a valós idejű jegy (`S/routes/rt.ts` → `shared/nicknames.ts`) ugyanezt a `checkPlayerNickname`-et hívja.
   A már eltárolt becenevekre migráció nem kell: a flag KI, éles játékos-adat nincs (a jegy-újraellenőrzés amúgy is a
   friss szabállyal fut).
2. N3 — a törlési kód beváltása SAJÁT napi hibás-próba plafont kap (csak a törlési céltartomány rekordjai), a zár közös
   marad; a belépés plafonja továbbra is MINDKÉT cél hibáit számolja (a törlési próbák nem nyitnak többlet-próbát). A
   törlési kódkérés saját címenkénti levélkeretet kap (`limit-delete:` korlát-kulcs, a globális plafon közös), a belépő
   kódkérés keretébe viszont továbbra is beszámít. A belépés nyers erő elleni védelme (8 jegy, rekordonként 5, címenként
   napi 10) nem változik.
**Tesztek:** `nickname-filter.test.ts`: a próba hat neve elutasítva; tulajdonság-teszt: MINDEN tiltott és foglalt tő
minden l / I / 1 / i cseréje (kis- és nagybetűvel) elutasítva; ellenpróba: Lili, Lilla, Ildikó, Bálint, Vili, Milán,
Illés, Olivér, Emil, Kitti, Niki + a meglévő engedett nevek. `player-account-db.integration.ts`: idegen kimeríti a
belépési hibás-próba plafont ÉS a belépő levélkeretet → a tulajdonos élő munkamenetből kér és bevált törlési kódot;
fordítva: a törlési hibák után a belépésnek nem marad több próbája a közös 10-nél.
**Parancsok:** `node --import tsx --test tests/nickname-filter.test.ts`, `npm run test:learning-db`,
`node --import tsx --test tests/admin-route-guard.test.ts`, `npm run lint`, `npm run check`, `npm run check:test`.
**Elfogadás:** a hat név és a generált változatok elutasítva, az ellenpróbák elfogadva; az N3 két DB-esete zöld; a
meglévő tesztek változatlanul zöldek; nincs séma-változás.

#### JM7b-utójavítás N1b — a becenév-szűrő maradék kijátszásai (review #461/#463, A1–A4)

**Állapot:** kész — #469 (1db45c5f, 2026-11-16), kanban #56; maradék (3 számjegynél több kevert olvasat, belső `slice(0, 64)`) a #471-be kerül · **Függ:** N1 (#461) · **Modell:** Opus · **Elfogadás:** JM-A11
**Cél:** a review szondájának (`nick-probe2.mts`) 28 még átmenő kísérlete is elbukjon — az `MP_MODE` / ranglista bekapcsolása
ELŐTT kötelező. **Nem cél:** a foglaltsági kulcs (`nicknameKey`) változtatása (a tárolt nevek kulcsa stabil marad); séma;
más fájl. **Fájlok:** `source/shared/player-nickname.ts`, `T/nickname-filter.test.ts`.
**Lépések:**
1. Futam-tűrő illesztés: minden tő a normalizált alakjából regexszé fordul; futamonként `c+`, de ahol az EREDETI tőben dupla
   betű áll, `c{n,}` (n az eredeti futam hossza) — „nigger” → `…g{2,}…` (a NIGGGER bukik), „segg” → `s+e+g{2,}` (a „Segítő”
   továbbra is átmegy), „websuli” → `…i+` (az l/i összevonásból eredő `ii` nem dupla). A kivétel-szavak előbb kiszedve. A
   bemenet ≤ 64 karakter, a minták horgony nélküli, egymásba nem ágyazott kvantorok → nincs katasztrofális visszalépés.
2. A szűrő-alakban (CSAK `foldNickname`, a kulcsban nem): `2 → z`, `6 → g`, `9 → g`.
3. Második szűrő-olvasat (a kulcsban nem): az ékezet nélküli, kisbetűs alakon `rn → m`, `vv → w`, `cl → d`, utána ugyanaz a
   normalizálás; a név akkor tiltott, ha BÁRMELY olvasata az.
4. Szólista: `kurwa`, `curva`, `phasz`, `phuck`, `biatch`, `fuk` (kivétellel, ha ártatlan szóban áll); a foglalt SZAVAK
   (`mod`, `mods`, `gm`, `dev`, + `modi`) a teljes leet-normalizált szavakon ÉS az elválasztók nélküli teljes néven is
   (`D3V`, `M o d`, `G M`).
**Tesztek:** a szonda MIND a 111 kísérlete elutasítva (a 28-at tételesen); a 273 ártatlan névből nincs új bukás (a 4
szándékos foglalt tő marad); ellenpróba a többkarakteres olvasatokra (Kornél, Bernát, Ernő, Arnold, Clara, Miklós, Marci,
Ervin, Vivien, Kata2012); a `nicknameKey` egy rögzített mintakészleten bitre azonos a korábbival.
**Elfogadás:** a fenti tesztek zöldek; a meglévők változatlanul; nincs séma-változás.

### JM7b-utójavítás – N2 — tiltott játékos saját adatai + admin végleges törlés

**Állapot:** kész — #463 (d2c4c7d0, 2026-11-16), kanban #56 · **Függ:** JM7b · **Modell:** Opus · **Elfogadás:** JM-A15 (tiltott fiókra is), admin-jogosultsági mátrix
**Tulajdonosi döntés (2026-11-16, űrlap):** „Admin törölhesse + saját törlés” — (a) a TILTOTT játékos is letöltheti a saját
adatait és törölheti a fiókját (minden más — játék, becenév / avatar, tanulói kapcsolat, szoba, pont — tiltva marad);
(b) az admin „Játékosok” oldalon VÉGLEGES törlés megerősítéssel.
**Nem cél:** a `requirePlayer` általános lazítása; séma / migráció; a Google-út (`S/player/google.ts`, `S/auth.ts` — JM7c-1)
— a tiltott játékos az e-mail-kódos / linkes úton jut a korlátozott munkamenethez (minden fióknak van címe); levél az
admin-törlésről (a meglévő viselkedésben nincs ilyen); `PLAYER_ACCOUNTS` (KI marad).
**Fájlok:** `S/player/require-player.ts` (új, szűk `createRequireOwnData` őr, saját jelölővel), `S/player/account-routes.ts`
(az őr CSAK az export / törlési kód / törlés végponton), `S/player/auth-routes.ts` (tiltott fiók beváltáskor korlátozott
munkamenetet kap, a válasz továbbra is 403 `BANNED`), `S/player/admin-routes.ts` (`POST /:id/delete` megerősítő szóval),
kliens: `client/src/hooks/usePlayer.ts`, `P/PlayerAccount.tsx` (tiltott nézet: letöltés + törlés), `P/PlayerLogin.tsx`,
a „Játékosok” panel (törlés gomb + megerősítő párbeszéd); tesztek: `T/admin-route-guard.test.ts`,
`T/player-account-db.integration.ts`, `T/player-auth-db.integration.ts` (a tiltott-belépés elvárása: SPEC-VÁLTOZÁS), e2e.
**Lépések:**
1. Őr: `createRequireOwnData(store)` — munkamenet kell (401), a fióknak léteznie kell (401), a tiltott IS átmegy;
   `OWN_DATA_GUARD` jelölő. A `requirePlayer` változatlan (tiltott → 403) minden más végponton; a JM2-jegy (`rt.ts`) a
   tiltottat továbbra is elutasítja.
2. Az export, a törlési kód kérése és a törlés az új őr mögött, a meglévő védelmekkel (CSRF, Origin, korlátok, e-mailben
   küldött célhoz kötött kód, megerősítő szó, értesítő levél).
3. Beváltás (kód / link): tiltott fióknál a munkamenet létrejön (a `requirePlayer` minden kérésnél az adatbázisból nézi a
   tiltást, így ez csak az őr három végpontját nyitja), a válasz 403 `BANNED` + `restricted: true`.
4. Admin: `POST /api/admin/game-accounts/:id/delete` `{ confirm: "TÖRLÉS" }` → UGYANAZ a `deleteAccount` (fiók, mindkét cél
   kódrekordjai, minden munkamenet; a tanulói profil marad), napló maszkolt címmel. Az `isAuthenticatedAdmin` adminRouter
   alatt (JM7c-1 közös admin-függvényével később összefésülendő).
5. Kliens: a `/me` 403 `BANNED` → tiltott állapot; `/fiok` tiltott nézete csak a letöltést és a törlést kínálja; a
   „Játékosok” panelen törlés gomb megerősítő párbeszéddel.
**Tesztek:** forrás-őr (route-leltár): az `OWN_DATA_GUARD` PONTOSAN a három végponton, minden más `/api/player/*` a
`requirePlayer` mögött; DB: tiltott → export 200, törlés (kód) 200, minden más fiók-végpont 403, JM2-jegy 403; admin-törlés
200 és hatása; játékos / tiltott / vendég az admin-törlést nem éri el (401), mellékhatás nélkül; e2e: admin törlés gomb
megerősítéssel.
**Elfogadás:** a fenti tesztek zöldek, a meglévők változatlanul (a tiltott-belépés elvárása dokumentált SPEC-VÁLTOZÁS-sal);
nincs séma-változás.

#### JM7b-utójavítás K1 — a tiltás megőrzése a fiók törlése után (tiltás-ujjlenyomat)

**Állapot:** folyamatban — 2026-11-16, ág feat/jatek-fiok-tiltas-megorzes, munkafa .claude/worktrees/jatek-k1, kanban #56 · **Függ:** N2 (#463) · **Modell:** Opus · **Elfogadás:** JM-A15, admin-jogosultsági mátrix
**Tulajdonosi döntés (2026-11-16, űrlap):** „Tiltás megőrzése ujjlenyomattal”. **Lelet** (review #461/#463, K1, KÖZEPES): a
tiltott játékos törli a fiókját, majd ugyanazzal a címmel újra belép → új, tiltás nélküli fiók (admin-törlés után ugyanez).
**Nem cél:** a teljes cím megőrzése; a `users.is_banned` alapú tiltás (az a címre szól, eddig is túlélte); a Google-út
(`S/player/google.ts`, `S/auth.ts`) módosítása; saját admin-ellenőrzés (a meglévő `/api/admin` őr — a #462 `isAdminUser`-e
alá is automatikusan kerül); a `PLAYER_ACCOUNTS` (KI marad).
**Fájlok:** `source/migrations/0041_player_ban_fingerprints.sql` (új), `source/shared/schema.ts` (új tábla),
`S/player/codes.ts` (`banFingerprint`), `S/player/account-store.ts` (`deleteAccount`, `upsertGooglePlayer`, `setBanned`,
törölt-tiltott lista / feloldás), `S/player/store.ts` (`confirmVerifiedEmail`), `S/player/admin-routes.ts`, kliens:
a „Játékosok” panel és a fiókoldal törlési szövege; tesztek: `T/player-account-db.integration.ts`, `T/player-codes.test.ts`
(migráció ↔ séma), `T/admin-route-guard.test.ts`, `T/admin-authz-matrix-db.integration.ts`.
**Lépések:**
1. Migráció (csak hozzáadó, idempotens, a flagtől függetlenül fut élesben, magában ártalmatlan):
   `CREATE TABLE IF NOT EXISTS player_ban_fingerprints (fingerprint varchar(64) PRIMARY KEY, banned_at timestamptz NOT NULL,
   created_at timestamptz NOT NULL DEFAULT now())`. **Visszaállás:** `DROP TABLE IF EXISTS player_ban_fingerprints;` (a kód
   üres / hiányzó tábla mellett hibára futna, ezért a visszaállás a kód visszavonásával együtt). `db:push` TILOS.
2. Ujjlenyomat: `HMAC-SHA256(playerAuthKey(), "ban:" + limitKey(cím))` (a kód- és korlát-hash mintája; a `limitKey`
   kanonizál: kisbetű, gmail-pont és `+alias` összevonva) — visszafejthetetlen, a teljes cím nem marad meg. **A
   `SESSION_SECRET` rotációja** után a régi ujjlenyomatok nem egyeznek: a törölt-tiltott címek tiltása elvész (ugyanígy
   érvénytelenednek a belépőkódok és a tanulói linkek); a bejegyzések az adminfelületen továbbra is láthatók és törölhetők.
3. `deleteAccount` (saját és admin-törlés közös függvénye): ha a fiók tiltott (`banned_at`), ugyanabban a tranzakcióban
   `INSERT … ON CONFLICT DO NOTHING` az ujjlenyomattal és a tiltás idejével. Nem tiltott fiók törlése nem hagy nyomot.
4. Új fiók (`confirmVerifiedEmail` — kód / link; `upsertGooglePlayer` — Google): az `INSERT` a `banned_at`-et az
   ujjlenyomat-táblából veszi (csak az ÚJ sorra hat) → a fiók tiltottként jön létre, a belépés a #463 szerinti korlátozott
   munkamenetet adja (403 `BANNED`).
   **Sorosítás (#471 review):** a törlés és MINDEN létrehozási út közös, címenkénti tranzakciós advisory-zárat vesz az
   ujjlenyomatra (előbb a zár, utána sorzár / INSERT); a létrehozás az ujjlenyomatot a zár UTÁN, friss pillanatképből olvassa,
   így egy párhuzamos tiltott-törlés mellett sem jöhet létre tiltatlan fiók.
5. Feloldás: `setBanned(id, false)` az ujjlenyomatot is törli. A törölt-tiltott bejegyzés feloldása (#471 review) ugyanabban
   a tranzakcióban az AZONOS ujjlenyomatú élő fiókok (a törlés után tiltottként újra létrejött, bármely cím-változatú fiók)
   tiltását is feloldja. Az ujjlenyomat az újralétrehozáskor szándékosan NEM „költözik át” (nem törlődik): különben egy MÁSIK
   cím-változattal ismét tiltatlan fiók nyílhatna. Admin: `GET /api/admin/game-accounts/deleted-bans`
   (bejegyzés: rövid hivatkozás az ujjlenyomat elejéből + a tiltás és a törlés ideje — cím és maszk NÉLKÜL, mert a maszk
   is részleges azonosító) és `POST /api/admin/game-accounts/deleted-bans/:ref/unban` — a meglévő `/api/admin` őr alatt.
6. Szöveg: a fiókoldal törlési párbeszéde és az export egy mondatban jelzi, hogy tiltott fiók törlése után a cím
   visszafejthetetlen ujjlenyomata megmarad, amíg az admin fel nem oldja.
7. **K1-b (review #469/#471, KÖZEPES): a tiltás a KANONIKUS címre szól.** (K1b óta az „A + B” terv szerint — lásd a 10.
   táblázatot.) `setBanned(true)` a kanonikus címzár alatt MINDEN azonos postafiókú (gmail-pont, `+alias`, googlemail) élő fiókot
   tilt (`banned_at`); `setBanned(false)` és a törölt-tiltott feloldás ugyanígy old fel. Új fiók létrehozásakor egy azonos
   postafiókú TILTOTT élő fiók (közvetlen összevetés), vagy egy törölt tiltott fiók ujjlenyomata tiltást jelent; a meglévő
   (alias-)fiók belépéskor csak a tiltott élő változattól örököl. Élő tiltáskor ujjlenyomat NEM keletkezik. A „törölt, de tiltva
   maradt” listán csak az élő fiók nélküli ujjlenyomatok látszanak. A felület kimondja: a feloldás az azonos postafiókú, más okból
   tiltott élő fiókot is feloldja (tájékoztató lelet).
   **Kódkérési korlát:** a kulcsa a kanonikus cím (`limitHash` → `limitKey`) — alias-címekkel nem sokszorozható (teszt).
   **Kanonikus EGYEDISÉG (javaslat, NEM ebben a szeletben):** ma egy Gmail-postafiókhoz alias-címekkel több játékos-fiók
   nyitható (ranglista-duplikálás). Megoldás: új oszlop `email_canonical_hash char(64)` egyedi indexszel (új migráció a meglévő
   táblán + feltöltés) — tulajdonosi döntés és külön szelet; a tiltás szempontjából a fenti kanonikus tiltás már zárja a rést.
8. **K1-c: megőrzési idő — tulajdonosi döntés (2026-11-16): 12 hónap.** `PLAYER_BAN_RETENTION_MONTHS` (alap 12, 1–120), a
   tiltástól számítva. A takarító (`sweeper.ts`; csak élesben / `PLAYER_BAN_MAINTENANCE=on`) a 12 hónapnál régebbi ujjlenyomatot
   törli — bármely kulcsút, élő-változat vizsgálat nélkül, mert az ujjlenyomat csak TÖRÖLT fiókhoz tartozik (B); az ÉLŐ fiók
   tiltása a `banned_at`-ben él, és nem jár le. A fiókoldal, az export és az admin-panel szövege megnevezi.
9. **Kulcs és kulcsváltás (K1b).** A törölt fiókok ujjlenyomatának kulcsa a külön `PLAYER_BAN_KEY` (visszaesés a `SESSION_SECRET`-ből
   levezetettre + induláskori tájékoztató napló), így a munkamenet-titok rotációja nem érinti, ha be van állítva. Kulcsváltáskor
   (a `PLAYER_BAN_KEY` beállítása vagy cseréje, ill. beállítatlan kulcsnál a `SESSION_SECRET` rotációja) a régi kulcsú sorok nem
   illenek — semmi nem törli őket kulcs alapján (a takarító csak megszámolja és `warn`-nal naplózza), a 12 hónapos megőrzés
   távolítja el őket. **Kulcs-VISSZAVÁLTÁS** (a régi kulcs visszaállítása) után a régi kulcsú törölt-tiltott sorok ÚJRA
   érvényesek — szándékos (a tiltás nem vész el végleg egy átmeneti kulcsváltással). A feloldás az azonos tiltásidejű, más kulccsal
   készült sort is törli, így egy feloldott tiltás visszaváltáskor sem tér vissza. Az élő fiókok tiltása kulcstól független.
   Üzemeltetés: `docs/jatek-fiok-uzemeltetes.md` (a `PLAYER_BAN_KEY` beállításának szabályai), `docs/security-secret-hygiene-2026-09-13.md`.
10. **A tiltás állapotgépe — K1b („A + B” terv, #475 review után; a korábbi, ujjlenyomat-alapú élő tiltás helyett).**
   (A) ÉLŐ tiltott fiók: az egyetlen igazságforrás a `player_accounts.banned_at`; az alias-védelem a kanonikus cím (`limitKey`)
   KÖZVETLEN összevetése a tiltott élő fiókokkal. (B) TÖRÖLT tiltott fiók: csak itt van ujjlenyomat (`player_ban_fingerprints`,
   `PLAYER_BAN_KEY`-jel, visszaesés a `SESSION_SECRET`-ből levezetettre). Zár = `lockBanCanonical`: tranzakciós advisory-zár a
   kanonikus cím SIMA (titok nélküli) SHA-256-jára — kulcsfüggetlen, így eltérő titkú példányok is ugyanazt a zárat kapják;
   minden más zár / sorzár / INSERT ELŐTT.

   | Művelet | Olvas | Ír | Zár | Egy tranzakció |
   |---|---|---|---|---|
   | Tiltás (`setBanned(true)`) | az azonos kanonikus című élő fiókok | `banned_at = COALESCE(banned_at, now())` mindegyiken | kanonikus | igen |
   | Feloldás élő fiókon (`setBanned(false)`) | a tiltott élő változatok; a cím (B) ujjlenyomata | változatok `banned_at = NULL`; a (B) sor és az azonos tiltásidejű más kulcsú sor törlése | kanonikus | igen |
   | Feloldás törölt-tiltotton (`unbanDeleted`) | a sor; a hozzá tartozó (újra létrejött) élő fiók — a törlés UTÁN újra | a sor törlése (sorzár); ha van élő fiók: mint a feloldás élőn; a törlés után megtalált, közben létrejött fiók feloldása | kanonikus (ha előre van élő fiók); különben a (B) sor sorzára (a létrehozás `FOR SHARE`-rel olvassa) | igen |
   | Saját és admin-törlés (`deleteAccount`) | a fiók címe, `banned_at` (a zár UTÁN, `FOR UPDATE`) | (B) sor, ha tiltott (a tiltás ideje SQL-ben); kódok, munkamenetek, fiók | kanonikus (a sorzár ELŐTT) | igen |
   | Létrehozás / belépés kód, link (`confirmVerifiedEmail`) | tiltott élő változat (A); a cím (B) ujjlenyomata `FOR SHARE`-rel | új fiók: `banned_at` (A) vagy (B) alapján; meglévő: csak (A) | kanonikus + a (B) sor osztott sorzára | igen |
   | Google, új azonosító (`upsertGooglePlayer`) | ugyanaz | ugyanaz | kanonikus | igen |
   | Google, ismert azonosító | a fiók `banned_at`-je | — | kanonikus (csak olvasás a friss állapotért) | igen |
   | Eltérő kulcsú sorok számlálása (takarító) | `count(*) … key_id <> aktuális` | — (SEMMIT nem töröl) | nem kell (csak olvas) | — |
   | Megőrzés-takarítás (takarító) | — | a 12 hónapnál régebbi (B) sorok törlése (bármely kulcs) | nem kell (élő tiltást nem érinthet) | egy utasítás |
   | `getPlayer` / `requirePlayer`, törölt-tiltott lista | `banned_at` / (B) sorok | — | nem kell (csak olvas) | — |

   **Páronkénti ellenőrzés:** minden író a kanonikus címzárat veszi, és a döntéshez szükséges állapotot a zár UTÁN olvassa →
   tiltás ↔ létrehozás, feloldás ↔ létrehozás, törlés ↔ létrehozás, tiltás ↔ feloldás, feloldás-törölt ↔ létrehozás (élő fiókkal),
   Google ismert ↔ feloldás sorosított — eltérő titkú példányok között is (a zár-kulcs titokfüggetlen). Írást nem végző lépés
   (számlálás, `getPlayer`) zár nélkül is helyes. A megőrzés-takarítás ↔ létrehozás: a takarító csak LEJÁRT (B) sort töröl; ha a
   létrehozás még látta, a fiók tiltottként jön létre (konzervatív), ha már nem, a tiltás a döntés szerint lejárt — mindkettő
   megengedett. A feloldás-törölt élő fiók NÉLKÜL ↔ párhuzamos létrehozás (#475 ellenőrző kör, Ú-a): a kanonikus cím nem ismert,
   ezért a (B) sor sorzára sorosít — a létrehozás `FOR SHARE`-rel olvassa, a feloldás sorzáras DELETE-tel törli: ha a létrehozás
   olvasott előbb, a feloldás megvárja a commitját, és a törlés UTÁN (új pillanatképpel) megtalálja és feloldja a fiókot; ha a
   feloldás járt előbb, a létrehozás a commitjáig vár, és már nem látja a sort. A végállapotban nincs tiltott fiók és nincs sor
   (teszt: mindkét sorrend + 25 párhuzamos kör). A közben megtalált fiók feloldása a kanonikus zár nélkül történik (holtpont ellen;
   a fiók már commitolt).
   **Megszűnt** (az ujjlenyomat-alapú élő tiltással együtt): a tiltáskori ujjlenyomat, a helyreállítás / rotáció-egyeztetés, az
   önjavító belépési ágak és a kulcsfüggő ujjlenyomat-zár — ezzel a „helyreállítás ↔ feloldás”, a „két kulcs két zárja” és a
   „feloldás után visszatérő tiltás” leletosztály.
   **Teszt:** minden író megvárja a tartott kanonikus címzárat (párhuzamos DB-teszt műveletenként, az alias-létrehozással együtt),
   eltérő titkú példány ugyanazt a zárat kapja, Google ismert ↔ feloldás, törlés ↔ létrehozás mindkét sorrendben + 25 ismétlés.
**Tesztek:** DB — tiltott saját törlés → ugyanaz a cím (kis- / nagybetű, gmail-pont, `+alias`) újra tiltott; admin-törlés
után ugyanez (Google-úton is); feloldás (élő fióknál és a törölt bejegyzésnél) után rendes fiók; nem tiltott törlés nem hagy
ujjlenyomatot; idegen cím érintetlen; a lista nem ad ki címet; a mátrix és az `admin-route-guard` új sorai; migráció ↔ séma
egyezés, additív / idempotens migráció.
**Elfogadás:** a fenti tesztek zöldek; a meglévők változatlanul; egyetlen új tábla, más séma-változás nincs.

#### JM7b-utójavítás K1b — kulcsrotáció és karbantartás: nincs visszafordíthatatlan törlés (ellenőrző kör #471, Ú1–Ú4)

**Állapot:** folyamatban — 2026-11-16, ág fix/jatek-fiok-tiltas-kulcsrotacio, munkafa .claude/worktrees/jatek-k1b, kanban #56 · **Függ:** K1 (#471) · **Modell:** Opus
**Cél:** (Ú1, ALACSONY, de visszafordíthatatlan) egy eltérő titkú szerverpéldány (helyi fejlesztés az éles adatbázissal, előnézet,
átfedő régi példány) ne törölhesse a más kulcsú tiltás-ujjlenyomatokat; (Ú2) a rotáció után, az első egyeztetés előtt létrejött
alias-fiók is tiltott legyen; (Ú3) pontos napló, egymástól független karbantartó lépések; (Ú4) az állapotgép-táblázat a kódhoz
igazítva; üzemeltetési runbook. **Nem cél:** séma / migráció; a `PLAYER_ACCOUNTS` (KI marad); a kódrekord-takarítás szabálya.
**Fájlok:** `S/player/account-store.ts`, `S/player/store.ts`, `S/player/codes.ts` (`playerBanKey`), `S/player/sweeper.ts`,
`S/index.ts` (a takarító bekötése, tájékoztató napló), `docs/jatek-fiok-uzemeltetes.md` (új), `docs/specs/2026-11-16-jatekok-jatekelmeny.md`
(10.4: a döntés), ez a fejezet (K1 10. táblázat), tesztek: `T/player-account-db.integration.ts`, `T/player-codes.test.ts`.
**Átdolgozás (#475 review, 2026-11-16) — „A + B” terv.** Az első változat (az ujjlenyomat-alapú élő tiltás javítgatása) után
ugyanabból a gyökérből újabb leletek jöttek (a #471-en 4, a #475-ön Codex + Sourcery 1–3): az ÉLŐ tiltás kulcsolt ujjlenyomaton
múlt, így a kulcsváltás, a több kulcs együttélése, a helyreállítás és a feloldás versenyzett. Ezért a két eset szétválik:
(A) ÉLŐ tiltott fiók — az egyetlen igazságforrás a `banned_at`; az alias-védelem a kanonikus cím közvetlen összevetése a tiltott
élő fiókokkal (az alkalmazásban kanonizálva; mérve 10 000 fiók / 100 tiltott mellett: létrehozás ~10 ms, tiltás ~18 ms).
(B) TÖRÖLT tiltott fiók — csak itt ujjlenyomat, a törléskor; a kulcs `PLAYER_BAN_KEY` (visszaesés a `SESSION_SECRET`-ből
levezetettre + induláskori tájékoztató napló); semmi nem töröl kulcs alapján, a 12 hónapos takarító törli. A zár a kanonikus cím
titok nélküli SHA-256-jára szól (kulcsfüggetlen). Séma nem változik.
**Lépések:**
1. Ú1: kulcs alapján SEMMI nem törlődik — a takarító csak megszámolja a más kulcsú (B) sorokat és naplózza; a 12 hónapos
   megőrzés-takarító távolítja el őket. A tiltás-karbantartás (számlálás + megőrzés) CSAK `NODE_ENV=production` vagy
   `PLAYER_BAN_MAINTENANCE=on` mellett fut — helyi indítás nem nyúl hozzá. A kódrekord-takarítás (lejárt → cím törölve, 24 óra után
   a sor) marad: ugyanaz a szabály, mint élesben, a szabályon túl nem töröl (felmérve: `sweeper.ts` + `store.purgeOldCodes`).
2. Ú2: az alias az élő tiltott fiók mellett a LÉTREHOZÁSKOR azonnal tiltott (A) — nincs egyeztetés, nincs indulási ablak.
3. Ú3: a takarító három lépése (kódok, számlálás, megőrzés) külön `try`; a napló „régi kulcsú … megőrizve”.
4. Ú4: a K1 10. táblázat újraírva az új tervre.
5. Runbook (`docs/jatek-fiok-uzemeltetes.md`): figyelendő naplósorok, csak olvasó ellenőrző lekérdezés, `PLAYER_BAN_KEY`.
**Tesztek:** a meglévő alias-, verseny-, törlés- és megőrzési tesztek elvárásai maradnak; ahol a helyreállítás / tiltáskori
ujjlenyomat elvárása értelmét vesztette, `// SPEC-VÁLTOZÁS` megjegyzéssel arra írva át, amit az új terv garantál (rotáció után az
élő tiltott fiók aliasa kulcs nélkül is tiltott; élő tiltás nem ír ujjlenyomatot; a takarító az élő tiltást nem érintheti). Új:
két kulccsal futó példány után mindkét kulcs (B) sorai megvannak; B kulccsal feloldott, A kulccsal törölt-tiltott-újra-létrejött
fiókot a megőrzött A sor nem tiltja újra; eltérő titkú példány ugyanazt a zárat kapja; minden író megvárja a kanonikus zárat;
teljesítmény 10 000 fiókkal; `banMaintenanceEnabled`; a takarító lépései függetlenek.
**Parancsok és várt kimenet:** `node --import tsx --test tests/player-codes.test.ts` → `fail 0`;
`npm run test:learning-db` → `fail 0` (a „K1b” esetek is); `npm run lint`, `npm run check`, `npm run check:test` → kilépési kód 0;
`node scripts/qa/three-phase-check.mjs --base origin/main` → `OK`.
**Elfogadás:** a fenti tesztek zöldek; nincs séma-változás; a CI zöld.

---

### JM7c — Hibrid jogosultság (terv 10.4a): admin kizárólag az engedélylistáról; meglévő tanulók / szülők játékos-joggal

Két szelet; a JM7c-2 a JM7c-1 összevonása után indul. **Biztonságkritikus** (az admin-belépést érinti): a legnagyobb
kockázat az admin kizárása, a második a jogosultság-keveredés. Mindkét szeletre független biztonsági review megy.

#### JM7c-1 — Az admin-jog egyetlen forrása az engedélylista + `state` a meglévő `/auth/google` úton

**Állapot:** kész — #462 (015b5a9a, 2026-11-16; élesben telepítve), a JM7c-2 még nem indult; munkafa volt: jatek-jm7c1,
kanban #55 · **Függ:** JM7b · **Modell:** Opus · **Kiindulás:** biztonsági review #449 K3
**Felmért tények (main 62f50954):** admin-jog ma = `users.is_admin` (`source/shared/schema.ts`); új Google-sornál az
`ADMIN_EMAIL` pontos egyezése adja, meglévő sornál megmarad (`S/auth.ts:34-69` `createGoogleVerify`); kézi beállítás:
`S/admin-users.ts:103-117` (toggle-admin), `S/storage.ts:256-259` (upsert) és `:390-399` (toggle), `S/create-admin.ts`,
`S/scripts/setAdmin.ts`. Olvasók: `S/auth.ts:305-315` `isAuthenticatedAdmin` (csak `req.user.isAdmin`), `:200` (belépés
utáni cél), `S/routes.ts:938-971` `/api/auth/user`, `S/routes/rt.ts:75-77` (valós idejű `admin` mód),
`S/lib/web-lesson-quality-notice.ts:19` (adminfelirat), `S/admin-users.ts:8-22` (lista + utolsó-admin őr),
`S/studio/legacy-migration.ts:190-197` (tulajdonos-hozzárendelés, nem jogosultság-döntés). A routerek (Stúdió, katalógus,
memória, statikus audit, munkafolyamat, `/api/admin`) mind az `isAuthenticatedAdmin`-t használják. A `/auth/google`
stratégiának nincs `state`-je (login-CSRF, review #449 K3). Az `ADMIN_EMAILS` csak értesítési lista.
**Fájlok:** új `S/lib/admin-access.ts` (engedélylista + a képlet + kizárás elleni őr), új `S/lib/admin-oauth-state.ts`
(`AdminStateStore`, `a.` előtag); módosul: `S/auth.ts`, `S/routes.ts` (`/api/auth/user`), `S/routes/rt.ts`,
`S/admin-users.ts`, `S/lib/web-lesson-quality-notice.ts`, `S/studio/legacy-migration.ts` (tulajdonos csak számolt admin),
`S/create-admin.ts`, `S/scripts/setAdmin.ts` (figyelmeztetés), `source/scripts/run-learning-db-tests.ts` (új DB-teszt),
`source/client/src/pages/Login.tsx` (érthető hibaüzenet + újrapróba), `render.yaml` (csak kommentelt, érték nélküli
`ADMIN_ALLOWLIST`), `source/playwright.config.ts` (e2e-teszt-lista); tesztek: új `T/admin-access.test.ts`,
`T/admin-access-source-guard.test.ts`, `T/admin-allowlist-db.integration.ts`, `T/admin-allowlist.spec.ts`; bővül: `T/admin-authz-matrix-db.integration.ts`,
`T/player-account-db.integration.ts` (az admin-visszahívás `state`-tel — SPEC-VÁLTOZÁS), `T/support/player-google-stub.ts`
(`adminGoogleLogin`), `T/player-google-flow.test.ts`.
**Lépések:**
1. `admin-access.ts`: `parseAdminAllowlist` (vessző / pontosvessző / szóköz, `trim` + kisbetű, hibás elem eldobva és
   számolva), `adminPolicy()` (forrás: `ADMIN_ALLOWLIST` → üres / csupa hibás esetén `ADMIN_EMAIL` → egyik sem: `none`),
   `isAllowlistedAdminEmail`, és a KÉPLET: `isAdminUser(user)` = `is_admin === true` ÉS nem tiltott ÉS (listán VAN, vagy a
   kizárás elleni őr aktív). Őr: `none` forrásnál a jelző marad; beállított listánál csak akkor, ha a lista egyetlen létező,
   nem tiltott `is_admin` fiókra sem illik (DB-lekérdezés; a pozitív eredmény 60 s-ig újrahasznosítható, a negatív
   (őr-aktív) soha nem öröklődik — `prepareAdminAccess` minden kérés elején újraellenőrzi). Induláskori jelentés maszkolt
   címekkel (`reportAdminAccessStatus`).
2. Minden olvasó a képletet hívja: `isAuthenticatedAdmin`, `deserializeUser` (a `req.user.isAdmin` a számolt értékre
   íródik — mélységi védelem), belépés utáni cél, `/api/login` válasza, `/api/auth/user`, `rt.ts`, adminfelirat,
   Felhasználók-lista (`isAdmin` = számolt jog) és az utolsó-admin őr (számolt adminokat számol).
3. Új admin-jog csak listán lévő címnek: Google-os első belépés (`createGoogleVerify` a listát nézi, megerősített
   e-maillel), toggle-admin (listán kívüli címre érthető 400-as hiba), a szkriptek figyelmeztetnek.
4. `/auth/google`: `state: true`, `pkce: true`, `store: new AdminStateStore()` (`a.` + 32 base64url karakter, munkamenethez
   kötött, egyszer használható, 15 perc, legfeljebb 5 függő); a callback `p.` → játékos-ág, minden más → admin-ág, ahol az
   ismeretlen / hiányzó / idegen `state` belépés nélkül `/login?hiba=google`-ra visz (a telepítéskor folyamatban lévő
   belépés így egyszer elbukik, érthető üzenettel és újrapróba gombbal).
5. Forrás-őr teszt: a szerverkódban `.isAdmin` / `is_admin` olvasás csak a tételesen engedélyezett sorokban lehet.
**Biztonsági review #462 után rögzítve:** (M3) az `ADMIN_EMAIL` csak pontosan egy érvényes címmel alapérték, különben a
forrás `none` + hangos hiba; (A1) nem ASCII cím → nem egyezik; (A2) a Google `?error=` kódja csak szűrve kerül a naplóba;
(A3) a forrás-őr az átnevezős / többsoros destrukturálást, a szöveges kulcsot, a `Reflect.get`-et is elkapja, és a
`shared/`-et is bejárja. **Tulajdonosi döntés (M1):** a kizárás elleni őr marad (új jogot soha nem ad); a listán kívüli régi
jelzőket a tulajdonos a telepítés után a Felhasználók fülön veszi le — ezek a lista tetején állnak, összesítő jelzéssel, az
induló napló darabszámmal (cím nélkül) jelzi őket.
**Tesztek:** egységteszt a képletre (minden kombináció, kis- / nagybetű, szóköz, üres és hibás lista, `ADMIN_EMAIL`
alapérték, kizárás elleni őr); mátrix új szerepei: „`is_admin`, de nincs a listán”, „listán van, de `is_admin = false`”,
„futás közben levett admin” → minden admin-végponton 401 / 403, mellékhatás nélkül; „admin Google-lel (state-tel)” → admin;
a meglévő szerepek változatlanul; regresszió: admin jelszóval és Google-lel, nem admin Google-felhasználó belépése
változatlan; e2e: listás admin jelszóval eléri az `/admin`-t, a listán kívüli `is_admin` és a nem admin nem; a Google-indítás
`state`-et küld; `state` nélküli visszahívás → érthető hibaoldal.
**Parancsok:** `npm run check`, `npm run check:test`, `npm run lint`, `node --import tsx --test tests/admin-access*.test.ts
tests/admin-route-guard.test.ts tests/google-email-verified.test.ts tests/player-google-flow.test.ts`,
`npm run test:learning-db`, `npm run test:e2e -- tests/admin-allowlist.spec.ts`.
**Elfogadás:** (1) admin = jelző ÉS lista ÉS nem tiltott, egy függvényben, minden kérésnél; (2) a telepítéshez a Renderen
nincs teendő (`ADMIN_EMAIL` az alapérték, teszt rögzíti); (3) listáról levett admin a következő kérésnél nem admin; (4) a
kizárás elleni őr dokumentált és tesztelt; (5) `/auth/google` `state`-es, hamis / hiányzó `state` → senki nem lép be;
(6) mátrix és a meglévő szerepek zöldek; (7) nincs séma-módosítás, migráció; `PLAYER_ACCOUNTS` KI marad.

#### JM7c-2 — Meglévő nem admin `users` sorok kapcsolása játékos-miniprofilhoz (KÜLÖN, későbbi szelet)

**Állapot:** nem kezdődött · **Függ:** JM7c-1 · **Modell:** Opus
**Cél:** a programban rögzített tanulók / szülők (`users`, nem admin) játékos-jogot kapjanak: saját `player_accounts`
miniprofilt (becenév + avatar), admin-jog nélkül. **Fájlok (tervezett):** új additív migráció (`player_accounts.legacy_user_id`
→ `users.id`, egyedi, `ON DELETE SET NULL`), `S/auth.ts` (a nem admin `users`-belépés a játékos-munkamenetet is beállítja /
a játékos-útra terel), `S/player/account-store.ts`, a kupon / gyakorlás (`S/rewards/*`) jogosultságának átvezetése, tesztek
(DB: kapcsolás idempotens; listás admin címe soha nem kap automatikus kapcsolást; tiltott `users` sor → tiltott játékos).
**Lépések (vázlat):** (1) felmérés: mely funkciók függnek a nem admin `req.user`-től; (2) migráció + kapcsolás az első
belépéskor (megerősített e-mail); (3) a nyilvános „Belépés” gomb a játékos-útra; (4) név / profilkép nem kerül új sorba
(review #449 K3 (2)). **Elfogadás:** egy meglévő tanuló belép → miniprofilja van, admin-végpont 401 / 403; a mátrix új
„kapcsolt tanuló” szereppel zöld. Új független biztonsági review kötelező.

---

### JM8a — Pontkönyv (szerver) — `PLAYER_POINTS` flag

**Állapot:** nem kezdődött · **Függ:** JM7b · **Modell:** Opus · **Elfogadás:** JM-A13
**Fájlok:** `source/migrations/0042_player_points.sql` (a 0041-et a #471 foglalja — `0041_player_ban_fingerprints.sql`; a JM8a indulásakor `ls source/migrations` a végső szó), `source/shared/schema.ts` (`game_runs`, `player_game_stats`,
`player_weekly`), `source/shared/game-score-rules.ts`, `source/shared/levels.ts` (szint-görbe: a J8 `playerLevel` ide
költözik és a kliens újraexportálja), `S/player/runs-routes.ts`, a meglévő napi takarító cron bővítése (180 nap / 12 hét;
felderítés: `grep -n "cron.schedule" S/index.ts`), tesztek: `T/game-score-rules.test.ts`, `T/player-runs.db.test.ts`,
`T/weekly-key.test.ts` (Europe/Budapest, DST-váltás).
**Séma (0042, additív):** `game_runs(id uuid PK = runId, player_id → player_accounts ON DELETE CASCADE, game_id, difficulty,
kind ('run'|'import'|'duel'), started_at, finished_at (szerveridők), xp, claimed_xp, correct, wrong, best_streak, flags,
ranked bool, match_id uuid NULL, outcome smallint NULL, finish_hash char(64) NULL)`, indexek `(player_id, finished_at)` és nyitott runokra;
`player_game_stats(player_id, game_id, difficulty PK, total_xp, best_run_xp, best_streak, runs, correct)`;
`player_weekly(player_id, week_start PK, ranked_xp, knowledge_points)`.
**Végpontok:** `POST /api/player/runs/start {gameId, difficulty}` → `{runId, startedAt}` (60 / óra / játékos);
`POST /api/player/runs/:id/finish {xp, correct, wrong, bestStreak, served}` — **idempotens szerződés (review #440):**
- Állapotgép: `issued` (a `start` beírta a `game_runs` sort `finished_at = NULL`-lal) → `finished` (egyetlen átmenet).
  Az összevetéshez a sor tárolja a kérés kanonikus kivonatát: `finish_hash char(64)` = SHA-256 a
  `{xp, correct, wrong, bestStreak, served}` kanonikus JSON-jából (rendezett kulcsok), és az elküldött válasz mezőit
  (`xp` elfogadott, `ranked`, `flags`, `knowledge_points`).
- Átmenet atomikusan: `UPDATE game_runs SET finished_at = now(), …, finish_hash = $h WHERE id = $id AND player_id = $p AND
  finished_at IS NULL RETURNING *` → 1 sor: az összesítők frissítése ugyanabban a tranzakcióban, válasz 200
  `{ ok: true, run: { id, xp, ranked, flags, knowledgePoints }, replay: false }`.
- 0 sor esetén újraolvasás: a sor `finished` és `player_id` egyezik és `finish_hash = $h` → **ugyanaz a 200-as válasz** a
  tárolt mezőkből, `replay: true`, írás nélkül; `finish_hash ≠ $h` → **409** `{ ok: false, code: "RUN_ALREADY_FINISHED" }`,
  az eredeti változatlan; ismeretlen `runId` → 404 `RUN_NOT_FOUND`; más játékosé → 404 (nem árulja el a létezést);
  24 óránál régebbi nyitott run → 410 `RUN_EXPIRED` (a takarító törli).
- Kötelező tesztek (`T/player-runs.db.test.ts`): azonos újraküldés × 3 → egy lezárt sor, három azonos válasz (az elsőn
  `replay: false`, utána `true`), az összesítők egyszer nőnek; eltérő tartalmú újraküldés → 409, az eredeti sor és az
  összesítők változatlanok; két párhuzamos `finish` (azonos tartalom) → egy átmenet, mindkét válasz 200, az összesítők
  egyszer nőnek; két párhuzamos eltérő `finish` → egy 200 és egy 409; idegen játékos → 404; lejárt → 410.
Hihetőség — a kliens minden száma hitelesítés nélküli állítás (review #440): `durationSec` = szerveridők különbsége;
`maxQuestions = floor(durationSec / 1.5)` (a J3 legkisebb kérdés-rése); `correct + wrong ≤ min(served, maxQuestions)`;
`bestStreak ≤ correct`; `xp ≤ min(GAME_MAX_RUN_XP[game], GAME_MAX_XP_PER_MIN[game] × durationSec / 60)`
(`game-score-rules.ts`); túllépésnél az elfogadott érték a plafon, a `claimed_xp` megmarad auditra, `ranked=false`,
`flags` bit; 20 s alatti menet `ranked=false`;
gyanús → `ranked=false`, `flags`; tudás-pont = `correct`; heti kulcs hétfő 00:00 Europe/Budapest. Írás: 1 tranzakció.
`POST /api/player/import-local {deviceId, stats}` — egyszer fiókonként + eszközönként (eszköz-azonosító: véletlen UUID a
localStorage-ben), plafon 5000 XP, `kind='import'`, `ranked=false`. **Újrapróbálható:** a sor azonosítója determinisztikus
(`id = uuidv5(player_id + ":import:" + deviceId)`), `INSERT … ON CONFLICT (id) DO NOTHING RETURNING`; ütközésnél a tárolt
sor `finish_hash`-ét veti össze a kérés kivonatával — egyezik → ugyanaz a 200 (`replay: true`), eltér → 409
`IMPORT_ALREADY_DONE` (az eredeti marad). Teszt: azonos import × 3 → egy sor; eltérő második import → 409.

### JM8b — Pontkönyv (kliens): `useRunReporter` a hét játékban

**Állapot:** nem kezdődött · **Függ:** JM8a · **Modell:** Sonnet · **Elfogadás:** JM-A13 (kliens)
**Lépések:** `GE/play/useRunReporter.ts` — regisztrált játékosnál `runs/start` a menet indításakor, `finish` a végén
(újrapróba ugyanazzal a `runId`-vel); vendégnél és `PLAYER_POINTS=off`-nál a meglévő `POST /api/games/score` út
(változatlan); a hét lap egy-egy hívási pontja (JM0 4. lépés listája). Fiókoldal: összpont, tudás-pont, heti pont, rekordok.
Teszt: `T/run-reporter.test.ts` (hamis fetch: újrapróba, idempotencia), `T/player-points.spec.ts`.

---

### JM9 — Barátok, heti baráti / csoport ranglista, párbaj-mérleg

**Állapot:** nem kezdődött · **Függ:** JM8b, JM3b · **Modell:** Sonnet · **Elfogadás:** JM-A14
**Fájlok:** `source/migrations/0043_player_friends.sql` (`player_friendships(a, b PK, status 'pending'|'active'|'blocked',
requested_by, blocked_by)`, `player_friend_invites(token_hash PK, player_id, uses_left, expires_at)`), `S/player/friends-routes.ts`,
`S/realtime/*` (meccs vége → regisztrált játékosoknál `game_runs kind='duel'`, `match_id`, `outcome`; **újrapróbálható
mentés:** a sor azonosítója `uuidv5(match_id + ":" + player_id)`, `INSERT … ON CONFLICT (id) DO NOTHING`, az összesítők csak
új sor esetén nőnek — egy DB-hiba utáni újrapróba (legfeljebb 3, exponenciális visszalépéssel) nem duplikál; teszt: a
mentés kétszeri futtatása → játékosonként egy sor), `P/PlayerAccount.tsx`
(barátok, kérések, ranglista-fülek, párbaj-mérleg), tesztek.
**Szabályok:** barát csak barátkóddal (8 jel), meghívólinkkel (7 nap, ≤ 5 beváltás, név nélküli token) vagy közös szobából
(„Barátnak jelölöm” a `RoomResult`-on, csak regisztráltaknál); kölcsönös elfogadás; függő kérés 14 nap után lejár; tiltás után
a kód nem működik; nincs kereső. A barát látja: becenév, avatar, szint, heti pont, rekordok, párbaj-mérleg; nem látja:
e-mail, előzmények. `GET /api/player/leaderboard?scope=friends|group:<id>&period=week` — „körülötted” ±3; nyilvános scope nincs.

---

### JM10 — Osztálytermi mód

**Állapot:** nem kezdődött · **Függ:** JM9 · **Modell:** Sonnet · **Elfogadás:** JM-A16
**Fájlok:** `source/migrations/0044_play_groups.sql` (`play_groups(id, owner_player_id, name, join_code char(6) UNIQUE)`,
`play_group_members`), `S/player/groups-routes.ts`, `S/realtime/*` (szerepkör `board`: csak olvasó kapcsolat a kivetítő-nézethez),
`P/RoomBoard.tsx` (`/jatek/tabla/:kod` — nagy betűs állás, kivetítőre; PII nélkül), csapatkupa mód (a csapat pontja a tagok
pontosságának átlaga; csapatdobogó; egyéni kiemelés csak pozitív), tesztek (3 kontextus: tábla + 2 játékos).

---

### JM11 — Terhelés, megfigyelhetőség, deploy-őr, átfogó review, retro

**Állapot:** nem kezdődött · **Függ:** JM1–JM10 · **Modell:** Opus · **Elfogadás:** JM-A17, P2 (admin-elválasztás szempont)
**Lépések:** `scripts/qa/rt-load.mjs` (Node `socket.io-client`, 400 kapcsolat / 100 szoba a helyi buildre, 3 perc; mérés:
`process.memoryUsage().heapUsed`, `perf_hooks.monitorEventLoopDelay` p99, elutasítási arány) → `docs/measurements/…-rt-terheles.md`;
küszöb-túllépésnél `MP_MAX_ROOMS` csökkentése. Admin-mérőszámok: `GET /api/admin/rt-metrics` (az `adminRouter` alatt →
`isAuthenticatedAdmin`). A telepítés előtti őr (memória „Nincs deploy futás közben” + runbook) kiegészítése a
`GET /api/rt/status` `activeMatches` értékével. Átfogó review (AGENTS.md „Review guidelines”) a teljes JM-funkcióra —
kötelező szempontok: admin-elválasztás (JM-A12, a mátrix-teszt friss futása), PII URL-ben / naplóban / eseményben,
origin / CSRF, leállítás / e2e-mód, migráció ↔ Drizzle, Europe/Budapest heti határ. Retro, csapdák, kanban.

---

### JB — Évfolyam-bank bővítése (JBa: 3–6., JBb: 7–9., JBc: 10–12. évfolyam)

**Állapot:** JBa kész (#448, 2026-11-16); JBb kész (#453, 2026-11-16); JBc kész (#458, ba9c666c, 2026-11-16), kanban #53 · **Függ:** J0b (független a játékoktól; párhuzamosan futhat) · **Modell:** Opus (gyártás), Sonnet (vak megoldó)
**Elfogadás:** JB-A1 · **Fájlok:** `source/client/src/data/gradeQuizBank/grade-NN.ts` (bővítés, a meglévő tételek
azonosítója változatlan), `docs/measurements/2026-11-xx-evfolyam-bank-<sáv>-vakmegoldo.md`, a meglévő őrök
(`T/quiz-bank-integrity.test.ts`, `T/game-bank-no-repeat-content.test.ts`, `T/grade-quiz-select.test.ts`) zöldek + új
`T/grade-quiz-bank-coverage.test.ts` (évfolyamonként ≥ 270, tárgy × tier ≥ 18, magyarázat 30–300 karakter, 4 különböző opció).
**Folyamat (a szóbanknál bevált, C-31 tanulságaival):** gyártás tárgy × tier cellánként láncolva (a magasabb tier látja az
alacsonyabb kész listáját — duplikátum ellen) → validátor → **vak megoldó** (külön alügynök csak a kérdést és a 4 opciót
látja; a válaszfájl a választott opció SZÖVEGÉT is tartalmazza) → audit (kétértelműség, tantervi illeszkedés, „a válasz
kitalálható tudás nélkül” minta) → javítás → jegyzőkönyv. Diff: adatfájl (a 400 soros irányelv többszöröse, indokolt).

---

## H — Hullámterv, párhuzamosság, modell-szint

| Hullám | Szeletek (‖ = párhuzamos szál) | Modell | Indok / feltétel |
|---|---|---|---|
| 1 | J0a ‖ JM0 | Opus ‖ Sonnet | közös determinizmus; az adatvédelmi javítás azonnal kiadható, fióktól független |
| 2 | J0b → J0c ‖ JM1 ‖ JBa | Opus ‖ Opus ‖ Opus+Sonnet | a JM1 (szabálymotor) a J0a-ra (rng) és a J0b `windowMsFor`-ára épít — a J0b merge-e után indul; a JB tartalom független |
| 3 (pilot) | J4a → J4b ‖ J2a → J2b ‖ JM2 ‖ JBb | Opus ‖ Opus ‖ Opus ‖ Opus+Sonnet | a két „feladatlap” játék; a szerver-réteg flag mögött (`MP_MODE=off`) |
| 4 | J1a → J1b → J1c ‖ J5a → J5b ‖ J6a → J6b ‖ JM7b → JM1r → JM3a → JM3b ‖ JBc | Opus ‖ Opus ‖ Sonnet/Opus ‖ Opus ‖ Opus+Sonnet | D20: online-only; JM3a után `MP_MODE=admin` éles mérés (U-JM2-1/2), a gépi ellenfél flag nélkül élő; JM3b után `PLAYER_ACCOUNTS=on` → `MP_MODE=on` |
| 5 | J3a → J3b → J3c ‖ J7a → J7b → J7c ‖ JM4a (J4 + JM3b után) → JM4b (J2 + JM3b után) → JM4c (J1 + JM3b után) | Opus ‖ Sonnet/Opus ‖ Opus/Sonnet/Opus | a JM7a / JM7b a 4. hullámba került (D20, a JM1r előtt) |
| 6 | J8 ‖ JM5a–d (a megfelelő J után) ‖ JM6 ‖ JM8a → JM8b | Sonnet ‖ Sonnet ‖ Sonnet ‖ Opus/Sonnet | JM8b után `PLAYER_POINTS=on` |
| 7 | J9 ‖ JM9 → JM10 | Opus ‖ Sonnet | a J9 az egyjátékos funkció záró mérése |
| 8 | JM11 | Opus | a többjátékos funkció zárása, átfogó review |

Szabályok: egy közös fájlt egyszerre egy szelet módosít (K.1/6–7); különösen: `source/client/src/App.tsx` (J0c → JM1 → JM7a → JM7b → JM1r →
JM3a → JM10 sorban), `P/Games.tsx` (J8 és a JM1r / JM3a párbaj-belépője: az orkesztrátor sorolja), `source/shared/schema.ts` és
`source/migrations/` (JM7a → JM8a → JM9 → JM10 szigorúan sorban, a migráció-számok foglalva: 0040 = JM7a, 0041 = a #471 tiltás-ujjlenyomata, 0042–0044 = JM8a / JM9 / JM10; a terv szövege még 0041-et említ a JM8a-nál — ez a sor az irányadó), a hét játéklap a
J-szelet és a JM4 / JM5 / JM0 / JM8b között (az orkesztrátor sorolja, soha nem egyszerre). Minden al-szelet önállóan kiadható;
a flag alapértékével a main mindig működő. A merge-ek előtt a futás-őr (memória „Nincs deploy futás közben”), a JM2 után a futó
meccsekkel együtt (JM-A7).

**Teljes szeletlista függőségekkel (az orkesztrátor indítási sorrendje):**
J0a (—) · JM0 (—) · J0b (J0a) · J0c (J0b) · JM1 (J0a, J0b) · JBa/JBb/JBc (J0b) · J4a → J4b (J0c) · J2a → J2b (J0c) ·
JM2 (JM1) · J1a → J1b → J1c (J0c) · J5a → J5b (J0c) · J6a → J6b (J0c) · JM1r (JM2, JM7b) · JM3a (JM1r) · JM3b (JM3a, JM7b) · J3a → J3b → J3c (J0c) ·
J7a → J7b → J7c (J0c) · JM4a (JM3b, J4b) · JM4b (JM3b, J2b) · JM4c (JM3b, J1c) · JM7a (JM0) · JM7b (JM7a) · J8 (J1–J7 „a”/„b”) ·
JM5a (JM3b, J3c) · JM5b (JM3b, J6b) · JM5c (JM3b, J5b) · JM5d (JM3b, J7c) · JM6 (J1–J7) · JM8a (JM7b) · JM8b (JM8a) ·
J9 (J1–J8) · JM9 (JM8b, JM3b) · JM10 (JM9) · JM11 (JM1–JM10).

**Tulajdonosi teendő:** nincs kötelező. Opcionális: `jatek.websuli.vip` Render custom domain + DNS CNAME, és `MP_DIRECT_URL`
beállítása (közvetlen WebSocket, kisebb késés) — a terv nélküle is működik élesben.

## Záró teljességellenőrzés (minden szelet után az orkesztrátor)

1. A szelet elfogadási pontjai (fejezete „Elfogadás”) tételesen, futtatott parancs kimenetével.
2. A terv 11. szakaszának érintett J-pontjai a `<!-- acceptance-checklist -->` alatt: a teljesülteket a J9 pipálja a
   terv-fájlban (külön docs-commit a J9 PR-jában), bizonyíték-hivatkozással.
3. A K.3 etikai lista, a K.4 30 pontos kapu és a K.5 kódszabályok a PR-leírásban.
4. A követhetőségi táblázat (terv 12.) minden cél-mondatához legalább egy lezárt szelet a J9 végén; a G8–G10 a JM
   véglegesítésével.
