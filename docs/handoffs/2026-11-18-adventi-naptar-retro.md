# Retro — Adventi naptár („Fénylő ablakok”), 1. nap (2026-11-18)

Terv: `docs/specs/2026-11-18-adventi-naptar.md`, végrehajtás: `docs/specs/2026-11-18-adventi-naptar-vegrehajtas.md`.
Mért tényekből (parancskimenetek, ellenőri jelentések); ami nincs mérve, UNVERIFIED jelölést kap. Push, PR, fizetős hívás és
levélküldés a fejlesztő részéről nem történt.

## 1. Mi készült el

| Szelet | Tartalom | Ellenőri ítélet |
|---|---|---|
| docs | terv + végrehajtási utasítás, tulajdonosi döntésekkel | IGEN, FELTÉTELLEL (2 kör) — a feltételek átvezetve |
| S1 | tiszta mag: idő, 95%-szabály, kiosztás, szerződés | IGEN, FELTÉTELLEL (2 kör) — javítva |
| S1b | 300 kézzel írt karácsonyi tétel + validátor | NEM → IGEN, FELTÉTELLEL → IGEN, FELTÉTELLEL (3 kör) — javítva |
| S3c-0 | képgyártó-előkészítés, költségkeret | NEM → IGEN, FELTÉTELLEL — a védelmek külön commitban |
| S2a | migráció 0042, séma, zárolt tároló | az ellenőrnél |
| S2b | végpontok, flag, korlátok, e2e-szezon | IGEN, FELTÉTELLEL — javítva |
| S3 / S4 | naptár-oldal, főoldali kártya (helyőrző képekkel) | folyamatban |

## 2. Mi ment rosszul, és mennyibe került

1. **Sorvég-függő forrás-állítás (CRLF).** Az S3c-0 tesztje `\n`-nel keresett a forrásban; a kicsekkolt ágon (Windows, `autocrlf`)
   a fájl CRLF volt → a `gate:push` bukott. Ár: egy teljes kapufutás (~6 perc) és egy javító commit.
2. **A DB-futtató táblasorrendje.** Az új `advent_progress` a `player_accounts`-ra hivatkozik; a futtató a 0040-es blokkban eldobja
   azt → „cannot drop table … other objects depend on it”. Ár: két ~5 perces futás (az elsőnél a szűrt kimenet a hibaüzenetet is elnyelte).
3. **Szűrt kimenet háttérfutásnál.** A `Select-String`-gel szűrt kimenet nem mutatta a hibát. Ár: egy megismételt ~5 perces futás.
4. **Egymásra épülő ágak és a közös dokumentum vége.** A végrehajtási utasítás végére szeletenként fűzött sor minden ágon ütközött
   volna. Ár: az ágak egyszeri újraépítése (új fej-hashek az ellenőröknek).
5. **Párhuzamos nehéz futások.** A `gate:push` és a DB-kör egyszerre futott → két, a szeletet nem érintő teszt
   (`rt-gateway.test.ts`, `stream-collect.test.ts`) terhelés alatt elbukott (önállóan mindkettő zöld), a DB-kör pedig 475 s-ig tartott
   a 480 s-os korlát mellett. Ár: két megismételt kapufutás.
6. **E2E: Secure munkamenet-süti.** Az e2e-szerver éles módban fut, a vendég HTTP-n nem kap munkamenetet → minden író kérés
   „invalid csrf token”. Ár: egy teljes böngészős futás (~10 perc). A többi munkamenetes spec az `X-Forwarded-Proto: https`
   fejlécet használja.
7. **Tartalom: tematika és ellenőrizetlen állítás.** A karácsonyi készlet első változatában 41 tétel általános téli / naptári
   kérdés volt, és 36 tétel javításra szorult; később két magyarázat nem igazolt részletet tartalmazott. Ár: három tényellenőri kör.
8. **Kapkodó csere.** A 241 / 261 tételt előbb kicseréltem, majd a tényellenőr ítélete (a kérdés és a válasz igazolt) után
   visszaállítottam — egy fölösleges commit és kapufutás.

## 3. Milyen javítás készült el EBBEN a futásban (fájl megnevezésével)

- `source/tests/advent-art-pipeline.test.ts`, `source/tests/advent-source-guard.test.ts`, `source/tests/advent-home-card.test.ts`:
  a forrást olvasó tesztek a szöveget LF-re normalizálják.
