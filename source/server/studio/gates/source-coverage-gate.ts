import { SOURCE_VISUAL_SKIP_REASONS, sourceVisualTexts, type SkippedSourceVisual, type SourceVisual, type SourceVisualKind } from "../../../shared/source-visuals";
import { registerGate, type GateLesson, type GateResult } from "./types";

/**
 * SK1 — forrás-fedettségi kapu (docs/specs/2026-11-18-tananyag-gyartas-minoseg.md): a forrás vizuális leltárának tételeire. Ami a
 * forrásban megvan és a leckében nincs, az HIÁNY, nem 100%. Tiszta függvény: modell és adatbázis nélkül, ugyanarra a bemenetre mindig
 * ugyanazt adja.
 *
 * „Megjelent” egy tétel, ha (1) van rá `sourceVisualId`-val hivatkozó blokk, (2) a blokk fajtája a tétel fajtájához illik
 * (`SOURCE_KIND_TARGETS`), és (3) a tartalma hű: a tétel megjelenő szövegeinek (cella, lépés, ág, pont, kártyafelirat — ékezet-, kisbetű-
 * és szóköz-hajtogatva) legalább `fidelity` hányada szerepel a blokk szövegében; döntési fánál a levelek száma sem kevesebb a forrásénál.
 */
export const SOURCE_COVERAGE_THRESHOLDS = {
  /** Ezeknek a fajtáknak a nem kihagyott tételei mind megjelennek (`mustShare`). */
  must: ["table", "process", "decisionTree", "ruleBox"],
  mustShare: 1,
  /** Ezeknek a fajtáknak legalább `shouldShare` hányada megjelenik (a megengedett hiány: n − ⌈shouldShare × n⌉). */
  should: ["pictureCard", "exercise", "diagram"],
  shouldShare: 0.8,
  /** A tétel megjelenő szövegeinek legalább ekkora hányada szerepel a hivatkozó blokkban. */
  fidelity: 0.8,
  /** Az érvényes kihagyások legfeljebb a számolt tételek ekkora hányada (a többlet a lista végéről érvénytelen). */
  maxSkipShare: 0.3,
} as const satisfies { must: readonly SourceVisualKind[]; should: readonly SourceVisualKind[]; mustShare: number; shouldShare: number; fidelity: number; maxSkipShare: number };

/** A számolt fajták (a `colorCode` nem önálló tétel: a tónusokban él tovább). */
export type CountedSourceKind = Exclude<SourceVisualKind, "colorCode">;

/**
 * Megfeleltetés: forrásfajta → a megjelenítésére alkalmas blokk. `animKinds`: az `animate` blokk elfogadott ábrafajtái (`"any"` =
 * bármelyik); `blockKinds`: más elfogadott blokkfajták. Az S2 előtt a `table` / `decisionTree` / `ruleBox` / `pictureCards` ábrafajta
 * még nem létezik a lecke sémájában — az ilyen tétel addig „nem jelent meg” (hibát nem dob).
 */
export const SOURCE_KIND_TARGETS: Record<CountedSourceKind, { animKinds: readonly string[] | "any"; blockKinds: readonly string[] }> = {
  table: { animKinds: ["table"], blockKinds: [] },
  process: { animKinds: ["process"], blockKinds: [] },
  decisionTree: { animKinds: ["decisionTree"], blockKinds: [] },
  ruleBox: { animKinds: ["ruleBox"], blockKinds: [] },
  pictureCard: { animKinds: ["pictureCards"], blockKinds: [] },
  diagram: { animKinds: "any", blockKinds: [] },
  exercise: { animKinds: ["pictureCards"], blockKinds: ["example", "try", "check"] },
};

export type SourceCoverageItem = { id: string; kind: SourceVisualKind; state: "shown" | "missing" | "skipped"; reason?: string };
export type SourceCoverageResult = GateResult & {
  /** A nem kihagyott, meg nem jelent tételek azonosítói (a megengedett `should`-hiány is). */
  missingIds: string[];
  /** Tételenkénti ítélet a leltár sorrendjében (hiánytábla, parancssori kimenet). */
  items: SourceCoverageItem[];
};

type RawBlock = Record<string, unknown>;
const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object";
/** A blokk nem megjelenő (azonosító / fajta) mezői — a hűség mérésében nem szöveg. */
const META_KEYS = new Set(["kind", "animKind", "tryKind", "sourceVisualId", "coversConceptIds"]);
/** A bejárás felső korlátja (a kapu rosszindulatúan nagy blokkon sem futhat el). */
const MAX_NODES = 20_000;

