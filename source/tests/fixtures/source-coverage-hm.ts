import { sourceVisualSchema, type SkippedSourceVisual, type SourceVisual } from "../../shared/source-visuals";

/**
 * Rögzített, modell nélküli alapvonal-fixtúra a forrás-fedettségi kapuhoz (docs/specs/2026-11-18-tananyag-gyartas-minoseg.md, 3.2 és SK1).
 *
 * A terv tényfeltárásában mért mintaforrás SZÁMAIT hordozza — 38 leltári tétel, amelyből a mai éles leckében 6 jelent meg teljesen,
 * 23 részben, 9 sehogy —, szintetikus szöveggel (a nyilvános repóba forrásszöveg, tétellista, azonosító nem kerül). Összetétel: 9
 * táblázat, 1 elágazó döntési fa, 8 képes kártya, 5 szabálydoboz, 4 képes feladat, 2 páros doboz (diagram), 6 adminisztratív / kulcs-
 * tétel (3 doboz + 3 megoldókulcsos feladat), 3 lépéssor (a 38-as összeghez), és egy végigvitt színkód, amely nem számolt tétel.
 */
const COMMON = { sourceFile: "minta.pdf", page: 1 };
const make = (item: Record<string, unknown>): SourceVisual => sourceVisualSchema.parse({ ...COMMON, verified: "visual-only", ...item });
const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

const table = (n: number) => make({ id: `t${n}`, kind: "table", role: `A ${n}. összevető táblázat.`, conceptIds: ["mennyiseg"], title: `${n}. táblázat`,
  data: { headers: [`megszámlálható ${n}`, `megszámlálhatatlan ${n}`], rows: range(4).map((r) => [`darab ${n}-${r}`, `anyag ${n}-${r}`]) } });
const tree = make({ id: "d1", kind: "decisionTree", role: "Melyik kérdőszó kell?", conceptIds: ["mennyiseg"],
  data: { root: { text: "Megszámlálható a főnév?", branches: [
    { label: "igen", node: { text: "Többes számban áll?", branches: [{ label: "igen", node: { text: "kérdőszó: darabra" } }, { label: "nem", node: { text: "előbb tedd többes számba" } }] } },
    { label: "nem", node: { text: "kérdőszó: mennyiségre" } }] } } });
const card = (n: number) => make({ id: `p${n}`, kind: "pictureCard", role: `A ${n}. képes szókártya.`, conceptIds: ["szokincs"],
  data: { cards: [{ label: `szókártya ${n}`, depicts: `a ${n}. tárgy rajza`, example: `példamondat a ${n}. kártyához` }] } });
const rule = (n: number) => make({ id: `r${n}`, kind: "ruleBox", role: `A ${n}. kiemelt szabály.`, conceptIds: ["mennyiseg"],
  data: { tone: n === 5 ? "warning" : "rule", heading: `${n}. szabály`, items: [`szabálypont ${n}-a`, `szabálypont ${n}-b`, `szabálypont ${n}-c`] } });
const exercise = (n: number) => make({ id: `e${n}`, kind: "exercise", role: `A ${n}. képes feladat.`, conceptIds: ["mennyiseg"],
  data: { instruction: `Nézd meg a ${n}. képet, és kérdezz!`, items: range(4).map((i) => `feladattétel ${n}-${i}`), pictures: [`a ${n}. feladat képe`] } });
const pair = (n: number) => make({ id: `g${n}`, kind: "diagram", role: `A ${n}. páros doboz.`, conceptIds: ["mennyiseg"],
  data: { description: `Két egymás melletti doboz (${n}).`, parts: range(4).map((i) => ({ label: `rész ${n}-${i}`, meaning: `jelentés ${n}-${i}` })) } });
const steps = (n: number) => make({ id: `s${n}`, kind: "process", role: `A ${n}. lépéssor.`, conceptIds: ["mennyiseg"],
  data: { steps: range(3).map((i) => `lépés ${n}-${i}`) } });
const adminBox = (n: number) => make({ id: `a${n}`, kind: "ruleBox", role: "Iskolai adminisztráció.", conceptIds: [],
  data: { tone: "tip", items: [`fejléc-adat ${n}-a`, `fejléc-adat ${n}-b`] } });
const answerKey = (n: number) => make({ id: `a${n}`, kind: "exercise", role: "Megoldókulcs.", conceptIds: [],
  data: { instruction: `Megoldások (${n}).`, items: [], answerKey: [`megoldás ${n}-1`, `megoldás ${n}-2`] } });
const colorCode = make({ id: "szin", kind: "colorCode", role: "Végigvitt színkód.", conceptIds: [],
  data: { entries: [{ color: "zöld", tone: "a", meaning: "megszámlálható" }, { color: "narancs", tone: "b", meaning: "megszámlálhatatlan" }] } });

/** A minta leltára: 38 számolt tétel + 1 színkód. Hívásonként FRISS példány (a teszt mutációi nem szivárognak át). */
export function hmInventory(): SourceVisual[] {
  return structuredClone([...range(9).map(table), tree, ...range(8).map(card), ...range(5).map(rule), ...range(4).map(exercise), ...range(2).map(pair),
    ...range(3).map(adminBox), ...[4, 5, 6].map(answerKey), ...range(3).map(steps), colorCode]);
}
export const HM_COUNTS = { counted: 38, shownToday: 6, partialToday: 23, absentToday: 9 } as const;
/** A 6 adminisztratív / kulcs-tétel érvényes okkal kihagyva (a (c) eset). */
export const HM_ADMIN_SKIPS: SkippedSourceVisual[] = [
  ...[1, 2, 3].map((n) => ({ id: `a${n}`, reason: "admin_meta" })), ...[4, 5, 6].map((n) => ({ id: `a${n}`, reason: "answer_key" }))];

