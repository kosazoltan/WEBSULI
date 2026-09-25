# Spec: Internetes tananyagkészítés — elakadás megszüntetése (1. szelet: működés)

> Dátum: 2026-09-25 · Szerző: Claude Code (felhő-munkamenet) · Állapot: JÓVÁHAGYVA (tulajdonosi kérés: „ellenőrizd, hol és miért akadt el, és javítsd meg”; a 2. fázis után azonnal a 3.)
> Szabály: `docs/agent-haromfazisu-munka.md`. Végrehajtás: `docs/specs/2026-09-25-webes-gyartas-elakadas-vegrehajtas.md`.

## 0. Diagnózis (kódból ellenőrzött; éles DB/napló ebben a munkamenetben NEM elérhető — UNVERIFIED élesben)

A webes út utolsó sikeres futása 2026-09-20 (LEDGER: `done` 1166 s). Azóta a PR #104–#124 kizárólag a feltöltős Studio-utat
fejlesztette; a `server/studio/web-*.ts` fájlokat 09-20 után csak a 6abd1a6 (skill-blokk) érintette. A webes út így lemaradt,
és a következő, a feltöltős úton már mért és ott javított hibák maradtak benne:

1. **Soros, 20 perces keretbe szorított bankgyártás.** `web-research-runner.ts:288` 20 perces fáziskeretet indít, majd a
   `buildLessonExperience` `concurrency` nélkül (= 1, soros) fut. Mérve a feltöltős úton (run 525b2797): 10 csomag sorosan
   1 795 s > 1 200 s. Nagyobb témánál a futás a bankfázisban „Időtúllépés” hibával leáll.
2. **Az első rossz modellválasz megöli a bankot.** A webes `call` a `StepModelError`-t (hosszkorlát / üres / nem JSON / lassú törzs)
   nem csomagolja `RetryableBankCallError`-ba, így `experience-builder.ts:328` azonnal továbbdobja: a csomagonkénti 3+1 kísérlet
   (tartalék és mentőmodell) nem fut le. A feltöltős út ezt 09-19/20-án javította (`step-runner.ts:855-883`, run 45233b4b).
3. **A bank a drága szerzőmodellen fut, JSON-mód és törzs-határidő nélkül** (`createStudioProvider(authorModel, 240_000, 16_000)`,
   `step: "author"` → nincs `STUDIO_STEP_POLICY`, nincs `AbortSignal`-határidő a törzsre). A mért bankmodell (`bank`: gpt-5.6-luna,
   tartalék/mentő: terra) nincs használva.
4. **Egy sikertelen állapotírás megmérgezi a mentési láncot** (`web-research-jobs.ts:65`): utána egyetlen állapotírás sem fut,
   a következő `await checkpoint` generikus „AI hiba” üzenettel buktatja a futást.
5. **A 25 perces „árva futás” szabály az élő munkást is megöli** (`web-research-jobs.ts:129-133`): nem nézi a workflow bérletét;
   ha a munkás 25 percig nem írt állapotot, a sor `error` lesz, a munkás későbbi írásai (várt állapot `running`) csendben elvesznek.
   Szerver-újraindulás után viszont 25 percig „fut” látszik, holott a workflow 90 s után már `interrupted`.
6. **A folytatás egyetlen HTTP-kérésben fut** (`publish()` → `await run(job, true)`), a kliens 20 s után megszakítja, és a
   követés nem indul újra (`WebResearchAgentPanel.tsx:145`): a felület halottnak látszik, miközben a szerver dolgozik.
7. **Egy átmeneti DB-hiba a szívverésnél végleg elveszti a bérletet** (`workflows/engine.ts:185`: `.catch(() => lostLease = true)`).

A webes út a feltöltős út minőségi lépéseit (vak megoldó, bank-ellenőr, magyarázó ábrák, forrás-helyesbítés, évfolyam-felismerés,
Studio-lecke kimenet) sem kapja meg. Ez a **módszer** lemaradása — külön, 2. szelet (lásd 9. pont), mert a kimenet formáját
(önálló HTML → Studio-lecke) változtatja, és tulajdonosi döntést igényel.

## 1. Cél

Az internetes tananyagkészítés ne akadjon el a bankgyártásban és az állapotkövetésben: a bank ugyanazzal a mért modell-útvonallal,
párhuzamosan, újrapróbálással és folytatható részeredménnyel készüljön, mint a feltöltős úton; élő munkást a felület ne nyilvánítson
halottnak, halott munkást 25 perc helyett a bérlet lejártakor jelezzen; a folytatás ne egyetlen HTTP-kérésben fusson.

## 2. NEM cél

- A webes kimenet formája (önálló HTML + `websuli-lesson-data`) és a kapuk (45/75, tíz módszer, lektor, forrásidézet) változatlan.
- Nem kötjük be most a vak megoldót, a bank-ellenőrt, az ábrakészítőt — 2. szelet.
- A feltöltős út viselkedése változatlan (csak a bankhívás-útvonal kerül közös modulba, bájtra azonos döntésekkel).
- Éles gyártás, DB-írás, deploy ebben a szeletben nincs.

## 3. Érintett területek

- `source/server/studio/bank-call.ts` — ÚJ: a bankcsomag modellválasztása és hibaosztályozása (a `step-runner.ts`-ből kiemelve).
- `source/server/studio/step-runner.ts` — a kiemelt függvényeket használja.
- `source/server/studio/web-research-runner.ts` — bank: közös hívás, `PACKET_CONCURRENCY`, hibanapló, haladásjelzés, mentett csomagok.
- `source/server/studio/web-research-jobs.ts` — ellenálló mentési lánc; workflow-alapú árva-felismerés; háttérben induló folytatás; bank-checkpoint tárolás.
- `source/server/studio/web-research-routes.ts` — a publish-végpont háttér-folytatást kér.
- `source/server/workflows/engine.ts` — szívverés: kivétel nem jelent bérletvesztést.
- `source/client/src/components/studio/WebResearchAgentPanel.tsx` — folytatás után újraindul a követés.
- Tesztek: `tests/bank-call.test.ts` (új), `tests/web-research-jobs.test.ts` (új esetek).

