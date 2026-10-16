# Egyfutásos tananyaggyártás — végrehajtási utasítás (AI-olvasható)

Terv: `docs/specs/2026-10-16-egy-futas.md`. Szeletenként külön ág és PR; minden szelet zöld kapukkal (check, lint, test, build,
háromfázis-kapu) zárul.

## S1 — döntőbíró
- `server/arbiter/arbiter.ts`:
  - `ARBITER_MODEL = "claude-opus-5-5"`, `ARBITER_FALLBACK_MODEL = "gpt-6.1-sol"`.
- `server/arbiter/routes.ts`:
  - a `callModel` előbb az elsődleges modellt hívja, hiba esetén a tartalékot (`callStepModelWithFallback` vagy két egymás utáni `callStepModel`);
  - mindkettő `effort: medium` (az `arbiter` policy).
- `server/ai/studio-provider.ts` `arbiter` policy: effort medium; a Claude-ág a `output_config.effort`-ot kapja.
- Tesztek:
  - az elsődleges hiba → tartalék;
  - mindkét hiba → determinisztikus ítélet (változatlan);
  - a modellnevek rögzítve.

## S2 — beszélgetés-réteg (`server/studio/single-run/conversation.ts`)
- `type Turn = { role: "user" | "assistant"; blocks: Array<{ type: "text"; text: string } | SourceBlock> }`.
- `class LessonConversation`:
  - `constructor(system, opts: { primary: ModelClient; fallback: ModelClient })`;
  - `send(userBlocks): Promise<string>`: hozzáfűzi a felhasználói fordulót, a modell válaszát a beszélgetéshez adja, és visszaadja a szövegét;
  - `transcript()` / `restore(turns)`: mentés és visszatöltés.
- `ModelClient` interfész: `complete(system, turns): Promise<{ text; usage; model }>`.
- **Anthropic-implementáció:**
  - `messages.stream`, `thinking: { type: "adaptive" }`, `output_config: { effort: "medium" }`, `max_tokens` 64000;
  - `cache_control: { type: "ephemeral" }` a rendszerprompton és az utolsó előtti fordulón.
- **OpenAI Responses-implementáció:** `gpt-6.1-sol`, `reasoning: { effort: "medium" }`; a forrásblokkok `input_image` / `input_file` alakra
  konvertálva.
- **Tartalékváltás:**
  - az elsődleges kliens 2 próbája után elérhetetlenségi hibánál (hitelesítés, 429, 5xx, 529, hálózat) a beszélgetés VÉGLEG a tartalékra vált,
    és a teljes átiratot küldi;
  - a váltás `onFallback` eseménnyel naplózódik.
- Egységtesztek hamis kliensekkel: a többfordulós sorrend, a gyorsítótár-jelölés, a váltás teljes átirattal, valamint az átirat mentése és
  visszatöltése.

## S3 — motor és bekötés (`server/studio/single-run/engine.ts`)
- **`runSingleLesson({ jobId, files, instruction, owner, onPhase, store, conversation })`.** A rendszerprompt:
  - a szerep-skillek (`roleSkillBlock` a pedagogue / author / animator / bank / lektor szerepre);
  - a tantárgyi skill;
  - a pontozó szabálya (`OPEN_ANSWER_RULES_HU`);
  - a lecke- és bankszerződés.
- **Állomások** a terv B táblázata szerint. Állomásonként:
  - JSON-kérés;
  - `parse` és a meglévő determinisztikus ellenőrzők;
  - ha van hiba, a hibalista ugyanabban a beszélgetésben megy vissza; legfeljebb 3 javító forduló.
  - **1. állomás:** a térkép a `knowledge_maps` / `km_concepts` táblába kerül. Ugyanaz a tranzakciós beszúrás, mint a `run-extraction.ts:282-300`
    (közös függvénybe kiemelve).
  - **4. állomás:** fejezetenként a `planLessonBank` kvótája; a csomag a `normalizeBankPacket` → `autofixBankPacket` → `experiencePacketSchema` úton megy.
  - **5. állomás:**
    - a lektor-leletek javításként (teljes fejezet- vagy tételcsere) jönnek;
    - a válaszkulcs-próbák a `evaluateOpenAnswer`-en futnak; a bukó próba visszajelzés;
    - legfeljebb 3 kör.
  - **6. állomás:**
    - `experienceProblems`, `verifyLessonSkillBank`, `checkCoverageGate`, `checkLessonArc`;
    - ha zöld, `store.upsertLesson` + `store.publishLesson` + visszaolvasás.
