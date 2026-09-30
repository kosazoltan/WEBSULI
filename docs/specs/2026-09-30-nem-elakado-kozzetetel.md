# Spec: Nem elakadó közzététel („95%-os” szabály) — 1. szelet

> Dátum: 2026-09-30 · Szerző: Claude (Opus 5.5) · Állapot: JÓVÁHAGYVA
> Tulajdonosi döntések (2026-09-30): „95%-os hibátlanságot már hibátlannak fogadok el … ne akadjon el, hanem ha minimális
> hiba van benne, attól még létrejöjjön a tananyag.” és „a hibás banktétel vagy ábra kivehető, a tanításban lévő ténybeli
> hiba viszont nem — elfogadom”.
> Végrehajtás: `docs/specs/2026-09-30-nem-elakado-kozzetetel-vegrehajtas.md`

## 1. Cél

A gyártás ne haljon el olyan hibán, amely nem ténybeli hiba a tanításban. Élő adat (21 nap, `studio_jobs`): 36 `error`
a 17 `done` mellett (mérő-/próbafutásokkal együtt). A mért okok és a kódbeli helyük (forrásból ellenőrizve):

1. **Végkapu-hiba (bug):** a 7.4-es végkapu a lektor jelentését ÚJRA besorolja konvergencia NÉLKÜL
   (`server/studio/step-runner.ts` ~1349: `classifyNotes(report.data.notes)`), a lektor lépés viszont konvergenciával
   (`applyLektorConvergence`, ~1010). Egy késői `coverage_gap` jegyzet a lektornál figyelmeztetés, a kapunál blokkoló →
   blokkolómentes lecke hal meg.
2. **Tanítási blokkoló a körlimiten** → `fail` (~1029–1036), akkor is, ha a körszámlálót csak-bank körök fogyasztották el
   (a `round` a csak-bank körben is nő, `pipeline.ts:110`), és a szerzőnek még van látogatási kerete.
3. **Kapu-lelet a körlimiten** (fedettség, megalapozatlan címke, lecke-szintű ív) a célzott javítás után is → `fail` (~1292).
4. **Ábra-blokkoló a körlimiten** (lektor jegyzet animate blokkon) → `fail`, holott az ábra kivehető.
5. **Forrás-hivatkozás a gyereknek szóló szövegben** („a forrás szerint”, „a füzetben”): nincs rá gépi őr (az élő
   Mezopotámia-futásban ~50 helyen, a lektor nem jelezte).

## 2. NEM cél (külön szeletek)

- Tanári kérés ellenőrzőlista-kapu (2. szelet); bankcsomag részleges átvétele 4 bukott kísérlet után és modellhiba-tűrés
  (3. szelet); szerver-újraindulás utáni automatikus folytatás.
- A 45/75-ös bankminimum lazítása (a kivétel utáni minimum-sértés gyakoriságára nincs mérés; a tartalék 48/80 már véd).
- Tényhiba a tanításban (explain/example/recap `source_conflict`) SOHA nem publikálható — ez marad `fail`, érthető üzenettel.

## 3. Érintett területek

`server/studio/step-runner.ts` (lektor-limit ág, `resolveChoiceGate`, `runGate`), `server/studio/lektor.ts` (közös
besoroló), `server/studio/source-reference.ts` (új), `server/studio/role-skills.ts` (bank skill: 1 sor), tesztek.

## 4. Rögzített döntések

- **D1 (bug):** a végkapu ugyanazzal a függvénnyel sorol, mint a lektor lépés: `classifyReviewNotes(raw, priorBlockers, round)`
  = `applyLektorConvergence(classifyNotes(raw), priorBlockers, round).notes`, mindkét helyen.
- **D2 (lektor a limiten), blokkolónként:**
  - banktétel / check blokk → kivétel (meglévő);
  - **animate blokk** → kivétel (új: `origin:"limit"` jelzés, a kapu kiveszi);
  - **`coverage_gap` tanítási blokkon** (hiányos, nem hamis) → figyelmeztetés (`qualityNotes`), a lecke megy tovább;
  - **`source_conflict` tanítási blokkon** (tényhiba) → ha a szerzőnek van látogatási kerete és a jobban még nem volt ilyen:
    EGY célzott szerzői javítás a hibás fejezet(ek)re (`targetedLektorRepairRound`); különben `fail`:
    „Tényhiba maradt a tanításban, nem publikálható: …”.
- **D3 (kapu a limiten, a célzott javítás után vagy keret nélkül):** ha nincs ismeretlen fogalom-azonosító, a core fedettség
  ≥ 95% és a supporting ≥ 80%, akkor a lecke publikálódik; a kapu okai `qualityNotes` figyelmeztetések lesznek.
  A megalapozatlan címke (`ungrounded`) előtte determinisztikusan lekerül a blokkról, és a fedettség újra számolódik.
  Különben `fail` (a mostani üzenettel).
