import { LEGACY_LESSON_METHOD_VERSION, LESSON_METHOD_VERSION, METHOD_KINDS, type LessonExperience } from "../lesson-experience";
import { planLessonBank } from "../lesson-bank-plan";
import type { Lesson } from "../lesson-schema";

/** Synthetic, deterministic browser fixture. Never persisted as a manufactured lesson. */
export function fusionFixture(): Lesson {
  const bind = { sectionIndex: 0, coversConceptIds: ["area"] };
  const tasks: LessonExperience["tasks"] = Array.from({ length: 45 }, (_, i) => ({
    ...bind, id: `t${i + 1}`, q: `Mekkora a háromszög területe, ha az alap ${i + 2} cm, a hozzá tartozó magasság 4 cm?`,
    required: [[String((i + 2) * 2)]], bonus: [], minWords: 1, needsSentence: false, sample: `${(i + 2) * 2} cm²`, mode: i % 7 === 0 ? "oral" : "written",
  }));
  const quiz: LessonExperience["quiz"] = Array.from({ length: 75 }, (_, i) => ({
    ...bind, id: `q${i + 1}`, question: `A háromszög alapja ${i + 2} cm, magassága 2 cm. Mekkora a területe?`, options: [`${i + 2} cm²`, `${(i + 2) * 2} cm²`, `${i + 3} cm²`], correctIndex: 0,
    feedbackPerOption: ["Az alap és a magasság szorzatát osztjuk kettővel.", "A szorzatot még kettővel kell osztani.", "Az összeadás helyett szorozz, majd oszd kettővel."],
  }));
  const methods: LessonExperience["methods"] = [...METHOD_KINDS, "gate" as const].map((kind, i) => ({
    ...bind, id: `m${i + 1}`, kind, title: { prediction: "Kétszer olyan magas", gate: "A fél téglalap", myth: "A ferde oldal csapdája", sorting: "Állítsd össze a megoldást", causeEffect: "Mi változik a magassággal?", conflict: "Más alak, ugyanannyi terület", selfCheck: "Mondd el a képletet!", popup: "Egy gyors ellenőrzés", timeline: "A számolás útja", analogy: "Egy téglalap két fele" }[kind],
    prompt: kind === "prediction" ? "Mi történik a háromszög területével, ha változatlan alap mellett megkétszerezzük a magasságát?" : "Hogyan számoljuk ki a háromszög területét az alap és a hozzá tartozó magasság ismeretében?",
    answer: "A háromszög területe az alap és a hozzá tartozó magasság szorzatának fele: T = a · m / 2.",
    ...(["gate", "myth", "popup"].includes(kind) ? { options: ["Az alap és a magasság szorzatának fele", "Az összes oldal összege"], correctIndex: 0 } : {}),
    ...(["sorting", "causeEffect", "timeline"].includes(kind) ? { steps: ["Azonosítom az alapot és a magasságot.", "Összeszorzom az alapot és a magasságot.", "Kettővel osztok és kiírom a cm² egységet."] } : {}),
  }));
  return {
    title: "Háromszögek: területből tudás", subject: "matematika", classroom: 7, mapId: "fusion-probe", sourceOnly: true, misconceptions: [],
    sections: [{ heading: "Az alap és a magasság együtt számít", probaEnabled: false, blocks: [
      { kind: "explain", text: "A háromszög területe az alap és a hozzá tartozó magasság szorzatának fele: T = a · m / 2. A magasság merőleges az alap egyenesére. A területet négyzetes egységben, például cm²-ben adjuk meg. Azonos alapnál a kétszeres magasság kétszeres területet jelent.", depth: "core", readAloud: true, coversConceptIds: ["area"] },
      { kind: "example", problem: "Egy háromszög alapja 6 cm, magassága 4 cm. Mekkora a területe?", steps: ["Összeszorzom: 6 · 4 = 24.", "Kettővel osztom: 24 / 2 = 12."], answer: "12 cm²", coversConceptIds: ["area"] },
      { kind: "animate", animKind: "process", params: { steps: ["Alap × magasság: 6 × 4 = 24 cm²", "A szorzat fele: 24 / 2 = 12 cm²", "A háromszög területe: 12 cm²"] }, caption: "A terület kiszámításának lépései", coversConceptIds: ["area"] },
      { kind: "recap", bullets: ["Az alaphoz tartozó magasságot használd.", "A szorzat felét számold ki.", "A terület egysége cm², nem cm."] },
    ] }],
    experience: { version: LEGACY_LESSON_METHOD_VERSION, theme: "ocean", methods, tasks, quiz, glossary: [] },
  };
}

/** Current small-source contract: real recall/application instead of numeric filler. */
export function compactFusionFixture(): Lesson {
  const lesson = fusionFixture();
  const old = lesson.experience!;
  lesson.experience = {
    ...old, version: LESSON_METHOD_VERSION, bankPlan: planLessonBank(lesson), methods: old.methods.slice(0, 2),
    tasks: [
      { ...old.tasks[0], q: "Mondd el, hogyan számolod ki a háromszög területét!", required: [["alap"], ["magasság"], ["fele"]], needsSentence: true, sample: "A terület az alap és a magasság szorzatának fele.", mode: "oral" },
      { ...old.tasks[1], q: "Mekkora a 6 cm alapú, 4 cm magas háromszög területe?", required: [["12"]], sample: "12 cm²", mode: "written" },
    ],
    quiz: [
      { ...old.quiz[0], intent: "recall", question: "Melyik műveletsor adja a háromszög területét?", options: ["Alap × magasság / 2", "Oldalak összege", "Alap + magasság"], correctIndex: 0 },
      { ...old.quiz[1], intent: "apply", question: "Az alap marad, a magasság a kétszeresére nő. Hogyan változik a terület?", options: ["Nem változik", "A felére csökken", "Négyszeres lesz", "Kétszeres lesz"], correctIndex: 3, feedbackPerOption: ["A szorzatban a magasság is szerepel.", "A magasság nőtt, ezért a terület sem csökken.", "Csak a magasság változott, az alap maradt.", "Az alap és a magasság szorzata, így a fele is kétszeres lesz."] },
    ],
  };
  // Synthetic quantity fixtures for the owner-approved 15/15 minimum; never published.
  for (let i = 2; i < 15; i++) {
    lesson.experience!.tasks.push({ ...old.tasks[i], mode: "written" });
    lesson.experience!.quiz.push({ ...old.quiz[i], intent: "recall" });
  }
  return lesson;
}
