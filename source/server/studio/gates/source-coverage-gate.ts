import { renderedVisualTexts, visualParamProblems } from "../../../shared/lesson-visual-params";
import { SOURCE_VISUAL_SKIP_REASONS, SOURCE_VISUAL_TABLE, type SkippedSourceVisual, type SourceDecisionNode, type SourceVisual, type SourceVisualKind, type SourceVisualSkipReason } from "../../../shared/source-visuals";
import { compareCardsAsTable, normalizeVisualText, readCompareCardsParams, readDecisionTreeParams, readPictureCardsParams, readRuleBoxParams, readTableParams,
  SOURCE_RENDER_KINDS, type DecisionTreeVisualNode, type TableVisualParams } from "../../../shared/source-visual-render";
import { registerGate, type GateLesson, type GateResult } from "./types";
import { sourceImageParamsSchema } from "../../../shared/source-image";

/**
 * SK1 — forrás-fedettségi kapu (docs/specs/2026-11-18-tananyag-gyartas-minoseg.md): a forrás vizuális leltárának tételeire. Ami a
 * forrásban megvan és a leckében nincs, az HIÁNY, nem 100%. Tiszta függvény: modell és adatbázis nélkül, ugyanarra a bemenetre mindig
 * ugyanazt adja.
 *
 * „Megjelent” egy tétel, ha (1) van rá `sourceVisualId`-val hivatkozó blokk, (2) a blokk fajtája a tétel fajtájához illik
 * (`SOURCE_KIND_TARGETS`), és (3) a tartalma hű. A hűség SZERKEZET szerint mér (független review F1–F3, F5–F6), a megjelenítők
 * paraméter-szerződéséből (`shared/source-visual-render.ts`), nem a blokk bármely szövegén:
 *  - táblázat: a forrás cellái a megjelenítő CELLÁIBAN, oszlop szerint igazítva (a sor a legjobban egyező megjelenített sorral áll párba);
 *  - folyamat: a lépések a megjelenítő lépéseiben, SORRENDBEN (leghosszabb közös részsorozat);
 *  - döntési fa: csomópont és ágfelirat útvonal szerint, a levelek száma sem kevesebb a forrásénál;
 *  - szabálydoboz: a cím a címben, a pontok a pontokban;
 *  - képes kártya: kártyánként a felirat ÉS a kép (nem üres `svg`); a képes feladatnál a képek száma is számít;
 *  - feladat és egyéb ábra: a szöveg a megjelenítő blokk megjelenő mezőiben — egész mező, vagy (3+ karakteres, betűt tartalmazó
 *    szövegnél) szóhatáros előfordulás.
 * Több hivatkozó blokk tartalma ÖSSZEADÓDIK (egy forrásrész egyszer számít). Az összevetés normalizált (`normalizeVisualText`:
 * idézőjel, gondolatjel, hárompont, mondatvégi írásjel, szóköz, kis- / nagybetű, NFC); az ékezet NEM hajtogatódik.
 */
export const SOURCE_COVERAGE_THRESHOLDS = {
  /** Ezeknek a fajtáknak a nem kihagyott tételei mind megjelennek (`mustShare`). */
  must: ["table", "process", "decisionTree", "ruleBox"],
  mustShare: 1,
  /** Ezeknek a fajtáknak legalább `shouldShare` hányada megjelenik (a megengedett hiány: n − ⌈shouldShare × n⌉). */
  should: ["pictureCard", "exercise", "diagram"],
  shouldShare: 0.8,
  /** A tétel egységeinek (cella, lépés, csomópont, pont, kártya, kép) legalább ekkora hányada megjelenik a hivatkozó blokkokban. */
  fidelity: 0.8,
  /** Az érvényes kihagyások száma legfeljebb max(`minSkips`, ⌊maxSkipShare × n⌋) (a többlet a lista végéről érvénytelen). */
  maxSkipShare: 0.3,
  /** Spec-pontosítás 2026-11-18 (független review F4): kis leltárnál is legalább ennyi kihagyás megengedett. */
  minSkips: 1,
} as const satisfies { must: readonly SourceVisualKind[]; should: readonly SourceVisualKind[]; mustShare: number; shouldShare: number; fidelity: number; maxSkipShare: number; minSkips: number };

