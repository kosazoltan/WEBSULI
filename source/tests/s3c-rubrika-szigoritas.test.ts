import test from "node:test";
import assert from "node:assert/strict";
import { calibrateRubric } from "../shared/answer-key-calibrate";
import { evaluateOpenAnswer } from "../shared/lesson-experience-score";
import { applyBankPacketRepair, buildLessonExperience } from "../server/studio/experience-builder";
import { standardFusionFixture } from "../shared/fixtures/lesson-fusion";
import type { MapConcept } from "../server/studio/coverage";
import { answerKeyProblems, type AnswerKeyCases } from "../shared/answer-key-tests";
import { openTaskSchema, type OpenTask } from "../shared/lesson-experience";
import { TelemetryRecorder } from "../server/studio/single-run/telemetry";
import { telemetryView } from "../shared/run-telemetry";

/* Spec 2026-10-20-eroforras-s3c-rubrika-szigoritas: a teljes pontot kapó hibás válasz gépi kizárása (szigorítás) modellhívás nélkül. */

const task = (over: Partial<OpenTask> = {}): OpenTask => ({
  id: "t1", sectionIndex: 0, coversConceptIds: ["c1"], q: "Mi történik a gáz térfogatával, ha melegítjük?",
  required: [["gáz", "gázok"], ["térfogat", "térfogata"]], bonus: [], minWords: 4, needsSentence: false,
  sample: "Melegítéskor a gáz térfogata nő.", mode: "written", ...over,
}) as OpenTask;

test("irányszó-csere („nő” → „csökken”): kötelező csoport kerül be; a hibás nem teljes pontos, a helyesek és a minta igen", () => {
  const cases: AnswerKeyCases = {
    correct: ["Ha melegítjük, a gáz térfogata nő.", "A melegített gáz térfogata nő, kitágul.", "Melegítéskor a gázok térfogata nő."],
    wrong: [{ kind: "forditott", text: "Melegítéskor a gáz térfogata csökken." }, { kind: "temaidegen", text: "A víz folyékony anyag." }],
  };
  const t = task();
  assert.equal(evaluateOpenAnswer(cases.wrong[0].text, t).state, "ok", "előfeltétel: az eredeti rubrika túl megengedő");
  const { task: out, changes } = calibrateRubric(t, cases);
  assert.ok(changes.some((c) => c.startsWith("szigorítás:")), JSON.stringify(changes));
  assert.notEqual(evaluateOpenAnswer(cases.wrong[0].text, out).state, "ok");
  assert.equal(evaluateOpenAnswer(out.sample, out).state, "ok");
  for (const a of cases.correct) assert.equal(evaluateOpenAnswer(a, out).state, "ok", a);
  assert.equal(t.required.length, 2, "az eredeti feladat érintetlen");
});

test("nincs megkülönböztető szó (a hibás a minta minden szavát tartalmazza, de nem J1) → a rubrika változatlan", () => {
  const cases: AnswerKeyCases = {
    correct: ["Ha melegítjük, a gáz térfogata nő.", "A melegített gáz térfogata nő, kitágul.", "Melegítéskor a gázok térfogata nagyobb lesz, nő."],
    wrong: [{ kind: "forditott", text: "Melegítéskor a gáz térfogata nő, de csak hidegben." }, { kind: "temaidegen", text: "A víz folyékony anyag." }],
  };
  const t = task();
  assert.equal(evaluateOpenAnswer(cases.wrong[0].text, t).state, "ok", "előfeltétel: az eredeti rubrika túl megengedő");
  const out = calibrateRubric(t, cases);
  assert.deepEqual(out.changes, []);
  assert.equal(out.task, t);
});

test("review #338 (P1): a J1-es (megkülönböztethetetlen) hibás eset nem akadályozza a blokkoló hibás eset kizárását", () => {
  const cases: AnswerKeyCases = {
    correct: ["Ha melegítjük, a gáz térfogata nő.", "A melegített gáz térfogata nő, kitágul.", "Melegítéskor a gázok térfogata nő."],
    wrong: [
      { kind: "forditott", text: "Melegítéskor a gáz térfogata csökken." },
      { kind: "tevhit", text: "Melegítéskor a gázok térfogata nő, majd csökken." }, // a 3. helyes válasz minden szavát tartalmazza (J1)
    ],
  };
  const t = task();
  const { task: out, changes } = calibrateRubric(t, cases);
  assert.ok(changes.some((c) => c.startsWith("szigorítás:")), JSON.stringify(changes));
  assert.notEqual(evaluateOpenAnswer(cases.wrong[0].text, out).state, "ok");
  assert.deepEqual(answerKeyProblems(out, cases), [], "a bank ellenőrzése szerint nincs blokkoló hiba");
});

