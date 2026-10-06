# Spec: S7 — Workflow-rendbetétel (H, I, J, K, B′ workflow alá; a webes út egy futásban; skillek; támogató lelet-kódok)

> Dátum: 2026-10-06 · Szerző: Claude (ügynök) · Állapot: JÓVÁHAGYVA (a tulajdonos 2026-10-05-én a teljes S0–S11 tervet, benne az S7 sort elfogadta: `2026-10-05-tantargyi-tudasbank-terv.md` §5, §7)
> Végrehajtás: `docs/specs/2026-10-06-s7-workflow-rendbetetel-vegrehajtas.md`

## 1. Cél

Minden útvonal, amely leckét, régi HTML-anyagot (`html_files`) vagy tudástárat (`knowledge_maps`, `km_concepts`) gépi úton
(modellel vagy automatikusan) módosít vagy előállít, a workflow-motoron (`server/workflows/engine.ts` `executeWorkflow`) fusson:
lépésnapló, kapu, visszaolvasás, lelet-rögzítés és tanulás (`lesson_skill_audits` / `lesson_skill_lessons`). A webes út (C) egyetlen
futás legyen, valódi (nem utólag kitöltött) lépésekkel. A hiányzó skill-szövegek (témafókusz) pótolva, a támogató szerepek saját
lelet-kódot kapnak. Mindezt forrás-ellenőrző teszt kényszeríti ki: a teszt a kódból sorolja fel a védett táblák írási helyeit, és
minden workflow nélküli belépési pontot csak indokolt engedélylistán enged.

## 2. NEM cél

- A lecke-kimenet (tanítás, bank, kapuk, publikálás) tartalmi viselkedése nem változik; a kapuk mércéje nem lazul.
- Fizetős modellhívás nincs (a tesztek hamis szolgáltatóval/tárolóval futnak).
- A meglévő workflow-módok (`upload`, `studio`, `web`, `repair`, `concept`, `html`, `apply`) lánca és a `WORKFLOW_VERSION`
  (`lesson-flow-2`) NEM változik — a folyamatban lévő futások folytathatók maradnak.
- A kézi (emberi) adminműveletek (anyag-feltöltés, -szerkesztés, -törlés, rendezés, áthelyezés, címke, mentés/visszaállítás,
  szinkron, térkép kézi kurálása/jóváhagyása/törlése) NEM kerülnek workflow alá: ezek nem gépi tartalom-előállítás; a teszt
  engedélylistáján, indokkal szerepelnek.
- Az OCR rendszerutasítása nem bővül runbookkal (a szerep-skill már az elején van: `ocr.ts` `withRoleSkill("ocr", …)`; a prompt
  változása az OCR-gyorsítótár kulcsát és a fizetős átiratot változtatná). Az OCR a tanulási hurokba saját lelet-kóddal kerül.
- A `WEB_RESEARCH_PIPELINE=html` visszaállító (rollback) HTML-út szerkezete (`web` mód) változatlan.
- Az admin futásnapló (`GET /api/studio/workflows`, 50 sor) szűrése nem változik.

## 3. Mért kiinduló állapot (a kódból, 2026-10-06, main `8489285`)

Forrás-ellenőrző szkenner (`tests/helpers/workflow-write-graph.ts`, AST-alapú, a mostani kódon futtatva): **50 írási hely**
a védett táblákra; a workflow nélküli belépési pontok közül a gépi tartalom-módosítók:

