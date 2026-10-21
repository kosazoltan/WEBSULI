import test from "node:test";
import assert from "node:assert/strict";
import { calibrateRubric, coverGroup, COVER_GROUP_MAX } from "../shared/answer-key-calibrate";
import { evaluateOpenAnswer } from "../shared/lesson-experience-score";
import { openTaskSchema, type OpenTask } from "../shared/lesson-experience";
import type { AnswerKeyCases } from "../shared/answer-key-tests";

/* Spec 2026-10-21-ciklus1-csoportos-szigoritas (S3d): a „fordított” próba (ellentétes ige) csoportos szigorítása — mért: 207 javítókör. */

const task = (over: Partial<OpenTask> = {}): OpenTask => ({
  id: "t1", sectionIndex: 0, coversConceptIds: ["c1"], q: "Mit tesz az igekötő az igével?",
  required: [["igekötő"], ["ige", "igének", "igét"]], bonus: [], minWords: 4, needsSentence: false,
  sample: "Az igekötő új jelentést ad az igének.", mode: "written", ...over,
}) as OpenTask;
// A helyesek eltérő igével fogalmaznak (ad / módosít / megváltoztat) → nincs EGY minden helyesben meglévő szó; a hibás ellentétes igét használ.
const cases: AnswerKeyCases = {
  correct: ["Az igekötő módosítja az ige jelentését.", "Az igekötő megváltoztatja az ige jelentését, például a megy és a kimegy.", "Az igekötő új jelentést ad az igének, irányt is jelölhet."],
  wrong: [{ kind: "forditott", text: "Az igekötő elveszi az ige jelentését." }, { kind: "temaidegen", text: "A macska az asztalon alszik." }],
};

test("S3d: eltérő szinonimák — a szó nem különböztet meg, a csoport igen; a minta és a helyesek teljes pontosak maradnak", () => {
  const t = task();
  assert.equal(evaluateOpenAnswer(cases.wrong[0].text, t).state, "ok", "előfeltétel: a fordított próba teljes pontot kap");
  const { task: out, changes } = calibrateRubric(t, cases);
  assert.ok(changes.some((c) => c.startsWith("szigorítás (csoport):")), JSON.stringify(changes));
  assert.notEqual(evaluateOpenAnswer(cases.wrong[0].text, out).state, "ok");
  assert.equal(evaluateOpenAnswer(out.sample, out).state, "ok");
  for (const a of cases.correct) assert.equal(evaluateOpenAnswer(a, out).state, "ok", a);
  assert.ok(out.tightened?.length, "gépi szigorításként jelölve (S4 lazíthat)");
  assert.ok(openTaskSchema.safeParse(out).success);
});

test("S3d: a csoport tagjai a hibásban nincsenek, minden helyesben van tag; korlát és kizárás", () => {
  const g = coverGroup(task().sample, cases.correct, cases.wrong[0].text)!;
  assert.ok(g && g.length <= COVER_GROUP_MAX, JSON.stringify(g));
  // Ha a hibás tartalmazza a megkülönböztető szavakat, nincs csoport.
  assert.equal(coverGroup("Az igekötő ad.", ["Az igekötő ad."], "Az igekötő ad, nem vesz el."), null);
  // Review #353: a lefedés MEGVALÓSÍTHATÓ, csak 6-nál több tag kellene (a minta szava egy helyesben is szerepel) → a korlát miatt null.
  const fruits = ["alma", "körte", "szilva", "barack", "meggy", "cseresznye", "dinnye", "eper"];
  const many = fruits.map((f) => `Válasz ${f}.`);
  assert.equal(coverGroup("Válasz alma.", many, "Válasz banán."), null, "8 különböző tag kellene");
  // Ugyanez 6 helyessel (a minta egyikkel közös) → van csoport, legfeljebb 6 taggal.
  const six = coverGroup("Válasz alma.", many.slice(0, 6), "Válasz banán.");
  assert.ok(six && six.length === 6, JSON.stringify(six));
  // Review #353: 160 karakternél hosszabb szó nem lehet tag (a séma korlátja).
  const long = "a".repeat(170);
  assert.equal(coverGroup(`Válasz ${long}.`, [`Válasz ${long}.`], "Válasz banán."), null);
});

test("analitikai archívum: a bejegyzés alakja (feladat, minta, rubrika, esetek; a szövegek vágva)", async () => {
  const { answerKeyArchiveEntry } = await import("../server/studio/single-run/engine");
  const { finalizeAnswerKeyArchive } = await import("../server/studio/single-run/engine");
  const e = answerKeyArchiveEntry({ ...task(), requiredOrder: [["a"], ["b"]] }, { correct: ["x".repeat(400)], wrong: [{ kind: "forditott", text: "y" }] }, 2);
  assert.equal(e.id, "t1");
  assert.equal(e.sectionIndex, 2);
  assert.deepEqual(e.required, task().required);
  assert.deepEqual(e.requiredOrder, [["a"], ["b"]]);
  assert.equal(e.correct[0].length, 400, "review #353: teljes szöveg (visszajátszható)");
  assert.equal(e.minWords, 4);
  assert.equal(e.needsSentence, false);
  assert.deepEqual(e.bonus, []);
  assert.deepEqual(e.wrong, [{ kind: "forditott", text: "y" }]);
  assert.equal("requiredPhrases" in e, false);
  // Review #353: véglegesítés — csak a végleges leckében bent maradt feladat, a végleges azonosítóval; azonos modell-azonosító két fejezetben.
  const other = { ...e, sectionIndex: 0, q: "Másik kérdés?" };
  const dropped = { ...e, sectionIndex: 1, q: "Eldobott csomag kérdése?" };
  const fin = finalizeAnswerKeyArchive([e, other, dropped], [{ id: "t-hash-a", sectionIndex: 2, q: e.q }, { id: "t-hash-b", sectionIndex: 0, q: "Másik kérdés?" }]);
  assert.deepEqual(fin.map((x) => [x.id, x.modelId]), [["t-hash-a", "t1"], ["t-hash-b", "t1"]]);
});
