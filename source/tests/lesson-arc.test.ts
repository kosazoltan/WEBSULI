import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_DRILL_RATIO,
  checkLessonArc,
  type ArcCode,
} from "../shared/lesson-arc";
import type { Block, Lesson, Section } from "../shared/lesson-schema";

/**
 * M-1 — a lecke didaktikai íve, mérhető alakban.
 *
 * A tulajdonos észrevétele (2026-09-07): „először föl kell vezetni, hogy miről
 * tanulunk, utána elmondjuk azt, hogy milyen számolható elemek vannak, és csak utána
 * kezdheted a kőkemény képleteket és visszakérdezéseket."
 *
 * A kódból mérve: a sorrendet MA semmi nem írja elő. A séma tetszőleges blokk-sorrendet
 * enged, a pedagógus-prompt csak felsorolja a hat típust, a fedettségi kapu pedig a
 * fogalmakat számolja, nem a felépítést. Egy csupa `check` blokkból álló szakasz
 * végigmegy a láncon.
 *
 * Ez a modul a NÉGYLAPOS elrendezés sorrendjét fordítja le a Studio blokk-nyelvére:
 * elmélet (`explain`) → figyelemfenntartó réteg (`animate`/`try`) → levezetett feladat
 * (`example`) → visszakérdezés (`check`).
 *
 * Amit NEM mér: hogy a felvezetés érdekes-e. A szerkezetet ki lehet kényszeríteni, a
 * hangot nem — az a prompt és a lektor dolga marad.
 */

const explain = (depth: "core" | "deeper" | "why" = "core"): Block => ({
  kind: "explain",
  text: "A kör kerülete a körvonal hossza.",
  depth,
  readAloud: true,
  coversConceptIds: ["c1"],
});

const example = (): Block => ({
  kind: "example",
  problem: "Mekkora a kerülete a 3 cm sugarú körnek?",
  steps: ["K = 2 · r · π", "K = 2 · 3 · π"],
  answer: "K ≈ 18,85 cm",
  coversConceptIds: ["c1"],
});

const check = (): Block => ({
  kind: "check",
  question: "Melyik képlet adja a kör kerületét?",
  options: ["2 · r · π", "r² · π"],
  correctIndex: 0,
  feedbackPerOption: ["Így van.", "Ez a terület képlete."],
  coversConceptIds: ["c1"],
});

const animate = (): Block => ({
  kind: "animate",
  animKind: "geometry",
  params: { shape: "circle", label: "kör" },
  caption: "A kör körvonala.",
  coversConceptIds: ["c1"],
});

const tryIt = (): Block => ({
  kind: "try",
  tryKind: "fillBlank",
  spec: { text: "A kör kerülete ___ · r · π.", answers: ["2"] },
  coversConceptIds: ["c1"],
});

const recap = (): Block => ({ kind: "recap", bullets: ["K = 2 · r · π"] });

const section = (blocks: Block[], heading = "Szakasz"): Section => ({
  heading,
  blocks,
  probaEnabled: true,
});

const lesson = (sections: Section[]): Lesson => ({
  title: "A kör kerülete",
  subject: "Matematika",
  classroom: 7,
  mapId: "map-1",
  sections,
  misconceptions: [],
  sourceOnly: true,
});

/** Öt kérdés: az M-6 óta ennyi kell ahhoz, hogy a Próba jutalmat is érjen. */
const checks = (n = 5) => Array.from({ length: n }, check);

/** A jó ívű alap-lecke: felvezetés → megmutatás → levezetés → visszakérdezés → zárás. */
const soundLesson = () =>
  lesson([
    section([explain(), animate(), example(), ...checks(), recap()]),
  ]);

const codes = (l: Lesson): ArcCode[] => checkLessonArc(l).findings.map((f) => f.code);

/* ------------------------------- a jó eset ------------------------------- */

test("a négylapos ívet követő lecke átmegy", () => {
  const report = checkLessonArc(soundLesson());

  assert.equal(report.ok, true, `váratlan kifogások: ${JSON.stringify(report.findings)}`);
  assert.deepEqual(report.findings, []);
});

