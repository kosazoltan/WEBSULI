# Spec: a lecke-javítás ne rontsa a gyakorlóbankot

> Dátum: 2026-11-03 · Szerző: Claude (Kósa Zoltán kérésére) · Állapot: JÓVÁHAGYVA (tulajdonosi utasítás: „nézd át és javítsd, hogy a
> tananyag újragyártása ne rontsa a tananyag minőségét”; „ne legyen felesleges újragyártás, fölösleges költség”)

## Mért tények (2026-11-03, Antigoné, javítás `<javítás-azonosító>`)

- A tulajdonos egyetlen mondat javítását kérte. A tanítószövegben pontosan 1 blokk változott (0. fejezet), az 1–6. fejezet bájtra azonos.
- Ennek ellenére mind a 7 fejezet gyakorlóbankja újragyártódott: kvíz 98-ból 7, feladat 59-ből 1 azonos a régivel.
- Minőség, mérve ugyanazokon a 2×111 vak, helyes diákválaszon (a rubrikát nem látó ügynök írta), a valódi pontozóval
  (`shared/lesson-experience-score.ts`):
  - régi bank 81,3% átlag, 3 nullás helyes válasz;
  - új bank 66,5% átlag, 15 nullás helyes válasz.
  - Az új rubrikák szigorúbbak: kötelező csoport 2,83 → 3,32, alternatíva csoportonként 3,27 → 2,78, minWords 7,7 → 9,2.
- A független szakmai átnézés az új bankban 4 tárgyi vagy kulcshibát talált (`1442` visszajelzés, kétértelmű „Kreón családja”
  popup, „kiengedi a lányt” önellenőrzés, hajóhasonlat), a régiben egyet sem. A repo összes meglévő kapuja mindkettőn zöld.

## Gyökérok

1. **Holt újrahasznosítás.**
   - `server/studio/experience-builder.ts` a korábbi bank csomagját csak akkor veszi át, ha a csomag `sourceHash`-e egyezik a mostani
     fejezet-hash-sel.
   - Ez a hash a fejezet tartalmán kívül a gyártási konfigurációt is tartalmazza: módszer- és kalibrációs verzió, bank-szerep és
     munkafolyamat skill-verziója, katalógus és memória verziója, pontozási szabály (`unitTeaching`).
   - A gyártás (`single-run/engine.ts` `buildBank`) katalógust és memóriát ad, a javítás (`structured-improvement.ts`
     `finishStructuredImprovement`) nem. Bármely skill- vagy promptfrissítés után sem egyezik.
   - Ezért a javítás a változatlan fejezetek bankját is mindig újragyártja: drágán, és a már lektorált tételeket elveszítve.
2. **Gyengébb kapuk a javító úton.**
   - A gyártás a bankcsomagra bekapcsolt vak minőségkapukat futtat: válaszkulcs-teszteket (helyes és hibás próbaválaszok a valódi
     pontozón) és a kvíz kulcs nélküli előszűrőjét.
   - A javító út ezek nélkül hívja a banképítőt. Ezért kerülhettek be olyan rubrikák, amelyek a helyes diákválaszt elutasítják.

## 1. Cél

- A javítás a TARTALMÁBAN változatlan fejezet bankját változatlanul megtartja: ugyanazok a tételek és azonosítók, modellhívás nélkül,
  ha a mostani kapukon átmegy.
- Csak a ténylegesen megváltozott fejezet bankja gyártódik újra, és ugyanazokkal a vak minőségkapukkal, mint a gyártásban.
- Az Antigoné élő leckéje visszakapja a javítás előtti, jobb gyakorlóbankot. A javított mondat és az új borító marad. Újragyártás és
  modellköltség nincs, a hivatalos alkalmazási úton megy (mentés, tranzakció, kvízexport, verzióemelés).

## 2. NEM cél

- A tanítószöveg javítási logikája (szerzői hívás, lektor, forrás-helyesbítés) változatlan.
- A gyártás (`runSingleRun`) viselkedése változatlan, csak a közös kapu-segédfüggvényt használja.
- A katalógus és a memória bekötése a javító útba nem cél: ezek kapcsolós prompt-kontextusok, nem minőségkapuk.
- A pontozó (`evaluateOpenAnswer`) és a meglévő rubrikák tömeges lazítása nem cél. Ez a régi bankokat is érinti, külön mérés kell
  hozzá (follow-up).
- A borítókép-csere más munkamenetben fut. Az Antigoné `art` mezője nem változik.

## 3. Érintett területek

- `source/server/studio/experience-builder.ts`: új `previousSections` függőség; tartalom szerinti átvétel; az átvett csomag a régi
  hash-sel bélyegződik.
- `source/server/studio/single-run/engine.ts`: exportált `bankQualityGates` (válaszkulcs-teszt + kvíz vak előszűrő) egy helyen; a
  `buildBank` ezt használja.
- `source/server/studio/structured-improvement.ts`: a javítás átadja az eredeti fejezeteket és a közös kapukat a banképítőnek.
- `source/tests/repair-bank-reuse.test.ts` (új).
- Adat: az Antigoné lecke 3. verziója egy új `improved_html_files` jelölt alkalmazásával. Egyszeri, gitignore-olt harness:
  `source/.harness/live/`.

## 4. Rögzített döntések és kényszerek