- `source/scripts/run-learning-db-tests.ts`: az adventi táblák törlése a 0040-es blokk előtt; az időkorlát 300 s → 480 s (mérve).
- `docs/specs/2026-11-18-adventi-naptar-vegrehajtas.md`: az állapotnapló az utolsó szakasz; a szeletág csak a saját sorát adja hozzá.
- `source/shared/advent/christmas-validate.ts`: évfolyamonkénti minimum + 6 tartalék tesztben, válaszhossz-figyelmeztetés.
- `source/scripts/design-assets/lib.ts`, `run-lock.ts`: hívásonkénti és összesített költségkeret, naplóhiba-megállás, futás-zár.
- `source/server/advent/limits.ts`: a korlátok egy helyen; a létrehozási keret a létrejött sort számolja.
- `source/tests/support/advent-e2e.ts`: a böngészőtesztek közös segédje (`X-Forwarded-Proto`, tesztidő, képernyőkép).
- Külön kapu-munkafa (`.claude/worktrees/adventi-kapu`): a kapuk nem foglalják a fejlesztő munkafát.

## 4. Csapda-javaslatok a `docs/agent-csapdak.md`-be (a katalógus közös fájl — a koordinátor veszi fel)

- **CRLF-munkafa és forrás-állítás.** Tünet: a forrásszövegben `\n`-nel kereső teszt a szerző gépén zöld, ágváltás után bukik.
  Szabály: forrást olvasó teszt a beolvasott szöveget normalizálja LF-re.
- **Új tábla idegen kulccsal és a DB-futtató.** Tünet: a `run-learning-db-tests.ts` az első lépésnél megáll. Szabály: a hivatkozó
  új táblát a futtatóban a hivatkozott tábla eldobása ELŐTT kell törölni.
- **Szűrt kimenet háttérfutásnál.** Szabály: a hosszú futás teljes kimenete fájlba megy; szűrni utána.
- **Nehéz futások egyszerre.** Tünet: a szeletet nem érintő, időzítésre érzékeny tesztek buknak. Szabály: `gate:push`, DB-kör és
  e2e ne fusson egyszerre ugyanazon a gépen; bukásnál előbb önálló futtatás, csak utána ismétlés.
- **E2E és a Secure süti.** Tünet: vendég író kérése „invalid csrf token” az e2e-szerveren. Szabály: munkamenetet igénylő
  böngészőteszt az `X-Forwarded-Proto: https` fejlécet küldi.
- **Egymásra épülő PR-ágak és közös dokumentum.** Szabály: a szeletenként bővülő rész legyen a fájl utolsó szakasza, és az ág csak
  a saját sorát adja hozzá.
- **Ellenőrizetlen tartalom.** Szabály: gyerekeknek szóló tényállítás csak igazolt lehet; bizonytalan részlet a magyarázatból is
  kimarad. Csere előtt meg kell várni az ellenőr ítéletét.

## 5. Kanban

Felvéve (helyi tábla): #151 (átfedő koszorú-tételek, 065 ↔ 007), #152 (a DB-kör bontása), #153 (felolvasás elsősöknek), #154 (S3c
képcsere), #155 (S5, S6, S8), #156 (ágak rebase-e a friss mainre push előtt).

## 6. Nyitott kockázatok

