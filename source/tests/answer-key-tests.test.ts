import test from "node:test";
import assert from "node:assert/strict";
import { answerKeyNotes, answerKeyProblems, sanitizeAnswerKeyCases, type AnswerKeyCases } from "../shared/answer-key-tests";
import { answerKeyCacheKey, writeAnswerKeys } from "../server/studio/answer-key-writer";
import { WorkflowConflict } from "../server/workflows/engine";
import type { OpenTask } from "../shared/lesson-experience";

/* Tételgyár T2 (docs/specs/2026-10-15-tetelgyar-t2-valaszkulcs-tesztek-vegrehajtas.md, E1–E3). */

const task = (over: Partial<OpenTask> = {}): OpenTask => ({
  id: "t1", sectionIndex: 0, coversConceptIds: ["c1"], q: "Miért hullanak le ősszel a fák levelei?",
  required: [["víz", "vizet", "vízhez"], ["tél", "télen", "hideg"]], bonus: [], minWords: 4, needsSentence: false,
  sample: "A fa télen nem kap elég vizet, ezért ledobja a leveleit.", mode: "written", ...over,
}) as OpenTask;

const cases = (over: Partial<AnswerKeyCases> = {}): AnswerKeyCases => ({
  correct: ["Télen kevés vizet kap a fa, ezért elhullajtja a leveleit.", "A hideg miatt a fa nem jut vízhez, így a levelek lehullanak.", "mert telen nincs eleg viz a fanak"],
  wrong: [{ kind: "tevhit", text: "A levelek azért hullanak le, mert elfáradnak." }, { kind: "temaidegen", text: "Tavasszal a fák kirügyeznek." }],
  ...over,
});

test("E0: jó rubrikánál (ékezet nélküli helyes válasz is) nincs probléma", () => {
  assert.deepEqual(answerKeyProblems(task(), cases()), []);
});

test("E1: a helyes parafrázis bukása konkrét, tételhez kötött üzenet (javítókör / kivétel)", () => {
  const narrow = task({ required: [["vizet"], ["télen"]] });
  const problems = answerKeyProblems(narrow, cases());
  assert.ok(problems.length >= 1);
  assert.match(problems[0], /^t1: válaszkulcs-teszt: a helyes válasz „.+” nem kap teljes pontot/);
  assert.match(problems[0], /fel nem ismert csoportjai/);
});

test("valódi rubrikahiány: a „vízhez” alakot a „víz” csoport nem ismeri fel — a teszt ezt elkapja", () => {
  const problems = answerKeyProblems(task({ required: [["víz", "vizet"], ["tél", "télen", "hideg"]] }), cases());
  assert.equal(problems.length, 1);
  assert.match(problems[0], /nem jut vízhez/);
});

test("E2: a túl megengedő rubrika (a hibás válasz is teljes pont) üzenetet ad", () => {
  const loose = task({ required: [["fa", "fák", "fanak"]], minWords: 2, sample: "A fa ledobja a leveleit." });
  const problems = answerKeyProblems(loose, cases({ wrong: [{ kind: "temaidegen", text: "A fák tavasszal kirügyeznek." }, { kind: "tevhit", text: "x y" }] }));
  assert.ok(problems.some((p) => /hibás \(témaidegen\) válasz .* teljes pontot kap — a rubrika túl megengedő/.test(p)), problems.join("\n"));
});

test("üres / kevés eset és számolós feladat → nincs ítélet", () => {
  assert.deepEqual(answerKeyProblems(task(), null), []);
  assert.equal(sanitizeAnswerKeyCases({ correct: ["a", "b"], wrong: [{ kind: "tevhit", text: "c" }, { kind: "tevhit", text: "d" }] }), null);
  assert.equal(sanitizeAnswerKeyCases({ correct: ["a", "b", "c"], wrong: [{ kind: "ismeretlen", text: "c" }, { kind: "tevhit", text: "d" }] }), null);
  const typed = task({ typedAnswers: [{ part: "a", kind: "number", value: "4" }] } as Partial<OpenTask>);
  assert.deepEqual(answerKeyProblems(typed, cases({ correct: ["semmi", "semmi", "semmi"] })), []);
});

test("sanitize: hossz- és darabkorlát", () => {
  const long = "x".repeat(301);
  const c = sanitizeAnswerKeyCases({ correct: ["a", "b", "c", long, "d", "e", "f", "g"], wrong: [{ kind: "tevhit", text: "w" }, { kind: "hianyos", text: "v" }] });
  assert.deepEqual(c?.correct, ["a", "b", "c", "d", "e", "f"]);
});