/** A blokk minden megjelenő szövege (felirat, paraméterek, lépések, opciók…), iteratívan, korlátos bejárással, hajtogatva. */
function blockText(block: RawBlock): string {
  const out: string[] = [];
  const stack: unknown[] = Object.entries(block).filter(([key]) => !META_KEYS.has(key)).map(([, value]) => value);
  let visited = 0;
  while (stack.length && visited++ < MAX_NODES) {
    const value = stack.pop();
    if (typeof value === "string") out.push(value);
    else if (Array.isArray(value)) stack.push(...value);
    else if (isObject(value)) stack.push(...Object.values(value));
  }
  return fold(out.join(" "));
}

/** A döntési fa leveleinek száma (ág nélküli csomópont) — forrástételen és a megjelenítő blokk `params.root` fáján ugyanígy. */
function leafCount(root: unknown): number {
  if (!isObject(root)) return 0;
  let leaves = 0;
  const stack: unknown[] = [root];
  let visited = 0;
  while (stack.length && visited++ < MAX_NODES) {
    const node = stack.pop();
    if (!isObject(node)) continue;
    const branches = Array.isArray(node.branches) ? node.branches.filter(isObject) : [];
    if (!branches.length) leaves++;
    else stack.push(...branches.map((b) => b.node));
  }
  return leaves;
}

const kindLabel = (block: RawBlock) => (block.kind === "animate" ? `animate/${String(block.animKind)}` : String(block.kind));

function kindFits(kind: CountedSourceKind, block: RawBlock): boolean {
  const target = SOURCE_KIND_TARGETS[kind];
  if (!target) return false;
  if (block.kind === "animate") return target.animKinds === "any" || (typeof block.animKind === "string" && target.animKinds.includes(block.animKind));
  return typeof block.kind === "string" && target.blockKinds.includes(block.kind);
}

/** Egy hivatkozó blokk megítélése: `null`, ha a tétel megjelent benne; különben a hiány oka. */
function blockProblem(visual: SourceVisual, block: RawBlock): { rank: number; reason: string } | null {
  if (!kindFits(visual.kind as CountedSourceKind, block)) {
    const target = SOURCE_KIND_TARGETS[visual.kind as CountedSourceKind];
    const wanted = target ? [...(target.animKinds === "any" ? ["animate"] : target.animKinds.map((k) => `animate/${k}`)), ...target.blockKinds].join(" | ") : "—";
    return { rank: 1, reason: `a hivatkozó blokk fajtája (${kindLabel(block)}) nem illik a tételhez (${visual.kind} → ${wanted})` };
  }
  // A cím a forrás saját címkéje (a leckében felirat lehet belőle) — a hűséget a tartalom (cella, lépés, pont, felirat) adja.
  const texts = [...new Set(sourceVisualTexts({ ...visual, title: undefined }).map(fold).filter(Boolean))];
  const haystack = blockText(block);
  const present = texts.filter((t) => haystack.includes(t)).length;
  const share = texts.length ? present / texts.length : 1;
  if (share + 1e-9 < SOURCE_COVERAGE_THRESHOLDS.fidelity) {
    return { rank: 2, reason: `a tartalom hűsége ${Math.round(share * 100)}% (${present}/${texts.length} szöveg), a minimum ${Math.round(SOURCE_COVERAGE_THRESHOLDS.fidelity * 100)}%` };
  }
  if (visual.kind === "decisionTree") {
    const [source, shown] = [leafCount(visual.data.root), leafCount((block.params as { root?: unknown } | undefined)?.root)];
    if (shown < source) return { rank: 3, reason: `a döntési fa levelei: ${shown} a leckében, ${source} a forrásban` };
  }
  return null;
}

/** A megengedett hiány `n` tételnél: n − ⌈share × n⌉ (lebegőpontos hibára védve). */
const allowedMissing = (n: number, share: number) => n - Math.ceil(share * n - 1e-9);