/** A számolt fajták (a `colorCode` nem önálló tétel: a tónusokban él tovább). */
export type CountedSourceKind = Exclude<SourceVisualKind, "colorCode">;

/**
 * Megfeleltetés: forrásfajta → a megjelenítésére alkalmas blokk. `animKinds`: az `animate` blokk elfogadott ábrafajtái (`"any"` =
 * bármelyik); `blockKinds`: más elfogadott blokkfajták. Az S2 előtt a `table` / `compareCards` / `decisionTree` / `ruleBox` /
 * `pictureCards` ábrafajta még nem létezik a lecke sémájában — az ilyen tétel addig „nem jelent meg” (hibát nem dob).
 */
export const SOURCE_KIND_TARGETS: Record<CountedSourceKind, { animKinds: readonly string[] | "any"; blockKinds: readonly string[] }> = {
  table: { animKinds: ["table", "compareCards"], blockKinds: [] },
  process: { animKinds: ["process"], blockKinds: [] },
  decisionTree: { animKinds: ["decisionTree"], blockKinds: [] },
  ruleBox: { animKinds: ["ruleBox"], blockKinds: [] },
  pictureCard: { animKinds: ["pictureCards"], blockKinds: [] },
  diagram: { animKinds: "any", blockKinds: [] },
  exercise: { animKinds: ["pictureCards"], blockKinds: ["example", "try", "check"] },
  // D1H-2: a fénykép a kivágott forrásképpel (`sourceImage`) jelenik meg; nem `must` / `should` fajta (a kivágás elmaradása nem bukás).
  photo: { animKinds: ["sourceImage"], blockKinds: [] },
};

/**
 * Spec-pontosítás 2026-11-18 (független review F4): a kihagyás oka fajtánként megengedett, zárt megfeleltetéssel. Táblázat / folyamat /
 * döntési fa / szabálydoboz nem lehet `decorative`; `answer_key` csak feladatnál; `admin_meta` és `duplicate` bármelyiknél (a
 * `duplicate` csak megnevezett, megjelent párral). Érvénytelen ok = hiány.
 */
export const SOURCE_SKIP_REASONS_BY_KIND: Record<CountedSourceKind, readonly SourceVisualSkipReason[]> = {
  table: ["admin_meta", "duplicate"],
  process: ["admin_meta", "duplicate"],
  decisionTree: ["admin_meta", "duplicate"],
  ruleBox: ["admin_meta", "duplicate"],
  exercise: ["admin_meta", "duplicate", "answer_key"],
  pictureCard: ["admin_meta", "duplicate", "decorative"],
  diagram: ["admin_meta", "duplicate", "decorative"],
  photo: ["admin_meta", "duplicate", "decorative"],
};

export type SourceCoverageItem = { id: string; kind: SourceVisualKind; state: "shown" | "missing" | "skipped"; reason?: string };
export type SourceCoverageResult = GateResult & {
  /** A nem kihagyott, meg nem jelent tételek azonosítói (a megengedett `should`-hiány is). */
  missingIds: string[];
  /** Tételenkénti ítélet a leltár sorrendjében (hiánytábla, parancssori kimenet). */
  items: SourceCoverageItem[];
};

type RawBlock = Record<string, unknown>;
/** Egy tétel mérése a hivatkozó, megfelelő fajtájú blokkok unióján: egységek, ebből megjelent; `blocker`: hűségtől független hiányok. */
type Fit = { total: number; matched: number; blocker?: string };
const N = normalizeVisualText;
const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object";
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const filled = (list: ReadonlyArray<string | undefined>): string[] => list.filter((t): t is string => typeof t === "string" && t.trim().length > 0);
/** A bejárás felső korlátja (a kapu rosszindulatúan nagy blokkon sem futhat el). */
const MAX_NODES = 20_000;

