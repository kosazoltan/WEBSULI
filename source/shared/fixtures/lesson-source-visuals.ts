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
const animate = (animKind: "table" | "ruleBox" | "compareCards" | "decisionTree" | "pictureCards", params: Record<string, unknown>, caption: string): LessonBlock =>
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
    { kind: "explain", depth: "core", readAloud: false, ...covers, text: "A megszámlálható dolgokat darabra kérdezzük, a megszámlálhatatlanokat mennyiségre.\n\nJegyezd meg:\n• az alma megszámlálható\n• a víz megszámlálhatatlan\n• a kérdőszó ettől függ" },
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

/**
 * `broken` (független review B1): a lecke sémáján átmenő, de kirajzolhatatlan („gyártó-tipp” alakú) táblázat és szabálydoboz egy
 * érvényes doboz mellett — a lejátszó a hibás blokkot teljes egészében kihagyja (fejléc üres törzzsel nem jelenhet meg).
 */
const broken: Lesson["sections"] = [
  { heading: "Hibás paraméterű blokkok", probaEnabled: false, blocks: [
    { kind: "explain", depth: "core", readAloud: false, ...covers, text: "A hibás ábrablokk nem jelenik meg." },
    animate("table", { title: "Kitalált alak", columns: ["a", "b"], rows: [{ a: "1", b: "2" }] }, "Kitalált alakú táblázat."),
    animate("ruleBox", { title: "Tónus nélkül", text: "Egyetlen szöveg." }, "Kitalált alakú doboz."),
    animate("ruleBox", { tone: "tip", items: ["Ez az egyetlen érvényes doboz."] }, "Érvényes doboz."),
  ] },
];

/**
 * `tree` (S2b-1, docs/specs/2026-11-22-tgm-s2b1-dontesi-fa-kepes-kartya.md): Igen / Nem fa (a HM-minta alakja), kétszintű háromágú fa
 * (a PT-minta döntési ábrájának alakja) és 8 képes kártya — szintetikus tartalommal, egyszerű, felirattal ellátott SVG-rajzokkal.
 */
const card = (label: string, shape: string, example?: string) => ({ label, example,
  svg: `<svg viewBox="0 0 120 90" xmlns="http://www.w3.org/2000/svg">${shape}<text x="60" y="84" text-anchor="middle" font-size="12">${label}</text></svg>` });
const tree: Lesson["sections"] = [
  { heading: "Döntési fák és képes kártyák", probaEnabled: false, blocks: [
    { kind: "explain", depth: "core", readAloud: false, ...covers, text: "Döntsd el lépésről lépésre, melyik kérdőszó illik." },
    animate("decisionTree", { root: { text: "Meg tudod számolni?", branches: [
      { label: "Igen", node: { text: "How many …?" } }, { label: "Nem", node: { text: "How much …?" } }] } }, "Melyik kérdőszó kell?"),
    animate("decisionTree", { root: { text: "Mikor történik?", branches: [
      { label: "napszak", node: { text: "in", branches: [{ label: "reggel", node: { text: "in the morning" } }, { label: "délután", node: { text: "in the afternoon" } }] } },
      { label: "nap", node: { text: "on", branches: [{ label: "hétköznap", node: { text: "on Monday" } }, { label: "dátum", node: { text: "on 5 May" } }] } },
      { label: "pontos idő", node: { text: "at", branches: [{ label: "óra", node: { text: "at 7 o'clock" } }, { label: "ünnep", node: { text: "at Christmas" } }] } }] } }, "Az időhatározó elöljárószavak."),
    animate("pictureCards", { cards: [
      card("apple", '<circle cx="60" cy="40" r="26" fill="#d94841"/><rect x="57" y="8" width="6" height="12" fill="#6b4f2a"/>', "How many apples?"),
      card("milk", '<rect x="42" y="14" width="36" height="54" rx="4" fill="#e9eef5" stroke="#6b7a90"/>', "How much milk?"),
      card("egg", '<ellipse cx="60" cy="42" rx="20" ry="27" fill="#f3e2c3" stroke="#a3875a"/>'),
      card("bread", '<rect x="28" y="26" width="64" height="36" rx="14" fill="#c98b3f"/>'),
      card("water", '<path d="M60 10 C40 40 40 66 60 66 C80 66 80 40 60 10Z" fill="#4a90d9"/>'),
      card("banana", '<path d="M30 30 Q60 80 92 30 Q60 62 30 30Z" fill="#f2c94c"/>'),
      card("rice", '<ellipse cx="60" cy="50" rx="34" ry="14" fill="#f5f1e6" stroke="#9c927c"/>'),
      card("cheese", '<polygon points="26,62 94,62 94,30" fill="#f4c542" stroke="#b08a1e"/>'),
    ] }, "Megszámlálható és megszámlálhatatlan szavak képekkel."),
    { kind: "recap", bullets: ["Megszámlálhatónál many, megszámlálhatatlannál much."] },
  ] },
];

export function sourceVisualsFixture(variant: "typical" | "max" | "broken" | "tree" = "typical", classroom = 6): Lesson {
  return { title: "Forrás-ábrák próbája", subject: "angol", classroom, mapId: "probe-map", sourceOnly: true, misconceptions: [], sections: variant === "max" ? max : variant === "broken" ? broken : variant === "tree" ? tree : typical };
}
