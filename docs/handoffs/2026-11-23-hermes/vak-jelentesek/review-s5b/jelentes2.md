# Független review — TGM S5b, 2. vak kör
Fej: 9c67d3a705fac5f823d5d7a6d9c7c826b98bad87
## Ítélet: IGEN, FELTÉTELLEL
Az előző blokkoló megszűnt, ezt a nyilvános lejátszóban visszamértem. Új blokkolót nem igazoltam. Két javítási szerződés-eltérést és a korábbi dokumentációs hibát jegyre tenném.

## Az előző kör leleteinek sorsa
- **L1 (blokkoló) — megszűnt.** `source/shared/lesson-block-label.ts:93–97` ismert forma esetén a Célkártya utáni első `explain` blokkot keresi, nem az 1-es fizikai indexet. Az új teszt zöld (`source/tests/lesson-opening-forms.test.ts:117–129`). A `/preview/:id` → `LessonView` → `LessonRuntime` úton, a tárolt leckét szimuláló HTTP 200-as válasszal, álló és fekvő telefonon is `A lecke célja | Folyamat | Rejtély | Magyarázat | A lecke tanulsága` jelent meg. A két képen az ábra után a helyes cím és az egész nyitószöveg látszik; az utánuk következő magyarázat nem kapta meg a formacímet.
- **L2 (közepes) — részben.** Bekapcsolt nyitószerződésnél a kért új évfolyam jut a szerzőhöz (`source/server/studio/structured-improvement.ts:182–198`), és abból, ugyanazzal a maggal számol új formát az előnézet és a mentés (`source/shared/lesson-feedback-openers.ts:152–157`, `source/shared/lesson-repair.ts:50–51`, `structured-improvement.ts:313–319`). A formátlan v1 javításában a szerző már nem kap új formát. A segédfüggvénytesztek zöldek (`source/tests/lesson-variety-paths.test.ts:284–302`). A nyitókapcsoló KI ága és a v1 lektorálás eltérést hagyott: L6–L7.
- **L3 (közepes) — a konkrét ellentmondás megszűnt.** `source/shared/lesson-opener.ts:83–86,160–167`: BE ágon a lépcsősor nem ír elő régi meseformát vagy ötödik mondatot, de megtartja a mondatonkénti szóhatárt, címkéket, hangnemet és tanulságot. Az új promptteszt zöld több évfolyamon.
- **L4 (közepes) — a kötelező kvótában megszűnt.** `source/shared/lesson-bank-plan.ts:47–53` csak a magos kitöltőből zárja ki a `gate`-et. A követett teszt 50 mag × 12 csomagszám, azaz 600 kiosztás esetén pontosan két kötelező kaput mért. A `map-6`/10 ellenpéldát külön újraszámoltam: a fej szabályával 2 (`selfCheck, myth` a második csomagban), a szűrést kivéve 3 (`selfCheck, gate`). Ez kvótamérés, nem a modell tényleges válaszának mérése.
- **L5 (kicsi) — nem szűnt meg.** A 11. szakasz és V12 a mentéskori kapcsolót írja; az invariáns és a kód a tárolt leckéből indul ki.

## Leletek (blokkoló / jegyre menő; fájl:sor, forgatókönyv, evidencia, javítási javaslat)
### L6 — Közepes: nyitókapcsoló KI mellett az évfolyamváltás olyan formát ír be, amelyet a javítás nem kért
**`source/shared/lesson-feedback-openers.ts:154–155`.** A tulajdonosnak van egy megjelölt harmadikos leckéje; a külön `STUDIO_LESSON_OPENER` kapcsolót kikapcsolja (dokumentált üzemmód: `docs/lesson-improvement.md:46`), majd az asztali adminfelületen 12. osztályra igazíttatja a tanítást, a meglévő nyitás megtartását kérve. A szerző nem kapja meg a kiosztott formát (`source/server/studio/step-io.ts:556`), de az előnézet és alkalmazás jelölőkezelője újraoszt, ha a tárolt leckén volt forma és az évfolyam eltér. A változatosság BE/KI állapota ettől még a tárolt jelölőből jön.