| # | Útvonal (fájl:sor) | Ma | Írás |
|---|---|---|---|
| H | `server/routes.ts:1220` `/html-fix/errors`, `:1307` `/theme`, `:1404` `/chat` (modelles javaslat) | nincs workflow | — (javaslat) |
| H | `server/routes.ts:1637` `/html-fix/apply` | nincs workflow | `html_files.content` (`routes.ts:1654`) |
| I | `server/routes.ts:1671` `/material-creator/chat`, `:1849` `/enhanced-creator/analyze-files`, `:1998` `analyze-file`, `:2114` `chatgpt-chat`, `:2281` `claude-chat` | nincs workflow | — (javaslat/HTML a kliensnek) |
| J | `server/routes.ts:1027` `/api/admin/materials/:id/generate-quiz` → `gameQuizGeneratorService.ts:64` | nincs workflow | `game_quiz_items` (a leckéből származtatott) |
| K | `server/studio/routes.ts:210` `/maps/extract` → `run-extraction.ts:249,268` | csak `withPreparationSkill`, tanulás nincs | `knowledge_maps`, `km_concepts` |
| K | `server/studio/routes.ts:350` `/maps/:id/recheck` | nincs workflow | `km_concepts` (`routes.ts:368`) |
| B′ | `server/studio/lesson-pipeline-routes.ts:808` (driveTracked, workflow-előzmény nélkül → `guardedDrive`) — elérhető: `/jobs/:id/approve-outline`, `/jobs/:id/resume`, a söprő (`index.ts` → `sweepStudioJobs`) | nincs workflow | `lessons`, `html_files` (`step-runner.ts:2255–2316`) |
| B | `server/studio/lesson-pipeline-routes.ts:863` `/lessons/from-map/:mapId` determinisztikus forrás-helyesbítés a workflow ELŐTT | nincs workflow | `km_concepts` (`lesson-pipeline-routes.ts:545`) |
| C | `web-studio-handoff.ts:91` `outsideWorkflow(() => deps.start(...))` külön upload-futás; `web-research-jobs.ts:105–107` a `knowledge`/`author`/`gate` lépés utólag „kitöltve” | két futás | — |

Szerep-hiányok: `topic-focus.ts:50` `TOPIC_FOCUS_SYSTEM` skill-szöveg nélkül (a `role-skills-everywhere` teszt csak a
`corrector` delegálása miatt nem jelzi); a támogató szerepek (scope, corrector, verifier, vak megoldó, instruction-*, OCR,
témafókusz) hibái csak a közös regex-osztályozón át (`learning.ts:9` `detectors`) tanulnak, többnyire `unknown`-ként.

## 4. Rögzített döntések

1. **Új módok** (`shared/lesson-workflow.ts`, a meglévő láncok érintetlenek):
   - `htmlAssist` „Régi HTML javítási javaslata”: `source → author → gate → readback`; eredmény `proposal` (H errors/theme/chat).
   - `creator` „Anyagkészítő segéd”: `source → author → gate → readback`; eredmény `proposal` (I öt végpontja).
   - `quiz` „Játék-kvízgenerálás”: `source → author → gate → save → readback`; eredmény `material` (az anyag azonosítója) (J).
   - `map` „Tudástár-kivonatolás”: `source → scope → knowledge → gate → readback`; eredmény `map` (K extract).
   - `mapCheck` „Tudástár-ellenőrzés”: `source → gate → save → readback`; eredmény `map` (K recheck; a térképről indított lecke
     determinisztikus forrás-helyesbítése).
   - `webStudio` „Internetes készítés (Studio)”: `generate → source → scope → knowledge → sourceCheck → pedagogue → author →
     animator → lektor → gate → readback`, az `upload` mód körszabályaival (author/pedagogue/animator/lektor/gate visszalépés és
     keret). Eredmény `material`.
   - H `/html-fix/apply` a meglévő `apply` módban (`source → gate → apply → readback`).
2. **Eredményfajta**: `WorkflowView.result.kind` bővül: `proposal` (a kliensnek adott, nem tárolt javaslat; azonosító = a fájl vagy a
   futás), `map` (tudástár-azonosító). A motor módonként várja: `repair`/`html` → `candidate`; `htmlAssist`/`creator` → `proposal`;
   `map`/`mapCheck` → `map`; minden más → `material`.
3. **Skill**: `skillForMode`: `htmlAssist` → `tananyag-javito`; a többi új mód → `tananyag-keszito`. A runbook-dokumentum
   (`runtime-knowledge.ts`) a skill módjai között az új láncokat is felsorolja.
4. **Közös segéd**: `server/workflows/tool-run.ts` `runToolWorkflow({ mode, owner, request, id?, store? }, work)` — egyedi
   futásazonosítóval (`<mód>:<uuid>`) futtatja a munkát és a munka saját visszatérési értékét adja vissza (a válasz a hívóé). A
   bemenet-ellenőrzés (400/404) a workflow ELŐTT marad, így érvénytelen kérés nem ad hamis hibás futást.
