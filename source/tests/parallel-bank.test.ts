import test from "node:test";
import assert from "node:assert/strict";
import { bankProgressText, SINGLE_RUN_BANK_CONCURRENCY, singleRunBankConcurrency } from "../server/studio/single-run/engine";
import { buildLessonExperience } from "../server/studio/experience-builder";
import { lessonSchema } from "../shared/lesson-schema";
import { standardFusionFixture } from "../shared/fixtures/lesson-fusion";

/* docs/specs/2026-10-16-parhuzamos-bank.md: a gyakorlóbank egységei párhuzamosan; a haladásjelzés a készülő csomagokat megnevezi. */

/*
 * Vezérelt sorrend falióra helyett (docs/specs/2026-11-19-idozitesfuggo-tesztek.md, kanban #206): a hívások kézzel feloldott
 * ígéretre várnak, így a befejezési sorrend a gép terhelésétől független. A banképítő az egy körbe tartozó egységek hívásait
 * ugyanabban a szinkron lépésben indítja (a `deps.call` előtt nincs várakozás), ezért egy eseményhurok-kör (`setImmediate`)
 * után a várt hívás vagy már elindult, vagy (hibás, soros építésnél) nem is fog: ekkor a kapu tartalékként felold, és a teszt
 * az állításán bukik — nem akad el, és nem falióra dönt.
 */
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>((r) => { resolve = r; }); return { promise, resolve }; };
const nextLoopTurn = () => new Promise<void>((r) => setImmediate(r));
/** A kapu feloldásáig vár, de legfeljebb egy eseményhurok-körig (a tartalék csak hibás viselkedésnél old fel). */
const gateOrNextTurn = (gate: Promise<void>) => Promise.race([gate, nextLoopTurn()]);
/** Bőséges, véges számú eseményhurok-kör (a késleltetve továbbdobott hiba is ennyi alatt jelentkezne; falióra nélkül). */
const SETTLE_TURNS = 50;
const loopTurns = async (n: number) => { for (let i = 0; i < n; i++) await nextLoopTurn(); };
/** A kapu feloldásáig vár, de legfeljebb SETTLE_TURNS körig (elakadásvédelem: utána az állítás dönt). */
const gateOrTurns = (gate: Promise<unknown>) => Promise.race([gate, loopTurns(SETTLE_TURNS)]);

test("a párhuzamosság kapcsolója: alap 3, 1–5 között felülírható, érvénytelen érték → alap", () => {
  assert.equal(SINGLE_RUN_BANK_CONCURRENCY, 3);
  assert.equal(singleRunBankConcurrency({}), 3);
  assert.equal(singleRunBankConcurrency({ STUDIO_BANK_CONCURRENCY: "1" }), 1, "1 = a korábbi soros viselkedés");
  assert.equal(singleRunBankConcurrency({ STUDIO_BANK_CONCURRENCY: "5" }), 5);
  for (const bad of ["0", "6", "2.5", "-1", "sok", ""]) assert.equal(singleRunBankConcurrency({ STUDIO_BANK_CONCURRENCY: bad }), 3, bad);
});

test("haladásszöveg: egy vagy több készülő csomag, ismétlődő fejezet nélkül", () => {
  assert.equal(bankProgressText("Gyakorlóbank", { done: 0, total: 5, building: [0, 1, 2] }), "Gyakorlóbank: 0/5 csomag kész — a 1., 2., 3. fejezet csomagjai készülnek…");
  assert.equal(bankProgressText("Gyakorlóbank", { done: 3, total: 5, building: [3, 3] }), "Gyakorlóbank: 3/5 csomag kész — a 4. fejezet csomagja készül…");
  assert.equal(bankProgressText("Gyakorlóbank", { done: 2, total: 5, current: 2 }), "Gyakorlóbank: 2/5 csomag kész — a 3. fejezet csomagja készül…", "visszafelé kompatibilis");
  assert.equal(bankProgressText("Gyakorlóbank", { done: 5, total: 5 }), "Gyakorlóbank: 5/5 csomag kész…");
});

test("a banképítő haladása a párhuzamosan készülő egységeket adja (building), a kész darab a csomag után nő", async () => {
  const base = standardFusionFixture(), e = base.experience!;
  const lesson = lessonSchema.parse({ ...base, experience: undefined, sections: [base.sections[0], { ...base.sections[0], heading: "Második fejezet ugyanarról" }] });
  const packetFor = (sectionIndex: number) => ({
    methods: e.methods.map((m) => ({ ...m, sectionIndex, title: `${m.title} ${sectionIndex}`, prompt: `${m.prompt} ${sectionIndex}` })),
    tasks: e.tasks.map((t) => ({ ...t, sectionIndex, q: `${t.q} (${sectionIndex}. fejezet)` })),
    quiz: e.quiz.map((q) => ({ ...q, sectionIndex, question: `${q.question} (${sectionIndex}. fejezet)` })),
    glossary: [],
  });
  let inFlight = 0, maxInFlight = 0, started = 0;
  const bothStarted = deferred();
  const progress: Array<{ done: number; total: number; building?: number[] }> = [];
  await buildLessonExperience(lesson, [], { concurrency: 3, onProgress: (p) => progress.push(p), call: async (_s, user) => {
    inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
    if (++started === 2) bothStarted.resolve();
    await gateOrNextTurn(bothStarted.promise); // egyik hívás sem végez, amíg a másik egység hívása el nem indult
    inFlight--;
    return packetFor(Number(/sectionIndex=(\d+)/.exec(user)![1]));
  } });
  assert.equal(maxInFlight, 2, "a két egység egyszerre épült");
  assert.deepEqual(progress[0], { done: 0, total: 2, current: 0, building: [0, 1] });
  assert.deepEqual(progress.at(-1), { done: 2, total: 2 });
});