**Evidencia:** a böngészős próba külön kiszámolta az `m1` mag formaindexét az FNV-1a és mulberry32 algoritmussal: 3, vagyis `helyzet` → `megfigyeles` (`source/shared/lesson-opener.ts:108,120`). Azonos nyitószöveg fölött a nyilvános lejátszó `Megfigyelés` címet mutatott az átszámolt jelölővel, `Helyzet` címet a megtartottal. A tárolt választ szimuláltam; a saját szerverpróbát a futtató nem engedte elindítani, így a teljes javítás és mentés **UNVERIFIED**. A base csak verziót tárolt, az előző ágfej (`20a1823b`) pedig továbbvitte a formát; az átszámolást a mostani commit vezeti be. **Javítás:** csak akkor cseréljék a formát, ha a javító szerző ténylegesen megkapta az új kiosztást. Ugyanaz a szerver által eldöntött nyitástervezet jusson a promptba, az előnézetbe és a zárolt mentésbe; alkalmazáskor ne olvassák újra a környezetet.

### L7 — Közepes: a v1 leckén a szerző régi mesét kap, a lektor nem létező új kiosztást ellenőriz
**`source/server/studio/step-io.ts:686`.** Bekapcsolt nyitókapcsoló mellett a tulajdonos teljes javítást kér egy `valtozatossag-1` leckére. A `repairVarietyOption` formátlan v1-re `undefined`-ot ad (`source/server/studio/structured-improvement.ts:45–46,198`), így a szerző `PONTOSAN 5` mondatos mini mesét kap (`source/shared/lesson-opener.ts:153–167`). A lektor ugyanebben a javításban a jelölő puszta jelenléte alapján v3-at kap (`structured-improvement.ts:257–258,277`): 3–6 mondatot és a kiosztott forma követését ellenőrizné (`lesson-opener.ts:220–226`), holott nem volt kiosztás. A base lektora a régi ötmondatos szerződést kérte számon. Az eltérés a promptok feltételeiből ellenőrizhető; hogy emiatt a modell ténylegesen ír-e téves figyelmeztetést, **UNVERIFIED**. Az ilyen `age` jegyzet eleve nem blokkol (`source/server/studio/lektor.ts:68–88`). **Javítás:** a futás visszajelzési/bankállapotától külön kezeljék, hogy volt-e S5b-nyitáskiosztás; a lektor azt ellenőrizze, amit a szerző megkapott.

### L5 — Kicsi: V12 és a futási invariáns eltérő forrást nevez meg
**`docs/specs/2026-11-20-tgm-valtozatossag-abrak.md:214–216,226–227`.** Ha a tulajdonos előnézet és alkalmazás között állít a változatossági környezeten, a V12 szerint a mentéskori kapcsolót kellene követni. A kód helyesen a zárolt, tárolt leckére épít (`source/server/studio/structured-improvement.ts:313–319`), a 7. szakasz és a megbízás invariánsa szerint. **Javítás:** V12 és a 11. szakasz a tárolt állapotot írja le, valamint azt az esetet, amikor az újra kiosztott formát együtt kell vinni az új nyitással.

