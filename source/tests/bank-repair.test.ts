import test from "node:test";
import assert from "node:assert/strict";
import { describeRepairPermissions, repairPermissions } from "../server/studio/bank-repair";
import { applyBankPacketRepair, buildLessonExperience } from "../server/studio/experience-builder";
import { bankPacketContract, experiencePacketSchema } from "../shared/lesson-experience";
import { OPEN_ANSWER_RULES_HU } from "../shared/lesson-experience-score";
import { ROLE_SKILLS, ROLE_TOOLS, TOOL_SKILLS } from "../server/studio/role-skills";
import { SUPPORT_SKILLS } from "../server/studio/support-skills";
import { buildLektorPrompt } from "../server/studio/step-io";
import { standardFusionFixture } from "../shared/fixtures/lesson-fusion";

/* Spec 2026-09-30-utasitasrendszer-rendbetetel (U2c): C9 javítási jogosultság, B4 BANKCSOMAG-SZERZŐDÉS, B1 bank skill, H46, H53. */

test("C9: a hibaüzenetekből tétel- és mezőszintű jogosultság lesz; a csomagszintű hiba külön listára kerül", () => {
  const e = standardFusionFixture().experience!;
  const packet = { methods: e.methods, tasks: e.tasks, quiz: e.quiz };
  const [t0, t1, t2] = e.tasks.map((t) => t.id), q0 = e.quiz[0].id, q1 = e.quiz[1].id;
  const plan = repairPermissions([
    `${t0}: a mintaválasz nem teljes pont. Részben jó. A minta szószáma: 4; minWords: 1.`,
    `tasks.1.coversConceptIds: Bankterven kívüli tétel: ${t1}; sectionIndex=0; coversConceptIds=["x"].`,
    `${q1}: a correctIndex a(z) 5 opciót jelöli, a magyarázata viszont 7 értéket nevez helyesnek.`,
    `tasks: ${t2}: Ismétlődő kérdés (megegyezik: ${t0}); valódi változat szükséges.`,
    `Ismétlődő kérdés egy korábbi csomaggal: ${q0} („Mi a terület?”) — ehhez a tételhez új, más kérdést írj.`,
    "Hiányzó módszer: gate",
    ": A nyílt bank mérete, írásos vagy szóbeli változata hiányos.",
  ], packet);
  assert.deepEqual(plan.packetLevel, ["Hiányzó módszer: gate", ": A nyílt bank mérete, írásos vagy szóbeli változata hiányos."]);
  const byId = Object.fromEntries(plan.allows.map((a) => [a.itemId, a.fields]));
  assert.ok((byId[t0] as string[]).includes("required") && (byId[t0] as string[]).includes("sample") && !(byId[t0] as string[]).includes("coversConceptIds"), "rubrika-hiba: csak rubrikamezők");
  assert.deepEqual(byId[t1], ["coversConceptIds"], "Zod-útvonal: a megnevezett mező");
  assert.deepEqual(byId[q1], ["question", "prompt", "options", "correctIndex", "feedbackPerOption", "answer"]);
  assert.equal(byId[t2], "*", "csomagon belüli ismétlődés: a MÁSODIK tétel, bármely mező");
  assert.equal(t0 in byId && plan.allows.find((a) => a.itemId === t0)!.fields !== "*", true, "az ismétlődés első tétele nem kap jogot az „(megegyezik: …)” hivatkozásból");
  assert.equal(byId[q0], "*");
  assert.equal(plan.allows.length, 5);
  assert.equal(describeRepairPermissions(new Map<string, string[] | "*">([[t0, ["q"]], [q1, "*"]])), `${t0}: q; ${q1}: bármely mező`);
});

