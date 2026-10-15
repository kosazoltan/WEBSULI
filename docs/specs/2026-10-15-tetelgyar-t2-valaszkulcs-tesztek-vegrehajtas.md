# Végrehajtási utasítás — Tételgyár T2: válaszkulcs-tesztek

Terv: `docs/specs/2026-10-15-tetelgyar-bank-lektor-uj-modszertan.md` (3. fejezet 2. pont, 5. fejezet T2 sora; sorrend: 8. fejezet,
„T2 → T7 → T6 → T5 → T3”). Ág: `feat/tetelgyar-t2`. Mindegyik szelet külön PR, méréssel.

## Kódból ellenőrzött kiinduló tények
- A valódi pontozó: `evaluateOpenAnswer(answer, task)` (`shared/lesson-experience-score.ts`), ítélete `ok | partial | fail`. A normalizálás
  kisbetűsít és ékezetet töröl (`normalizeAnswer`).
- A tételenkénti determinisztikus ítélet a bankcsomag `validate(packet)`-je (`server/studio/experience-builder.ts`): a hibák `"<id>: …"` alakúak,
  a nem-utolsó kísérletnél javítókört indítanak (`repairPermissions` → `fieldsFor`, `server/studio/bank-repair.ts`), az utolsó kísérletnél a
  `salvagePacket` kiveszi a megnevezett tételeket (a tartalék terhére, a padlóig).
- Olcsó modell: a `gateHelper` lépés (`deepseek/deepseek-v4-flash`, tartaléka `z-ai/glm-5.3-flash`, `server/ai/models.ts`); hívás:
  `callStepModel(createStudioStepProvider(model, "gateHelper"), …)` (`server/studio/run-step.ts`).
- A tétel sémája nem tárol tetszőleges metaadatot (a zod eldobja az ismeretlen kulcsot) — a tesztesetek a gyártás közben, a csomag
  mellett élnek; a tételbe nem kerülnek.

## T2.0 — mérés előbb (kódváltozás nélkül, csak szkript)
- `source/scripts/measure/lektor-trial.mts`: az élő lektor-prompt mérőeszköze (a T8-ból, lélek nélkül), szeletenként előtte/utána.
- `source/scripts/measure/answer-key-trial.mts` (új, DB-ÍRÁS NÉLKÜL, `withReadOnlyDb`): mentett jobok bankjának nyílt feladatain lefuttatja a
  T2.1 tesztíróját és a valódi pontozót; kimenet tételenként: helyes-esetek ok-aránya, hibás-esetek közül „ok”-t kapók, és hogy a lektor
  az adott tételre adott-e rubrika-blokkolót (`lektor_notes`, `experience.tasks[i]` útvonal). Összesítés: a T2 bukása és a lektor rubrika-
  blokkolója mennyire esik egybe (egyezés, csak-T2, csak-lektor), és a tesztíró zaja (a helyes-esetek bukásának oka: rubrikahiány vagy
  a parafrázis maga hiányos — mintavételes kézi átnézés 10 tételen).
- Költségkorlát: legfeljebb 4 job, csomagonként egy tesztíró-hívás (olcsó modell).
- Döntési szabály (a mérés után, a PR-ben rögzítve): ha a lektor rubrika-blokkolóinak ≥ 50%-át a T2 is elkapja, és a helyes-esetek
  hamis bukása (a parafrázis valóban helyes, a rubrika mégis elutasítja) a tételek ≥ 70%-ánál valós rubrikahiány, a T2.1 élesedik; különben
  a tesztíró promptja / az elfogadási szabály módosul, és újramérés.
- Kimenet: `docs/measurements/2026-10-15-t2-valaszkulcs.json`.

## T2.1 — tesztíró és tesztfuttató a bankgyártásban
- `shared/answer-key-tests.ts` (tiszta): `type AnswerKeyCases = { correct: string[]; wrong: Array<{ kind: "tevhit" | "forditott" | "hianyos" | "temaidegen"; text: string }> }`;
  `answerKeyProblems(task, cases): string[]` — a helyes esetek mindegyike `ok` (különben: „<id>: válaszkulcs-teszt: a helyes válasz „…” nem kap
  teljes pontot (<reason>; hiányzó csoportok: …)”), a hibás esetek egyike sem `ok` (különben: „<id>: válaszkulcs-teszt: a hibás (<kind>) válasz
  „…” teljes pontot kap — a rubrika túl megengedő”). Üres / hiányos esetkészlet → nincs ítélet (nem bukás, napló).
- `server/studio/answer-key-writer.ts`: `writeAnswerKeys(tasks, ctx, call)` — csomagonként egy hívás; a tesztíró a RUBRIKÁT NEM látja (csak a
  kérdést, a mintaválaszt, a fogalmak definícióját és az évfolyamot), feladatonként 4–6 helyes, a gyerek nyelvén eltérő szórendű/ragozású/
  szinonimás választ és 3–5 hibásat (tévhit, fordított irány, hiányos, témaidegen) ad JSON-ban. Méretkorlát: válaszonként ≤ 300 karakter,
  feladatonként ≤ 6 + 5. Gyorsítótár a futáson belül a feladat tartalmi hash-ére (`q + sample + minWords`) → a javítókörben a változatlan
  feladat nem kér új tesztet. A hívás hibája (szolgáltató, alak) → nincs ítélet, figyelmeztetés (a gyártás nem áll meg miatta).
