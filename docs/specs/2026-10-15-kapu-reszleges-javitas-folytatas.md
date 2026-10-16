# Kapu: részleges tételjavítás, kapuhiba-folytatás, gyártáskövetés (2026-10-15)

Tulajdonosi utasítás (2026-10-15): „Minden … hibát, a gyártás követés hibát is és az általad javasoltakat is készítsd el … lint merge push deploy engedélyt megadom.”

## Mért kiinduló helyzet (élő, websuli.vip, 2026-10-15)

- **Job `416ad01d`** (run `be5ac4d5`, a megszakadt tananyag): a mentett részekből folytatva 3 lektor–animátor kör után a kapunál megállt:
  „Hibás banktétel maradt a limiten, és a kivétel után a bank nem felelne meg … (kivétel után: Legalább 45 szöveges feladat és 75 kvízkérdés szükséges.)”.
  A bank 48 feladat / 82 kvíz; 4 körlimiten maradt feladat (`tasks[7]`, `[0]`, `[12]`, `[24]`) → kivétel után 44 < 45.
- Render-napló (06:12:24–06:14:10): a kapu orkesztrált javítása (`repairFlaggedBankItems`) EGY adagban (4 tétel) futott; a `tasks[7]` két körben
  sem volt javítható („a pontozó a required csoportokat sorrendtől függetlenül értékeli”), ezért `kapu: experience.tasks[7] nem javítható (1/1. adag)
  — a régi hibaút` → a másik 3 tétel javítását meg sem kísérelte, az eredmény `null`, a kapu mind a 4 tételt kivenné → bukás.
  Ha csak a javíthatatlan `tasks[7]` kerülne ki: 47 ≥ 45 → publikálható lett volna (a többi tételt a kapu javítja és a független ellenőr igazolja).
- A „Folytatás a mentett részekből” gomb a kapuhibánál is megjelent, a szöveg „A folytatás innen halad tovább” volt; kattintásra
  `409 Csak mentett tananyagos lektor-időtúllépés folytatható újragyártás nélkül.` (`POST /api/studio/jobs/:id/resume` → `retryTimedOutLektor`).
- Gyártáskövetés (élő megfigyelés):
  1. Folytatás közben a haladásjelző fázisa beragadt (`one_step_runs.phase = animator`, miközben a job `lektor`/`gate` lépésben futott):
     a `driveTracked` → `guardedDrive` → `drive(jobId)` hívás nem kap `onStep`-et.
  2. A folyamatábra (`WorkflowMonitor`) hibaállapotban leállítja a lekérdezést (`refetchInterval` csak running/waiting), a folytatás után nem
     kérdez újra → „7. Megállt / 8. Még nem indult” maradt, miközben a lektor háromszor lefutott.
  3. Hibaállapotban a három szakasz (`CreationProgress`) mind üres („Még nincs kész”), pedig a szerver tudja, melyik lépésnél állt meg.

## Cél

1. **Részleges kapujavítás:** a kapu a javítható tételeket javítja, a javíthatatlanokat a meglévő kivételi szabály (padló-ellenőrzéssel) veszi ki.
2. **Kapuhiba-folytatás:** a naplóval igazolt, mentett, nem publikált kapu-bankhiba („Hibás banktétel maradt a limiten…”, „Egyválasztós hiba
   maradt a bankban…”) a mentett leckéből a kapu újrafuttatásával folytatható (újragyártás nélkül).
3. **Gomb csak akkor:** a „Folytatás” gomb és a „folytatás innen halad tovább” szöveg csak akkor jelenik meg, ha a szerver szerint a folytatás
   lehetséges; különben érthető magyarázat.
4. **Gyártáskövetés:** folytatás közben a fázis frissül; a folyamatábra a folytatás után újra lekérdez; hibaállapotban a megállás szakasza
   „Megállt”, az előtte lévők „Kész”.

## Nem-cél

- A kapu mércéje (45/75 padló, a független bank-ellenőr, determinisztikus ellenőrzések) NEM változik; hibás tétel nem kerül publikálásra.
- A `repairFlaggedBankItems` alapértelmezett viselkedése és tesztjei (S11/6 „részleges eredmény nincs”) változatlanok; a részleges mód
  kifejezett opció, csak a kapu használja.
- Nincs adatbázis-migráció, nincs új végpont (a meglévő `resume` és `one-step/:runId` bővül).
- A webes (`webStudio`) publikálási útvonal folytatása nem változik.

## Érintett fájlok

- `source/server/studio/gate-item-repair.ts` — `partial` opció, `unrepaired` lista.
- `source/server/studio/step-runner.ts` — a kapu részleges módot kér; új `retryFailedGate`; közös `resumeKindOf`.
- `source/server/studio/lesson-pipeline-routes.ts` — a `resume` útvonal a `resumeKindOf` szerint ágazik; `driveTracked` fázist frissít;
  `oneStepRunView` → `resumable`, `stoppedAt`.