test("C9: a javítás csak a jogosult tételt és annak engedélyezett mezőit cserélheti; a változatlan tétel visszaküldése nem hiba", () => {
  const e = standardFusionFixture().experience!;
  const original = { methods: e.methods, tasks: e.tasks, quiz: e.quiz, glossary: [] };
  const [t0, t1] = e.tasks;
  const perms = new Map<string, string[] | "*">([[t0.id, ["sample", "required"]]]);
  const ok = applyBankPacketRepair(original, { tasks: [{ ...t0, sample: `${t0.sample} Bővítve.` }] }, undefined, undefined, perms);
  assert.equal(ok.tasks[0].sample, `${t0.sample} Bővítve.`);
  assert.throws(() => applyBankPacketRepair(original, { tasks: [{ ...t1, q: "Más kérdés?" }] }, undefined, undefined, perms), /jogosultságon kívüli tétel nem módosítható/);
  assert.throws(() => applyBankPacketRepair(original, { tasks: [{ ...t0, q: "Más kérdés?" }] }, undefined, undefined, perms), /csak ezeket a mezőket cserélheti: sample, required \(megváltozott: q\)/);
  assert.doesNotThrow(() => applyBankPacketRepair(original, { tasks: [t1, { ...t0, sample: `${t0.sample} Bővítve.` }] }, undefined, undefined, perms));
  assert.doesNotThrow(() => applyBankPacketRepair(original, { tasks: [{ ...t0, q: "Más kérdés?" }] }, undefined, undefined, new Map([[t0.id, "*" as const]])));
  // jogosultság nélkül (régi hívók, lektori kör) a viselkedés változatlan
  assert.doesNotThrow(() => applyBankPacketRepair(original, { tasks: [{ ...t1, q: "Más kérdés?" }] }));
});

test("javító kör a gyakorlatban: a prompt közli a jogosultságot, az idegen tétel cseréje elutasított kísérlet, a jogosult csere átmegy", async () => {
  const lesson = standardFusionFixture(), e = lesson.experience!;
  const first = { methods: e.methods, tasks: structuredClone(e.tasks), quiz: e.quiz, glossary: [] };
  first.tasks[0].sample = "Az alap és a magasság szorzata.";
  const users: string[] = [];
  const result = await buildLessonExperience(lesson, [], { call: async (_system, user) => {
    users.push(user);
    if (users.length === 1) return first;
    if (users.length === 2) return { tasks: [{ ...e.tasks[1], q: "Idegen átírás, amit senki nem kért?" }] };
    return { tasks: [e.tasks[0]] };
  } });
  assert.equal(users.length, 3);
  assert.match(users[1], /JAVÍTÁSI MÓD/);
  assert.ok(users[1].includes(`JAVÍTÁSI JOGOSULTSÁG (hibakódból; a program kikényszeríti — más tétel vagy más mező változása = elutasított kísérlet): ${first.tasks[0].id}: q, required, bonus, sample`), users[1].slice(users[1].indexOf("JAVÍTÁSI JOGOSULTSÁG"), users[1].indexOf("JAVÍTÁSI JOGOSULTSÁG") + 200));
  assert.match(users[2], /jogosultságon kívüli tétel nem módosítható/);
  assert.match(users[2], /JAVÍTÁSI MÓD/, "a jogosultság megsértése után is a javító mód marad (a csomag megvan)");
  assert.equal(result.tasks.length, e.tasks.length);
  assert.deepEqual(result.tasks.map((t) => t.q), e.tasks.map((t) => t.q), "az idegen átírás nem került be");
});

test("javító kör: a csomagszintű hiba (nincs szóbeli feladat) tételcserével nem javítható → teljes újraírás, nem javító mód", async () => {
  const lesson = standardFusionFixture(), e = lesson.experience!;
  const noOral = { methods: e.methods, tasks: e.tasks.map((t) => ({ ...t, mode: "written" as const })), quiz: e.quiz, glossary: [] };
  const users: string[] = [];
  const result = await buildLessonExperience(lesson, [], { call: async (_system, user) => {
    users.push(user);
    return users.length === 1 ? noOral : { methods: e.methods, tasks: e.tasks, quiz: e.quiz, glossary: [] };
  } });
  assert.equal(users.length, 2);
  assert.doesNotMatch(users[1], /JAVÍTÁSI MÓD/);
  assert.match(users[1], /csomagszintű \(darabszám, hiányzó módszer, hiányzó oral\/written\)/);
  assert.match(users[1], /TELJES csomagot/);
  assert.ok(result.tasks.some((t) => t.mode === "oral"));
});