- **D4 (forrás-hivatkozás):** `sourceReferenceFindings` (regex: forrás/füzet/tankönyv + ragok, „a forrás szerint”, stb.)
  a gyereknek szóló szövegben (nem-animate blokkok, bank). Biztonságos minták determinisztikus törlése (`stripSourceReferences`:
  „A forrás szerint X” → „X”, „, a forrás szerint,” → „,”, „a tananyag/forrás szerint ” → „”) a bank elkészülte után, a lektor
  előtt; ami marad, `qualityNotes` figyelmeztetés (nem tényhiba). A bank skill egy tiltó sort kap.
  **Kiegészítés (valós mérés után):** a gépi törlés az élő Mezopotámia-mentés 55 hivatkozásából csak 13-at fogott (a többiben
  a forrás alany: „a forrás Istárt … nevezi”). Ezért a maradék EGY ellenőrzött átíró hívást kap (`kid-text-fixer` skill,
  Opus 5.5, `textFix` szabály): forrás-szó nélkül, azonos számokkal, közeli hosszal, a feladat mintája teljes pontot kap —
  különben az eredeti marad. Mérve: 55 → 2 (0,08 USD). A felismerő csak a HIVATKOZÓ fordulatot keresi („a Duna forrása” nem).
- **D6 (latens hiba):** a `noteSectionKey` csak a pontozott útvonalat ismerte, a lektor-séma a zárójelesre normalizál →
  a konvergencia blokk-, nem fejezet-szinten hasonlított. Javítva (mindkét alak → `sections.N`).
- **D5:** a job kimenete `quality: { removed: string[], warnings: string[] }` összesítőt kap; a publikálás ezzel is megy.

## 5. Edge case-ek

- A konvergencia a 0. körben nem hat (változatlan). Az előző kör blokkolói ugyanabból a táblából jönnek, mint a lektornál.
- Célzott lektor-javítás után a lektor újra fut; ha újra tényhibát talál → `fail` (nincs második).
- Az animate kivétele után a fejezet ábra nélkül maradhat — a tartalék (`ensureSectionVisuals`) nem fut újra; figyelmeztetés.
- A forrás-hivatkozás törlése nem érinti a `required`/`bonus` rubrikát és a mintaválaszt, ha a törlés után a minta nem kapna
  teljes pontot (akkor a tétel változatlan, figyelmeztetéssel).

## 6. Elfogadási kritériumok (EARS)

- WHEN a lektor egy késői `coverage_gap` jegyzetet a konvergencia miatt figyelmeztetéssé minősít THEN the gate SHALL NOT fail on it.
- WHEN a körlimiten a maradék blokkoló egy animate blokk THEN the gate SHALL remove that block and publish.
- WHEN a körlimiten a maradék blokkoló `coverage_gap` tanítási blokkon THEN the lesson SHALL publish with a quality warning.
- WHEN a körlimiten `source_conflict` blokkoló maradt a tanításban és van szerzői keret THEN the system SHALL run exactly one targeted author repair; WHEN nincs keret THEN it SHALL fail with „Tényhiba maradt a tanításban”.
- WHEN a kapu a limiten csak fedettségi/ív/címke-leletet talál, és core ≥ 95%, supporting ≥ 80%, nincs ismeretlen azonosító THEN the lesson SHALL publish with quality warnings.
- WHEN a bank vagy a tanítás „a forrás szerint …” / „a füzetben …” fordulatot tartalmaz THEN the published lesson SHALL NOT contain the safe patterns, and remaining ones SHALL be listed as warnings.

## 7. Tesztterv

Új: `tests/non-blocking-publish.test.ts` (D1–D3, a `lesson-pipeline-runner.test.ts` memóriatárolós mintájára),
`tests/source-reference.test.ts` (D4). Teljes suite + `tsc` + a CI tsconfig.test.json.
Élő: egy friss gyártás a helyi kódon (egyedül futva), a `quality` mező és a naplók ellenőrzése.

## 8. Kockázat / visszavonás

- A D3 lazítja a limit-kaput: csak a limiten, csak nem-ténybeli leleteknél; a figyelmeztetések a jobban és a naplóban
  látszanak. Visszavonás: a PR revertje (nincs adatmodell-változás).
- Meglévő teszt, amely a régi „limit → fail” viselkedést rögzíti nem-ténybeli leletre: a tulajdonosi döntés dokumentált
  spec-változás; az ilyen tesztet a spec hivatkozásával frissítjük, a ténybeli hibára vonatkozó teszteket NEM.