// Review #265
const twoSectionLesson = () => {
  const base = standardFusionFixture();
  return { e: base.experience!, lesson: lessonSchema.parse({ ...base, experience: undefined, sections: [base.sections[0], { ...base.sections[0], heading: "Második fejezet ugyanarról" }] }) };
};

test("review #265: a haladás a valóban futó egységeket követi — eltérő befejezési sorrendnél és ütköző csomag soros újraépítésénél is", async () => {
  const { e, lesson } = twoSectionLesson();
  const calls: number[] = [];
  const progress: Array<{ done: number; total: number; current?: number; building?: number[] }> = [];
  // Az első kör befejezési sorrendje vezérelt: a 2. egység (index 1) végez előbb, az 1. egység (index 0) csak azután, hogy a
  // haladásjelzés a 2. egység elkészültét (done: 1) már jelentette.
  const firstRound = [deferred(), deferred()];
  await buildLessonExperience(lesson, [], { concurrency: 3, onProgress: (p) => { progress.push(p); if (p.done === 1) firstRound[0].resolve(); }, call: async (_s, user) => {
    const sectionIndex = Number(/sectionIndex=(\d+)/.exec(user)![1]);
    calls.push(sectionIndex);
    const rebuild = calls.filter((s) => s === sectionIndex).length > 1;
    if (!rebuild) {
      if (calls.length === 2) firstRound[1].resolve(); // mindkét egység első hívása elindult → a 2. egység végez
      await gateOrNextTurn(firstRound[sectionIndex].promise);
    }
    const suffix = rebuild ? " (második változat)" : "";
    // Első körben ugyanazok a kérdések → ütközés → a 2. egység sorosan újraépül.
    return { methods: e.methods.map((m) => ({ ...m, sectionIndex, title: m.title + suffix, prompt: m.prompt + suffix })), tasks: e.tasks.map((t) => ({ ...t, sectionIndex, q: t.q + suffix })),
      quiz: e.quiz.map((q) => ({ ...q, sectionIndex, question: q.question + suffix })), glossary: [] };
  } });
  assert.deepEqual(progress[0], { done: 0, total: 2, current: 0, building: [0, 1] });
  assert.deepEqual(progress[1], { done: 1, total: 2, current: 0, building: [0] }, "az elsőként végző egység kikerül a készülők közül");
  assert.ok(progress.some((p) => p.done === 1 && p.building?.length === 1 && p.building[0] === 1), "az ütköző csomag soros újraépítése is jelzés: " + JSON.stringify(progress));
  assert.deepEqual(progress.at(-1), { done: 2, total: 2 });
});

test("review #265: az egyik egység hibája után is megvárja a többit és a checkpoint-mentésüket (a kifizetett csomag nem vész el)", async () => {
  const { e, lesson } = twoSectionLesson();
  const saved: number[] = [];
  let doneAtReject = -1;
  let outerSettled = false;
  // Vak ellenőr L2: a sikeres modellválasz ÉS a mentés befejezése külön kapura vár; a kapuk között bőséges (de véges, falióra
  // nélküli) eseményhurok-kör telik el, így egy késleltetve (néhány körrel később) továbbdobott korai hiba is a kapuk alatt
  // jelentkezne — és bukna. Elakadásvédelem: minden várakozás legfeljebb SETTLE_TURNS kör.
  const firstFailed = deferred(), releaseCall = deferred(), saveEntered = deferred(), releaseSave = deferred();
  const outer = buildLessonExperience(lesson, [], { concurrency: 3,
    save: async (cp) => { saveEntered.resolve(); await releaseSave.promise; saved.push(Object.keys(cp.parts).length); },
    call: async (_s, user) => {
      const sectionIndex = Number(/sectionIndex=(\d+)/.exec(user)![1]);
      if (sectionIndex === 0) { firstFailed.resolve(); throw new Error("szolgáltatói hiba (nem javítható)"); }
      await releaseCall.promise; // a sikeres csomag csak a hiba végigterjedése UTÁN végez
      return { methods: e.methods.map((m) => ({ ...m, sectionIndex })), tasks: e.tasks.map((t) => ({ ...t, sectionIndex })), quiz: e.quiz.map((q) => ({ ...q, sectionIndex })), glossary: [] };
    } }).catch((error) => { outerSettled = true; doneAtReject = saved.length; throw error; });
  outer.catch(() => undefined); // a kimenetelt lent az assert.rejects méri; addig ne legyen kezeletlen elutasítás

  await gateOrTurns(firstFailed.promise);
  await loopTurns(SETTLE_TURNS);
  assert.equal(outerSettled, false, "a 0. egység hibája nem megy tovább, amíg a másik egység még fut");
  releaseCall.resolve();
  let saveStarted = false;
  void saveEntered.promise.then(() => { saveStarted = true; });
  await gateOrTurns(saveEntered.promise);
  assert.ok(saveStarted, "a sikeres csomag checkpoint-mentése elindult");
  await loopTurns(SETTLE_TURNS);
  assert.equal(outerSettled, false, "a hiba nem megy tovább, amíg a sikeres csomag mentése tart");
  releaseSave.resolve();
  await gateOrTurns(outer.then(() => undefined, () => undefined));
  assert.equal(outerSettled, true, "a mentés után a hiba továbbmegy");
  await assert.rejects(outer, /szolgáltatói hiba/);
  assert.equal(doneAtReject, 1, "a hiba csak a késleltetett, sikeres csomag mentése UTÁN megy tovább");
});