- `source/shared/studio-ui.ts` — `OneStepRunView.stoppedAt`, `lessonCreationStages` „error” állapota.
- `source/client/src/components/studio/CreationProgress.tsx`, `SourceUploadForm.tsx` — megjelenítés, gomb-feltétel, folyamatábra-invalidálás.
- Tesztek: `source/tests/gate-item-repair.test.ts` (új esetek), `source/tests/studio-one-step-progress.test.ts` (új esetek),
  új `source/tests/gate-resume.test.ts`.

## Rögzített döntések

- D1: `repairFlaggedBankItems({ …, partial: true })`: egy cél bukása nem állítja meg a többit; az adag utáni ellenőrzés bukásakor az adag
  visszaáll (a tételei javítatlanok); a végső ellenőrzés csak a ÚJ (a kiinduló bankban nem szereplő) vagy JAVÍTOTT tételt megnevező hibára
  buktat (→ `null`). Ha semmi sem javult → `null` (a régi hibaút). Eredmény: `{ lesson, repaired, unrepaired, batches }`.
- D2: A kapu a meglévő `remaining = gateFlags − repaired` számítással a `resolveChoiceGate`-et hívja: a javítatlan tételek kivétele és a
  padló-ellenőrzés változatlan. A minőségi jegyzet (`gate_item_repaired`) a javítatlanokat is felsorolja.
- D3: `resumeKindOf({ error, status, step, hasLesson, htmlFileId, published, visitStep, visitState, visitErrorMatches })` →
  `"bank" | "lektor" | "gate" | null` tiszta függvény; a `resume` útvonal és a `oneStepRunView.resumable` ugyanezt használja.
  `gate`: `visitStep === "gate"`, `visitState === "error"`, a látogatás hibája = a job hibája (redaktált), mentett, nem publikált lecke,
  és a hiba „Hibás banktétel maradt a limiten” vagy „Egyválasztós hiba maradt a bankban” kezdetű.
- D4: `retryFailedGate` a jobot `step: "gate", status: "pending"` állapotba teszi, `previousGateError` és `gateRecoveryAttempt` (+1) mezővel
  (a `bankRecoveryAttempt` mintájára). A workflow-keret: a gyártási módokban a kapu `maxVisits = 4`; az engine a megállt lépés folytatását
  `continuation`-ként engedi (`server/workflows/engine.ts` 207. sor).
- D5: `stoppedAt` = a workflow utolsó `error` állapotú látogatásának lépése (csak `phase === "error"`-nál). Leképezés szakaszra:
  forrás (`source`, `scope`, `knowledge`, `sourceCheck`, `indul`, `ocr`, `extract`), tananyag (`pedagogue`, `author`, `animator`),
  ellenőrzés (`lektor`, `gate`, `publish`, `readback`). Ismeretlen lépésnél a régi viselkedés (mind „pending”).
- D6: `driveTracked` a követett futásnál a `drive`-nak `onStep`-et ad (ugyanaz a fázisfrissítés, mint a `driveOneStep`-ben).
- D7: A `SourceUploadForm` a sikeres folytatás után invalidálja a `["/api/studio/workflows", runId]` lekérdezést.

## Edge case-ek

- Minden cél javíthatatlan → `null` → a régi hibaút (változatlan hibaüzenet).
- Részleges javítás után is a padló alatt → a kapu bukik (a hibaüzenet a megmaradt tételeket sorolja); `resumable` igaz marad (újabb kísérlet
  lehetséges), a számláló nő.
- Publikált lecke / `htmlFileId` / nem kapu-látogatás / eltérő hibaszöveg → nem folytatható (`resumable: false`, a `resume` 409).
- Régi futás workflow-napló nélkül → `resumable: false`.

## Elfogadás (EARS)

- E1: HA a kapu 4 jelzett tételéből 1 javíthatatlan és 3 javítható, AKKOR a kapu a 3 javított tétellel és 1 kivétellel számol (egységteszt).
- E2: HA a kapuhiba a D3 szerinti, AKKOR a `resume` 202-t ad, és a job `gate`/`pending` állapotba kerül `gateRecoveryAttempt: 1`-gyel (egységteszt).
- E3: HA a hiba nem folytatható, AKKOR a `oneStepRunView` `resumable: false`, és a felület nem mutat Folytatás gombot (egység + böngésző).
- E4: Folytatás közben a `phase` követi a job lépését; hibánál a megállás szakasza „Megállt” (egységteszt + böngésző).
- E5 (élő): a deploy után a `416ad01d` job a felületről folytatható, és publikál VAGY a megmaradt hibás tételeket pontosan megnevező kapuhibával áll meg.