test("review #338 (P2): az aposztrófos angol tagadás („mustn't”) egy szó, és nem lehet megkülönböztető", () => {
  const t = task({ q: "What does the sign say?", required: [["run"], ["corridor"]], minWords: 3, sample: "You mustn't run in the corridor." });
  const cases: AnswerKeyCases = {
    correct: ["You mustn't run in the corridor.", "Pupils mustn't run in the corridor.", "You mustn't run in this corridor."],
    wrong: [{ kind: "tevhit", text: "You cannot run in the corridor." }, { kind: "temaidegen", text: "I like apples." }],
  };
  assert.equal(evaluateOpenAnswer(cases.wrong[0].text, t).state, "ok", "előfeltétel: a más tagadású hibás eset teljes pontot kap");
  const out = calibrateRubric(t, cases);
  assert.ok(!out.changes.some((c) => /mustn/.test(c)), JSON.stringify(out.changes));
  assert.deepEqual(out.changes, []);
});

test("review #338: az ékezet nélkül angol kötőszónak látszó magyar tartalmi szó („ón” → on) megkülönböztető lehet", () => {
  const t = task({ q: "Miből áll a bronz?", required: [["bronz"], ["réz"]], minWords: 3, sample: "A bronz réz és ón ötvözete." });
  const cases: AnswerKeyCases = {
    correct: ["A bronz a réz és az ón ötvözete.", "Bronz: réz és ón keveréke.", "A bronz nevű ötvözetben réz és ón van."],
    wrong: [{ kind: "tevhit", text: "A bronz réz és cink ötvözete." }, { kind: "temaidegen", text: "A víz folyékony anyag." }],
  };
  assert.equal(evaluateOpenAnswer(cases.wrong[0].text, t).state, "ok", "előfeltétel: az eredeti rubrika túl megengedő");
  const { task: out, changes } = calibrateRubric(t, cases);
  assert.ok(changes.some((c) => c.startsWith("szigorítás:") && c.includes("ón")), JSON.stringify(changes));
  assert.notEqual(evaluateOpenAnswer(cases.wrong[0].text, out).state, "ok");
  for (const a of cases.correct) assert.equal(evaluateOpenAnswer(a, out).state, "ok", a);
});

test("a tagadószó nem lehet megkülönböztető: csak tagadásban eltérő hibás válasznál nincs szigorítás", () => {
  const t = task({ sample: "Melegítéskor a gáz térfogata nem marad változatlan." });
  const cases: AnswerKeyCases = {
    correct: ["Melegítéskor a gáz térfogata nem marad változatlan.", "A gáz térfogata melegítéskor nem marad változatlan.", "Melegítéskor a gáz térfogata nem marad változatlan, nő."],
    wrong: [{ kind: "forditott", text: "Melegítéskor a gáz térfogata változatlan marad." }, { kind: "temaidegen", text: "A víz folyékony anyag." }],
  };
  const out = calibrateRubric(t, cases);
  assert.ok(!out.changes.some((c) => /"nem"/.test(c)), JSON.stringify(out.changes));
  assert.deepEqual(out.changes, []);
});

test("bizonyíték nélkül nincs szigorítás: ha nincs 2 teljes pontos helyes válasz, a rubrika változatlan", () => {
  const cases: AnswerKeyCases = {
    correct: ["Ha melegítjük, a gáz térfogata nő.", "x y z w", "a b c d"],
    wrong: [{ kind: "forditott", text: "Melegítéskor a gáz térfogata csökken." }, { kind: "temaidegen", text: "A víz folyékony anyag." }],
  };
  assert.deepEqual(calibrateRubric(task(), cases).changes, []);
});

const lesson = () => { const l = standardFusionFixture(); l.mapId = "m1"; return { ...l, experience: undefined }; };
const concepts = [{ localId: "area", term: "háromszög területe", examWeight: "core" } as MapConcept];
const withExtra = () => {
  const e = structuredClone(standardFusionFixture().experience!);
  e.tasks.push({ ...e.tasks[0], id: "extra-task", q: `${e.tasks[0].q} (tartalék)` });
  return e;
};

test("banképítés: a „fordított irányú” teljes pontos hibás válasz a kalibrációval kiesik — 1 hívás, nincs javítókör, a feladat bent marad", async () => {
  let calls = 0;
  const fixes: string[] = [];
  const reports: Array<{ calibration: string[] }> = [];
  const cases: AnswerKeyCases = {
    correct: ["Az alap és a magasság szorzatának a fele a terület.", "A terület az alap és a magasság szorzatának a fele.", "A háromszög területe az alap és a magasság szorzatának fele."],
    wrong: [{ kind: "forditott", text: "A terület az alap és a magasság összegének a fele." }, { kind: "temaidegen", text: "A kör kerek." }],
  };
  const experience = await buildLessonExperience(lesson(), concepts, {
    call: async () => { calls++; return withExtra(); },
    answerKeys: async (tasks: OpenTask[]) => new Map(tasks.filter((t) => t.q.endsWith("(tartalék)")).map((t) => [t.id, cases] as const)),
    onToolFix: (tool, list) => { if (tool === "answer-key-tests" || tool === "bank-stuck") fixes.push(...list); },
    onAnswerKeyReport: (r) => reports.push(r),
  });
  assert.equal(calls, 1, "nincs javítókör");
  assert.deepEqual(fixes, []);
  const extra = experience.tasks.find((t) => t.q.endsWith("(tartalék)"));
  assert.ok(extra, "a feladat bent marad");
  assert.notEqual(evaluateOpenAnswer(cases.wrong[0].text, extra!).state, "ok");
  assert.ok(reports.some((r) => r.calibration.some((c) => c.startsWith("szigorítás:"))), JSON.stringify(reports));
});

