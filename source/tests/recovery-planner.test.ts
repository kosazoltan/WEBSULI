import test from "node:test";
import assert from "node:assert/strict";
import { failureFingerprint, NOT_RESUMABLE_STRATEGIES, planRecovery, RECOVERY_LADDER, type RecoveryStep } from "../server/studio/recovery-planner";

/* Elakadás-vezérlő V1 (docs/specs/2026-10-15-elakadas-vezerlo.md). */

// A 416ad01d valós (rövidített) kapuhibája, 2026-10-15 09:05.
const real416 = "Hibás banktétel maradt a limiten, és a kivétel után a bank nem felelne meg — nem publikálható: experience.tasks[7]: Mi hamis: a rubrika … ; experience.tasks[26]: … ; experience.quiz[8]: Bank-ellenőr: … ; experience.tasks[24]: … ; experience.tasks[4]: … (kivétel után: : c4: hiányzó recall kvíz.; : Legalább 45 szöveges feladat és 75 kvízkérdés szükséges.; bank: c4: hiányzó recall kvíz.)";

test("ujjlenyomat: a 416 valós hibája — bank-floor, 5 útvonal, padló-hiányok; a sorrend és a szöveg nem számít", () => {
  const fp = failureFingerprint(real416);
  assert.equal(fp.cls, "bank-floor");
  assert.equal(fp.failing, 5);
  assert.equal(fp.key, "bank-floor|quiz[8],tasks[24],tasks[26],tasks[4],tasks[7]|45/75,c4:recall");
  const reordered = "Hibás banktétel maradt a limiten: experience.tasks[4]: más szöveg; experience.quiz[8]: x; experience.tasks[7]; experience.tasks[26]; experience.tasks[24]; Legalább 45 szöveges feladat és 75 kvízkérdés; c4: hiányzó recall kvíz.";
  assert.equal(failureFingerprint(reordered).key, fp.key);
});

test("osztályok: szolgáltató, bizonyíték, csomag, egyéb", () => {
  assert.equal(failureFingerprint('A(z) "animator" lépés modellhívása hibára futott: [OpenAI] 500').cls, "provider");
  assert.equal(failureFingerprint("A 7.4 végkapuhoz … (a lektorált bemenet eltér a mostanitól: tanítás)").cls, "evidence");
  assert.equal(failureFingerprint("A 1. fejezet bankcsomagja a javító kör után sem megfelelő: t-4: minta").cls, "bank-packet");
  assert.equal(failureFingerprint("A fúziós módszer kapuja elutasította a leckét: x").cls, "other");
});

const step = (strategy: RecoveryStep["strategy"], error: string): RecoveryStep => { const fp = failureFingerprint(error); return { strategy, fingerprint: fp.key, failing: fp.failing, at: 0 }; };

test("lépcső: üres történet → első fok; minden fok egyszer; a végén tulajdonosi döntés indoklással", () => {
  const history: RecoveryStep[] = [];
  const seen: string[] = [];
  for (let i = 0; i < 10; i++) {
    const plan = planRecovery({ error: real416, history });
    seen.push(plan.strategy);
    if (plan.strategy === "ask-owner") { assert.match(plan.reason, /tulajdonosi döntés szükséges — a megmaradt hiba: .*tasks\[7\]/); break; }
    history.push(step(plan.strategy, real416));
  }
  assert.deepEqual(seen, [...RECOVERY_LADDER["bank-floor"], "ask-owner"]);
});

test("szolgáltatói hiba: kétszer újrapróba, utána teljes újragyártás, utána tulajdonosi döntés", () => {
  const err = 'A(z) "lektor" lépés modellhívása hibára futott: Request timed out';
  const history: RecoveryStep[] = [];
  const seen: string[] = [];
  for (let i = 0; i < 6; i++) { const p = planRecovery({ error: err, history }); seen.push(p.strategy); if (p.strategy === "ask-owner") break; history.push(step(p.strategy, err)); }
  assert.deepEqual(seen, ["retry-provider", "retry-provider", "remanufacture", "ask-owner"]);
});

