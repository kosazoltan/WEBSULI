# Spec: Tanári kérés ellenőrzőlista-kapu (nem elakadó közzététel, 2. szelet)

> Dátum: 2026-09-30 · Szerző: Claude (Opus 5.5) · Állapot: JÓVÁHAGYVA (tulajdonosi utasítás: „a teljes folyamatot autonóm módon … a végéig”)
> Előzmény: `docs/specs/2026-09-30-nem-elakado-kozzetetel.md` (1. szelet, PR #151)
> Végrehajtás: `docs/specs/2026-09-30-tanari-ellenorzolista-vegrehajtas.md`

## 1. Cél
A tanári kérés (`job.output.ownerInstruction`) ma csak prompt-bemenet; a kész leckén semmi nem méri (kódtérkép 2026-09-30).
Élő eset: a Mezopotámia-kérésben szereplő „Babilon városa Kr. e. 2500 körül” pont a leckében „szerepel a füzetben” alakban,
a helyes állítás nélkül jelent meg, és csak kézi ellenőrzés vette észre. Cél: a kapu pontonként mérje a kérést, a hiányzó
pontra EGY célzott szerzői javítás jár; ami a limiten is hiányzik, figyelmeztetés (hiány, nem tényhiba → a 95%-os szabály szerint publikál).

## 2. NEM cél
Új tartalom kitalálása a kérésen túl; a kérés automatikus átfogalmazása; a témafókusz módosítása; tanári kérés nélküli jobok.

## 3. Érintett területek
`server/studio/instruction-check.ts` (új), `server/studio/support-skills.ts` (`instruction-checker` skill),
`server/ai/studio-provider.ts` (`instructionCheck` szabály), `server/studio/section-patch.ts` (`GateFeedbackLike.instruction`),
`server/studio/step-runner.ts` (`runGate`), `server/studio/autonomous.ts` (`instruction_missing` ok), tesztek.

## 4. Rögzített döntések
- EGY modellhívás (Opus 5.5, `instructionCheck`: 180 s, 12k, `medium`): bemenet a kérés + a lecke tanítása (fejezetcím,
  explain/example/recap szöveg, fejezet-sorszámmal); kimenet `{ points: [{ point, taught, evidence, section }] }`.
- **Hallucináció-őr:** `taught: true` csak akkor fogadható el, ha az `evidence` (normalizálva) szó szerint megtalálható a
  lecke tanításában; különben a pont hiányzónak számít. A `section` 0…N−1, különben a pont fejezet nélküli.
- Gyorsítótár: `job.output.instructionCheck = { hash, points }`, hash = sha256(kérés + tanítás) — változatlan leckére nincs új hívás.
- A kapu csak `gate.ok` esetén (vagy a limit-elfogadás után) méri a kérést. Hiányzó pont:
  - limit előtt, van keret, és a jobban még nem volt ilyen kör → `gate.instruction = [{ sectionIdx, point }]`, `reasons` +
    „Tanári kérés hiányzó pontja (N. fejezet): …”, `instructionRepairRound = round+1`, következő lépés a szerző (célzott,
    a `targetedRepairSections` az `instruction` leleteket fejezetként kezeli);
  - különben `qualityNotes += instruction_missing` figyelmeztetés, publikál.
- A mérés hibája (modell, séma) soha nem állítja meg a gyártást: figyelmeztetés a naplóban.

## 5. Edge case-ek
Üres kérés / csak stílus-kérés („rövidebb mondatok”): a modell üres `points`-ot ad → nincs teendő. Fejezet nélküli hiányzó
pont a limit előtt: a szerző teljes javítókört kap (`targetedRepairSections` → null). Többszöri kapu-futás: a hash miatt nincs új hívás.

## 6. Elfogadás (EARS)
- WHEN a kérés egy pontját a lecke nem tanítja és van keret THEN the gate SHALL send exactly one targeted author repair with that point in `reasons`.
- WHEN a modell `taught: true`-t ad, de az evidence nincs a leckében THEN the point SHALL count as missing.
- WHEN a limiten is hiányzik egy pont THEN the lesson SHALL publish with an `instruction_missing` quality warning.
- WHEN a mérés hibázik THEN the gate SHALL continue as before.

## 7. Tesztek
`tests/instruction-check.test.ts` (hallucináció-őr, hash-gyorsítótár, üres pontlista), runner-tesztek a
`lesson-pipeline-runner.test.ts`-ben (javítókör, limit-figyelmeztetés, hibatűrés). Teljes suite + tsc + lint.
