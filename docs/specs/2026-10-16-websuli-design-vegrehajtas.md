# Websuli Design — végrehajtási utasítás (AI-ügynöknek)
Terv: `docs/specs/2026-10-16-websuli-design.md`. Forrás: `docs/design/` (mesterutasítás és HTML-referencia). Ág:
`feat/websuli-design`. Két PR (a PR-méret miatt): **A — fontok**, **B — arculat**.

Kapuk mindkét PR-nél:
- tsc, check:test, lint, test, DB-test;
- célzott Playwright (workers=1);
- valódi böngészős képernyőkép 390 / 768 / 1440 px-en.

## A — fontok (PR 1)
1. **`scripts/prepare-lesson-fonts.py`:** `FAMILIES` + `("inter","Inter")`, `("nunitosans","Nunito Sans")`.
   - Rögzített revízió: inter `0b58fb370093f9a9f4ff785d94405710b79de67c`, nunitosans
     `8b0a1d0f5983c89bc2b93f1b5fb55f9e252744b5`. A meglévő családok a manifestben rögzített revíziójukat tartják.
   - A súlytengely-ellenőrzés 400–800, a többi tengely (opsz, wdth, YTLC) nem korlátoz.
   - Futtatás, majd ellenőrzés: a régi WOFF2-k sha256-ja változatlan.
2. **`shared/lesson-typography.ts`:**
   - `LESSON_FONTS` = Nunito Sans, Inter (a régiek kikerülnek a tananyag-listából; a fájlok az alkalmazás egyéb részei miatt
     maradnak).
   - `lessonFontPair`: 1–5 → Nunito Sans; 0 és 6–12 → Inter; a címsor ugyanaz (a serif-kivétel megszűnik).
   - `LESSON_TYPOGRAPHY_CONTRACT` szövege az új családokkal.
   - A CSS-tartalék: `"<font>", "Noto Sans", sans-serif`.
3. **`client/src/lesson-runtime/LessonRuntime.tsx`:**
   - a `--lesson-font-*` az új párral, a tartalékláncot is beleértve;
   - a `paper`-téma serif-kivétele megszűnik.
   - A `lesson-theme.css` `kid` sávja nem rögzít Nunitót; a változóból dolgozik.
4. **`client/public/fonts/README.md`:** a családok és a szerepek frissítése.
5. **Tesztek** (dokumentált spec-változás):
   - `tests/lesson-typography.test.ts`, `tests/lesson-typography.browser.ts`: 2. o. → Nunito Sans, 7. o. (irodalom is) →
     Inter, a manifest szerinti belső családnév.

## B — arculat (PR 2)
1. **`shared/lesson-design.ts`:**
   - `DESIGN_THEMES` a mesterutasítás táblázatával (id, évfolyam, név, `accent`, `surface`, `ink`, font), és a megjelenítési
     tokenek témánként: `soft`, `deep`, `strong` (gomb/szöveg főszín), `strongInk`, `muted`, `line`, `panel`, `minBodyPx`.
   - `designThemeForClassroom(c)`.
2. **`client/src/lesson-runtime/lesson-design.css`** (új, a `LessonRuntime` importálja):
   - `[data-band][data-experience][data-ws-theme="…"]` (3 attribútum, a régi 2 attribútumos réteg fölött): a `--lesson-*`
     tokenek, `--grade-size`, `--ws-*`.
   - Szerkezet a referencia élő előnézete szerint:
     - felső sáv (`.ws-topbar`, `deep` háttér, fehér szöveg);
     - háttér `linear-gradient(150deg, soft, #fff 70%)`; a `future` témánál sötét felület;
     - csempék: fehér vagy `panel`, 1px `line` keret, 16px sarok, halk árnyék;
     - fő gomb `strong` és `strongInk`, másodlagos gomb `#eaf0f6` / `#24435d`;
     - fülek a referencia `.switch` mintájára (kiválasztva főszín keret és `soft`);
     - chip `soft` / `deep`; haladássáv: `#dce6ed` sín, főszín;
     - kiegészítő felirat legalább 13px.
   - A régi hős-dísz (`::after` kör) a témás leckén nincs.
