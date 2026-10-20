# S6 — végrehajtási utasítás (ügynöknek)

Terv: `docs/specs/2026-10-20-s6-fogalom-sorrend.md`. Munkakönyvtár: `source/`.

Két PR:
- **PR1:** S6a — ág `feat/s6-fogalom-sorrend`.
- **PR2:** S6b — a PR1 után a main-ről; a végrehajtási kiegészítés az első kódcommit ELŐTT (háromfázisú CI-kapu).

## PR1 — S6a
1. **`shared/lesson-experience.ts`:**
   - `openTaskSchema` + `requiredOrder: z.array(z.array(text(160)).min(1)).min(2).max(4).optional()`;
   - `scoringVersionFor` → `ORDER_SCORING_VERSION`;
   - `experiencePacketSchema.superRefine`: sorrendi bank `scoringVersion` ≥ 5.
2. **`shared/answer-value.ts`:** `ORDER_SCORING_VERSION = 5`, `LESSON_SCORING_VERSION = 5`.
3. **`shared/lesson-experience-score.ts`:**
   - `isTypedTask` + `requiredOrder`;
   - `orderSatisfied(tokens, groups)`: csoportonként az első pozíció (alternatívánként: minden szava illeszkedik — `conceptHit` —,
     a pozíció az első szavára illeszkedő első token indexe), szigorúan növekvő;
   - `missingOrder(answer, task)`;
   - v2: `total` + 1, `hits` + (sorrend ? 1 : 0); indoklás;
   - `OPEN_ANSWER_RULES_HU` új szabály.
4. **J1** (`answer-key-tests.ts` `blockingWrongCases` + `answerKeyNotes`): a kivételhez a sorrend is teljesüljön; a helyes-eset
   üzenete jelzi a sorrendi bukást.
5. **Döntőbíró:** üzenetsor + kulcs (feltételes). **`rubricHash`** (feltételes). **Tesztíró:** `sorrend` mező az itemben + rendszerszabály
   + kulcs (feltételes).
6. **Bank:**
   - strict séma nullable + `OPTIONAL_ARRAY_KEYS`;
   - `TASK_RUBRIC`, lektornézet, mezőleírás;
   - minta-igazítás: csoportpróba `requiredOrder: undefined`, v2-értékelő a típusos feladatnál.
7. **HTML-út:** `align-html-bank` a `requiredOrder`-t is eltávolítja.
8. **Teszt (`tests/s6-fogalom-sorrend.test.ts`):**
   - helyes / fordított sorrend;
   - köztes szavak és ragozás;
   - hiányzó csoport;
   - ismétlődés (első előfordulás);
   - mező nélkül v1;
   - verzió 5 + csomagséma;
   - J1;
   - döntőbíró / tesztíró;
   - kulcsok;
   - HTML-út.
9. **Ellenőrzés:** `check`, `check:test`, `eslint`, `npm test`, `build`, háromfázisú ellenőrzés.

### PR1 megvalósítási pontosítások
- **A pontozó szabályszövege** (`OPEN_ANSWER_RULES_HU`) a 3500 karakteres korlát alatt marad (`tests/scoring-v2.test.ts`): a
  kifejezésszabály (7.) és a sorrendi szabály (8.) tömörítve.
- **Dokumentált tesztváltozás:**
  - `tests/s5-sorrendes-kifejezes.test.ts`: a kliens szerződése 5-re nőtt; a kifejezés továbbra is a 4-es (az állítás erre szűkül);
  - `tests/bank-schema.test.ts`: a tükörteszt null-listája + `requiredOrder` (új sémamező).
- **A fogalomillesztés tűrése változatlan:** igekötős vagy hosszabb ragozott alak („megszorozzuk”, „szorozzuk”) a `required`-ben sem
  illeszkedik; a modell ezt VAGY-alternatívaként adja meg.

## PR2 — S6b
1. **`tighten` (sorrend):** ha nincs `requiredOrder`, és sem szó, sem kifejezés nem talált jelöltet:
   - kötelező csoportpár (i < j), amelyre a minta és minden ok helyes `a < b`, a hibás mindkettőt tartalmazza és `b < a`;
   - felvétel után ellenőrzés;
   - `tightenedOrder: true`.
2. **Séma:** `tightenedOrder: z.boolean().optional()`; `relaxedTightening` + `previousRequiredOrder`.
3. **S4:**
   - telemetria;
   - `keepServerFields` (a `tightenedOrder` öröklődik, ha a `requiredOrder` változatlan);
   - `tightenedOnlyMiss` (csak a sorrend hiányzik + ellenpróba);
   - `relaxTask`: a sorrend helyett fogalomcsoport (a sorrendi csoportok + a többi kötelező tagjai), a `requiredOrder` törlődik.
4. **Teszt:** a fordított műveleti sorrend szigorodik; ha nem minden helyes egyirányú, nem; a lazítás pontot nem csökkent.

### PR2 megvalósítási pontosítások (S6b, a kód előtt)
- **Jelöltpár (`shared/answer-key-calibrate.ts` `orderCandidates`):**
  - forrás: a meglévő kötelező csoportok (`required`) EGYSZAVAS alternatívái (a séma S6a-szabálya, review #346; azonos kanonikus
    alakkal);
  - a két csoport nem oszthat meg alternatívát; az egyszavas alternatíva nélküli csoport kimarad.
- **Az irány:** a minta határozza meg (az első előfordulás, a pontozó `firstPosition`-jével; exportált segéd: `orderPositions`).
- **A felvétel feltételei:**
  - a minta és MINDEN teljes pontos helyes válasz teljesíti a sorrendet;
  - a hibás válasz mindkét csoportot tartalmazza, és fordított sorrendben;
  - a felvétel után a minta és a helyesek `ok`, a hibás nem.
- **A szigorítási sorrend:**
  - szó (S3c) → kifejezés (S5b, csak idegen nyelven) → sorrend (S6b, minden nyelven);
  - csak ha a feladatnak nincs `requiredOrder`-je; egy feladatra legfeljebb egy sorrendi szabály.
- **A pontozási út:** a `requiredOrder` a feladatot a v2 útra viszi (mint az S5b kifejezése). Az őr (minta / helyesek / hibás) a
  v2-n mér, a `validate` újraszámolja a `scoringVersion`-t (5).
- **Jelölés:**
  - `tightenedOrder: true` csak akkor marad, ha a végső `requiredOrder` a felvett szabály (JSON-egyezés);
  - a `keepServerFields` ugyanígy örökíti (a `requiredOrder` változatlan).
- **Lazítás (`relaxTask`):**
  - a `requiredOrder` törlődik; helyette egy új kötelező fogalomcsoport: a sorrendi csoportok tagjai + a többi kötelező csoport tagjai;
  - a csoportszám (a v2 egy sorrendi feltétele → egy fogalomcsoport) változatlan, a pont nem csökken;
  - `relaxedTightening.previousRequiredOrder` őrzi az előállapotot.
- **`tightenedOnlyMiss`:** a sorrend is lehet az egyetlen hiány. Ellenpróba: a szigorított szabályok nélkül teljes pont.
- **Telemetria:** a `rubricTightened` és a lazítás jelöltjei a `tightenedOrder`-t is számolják; ez az e-mailben is megjelenik.