test("haladás: ha az utolsó lépés hatott (kevesebb hibás tétel), az egyszer megismételhető; a teljes újragyártás soha", () => {
  const history = [step("gate", real416)];
  const better = "Hibás banktétel maradt a limiten: experience.tasks[7]: x; experience.quiz[8]: y (kivétel után: c4: hiányzó recall kvíz.)";
  assert.equal(planRecovery({ error: better, history }).strategy, "gate", "a kapu hatott (5 → 2): még egyszer");
  history.push(step("gate", better));
  const stillBetter = "Hibás banktétel maradt a limiten: experience.tasks[7]: x";
  assert.equal(planRecovery({ error: stillBetter, history }).strategy, "rebuild-targeted", "a kapu kétszer futott: tovább a lépcsőn");
  const re = [step("remanufacture", 'A(z) "author" lépés modellhívása hibára futott: x')];
  assert.notEqual(planRecovery({ error: 'A(z) "author" lépés modellhívása hibára futott: y', history: re }).strategy, "remanufacture");
});

test("véges: bármely osztályban legfeljebb a lépcső hossza + 1 lépés után tulajdonosi döntés", () => {
  for (const [cls, ladder] of Object.entries(RECOVERY_LADDER)) {
    const err = { provider: "x modellhívása hibára futott", evidence: "a lektorált bemenet eltér a mostanitól", "bank-floor": real416, "bank-packet": "A 2. fejezet bankcsomagja a javító kör után sem megfelelő: x", other: "ismeretlen hiba" }[cls]!;
    const history: RecoveryStep[] = [];
    let n = 0;
    while (planRecovery({ error: err, history }).strategy !== "ask-owner") { history.push(step(planRecovery({ error: err, history }).strategy, err)); n++; assert.ok(n <= ladder.length, `${cls}: véges`); }
  }
});

test("review #233: a kötőjeles fogalomazonosító nem csonkul, két különböző hiány nem olvad össze", () => {
  const fp = failureFingerprint("Hibás banktétel maradt a limiten: x (kivétel után: kor-kerulete: hiányzó recall kvíz.; haromszog-kerulete: hiányzó recall kvíz.)");
  assert.match(fp.key, /haromszog-kerulete:recall,kor-kerulete:recall/);
});

test("review #234: a szolgáltatói hibánál a megállt lépés az ujjlenyomat része — az animátor újrapróbái nem fogyasztják el a lektoréit", () => {
  const anim = 'A(z) "animator" lépés modellhívása hibára futott: [OpenAI] 500';
  const lektor = 'A(z) "lektor" lépés modellhívása hibára futott: Request timed out';
  assert.notEqual(failureFingerprint(anim).key, failureFingerprint(lektor).key);
  const history = [step("retry-provider", anim)];
  assert.equal(planRecovery({ error: lektor, history }).strategy, "retry-provider");
});

test("review #234: új hibára (más tételek) az olcsó kapu-fok újra elérhető; osztályonként legfeljebb kétszer (véges)", () => {
  const e1 = "Hibás banktétel maradt a limiten: experience.tasks[1]: x";
  const e2 = "Hibás banktétel maradt a limiten: experience.tasks[2]: x";
  const e3 = "Hibás banktétel maradt a limiten: experience.tasks[3]: x";
  assert.equal(planRecovery({ error: e2, history: [step("gate", e1)] }).strategy, "gate", "új hiba: a kapu még egyszer");
  assert.equal(planRecovery({ error: e3, history: [step("gate", e1), step("gate", e2)] }).strategy, "rebuild-targeted", "a kapu osztályonként kétszer futott");
});

test("V4: a szerzői javítás és az újragyártás is végrehajtható fok; csak a tulajdonosi döntés nem", () => {
  assert.deepEqual(NOT_RESUMABLE_STRATEGIES, ["ask-owner"]);
});
