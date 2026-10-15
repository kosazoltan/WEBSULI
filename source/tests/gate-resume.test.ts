import test from "node:test";
import assert from "node:assert/strict";
import { resumeKindOf } from "../server/studio/step-runner";
import { redactWorkflowError } from "../server/workflows/engine";

/* Spec 2026-10-15-kapu-reszleges-javitas-folytatas (D3): a folytathatóság EGY szabálya — a resume útvonal és a futásnézet gombja ezt használja.
   Mért: job 416ad01d — a gomb a kapuhibánál is megjelent, a szerver 409-cel elutasította. */

const gateError = "Hibás banktétel maradt a limiten, és a kivétel után a bank nem felelne meg — nem publikálható: experience.tasks[7]: x";
const base = { step: "error", status: "error", error: gateError, hasLesson: true };
const visit = (step: string, error = gateError) => ({ step, state: "error", error: redactWorkflowError(new Error(error)) });

test("kapuhiba a kapu-látogatással → gate; a egyválasztós bankhiba is", () => {
  assert.equal(resumeKindOf({ ...base, visit: visit("gate") }), "gate");
  const choice = "Egyválasztós hiba maradt a bankban, és a tételek kivétele után a bank nem felelne meg — nem publikálható: x";
  assert.equal(resumeKindOf({ ...base, error: choice, visit: visit("gate", choice) }), "gate");
});

test("nem folytatható: publikált, htmlFileId, nincs lecke, más hiba, más/hiányzó látogatás, nem hibás job", () => {
  assert.equal(resumeKindOf({ ...base, published: true, visit: visit("gate") }), null);
  assert.equal(resumeKindOf({ ...base, htmlFileId: "h1", visit: visit("gate") }), null);
  assert.equal(resumeKindOf({ ...base, hasLesson: false, visit: visit("gate") }), null);
  const other = "A fúziós módszer kapuja elutasította a leckét: x";
  assert.equal(resumeKindOf({ ...base, error: other, visit: visit("gate", other) }), null);
  assert.equal(resumeKindOf({ ...base, visit: { ...visit("gate"), error: "más" } }), null);
  assert.equal(resumeKindOf({ ...base, visit: { ...visit("gate"), state: "running" } }), null);
  assert.equal(resumeKindOf({ ...base, visit: undefined }), null);
  assert.equal(resumeKindOf({ ...base, step: "gate", visit: visit("gate") }), null);
  assert.equal(resumeKindOf({ ...base, status: "running", visit: visit("gate") }), null);
});

test("a meglévő bank- és lektor-folytatás szabálya változatlan", () => {
  const bank = "A 2. fejezet bankcsomagja a javító kör után sem megfelelő: x";
  assert.equal(resumeKindOf({ ...base, error: bank, visit: visit("animator", bank) }), "bank");
  const provider = 'A(z) "animator" lépés modellhívása hibára futott: [OpenAI] 500';
  assert.equal(resumeKindOf({ ...base, error: provider, visit: visit("animator", provider) }), "bank");
  assert.equal(resumeKindOf({ ...base, error: gateError, visit: visit("animator") }), null, "kapuhiba animátor-látogatással nem bank");
  const timeout = 'A(z) "lektor" lépés modellhívása hibára futott: Request timed out';
  assert.equal(resumeKindOf({ ...base, error: timeout, visit: visit("lektor", timeout) }), "lektor");
  assert.equal(resumeKindOf({ ...base, error: "A lektor 1 tartalmi javítást kér.", visit: visit("lektor", "A lektor 1 tartalmi javítást kér.") }), null);
});

test("T0.4: a lektor-bizonyíték eltérése → review (a lektor újrafut); más végkapu-ok (nyitott blokkoló) nem folytatható", () => {
  const evidence = "A 7.4 végkapuhoz az aktuális tanításhoz, bankhoz és forráshoz kötött, blokkolómentes lektorálás szükséges. (a lektorált bemenet eltér a mostanitól: tanítás)";
  assert.equal(resumeKindOf({ ...base, error: evidence, visit: visit("gate", evidence) }), "review");
  const legacy = "A 7.4 végkapuhoz az aktuális tanításhoz, bankhoz és forráshoz kötött, blokkolómentes lektorálás szükséges. (a lektorált bemenet eltér a mostanitól)";
  assert.equal(resumeKindOf({ ...base, error: legacy, visit: visit("gate", legacy) }), "review", "a régi (komponens nélküli) üzenet is (mért: job 416ad01d)");
  const open = "A 7.4 végkapuhoz az aktuális tanításhoz, bankhoz és forráshoz kötött, blokkolómentes lektorálás szükséges. (nyitott blokkoló: x)";
  assert.equal(resumeKindOf({ ...base, error: open, visit: visit("gate", open) }), null);
  assert.equal(resumeKindOf({ ...base, error: evidence, visit: visit("lektor", evidence) }), null, "csak kapu-látogatásból");
});
