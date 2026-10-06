# S6 — A tantárgyi katalógus bekötése a gyártásba (2026-10-06)

Terv: `2026-10-05-tantargyi-tudasbank-terv.md` §3, §4.3, §5 (S6 sor), §6 (mérési protokoll), §7 (tulajdonosi döntések).
Előzmények: S3 (`catalog_items`, 17 bank, 23 209 sor, `active | review | flagged`), S4 (tantárgyi skillek,
`server/studio/subject-skills.ts`), S0 (A/B-mérce, `docs/measurements/2026-10-05-baseline.json`).

## Cél
1. **Lekérés:** a lecke tantárgyából (`subjectKeyOf(map.subject)`), évfolyamából (`map.classroom`) és témájából (térkép címe +
   fogalmak) a lecke SAJÁT tantárgyi bankjából (`catalog_items.subject = <kulcs>`, `status = 'active'`) determinisztikusan
   rangsorolt tételkészlet (pool) — jobonként egyszer, a `job.output.catalog` mezőben rögzítve.
2. **Tervező + szerző:** a rendszerprompt végére a tantárgyi skill (`subjectSkillBlock`) és ≤ 8 katalógus-minta (magyarázat,
   kidolgozott feladat) kerül, korlátos hosszal.
3. **Bank-gyártó:** csomagonként (bankterv-egység) a pool tételeiből: **szó szerint átveendő** kvíztételek és **mintatételek**.
   A modell ELŐSZÖR a szó szerinti tételeket veszi át (kérdés, opciók, helyes kulcs változatlan; ő csak az id-t, a
   fogalom-kötést, az intentet és az opciónkénti visszajelzést írja), és csak a hiányzó darabszámot generálja.
4. **Lektor + bank-ellenőr:** a leckében ténylegesen szó szerint megjelenő katalógus-kvíz (determinisztikus egyezés) igazolt
   forrás: a bank-ellenőr nem ellenőrzi újra (a „cleared” készletbe kerül), a lektor külön sorban kapja („KATALÓGUS-TÉTELEK”).
5. **Kapcsoló:** `STUDIO_CATALOG_S6=1` (alapból KI). Kikapcsolva a promptok, a lépés-hashek és a bank-csomag hashek
   bájtra változatlanok.
6. **Ingyenes A/B-visszajátszás** (modellhívás nélkül) a lezárt futásokon: bank-hibák és bank-javító körök katalógus-
   helyettesítéssel és anélkül, tantárgyanként.

## Nem-cél
- Fizetős élő A/B (csak a becsült lista és költség, futtatás NINCS).
- Nyílt feladat / rövid válasz / módszer szó szerinti átvétele: ezek rubrikáját (`required`, `minWords`, `typedAnswers`) a
  fúziós pontozóhoz újra kell építeni, ezért szó szerinti igazolásuk nem determinisztikus → ezek mindig csak **minta**.
- Az S5 tantárgyi memória, az S7 workflow-rendbetétel, a kliens/admin-felület.
- Séma- vagy migrációváltozás (a `job.output` JSON-ban tárolunk; a `catalog_items` csak olvasott).

## Érintett fájlok
| Fájl | Változás |
|---|---|
| `source/server/catalog/retrieval.ts` (új) | tiszta függvények: tokenizálás, téma/fogalom-illesztés, pool-rangsor, szó szerinti/minta-szabály, egység-katalógus, prompt-blokkok, szó szerinti egyezés-felismerés |
| `source/server/catalog/s6-context.ts` (új) | kapcsoló, a tantárgyi skill + katalógus tervezői blokk, DB-sor → pool-tétel leképezés |
| `source/server/studio/experience-builder.ts` | opcionális `deps.catalog` → egységenkénti katalógus-blokk a bank-rendszerpromptban + a csomag-hashben |
| `source/server/studio/step-runner.ts` | pool betöltése (pedagogue/author/animator), blokkok a tervező/szerző promptjában, `deps.catalog` a banképítőnek, katalógus-útvonalak a lektornak és a bank-ellenőr „cleared” készletének; `PipelineStore.loadCatalogRows?` |
| `source/server/studio/step-io.ts`, `lektor-view.ts` | opcionális `catalogPaths` → „KATALÓGUS-TÉTELEK” sor (üresen nincs sor) |
| `source/scripts/catalog/ab-replay.mts` (új) | ingyenes A/B-visszajátszás, csak olvasó DB |
| `source/tests/catalog-s6.test.ts` (új) | egységtesztek hamis adatokkal |
| `source/tests/subject-skills.test.ts` | dokumentált spec-változás: lásd lent |

