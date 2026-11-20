import { sourceVisualSchema, type SkippedSourceVisual, type SourceVisual } from "../../shared/source-visuals";

/**
 * SZINTETIKUS, modell nélküli fixtúra a forrás-fedettségi kapuhoz (docs/specs/2026-11-18-tananyag-gyartas-minoseg.md, 3.2 és SK1).
 *
 * Mit hordoz és mit NEM (független review F9):
 *  - a leltár MÉRETE a tényfeltárás mintaforrásáé: 38 számolt tétel + egy színkód. Az ÖSSZETÉTEL szintetikus: a végrehajtási
 *    utasítás hét csoportja (9 táblázat, 1 döntési fa, 8 képes kártya, 5 szabálydoboz, 4 képes feladat, 2 páros doboz, 6
 *    adminisztratív / kulcs-tétel) 35 tételt ad, a 38-as összeghez 3 lépéssor került — a valódi tételes leltárat az S10/0 hozza,
 *    és az váltja ki ezt a fixtúrát. A szöveg kitalált (a nyilvános repóba forrásszöveg, tétellista, azonosító nem kerül).
 *  - KÉT KÜLÖN SZÁM a mai éles leckéről, nem keverendő:
 *      „6 / 38” = EMBERI TARTALMI megítélés a tényfeltárásban (6 tétel teljesen, 23 részben, 9 sehogy jelent meg);
 *      „0 / 38” = a KAPU SZERKEZETI mércéje ugyanarra a leckealakra: a mai leckében egyetlen blokk sem hivatkozik forrástételre
 *      (`sourceVisualId`), és nincs táblázat-, szabálydoboz-, döntésifa-, képeskártya-megjelenítő. A teszt alapvonala ez a 0 / 38.
 */
export const HM_BASELINE = { counted: 38, humanFull: 6, humanPartial: 23, humanAbsent: 9, gateShownToday: 0 } as const;

const COMMON = { sourceFile: "minta.pdf", page: 1 };
const make = (item: Record<string, unknown>): SourceVisual => sourceVisualSchema.parse({ ...COMMON, verified: "visual-only", ...item });
const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

const table = (n: number) => make({ id: `t${n}`, kind: "table", role: `A ${n}. összevető táblázat.`, conceptIds: ["mennyiseg"], title: `${n}. táblázat`,
  data: { headers: [`megszámlálható ${n}`, `megszámlálhatatlan ${n}`], rows: range(4).map((r) => [`darab ${n}-${r}`, `anyag ${n}-${r}`]) } });
const tree = () => make({ id: "d1", kind: "decisionTree", role: "Melyik kérdőszó kell?", conceptIds: ["mennyiseg"],
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
  data: { description: `Két egymás melletti doboz (${n}).`, parts: range(2).map((i) => ({ label: `doboz ${n}-${i}`, meaning: `jelentés ${n}-${i}` })) } });
const steps = (n: number) => make({ id: `s${n}`, kind: "process", role: `A ${n}. lépéssor.`, conceptIds: ["mennyiseg"],
  data: { steps: range(3).map((i) => `lépés ${n}-${i}`) } });
const adminBox = (n: number) => make({ id: `a${n}`, kind: "ruleBox", role: "Iskolai adminisztráció.", conceptIds: [],
  data: { tone: "tip", items: [`fejléc-adat ${n}-a`, `fejléc-adat ${n}-b`] } });
const answerKey = (n: number) => make({ id: `a${n}`, kind: "exercise", role: "Megoldókulcs.", conceptIds: [],
  data: { instruction: `Megoldások (${n}).`, items: [], answerKey: [`megoldás ${n}-1`, `megoldás ${n}-2`] } });
const colorCode = () => make({ id: "szin", kind: "colorCode", role: "Végigvitt színkód.", conceptIds: [],
  data: { entries: [{ color: "zöld", tone: "a", meaning: "megszámlálható" }, { color: "narancs", tone: "b", meaning: "megszámlálhatatlan" }] } });

/** A minta leltára: 38 számolt tétel + 1 színkód. Hívásonként FRISS példány (a teszt mutációi nem szivárognak át — C-73). */
export function hmInventory(): SourceVisual[] {
  return [...range(9).map(table), tree(), ...range(8).map(card), ...range(5).map(rule), ...range(4).map(exercise), ...range(2).map(pair),
    ...range(3).map(adminBox), ...[4, 5, 6].map(answerKey), ...range(3).map(steps), colorCode()];
}
/** A 6 adminisztratív / kulcs-tétel érvényes okkal kihagyva. */
export const HM_ADMIN_SKIPS: SkippedSourceVisual[] = [
  ...[1, 2, 3].map((n) => ({ id: `a${n}`, reason: "admin_meta" })), ...[4, 5, 6].map((n) => ({ id: `a${n}`, reason: "answer_key" }))];

type Block = Record<string, unknown>;
export type HmLesson = { sections: Array<{ heading: string; blocks: Block[] }> };
const covers = { coversConceptIds: ["mennyiseg"] };
const SVG = '<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>';

