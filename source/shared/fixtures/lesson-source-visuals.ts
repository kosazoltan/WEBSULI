import type { Lesson } from "../lesson-schema";
import { SOURCE_TABLE_BLOCK_ROWS } from "../lesson-visual-params";

/**
 * Spec 2026-11-18 (tananyaggyártás minősége, S2a): a forrás-ábrák megjelenítőinek mérőleckéje (`/__lesson-runtime-probe?source-visuals=1`).
 * SZINTETIKUS tartalom (forrásszöveg a nyilvános repóba nem kerül). A `max` változat a séma által megengedett LEGNAGYOBB tartalom
 * (8 oszlop × 20 sor, 100–120 karakteres cella, 8 × 240 karakteres pont, 3 kártya × 8 sor) — a böngészős próba ezen méri a levágást,
 * az átfedést és a vízszintes görgetést. A jelölőnek látszó (szkript / eseménykezelő / hivatkozás) cellák a szövegkénti megjelenítést igazolják.
 */
const covers = { coversConceptIds: ["c1"] };
type LessonBlock = Lesson["sections"][number]["blocks"][number];
const animate = (animKind: "table" | "ruleBox" | "compareCards", params: Record<string, unknown>, caption: string): LessonBlock =>
  ({ kind: "animate", animKind, params, caption, ...covers });
/** Pontosan `length` karakteres, szavakra tagolt töltőszöveg. */
const fill = (seed: string, length: number) => { let s = seed; while (s.length < length) s += ` ${seed}`; return s.slice(0, length - 1).trimEnd().padEnd(length, "x"); };
const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

export const SOURCE_VISUAL_HOSTILE = {
  script: "<script>window.__svPwned = 1</script>",
  handler: "<img src=x onerror=\"window.__svPwned = 1\">",
  link: "<a href=\"javascript:window.__svPwned = 1\">kattints</a>",
} as const;

const typical: Lesson["sections"] = [
  { heading: "Mennyit? Hányat?", probaEnabled: false, blocks: [
    { kind: "explain", depth: "core", readAloud: false, ...covers, text: "A megszámlálható dolgokat darabra kérdezzük, a megszámlálhatatlanokat mennyiségre.\n\nJegyezd meg:\n- az alma megszámlálható\n- a víz megszámlálhatatlan\n- a kérdőszó ettől függ" },
    animate("table", { caption: "Megszámlálható vagy megszámlálhatatlan?", headers: ["megszámlálható", "megszámlálhatatlan"], headerTones: ["a", "b"],
      rows: [...range(10).map((i) => [`alma ${i} (apple)`, `víz ${i} (water)`]), [SOURCE_VISUAL_HOSTILE.script, SOURCE_VISUAL_HOSTILE.handler], [SOURCE_VISUAL_HOSTILE.link, ""]] }, "Megszámlálható vagy megszámlálhatatlan?"),
    animate("table", { headers: ["kérdőszó", "mikor használjuk", "példa", "válasz"], headerTones: ["neutral", "a", "b", "c"],
      rows: [["How many", fill("megszámlálható főnév többes számban, amikor darabszámra vagyunk kíváncsiak", 80), "How many apples are there?", "There are five."],
        ["How much", fill("megszámlálhatatlan főnév, amikor mennyiségre vagy árra vagyunk kíváncsiak", 80), "How much water is there?", "There is a little."],
        ["", "üres sorfejléc is lehet", "—", "—"]] }, "A két kérdőszó használata."),
    animate("ruleBox", { tone: "rule", heading: "A fő szabály", items: range(6).map((i) => `${i}. pont: a megszámlálható főnév elé számot tehetsz.`) }, "Szabály"),
    animate("ruleBox", { tone: "warning", items: ["A money megszámlálhatatlan: How much money?", "A people többes szám: How many people?", "Ne keverd a kettőt!", "Negyedik figyelmeztetés.", "Ötödik figyelmeztetés.", "Hatodik figyelmeztetés."] }, "Gyakori hibák"),
    animate("ruleBox", { tone: "tip", heading: "Így jegyzed meg", items: ["Ha meg tudod számolni az ujjadon, many.", "Ha önteni vagy mérni kell, much.", "Harmadik tipp.", "Negyedik tipp.", "Ötödik tipp.", "Hatodik tipp."] }, "Tipp a tanuláshoz"),
    animate("compareCards", { cards: [
      { title: "How many?", tone: "a", lines: ["megszámlálható", "többes szám", "darabszám"], example: "How many books?" },
      { title: "How much?", tone: "b", lines: ["megszámlálhatatlan", "egyes szám", "mennyiség, ár"], example: "How much milk?" }] }, "A két kérdőszó egymás mellett."),
    animate("compareCards", { cards: [
      { title: "some", lines: ["állító mondat", "kínálás"], example: "I have some tea." },
      { title: "any", lines: ["kérdő mondat", "tagadó mondat"], example: "Do you have any tea?" },
      { title: "no", lines: ["tagadás ige nélkül", SOURCE_VISUAL_HOSTILE.handler] }] }, "Három szó, három szerep."),
  ] },
];

const max: Lesson["sections"] = [
  { heading: "A legnagyobb megengedett tartalom", probaEnabled: false, blocks: [
    { kind: "explain", depth: "core", readAloud: false, ...covers, text: "Ez a fejezet a megjelenítők terheléses próbája." },
    animate("table", { caption: fill("A leghosszabb táblázatcím", 160), headers: range(8).map((c) => fill(`${c}. oszlop fejléce`, 80)), headerTones: ["a", "b", "c", "neutral", "a", "b", "c", "neutral"],
      rows: range(SOURCE_TABLE_BLOCK_ROWS).map((r) => range(8).map((c) => fill(`${r}. sor ${c}. cella`, c % 2 ? 100 : 120))) }, "A legnagyobb táblázat: 8 oszlop, 20 sor."),
    animate("table", { headers: ["Szóköznélkülihosszúfejléc".repeat(3), "b"], rows: [["Megszakíthatatlanulhosszúszó".repeat(4), "rövid"]] }, "Szóköz nélküli hosszú szöveg."),
    animate("ruleBox", { tone: "warning", heading: fill("A leghosszabb szabálycím", 80), items: range(8).map((i) => fill(`${i}. hosszú szabálypont`, 240)) }, fill("Hosszú felirat a doboz alatt", 200)),
    animate("compareCards", { cards: range(3).map((n) => ({ title: fill(`${n}. kártya hosszú címe`, 80), lines: range(8).map((i) => fill(`${n}. kártya ${i}. sora`, 200)), example: fill("Hosszú példa", 160) })) }, "Három teli kártya."),
  ] },
];

export function sourceVisualsFixture(variant: "typical" | "max" = "typical", classroom = 6): Lesson {
  return { title: "Forrás-ábrák próbája", subject: "angol", classroom, mapId: "probe-map", sourceOnly: true, misconceptions: [], sections: variant === "max" ? max : typical };
}
