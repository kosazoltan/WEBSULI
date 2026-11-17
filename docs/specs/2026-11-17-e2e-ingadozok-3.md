# E2E-ingadozók, 3. kör: joystick-renderszámláló, eredmény-e-mail, Párbaj-visszavágó, győzelmi képernyő, Neon védőtorony (kanban #76, #31)

**Állapot:** folyamatban – 2026-11-17, ág `fix/e2e-ingadozok-3`
**Végrehajtási utasítás:** `docs/specs/2026-11-17-e2e-ingadozok-3-vegrehajtas.md`
**Előzmény:** `docs/specs/2026-11-16-e2e-ingadozok-2.md` (#58), a módszer onnan.

## Miért

A kötelező „Playwright E2E” job (~1–1,2 óra) a mainen az utolsó hat futásból kettőben egy-egy, a commit tartalmától független
teszten bukott (2026-11-17): `joystick-response.spec.ts › block-craft-quiz` (run 44049286407, egy csak-doksi commiton),
`lesson-result-email.spec.ts` (run 44028107372 és a #484 futása, flaky). A #484 futásában flaky volt a `duel-online.spec.ts`
„mindkét játékos EGYSZERRE nyomja a Visszavágót” esete; helyben a `game-win-paths` Tornado-esete (43,96 px < 44); a kanban #76
szerint a `speed-math-play.spec.ts` menetvégi hurka. A munka közben a main 44067781689-es futása (26bae97f) is ugyanezen bukott:
`joystick-response` Szökőár (többlet +9) és Kockavadász (tárcsa +21 / +23). Minden ilyen bukás egy teljes CI-kört és téves javítási kísérleteket okoz.

## Módszer (tesztenként)

1. A CI-naplóból / artifactból a pontos hiba (üzenet, `error-context`, trace).
2. Reprodukció a CI-azonos úton: buildelt szerver, eldobható Postgres (`scripts/run-e2e-tests.ts`), szoftveres WebGL (SwiftShader),
   1 worker, újrapróba nélkül, `--repeat-each 20`, CPU-lassítással (CDP `Emulation.setCPUThrottlingRate`, 4–6×). Előtte-arány.
3. Gyökérok bizonyítékkal; döntés: a TESZT törékeny, vagy a TERMÉK hibás lassú gépen.
4. Javítás a mérce lazítása nélkül (küszöb, `retries`, skip, törlés tilos): determinisztikus várakozás valódi állapotra, atomi
   `page.evaluate`, verseny megszüntetése. Időkeret csak mérés alapján.
5. Utána-arány ugyanazzal a reprodukcióval (0 bukás), és ellenpróba: a javítás visszavonásával a bukás visszajön.

Ha egy tesztnél 3 megközelítés után sincs bizonyított gyökérok: megállás, a kipróbált utak leírása.

## Hatókör

- `source/tests/joystick-response.spec.ts`, `source/tests/lesson-result-email.spec.ts`, `source/tests/duel-online.spec.ts`,
  `source/tests/support/*`, `source/tests/game-win-paths.spec.ts`, `source/tests/speed-math-play.spec.ts`; termékkód csak akkor, ha a
  gyökérok termékhiba, és a fájl nincs a párhuzamos PR-ok hatókörében.
- A joystick-javításnak a main Kockavadász-lapján ÉS a #484 ágán (`origin/feat/jatek-j3a-kockavadasz-runabanya`) is érvényesnek kell lennie.

## Nem cél

- `tests/word-ladder-play.spec.ts` (a Szólétra időzítését egy másik ág írja át — a koordinátor 2026-11-17-i hatókör-változása);
  a megfigyeléseket átadjuk.
- A párhuzamos PR-ok fájljai: `pages/TsunamiEscapeEnglish.tsx`, `pages/BlockCraftQuiz.tsx`, `pages/BrainRotSteal.tsx`,
  `pages/SpaceAsteroidQuiz.tsx`, `pages/TornadoHunter200.tsx`, `pages/WordLadderHuEn.tsx`, a hozzájuk tartozó `lib/*` és
  `tests/<játék>-*`, `game-engine/play/questionDirector.ts`, `scripts/qa/gates/*`, `AGENTS.md`, `docs/agent-csapdak.md`.
- Küszöb emelése, `retries` növelése, teszt törlése / skipelése.

## Edge case-ek

- A lassú CI-n (Kockavadász ~1,3 képkocka/s a mérés alatt) minden CDP-érintés egy képkockára vár: a „mozgó” és az „álló” szakasz
  valós ideje nagyon eltérhet.
- Két böngészőkontextusos teszt (Párbaj): a CPU-lassítást minden lapra rá kell tenni.
- Újratöltés közben futó kérés (eredmény-e-mail): a kliens a jelzőt csak a sikeres válasz után írja.

## Elfogadás (EARS)

- AMIKOR a fenti tesztek a CI-azonos úton, CPU-lassítással 20-szor futnak, MINDEGYIK zöld; a javítás visszavonásával a mért bukás
  visszajön (ellenpróba), vagy a jelentés megmondja, miért nem hozható elő.
- A tesztek küszöbei és elvárásai változatlanok (diff-ben ellenőrizhető).
- A joystick-javítás a #484 ágán is zöld. (A joystick-tétel kikerült ebből a PR-ból — kanban #106.)
- A CI teljes Playwright E2E-je zöld.

<!-- acceptance-checklist -->
- [ ] 1: joystick-response › block-craft-quiz renderszámláló — KIVÉVE ebből a PR-ból — külön szelet (kanban #106). A teszt-oldali
  gyökérok-jelölt (álló/rezgő szakasz hossz-aszimmetria) és két javítás-változat mérve, de a PR előtti kapu böngészős lépésében a
  2. változattal a Szökőár bukott (lapon +25, tárcsán +27; álló 2876 ms / 19 render, rezgő 1898 ms / 38 render). A termék-vs-teszt
  kérdés NYITOTT (a lap mozgás közben ~20, álló helyzetben ~6,6 render/s). A spec a main változatára visszaállítva; a 180 → 240 s-os
  keretemelés ezzel megszűnt.
- [x] 2: lesson-result-email — gyökérok (kanban #31), javítás, célzott kísérlet előtte 5/5 bukik / utána 5/5 + 20/20 zöld.
- [ ] 3: duel-online „EGYSZERRE Visszavágó” — gyökérok (CI-riport + 6×: 4/20) és javítás (WebSocket-visszatartás) kész, de a
  „20-ból mindegyik zöld” elfogadás betű szerint NEM teljesült: utána 19/20. Az egy bukás a vizsgált lépés UTÁN, a lezárásban, a
  150 s-os kereten; az oka („terhelt gép”) NEM bizonyított (UNVERIFIED). Az első CI-körökben a teszt idejét figyelni kell.
- [x] 4: game-win-paths (animáció közbeni mérés) — kísérlet 3/3 igazolja az ablakot; javítás; utána 160/160.
- [ ] 5: speed-math-play menetvégi hurok — a mechanizmus kísérlettel igazolva (2/2), javítás kész; a természetes hurok-időtúllépés
  35 futásból nem jött elő (NOT REPRODUCED). A „mindegyik zöld” elfogadás NEM teljesült: 4×-en 11/15 — a 4 bukás a korai,
  nem gyökérokozott koppintás-mechanizmus (UNVERIFIED; külön jegyre megy, a független ellenőr J2-es leletével).
- [x] 6: word-ladder-play:48 megfigyelései átadva (nem hatókör).
- [ ] Helyi kapuk zöldek; független ellenőr IGEN; PR; CI zöld.
