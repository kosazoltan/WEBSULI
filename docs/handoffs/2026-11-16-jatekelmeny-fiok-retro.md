# Retro — Játékélmény 2.0 és játékos-fiók / többjátékos futás (J0–J4a, JM0–JM7c-1, JB, 2026-11-16)

Terv: `docs/specs/2026-11-16-jatekok-jatekelmeny.md` · végrehajtás: `docs/specs/2026-11-16-jatekok-jatekelmeny-vegrehajtas.md`
· kanban #32 (J0–J9), #33 (JM), #36–#66. A globális CLAUDE.md „KÖTELEZŐ futás utáni retro” szabálya szerint, mért tényekből
(`gh pr list`, `gh run list`, a kanban `list` kimenete, a független audit jelentése). A lekérdezések ideje: 2026-11-16 ~20:20 UTC.

## 0. Az ítélet röviden (nem szépítve)

A független, csak olvasó audit (2026-11-16 este, éles + `main`) szerint **nagyjából a fele készült el a tervnek, és élesben a
gyerekek még nem tudnak regisztrálni és együtt játszani**. Ennek ténybeli alapja:

- A hét játékból **kettő** kapta meg (részben) az új „a játék az elsődleges” hurkot (Szólétra J2a, Matek J4a); **öt** játék élesben
  ugyanaz, mint a terv előtt (Szökőár, Kockavadász, Brain Rot, Aszteroida, Tornado: a J1, J3, J5, J6, J7 szelet nem indult).