## 4. Rögzített döntések

1. Bankmodell kísérletenként: `attempt < PACKET_ATTEMPTS-1` → `resolveStudioModel("bank")`; `= PACKET_ATTEMPTS-1` → `FALLBACK_MODELS.bank`;
   `>= PACKET_ATTEMPTS` → `BANK_RESCUE_MODEL`. Szolgáltató-lépés: `"bank"` (mentőkörben `"author"`), hívás `step: "animator"` (240 s törzs-határidő).
2. Modell-kimeneti hiba (`StepModelError` ok nélkül vagy `AIProviderTimeoutError` okkal) → `RetryableBankCallError`; más szolgáltatói hiba továbbdobódik.
3. Webes bank: `concurrency: PACKET_CONCURRENCY`; a teljes bankfázis keretét a meglévő 20 perces fáziskeret adja.
4. A bank-checkpoint a job-sorban (`StoredResearchJob.bankCheckpoint`) él, a nyilvános nézetben nem jelenik meg.
5. Árva-felismerés: ha van workflow-rekord és állapota `running` → a job nem válik hibássá; `error`/`interrupted` → azonnal hibás (folytatási lehetőséggel). Workflow nélkül a 25 perces szabály marad.
6. `publish(id, user, { background: true })`: nem kész jobnál a folytatás a bérlet megszerzése és a `running` állapot mentése után tér vissza; a munka háttérben fut. Alapértelmezés (tesztek, régi hívók) változatlanul megvárja a futást.

## 5. Edge case-ek

- Hiányzó bankmodell-kulcs → a futás elején érthető hiba, nem a bank közepén.
- Mindhárom modell hibázik egy csomagon → a meglévő „a gyakorlóbank nem készült el” hiba; a kész csomagok a job-sorban megmaradnak.
- Folytatás közben már futó munkás → `WorkflowConflict` → 409, a kliens tovább követ.
- A mentési lánc egy írása hibázik, a következő sikerül → a futás nem bukik; csak az utolsó írás hibája számít.

## 6. Elfogadási kritériumok (EARS)

- WHEN a bank egy csomagjára a modell hosszkorlátos/üres/nem JSON választ ad THEN the system SHALL a következő kísérletet a tartalék, majd a mentőmodellen futtatni, nem leállni.
- WHEN webes bank készül THEN the system SHALL `PACKET_CONCURRENCY` csomagot egyszerre építeni és a kész csomagokat a job-sorba menteni.
- WHEN egy folytatott futás bankfázisba ér THEN the system SHALL a korábban kész csomagokat modellhívás nélkül újrahasznosítani.
- WHEN a job `running`, a workflow `running` és 25 percnél régebbi az utolsó írás THEN the system SHALL a jobot `running` állapotban hagyni.
- WHEN a job `running`, a workflow `interrupted` vagy `error` THEN the system SHALL a jobot azonnal `error`-ra állítani, folytatási lehetőséggel.
- WHEN egy állapotírás kivételt dob és a következő sikerül THEN the system SHALL a futást nem buktatni.
- WHEN a kliens folytatást kér THEN the system SHALL a bérlet megszerzése után `running` állapotot visszaadni, a kliens pedig SHALL újraindítani a követést.
- WHEN a szívverés lekérdezése kivételt dob THEN the system SHALL a bérletet nem tekinteni elveszettnek (a DB-bérlet 90 s-os lejárata dönt).
- A feltöltős út bankmodell-választása és hibaosztályozása változatlan (a meglévő tesztek zöldek).

## 7. Tesztterv

- `tests/bank-call.test.ts`: modellválasztás kísérletenként; hibaosztályozás (ok nélküli, időtúllépéses, szolgáltatói).
- `tests/web-research-jobs.test.ts`: élő workflow + régi `updatedAt` → marad `running`; `interrupted` workflow → azonnal `error`; mérgezett lánc; háttér-folytatás; bank-checkpoint átadása folytatáskor.
- Teljes kapu: `npm run check`, `check:test`, `lint`, `npm test`, `build`.
- NOT RUN ebben a munkamenetben: éles webes gyártás (nincs éles hálózat/kulcs a konténerben).

## 8. Kockázatok / visszavonás

- A közös bankhívás-modul a feltöltős utat is érinti → bájtra azonos döntési tábla, a meglévő step-runner tesztek fedik. Visszavonás: a PR revertje.
- Háttér-folytatás: ha a munka a bérlet megszerzése előtt hibázik, a hiba a kérésben jelenik meg (nem vész el).

## 9. Következő szelet (2. szelet — módszer, tulajdonosi döntés kell)

A webes út a gyűjtés (web_search + web_fetch) után a letöltött oldalakat `text` forrásfájlként adja át az egylépéses Studio-gyártásnak
(`runOneStepCore`), így ugyanazt a módszert kapja: forrásalapú évfolyam-felismerés, kurált tudástár, tervező, vak megoldó, bank-ellenőr,
Opus-ábrák, vizuális világ, lektor, Studio-lecke. Döntés szükséges: a webes lecke kimenete Studio-lecke legyen-e (négylapos runtime) az
önálló HTML helyett, és a forrás-URL-ek hogyan jelenjenek meg a leckében.