- Határidő: december 1-ig az S3 / S4 és a flag bekapcsolása (S6 része) kell élesben; a végleges képek nélkül a naptár helyőrzőkkel megy.
- A `main` közben elmozdult: minden ág rebase-t és új `gate:push` futást kér push előtt (#156).
- A helyi DB-kör a korlát közelében fut (#152).
- Migrációszám: a tananyag-munkamenet hangtár-szelete is 0042-t készített, a koordinátor 0043-ra számoztatja át; az adventi marad 0042.
  Minden adventi PR megnyitása előtt ellenőrizni kell a friss főágon (`git ls-tree origin/main source/migrations/`), hogy a 0042 szabad-e —
  ha nem, megállás és jelzés. Mérve 2026-11-18, `origin/main` = `2b873e3c`: az utolsó migráció a 0041, a 0042 szabad (a journal csak a 0000-t
  tartja nyilván, a futtató fájlnév szerint dolgozik).

## 7. Kiegészítés — az S2b 2–3. ellenőri köre (2026-11-18)

- **Mi ment rosszul:** az új-sor keret első javítása („csak a létrejött sor számít”) az ellenőrzést és a számolást két adatbázis-kör
  közé tette, így párhuzamos kérésekkel a keret túlléphető lett (U1). A soros teszt ezt nem láthatta. Ár: egy teljes ellenőri kör.
  **Javítás ebben a futásban:** `source/server/advent/limits.ts` (`reserve` / `release`, ablakonkénti söprés),
  `source/server/advent/routes.ts` (`creatingDeviceRow`), `source/tests/advent-limits.test.ts` (120 egyidejű kérés, mutációs
  ellenpróbával). **Tanulság:** keretet / kvótát érintő javításhoz mindig tartozzon egyidejű kéréses teszt.
- **A DB-kör ideje:** terhelt gépen, soros kliensekkel 475 s volt a 480 s-os korlátból; párhuzamos kliensekkel, terheletlen gépen
  300 s (37% tartalék). **Javítás:** `source/tests/advent-routes-db.integration.ts`; a szabály a futtatóban megjegyzésként áll
  (`source/scripts/run-learning-db-tests.ts`): 15% alatti tartaléknál a tesztet kell gyorsítani, nem a korlátot emelni.
- **Egyetlen nagy löket a kapcsolatkészleten (M2):** a 119 egyidejű kérés a 10-es kapcsolatkészleten terhelt CI-gépen ingadozhat.
  **Javítás:** három hullám (40 + 40 + 39); a pontos állítás megmaradt (összesen 90 sor, a harmadik hullám 39 egyidejű kéréséből
  pontosan 9 jut be, 30 kap 429-et) — a keret határát továbbra is párhuzamos kérések támadják.
- **Felülírt szám a terv eredeti helyén (U3):** a tulajdonosi döntés először csak új szakaszba került. **Tanulság:** felülírt
  értéket a HELYÉN kell jelölni (dátum + hivatkozás), nem csak a döntési szakaszban.

## 8. Kiegészítés — felület (S3, S4) és a kibocsátás átszervezése (2026-11-18)

- **Szelet tesztje a következő szelet fájlját olvasta.** Az S3 ág `gate:push` futása megfogta: a tiszta logika tesztje az S4
  kártyafájlját és a képgyártó ág `prompts.json` fájlját is olvasta. Ár: egy kapufutás (~7 perc) és a két ág újraépítése.
  **Javítás:** a teszt kettévált (`source/tests/advent-calendar-client.test.ts`, `source/tests/advent-home-card.test.ts`); a
  készlet-leíró egyezésének tesztje az S3c-be kerül (kanban #161). **Tanulság:** szelet-ágon a kaput a SZELET fáján kell futtatni,
  nem az integrációs ágon — ott minden fájl megvan, és a hiány nem látszik.
- **Félig áttűnt képernyőkép és mérés.** A 300 ms-os megnyíló animáció közben készült kép alig látszott, a méret-mérés pedig a
  kicsinyített gombot mérte (46 px a 48 helyett). **Javítás:** `source/tests/support/advent-e2e.ts` `settle()` — a véges animációk
  végét megvárja mérés és kép előtt.
- **`aria-disabled` gomb és a Playwright.** A zárt ablak koppintása a „engedélyezett” várakozáson akadt el. **Javítás:** a tesztben
  `tap({ force: true })` — a gyerek valóban rákoppinthat, a felület ilyenkor megmondja, mikor nyílik.
- **E2E, Secure süti és az Origin.** Az `X-Forwarded-Proto: https` minden kérésre téve a lapot is elrontotta; csak az API-kérésekre
  téve az Origin-ellenőrzés bukott. **Javítás:** `proxyHeaders()` — csak a teszt API-kérésein, https-re igazított Originnel (a bevett
  minta szerint). Ár: három teljes böngészős futás (~8 perc).
- **429 a gyereknek (M1).** A betelt keret nyers üzenete helyett rövid várakozás, egy automatikus újrapróba és barátságos szöveg:
  `source/client/src/advent/busy.ts`, egység- és böngészőteszttel.
- **Hét egymásra épülő ág helyett három PR.** A CI böngészős köre ~90 perc, a squash-merge minden ráépülő ágon ütközést okoz.
  **Javítás:** a három ág a friss főágról épült fel fájlkészletek szerint, a tartalmi egyezést `git diff` igazolja. **Tanulság:**
  hosszú CI mellett a szeleteket eleve 2–3 PR-ra érdemes tervezni, a kis szelet a commit, nem a PR.
- Kanban: #161 (készlet-leíró egyezésének tesztje az S3c-ben), #162 (az eltűnt kérdés és a zárt ablak üzenete látható is legyen).