/**
 * Egész mező egyezése normalizálás után. `limit`: az U1 szerint csonkolt forrásszöveg (a korlát hosszán „…”-ra végződik) a
 * megjelenített szöveg ELEJÉVEL egyezik — a csonkolás nem okozhat hamis bukást.
 */
function same(source: string, shown: string, limit?: number): boolean {
  const [a, b] = [N(source), N(shown)];
  if (a === b) return true;
  const clipped = limit !== undefined && source.trim().endsWith("…") && source.trim().length >= limit;
  return clipped && a.length > 0 && b.startsWith(a);
}

const WORD_CHAR = /[\p{L}\p{N}]/u;
/** Szabad szövegű megjelenítőnél: egész mező, vagy 3+ karakteres, betűt tartalmazó szöveg szóhatáros előfordulása egy mezőben. */
function found(source: string, fields: ReadonlyArray<string>): boolean {
  const needle = N(source);
  if (!needle) return false;
  const loose = needle.length >= 3 && /\p{L}/u.test(needle);
  return fields.some((field) => {
    if (field === needle) return true;
    if (!loose) return false;
    for (let at = field.indexOf(needle); at >= 0; at = field.indexOf(needle, at + 1)) {
      const [before, after] = [field[at - 1], field[at + needle.length]];
      if (!(before && WORD_CHAR.test(before)) && !(after && WORD_CHAR.test(after))) return true;
    }
    return false;
  });
}

/** Egy forráslista elemei egy megjelenített készletben; minden megjelenített elem egyszer használható. */
function matchPool(sources: ReadonlyArray<string>, pool: ReadonlyArray<string>, limit?: number): number {
  const free = [...pool];
  let matched = 0;
  for (const source of sources) {
    const at = free.findIndex((shown) => same(source, shown, limit));
    if (at >= 0) { free.splice(at, 1); matched++; }
  }
  return matched;
}

function tableFit(data: { headers: string[]; rows: string[][] }, blocks: RawBlock[]): Fit {
  const tables: TableVisualParams[] = blocks.map((b) => (b.animKind === "compareCards" ? compareCardsAsTable(readCompareCardsParams(b.params)) : readTableParams(b.params)));
  const T = SOURCE_VISUAL_TABLE;
  let total = 0, matched = 0;
  data.headers.forEach((header, c) => {
    if (!header.trim()) return;
    total++;
    if (tables.some((t) => same(header, t.headers[c] ?? "", T.headerChars))) matched++;
  });
  // A sor a legjobban egyező, még szabad megjelenített sorral áll párba; a cellák OSZLOP szerint igazítva számítanak.
  const free = tables.flatMap((t) => t.rows);
  for (const row of data.rows) {
    const cells = row.map((cell, c) => ({ cell, c })).filter(({ cell }) => cell.trim());
    total += cells.length;
    const score = (shown: string[]) => cells.filter(({ cell, c }) => same(cell, shown[c] ?? "", T.cellChars)).length;
    let best = -1, bestScore = 0;
    free.forEach((shown, i) => { const s = score(shown); if (s > bestScore) { best = i; bestScore = s; } });
    if (best >= 0) { free.splice(best, 1); matched += bestScore; }
  }
  return { total, matched };
}

/** A forrás lépései a megjelenített lépésekben, SORRENDBEN: a leghosszabb közös részsorozat hossza. */
function processFit(steps: string[], blocks: RawBlock[]): Fit {
  const shown = blocks.flatMap((b) => strings((b.params as { steps?: unknown } | null | undefined)?.steps));
  const lcs = Array.from({ length: steps.length + 1 }, () => new Array<number>(shown.length + 1).fill(0));
  for (let i = 1; i <= steps.length; i++) for (let j = 1; j <= shown.length; j++) {
    lcs[i][j] = same(steps[i - 1], shown[j - 1]) ? lcs[i - 1][j - 1] + 1 : Math.max(lcs[i - 1][j], lcs[i][j - 1]);
  }
  return { total: steps.length, matched: lcs[steps.length][shown.length] };
}

