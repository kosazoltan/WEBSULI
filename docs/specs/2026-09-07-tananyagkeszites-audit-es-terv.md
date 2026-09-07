# Tananyagkészítés — logika, metodika, folyamat: audit és végrehajtási terv (2026-09-07)

> **Cél (tulajdonosi megfogalmazás):** „nézd át a teljes websuli tananyagkészítés
> logikáját, metodikáját, folyamatát… föltöltöm a megfelelő dokumentumokat, abból
> te automatikusan leképezd a tudástárat és elkészíted teljesen autonóm módon a
> tananyagot."

## 0. A lényeg elöl

**A folyamat, amit kérsz, már meg van építve, és autonóm.** Nem kell újratervezni
— a `POST /api/studio/lessons/one-step` végpont pontosan azt csinálja: feltöltött
dokumentumból tudástérképet épít, abból leckét gyárt, emberi kapuk nélkül.

Amit ebből **hiányzik: a dokumentumok.** Amíg nincs forrás, nincs mit leképezni.
A terv ezért két részre válik: (A) amit most, forrás nélkül elvégzek, (B) ami a
dokumentumok megérkezésekor egyetlen menetben lefut.

## 1. Mérési alap — a valós folyamat (`main` @ 84219e7)

Nem leírás emlékezetből; a kódból olvasva.

### 1.1 Az állapotgép

`server/studio/pipeline.ts`:

```
pedagogue → author → animator → lektor → gate → done
                ↑________________|  (max 2 kör)
                                            → error
```

- `MAX_AUTHOR_ROUNDS = 2` — a szerző↔lektor hurok garantáltan terminál. Az indok a
  kódban is le van írva: minden kör újabb fizetős modellhívás az egész leckére.
- `MAX_CHAIN_STEPS` **levezetett**, nem kézzel választott konstans. Egy korábbi,
  alacsonyabbra lőtt érték élesben hamis „lépés-határ" hibát adott (job fd62b66a,
  2026-09-05) — ez a fajta indoklás a kódban ritka és értékes.
- A job DB-sorban él (`studio_jobs`), nem memóriában — szerver-újraindítás nem
  veszíti el a futó leckét.

### 1.2 A két séma, ami a metodikát hordozza

**`shared/knowledge-map-schema.ts` — a tudástár.** Fogalmak forrás-hivatkozással,
`examWeight: core | supporting | extra`, `reviewState`, `MAP_STATUSES`.

**`shared/lesson-schema.ts` — a lecke.** Hat blokkfajta:
`explain | example | animate | check | try | recap`, `EXPLAIN_DEPTHS = core |
deeper | why`, `AGE_BANDS = kid | teen | senior` osztályhoz kötve
(`ageBandForClassroom`). A `try` blokk három interakciót ismer: `dragSort`,
`fillBlank`, `match`.