/* Spec 2026-10-20-s4 (S4a): a szigorítás nyoma a feladaton és a futás telemetriájában. */
test("S4a: a szigorított feladat `tightened` mezője a bent maradt kötelező csoportot tartalmazza", () => {
  const cases: AnswerKeyCases = {
    correct: ["Ha melegítjük, a gáz térfogata nő.", "A melegített gáz térfogata nő, kitágul.", "Melegítéskor a gázok térfogata nő."],
    wrong: [{ kind: "forditott", text: "Melegítéskor a gáz térfogata csökken." }, { kind: "temaidegen", text: "A víz folyékony anyag." }],
  };
  const { task: out } = calibrateRubric(task(), cases);
  assert.ok(out.tightened?.length === 1, JSON.stringify(out.tightened));
  assert.equal(out.tightened![0][0], "nő");
  assert.ok(out.required.some((g) => g[0] === "nő"), "a jelölt csoport a kötelezők között van");
  assert.ok(openTaskSchema.safeParse(out).success, "a jelölt feladat érvényes");
});

test("S4a: szigorítás nélkül nincs `tightened` mező (a régi viselkedés)", () => {
  const cases: AnswerKeyCases = {
    correct: ["Ha melegítjük, a gáz térfogata nő.", "A melegített gáz térfogata nő, kitágul.", "Melegítéskor a gázok térfogata nő."],
    wrong: [{ kind: "temaidegen", text: "A víz folyékony anyag." }, { kind: "tevhit", text: "A gáz nem változik." }],
  };
  assert.equal("tightened" in calibrateRubric(task(), cases).task, false);
});

test("S4a: a futás nézete mutatja a szigorított feladatok számát; a régi telemetria (mező nélkül) nem mutat sort", () => {
  const rec = new TelemetryRecorder(null, () => 0);
  rec.gates.rubricTightened = 3;
  assert.ok(telemetryView(rec.snapshot("claude-opus-5-5")).gates.includes("Gépi rubrika-szigorítás (feladat): 3"));
  const old = rec.snapshot("claude-opus-5-5");
  delete (old.gates as { rubricTightened?: number }).rubricTightened;
  assert.ok(!telemetryView(old).gates.some((g) => g.startsWith("Gépi rubrika-szigorítás")));
});

test("review #339 (P2): újrakalibráláskor a korábbi és az új szigorításjelölés egyesül", () => {
  const cases: AnswerKeyCases = {
    correct: ["Ha melegítjük, a gáz térfogata nő.", "A melegített gáz térfogata nő, kitágul.", "Melegítéskor a gázok térfogata nő."],
    wrong: [{ kind: "forditott", text: "Melegítéskor a gáz térfogata csökken." }, { kind: "temaidegen", text: "A víz folyékony anyag." }],
  };
  const t = task({ required: [["gáz", "gázok"], ["térfogat", "térfogata"]], tightened: [["gáz", "gázok"]] });
  const { task: out } = calibrateRubric(t, cases);
  assert.deepEqual(out.tightened?.map((g) => g[0]), ["gáz", "nő"], JSON.stringify(out.tightened));
});

test("review #339 (P1): a lektori bankjavítás a `tightened` jelölést az előző tételből örökli; a törölt csoport jelölése kimarad", () => {
  const e = standardFusionFixture().experience!;
  const t0 = { ...e.tasks[0], tightened: [[...e.tasks[0].required[0]]] };
  const original = { methods: e.methods, tasks: [t0, ...e.tasks.slice(1)], quiz: e.quiz, glossary: [] };
  const { tightened: _omit, ...withoutTag } = t0;
  const kept = applyBankPacketRepair(original, { tasks: [{ ...withoutTag, sample: `${t0.sample} Bővítve.` }] }, new Set([t0.id]));
  assert.deepEqual(kept.tasks[0].tightened, t0.tightened, "a modell válaszából hiányzó szerveres mező öröklődik");
  const dropped = applyBankPacketRepair(original, { tasks: [{ ...withoutTag, required: t0.required.slice(1).length ? t0.required.slice(1) : [["más"]] }] }, new Set([t0.id]));
  assert.equal(dropped.tasks[0].tightened, undefined, "a csoport kikerült a kötelezők közül: nincs jelölés");
});

test("review #339: a jelölés sémája nem szűkebb a kalibrátornál — 5 szigorított csoport érvényes", () => {
  const five = [["egy"], ["kettő"], ["három"], ["négy"], ["öt"]];
  const t = task({ required: [...task().required, ...five], tightened: five });
  assert.ok(openTaskSchema.safeParse(t).success);
});