function ruleBoxFit(data: { heading?: string; items: string[] }, blocks: RawBlock[]): Fit {
  const boxes = blocks.map((b) => ({ box: readRuleBoxParams(b.params), caption: typeof b.caption === "string" ? b.caption : "" }));
  const headings = boxes.flatMap(({ box, caption }) => filled([box.heading, caption]));
  const heading = data.heading?.trim() ? { total: 1, matched: headings.some((h) => same(data.heading!, h)) ? 1 : 0 } : { total: 0, matched: 0 };
  return { total: heading.total + data.items.length, matched: heading.matched + matchPool(data.items, boxes.flatMap(({ box }) => box.items)) };
}

const leafCount = (node: { branches?: Array<{ node: SourceDecisionNode | DecisionTreeVisualNode }> }): number =>
  (node.branches?.length ? node.branches.reduce((sum, b) => sum + leafCount(b.node), 0) : 1);
const treeSize = (node: SourceDecisionNode): number => 1 + (node.branches ?? []).reduce((sum, b) => sum + 1 + treeSize(b.node), 0);
/** Csomópont és ágfelirat ÚTVONAL szerint: az ág a felirata alapján áll párba (a sorrend nem számít), a hiányzó ág alatt minden hiányzik. */
function treeMatch(source: SourceDecisionNode, shown: DecisionTreeVisualNode): number {
  const free = [...(shown.branches ?? [])];
  let matched = same(source.text, shown.text) ? 1 : 0;
  for (const branch of source.branches ?? []) {
    const at = free.findIndex((b) => same(branch.label, b.label));
    if (at < 0) continue;
    matched += 1 + treeMatch(branch.node, free.splice(at, 1)[0].node);
  }
  return matched;
}
function treeFit(root: SourceDecisionNode, blocks: RawBlock[]): Fit {
  const total = treeSize(root);
  let best: Fit = { total, matched: 0 };
  for (const block of blocks) {
    const tree = readDecisionTreeParams(block.params);
    if (!tree) continue;
    const [shownLeaves, sourceLeaves] = [leafCount(tree.root), leafCount(root)];
    const fit: Fit = { total, matched: treeMatch(root, tree.root), ...(shownLeaves < sourceLeaves ? { blocker: `a döntési fa levelei: ${shownLeaves} a leckében, ${sourceLeaves} a forrásban` } : {}) };
    if (fit.matched > best.matched || (fit.matched === best.matched && !fit.blocker)) best = fit;
  }
  return best.matched || best.blocker ? best : { ...best, blocker: "a hivatkozó blokkban nincs döntési fa (params.root.branches[].node)" };
}

function pictureCardFit(cards: Array<{ label: string; caption?: string; example?: string }>, blocks: RawBlock[]): Fit {
  const free = blocks.flatMap((b) => readPictureCardsParams(b.params).cards);
  let total = 0, matched = 0, imageless = 0;
  for (const card of cards) {
    total += 1 + filled([card.caption, card.example]).length;
    const at = free.findIndex((shown) => same(card.label, shown.label));
    if (at < 0) continue;
    const [shown] = free.splice(at, 1);
    // A kártya a felirattal ÉS a képpel jelenik meg: kép nélkül a felirat nem képes kártya (review F6).
    if (shown.svg.trim()) matched++; else imageless++;
    if (card.caption?.trim() && same(card.caption, shown.caption ?? "")) matched++;
    if (card.example?.trim() && same(card.example, shown.example ?? "")) matched++;
  }
  return { total, matched, ...(imageless ? { blocker: `${imageless} kártya kép (svg) nélkül` } : {}) };
}