Két megkötés, ami a séma szintjén kényszerít pedagógiát:
- `sourceOnly: z.literal(true)` — a lecke **nem parse-olható**, ha azt állítja,
  hogy a kurált forráson túlról merített. Ez a D1 elv („a forrás nyer") típusban
  kikényszerítve, nem prompt-kérésként.
- `check` blokknál a `feedbackPerOption` hossza kötelezően egyezik az
  `options` hosszával — **minden válaszlehetőséghez tartozik magyarázat**.

### 1.3 A gépi kapuk (emberi kapuk helyett)

`server/studio/autonomous.ts` rögzíti a 2026-09-06-i tulajdonosi döntést:
„Nincs tudásbázis elfogadás, nincs lektorálás, minden legyen automatizálva."
Ami **megmaradt** — mert mérés, nem emberi vélemény:

| Kapu | Hol | Mit mér |
|---|---|---|
| verbatim | `studio/verbatim.ts` | a lecke idézetei tényleg a forrásban vannak-e |
| fedettség | `studio/coverage.ts` | `core` = 100%, `supporting` ≥ 90% (`SUPPORTING_THRESHOLD = 0.9`) |
| séma | `shared/lesson-schema.ts` | zod, blokkfajták, fogalom-kötés |
| grounding | `studio/grounding.ts` | minden állítás fogalomhoz kötve |

Ha a kapu elbukik, a gép **javító kört fut** (`AUTONOMOUS_MAX_ROUNDS = 2`), és ha
az sem elég, a tananyagot **elkészíti**, a hiányt pedig `qualityNotes`-ban jelzi.
Technikai hiba (modell/séma/DB) továbbra is hiba.

### 1.4 Az egygombos bemenet

`POST /api/studio/lessons/one-step` (`server/studio/one-step.ts`):

```
upload → [scope kikövetkeztetése, ha nincs megadva] → OCR/kivonatolás
       → tudástérkép (hash-idempotens) → lecke-job azonnal indul
       → vázlat automatikus jóváhagyása, HA a gépi fedettség-mérés átmegy
       → author → animator → lektor → gate → done
```

Elfogadott forrásfajták: `pdf | image | docx | text`. A `scope` (tantárgy,
osztály, tananyagegység) elhagyható — a forrásból következteti ki.

Haladás: `GET /api/studio/lessons/one-step/:runId`.

## 2. Ítélet: mi jó, mi hiányzik

**Ami erős** — és nem szabad hozzányúlni:
- a folyamat tiszta állapotgép, tesztelt terminálással;
- a pedagógiai megkötések típusban élnek, nem prompt-szövegben;
- a fedettség számszerű kapu, nem vélemény;
- az idempotencia hash-alapú: ugyanaz a forrás nem fizet kétszer.

**Ahol valós hiány van:**

| # | Hiány | Miért számít | Szelet |
|---|---|---|---|
| T-1 | A `check` blokk `feedbackPerOption` magyarázatai **nem jutnak el a játékokba** | A lecke tanít rossz válasznál, a játék nem — ugyanaz a gyerek, két külön minőség | lásd a játék-terv G-2 szeletét |
| T-2 | Nincs végponttól végpontig füst-teszt a one-step útvonalra | A lánc 7 modulon megy át; ma minden darab külön tesztelt, a lánc egyben nem | T-2 |
| T-3 | A `qualityNotes` jelzés nem jelenik meg összesítve | A gép „elkészítem, de jelzem" döntése csak a job-sorban látszik | T-3 |
| T-4 | Nincs dokumentált futtatási recept forrásfeltöltéshez | Minden futás kézi felfedezéssel kezdődik | T-4 (ez a dokumentum) |

## 3. (A) Amit forrás nélkül elvégzek — most

### T-2 — End-to-end füst-teszt a one-step láncra

TDD, bukó teszttel indul: `tests/studio-one-step-e2e.test.ts`.

Beépített, apró forrásszöveggel (nem modellhívás — a lépések kicserélhető
határainál álbevitel), a lánc végigfut, és az állítások:
1. a kimenet átmegy a `lessonSchema`-n;
2. a `core` fogalmak fedettsége 100%;
3. minden `check` blokk `feedbackPerOption` hossza = `options` hossza;
4. `sourceOnly === true`;
5. a lánc `done` állapotban áll meg, `MAX_CHAIN_STEPS`-en belül.

**Ez a teszt az, ami a dokumentumok megérkezésekor bizonyítja, hogy a gyártás
tényleg működik** — nem az, hogy „lefutott".

### T-3 — `qualityNotes` összesítő

A `GET /api/studio/lessons/one-step/:runId` válaszába kerüljön be a gépi
javító körök eredménye olvasható alakban, hogy egy futás után egy pillantásból
látszódjon: teljes fedettség, vagy jelzett hiány — és mi az.

Teszt: `tests/studio-quality-notes.test.ts` — jelzett hiány esetén a mező
kitöltött és emberi mondat; hiánytalan futásnál üres.

### T-4 — Futtatási recept

Ez a szakasz maga (lásd 4. pont).

## 4. (B) Futtatási recept — amikor a dokumentumok megérkeznek

Ezt fogom végrehajtani, kérdés nélkül:

1. **Fogadás.** A feltöltött fájlokat a `SOURCE_KINDS` szerint osztályozom
   (`pdf | image | docx | text`). Amit a rendszer nem ismer, azt jelzem, nem
   konvertálom csendben.
2. **Scope.** Ha a dokumentumból egyértelmű a tantárgy és az osztály, kikövetkeztetem;
   ha nem egyértelmű, **megkérdezem** — rossz osztálybesorolás rossz korosztályi
   sávot (`AGE_BANDS`) ad, és az az egész leckét elrontja.
3. **Tudástérkép.** `POST /api/studio/maps/extract` úton, majd ellenőrzöm:
   minden `core` fogalomnak van forrás-hivatkozása. Ha egy „core" fogalom mögött
   nincs forrás, az kivonatolási hiba — javítom, nem publikálom.
4. **Gyártás.** `POST /api/studio/lessons/one-step`, haladás-követéssel.
5. **Kapuk kiolvasása.** Fedettség (`core` 100%, `supporting` ≥ 90%), verbatim,
   séma. Ha jelzett hiány marad, a `qualityNotes` alapján célzott javító
   prompttal újrafuttatom — nem hagyom „elkészült, de hiányos" állapotban.
6. **Vizuális visszaellenőrzés.** A kész leckét a lecke-futtatóban megnyitom
   Playwrighttal, képernyőképet készítek, és **megnézem**: olvasható-e a
   korosztályi sávban, működik-e a `try` interakció, van-e kontraszt-hiba.
7. **Jelentés.** Mit gyártott, milyen fedettséggel, mi maradt jelzésként.

## 5. Blokkoló függőség — világosan

**A (B) rész nem indítható el dokumentumok nélkül.** Ez nem óvatoskodás: a
`sourceOnly: true` megkötés miatt a rendszer szándékosan képtelen forrás nélküli
tananyagot gyártani. Ha most kitalálnék egy tananyagot, az pontosan az a
hallucináció lenne, amit az utasításod tilt.

**Amit tőled kérek:** töltsd fel a dokumentumokat (PDF / kép / DOCX / szöveg),
és mondd meg — vagy hagyd, hogy kikövetkeztessem — a tantárgyat és az osztályt.
Onnantól a 4. pont recepje kérdés nélkül lefut.

Addig az (A) rész (T-2, T-3) és a teljes játék-terv fut, azok nem függenek a
forrástól.