test("a több szakaszos lecke is átmegy, ha minden szakasz felvezet", () => {
  const report = checkLessonArc(
    lesson([
      section([explain(), animate(), example(), ...checks()], "Első"),
      section([explain("deeper"), example(), ...checks(), recap()], "Második"),
    ]),
  );

  assert.equal(report.ok, true, JSON.stringify(report.findings));
});

/* ------------------------- 1. felvezetés a szakasz elején ------------------------- */

test("a szakasz nem kezdődhet kérdéssel", () => {
  const report = checkLessonArc(lesson([section([check(), explain(), example(), recap()])]));

  assert.ok(report.findings.some((f) => f.code === "no_opening_explain"));
  assert.equal(report.findings[0]?.sectionIdx, 0, "a kifogás nevezze meg a szakaszt");
});

test("a szakasz nem kezdődhet levezetett példával sem", () => {
  assert.ok(
    codes(lesson([section([example(), explain(), check(), recap()])])).includes(
      "no_opening_explain",
    ),
  );
});

test("animációval sem lehet kezdeni: a felvezetés SZÖVEG", () => {
  // Egy ábra megmutat valamit, de nem mondja meg, miről fogunk tanulni.
  assert.ok(
    codes(lesson([section([animate(), explain(), example(), check(), recap()])])).includes(
      "no_opening_explain",
    ),
  );
});

/* --------------------------- 2. tanítás a drill előtt --------------------------- */

test("a magyarázatnak meg kell előznie az első kérdést", () => {
  // Itt van explain, csak KÉSŐN: a gyerek előbb kap kérdést, mint tanítást.
  const l = lesson([section([explain(), check(), explain("deeper"), example(), recap()])]);

  assert.ok(codes(l).includes("drill_before_teaching") || codes(l).includes("quiz_without_example"));
});

test("a levezetett példa nem előzheti meg a magyarázatot", () => {
  const l = lesson([section([explain(), example(), check(), recap()])]);

  assert.ok(
    !codes(l).includes("drill_before_teaching"),
    "ez a sorrend helyes: magyarázat, majd példa",
  );
});

/* ---------------------- 3. levezetés a visszakérdezés előtt ---------------------- */

test("visszakérdezés levezetett példa nélkül kifogás", () => {
  // Ez a tulajdonos által jelzett hiba tiszta alakja: felvezet, aztán rögtön kérdez.
  const l = lesson([section([explain(), check(), check(), recap()])]);

  assert.ok(codes(l).includes("quiz_without_example"), JSON.stringify(codes(l)));
});

test("a példának a kérdés ELŐTT kell állnia, nem utána", () => {
  const l = lesson([section([explain(), check(), example(), recap()])]);

  assert.ok(codes(l).includes("quiz_without_example"));
});

test("kérdés nélküli szakasznál nem kérünk példát", () => {
  const l = lesson([
    section([explain(), animate(), example(), check()], "Első"),
    section([explain(), animate(), recap()], "Ráadás"),
  ]);

  assert.ok(!codes(l).includes("quiz_without_example"));
});

/* ------------------------------ 4. csupa drill ------------------------------ */

test("a csupa kérdésből álló szakasz megbukik", () => {
  const l = lesson([section([check(), check(), check(), check()])]);
  const found = codes(l);

  assert.ok(found.includes("no_opening_explain"));
  assert.ok(found.includes("drill_heavy"));
});

test("egy tanítás és két kérdés még belefér", () => {
  // explain + example + check + check = 3 drill / 4 blokk = 0,75 — pont a határon.
  const l = lesson([section([explain(), example(), check(), check(), recap()])]);

  assert.ok(!codes(l).includes("drill_heavy"), JSON.stringify(codes(l)));
});

test("egy tanítás és négy kérdés már túl sok", () => {
  const l = lesson([section([explain(), example(), check(), check(), check(), check()])]);

  assert.ok(codes(l).includes("drill_heavy"));
});