/** A blokk MEGJELENŐ szöveges mezői fajtánként (a szerződésen kívüli, rejtett kulcs nem megjelenés), normalizálva. */
function displayFields(block: RawBlock): string[] {
  const one = (v: unknown) => (typeof v === "string" ? [v] : []);
  const raw: string[] = [];
  if (block.kind === "example") raw.push(...one(block.problem), ...strings(block.steps), ...one(block.answer));
  else if (block.kind === "check") raw.push(...one(block.question), ...strings(block.options), ...strings(block.feedbackPerOption), ...one(block.hint));
  else if (block.kind === "try") {
    // A `try` blokk `spec` mezője teljes egészében megjelenő tartalom (elemek, párok, mondatok) — korlátos bejárással.
    const stack: unknown[] = [block.spec];
    let visited = 0;
    while (stack.length && visited++ < MAX_NODES) {
      const value = stack.pop();
      if (typeof value === "string") raw.push(value);
      else if (Array.isArray(value)) stack.push(...value);
      else if (isObject(value)) stack.push(...Object.values(value));
    }
  } else if (block.kind === "animate") {
    const kind = String(block.animKind);
    raw.push(...one(block.caption));
    if (kind === "table") { const t = readTableParams(block.params); raw.push(...filled([t.caption]), ...t.headers, ...t.rows.flat()); }
    else if (kind === "ruleBox") { const r = readRuleBoxParams(block.params); raw.push(...filled([r.heading]), ...r.items); }
    else if (kind === "compareCards") raw.push(...readCompareCardsParams(block.params).cards.flatMap((c) => [c.title, ...c.lines, ...filled([c.example])]));
    else if (kind === "pictureCards") raw.push(...readPictureCardsParams(block.params).cards.flatMap((c) => [c.label, ...filled([c.caption, c.example])]));
    else if (kind === "decisionTree") {
      const stack: DecisionTreeVisualNode[] = [readDecisionTreeParams(block.params)?.root].filter((n): n is DecisionTreeVisualNode => !!n);
      while (stack.length) { const node = stack.pop()!; raw.push(node.text); for (const b of node.branches ?? []) { raw.push(b.label); stack.push(b.node); } }
    } else raw.push(...renderedVisualTexts(kind, block.params));
  }
  return raw.map(N).filter(Boolean);
}

/** A képet hordozó kártyák száma a hivatkozó `pictureCards` blokkokban. */
const pictureCount = (blocks: RawBlock[]) => blocks.filter((b) => b.kind === "animate" && b.animKind === "pictureCards")
  .reduce((sum, b) => sum + readPictureCardsParams(b.params).cards.filter((c) => c.svg.trim()).length, 0);

function exerciseFit(data: { instruction: string; items: string[]; answerKey?: string[]; pictures?: string[] }, blocks: RawBlock[]): Fit {
  const fields = blocks.flatMap(displayFields);
  const texts = [data.instruction, ...data.items, ...(data.answerKey ?? [])];
  // Képes feladatnál a képek száma is számít (review F6): a kép nélküli, csak szöveges blokk nem jeleníti meg a képeket.
  const pictures = data.pictures?.length ?? 0;
  const shownPictures = Math.min(pictures, pictureCount(blocks));
  return { total: texts.length + pictures, matched: texts.filter((t) => found(t, fields)).length + shownPictures,
    ...(pictures > shownPictures ? { blocker: `a feladat ${pictures} képéből ${shownPictures} jelenik meg` } : {}) };
}

/** Van-e a blokkban kirajzolható tartalom (review F6: az üres `animate` blokk nem megjelenés). */
function substantive(block: RawBlock): boolean {
  const kind = String(block.animKind);
  if (kind === "table") { const t = readTableParams(block.params); return t.rows.some((r) => r.some((c) => c.trim())); }
  if (kind === "ruleBox") return readRuleBoxParams(block.params).items.some((i) => i.trim());
  if (kind === "compareCards") return readCompareCardsParams(block.params).cards.some((c) => c.title.trim() || c.lines.some((l) => l.trim()));
  if (kind === "pictureCards") return readPictureCardsParams(block.params).cards.some((c) => c.svg.trim());
  if (kind === "decisionTree") return !!readDecisionTreeParams(block.params)?.root.text.trim();
  return isObject(block.params) && Object.keys(block.params).length > 0 && visualParamProblems(kind, block.params).length === 0;
}