- **A „tartalmában változatlan” fejezet:** a korábbi bankterv (`bankPlan.units`) azonos `sectionIndex`-ű egységének `conceptIds`
  halmaza egyezik, ÉS a fejezet ábra nélküli kanonikus JSON-ja (`withoutFigures`) egyezik az eredeti leckéével.
- **Az átvett csomag:** a korábbi bank azon tételei, amelyek `sourceHash`-e a korábbi egység `sourceHash`-e. Az átvétel feltétele a
  meglévő út: `salvageSchema` + `validate`, a mostani kapuk. Bukás esetén a régi viselkedés (újragyártás) jön.
- **Bélyegzés:** átvételkor a csomag és az egység `sourceHash`-e a korábbi hash marad. Így a tételazonosítók, a tanulói előzmények és
  a következő javítás átvétele is megmarad.
- **Tartalék:** forrás-helyesbítés (`owner.corrections`) esetén az érintett fogalmú egység nem vehető át. A javítás végén a lektor a
  teljes bankot ellenőrzi; a blokkoló tétel a meglévő `removeLektorBlockers` szerint kiesik.
- **Közös kapuk:** a `bankQualityGates` ugyanazokkal a vészfékekkel működik (`STUDIO_ANSWER_KEY_TESTS=0`, `STUDIO_QUIZ_BLIND=0`), mint
  eddig a gyártásban.
- **Antigoné helyreállítása:**
  - jelölt = élő v2 lecke, `experience` = a javítás előtti (v1) bank;
  - `lessonRepairSchema` jelölt, `status: pending`, a frissességi hash-ek a mostani állapotból;
  - alkalmazás a meglévő admin végponttal (`POST /api/admin/improved-files/:id/apply`): ez fut minden kaput
    (`assertRepairCandidate`), mentést, kvízexportot és visszaolvasást.

## 5. Edge case-ek

- Az eredeti lecke régi módszerverziós bankú (`previous.version !== LESSON_METHOD_VERSION`): nincs átvétel (régi szabály).
- A fejezet sorrendje vagy száma változott: indexenként hasonlítunk. Eltérő fejezet → újragyártás.
- A változott fejezet csomagja ismétlődő kérdést hoz egy átvett csomaggal: a meglévő keresztellenőrzés újraépíti.
- Lektori visszajelzéses kör (`reviewFeedback`): a meglévő hash-út érvényes, a tartalom szerinti átvétel csak visszajelzés nélkül.
- Az Antigoné alkalmazása közben fut a borító-munkamenet: arra a leckére nem ír (koordinálva). Ha mégis, a frissességi kapu
  „megváltozott” hibával megállít, és adat nem sérül.

## 6. Elfogadási kritériumok (EARS)

- WHEN a javítás egy fejezet tanítását nem változtatja, és a gyártási konfiguráció (memória, katalógus, skill-verzió) eltér az
  eredetitől, THEN a banképítő SHALL modellhívás nélkül átvenni a fejezet régi csomagját, azonos tételazonosítókkal.
- WHEN egy fejezet tanítása megváltozott, THEN a banképítő SHALL csak azt a csomagot gyártani újra.
- WHEN a javító út bankcsomagot gyárt, THEN SHALL ugyanazokat a válaszkulcs-teszteket és kvíz vak előszűrőt futtatni, mint a gyártás
  (a közös `bankQualityGates`-ből).
- WHEN az átvett csomag a mostani kapukon elbukik, THEN SHALL újragyártani (régi viselkedés).
- WHEN az Antigoné 3. verziója élesben van, THEN:
  - a gyakorlóbank tételei (kvíz, feladat, módszer) azonosak a javítás előtti v1 bankkal;
  - a tanítás és az `art` azonos a v2-vel;
  - a vak helyes válaszok átlaga ≥ 81%;
  - van mentés a v2-ről.

## 7. Tesztterv

- `tests/repair-bank-reuse.test.ts`:
  - memóriás gyártás → memória nélküli javítás, egy változott fejezettel → pontosan 1 modellhívás; a változatlan fejezet
    tételei és azonosítói azonosak;
  - érvénytelenné tett régi csomag → újragyártás;
  - `previousSections` nélkül a régi viselkedés.
- `tests/lesson-experience.test.ts` meglévő átvételi tesztjei változatlanul zöldek.
- Teljes kör: `tsc` (app + teszt), `eslint`, `npm test`.
- Élesben, a deploy után:
  - Antigoné v3: `/api/lessons/by-file/...` → bank = v1;
  - a vak mérőszkript ugyanazon a válaszkészleten ≥ 81%;
  - böngészőben a gyakorlás betölt.

## 8. Kockázatok / visszavonási terv

- **Kód:** a merge commit revertje → új deploy. Csak a javító út banképítését érinti; a gyártás csak a kiemelt, azonos viselkedésű
  segédfüggvényt kapja.
- **Antigoné:** az alkalmazás előtti állapot (v2) mentése a `material_improvement_backups`-ban van, az admin „Biztonsági mentések”
  felületén visszaállítható.
- **Ismert maradék:** a v1 bankban is van 12 túl szigorú rubrika (81%, nem 100%). A rubrikák pontozói tűrésének javítása külön feladat.

## 9. Végrehajtási utasítás

- Végrehajtás: `docs/specs/2026-11-03-javitas-bank-megorzes-vegrehajtas.md`