5. **B′**: workflow-előzmény nélküli job folytatása megszűnik: `WorkflowConflict` „Ehhez a készítéshez nincs workflow-napló
   (kiadás előtti futás) …” → 409. (Spec-változás: a kiadás előtti jobok csak új készítéssel folytathatók.)
6. **B (from-map)**: a determinisztikus forrás-helyesbítés `mapCheck` futásban (`source → gate → save → readback`) fut a job indítása
   előtt; a viselkedés (modellhívás nélkül, hibánál helyesbítés nélkül tovább) változatlan.
7. **C egy futás**: a webes job workflow-ja `webStudio` módú. A `generate` lépés a forrásgyűjtést (`workflowCheckpoint("web-sources")`,
   folytatáskor új keresés nélkül) végzi, utána a feltöltéses gyártás magja (`runOneStepCore`) UGYANABBAN a workflow-kontextusban fut
   (`source`…`gate` valódi lépések), végül a `readback` a közzétett leckét és a webes job kész-állapotát igazolja. Nincs
   `outsideWorkflow`, nincs külön upload-futás. A haladásjelző (one-step progress) futásazonosítója = a webes job azonosítója.
   A Studio-panelről vagy a söprőből érkező folytatás (`driveTracked`, a `resourceId` révén ugyanaz a workflow) `webStudio` módban a
   webes jobot is kész állapotba zárja (`completeWebStudioJob`). A régi, `web` módú, kettévágott futás (van `studioRunId`, a
   workflow módja `web`) nem folytatható: `canResume=false`, új készítés kell (spec-változás).
8. **Skill-szöveg**: `SUPPORT_SKILLS["topic-focus"]` (kötelező szakaszokkal), a `decideTopicFocus` hívás `withSupportSkill`-lel.
9. **Támogató lelet-kódok** (`shared/lesson-skill.ts` `SKILL_RULES`, szabályszöveggel és `RULE_ROLES` szerep-leképezéssel):
   `scope_classification` (scope), `source_correction` (corrector), `topic_focus` (topic-focus), `blind_solver` (blind-solver),
   `bank_verifier` (bank-verifier), `instruction_points` (instruction-points), `instruction_check` (instruction-checker),
   `ocr_uncertain` (ocr, extract). Rögzítés `workflowFinding`-gel a hiba/visszaesés pontján (a futást nem állítja meg).
10. **Forrás-ellenőrző teszt** (`tests/s7-workflow-guard.test.ts`): a szkenner az összes írási helytől visszafelé követi a hívási
    láncot; minden workflow nélküli végpont (útvonal, modulszint, értékként átadott függvény, hivatkozás nélküli függvény) csak az
    engedélylistán lehet, kategóriával és indokkal; a lista elavult eleme is hiba. A „dispatch” kategóriájú elemhez (függvényérték,
    amelyet a termelési összerakás workflow-ban hív) gépileg ellenőrzött bizonyíték kell (`executeWorkflow(...)` argumentumán belüli hívás).

## 5. Edge case-ek

- Érvénytelen kérés (H/I/J/K): 400/404 a workflow előtt, futás nem jön létre.
- Modellhiba/JSON-hiba (H/I/J): a futás `error`, a lelet osztályozva (pl. `schema`, `infrastructure`) tanul; a kliens válasza (500/SSE
  error) változatlan.
- SSE-végpontok: a válasz a workflow-n belül íródik; a hiba a meglévő `catch`-ben megy ki SSE-eseményként.
- J: 0 érvényes tétel → nincs írás (mint eddig), a futás `save` lépése üres, `readback` a régi aktív készletet nem érinti — kész.
- K extract gyorsítótárból: `knowledge` lépés modellhívás nélkül, `readback` igazolja a meglévő térképet.
- K recheck: üres fogalomlista → 0 írás, kész futás.
- C: a gyártás közbeni szerver-újraindulás → a webes workflow `interrupted`; a söprő a `resourceId`-n át ugyanazt a workflow-t
  folytatja, és a webes jobot is lezárja; a webes panel „Folytatás” gombja `retry`-jal az elejéről indul (a forrásgyűjtés a
  checkpointból, a térkép a tartalom-hash alapján újrahasznosul).