function diagramFit(parts: Array<{ label: string; meaning: string }>, blocks: RawBlock[]): Fit {
  const drawn = blocks.filter(substantive);
  const fields = drawn.flatMap(displayFields);
  const texts = parts.flatMap((p) => [p.label, p.meaning]);
  return { total: texts.length, matched: texts.filter((t) => found(t, fields)).length, ...(drawn.length ? {} : { blocker: "a hivatkozó ábra blokkja üres (nincs kirajzolható tartalma)" }) };
}

const kindLabel = (block: RawBlock) => (block.kind === "animate" ? `animate/${String(block.animKind)}` : String(block.kind));

function kindFits(kind: SourceVisualKind, block: RawBlock): boolean {
  const target = (SOURCE_KIND_TARGETS as Record<string, (typeof SOURCE_KIND_TARGETS)[CountedSourceKind] | undefined>)[kind];
  if (!target) return false;
  if (block.kind === "animate") return target.animKinds === "any" || (typeof block.animKind === "string" && target.animKinds.includes(block.animKind));
  return typeof block.kind === "string" && target.blockKinds.includes(block.kind);
}

/** D1H-2: a kivágott forráskép magát a forrásrészt mutatja — a hivatkozó, érvényes `sourceImage` blokk a tétel egészét lefedi. */
const sourceImageShown = (blocks: RawBlock[]) => blocks.some((b) => b.kind === "animate" && b.animKind === "sourceImage" && sourceImageParamsSchema.safeParse(b.params).success);

function fitOf(visual: SourceVisual, blocks: RawBlock[]): Fit {
  if ((visual.kind === "photo" || visual.kind === "diagram") && sourceImageShown(blocks)) return { total: 1, matched: 1 };
  switch (visual.kind) {
    case "table": return tableFit(visual.data, blocks);
    case "process": return processFit(visual.data.steps, blocks);
    case "decisionTree": return treeFit(visual.data.root, blocks);
    case "ruleBox": return ruleBoxFit(visual.data, blocks);
    case "pictureCard": return pictureCardFit(visual.data.cards, blocks);
    case "exercise": return exerciseFit(visual.data, blocks);
    case "diagram": return diagramFit(visual.data.parts, blocks);
    default: return { total: 1, matched: 0 };
  }
}

/** A tétel megítélése a rá hivatkozó blokkokon: `null`, ha megjelent; különben a hiány oka. */
function whyNotShown(visual: SourceVisual, referencing: RawBlock[]): string | null {
  if (!referencing.length) return "nincs rá hivatkozó blokk (sourceVisualId)";
  const fitting = referencing.filter((b) => kindFits(visual.kind, b));
  if (!fitting.length) {
    const target = (SOURCE_KIND_TARGETS as Record<string, (typeof SOURCE_KIND_TARGETS)[CountedSourceKind] | undefined>)[visual.kind];
    const wanted = target ? [...(target.animKinds === "any" ? ["animate"] : target.animKinds.map((k) => `animate/${k}`)), ...target.blockKinds].join(" | ") : "—";
    return `a hivatkozó blokk fajtája (${[...new Set(referencing.map(kindLabel))].join(", ")}) nem illik a tételhez (${visual.kind} → ${wanted})`;
  }
  const fit = fitOf(visual, fitting);
  const share = fit.total ? fit.matched / fit.total : 1;
  if (share + 1e-9 < SOURCE_COVERAGE_THRESHOLDS.fidelity) {
    return `a tartalom hűsége ${Math.round(share * 100)}% (${fit.matched}/${fit.total} egység), a minimum ${Math.round(SOURCE_COVERAGE_THRESHOLDS.fidelity * 100)}%${fit.blocker ? ` — ${fit.blocker}` : ""}`;
  }
  // A levélszám és az üres ábra a hűségtől függetlenül hiány; a „kép nélkül” jellegű megjegyzés a hűségen keresztül hat.
  if (fit.blocker && (visual.kind === "decisionTree" || visual.kind === "diagram")) return fit.blocker;
  return null;
}