test("writer: csomagonként egy hívás; a változatlan feladat a gyorsítótárból jön (nincs új hívás)", async () => {
  const cache = new Map<string, AnswerKeyCases>();
  let calls = 0;
  let lastUser = "";
  const call = async (_s: string, user: string) => { calls++; lastUser = user; return { items: [{ id: "t1", ...cases() }, { id: "t2", ...cases() }] }; };
  const tasks = [task(), task({ id: "t2", q: "Mi történik a levéllel ősszel?" })];
  const first = await writeAnswerKeys(tasks, { classroom: 5, concepts: [{ id: "c1", term: "lombhullás", definition: "def" }] }, call, cache);
  assert.equal(first.size, 2);
  assert.equal(calls, 1);
  assert.doesNotMatch(lastUser, /required|vizet"\]/, "a tesztíró a rubrikát nem látja");
  const second = await writeAnswerKeys([task({ id: "uj-id" })], { concepts: [] }, call, cache);
  assert.equal(calls, 1, "a tartalmilag azonos feladat a gyorsítótárból");
  assert.ok(second.get("uj-id"));
  assert.equal(cache.has(answerKeyCacheKey(task())), true);
});

test("E3: a tesztíró hibája nem állítja meg a csomagot; a workflow-lízing hibája viszont továbbmegy", async () => {
  const warnings: string[] = [];
  const out = await writeAnswerKeys([task()], { concepts: [] }, async () => { throw new Error("502"); }, new Map(), (w) => warnings.push(w));
  assert.equal(out.size, 0);
  assert.match(warnings[0], /tesztíró hívása hibázott/);
  await assert.rejects(writeAnswerKeys([task()], { concepts: [] }, async () => { throw new WorkflowConflict("lízing"); }, new Map()), WorkflowConflict);
});

// J1 (docs/specs/2026-10-16-egyfutas-atvilagitas.md, L1): a mért élő futások esetei.
test("J1: a helyes válasz minden szavát tartalmazó (felcserélt viszonyú) hibás próba nem blokkol — tájékoztatás", () => {
  const egypt = task({ id: "s5-t1", q: "Hol fekszik Felső- és Alsó-Egyiptom?", required: [["Felső-Egyiptom"], ["délen", "déli"], ["Alsó-Egyiptom"], ["északon", "északi"]],
    sample: "Felső-Egyiptom délen, Alsó-Egyiptom északon fekszik.", minWords: 3 });
  const c: AnswerKeyCases = {
    correct: ["Felső-Egyiptom délen, Alsó-Egyiptom északon fekszik.", "Délen Felső-Egyiptom, északon Alsó-Egyiptom terül el.", "Alsó-Egyiptom északon van, Felső-Egyiptom délen."],
    wrong: [{ kind: "forditott", text: "Felső-Egyiptom északon, Alsó-Egyiptom délen fekszik." }, { kind: "temaidegen", text: "A piramisokat fáraók építtették." }],
  };
  assert.deepEqual(answerKeyProblems(egypt, c), [], "a pontozó elvben sem különbözteti meg — nem blokkoló");
  const notes = answerKeyNotes(egypt, c);
  assert.equal(notes.length, 1);
  assert.match(notes[0], /fordított irány próba .*nem blokkoló/);
});

test("J1: a valóban túl megengedő rubrika továbbra is blokkol (a hibás próba új tartalmi szót hoz)", () => {
  const loose = task({ required: [["víz", "vizet", "vízhez"]] });
  const problems = answerKeyProblems(loose, cases({ wrong: [{ kind: "tevhit", text: "Ősszel a fák vizet gyűjtenek a gyökerükbe, ezért ledobják a leveleiket." }, { kind: "temaidegen", text: "Tavasszal a fák kirügyeznek." }] }));
  assert.ok(problems.some((p) => /túl megengedő/.test(p)), JSON.stringify(problems));
  assert.deepEqual(answerKeyNotes(loose, cases()), []);
});

// Review #263: a lefedés pontos normalizált token-azonosság — az elütéstűrés nem tranzitív, nem bizonyít megkülönböztethetetlenséget.
test("J1 (review #263): az elütéssel „lefedő” hibás próba (porta / torta) továbbra is blokkol, ha a rubrika teljes pontot ad rá", async () => {
  const { answerTokensCover } = await import("../shared/lesson-experience-score");
  assert.equal(answerTokensCover("A porta.", "A torta."), false);
  assert.equal(answerTokensCover("Felső-Egyiptom északon, Alsó-Egyiptom délen fekszik.", "Felső-Egyiptom délen, Alsó-Egyiptom északon fekszik."), true);
  const t = task({ id: "pt", q: "Mit sütött a nagymama?", required: [["torta", "porta"]], minWords: 2, sample: "A nagymama tortát sütött." });
  const problems = answerKeyProblems(t, { correct: ["A torta.", "Torta volt.", "Egy torta."], wrong: [{ kind: "tevhit", text: "A porta." }, { kind: "temaidegen", text: "Esett az eső." }] });
  assert.ok(problems.some((p) => /túl megengedő/.test(p)), JSON.stringify(problems));
});