## A hibakereső pontok (ítélet + bizonyíték)
1. **Adatszerződés — talált hiba.** L6 (szerző → jelölő → lejátszó), L7 (szerző → lektor). A kéretlen modelljelölő eldobását, az előnézeti jelölőt mindkét forrásábra-ágon és a tranzakcióhash-teszteket futtattam; ezek nem buktak.
2. **Biztonság és adatvédelem — nem sikerült megtörni a változott részt.** A címke csak saját szótári kulcsról jön (`lesson-block-label.ts:93–95`), a javítás jelölője nem a modellé. A változott éles kód nem ad hozzá URL-paramétert, végpontot, naplómezőt vagy GET-írást; a próbaoldal `opening` paramétere formaazonosító. Nem általános jogosultsági audit.
3. **Regresszió — a mért KI utat és régi megjelenítést nem sikerült megtörni.** A forrásvizuál-lenyomatok, a régi kvóták és a jelöletlen visszajelzés tesztjei zöldek. A tényleges `valtozatossag-1` válasz a nyilvános lejátszóban `Történet` maradt. A v1 *újrajavítása* külön L7.
4. **Europe/Budapest — nem alkalmazható.** A kiosztás bemenete a mag, évfolyam és csomagszám; nincs új óra- vagy dátumhatár.
5. **Migráció, indulás, cron, leállítás — a változott kódra nem alkalmazható.** Nincs migráció, Drizzle- vagy ütemező-változás. Az eldobható e2e szerveren a három nézet betöltött, ez nem migrációs ellenőrzés.
6. **Megszakítás, párhuzamosság — a mért folytatást nem sikerült megtörni.** Követett teszt a banknál megszakadt gyártást ellenkező környezetben folytatja mindkét irányban. A változatossági env egyetlen közvetlen olvasója `source/server/studio/lesson-variety-flag.ts:8`; a javítás a tárolt jelölőre nyit hatókört. Alkalmazáskor zárolt lecke mellett előnézeti lenyomatot ellenőriz; a párhuzamos DB-alkalmazást nem futtattam.
7. **Tesztminőség — részben megtört.** L1/L4 új tesztjei konkrét kimenetet ellenőriznek. L4-nél saját számolómodellben a védő szűrés kivétele visszahozta a korábbi hibát, amit az `== 2` állítás elkapna; a tényleges TS-modult nem mutáltam. L2 tesztjei két segédfüggvényt külön hívnak, így nem mérik az eltérő nyitókapcsoló-állást vagy a szerző–lektor összhangot. A javító commit nem törölt tesztet. A `nyitomese-3` váltás dokumentált, V12 nincs összehangolva (L5).
8. **S5b, V8–V12.** V8: a futott lenyomatok és régi kvóták zöldek. V9: a determinisztikus forma/név és a régi kötött lépcsőmondat eltávolítása zöld; javításkor L6–L7. V10: a kiosztott kvóták zöldek. V11: a korábbi ábrás esetre és az asztali próbában zöld. V12: visszaolvasás-teszt zöld, az évfolyamváltó szerződésnél L5–L6 maradt.
9. **Egyéb — nem sikerült megtörni.** Ismeretlen v2 forma és tényleges v1 marker esetén ellenőriztem a régi címet. A jelölő kihagyása a workflow tartalmi összevetéséből nem kapcsolja ki a teljes mentett JSON tranzakcióhash-ellenőrzését (`source/server/workflows/apply.ts:22–25`); az eltérő tartalom és hash elutasításának tesztje zöld.

## Mit próbáltam megtörni, és nem sikerült
- Ábrát illesztettem a Célkártya és a nyitás közé álló és fekvő nézetben. Az ábra után a megfelelő szöveg kapta a formacímet; a megtekintett álló, fekvő és asztali képen a vizsgált cím és szöveg nem vágódott le.
- Kerestem külön `STUDIO_LESSON_VARIETY` olvasót; nem találtam. Futtattam a megszakításos, modelljelölős és bankátvételi teszteket.

## Mit NEM vizsgáltam
- Nem indítottam valódi vagy fizetős AI-gyártást. A teljes évfolyamváltó szerző–bank–lektor–DB út és az alkalmazás/visszaállítás közbeni párhuzamosság **UNVERIFIED**. A saját TS-próbát a Node-homokozó nem engedte elindítani. A teljes DB-integrációs csomagot nem futtattam; a megtalált alkalmazási integrációs eset a régi HTML-ágat méri.
- Nem hasonlítottam össze minden régi lecke HTML-jét bájtonként, és nem futtattam bejelentkezett tanulói vagy valódi admin böngészőutat. A nyilvános előnézetet, próba-fixtúrákat és célzott követett teszteket használtam. A hálózati hibát és a modell tényleges válaszában érkező módszerek sorrendjét nem mértem célzottan.

## Megcáfolt gyanúk
- A megváltozott `withVarietyMarker` nem engedi a modelltől jött jelölőt KI mentésbe; a mentési és checkpoint-teszt ezt a forrásvizuál BE ágán is ellenőrzi.
- A közbeillesztett ábra javítása nem adja oda a következő magyarázatnak is a formacímet; a DOM sorrendje, a képek és a célzott egységteszt is ezt mutatta.