- `experience-builder.ts`: `ExperienceBuildDeps.answerKeys?` — ha a `validate` tiszta, a tesztek futnak; a bukások a meglévő `issues` útra
  kerülnek (nem-utolsó kísérlet: javítókör; utolsó: `salvagePacket` kiveszi, a padlóig). Számolós (`typedAnswers`) feladat kimarad (T5).
- `bank-repair.ts` `fieldsFor`: a „válaszkulcs-teszt” → `TASK_RUBRIC` (a kérdés, a minta és a rubrika együtt javítható).
- `step-runner.ts`: a bank lépés bekötése a `gateHelper` láncával; kapcsoló: `STUDIO_ANSWER_KEY_TESTS=0` kikapcsolja (vészfék).
- Tesztek: `tests/answer-key-tests.test.ts` (helyes bukás → üzenet; megengedő rubrika → üzenet; üres eset → nincs ítélet; ékezet nélküli
  válasz), `tests/bank-*.test.ts` bővítés (a tesztbukás javítókört indít, az utolsó kísérletnél kivétel; a tesztíró hibája nem állítja meg a
  csomagot; a gyorsítótár miatt a változatlan feladat nem hív újra).

## T2.2 — a lektor és a kapu (külön PR, a T2.1 mérése után)
- A lektor-prompt jelzi, hogy a rubrikát válaszkulcs-teszt igazolta; rubrika-megfogalmazás miatt nem blokkol, csak tényhiba / félrevezetés
  miatt. Mérés a `lektor-trial.mts`-sel (előtte/utána, ugyanazon 4 jobon); élesítés a T8-szabály szerint (rubrika-eredetű blokkolók ≥ 40%-kal
  kevesebb, a tényhibák továbbra is fennakadnak).

## Elfogadás (EARS)
- E1: HA egy feladat helyes parafrázisa nem kap teljes pontot, AKKOR a csomag javítókörbe megy a konkrét esettel; az utolsó kísérletnél a tétel kikerül.
- E2: HA egy hibás válasz teljes pontot kap, AKKOR ugyanígy.
- E3: HA a tesztíró hívása hibázik, AKKOR a csomag a T2 előtti szabályok szerint épül (figyelmeztetéssel).
- E4: A régi leckék pontozása változatlan (a pontozó nem módosul); a gyerekfelület nem változik.
- Ellenőrzés: célzott tesztek, `check`, `lint`, `check:test`, `build`, teljes `npm test`; a T2.0 mérés és a T2.1 utáni lecke-próba.

## T2.0 eredménye és a döntés (2026-10-15)
Lásd a terv 9. fejezetét: 188/193 feladat bukik helyes parafrázison, 18 hibás válasz teljes pontot kap, a lektor rubrika-blokkolóinak 23/23-át
elkapja. Kézi átnézés (6 tétel): döntően valódi rubrikahiány. Tulajdonosi döntés: **gépi kalibráció** (T2.1b), a szigorú javítókör helyett.
A meglévő hívásszámláló tesztek (`tests/lesson-pipeline-runner.test.ts`) a bankkísérleteket számolják: a tesztíró dokumentált, külön hívását a
harness felismeri és külön rögzíti (a bank-ellenőr mintájára) — a tesztek szándéka változatlan.

## T2.1b — gépi rubrika-kalibráció (`shared/answer-key-calibrate.ts`, tiszta)
`calibrateRubric(task, cases) → { task, changes[] }`, modellhívás nélkül, sorrendben; minden lépés után ŐR: a minta `ok`, és egyik hibás eset
sem `ok` — ha az őr sérül, az adott lépés visszavonódik.
1. **Alakfelvétel:** a helyes válasz egy szava egy hiányzó csoportba kerül, ha a csoport valamely elemével igazoltan rokon: a nyelvi adatbank
   (`hu-lexicon`: ragozott alak, írásváltozat, rokon értelmű szó) vagy közös szótő (közös kezdet ≥ 5 betű és ≥ a rövidebb szó hossza − 3).
2. **Bónuszba sorolás:** a kötelező csoport, amelyet a helyes esetek többsége (> 50%) a felvétel után sem tartalmaz, a `bonus`-ba kerül —
   egyenként, a legritkábban teljesülővel kezdve; legalább egy kötelező csoport mindig marad.
3. **Mondatfeltétel:** ha a helyes eset csak a kötőszó hiánya miatt nem `ok`, `needsSentence = false` (a minta meglévő szabályának mintájára).
4. **Szóminimum:** ha a helyes eset csak a szóminimum miatt bukik, `minWords` = a legrövidebb helyes eset szószáma (alsó korlát 1).
A kalibrált csomag újra átmegy a teljes `validate`-en; a maradék bukás a T2.1 útján (javítókör / kivétel a tartalék terhére).
Mérés (modellhívás nélkül, a T2.0 eseteivel): a kalibráció után bukó feladatok száma, a bónuszba sorolt csoportok száma, és hogy hibás válasz
nem kap teljes pontot. Tesztek: `tests/answer-key-calibrate.test.ts` (alakfelvétel szótővel / adatbankkal; bónuszba sorolás többségi
szabállyal; az őr visszavon, ha hibás válasz átmenne; legalább egy kötelező csoport marad; a régi leckék pontozása változatlan).
