# Végrehajtás — S9 prompt-javító orkesztrátor (ügynöknek)

Terv: `2026-10-05-s9-prompt-javito-orkesztrator.md` (tulajdonosi tervezés). Az S10/1 (streamelés) erre épül, ugyanazon az ágon.

## Mért megállási pontok (felderítés 2026-10-05, fájl:sor)
- Minden bukás egyetlen kijáraton megy: `fail()` — `step-runner.ts:442` (job → error, csak az ok-szöveg marad).
- Modellhívás-szint: érvénytelen JSON / üres / hosszkorlát → `StepModelError` (`run-step.ts:243,248,263`); a nyers szöveg
  SZÁNDÉKOSAN eldobódik (`:257`) → az orkesztrátornak a kivonatát meg kell őrizni (csak a hiba objektumán, üzenetben nem).
- Lépésenkénti modell-lánc: elsődleges → tartalék → 2. tartalék, csak `StepModelError`-ra (`step-runner.ts:772-834`).
- Szerep-validálás egyszeri vak újrapróbával, utána `fail`: pedagógus Zod/coverage (`:862,864`, NINCS újrapróba), szerző
  séma/ismeretlen azonosító (`:898-952`), lektor alak (`:1151-1164`).
- Bankcsomag: 4 kísérlet (alap, alap, tartalék, mentő), a hibalista szó szerint megy vissza (`experience-builder.ts:379-462`),
  végül `throw` → `fail` (`step-runner.ts:1115`).
- Feltöltés (one-step): `inferScope` / `runExtraction` hibánál nincs újrapróba (`lesson-pipeline-routes.ts:342-348, 409-414`).
- Mért élesben ugyanazon a gyenge képen (Mezopotámia-füzet, run 7399f6f2): lektor grok „üres” → tartalék Claude
  „hosszkorlát” → megállás. Az OCR a halvány kézírást hibásan olvasta („Kesia, Föld - Felt.”, „papsági alakok”, „határak”) és
  a hibás szöveg jóváhagyott térképbe került (map 3d37c434) — minőségi kockázat, nem megállás.

## 1. szelet — orkesztrátor-mag (gyártásba kötés nélkül)
1. `server/workflows/orchestrator.ts`:
   - `OrchestratorInput` = { role, step, model, system (vágva: eleje+vége 6k), user (vágva 8k), failure: { kind:
     "invalid_json"|"schema"|"empty"|"length"|"gate"|"lektor_blockers"|"bank_packet"|"provider", reasons: string[],
     rawOutput?: string (vágva 6k) }, previousDiagnoses: string[], subject?: string }.
   - `buildOrchestratorPrompt(input)` + új támogató skill `orchestrator` (`support-skills.ts`): szerepe a hiba gyökérokának
     megnevezése és egy, a szerep modelljének szóló JAVÍTÓ UTASÍTÁS megírása (konkrét, a hibára szabott, a feladat
     átfogalmazását is megengedi; tilos: tény kitalálása, a forrás felülírása, a szerep-skill Tilalmainak feloldása).
   - Válasz-séma: `{ diagnosis: string(≤600), rootCause: string(≤200), correctivePrompt: string(40..4000) }`.
   - `orchestrate(input, call)`: modell `deepseek/deepseek-v4.1-flash`, tartalék `z-ai/glm-5.3-flash`; JSON-mód, stream.
   - `withCorrectivePrompt(system, result, version)` → a rendszerprompt VÉGÉRE:
     `=== ORKESZTRÁTOR JAVÍTÓ UTASÍTÁS (v<hash>) — a szerep Tilalmai elsőbbek ===` … `=== JAVÍTÓ UTASÍTÁS VÉGE ===`.
2. `StepModelError.rawOutput?: string` (vágva 6k) a `run-step.ts` elutasító ágain; az üzenet változatlan.
3. Tesztek: prompt-összeállítás (vágás, előző diagnózisok, nincs titok), séma, tartalék-modell, blokk-elhelyezés (vége),
   idempotencia, a skill regisztrálva.

## 2. szelet — bekötés (kapcsolóval: `WORKFLOW_ORCHESTRATOR=1`, alapból KI, élő próbán BE)
1. **Lépés-szint** (`step-runner.ts` `runStep`, a modell-lánc és a szerep-validálás `fail` előtti pontjai: pedagógus
   `:862,864`, szerző `:931-952`, lektor `:1162-1164`, lánc vége `:834`): `orchestratedRetry(job, ctx, failure)` — legfeljebb
   2 orkesztrált kör lépés-látogatásonként; a szerep ugyanazzal az elsődleges modellel fut újra a javított rendszerprompttal;
   az eredmény a MEGLÉVŐ validáláson megy át; siker → a lépés folytatódik, bukás → új diagnózis a friss hibával, végül a régi
   `fail`.
2. **Bankcsomag** (`experience-builder.ts:379`): a 2. bukott kísérlet után (a tartalék-modell ELŐTT) orkesztrátor-hívás a
   csomag hibáival és a bukott jelölttel; a javító utasítás a következő kísérletek rendszerpromptjának végére kerül.
3. Az orkesztrátor eredménye a futás pillanatképébe (`workflowCheckpoint("orchestrator:<lépés>:<n>")`) → folytatáskor nem
   generálódik újra; a hívás a javítási keretből fogy (`workflowEnsureRepairBudget`).
4. Napló: `[ORKESZTRÁTOR] <lépés>: <rootCause>` + kimenetel (siker/bukás) — a mérés ebből számol.

## 3. szelet — S10/2 automatikus folytatás (lásd S10-végrehajtás 2. szelet)
Boot-söprés: aktív lízingű futás érintetlen (élő folyamat hajtja); lejárt lízing + workflow-futás + < 2 automatikus folytatás
→ `driveTracked(job, owner, false)`; lízing-ütközés → nem zár hibára; egyéb hiba → a régi hibaüzenet.

## Élő bizonyítás (tulajdonosi kérés, fizetős, engedélyezve 2026-10-05)
Teljes feltöltési pipeline a `tmp/mezopotamia-fuzet.jpg` eredeti, gyenge minőségű képen (csak kép), helyi harness az éles
DB-n (`runOneStep`), `WORKFLOW_ORCHESTRATOR=1`, a S9+S10 ágon. Mérés: minden `[ORKESZTRÁTOR]` esemény (gyökérok, javító
prompt, kimenetel), streamelt hívások, végállapot (done / error és hol), a futás tokenköltsége. Elfogadás: a run
megállás nélkül elkészül VAGY minden megállás előtt dokumentált orkesztrált javítási kísérlet van; a kapuk nem
gyengültek (a lecke a meglévő kapukon ment át).

## Kapuk
Szeletenként célzott teszt → teljes unit, tsc, lint. Az élő futás alatt nincs merge/deploy (a Render boot-söprés lezárná).