## Mit futtattam (parancs + eredmény)
- `npx tsx --test source/tests/lesson-opening-forms.test.ts source/tests/lesson-bank-plan-seed.test.ts source/tests/lesson-variety-paths.test.ts source/tests/source-visuals-flag.test.ts source/tests/apply-readback.test.ts source/tests/lesson-variety-flag.test.ts source/tests/lesson-feedback-openers.test.ts` — 60/60 zöld. Az importok DB-kapcsolati próbálkozása konfiguráció híján hibát naplózott; ez nem DB-futtatás.
- `npx tsx --test source/tests/lesson-fusion-repair.test.ts source/tests/lesson-block-label.test.ts source/tests/lesson-source-visual-kinds.test.ts source/tests/verdict-feedback-variety.test.ts` — 52/52 zöld, DB nélkül.
- `npx tsx --test source/tests/lesson-opener-bank-reuse.test.ts` — 3/3 zöld.
- `npx tsc --noEmit -p tsconfig.test.json` — sikeres.
- `run_browser_scenario .blind-review-tmp/s5b-browser.json` — három sikeres eset; `scrollWidth/clientWidth`: 360/360, 844/844, 1280/1280. Az álló, fekvő és asztali képet szemrevételeztem. A lejátszói állítások teljesültek, a konzolban kiegészítő 404-ek voltak.
- `run_browser_scenario .blind-review-tmp/s5b-repair-headers.json` — három eset: változatlan szöveg mellett `Megfigyelés` / `Helyzet`, v1 kontrollnál `Történet`. A javítási szerverút itt nem futott, csak a megjelenítő.
- `run_browser_scenario .blind-review-tmp/s5b-quota-oracle.json` — saját számolómodell, `map-6`, 10 csomag: 2, a szűrés kivételével 3 kötelező kapu. Két korábbi megadás a forgatókönyv-formátum validációján állt meg.
- `node .blind-review-tmp/s5b-repair.ts` — nem futott: a homokozó elutasította (Node v24.22.3, hálózati izoláció hiánya).

---
## Gépi összegzés (a futtató írta, nem az ellenőr)

A leletek fájl:sor hivatkozását és idézetét a futtató a vizsgált fej munkafájában ellenőrizte; a „futtatással igazolt” oszlop a
futtató saját parancsnaplójával egyezik (a parancs, a kimenet-részlet és a próba bemenete); „teljes út” csak böngészős vagy
adatbázisos futás lehet, a saját homokozós / egységteszt-próba legfeljebb „részben igazolt”. Ez azt igazolja, hogy a lelet valódi
kódra mutat és a futás megtörtént — a következtetés helyességét nem.

| Súlyosság | Leletek | Igazolt hivatkozás | Futtatással igazolt (teljes út) | Részben igazolt (elszigetelt próba) | Érvénytelen (nem visszaellenőrizhető) |
| --- | --- | --- | --- | --- | --- |
| blokkoló | 0 | 0 | 0 | 0 | 0 |
| közepes | 2 | 2 | 1 | 0 | 0 |
| kicsi | 1 | 1 | 0 | 0 | 0 |

### Blokkoló és közepes leletek (mind igazolt hivatkozással)
- **L6** (közepes) Nyitókapcsoló KI mellett az évfolyamváltás ki nem küldött nyitásformát ír a jelölőbe — `source/shared/lesson-feedback-openers.ts:154` — hivatkozás igazolt; futtatással igazolt (teljes út)
- **L7** (közepes) A v1 javítás lektora olyan kiosztást ellenőriz, amelyet a szerző nem kapott meg — `source/server/studio/step-io.ts:686` — hivatkozás igazolt

### Érvénytelen leletek
(nincs)

### Futás
- modell (a válasz szerint): openai/gpt-6.2-sol; szolgáltató (a válasz szerint): OpenAI; modellhívás: 30 (újrapróba: 0)
- gondolkodó (reasoning) tokenek összesen: 4895
- tokenek: 3456977 bemeneti (ebből gyorsítótárból: 3281562, gyorsítótárba írva: 175325), 23766 kimeneti
- gyorsítótár-találati arány a 2. hívástól: 95.4%; becsült megtakarítás: 12.2946 USD
- költség (a tényleges usage alapján): 1.0043 USD
- gépi zár-várakozás összesen: 0.0 perc (a falióra-keretbe nem számít)