- **Fiókok:** a kód a mainen van (#445, #449, #461, #463, #469), de a `PLAYER_ACCOUNTS` flag élesben KI (`/api/player/status` →
  `enabled: false`); a Játékok oldalon nincs belépő (#472 nyitott). **Ma élesben nem lehet regisztrálni.**
- **Együtt játszás:** a valós idejű réteg (#452) a mainen, de `MP_MODE` KI; a szoba-felület (#464) nyitott; a 3–4 fős mód, az
  osztálytermi / csoportos mód, a barátok, a győzteshirdetés, a tárolt pontok (JM8–JM11) **nem indultak**. **Ma két gyerek élesben
  nem tud együtt játszani.**
- A pontok tartósan a fiókhoz **nem** mentődnek (JM8a/b nem indult). A terv elfogadási listájának (`<!-- acceptance-checklist -->`)
  egyetlen pontja sincs pipálva. Az audit szerint a retro és a csapda-katalógus is hiányzott (ez a PR pótolja).

Ez nem „majdnem kész”: a fogyasztói érték (regisztráció, közös játék, tartós pont) a mainen kikapcsolt vagy nem létező. Amit megépítettünk,
az alap (tiszta magok, szabálymotor, valós idejű réteg, fiók, biztonsági javítások, évfolyam-bank) — a látható játékélmény és a
közös játék a következő futások dolga.

## 1. Mért tények

### 1.1 Az összevont PR-ok (2026-11-16, #440 és későbbi — 28 PR, +45 025 / −5 448 sor)

| Szelet | PR | Megjegyzés |
|---|---|---|
| terv + végrehajtási utasítás | #440 | 2958 sor, csak doksi |
| J0a determinizmus, J0b tanulási mag, J0c közös UI, J0c-b | #442, #444, #446, #450 | a közös tiszta réteg; csak a J2a és J4a használja |
| JM0 adatvédelem | #443 | ranglista becenévvel, e-mail ki a naplóból, pontbeküldés korlát |
| JM1 szabálymotor, JM1r az egyeszközös aréna törlése | #447, #460 | a #460 −2464 sor (D20) |
| JM2 valós idejű réteg | #452 | `MP_MODE` alapból KI |
| JM7a, JM7b fiók + Google-út | #445, #449 | `PLAYER_ACCOUNTS` KI |
| JM7b-utójavítások N1 / N1b / N2 / N3 | #461, #469, #463 | becenév-szűrő (kétszer), tiltott játékos adatai, törlési kód |
| JM7c-1 admin csak az engedélylistáról | #462 | élesben telepítve (az audit alatt) |
| J2a Szólétra, J4a Matek | #454, #451 | a két átállt játék |
| JBa / JBb / JBc évfolyam-bank | #448, #453, #458 | 90 → 285 tétel évfolyamonként, 3–12. évfolyam |
| közös utójavítás, K.7 cloze, joystick | #457, #455, #456 | joystick: egy holtsáv, folytonos görbe |
| tananyag évfolyam-felirat | #459, #465, #468 | kanban #54 |
| Vihargarázs telefonon + meta-mérő | #467 | kanban #59 |
| kupon-lejárati e2e-ingadozás | #470 | kanban #58 |

Nyitott PR-ok a lekérdezéskor: **#471** (K1 tiltás megőrzése, migráció 0041), **#466** (J4b főellenfél), **#464** (JM3a online párbaj),
**#472** (Belépés / Fiókom belépő), #418 (régi kisfilm-memória, DRAFT; kanban #35).

### 1.2 A main CI

- 2026-11-16 07:10 UTC óta a `main` 28 CI-futásából **21 zöld, 2 bukott, 5 még fut** (a lekérdezéskor a #468, #462, #469, #467, #470 fejei).
  Vagyis az utolsó öt összevonás utáni main zöldje **nem bizonyított**.
- Bukás 1: `9bda1373` (#445 JM7a): `coupon-expired-all-games` › `block-craft-quiz` (1 failed, 1 flaky: `vocab-cross-game-log` A5).
- Bukás 2: `ba9c666c` (#458 JBc): `vocab-cross-game-log` A5 (1 failed), flaky: `block-art`, `block-craft-real-touch`, `joystick-response` (Aszteroida).
- (A napon még egy bukás volt: `b5041240` a #437-nél — az előző, mobil-szóbank futásé, lásd az előző retro: `docs/handoffs/2026-11-16-jatekok-mobil-szobank-retro.md`.)
- Mindhárom bukás Playwright E2E, mindhárom ingadozó teszt vagy közös mérő; a PR-ok saját CI-ja zöld volt (C-49).
- A PR-ok „Háromfázisú rend” kapuja a 24 mai összevont PR-on (audit) mind sikeres.

### 1.3 Amit a review-botok és a független reviewerek fogtak meg (a szelet-alügynök és a CI nem)

| PR | Hiba | Hogyan derült ki |
|---|---|---|
| #466 | a négy válaszgomb két célpozícióra esett, a később renderelt eltakarta az elsőt: a helyes válasz a 0. / 1. indexen érintéssel nem volt választható | Codex / vercel review; a próbabot 37/40-et mutatott 40/40 helyett, és ezt nem vizsgálták ki (C-56) |
| #466 | a bomba esedékessége kérdés nélkül elfogyott | Codex + vercel szál |
| #464 | a szoba létszámplafonja nem a kétfős párbajra volt szabva (review H1); Kezdő szint, vissza-gesztus, egyoldalú visszavágó | független review; az ÚJ-2…ÚJ-5 leletek jegy nélkül maradtak (kanban #61 körébe tartoznak) |
| #462 | az `ADMIN_EMAIL` listaként bontva több címet admin-listává tett volna; a listán kívüli régi admin-jelzők sorsa | független biztonsági review |
| #461 → #469 | a becenév-szűrő első javítása olvasatot CSERÉLT, a 111 kísérletből 28 átment | az újraellenőrzés; a #469 differenciális próbája zárta |
| #463 → #471 | a tiltás törléssel és alias-címmel kijátszható volt (élő tiltott fióknál is) | független biztonsági review (futtatott próbával) |
| #449 | az új admin-fül miatt az `admin-korszerusites` fülszámát csak az egyik tesztfájlban írták át | a CI ~40 perces Playwright-jobja (C-46/2) |
| #458 | két védhető válasz egy szereplő-kérdésnél | PR-review (C-54) |
| orkesztrátor | a képernyőképen levágott „Mind (160)” feliratot „Mind (100)”-nak olvasta | a szelet-alügynök jelezte (C-57) |

## 2. Mi ment rosszul és mennyibe került

1. **Megszakadt a tulajdonos futó tananyaggyártása.** A sorozatos összevonások (egy napon 28 PR, az audit szerint ~15 percen belül három
   éles telepítés: 19:49, ~19:58, ~20:03 UTC) közben a telepítés előtti őr csak kézi, pillanatfelvétel-szerű szkript volt a scratchpadban, és a
   `bc` hiánya miatt egyszer üres összeget adott. Költség: a tulajdonos gyártási futása megszakadt (az érintett futás mérete UNKNOWN,
   az audit szerint a három esti telepítés közbeni megszakadás UNVERIFIED), és bizalomvesztés. Javítás: lásd 3. pont (C-47).
2. **Közös fájlokon ütköző PR-ok.** A `docs/agent-csapdak.md`-t minden szelet-PR bővítette, ezért minden összevonás után a többi ütközött
   (a #457 és a #458 ütközött a mainnel; a végrehajtási fájlban ugyanazon fejezet után beszúró spec-szakaszok is ütköztek). A
   kényszerű „csapda-fájl vissza a mainre” és a feloldások plusz körei. Költség: több push / CI-kör szeletenként (pontos idő UNKNOWN).
   Javítás: a szelet-PR nem írja a katalógust, az orkesztrátor gyűjti (C-48; ez a PR).
3. **Átcsúszott hibák.** A 1.3 táblázat hibái a szelet-alügynök és a saját CI után kerültek elő; a biztonsági jellegűek (#462, #463 / #471,
   #461 / #469) független review nélkül élesbe mentek volna. Költség: utójavító PR-ok (#461, #463, #469, a #471 és a #466 javító körei),
   és az `MP_MODE` / `PLAYER_ACCOUNTS` bekapcsolásának halasztása.
4. **Ingadozó e2e-k és torlódó futtatók.** 3 piros main-futás a napon (kettő ebben a futásban), a ~30 perces Playwright jobok elavult
   commitokon is futottak, a main CI az utolsó öt összevonásra még fut. Költség: várakozás, kézi újraindítás, kanban #58 és a #470.
   Javítás: C-49 (beolvasás a közös réteg változása után; az elavult futások megszakítása).
5. **A terv és a valóság elcsúszott.** Az „Állapot:” sorok a végrehajtási fájlban elavultak voltak (az audit 12 sort talált), a migrációs
   sorszám (0041) két szeletre is ki volt osztva (H6). Költség: az audit és a következő futás félrevezetése. Javítás: ez a PR (3. pont).
6. **Jegyek nélküli leletek.** Az elveszett review-leletek (review-464 ÚJ-2…5, review-462 N2–N4, a #469-es „3 számjegynél több” kevert
   olvasat, a `SESSION_SECRET`-rotáció), a második admin kiesése (H1), a valódi e-mail-címek 7 helyen (H2) — az audit találta meg, jegyük
   nem volt. Javítás: kanban #57, #61, #62, #64 (4. pont).

## 3. Ebben a futásban elvégzett javítások (fájllal)

Ez a PR (docs / ops):

- **Telepítés előtti őr:** `scripts/qa/active-runs-guard.sh` (csak olvasó, `curl`-alapú, `bc` nélkül, kilépési kód 0 / 1 / 2) és a runbook
  `docs/telepites-elotti-or.md` (egy ablak, minden `gh pr merge` előtt, `MP_MODE` után `activeMatches`). CI-ba / hookba nincs bekötve.
- **Csapda-katalógus:** `docs/agent-csapdak.md` C-47…C-60 (14 bejegyzés, a napi alügynök-jelentésekből összevonva, forrás-PR-okkal).
- **A végrehajtási terv állapotsorai:** `docs/specs/2026-11-16-jatekok-jatekelmeny-vegrehajtas.md` (21 sor a tényleges állapotra; a
  JM8a / JM9 / JM10 migrációja 0042 / 0043 / 0044, mert a 0041-et a #471 foglalja).
- **`.gitattributes`:** a `*.sh` mindig LF (Windows `autocrlf` mellett a CRLF eltörné a bash-szkriptet).
- **Retro:** ez a fájl.

A futás közben, a mainre került tartós javítások (kód / teszt):

- Meta-képernyő mérő: `source/tests/support/game-meta-quality.ts` (X1–X8) + `source/tests/game-meta-quality.spec.ts` (#467) — a
  `scrollIntoView` által elfedett `overflow: hidden` görgetés és a jelzetlen belső görgető (C-57).
- Forrás-őr: `source/tests/admin-access-source-guard.test.ts` (#462) — az admin-jog egyetlen forrása az engedélylista.
- Differenciális szűrő-teszt: `source/tests/nickname-filter.test.ts` + `source/tests/fixtures/nickname-main-rejected.json` (#469) — a régi
  elutasítási halmaz rögzítve, 55 579 generált néven main elutasít → PR elfogad: 0, hamis tiltás: 0.
- Joystick: `source/tests/joystick-curve.test.ts`, `source/tests/joystick-response.spec.ts` (#456); mozgó cél két ujjal:
  `source/tests/game-pointer-tap.test.ts` (#457).
- Nyitott PR-ban (még nincs a mainen): a célpont–célpont átfedés mérése a közös mobil mérőben (`source/tests/support/game-mobile-quality.ts`,
  M2) és a főellenfél-esetek (`source/tests/speed-math-boss.spec.ts`, `speed-math-boss.test.ts`) a #466-ban; a tiltás-ujjlenyomat tesztjei
  (`player-account-db.integration.ts`, `admin-authz-matrix-db.integration.ts`) a #471-ben.

Legalább egy konkrét, tartós javítás a repó tudásába: **C-47 + az őrszkript** (a megszakadt gyártás oka kapuszerű eszközzé vált),
**C-48** (a közös, hozzáfűzős doksi tilalma a szelet-PR-oknak), **C-49** (a közös réteg változása után újrafuttatás).

## 4. Kanban (a `list` kimenetéből, 2026-11-16 ~20:20 UTC)

- Ebben a futásban lezárt: #36–#50, #53 (done); #54, #55, #58, #59 `in_review`.
- Nyitott, ehhez a futáshoz tartozó: #51 (J4b — a #466), #52 (JM3 — a #464), #56 (JM7b-utójavítások — a #471 maradéka), #57 (valódi
  e-mail-címek a nyilvános repóban; az audit 7 helyet talált, a jegy 2-t ismert), #60 (Belépés / Fiókom — a #472).
- Új, az audit után felvett: **#61** (elveszett review-leletek pótlása: #462 N2–N4 stb.), **#62** (JM7c-2: a meglévő tanulók / szülők
  játékos-profilhoz kapcsolása), **#63** (telepítés előtti őr — ez a PR a szkriptet adja, a Render-oldali kapu hiányzik), **#64** (kisebb élő
  felületi hibák: Tornado fekvő buborék, Brain Rot felirat-átfedés, Kockavadász kamera), **#65** (ez a retro + csapda-PR), **#66**
  (független audit az utolsó hónap változásairól).
- Gyűjtőjegyek: #32 (J0–J9), #33 (JM), #34 (rendszer-takarítás), #35 (#418 kisfilm), #31 (ingadozó e-mail e2e).
- **Jegy még nincs:** J1, J2b, J3, J5, J6, J7, J8, J9, JM3b, JM4–JM6, JM8–JM11 szeletenként (csak a #32 / #33 gyűjtő) — a következő
  futás előtt szeletenkénti jegyeket kell felvenni (tulajdonosi döntés a sorrendről).

## 5. Nyitott kockázatok (a tulajdonosnak és a következő futásnak)

1. **Második admin (audit H1, MAGAS):** a #462 óta csak az `ADMIN_ALLOWLIST` (vagy egyetlen címes `ADMIN_EMAIL`) a jog forrása; ha a Renderen
   nincs beállítva a lista, a második admin kiesik. Élő érték: UNVERIFIED. Teendő: lista a Renderen, a második admin próbabelépése.
2. **Valódi e-mail-címek a nyilvános repóban (H2, MAGAS):** az audit 7 helyet talált (köztük egy kliens-oldali fájlt, amely az éles JS-be is
   bekerül); a git-történetben a cím akkor is megmarad — a sorsáról tulajdonosi döntés kell (kanban #57).
3. **Elveszett review-leletek (H3, KÖZEPES):** review-464 ÚJ-2…5, review-462 N2–N4 — az `MP_MODE` bekapcsolása előtt kötelezőek (kanban #61).
4. **A fiókok és a közös játék kikapcsolva:** a bekapcsolás feltételei: #471 a mainen (alias-kijátszás, 12 hónap, kulcsrotáció), a #472
   belépő, a #3-as kockázat lezárása, majd Render `PLAYER_ACCOUNTS=on` + telepítés + füstpróba + a tulajdonos próbaregisztrációja;
   az `MP_MODE` a #464 és a leletek után.
5. **Valódi telefonos próba hiányzik:** a joystick (#456) és a Vihargarázs (#467) csak emulációban igazolt (UNVERIFIED).
6. **Tulajdonosi admin-teendő (kanban #54):** a Matek Aréna évfolyama (élesben 2, a cím 3. osztály), a GitHub Kezdőknek (élesben 8,
   Programozás kellene).
7. **A main CI az utolsó öt összevonásra még fut** (a lekérdezéskor); a zöld megvárása nélkül a tulajdonosnak szóló „kész” állítás nem
   érvényes.
8. **A telepítés előtti őr kézi:** a szkript kész, de nincs CI- / Render-kapu; az `AGENTS.md` / összevonási rend betartása fegyelem
   kérdése, amíg külön döntés nem köti be (kanban #63).
9. **A tervezett munka fele hátravan:** J1, J2b, J3, J5–J9, JM3b, JM4–JM6, JM8–JM11; a kód-állapot a végrehajtási fájl „Állapot” soraiban
   a fő igazság.
10. **Munkafák és ágak:** a futás végi higiénia (merge-ölt ágak, lezárt munkafák) a nyitott PR-ok (#464, #466, #471, #472) lezárása után
    esedékes; távoli ág törlése csak jóváhagyással. Ezen a PR-on a saját munkafám (`retro-docs`) is a merge után takarítandó.

## 6. Mi marad ellenőrizetlen

- Hogy a három esti telepítés közben pontosan melyik futás szakadt meg és mekkora kár (az audit nem kapott adatbázis-hozzáférést; a
  tulajdonos admin futáslistája tudja).
- A szeletenkénti időráfordítás (nem mértük; UNKNOWN). A CI Playwright E2E ~30 perc / futás.
- Valódi telefonos próbák (joystick, Vihargarázs, a két átállt játék játékélménye).