export function sourceCoverageGate(lesson: GateLesson, visuals: ReadonlyArray<SourceVisual> = [], skipped: ReadonlyArray<SkippedSourceVisual> = []): SourceCoverageResult {
  const T = SOURCE_COVERAGE_THRESHOLDS;
  const counted = visuals.filter((v) => v.kind !== "colorCode");
  const byId = new Map(counted.map((v) => [v.id, v] as const));
  const blocksOf = new Map<string, RawBlock[]>();
  for (const section of Array.isArray(lesson?.sections) ? lesson.sections : []) {
    for (const block of Array.isArray(section?.blocks) ? section.blocks : []) {
      if (!isObject(block) || typeof block.sourceVisualId !== "string") continue;
      blocksOf.set(block.sourceVisualId, [...(blocksOf.get(block.sourceVisualId) ?? []), block]);
    }
  }
  // 1. Megjelenés tételenként (a kihagyásoktól függetlenül): a legjobb hivatkozó blokk dönt.
  const whyMissing = new Map<string, string>();
  for (const visual of counted) {
    const verdicts = (blocksOf.get(visual.id) ?? []).map((block) => blockProblem(visual, block));
    if (verdicts.some((v) => v === null)) continue;
    const closest = verdicts.filter((v): v is { rank: number; reason: string } => v !== null).sort((a, b) => b.rank - a.rank)[0];
    whyMissing.set(visual.id, closest?.reason ?? "nincs rá hivatkozó blokk (sourceVisualId)");
  }
  const isShown = (id: string) => byId.has(id) && !whyMissing.has(id);

  // 2. Kihagyások: zárt oklista, programmal ellenőrzött szabály; az érvénytelen kihagyás hiány marad, megnevezett okkal.
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
    const reason = String((skip as { reason?: unknown }).reason);
    const invalid = (why: string) => { skipProblems.set(id, `érvénytelen kihagyás (${reason.slice(0, 40)}): ${why}`); };
    if (!(SOURCE_VISUAL_SKIP_REASONS as readonly string[]).includes(reason)) { invalid(`az ok nem a zárt listából való (${SOURCE_VISUAL_SKIP_REASONS.join(" | ")})`); continue; }
    if (visual.conceptIds.length && reason !== "duplicate") { invalid("tanított fogalomra hivatkozó tétel csak duplicate okkal hagyható ki"); continue; }
    if (reason === "decorative" && visual.kind !== "diagram" && visual.kind !== "pictureCard") { invalid(`decorative ok csak diagram / pictureCard tételnél adható (ez ${visual.kind})`); continue; }
    if (reason === "duplicate") {
      const of = (skip as { duplicateOf?: unknown }).duplicateOf;
      if (typeof of !== "string" || !byId.has(of) || of === id) { invalid("a duplicateOf nem egy másik, létező tételre mutat"); continue; }
      if (!isShown(of)) { invalid(`a duplicateOf tétel (${of}) nem jelent meg`); continue; }
    }
    validSkips.push(id);
  }
  const skipCap = Math.floor(T.maxSkipShare * counted.length + 1e-9);
  for (const id of validSkips.splice(skipCap)) skipProblems.set(id, `érvénytelen kihagyás: a kihagyások meghaladják a tételek ${Math.round(T.maxSkipShare * 100)}%-át (legfeljebb ${skipCap} a(z) ${counted.length} tételből)`);
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
  // A számolt, de egyik csoportba sem sorolt fajta (jövőbeli bővítés) szigorúan számít: hiánya bukás.
  const other = group(counted.map((v) => v.kind).filter((k) => !(T.must as readonly string[]).includes(k) && !(T.should as readonly string[]).includes(k)), 1);
  const line = (v: SourceVisual) => `${v.id} (${v.kind}): ${[skipProblems.get(v.id), whyMissing.get(v.id)].filter(Boolean).join("; ")}`;
  const problems = [
    ...(must.ok ? [] : must.lost.map(line)),
    ...(other.ok ? [] : other.lost.map(line)),
    ...(should.ok ? [] : [`a képes kártya / feladat / egyéb ábra tételekből ${should.shown}/${should.total} jelent meg, a minimum ${Math.round(T.shouldShare * 100)}% (legfeljebb ${allowedMissing(should.total, T.shouldShare)} hiányozhat)`, ...should.lost.map(line)]),
  ];
  const ok = must.ok && should.ok && other.ok;
  // Az érvénytelen kihagyás oka akkor is látszik, ha a tétel hiánya (a megengedett hányadon belül) nem buktat.
  const notes = ok ? [] : orphanProblems;
  return {
    gate: "sourceCoverage",
    ok,
    problems: [...problems, ...notes],
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

registerGate("sourceCoverage", ({ lesson, visuals, skipped }) => sourceCoverageGate(lesson, visuals, skipped));