type Block = Record<string, unknown>;
export type HmLesson = { sections: Array<{ heading: string; blocks: Block[] }> };
const covers = { coversConceptIds: ["mennyiseg"] };

/** A tétel HŰ megjelenítése a neki megfelelő blokkal (az S2 megjelenítőinek alakjában; a kapu szerkezetileg olvas). */
export function faithfulBlock(source: SourceVisual): Block {
  const v = structuredClone(source);
  const ref = { ...covers, sourceVisualId: v.id };
  switch (v.kind) {
    case "table": return { kind: "animate", animKind: "table", params: { caption: v.title, headers: v.data.headers, rows: v.data.rows }, caption: v.title ?? "Táblázat", ...ref };
    case "process": return { kind: "animate", animKind: "process", params: { steps: v.data.steps }, caption: "Lépések", ...ref };
    case "decisionTree": return { kind: "animate", animKind: "decisionTree", params: { root: v.data.root }, caption: "Döntési fa", ...ref };
    case "ruleBox": return { kind: "animate", animKind: "ruleBox", params: { tone: v.data.tone, heading: v.data.heading, items: v.data.items }, caption: "Szabály", ...ref };
    case "pictureCard": return { kind: "animate", animKind: "pictureCards", params: { cards: v.data.cards.map((c) => ({ label: c.label, example: c.example, svg: "<svg/>" })) }, caption: "Szókártyák", ...ref };
    case "diagram": return { kind: "animate", animKind: "illustration", params: { svg: `<svg>${v.data.parts.map((p) => `<text>${p.label}</text><text>${p.meaning}</text>`).join("")}</svg>` }, caption: "Ábra", ...ref };
    case "exercise": return v.data.answerKey?.length
      ? { kind: "example", problem: v.data.instruction, steps: v.data.answerKey, answer: v.data.answerKey.join("; "), ...ref }
      : { kind: "try", tryKind: "fillBlank", spec: { prompt: v.data.instruction, items: v.data.items }, ...ref };
    default: return { kind: "explain", text: "A színkód a tónusokban él tovább.", depth: "core", ...covers };
  }
}

/** (a) Minden számolt tétel hűen megjelenik. `without`: a kihagyott tételek blokkja nélkül (a (c) esethez). */
export function hmLessonFull(without: ReadonlyArray<string> = []): HmLesson {
  const blocks = hmInventory().filter((v) => v.kind !== "colorCode" && !without.includes(v.id)).map(faithfulBlock);
  return { sections: [{ heading: "Mennyiségi kérdőszavak", blocks: [{ kind: "explain", text: "Bevezető.", depth: "core", ...covers }, ...blocks] }] };
}

/**
 * (b) A mai éles lecke alakja: 0 táblázat táblaként, a döntési fa lineáris lépéssorként, 0 képes kártya. A 38 tételből 6 jelenik meg
 * teljesen (3 lépéssor, 2 képes feladat, 1 páros doboz); 23 részben (szövegként feloldva hivatkozás nélkül, rossz fajtával vagy
 * csonkán); 9 sehogy.
 */
export function hmLessonToday(): HmLesson {
  const byId = new Map(hmInventory().map((v) => [v.id, v] as const));
  const get = (id: string) => byId.get(id)!;
  const texts = (id: string) => { const b = faithfulBlock(get(id)); return JSON.stringify(b.params ?? b.spec ?? b); };
  const full = ["s1", "s2", "s3", "e1", "e2", "g1"].map((id) => faithfulBlock(get(id)));
  const tableAsPairs = { kind: "animate", animKind: "illustration", params: { svg: "<svg><text>darab 1-1</text><text>anyag 1-1</text></svg>" }, caption: "Párok", ...covers, sourceVisualId: "t1" };
  const linearTree = { kind: "animate", animKind: "process", params: { steps: ["Megszámlálható a főnév?", "Többes számban áll?", "kérdőszó: darabra", "kérdőszó: mennyiségre"] }, caption: "Döntés lépései", ...covers, sourceVisualId: "d1" };
  const halfExercise = { kind: "check", question: "Nézd meg a 3. képet, és kérdezz!", options: ["feladattétel 3-1", "feladattétel 3-2"], correctIndex: 0, feedbackPerOption: ["jó", "nem"], ...covers, sourceVisualId: "e3" };
  const thinPair = { kind: "animate", animKind: "illustration", params: { svg: "<svg><text>rész 2-1</text></svg>" }, caption: "Páros doboz", ...covers, sourceVisualId: "g2" };
  // Szövegként feloldva, hivatkozás nélkül: a 2–9. táblázat, az 1–3. szabálydoboz és a 8 kártya szava a magyarázatban él tovább.
  const dissolved = [...range(8).map((n) => `t${n + 1}`), "r1", "r2", "r3", ...range(8).map((n) => `p${n}`)].map((id) => ({ kind: "explain", text: `Folyó szöveg: ${texts(id)}`.slice(0, 3900), depth: "core", ...covers }));
  return { sections: [{ heading: "Mennyiségi kérdőszavak", blocks: [...full, tableAsPairs, linearTree, halfExercise, thinPair, ...dissolved] }] };
}
/** A (b) eset bontása azonosítókkal (a teszt ezt rögzített listaként ellenőrzi). */
export const HM_TODAY = {
  shown: ["s1", "s2", "s3", "e1", "e2", "g1"],
  partial: ["t1", "t2", "t3", "t4", "t5", "t6", "t7", "t8", "t9", "d1", "r1", "r2", "r3", "p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8", "e3", "g2"],
  absent: ["r4", "r5", "e4", "a1", "a2", "a3", "a4", "a5", "a6"],
} as const;