test("a küszöb kimondott érték, nem elrejtett szám", () => {
  assert.ok(MAX_DRILL_RATIO > 0.5 && MAX_DRILL_RATIO < 1, `${MAX_DRILL_RATIO}`);
});

/* -------------------- 5. figyelemfenntartó réteg (a „2. lap") -------------------- */

test("animáció és gyakorlat nélküli lecke kifogást kap", () => {
  const l = lesson([section([explain(), example(), check(), recap()])]);

  assert.ok(codes(l).includes("no_engagement_layer"));
});

test("egyetlen try blokk is elég a réteghez", () => {
  const l = lesson([section([explain(), tryIt(), example(), check(), recap()])]);

  assert.ok(!codes(l).includes("no_engagement_layer"));
});

test("a réteg a lecke egészére számít, nem szakaszonként", () => {
  const l = lesson([
    section([explain(), animate(), example(), check()], "Első"),
    section([explain(), example(), check(), recap()], "Második"),
  ]);

  assert.ok(!codes(l).includes("no_engagement_layer"));
});

/* --------------------------------- 6. zárás --------------------------------- */

test("a lecke összefoglalóval záruljon", () => {
  const l = lesson([section([explain(), animate(), example(), check()])]);

  assert.ok(codes(l).includes("no_recap"));
});

test("a recap a lecke VÉGÉN legyen, ne középen", () => {
  const l = lesson([
    section([explain(), animate(), example(), recap(), check()]),
  ]);

  assert.ok(codes(l).includes("no_recap"));
});

/* ------------------------------- határesetek ------------------------------- */

test("az egyetlen magyarázatból álló szakasz nem kap drill-kifogást", () => {
  const l = lesson([
    section([explain(), animate(), example(), check()], "Első"),
    section([explain(), recap()], "Zárás"),
  ]);

  assert.ok(!codes(l).includes("drill_heavy"));
});

test("minden kifogás megnevezi a szakaszt és emberi mondatot ad", () => {
  const report = checkLessonArc(lesson([section([check(), check()])]));

  assert.ok(report.findings.length > 0);
  for (const f of report.findings) {
    assert.ok(Number.isInteger(f.sectionIdx), `${f.code}: nincs szakasz-index`);
    assert.ok(f.message.length > 20, `${f.code}: „${f.message}" túl szűkszavú`);
    assert.doesNotMatch(f.message, /undefined|NaN/, `${f.code}: hibás behelyettesítés`);
  }
});

test("a lecke-szintű kifogások a -1 szakasz-indexet kapják", () => {
  const report = checkLessonArc(lesson([section([explain(), example(), check()])]));
  const lessonLevel = report.findings.filter(
    (f) => f.code === "no_engagement_layer" || f.code === "no_recap",
  );

  assert.ok(lessonLevel.length >= 1);
  for (const f of lessonLevel) assert.equal(f.sectionIdx, -1);
});

test("a jelentés emberi összefoglalót is ad a kapunak", () => {
  const report = checkLessonArc(lesson([section([check(), check()])]));

  assert.ok(report.reasons.length > 0);
  assert.ok(
    report.reasons.every((r) => r.length > 20),
    JSON.stringify(report.reasons),
  );
});

/* ------------------ M-3: a prompt ugyanazt mondja, mint a kapu ------------------ */

test("az ív-szerződés be van kötve a pedagógus és a szerző promptjába", async () => {
  const { buildAuthorPrompt, buildPedagoguePrompt } = await import("../server/studio/step-io");
  const { LESSON_ARC_CONTRACT } = await import("../shared/lesson-arc");

  const map = {
    id: "m1",
    title: "A kör",
    subject: "Matematika",
    classroom: 7,
    concepts: [
      { id: "u1", localId: "c1", term: "kerület", definition: "A körvonal hossza.", quote: "", examWeight: "core" as const },
    ],
  };

  const ped = buildPedagoguePrompt(map);
  const author = buildAuthorPrompt(
    [{ heading: "A kör kerülete", conceptIds: ["c1"], plannedBlocks: ["explain"], animationSuggestions: [] }],
    map,
    [],
  );

  // Nem részletet keresünk, hanem a TELJES szerződést: ha a kapu szigorodik és a
  // szöveg vele változik, ez a teszt azonnal jelzi, ha a prompt lemaradt.
  assert.ok(ped.includes(LESSON_ARC_CONTRACT), "a pedagógus nem kapja meg az ívet");
  assert.ok(author.includes(LESSON_ARC_CONTRACT), "a szerző nem kapja meg az ívet");
});