## Rögzített döntések
### Lekérés (retrieval)
- **Bank:** kizárólag `subjectKeyOf(map.subject)` bankja. Ismeretlen vagy kétértelmű tantárgy (pl. „magyar nyelv és irodalom”)
  → nincs lekérés (fail-closed, nincs találgatás). Keresztlekérés más bankból NINCS: a betöltő egyetlen `subject = $1`
  feltétellel olvas, és a pool-építő minden más tantárgyú sort eldob (kettős őr, teszt őrzi).
- **Státusz:** csak `active`. `flagged` (gépi lelet, admin-átnézésig), `review` (vitatott besorolás) és `rejected` sem szó
  szerint, sem mintaként nem kerül a poolba. Az S4 kézi kizárás-listája (`SAMPLE_EXCLUSIONS`) is kimarad.
- **Tokenizálás:** NFC, kisbetű (hu), betű/szám-szavak, ≥ 3 karakter, kis magyar töltelékszó-lista kiszűrve, tő = az első 6
  karakter (durva, determinisztikus magyar tövesítés).
- **Téma-egyezés** (lecke ↔ tétel): a lecke-téma szavai (térkép címe) és a tétel `topic_area + topic` szavai közös tövei:
  `közös ≥ 2`, vagy `közös ≥ 1` és a tétel téma-töveinek legalább fele közös.
- **Fogalom-egyezés** (fogalom ↔ tétel): a fogalom `term` tövei MIND szerepelnek a tétel szövegében (kérdés + helyes válasz),
  vagy `2 × közös(term) + közös(definition) ≥ 4`.
- **Évfolyam:** szó szerint csak azonos évfolyam; minta legfeljebb ±1 évfolyam (vagy ismeretlen évfolyamú tétel).
- **Rangsor (pool):** `3·téma-egyezés + legjobb fogalom-pontszám + 2·(azonos évfolyam) + 1·(parent_verified)`, holtversenyben
  lenyomat szerint (determinisztikus). Pool-korlát: **120 tétel** (kvíz ≤ 80, a többi ≤ 40), csak releváns tétel
  (téma- vagy fogalom-egyezés).
### Szó szerinti / minta szabály (tulajdonosi döntés 2.)
- **Szó szerint (verbatim):** `kind = quiz` ∧ `status = active` ∧ `trust = parent_verified` ∧ azonos évfolyam ∧ téma-egyezés ∧
  3–4 különböző opció ∧ érvényes `correctIndex` ∧ a determinisztikus ellenőrző (`verifyItem`) újrafuttatva is tiszta ∧ nincs a
  kizárás-listán. A banképítő egységében ezen felül fogalom-egyezés kell (a tétel az egység valamely fogalmához tartozik).
- **Minden más releváns, aktív tétel csak MINTA** (pipeline_verified, más évfolyam, nyílt feladat, rövid válasz, módszer,
  fejezet-szöveg).
### Token-keret
- Tervező/szerző blokk: tantárgyi skill + ≤ 8 minta, a katalógus-rész ≤ 4 000 karakter.
- Bank-egység: ≤ `min(6, floor(quizTarget/2))` szó szerinti kvíz (a tételek fele mindig a lecke saját tanításából épül) + ≤ 4
  minta, a blokk ≤ 5 000 karakter. Egy katalógus-tétel a leckében legfeljebb egy egységbe kerül (az első, sorrendben).
- Pool a `job.output.catalog`-ban: ≤ 120 tétel, tételenként a szövegmezők levágva (kérdés 400, opció 200, törzs 600 karakter).
### Szó szerinti egyezés felismerése (igazolt forrás)
- Kulcs: `norm(kérdés) | norm(opciók rendezve) | norm(helyes opció)` — a leckebeli kvíz akkor katalógus-tétel, ha kulcsa egyezik a
  pool egy szó szerint átvehető tételének kulcsával. A visszajelzés (`feedbackPerOption`) NEM része a kulcsnak: azt a modell írja.
- A bank-ellenőr ezeket a tételeket `cleared`-ként kapja (nem fizetünk újraellenőrzésért), a lektor külön sorban látja:
  „a kérdés, az opciók és a helyes kulcs szülő által ellenőrzött; forráseltérést csak a lecke tanításával való bizonyított
  ellentmondásra írj; a visszajelzés szövegét ugyanúgy ellenőrizd”.
### Kapcsoló
- `STUDIO_CATALOG_S6=1` → be; minden más érték → ki. Kikapcsolva: nincs DB-lekérés, nincs `job.output.catalog`, a
  tervező/szerző/bank/lektor prompt és a hashek változatlanok (teszt őrzi).

## Dokumentált spec-változás a meglévő tesztben
`tests/subject-skills.test.ts` „S6 előtt a gyártás nem kapja meg …” — az S4 spec szerint ez az S6-ig érvényes őr. Az S6 a
gyártásba köti a skillt, de KIZÁRÓLAG a kapcsolós `server/catalog/s6-context.ts` modulon át. Az őr ereje változatlan
(a `server/studio`, `server/workflows`, `server/improve` fájljai továbbra sem importálhatják közvetlenül a skill-fájlokat);
csak a teszt címe változik a valóságnak megfelelőre, és új teszt őrzi, hogy kikapcsolt kapcsolónál a promptok változatlanok.