test("B4: a bank rendszerutasítása a generált BANKCSOMAG-SZERZŐDÉST és a pontozó szabályait hordozza; a prompt pontos darabszámot kér (H46 kimondva)", async () => {
  const lesson = standardFusionFixture(), e = lesson.experience!;
  let system = "", user = "";
  await buildLessonExperience(lesson, [], { call: async (s, u) => { system ||= s; user ||= u; return { methods: e.methods, tasks: e.tasks, quiz: e.quiz, glossary: [] }; } });
  assert.match(system, /BANKCSOMAG-SZERZŐDÉS \(a program méri/);
  assert.ok(system.includes(OPEN_ANSWER_RULES_HU.split("\n")[0]), "A NYÍLT FELADAT PONTOZÓJA a rendszerutasításban");
  assert.match(system, /3\. EBBEN a csomagban legalább egy mode="oral" és egy mode="written"/);
  assert.match(system, /8\. JAVÍTÁSI MÓD: csak a JAVÍTÁSI JOGOSULTSÁG/);
  assert.match(user, /Darabszám \(a BANKCSOMAG-SZERZŐDÉS 1\. pontja\): \d+–20 módszer; PONTOSAN \d+ nyílt feladat \(a program \d+ alatt elutasít\); PONTOSAN \d+ kvíz/);
  assert.match(user, /Ebben a csomagban legalább egy mode="oral" és egy mode="written" feladat/);
  assert.match(user, /typedAnswers:\[\{part,kind,value,unit\?,form\?\}\]/);
  const c = bankPacketContract({ sectionIndex: 3, conceptIds: ["a", "b"], methodKinds: ["gate", "myth"], taskCount: 2, taskTarget: 5, quizCount: 4, quizTarget: 10 });
  assert.match(c, /methods legalább 2 \(kindek: gate, myth\), legfeljebb 20; tasks PONTOSAN 5 \(a program 2 alatt elutasít\); quiz PONTOSAN 10 \(4 alatt elutasít\); glossary: \[\]/);
  assert.match(c, /sectionIndex=3, coversConceptIds csak ebből: \["a","b"\]/);
  assert.match(bankPacketContract({ sectionIndex: 0, conceptIds: ["a"], methodKinds: ["gate"], taskCount: 1, taskTarget: 1, quizCount: 2, quizTarget: 2, language: "en-GB" }), /glossary: legalább 1 elem \(en-GB\)/);
});

test("C9: a csomagon belüli ismétlődés a MÁSODIK tételt nevezi meg, az elsőt hivatkozza", () => {
  const e = standardFusionFixture().experience!;
  const dup = { ...e, quiz: e.quiz.map((q, i) => (i === 1 ? { ...q, question: e.quiz[0].question } : q)) };
  const r = experiencePacketSchema.safeParse(dup);
  assert.equal(r.success, false);
  assert.match(JSON.stringify(r.success ? [] : r.error.issues), new RegExp(`${e.quiz[1].id}: Ismétlődő kérdés \\(megegyezik: ${e.quiz[0].id}\\)`));
});

test("B1/B2/B3: a bank skill a típusos rubrikát, az oral+written csomagonkénti szabályt és a jogosultságot mondja; az ábratervező csak a saját eszközét kapja; az ellenőrök értik a válaszszerződést; H53 kalibráció javítva", () => {
  for (const must of ["typedAnswers", "requiredDistinct", "JAVÍTÁSI JOGOSULTSÁG", 'mode:"oral" és egy mode:"written"', "LEGRÖVIDEBB teljes helyes válasz", "PONTOSAN egy igaz", "BANKCSOMAG-SZERZŐDÉSE"]) assert.ok(ROLE_SKILLS.bank.includes(must), must);
  assert.ok(ROLE_SKILLS.bank.length < 5200, `bank: ${ROLE_SKILLS.bank.length}`);
  assert.deepEqual(ROLE_TOOLS.animator, ["section-visuals"]);
  assert.match(TOOL_SKILLS["bank-packet-autofix"], /typedAnswers és requiredDistinct \(nem találja ki\)/);
  assert.match(SUPPORT_SKILLS["bank-verifier"], /typedAnswers a mérce/);
  assert.match(ROLE_SKILLS.lektor, /köztes állapotot kérő kérdésnél/);
  const lektor = buildLektorPrompt(standardFusionFixture(), { title: "T", subject: "m", classroom: 5, concepts: [] });
  assert.doesNotMatch(lektor, /köztes sor helyes → language/, "a téves „első menet” példa törölve (H53)");
  assert.match(lektor, /KÖZTES műveleti állapotot kér .* HIBÁS → blokkoló/);
});
