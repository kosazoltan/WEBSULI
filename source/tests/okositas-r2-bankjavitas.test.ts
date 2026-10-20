import { teachingHtml } from "./helpers/teaching-html";
import { test } from "node:test";
import assert from "node:assert/strict";
import { standardFusionFixture } from "../shared/fixtures/lesson-fusion";
import { readRawHtmlLessonData, writeHtmlLessonData } from "../shared/lesson-html-data";
import { alignHtmlLessonBank } from "../server/improve/align-html-bank";

/* Spec 2026-10-20-okositas-r2-bankjavitas — mért: f2c2f102 (csomaghatár, szóbeli/írásos, mintaválasz) a záró kapun bukott. */

type Raw = { experience: { bankPlan: { units: Array<{ sectionIndex: number; conceptIds: string[] }> }; tasks: Array<Record<string, unknown>>; quiz: Array<Record<string, unknown>> } };

function htmlWith(mutate: (data: Raw) => void): string {
  const data = { classroom: 7, classroomEvidence: "A háromszög alaphoz tartozó magassága és területképlete.", subject: "matematika", experience: standardFusionFixture().experience };
  mutate(data as unknown as Raw);
  const html = `<!DOCTYPE html><html><body>${["teaching", "methods", "tasks", "quiz"].map(t => `<button data-lesson-tab="${t}">${t}</button><section data-lesson-panel="${t}">${t === "teaching" ? teachingHtml : ""}</section>`).join("")}<script type="application/json" id="websuli-lesson-data">{}</script></body></html>`;
  return writeHtmlLessonData(html, data);
}
const read = (html: string) => readRawHtmlLessonData(html) as Raw;

// Dokumentált specváltozás (review #332): a kvízkérdést NEM szűkítjük (a kérdés több fogalmat kérdezhet — a hamis címke a tanulói
// kiértékelést torzítaná); a kapu jelenti, és a hibalistás újrapróba javítja.
test("csomaghatár: a két csomag fogalmát fedő FELADAT az első fogalom csomagjára szűkül, a kvízkérdés változatlan marad", () => {
  const html = htmlWith((d) => {
    d.experience.bankPlan.units = [{ sectionIndex: 0, conceptIds: ["area"] }, { sectionIndex: 0, conceptIds: ["height"] }];
    d.experience.tasks[0].coversConceptIds = ["area", "height"];
    d.experience.quiz[0].coversConceptIds = ["area", "height"];
  });
  const result = alignHtmlLessonBank(html);
  const t0 = read(html).experience.tasks[0].id, q0 = read(html).experience.quiz[0].id;
  assert.ok(result.narrowed.includes(String(t0)) && !result.narrowed.includes(String(q0)));
  const after = read(result.html).experience;
  assert.deepEqual(after.tasks[0].coversConceptIds, ["area"]);
  assert.deepEqual(after.quiz[0].coversConceptIds, ["area", "height"]);
});

test("szóbeli/írásos egyensúly: a csupa írásos csomag utolsó feladata szóbeli lesz", () => {
  const html = htmlWith((d) => { for (const t of d.experience.tasks) t.mode = "written"; });
  const result = alignHtmlLessonBank(html);
  const tasks = read(result.html).experience.tasks;
  assert.deepEqual(result.modeFlipped, [String(tasks[tasks.length - 1].id)]);
  assert.equal(tasks[tasks.length - 1].mode, "oral");
  assert.equal(tasks.filter((t) => t.mode === "oral").length, 1);
});

test("padló-próbás elhagyás: a mintájára sem teljes pontos feladat kikerül, ha a bank a padló fölött marad", () => {
  const html = htmlWith((d) => { d.experience.tasks[2] = { ...d.experience.tasks[2], sample: "nem tudom", required: [["terület"]], minWords: 1, needsSentence: false }; });
  const id = String(read(html).experience.tasks[2].id);
  const before = read(html).experience.tasks.length;
  const result = alignHtmlLessonBank(html);
  assert.deepEqual(result.dropped, [id]);
  assert.equal(read(result.html).experience.tasks.length, before - 1);
});

test("padló-próbás elhagyás: ha a kivétel a minimum alá vinne, a feladat marad (a kapu jelenti)", () => {
  const html = htmlWith((d) => {
    d.experience.tasks = d.experience.tasks.slice(0, 45);
    d.experience.tasks[2] = { ...d.experience.tasks[2], sample: "nem tudom", required: [["terület"]], minWords: 1, needsSentence: false };
  });
  const result = alignHtmlLessonBank(html);
  assert.deepEqual(result.dropped, []);
  assert.equal(read(result.html).experience.tasks.length, 45);
});

test("hibátlan bank: bájtra azonos HTML, üres listák", () => {
  const html = htmlWith(() => {});
  assert.deepEqual(alignHtmlLessonBank(html), { html, aligned: [], narrowed: [], modeFlipped: [], dropped: [] });
});

// Review #332: a módváltás a teljes pontos mintájú feladatot választja, így a hibás mintájú még elhagyható.
test("módváltás + elhagyás együtt: a csupa írásos csomagban a hibás mintájú utolsó feladat kikerül, egy MÁSIK lesz szóbeli", () => {
  const html = htmlWith((d) => {
    for (const t of d.experience.tasks) t.mode = "written";
    const last = d.experience.tasks.length - 1;
    d.experience.tasks[last] = { ...d.experience.tasks[last], sample: "nem tudom", required: [["terület"]], minWords: 1, needsSentence: false };
  });
  const badId = String(read(html).experience.tasks.at(-1)!.id);
  // A globális öt szóbeli minimum miatt a bank így is a kapun bukna — a teszt a csomagszintű döntést nézi.
  const result = alignHtmlLessonBank(html);
  assert.equal(result.modeFlipped.length, 1);
  assert.notEqual(result.modeFlipped[0], badId, "nem a hibás mintájú feladat lett szóbeli");
  assert.ok(result.dropped.includes(badId), "a hibás mintájú feladat kikerült");
});

// Review #332: 45 feladat / 74 kvíz — a meglévő (összevont) minimumhiba nem fedheti el az újat: nincs elhagyás.
test("45 feladat és 74 kvíz mellett a hibás mintájú feladat sem kerül ki (a feladatminimum nem sérülhet)", () => {
  const html = htmlWith((d) => {
    d.experience.tasks = d.experience.tasks.slice(0, 45);
    d.experience.quiz = d.experience.quiz.slice(0, 74);
    d.experience.tasks[2] = { ...d.experience.tasks[2], sample: "nem tudom", required: [["terület"]], minWords: 1, needsSentence: false };
  });
  const result = alignHtmlLessonBank(html);
  assert.deepEqual(result.dropped, []);
  assert.equal(read(result.html).experience.tasks.length, 45);
});

// Review #332: szóbeliből írásosra váltás nem viheti a szóbeli feladatokat 5 alá.
test("csupa szóbeli csomag: ha a váltás a globális öt szóbeli minimum alá vinne, nincs váltás", () => {
  const html = htmlWith((d) => {
    d.experience.tasks = d.experience.tasks.slice(0, 5);
    for (const t of d.experience.tasks) t.mode = "oral";
  });
  assert.deepEqual(alignHtmlLessonBank(html).modeFlipped, []);
});