test("a szerződés minden ív-szabályt megnevez, amit a kapu mér", async () => {
  const { LESSON_ARC_CONTRACT } = await import("../shared/lesson-arc");

  for (const needle of ["explain", "example", "check", "animate", "try", "recap"]) {
    assert.ok(LESSON_ARC_CONTRACT.includes(needle), `a szerződésből hiányzik: ${needle}`);
  }
  assert.ok(
    LESSON_ARC_CONTRACT.includes(String(Math.round(MAX_DRILL_RATIO * 100))),
    "a drill-küszöb száma nem szerepel a szerződésben",
  );
});

/* ---------- M-6: a Próba legyen elérhető, ne csak elméletben ---------- */

/**
 * Próbafuttatáson mérve (2026-09-07, valós füzetfotókból épített lecke): a
 * szakaszonkénti 2 kérdés mellett a kupon-küszöb (5 helyes válasz) SOSEM
 * teljesülhet — a gyerek hibátlanul végigmegy a leckén, és nem kap játékidőt.
 *
 * Ez az M-4 bevezetésének következménye volt, és a felhasználó felé csendes:
 * nem hibaüzenet, hanem elmaradó jutalom. Ezért a szerződés része lett, hogy a
 * Próbát futtató szakasz hozzon annyi kérdést, amennyi a jutalomhoz kell.
 *
 * A küszöb ugyanabból a forrásból jön, mint a jutalom-számítás
 * (`DEFAULT_REWARD_POLICY`), hogy a kettő ne csússzon szét.
 */

test("M-6 a Próbát futtató szakasz elég kérdést hozzon a jutalomhoz", async () => {
  const { DEFAULT_REWARD_POLICY } = await import("../shared/reward-policy");
  const kevés = lesson([
    section([explain(), animate(), example(), check(), check(), recap()]),
  ]);

  const found = checkLessonArc(kevés).findings.map((f) => f.code);
  assert.ok(found.includes("proba_unreachable"), JSON.stringify(found));

  const elég = lesson([
    section([
      explain(),
      explain("deeper"),
      animate(),
      example(),
      ...Array.from({ length: DEFAULT_REWARD_POLICY.minCorrectForCoupon }, check),
      recap(),
    ]),
  ]);

  assert.ok(!checkLessonArc(elég).findings.some((f) => f.code === "proba_unreachable"));
});

test("M-6 a kérdés nélküli szakasz nem kap Próba-kifogást", () => {
  // Ott nincs Próba: a `SectionProba` nulla kérdésnél nem is renderel.
  const l = lesson([
    section(
      [explain(), animate(), example(), check(), check(), check(), check(), check()],
      "Fő",
    ),
    section([explain(), recap()], "Zárás"),
  ]);

  assert.ok(!checkLessonArc(l).findings.some((f) => f.code === "proba_unreachable"));
});

test("M-6 a kikapcsolt Próbájú szakasznál nem kérünk kérdésszámot", () => {
  const l: Lesson = lesson([
    { ...section([explain(), animate(), example(), check(), recap()]), probaEnabled: false },
  ]);

  assert.ok(!checkLessonArc(l).findings.some((f) => f.code === "proba_unreachable"));
});

test("M-6 a küszöb átadható, hogy a hangolt jutalom-táblát kövesse", () => {
  const l = lesson([section([explain(), animate(), example(), check(), check(), recap()])]);

  const laza = checkLessonArc(l, { minChecksForProba: 2 }).findings.map((f) => f.code);
  assert.ok(!laza.includes("proba_unreachable"), "2-es küszöbnél a 2 kérdés elég");
});