/** A megengedett hiány `n` tételnél: n − ⌈share × n⌉ (lebegőpontos hibára védve). */
const allowedMissing = (n: number, share: number) => n - Math.ceil(share * n - 1e-9);
/** A kihagyási keret: legfeljebb max(minSkips, ⌊maxSkipShare × n⌋), de üres leltárnál 0. */
export const skipCapOf = (counted: number) => (counted > 0 ? Math.max(SOURCE_COVERAGE_THRESHOLDS.minSkips, Math.floor(SOURCE_COVERAGE_THRESHOLDS.maxSkipShare * counted + 1e-9)) : 0);

export function sourceCoverageGate(lesson: GateLesson, visuals: ReadonlyArray<SourceVisual> = [], skipped: ReadonlyArray<SkippedSourceVisual> = []): SourceCoverageResult {
  const T = SOURCE_COVERAGE_THRESHOLDS;
  const counted = (Array.isArray(visuals) ? visuals : []).filter((v) => isObject(v) && typeof v.id === "string" && v.kind !== "colorCode");
  const byId = new Map(counted.map((v) => [v.id, v] as const));
  const conceptCount = (v: SourceVisual) => (Array.isArray(v.conceptIds) ? v.conceptIds.length : 0);
  const blocksOf = new Map<string, RawBlock[]>();
  for (const section of Array.isArray(lesson?.sections) ? lesson.sections : []) {
    for (const block of Array.isArray(section?.blocks) ? section.blocks : []) {
      if (!isObject(block) || typeof block.sourceVisualId !== "string") continue;
      blocksOf.set(block.sourceVisualId, [...(blocksOf.get(block.sourceVisualId) ?? []), block]);
    }
  }
  // 1. Megjelenés tételenként (a kihagyásoktól függetlenül), a hivatkozó blokkok unióján. A hibás alakú tétel hiány — nem kivétel.
  const whyMissing = new Map<string, string>();
  for (const visual of counted) {
    let why: string | null;
    try { why = whyNotShown(visual, blocksOf.get(visual.id) ?? []); } catch { why = "a tétel vagy a hivatkozó blokk alakja hibás (nem mérhető)"; }
    if (why) whyMissing.set(visual.id, why);
  }
  const isShown = (id: string) => byId.has(id) && !whyMissing.has(id);

  // 2. Kihagyások: zárt oklista, fajtánként megengedett ok, programmal ellenőrzött szabály; az érvénytelen kihagyás hiány marad.
  const validSkips: string[] = [];
  const skipProblems = new Map<string, string>();
  const orphanProblems: string[] = [];
  const seen = new Set<string>();
  for (const skip of Array.isArray(skipped) ? skipped : []) {
    const id = isObject(skip) && typeof skip.id === "string" ? skip.id : "";
    const visual = byId.get(id);
    if (!visual) { orphanProblems.push(`kihagyás „${id.slice(0, 40)}”: nincs ilyen (számolt) tétel a leltárban`); continue; }
    if (seen.has(id)) continue;
    seen.add(id);
    const rawReason = (skip as { reason?: unknown }).reason;
    const reason = typeof rawReason === "string" ? rawReason : "";
    const invalid = (why: string) => { skipProblems.set(id, `érvénytelen kihagyás (${reason.slice(0, 40) || "ok nélkül"}): ${why}`); };
    if (!(SOURCE_VISUAL_SKIP_REASONS as readonly string[]).includes(reason)) { invalid(`az ok nem a zárt listából való (${SOURCE_VISUAL_SKIP_REASONS.join(" | ")})`); continue; }
    const allowed = (SOURCE_SKIP_REASONS_BY_KIND as Record<string, readonly string[] | undefined>)[visual.kind] ?? [];
    if (!allowed.includes(reason)) { invalid(`${reason} ok ${visual.kind} tételnél nem adható (megengedett: ${allowed.join(" | ") || "—"})`); continue; }
    if (conceptCount(visual) && reason !== "duplicate") { invalid("tanított fogalomra hivatkozó tétel csak duplicate okkal hagyható ki"); continue; }
    if (reason === "duplicate") {
      const of = (skip as { duplicateOf?: unknown }).duplicateOf;
      if (typeof of !== "string" || !byId.has(of) || of === id) { invalid("a duplicateOf nem egy másik, létező tételre mutat"); continue; }
      if (!isShown(of)) { invalid(`a duplicateOf tétel (${of}) nem jelent meg`); continue; }
    }
    validSkips.push(id);
  }
  const skipCap = skipCapOf(counted.length);
  for (const id of validSkips.splice(skipCap)) skipProblems.set(id, `érvénytelen kihagyás: a kihagyások meghaladják a keretet (legfeljebb ${skipCap} a(z) ${counted.length} tételből — a tételek ${Math.round(T.maxSkipShare * 100)}%-a, de legalább ${T.minSkips})`);
  const skippedIds = new Set(validSkips);

  // 3. Ítélet: a `must` fajták nem kihagyott tételei mind, a `should` fajtáké legalább `shouldShare` arányban.
  const pending = counted.filter((v) => !skippedIds.has(v.id));
  const missing = pending.filter((v) => !isShown(v.id));
  const group = (kinds: readonly string[], share: number) => {
    const of = pending.filter((v) => kinds.includes(v.kind));
    const lost = of.filter((v) => !isShown(v.id));
    return { total: of.length, shown: of.length - lost.length, lost, ok: lost.length <= allowedMissing(of.length, share) };
  };
  const must = group(T.must, T.mustShare);
  const should = group(T.should, T.shouldShare);
  // A számolt, de egyik csoportba sem sorolt (ismeretlen) fajta szigorúan számít: hiánya bukás.
  const other = group([...new Set(counted.map((v) => v.kind).filter((k) => !(T.must as readonly string[]).includes(k) && !(T.should as readonly string[]).includes(k)))], 1);
  const line = (v: SourceVisual) => `${v.id} (${v.kind}): ${[skipProblems.get(v.id), whyMissing.get(v.id)].filter(Boolean).join("; ")}`;
  const ok = must.ok && should.ok && other.ok;
  const problems = [
    ...(must.ok ? [] : must.lost.map(line)),
    ...(other.ok ? [] : other.lost.map(line)),
    ...(should.ok ? [] : [`a képes kártya / feladat / egyéb ábra tételekből ${should.shown}/${should.total} jelent meg, a minimum ${Math.round(T.shouldShare * 100)}% (legfeljebb ${allowedMissing(should.total, T.shouldShare)} hiányozhat)`, ...should.lost.map(line)]),
    ...(ok ? [] : orphanProblems),
  ];
  return {
    gate: "sourceCoverage",
    ok,
    problems,
    metrics: {
      total: counted.length, skipped: skippedIds.size, shown: pending.length - missing.length, missing: missing.length,
      mustTotal: must.total, mustShown: must.shown, shouldTotal: should.total, shouldShown: should.shown,
      invalidSkips: skipProblems.size + orphanProblems.length,
      coveragePct: pending.length ? Math.round((100 * (pending.length - missing.length)) / pending.length) : 100,
    },
    missingIds: missing.map((v) => v.id),
    items: counted.map((v) => (skippedIds.has(v.id) ? { id: v.id, kind: v.kind, state: "skipped" as const }
      : isShown(v.id) ? { id: v.id, kind: v.kind, state: "shown" as const }
      : { id: v.id, kind: v.kind, state: "missing" as const, reason: [skipProblems.get(v.id), whyMissing.get(v.id)].filter(Boolean).join("; ") })),
  };
}

/** A megjelenítő-szerződés fajtái mind szerepelnek valamelyik megfeleltetésben (a `compareCards` is) — őr a teszthez. */
export const RENDER_KINDS_IN_TARGETS = SOURCE_RENDER_KINDS.filter((kind) => Object.values(SOURCE_KIND_TARGETS).some((t) => t.animKinds !== "any" && t.animKinds.includes(kind)));

registerGate("sourceCoverage", ({ lesson, visuals, skipped }) => sourceCoverageGate(lesson, visuals, skipped));
