/**
 * A forrás-vizuális megjelenítők PARAMÉTER-SZERZŐDÉSE (docs/specs/2026-11-18-tananyag-gyartas-minoseg.md, S2 / SK1; független review
 * F5–F6). Egyetlen megosztott hely: a forrás-fedettségi kapu (`server/studio/gates/source-coverage-gate.ts`) EZEKBŐL a típusokból és
 * olvasókból dolgozik, az S2 megjelenítői és paraméter-sémái pedig ehhez igazodnak. Ha a megjelenítő más alakot használna (pl. a
 * döntési fánál `children`-t a `branches[].node` helyett), a kapu a tételt NEM látná megjelentnek — az alak itt változtatandó, egy helyen.
 *
 * A mezők közül csak a MEGJELENŐ szöveget és a kép meglétét hordozók számítanak a hűségbe; a szerződésen kívüli kulcs (pl. egy rejtett
 * `note`) nem megjelenés. Tiszta modul, függőség nélkül.
 */
export const SOURCE_RENDER_KINDS = ["table", "ruleBox", "compareCards", "decisionTree", "pictureCards"] as const;
export type SourceRenderKind = (typeof SOURCE_RENDER_KINDS)[number];
export type VisualTone = "a" | "b" | "c" | "neutral";

/** `animate` / `table`: valódi táblázat; minden sor a fejléc sorrendjében. */
export type TableVisualParams = { caption?: string; headers: string[]; rows: string[][]; headerTones?: VisualTone[] };
/** `animate` / `ruleBox`: keretes szabály- / figyelmeztetés- / tippdoboz. */
export type RuleBoxVisualParams = { tone: "rule" | "warning" | "tip"; heading?: string; items: string[] };
/** `animate` / `compareCards`: 2–3 egymás melletti kártya; a kártya egy oszlop (cím = fejléc, sorok = az oszlop cellái felülről lefelé). */
export type CompareCardsVisualParams = { cards: Array<{ title: string; tone?: VisualTone; lines: string[]; example?: string }> };
/** `animate` / `decisionTree`: elágazó fa; a levél az ág nélküli csomópont. */
export type DecisionTreeVisualNode = { text: string; branches?: Array<{ label: string; node: DecisionTreeVisualNode }> };
export type DecisionTreeVisualParams = { root: DecisionTreeVisualNode };
/** `animate` / `pictureCards`: képes kártyák; a kép a kártya tisztított SVG-je (`svg`) — kép nélkül a kártya nem képes kártya. */
export type PictureCardsVisualParams = { cards: Array<{ label: string; svg: string; caption?: string; example?: string }> };

export type SourceRenderParams = { table: TableVisualParams; ruleBox: RuleBoxVisualParams; compareCards: CompareCardsVisualParams;
  decisionTree: DecisionTreeVisualParams; pictureCards: PictureCardsVisualParams };

const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown): string => (typeof v === "string" ? v : "");
const texts = (v: unknown): string[] => (Array.isArray(v) ? v.map(text) : []);
const optional = (v: unknown) => (typeof v === "string" && v.trim() ? v : undefined);
/** A fa olvasásának felső korlátja (a kapu rosszindulatúan nagy paraméteren sem futhat el). */
const MAX_TREE_NODES = 2000;

/**
 * Engedékeny olvasók: a nyers `params`-ból a szerződés szerinti alak, a szerződésen kívüli kulcsok nélkül. Hibás alakú bemenetre üres
 * szerkezetet adnak (soha nem dobnak) — a séma megítélése az S2 paraméter-sémáinak dolga, itt csak a megjelenő tartalom kiolvasása.
 */
export function readTableParams(params: unknown): TableVisualParams {
  const p = isObject(params) ? params : {};
  return { ...(optional(p.caption) ? { caption: optional(p.caption) } : {}), headers: texts(p.headers), rows: Array.isArray(p.rows) ? p.rows.map(texts) : [] };
}
export function readRuleBoxParams(params: unknown): RuleBoxVisualParams {
  const p = isObject(params) ? params : {};
  const tone = p.tone === "warning" || p.tone === "tip" ? p.tone : "rule";
  return { tone, ...(optional(p.heading) ? { heading: optional(p.heading) } : {}), items: texts(p.items) };
}
export function readCompareCardsParams(params: unknown): CompareCardsVisualParams {
  const cards = isObject(params) && Array.isArray(params.cards) ? params.cards.filter(isObject) : [];
  return { cards: cards.map((c) => ({ title: text(c.title), lines: texts(c.lines), ...(optional(c.example) ? { example: optional(c.example) } : {}) })) };
}
export function readPictureCardsParams(params: unknown): PictureCardsVisualParams {
  const cards = isObject(params) && Array.isArray(params.cards) ? params.cards.filter(isObject) : [];
  return { cards: cards.map((c) => ({ label: text(c.label), svg: text(c.svg), ...(optional(c.caption) ? { caption: optional(c.caption) } : {}), ...(optional(c.example) ? { example: optional(c.example) } : {}) })) };
}
export function readDecisionTreeParams(params: unknown): DecisionTreeVisualParams | null {
  const root = isObject(params) ? params.root : null;
  if (!isObject(root)) return null;
  let budget = MAX_TREE_NODES;
  const read = (node: Record<string, unknown>, depth: number): DecisionTreeVisualNode => {
    const branches = depth < 12 && Array.isArray(node.branches) ? node.branches.filter(isObject).filter((b) => isObject(b.node) && budget-- > 0) : [];
    return { text: text(node.text), ...(branches.length ? { branches: branches.map((b) => ({ label: text(b.label), node: read(b.node as Record<string, unknown>, depth + 1) })) } : {}) };
  };
  return { root: read(root, 0) };
}

/** Az összehasonlító kártyák táblázatként olvasva: a kártya címe a fejléc, a kártya sorai az oszlop cellái. */
export function compareCardsAsTable(params: CompareCardsVisualParams): TableVisualParams {
  const height = Math.max(0, ...params.cards.map((c) => c.lines.length));
  return { headers: params.cards.map((c) => c.title), rows: Array.from({ length: height }, (_, r) => params.cards.map((c) => c.lines[r] ?? "")) };
}

/**
 * Szöveg-normalizálás a forrás és a megjelenítő összevetéséhez (független review F2): Unicode NFC, kisbetű, szóköz-összevonás; a
 * tipográfiai és az egyenes idézőjel, a gondolatjel / kötőjel és a hárompont változatai egységesítve; a mondatvégi írásjel elhagyva.
 * Az ÉKEZET NEM hajtogatódik (magyarul a „kor” és a „kór” más szó).
 */
export function normalizeVisualText(value: string): string {
  const folded = value.normalize("NFC")
    .replace(/[\u00a0\u2000-\u200a\u202f\u205f\u3000\s]+/g, " ")
    .replace(/[\u201c\u201d\u201e\u201f\u00ab\u00bb\u2033]/g, '"')
    .replace(/[\u2018\u2019\u201a\u201b\u2032`\u00b4]/g, "'")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/ ?- ?/g, "-")
    .toLowerCase()
    .trim()
    .replace(/[\s.!?\u2026]+$/u, "")
    .replace(/^["']+|["']+$/g, "")
    .replace(/[\s.!?]+$/u, "");
  // A csak írásjelből álló szöveg (pl. „?”) nem üresedhet ki: akkor a kisbetűs, szóköz-összevont eredeti a mérce.
  return folded || value.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
}