- **Mentés:**
  - minden lezárt állomás után `studio_jobs.output = { singleRun: { phase, transcript, model }, lesson?, outline?, ... }`;
  - a `step` tükrözése: 1 → `pedagogue`, 2 → `pedagogue`, 3 → `author`, 4 → `animator`, 5 → `lektor`, 6 → `gate`, kész → `done`.
- **Folytatás:** a `singleRun.transcript` visszatöltése, majd az utolsó lezárt állomás utáni állomástól.
- **Bekötés** (`lesson-pipeline-routes.ts`):
  - a `runOneStepCore` és a `runOneStepInWorkflow` a fájlokkal a `runSingleLesson`-t hívja (térkép-előállítás + lépésgép helyett);
  - a `/lessons/from-map/:mapId` a térkép forrásszövegével indul;
  - a `remanufactureFromMap`, a `/drafts/:id/continue` és a `/jobs/:id/resume` a `singleRun` jobot folytatja, régi jobnál újragyárt;
  - a `sweepFailedStudioJobs` / `sweepStudioJobs` a `singleRun` jobot folytatja, régi jobot nem hajt.
- **Tesztek:**
  - teljes futás hamis beszélgetéssel (forrás → közzététel), egyetlen kliensen át, más modellhívás nélkül;
  - javító forduló hibás bankcsomagnál;
  - 3 sikertelen kör → megállás a piszkozat megtartásával;
  - folytatás mentett átiratból;
  - tartalékváltás menet közben.

## S4 — kivezetés
- **Törlés:**
  - a régi lépésgép (`step-runner.ts` lépésmodell-hívásai, `bank-call`, `answer-key-writer`, `quiz-blind-check`, `bank-verifier`, `blind-solver`,
    `instruction-check` / `instruction-points`, `source-reference` szövegjavító, `ocr` fúzió);
  - a hozzájuk tartozó modellkonstansok és tesztjeik.
- A `models.ts` csak az Opus 5.5-öt és a GPT-6.1 Solt tartja meg (a nem tananyaggyártó, régi útvonalak modelljeit külön listázni és dönteni).
- Ellenőrzés:
  - `grep` a régi modellnevekre: 0 találat a tananyaggyártásban;
  - teljes tesztkészlet zöld;
  - élő futás.

## S1 — review #258
- **Időkeret:** modellenként 30 s; a kliens 70 s-ig vár (a teljes elsődleges + tartalék lánc).
- **Séma:** a válasz modellenként a döntőbíró sémáján is ellenőrződik (`parseArbiterVerdict`); hibánál a tartalék jön.
- **Napi keret:** a tartalék második fizetett hívása előtt külön atomi napi keretfoglalás; elfogyott keretnél nincs hívás.
- **Gyorsítótár:** `ARBITER_VERSION` arbiter-1 → arbiter-2 (a modellváltás a régi ítéleteket érvényteleníti).

## S2 — review #259
- **Szöveges forrás:** a modell a kinyert szöveget (`extractedText`, pl. docx) kapja, nem a nyers base64 tartalmat.
- **Tartalékválasz:** a `failed` / `cancelled` állapotú tartalékválasz hiba (nem üres forduló).
- **Hibás forduló:** sikertelen forduló után az átirat a hívás előtti hosszra áll vissza; a használat-napló (`onUsage`) hibája nem rontja a sikeres fordulót.
- **Kulcsok:** az üres vagy csak szóközt tartalmazó kulcs hiányzó kulcsnak számít.