## Edge case-ek
- Nincs `loadCatalogRows` a tárban (régi fake-ek) vagy DB-hiba → katalógus nélkül fut (fail-open, naplózva), a gyártás nem áll meg.
- A kapcsoló futás közben vált: a `job.output.catalog` csak bekapcsolt állapotban készül és használódik; kikapcsolt állapotban
  a meglévő mezőt a lépések figyelmen kívül hagyják.
- A modell módosítja a szó szerinti tételt → nem egyezik a kulccsal → generált tételként kezeljük (nincs igazolt státusz).
- A szó szerinti tétel elbukik a csomag determinisztikus ellenőrzésén → ugyanúgy javító kört kap, mint bármely tétel.
- Idegen nyelvű bank: a tokenizálás ugyanaz; ékezet nélküli magyar szöveg nem kap külön kezelést (a pool csak rangsorol).
- Tanári témafókusz: a fókuszált térkép fogalmaival kérdezünk (a `focusedMapOf` eredménye).

## Elfogadás (EARS)
- HA `STUDIO_CATALOG_S6` nem `1`, AKKOR a tervező, a szerző, a bank és a lektor rendszerpromptja és a csomag-hash bájtra azonos a
  kapcsoló nélkülivel.
- HA be van kapcsolva, AKKOR a pool csak a lecke tantárgyi bankjának `active` tételeit tartalmazza; más tantárgyú, `flagged`,
  `review` tétel soha (teszt).
- Szó szerinti tétel CSAK `parent_verified` + azonos évfolyam + téma-egyezés + tiszta determinisztikus ellenőrzés mellett (teszt).
- A banképítő rendszerpromptja bekapcsolva tartalmazza az egység szó szerinti és minta tételeit, a korlátokon belül (teszt).
- A leckebeli, kulcsra egyező kvíz útvonala a lektor „KATALÓGUS-TÉTELEK” sorában és a bank-ellenőr `cleared` készletében van (teszt).
- Az ingyenes A/B-visszajátszás reprodukálható JSON-t ír (`docs/measurements/2026-10-06-s6-ab-replay.json`) tantárgyanként.
- **S6 cél:** a fedett témákon a bank-hibák és a bank-javító körök ≥ 50%-kal csökkennek. Az ingyenes visszajátszás ezt
  BECSLI (lent); végleges igazolás csak élő A/B-vel.
- Teljes unit, `npm run check`, `tsc -p tsconfig.test.json`, lint zöld.

## Ingyenes A/B-visszajátszás — protokoll
Bemenet (csak olvasó tranzakció): a lezárt jobok (`studio_jobs.step in ('done','error')`), a job `output.lesson.experience`
bankja és `bankPlan`-je, a térkép fogalmai (`km_concepts`), a `lektor_notes` bank-jegyzetei (`block_path like 'experience%'`),
a tantárgy `catalog_items` sorai.
1. A lecke a GYÁRTÁSI függvényekkel (`buildCatalogPool`, `unitCatalog`) kapja a poolt és egységenként a szó szerinti tételeket.
   Szivárgás ellen a pool-ból kimarad minden tétel, amelynek forrása ugyanennek a térképnek bármely leckéje.
2. Bank-hiba = egy lektori bank-jegyzet. Egy kvíz-jegyzet tételét (útvonal → a lecke tétele → egység + fogalom) a katalógus
   `p = min(1, V/Q)` valószínűséggel helyettesíti, ahol V = az egység azon szó szerinti tételei, amelyek legjobb fogalma ugyanez,
   Q = a lecke ugyanezen egység+fogalom kvízeinek száma. Nyílt feladat és módszer jegyzete: `p = 0` (nem-cél: nincs szó szerinti).
3. Bank-hiba „katalógussal” = `Σ(1 − p)`. Bank-javító kör = a lektori kör, amelyben volt bank-jegyzet; „katalógussal” a kör
   várható száma `Σ_kör (1 − Π p)` (a kör csak akkor marad el, ha minden jegyzete helyettesítődik).
4. Fedett lecke = legalább egy egységében van szó szerinti tétel.
Korlát (UNVERIFIED feltevés): a helyettesített tétel hibátlan (a szülő-ellenőrzés ~99%-os); a modell által írt visszajelzés
hibája és a helyettesítés másodlagos hatása (kevesebb generált tétel → kevesebb új hiba) nincs modellezve.

## Mért eredmény
Lásd „Mért eredmény (2026-10-06)” — a visszajátszás után kitöltve.
