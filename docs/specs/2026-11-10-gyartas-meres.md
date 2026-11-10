# Gyártás-mérés 2026-11-10 — két élő futás mérése és a mért hibák javítása

**Tier:** L · **Kanban:** #9 · **Tulajdonosi kérés (2026-11-10):** „az itt lefutott folyamatok alapján mérd meg, keresd meg a
jelenlegi működési hibákat, hiányosságokat, be nem fejezett fejlesztéseket, és valósítsd meg egymás után”.

## Mérés (tény, forrással)

Két élő gyártás a Stúdió feltöltéses útján (Kanban #1, `docs/specs/2026-09-29-nat2020-grade6-knowledge-vegrehajtas.md`):

| | 1. futás (job `4a1a697d`, Az energia) | 2. futás (job `e375332b`, Egész számok) |
|---|---|---|
| Teljes idő | 21,9 perc | 20,9 perc |
| Becsült költség (a skill képletével) | 5,27 USD | 5,10 USD |
| Modellhívás | 42 | 45 |
| Gyakorlóbank | 862 mp, 13 kör, 3 javító, 2,85 USD | 1113 mp, 12 kör, 4 javító, 3,14 USD |
| Ellenőrzés (válaszkulcs, vak kvíz) | 482 mp, 26 hívás, 1,27 USD | 549 mp, 32 hívás, 1,45 USD |
| Tananyag | 321 mp, 0,86 USD | 127 mp, 0,39 USD |
| Lektorálás | 115 mp, 3 kör, 1,15 USD | 48 mp, 1 kör, 0,51 USD |
| Tananyagterv | 38 mp, 1 javító | 32 mp, 1 javító |
| Kapuk | lektor 2 kivétel, rubrika-szigorítás 6 | válaszkulcs-bukás 4, szigorítás 5, vak kvíz 1 kivétel |

Forrás: `GET /api/studio/jobs/:id` → `produced.telemetry` (admin-munkamenet), ár: a `websuli-gyartas-analitika` skill képlete.
A bank a futásidő 66–89%-a és a költség 54–62%-a.

A javítókörök okai (Render-napló, `kísérlet:` sorok, 05:50–06:45 UTC, 7 sor):

- 4 × „Ismétlődő kérdés egy korábbi csomaggal: … („Melyik állítás hamis?”)” — 57%;
- 3 × válaszkulcs-teszt (túl megengedő rubrika) — ismert A1 kategória, meglévő kezeléssel.

## Mért hibák

### M1 · egyetlen ismétlődő kérdés a teljes bankcsomag újragyártását váltja ki

`server/studio/experience-builder.ts:879-882`: a párhuzamosan épülő csomagok nem látják egymást; ha a keresztellenőrzés
(`crossProblems`) bármit talál, a kifizetett csomag törlődik a mentésből, és a `buildUnit` a TELJES csomagot újraírja.
Mérve (2. futás naplója): az első öt csomag 06:23:47-re kész; utána a 4. fejezet teljes újragyártása 06:28:18-ig
(15 460 kimeneti token), az 5. fejezeté 06:30:52-ig (14 209 token) — 7 perc a bank 18,5 percéből. Az újragyártott 4. csomag
maga is ismétlődő kérdéssel jött vissza; azt a célzott javítómód 7 mp alatt, 782 tokennel javította (06:28:25). Tehát a
célzott javítás ugyanarra a hibára kb. 40-szer olcsóbb, mint az újragyártás.

Két további hiányosság ugyanitt:

- **M1b · hamis ismétlődés.** A `questionKey` (`shared/lesson-experience.ts:256`) csak a kérdés szövegét nézi. A „Melyik
  állítás hamis?” típusú kiválasztó kérdés tartalma az opciókban van; két ilyen kérdés eltérő opciókkal két különböző
  kérdés, a program mégis ismétlődésnek veszi (a mért 4 javítókör mind ilyen).
- **M1c · a napló nem mondja meg, miért épül újra egy csomag** (a 879. sor ága néma).

### M2 · a célkártya és a nyitómese fejléce „Magyarázat”

A 2. futás leckéjében (`49780f86-…`) az 1. fejezet első két blokkja „Magyarázat” fejlécet kap „A lecke célja” és „Történet”
helyett. Ok: a gyártási utasítás önellentmondó — `shared/lesson-opener.ts:91` szerint a négy bekezdés a szakasz-címkékkel
kezdődik (az első „Célunk”), a 92. sor szerint viszont „az első bekezdés … címke nélkül is érthető”; a modell elhagyta a
címkét. A felismerő (`shared/lesson-block-label.ts:23-27`, `isGoalCardText`) a címkét megköveteli, ezért a kártya és utána a
mese is az alapcímkére esik. Mért szöveg: „A lecke végére érted, mit jelent egy negatív szám…” + három címkés bekezdés.

### M3 · a számegyenes feliratai nem a nullához igazodnak

`client/src/lesson-runtime/blocks/explanatory-visuals.tsx:454-512` (`RichNumberLineAnim`): a felirat minden
`labelEvery`-edik osztáshoz kerül, a számolás a bal széltől indul. Mért ábrák: `from:-10,to:10,step:1` → feliratok −10, −7,
−4, −1, 2, 5, 8, miközben a jelölt pontok −3, 0, 5; `from:-14,to:2` → −14, −11, −8, −5, −2, 1, a 0 („tengerszint”) és a −12
felirat nélkül. Egy hatodikosnak a 0 nélküli számegyenes félrevezető.

## Javítások

- **J1 (M1)** A keresztellenőrzésen megakadt csomag NEM épül újra: a `buildUnit` a kész csomagot javítási alapként kapja, és a
  meglévő célzott javítómód csak a megnevezett tételeket cseréli. Teljes újragyártás csak akkor marad, ha a hiba tételhez nem
  köthető. A válaszkulcs-teszt és a kvíz vak előszűrője tartalom szerint gyorsítótáraz (`answer-key-writer.ts:93`,
  `quiz-blind-check.ts:57`), ezért a változatlan tételek ellenőrzése a javítás után nem kerül új modellhívásba. A csomagok
  közti kapukérdés-ismétlődés is megnevezi a tételt, így az is célzottan javítható.
- **J1b (M1b)** Közös `quizDuplicateKey`: kiválasztó kérdésnél (zárt minta: „Melyik állítás / mondat / kijelentés /
  megállapítás hamis / igaz / helyes / helytelen / téves?”) a kulcs a kérdés ÉS a rendezett opciókészlet; minden más kérdésnél
  változatlanul a `questionKey`. Mindhárom ellenőrzési pont ezt használja (csomag-séma, csomagok közti összevetés, gépi
  normalizálás).
- **J1c (M1c)** Naplósor a keresztütközésről: fejezet, a hibák első három sora, és hogy célzott javítás vagy újragyártás indul.
- **J2 (M2)** (a) Az utasítás 92. sora egyértelmű: a cél bekezdése a „Célunk:” címkével kezdődik. (b) A felismerő címke nélküli
  első bekezdést is elfogad, ha utána legalább két címkés (akadály / miért / megoldás) bekezdés áll, és az első bekezdés maga
  nem ilyen címkés — a már közzétett leckék (köztük a mai) is helyes fejlécet kapnak.
  Megvalósítási pontosítás: a címke nélküli esetben a folytató címkéknek FÉLKÖVÉRNEK kell lenniük (`**Miért?**`) — a sima
  „Miért? …” sor nem elég, különben a meglévő `lesson-block-label.test.ts:34` ellenpéldája célkártyának számítana (a mért
  szövegben a címkék félkövérek).
- **J3 (M3)** A feliratok „szép” lépésközzel (1, 2, 5, 10, 20, 50 …) a 0-hoz igazodnak; a 0 mindig feliratot kap, ha a
  tartományban van; az osztásvonalak a szerző `step` értékénél maradnak. Ha az osztások nem a 0 rácsán állnak (pl. 1, 3, 5, 7, 9), a
  felirat a korábbi, sorszám szerinti ritkítással kerül ki (az ábra nem maradhat számok nélkül).

- **J4 (felmérésből) · az admin tömeges „Email” gombja valótlan sikert jelez.** `server/routes.ts:3466-3467`: a végpont
  `// TODO` mellett `{ success: true, message: "Bulk email sending not yet implemented" }`-et ad; a kliens
  (`client/src/components/AdminFileDashboard.tsx:291-299`) erre „Email értesítések elküldve” üzenetet mutat. Javítás: a végpont
  501-et ad magyar üzenettel, a kliens a hibát mutatja (nem sikert). A tényleges tömeges küldés megvalósítása nem cél (külső
  címzetteknek menne; külön döntés).

- **J5 (felmérésből) · a tanuló eredménye hálózati hibánál elvész.** `client/src/lesson-runtime/resultReport.ts:39`: a beküldés
  egyszer próbálkozik, a hiba csendes. Ráadásul az `apiRequest` beépített újrapróbálása (`client/src/lib/queryClient.ts:232-240`)
  épp a hálózati hibát és az időtúllépést nem ismeri fel, mert azokat előbb magyar szövegű `Error`-ba csomagolja (`:216-225`), a
  feltétel pedig a csomagolatlan `TypeError` / `AbortError` típust keresi. Javítás: közös `isRetryableRequestError` (a `cause`
  láncot is nézi), és az eredménybeküldés 3 újrapróbálást kér. Biztonságos, mert a szerver a kört egyedi kulccsal egyszer rögzíti
  (`server/lesson-result-email.ts:50`, `onConflictDoNothing`). Az írási műveletek alapértéke (0 újrapróbálás) nem változik.

## A felmérés további tételei (ebben a körben nem készülnek el)

A félbemaradt munkák felmérése (2026-11-10, 15 tétel) szerint nyitott PR és kihagyott teszt nincs. Ügynök által elvégezhető,
későbbi szelet: forrásőr a `try` nélküli aszinkron
útvonalakra, a nyitómese S3 / S4 szelete (`docs/specs/2026-11-08-nyitomese-jatekos-kerdezes.md:214-216`), a katalógus-eredmények
admin-nézete. Tulajdonosi lépés: a proxy-titok, a Render build-parancs és a `RENDER_API_KEY`, az Antigoné-lecke célzott javítása,
a 62 függő fogalom tanári átnézése, iPhone-próba.

## Review #414 utáni pontosítások

- J1: a javítási alapban az azonosító a három bankon át együtt egyedi (különben teljes újraírás marad).
- J1b: az opciókulcs megőrzi az összehasonlító és egyenlőségjeleket („x < 0” ≠ „x > 0”); csak a kis-/nagybetű és a szóköz nem számít.
- J2: a címke nélküli tartalék csak a Célkártya pontos alakjára illik — négy bekezdés, a 2–4. mind félkövér címkés.
- J3: ha a tartomány átlépi a 0-t, de a 0 nem osztás, külön 0 jelölés készül; a 0 tűrése a lépéshez mért.

## Nem cél

- A kvíz- és feladatszám, a 45/75 kapu, a tartalék, a válaszkulcs-teszt vagy a lektor mércéjének változtatása.
- Modellcsere az ellenőrzésben (olcsóbb modell): minőségi döntés, tulajdonosi.
- A halmazábra (darabszámos Venn, „3 3 0 0”) újratervezése: az adat helyes, a megjelenítés szegényes — külön tétel.
- A helyes válasz helyének eloszlása a leckén belüli ellenőrző kérdésekben (1. lecke: 6/8 az A): 8 elemű minta, nem igazolt hiba.

## Edge case-ek

- J1: a keresztütközés csak kapukérdés-ismétlődés (tétel nélküli üzenet) → marad a teljes újragyártás.
- J1: a javítómód nem javít (elakadás) → a meglévő út (korai kivétel / mentőkör) dönt; a csomag a padló alá nem mehet.
- J1: a javított csomag azonosítói és `sourceHash`-e a korábbi szabály szerint bélyegződnek (ugyanaz a hash, sorszám szerint).
- J1b: azonos kiválasztó kérdés AZONOS opciókészlettel (bármilyen sorrendben) továbbra is ismétlődés.
- J1b: a nyílt feladatok kulcsa nem változik.
- J2: „Célunk az, hogy …” egyetlen mondat címkés folytatás nélkül továbbra sem célkártya (review #405 tesztje változatlan).
- J3: tört lépésköz (0,5), csak pozitív tartomány (0 nincs benne), 7-nél kevesebb osztás (minden felirat marad).

## Elfogadási feltételek (EARS)

- WHEN egy párhuzamosan épült csomag egyetlen kvízkérdése ismétlődik egy korábbi csomaggal, THEN a következő modellhívás
  javítómódú (a kérésben „JAVÍTÁSI MÓD”), és a csomag többi tétele változatlan marad.
- WHEN két kiválasztó kérdés szövege azonos, de az opciókészletük eltér, THEN egyik ellenőrzési pont sem jelez ismétlődést;
  WHEN az opciókészlet is azonos, THEN jelez.
- WHEN az 1. fejezet első blokkja címke nélküli célmondat + legalább két címkés bekezdés, THEN a fejléce „A lecke célja”, a
  következő szövegblokké „Történet” / „Mese”.
- WHEN a számegyenes tartománya tartalmazza a 0-t, THEN a 0 feliratot kap, és minden felirat a választott lépésköz többszöröse.
- A meglévő tesztek változatlanul zöldek (tesztet gyengíteni tilos).
- WHEN a javítás élesben van, THEN egy új élő gyártás bankideje mérhetően rövidebb a mai 862–1113 mp-nél (UNVERIFIED az
  összevonásig; a mérés a végrehajtási utasítás utolsó lépése).