/**
 * A tétel HŰ megjelenítése a megjelenítők paraméter-szerződése szerint (`shared/source-visual-render.ts`). A képes feladat két
 * blokk: a szöveges feladat és a képei (képes kártyaként) — a kapu a hivatkozó blokkok unióján mér.
 */
export function faithfulBlocks(source: SourceVisual): Block[] {
  const v = structuredClone(source);
  const ref = { ...covers, sourceVisualId: v.id };
  switch (v.kind) {
    case "table": return [{ kind: "animate", animKind: "table", params: { caption: v.title, headers: v.data.headers, rows: v.data.rows }, caption: v.title ?? "Táblázat", ...ref }];
    case "process": return [{ kind: "animate", animKind: "process", params: { steps: v.data.steps }, caption: "Lépések", ...ref }];
    case "decisionTree": return [{ kind: "animate", animKind: "decisionTree", params: { root: v.data.root }, caption: "Döntési fa", ...ref }];
    case "ruleBox": return [{ kind: "animate", animKind: "ruleBox", params: { tone: v.data.tone, heading: v.data.heading, items: v.data.items }, caption: "Szabály", ...ref }];
    case "pictureCard": return [{ kind: "animate", animKind: "pictureCards", params: { cards: v.data.cards.map((c) => ({ label: c.label, example: c.example, svg: SVG })) }, caption: "Szókártyák", ...ref }];
    case "diagram": return [{ kind: "animate", animKind: "compareCards", params: { cards: v.data.parts.map((p) => ({ title: p.label, tone: "a", lines: [p.meaning] })) }, caption: "Páros doboz", ...ref }];
    case "exercise": return [
      v.data.answerKey?.length
        ? { kind: "example", problem: v.data.instruction, steps: v.data.answerKey, answer: v.data.answerKey.join("; "), ...ref }
        : { kind: "try", tryKind: "fillBlank", spec: { prompt: v.data.instruction, items: v.data.items }, ...ref },
      ...(v.data.pictures?.length ? [{ kind: "animate", animKind: "pictureCards", params: { cards: v.data.pictures.map((label) => ({ label, svg: SVG })) }, caption: "A feladat képei", ...ref }] : []),
    ];
    default: return [];
  }
}
/** A tétel első (fő) megjelenítő blokkja. */
export const faithfulBlock = (source: SourceVisual): Block => faithfulBlocks(source)[0];

/** Minden számolt tétel hűen megjelenik. `without`: a megnevezett tételek blokkjai nélkül. */
export function hmLessonFull(without: ReadonlyArray<string> = []): HmLesson {
  const blocks = hmInventory().filter((v) => v.kind !== "colorCode" && !without.includes(v.id)).flatMap(faithfulBlocks);
  return { sections: [{ heading: "Mennyiségi kérdőszavak", blocks: [{ kind: "explain", text: "Bevezető.", depth: "core", ...covers }, ...blocks] }] };
}

/**
 * A MAI éles lecke ALAKJA (a tényfeltárás 3.2 táblája szerint): a táblázatok szövege folyó magyarázatban él tovább, a döntési fa
 * elágazás nélküli lépéssor, képes kártya nincs, a szabálydobozok szövege bekezdés; forrástételre egyetlen blokk sem hivatkozik, és
 * csak a mai sémában létező blokkfajták szerepelnek. A forrás szavai tehát részben OTT VANNAK — a kapu szerkezeti mércéjén mégis 0 / 38.
 */
export function hmLessonToday(): HmLesson {
  const inventory = hmInventory();
  const proseOf = (v: SourceVisual) => (v.kind === "table" ? [...v.data.headers, ...v.data.rows.flat()].join(", ") : v.kind === "ruleBox" ? v.data.items.join(" ") : "");
  const prose = inventory.filter((v) => v.kind === "table" || (v.kind === "ruleBox" && v.conceptIds.length > 0)).map((v) => ({ kind: "explain", text: `Folyó szöveg: ${proseOf(v)}.`, depth: "core", ...covers }));
  const linearTree = { kind: "animate", animKind: "process", params: { steps: ["Megszámlálható a főnév?", "Többes számban áll?", "kérdőszó: darabra", "kérdőszó: mennyiségre"] }, caption: "Döntés lépései", ...covers };
  const drawnPairs = { kind: "animate", animKind: "illustration", params: { svg: '<svg viewBox="0 0 100 40"><text x="5" y="20">darab 1-1</text><text x="55" y="20">anyag 1-1</text></svg>' }, caption: "Párok", ...covers };
  const ownExample = { kind: "example", problem: "Nézd meg a 1. képet, és kérdezz!", steps: ["feladattétel 1-1", "feladattétel 1-2"], answer: "kész", ...covers };
  return { sections: [{ heading: "Mennyiségi kérdőszavak", blocks: [...prose, linearTree, drawnPairs, ownExample] }] };
}