- C: a gyártás `parked` vagy `error` → a webes futás érthető `WebResearchFailure`-rel áll meg (mint eddig).
- C: régi `web` módú futás folytatása → nem kínál folytatást.
- B′: kiadás előtti job „Folytatás”/vázlat-jóváhagyás → 409 érthető üzenettel; a söprő az ilyen jobot (futás nélkül) eddig is lezárta.

## 6. Elfogadási kritériumok (EARS)

- WHEN a szkenner a `server/` kódján fut THEN the system SHALL minden `lessons`/`html_files`/`knowledge_maps`/`km_concepts` írási
  helyet felsorolni, és minden workflow nélküli végpont SHALL szerepelni az indokolt engedélylistán (és fordítva: nincs elavult elem).
- WHEN a H `/html-fix/errors|theme|chat` vagy az I öt végpontja sikeresen lefut THEN the system SHALL egy `htmlAssist`/`creator`
  futást `done` állapotban, `source→author→gate→readback` lépésekkel és `proposal` eredménnyel rögzíteni.
- WHEN a `/html-fix/apply` lefut THEN the system SHALL az írást `apply` módú futásban végezni és a mentett tartalmat visszaolvasni.
- WHEN a J kvízgenerálás fut THEN the system SHALL `quiz` módú futásban, a `save` lépésben írni.
- WHEN a K extract/recheck fut THEN the system SHALL `map`/`mapCheck` futásban írni, `map` eredménnyel.
- WHEN egy job workflow-előzmény nélkül folytatódna THEN the system SHALL `WorkflowConflict`-ot adni, írás nélkül.
- WHEN a webes Studio-út fut THEN the system SHALL egyetlen `webStudio` futást vezetni, amelynek lépései a valódi végrehajtás
  sorrendjében `generate, source, scope, knowledge, sourceCheck, pedagogue, …, gate, readback`, és a gyártás a webes
  workflow-kontextusban fut (`workflowMode() === "webStudio"`).
- WHEN egy támogató szerep hibázik/visszaesik THEN the system SHALL a saját lelet-kódját rögzíteni a futásban.
- WHEN a témafókusz modell hívódik THEN the system SHALL a rendszerutasítás elején a `topic-focus` támogató skillt küldeni.

## 7. Tesztterv

- `tests/s7-workflow-guard.test.ts` — forrás-ellenőrző (szkenner + engedélylista + dispatch-bizonyítékok).
- `tests/s7-workflow-modes.test.ts` — új láncok, eredményfajták, skill-hozzárendelés, `runToolWorkflow` memóriás tárolóval
  (kész/hibás futás, lelet), támogató kódok szerep-leképezése, `topic-focus` skill a hívásban.
- `tests/web-studio-handoff.test.ts`, `tests/web-research-jobs.test.ts` Studio-átadás tesztjei: a spec-változás (§4/7) szerinti új
  elvárásra írva (a gyártás a webes workflow-ban, valódi lépéssorrend, nincs külön futás) — a mérce szigorodik, nem lazul.
- Teljes kör: `npm.cmd run check`, `npx.cmd tsc --noEmit -p tsconfig.test.json`, `npm.cmd run lint`, `npm.cmd test`.

## 8. Kockázatok / visszavonás

- Futásnapló-zaj: a segéd-végpontok (chat) futásai a napló 50-es listájában megjelennek (szándékos láthatóság; ha zavaró, külön
  szűrés-szelet).
- A webes út egy futása hosszabb (≈ upload-futás + gyűjtés); a lízing/szívverés ugyanaz, mint az upload-futásé.
- Visszavonás: commitonként revertálható; a webes útnál `WEB_RESEARCH_PIPELINE=html` a korábbi HTML-útra vált kódtelepítés nélkül.
- Statikus szkenner korlátja: név-alapú hivatkozáskövetés (típusellenőrző nélkül); metódus-értéket csak `kulcs: obj.metódus`
  alakban követ. A korlát a teszt fejlécében dokumentált; a hamis riasztás az engedélylistán indokolandó, nem némítható.
