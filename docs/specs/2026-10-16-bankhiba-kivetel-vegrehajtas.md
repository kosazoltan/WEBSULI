# Lektor bankhibái: kivétel a kapunál — végrehajtási utasítás (AI-olvasható)

Terv: `docs/specs/2026-10-16-bankhiba-kivetel.md`.

1. `server/studio/step-runner.ts`, lektor lépés:
   - a `bankOnly` után `bankRemoval = bankOnly && fusion && lesson.experience && process.env.STUDIO_BANK_ONLY_REPAIR !== "1"`;
   - `bankOnlyRepair = bankRepairPossible && bankOnly && !bankRemoval`.
   - A `nextStep` előtt: ha `bankRemoval` és `blockers > 0`, akkor `splitLimitBlockers(lesson, blockingNotes)`. Ha nincs `factual` / `incomplete`, akkor:
     - a `removable` jelölések bekerülnek a `choiceFlags`-be (mint a limit-ágban);
     - napló: „Lektor bankhibái kivételre a kapunál”;
     - a `nextStep` `blockers: 0`-val hívódik (→ gate).
2. `shared/studio-ui.ts` `lessonCreationStages`: `phase === "waiting"` + `stoppedAt` → a megállás előtti szakaszok `done`, a megállás szakasza `pending` (nem `active`, nem `error`).
   `client/src/components/studio/DraftLessons.tsx`: a tervre váró tétel `{ phase: "waiting", stoppedAt: "author" }` nézetet kap.
3. Tesztek:
   - `tests/lesson-pipeline-runner.test.ts`: a csak-bank kört rögzítő tesztek a `STUDIO_BANK_ONLY_REPAIR=1` kapcsolóval futnak. Ez dokumentált szerződésváltozás: a régi út a vészfék mögött él tovább.
   - Új teszt (K1/K2).
   - `tests/studio-one-step-progress.test.ts`: a `waiting` fázis (K4).
   - Böngésző: a tervre váró tételen nincs `data-state="active"` szakasz.

## Review #257
- A `bankRemoval` csak akkor igaz, ha a `splitLimitBlockers` szerint MINDEN blokkoló kivehető (nincs `factual` / `incomplete`). Más `experience.*` útvonalnál a régi csak-bank kör marad, nem szerzői kör (K1b teszt).
- `CreationProgress`: a `waiting` fázis saját részletszöveget kap („döntésre vár … jelenleg nem fut”).
- Review #257 (2. kör):
  - (a) a kivétel csak akkor jár, ha a kapu el is fogadná (`resolveChoiceGate` nem ad hibát, megmarad a publikálási minimum); különben a régi célzott csak-bank javítás marad (K1c teszt, ellenpróbával);
  - (b) a lektor a TÉNYLEGES átmeneti döntést menti (`blockers: gateBlockers`, a lektor saját száma `lektorBlockers`), így a gyorsítótárazott `cachedNext` is a kapuhoz visz;
  - (c) a K1 teszt valóban végigfuttatja a kaput (`advanceJob`): a hibás tétel kikerül a publikált leckéből, a publikálás egyszer fut.