3. **`LessonRuntime.tsx`:**
   - Gyökér: `data-ws-theme`, `data-experience="websuli"` (állandó; így a régi téma- és világszabályok nem
     illeszkednek). A `data-flair` és a csillogás (`lesson-sparkles`) megszűnik.
   - A hős fölé `.ws-topbar`: „✦ Websuli / <téma neve>”, jobbra „Tanulás · Gyakorlás · Eredmények”.
4. **`shared/lesson-visuals.ts` `designFromInstruction`:** a nemi szavak (rózsaszín, pink, kislány, lányos, hercegnő,
   királylány) nem választanak világot. A többi viselkedés marad, a megjelenítésre nincs hatása.
5. **Tesztek:**
   - **Új:** `tests/lesson-design.test.ts`:
     - sávhatárok;
     - a TS-tokenek egyeznek a mesterutasítás táblázatával;
     - a CSS-tokenek egyeznek a TS-tokenekkel;
     - minden szövegpár ≥ 4,5:1;
     - `minBodyPx` ≥ a leírás minimuma.
   - **Új:** `tests/lesson-design.spec.ts`, az `/__lesson-runtime-probe?classroom=1|4|7|9|11` útvonalon:
     - `data-ws-theme`;
     - a felső sáv szövege;
     - a számított törzsszöveg-méret;
     - a fő gomb szövegkontrasztja (mért színekből);
     - nincs kilógás 390 / 768 / 1440 px-en;
     - képernyőképek a `test-results`-ba.
   - **Dokumentált spec-változás:**
     - a princess-választást rögzítő tesztek (`lesson-flair.test.ts`, `audit-2026-09-24.test.ts`);
     - a régi sávszíneket olvasó `lesson-band-visual.spec.ts`;
     - a gyökér-attribútumot olvasó `lesson-band-theme.test.ts`.
6. **Böngészős ellenőrzés:** a mind az öt témáról készült képernyőkép összevetése a referencia élő előnézetével (felső sáv,
   címsor, csempék, gombok).

## Állapot és megvalósítási pontosítások (2026-10-16)
- **A — fontok:** PR #266.
- **B — arculat, mérésből adódó pontosítások:**
  - **A régi évfolyamréteg felülírása:** a `lesson-experience.css` közvetlenül a blokkra írt betűméretet (1,2 / 1,1 / 1rem). A téma
    minimumát ezért a `.lesson-block` kapja, 3 attribútumos szelektorral. A gyökérre nem kerül betűméret, mert az SVG-feliratok
    öröklik.
  - **A másodlagos gomb a teljes leckén:** a `.lesson-outline-btn` a négyfüles nézeten kívül is a téma másodlagos gombja. Mérve: a
    11–12. évfolyam sötét témáján a régi átlátszó gomb 3,11:1 volt.
  - **A borítóábra nem fakul:** a régi évfolyamréteg `saturate(.35)`-je a témás leckén nem érvényes.
  - **`labeledShape`:** 36 egység oldalsó hely, 16 egységes felirat. Mérve: az Inter szélesebb betűképével a téglatest
    magasság-felirata a bal szélen kilógott. Ugyanez a javítás az A PR-ba is bekerül.
  - **Mozgás:** a tananyag blokkjai nem animálnak (a fúziós réteg eddig is kikapcsolta, most minden leckén így van, §2.7).
  - **Próbaoldal:** a `?fusion=1&classroom=N` mind az öt témát mutatja.
- **Review #267 (javítva, mérve):**
  - A fejezetsorszám a kimért `strong` / `strongInk` párt kapja. A nyers főszínen a fehér szöveg 3,88:1 (adventure), illetve 3,75:1 (future) volt.
  - A `future` téma haladássínje `#233956` (a csempe színe). A kitöltés kontrasztja így 3,13:1; a régi `#3B5267` sínnel 2,17:1 volt.
  - A Csendes nézet a `--ws-*` tokeneket is felülírja: minden témán világos, halk palettára vált.
  - A tananyagszöveg is a téma minimumán jelenik meg: bekezdés, lista, összefoglaló kártya, kérdéscím (a sáv `text-*` osztálya és a régi rem-méretek ezt nem írják felül).
  - Borítóábra nélküli leckén (`data-cover` nincs) a fejléc kétoszlopos (embléma és cím), nem marad üres oszlop.
  - A 9–10. o. háttérátmenete nem ismétlődik 32 px-enként: `background-size: auto`, `no-repeat`.
  - A felső sáv kontrasztját a tömör hátterű `.ws-topbar`-on mérjük.
