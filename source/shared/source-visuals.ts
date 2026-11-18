import { z } from "zod";

/**
 * A forrás vizuális leltára (docs/specs/2026-11-18-tananyag-gyartas-minoseg.md, S1a): a forrás táblázatai, folyamatai, döntési ábrái,
 * szabálydobozai, képes kártyái, színkódjai, feladatai és egyéb ábrái strukturált adatként. A tétel oldalszámmal igazolt tanítható
 * tartalom, nem szó szerinti idézet. Tiszta modul: a modell kimenetét séma és szabály ítéli meg; a hibás tétel kimarad (nincs javítókör).
 */
export const SOURCE_VISUAL_KINDS = ["table", "process", "decisionTree", "ruleBox", "pictureCard", "colorCode", "exercise", "diagram"] as const;
export type SourceVisualKind = (typeof SOURCE_VISUAL_KINDS)[number];
export const SOURCE_VISUAL_LIMITS = { maxItems: 60, maxChars: 40000 } as const;
/** A döntési fa legnagyobb mélysége (a gyökér az 1. szint). */
export const SOURCE_VISUAL_TREE_DEPTH = 4;
/** `verified: "text"`, ha a tétel 3+ betűs szavainak legalább ekkora hányada szerepel az oldal kinyert szövegében. */
export const SOURCE_VISUAL_TEXT_SHARE = 0.6;

const filled = (max: number) => z.string().trim().min(1).max(max);
const tone = z.enum(["a", "b", "c", "neutral"]);

export type SourceDecisionNode = { text: string; branches?: Array<{ label: string; node: SourceDecisionNode }> };
const nodeSchema: z.ZodType<SourceDecisionNode, z.ZodTypeDef, unknown> = z.lazy(() =>
  z.object({ text: filled(160), branches: z.array(z.object({ label: filled(60), node: nodeSchema })).max(4).optional() }));
const depthOf = (node: SourceDecisionNode): number => 1 + Math.max(0, ...(node.branches ?? []).map((b) => depthOf(b.node)));

const common = {
  id: z.string().regex(/^[A-Za-z0-9_-]{1,12}$/),
  sourceFile: filled(255),
  page: z.number().int().min(1),
  role: filled(200),
  title: filled(160).optional(),
  conceptIds: z.array(z.string()).max(12).default([]),
  /** A program tölti (`sanitizeSourceVisuals`); a modell értéke nem számít. */
  verified: z.enum(["text", "visual-only"]).optional(),
};
const item = <K extends SourceVisualKind, D extends z.ZodTypeAny>(kind: K, data: D) => z.object({ ...common, kind: z.literal(kind), data });

export const sourceVisualSchema = z.discriminatedUnion("kind", [
  // A cella lehet üres (a forrás táblázatának üres mezője is adat).
  item("table", z.object({ headers: z.array(filled(80)).min(1).max(8), rows: z.array(z.array(z.string().trim().max(200)).min(1).max(8)).min(1).max(40), headerTones: z.array(tone).max(8).optional() })),
  item("process", z.object({ steps: z.array(filled(200)).min(2).max(12) })),
  item("decisionTree", z.object({ root: nodeSchema.refine((root) => depthOf(root) <= SOURCE_VISUAL_TREE_DEPTH, { message: `A döntési fa legfeljebb ${SOURCE_VISUAL_TREE_DEPTH} szint mély lehet.` }) })),
  item("ruleBox", z.object({ tone: z.enum(["rule", "warning", "tip"]), heading: filled(80).optional(), items: z.array(filled(240)).min(1).max(8) })),
  item("pictureCard", z.object({ cards: z.array(z.object({ label: filled(60), depicts: filled(160), caption: filled(120).optional(), example: filled(160).optional() })).min(1).max(16) })),
  item("colorCode", z.object({ entries: z.array(z.object({ color: filled(30), tone, meaning: filled(160) })).min(2).max(6) })),
  item("exercise", z.object({ instruction: filled(300), items: z.array(filled(240)).max(20), answerKey: z.array(filled(240)).max(20).optional(), pictures: z.array(filled(160)).max(8).optional() })),
  item("diagram", z.object({ description: filled(400), parts: z.array(z.object({ label: filled(60), meaning: filled(200) })).max(12) })),
]);
export type SourceVisual = z.infer<typeof sourceVisualSchema>;

/** Az 1. állomás kérésének szövege a leltárról — az alak egyetlen helyen, a sémával együtt karbantartva. */
export const SOURCE_VISUALS_CONTRACT = [
  'A FORRÁS VIZUÁLIS LELTÁRA — a válasz JSON-jába "visuals": [...] kulcs is kerüljön. A forrás MINDEN táblázatáról, folyamatáról (lépéssoráról),',
  "döntési ábrájáról, kiemelt szabálydobozáról, képes kártyájáról, színkódjáról, feladatáról és egyéb ábrájáról adj egy tételt:",
  '{"id": "v1", "v2", … (egyedi), "kind": "table" | "process" | "decisionTree" | "ruleBox" | "pictureCard" | "colorCode" | "exercise" | "diagram",',
  ' "sourceFile": a forrásfájl neve, "page": oldalszám (1-től; képnél 1), "role": mit tanít a tétel (legfeljebb 200 karakter), "title"?: a tétel címe a forrásban,',
  ' "conceptIds": a hozzá tartozó fogalmak "id"-i a concepts listából, "data": a fajta szerinti adat}',
  "A data alakja fajtánként:",
  '- table: {"headers": string[1–8], "rows": string[][] (1–40 sor, soronként a fejléc sorrendjében), "headerTones"?: ("a" | "b" | "c" | "neutral")[]}',
  '- process: {"steps": string[2–12]}',
  `- decisionTree: {"root": Node}, ahol Node = {"text": string, "branches"?: [{"label": az ág felirata, "node": Node}] (legfeljebb 4 ág)}; legfeljebb ${SOURCE_VISUAL_TREE_DEPTH} szint`,
  '- ruleBox: {"tone": "rule" | "warning" | "tip", "heading"?: string, "items": string[1–8]}',
  '- pictureCard: {"cards": [{"label": a kártya felirata, "depicts": mit ábrázol a kép, "caption"?: string, "example"?: példamondat}] (1–16)}',
  '- colorCode: {"entries": [{"color": a szín neve, "tone": "a" | "b" | "c" | "neutral", "meaning": mit jelöl a szín}] (2–6)}',
  '- exercise: {"instruction": string, "items": string[] (legfeljebb 20), "answerKey"?: string[], "pictures"?: string[] (mit ábrázol egy-egy kép; legfeljebb 8)}',
  '- diagram: {"description": mit mutat az ábra, "parts": [{"label": string, "meaning": string}] (legfeljebb 12)}',
  "A kép TARTALMÁT írd le (depicts, pictures) — ne azt, hogy „kép”; a táblázatot ADATKÉNT add (fejléc és sorok), ne mondatokban; a színt JELENTÉSKÉNT",
  "(ugyanaz a jelentés ugyanaz a tónus az egész forrásban). A szövegek a forrás saját szavai legyenek. Ha a forrásban nincs ilyen elem: \"visuals\": [].",
  `Legfeljebb ${SOURCE_VISUAL_LIMITS.maxItems} tétel. A hibás alakú tételt a program kihagyja.`,
].join("\n");

const treeTexts = (node: SourceDecisionNode): string[] => [node.text, ...(node.branches ?? []).flatMap((b) => [b.label, ...treeTexts(b.node)])];

/** A tétel minden MEGJELENŐ szövege (cellák, lépések, ágak, pontok, feliratok) — a kép leírása és a szerep nem megjelenő szöveg. */
export function sourceVisualTexts(v: SourceVisual): string[] {
  const own = v.kind === "table" ? [...v.data.headers, ...v.data.rows.flat()]
    : v.kind === "process" ? v.data.steps
    : v.kind === "decisionTree" ? treeTexts(v.data.root)
    : v.kind === "ruleBox" ? [v.data.heading, ...v.data.items]
    : v.kind === "pictureCard" ? v.data.cards.flatMap((c) => [c.label, c.caption, c.example])
    : v.kind === "colorCode" ? v.data.entries.map((e) => e.meaning)
    : v.kind === "exercise" ? [v.data.instruction, ...v.data.items, ...(v.data.answerKey ?? [])]
    : v.data.parts.flatMap((p) => [p.label, p.meaning]);
  return [v.title, ...own].filter((t): t is string => typeof t === "string" && t.trim().length > 0);
}

/** A kinyert szöveg oldalai a `[N. oldal]` jelölők mentén (`document-source.ts` így jelöl); jelölő nélkül üres. */
export function splitPageTexts(extractedText: string): Record<number, string> {
  const pages: Record<number, string> = {};
  const marks = [...extractedText.matchAll(/\[(\d+)\. oldal\]/g)];
  marks.forEach((m, i) => {
    const page = Number(m[1]);
    const body = extractedText.slice(m.index! + m[0].length, marks[i + 1]?.index ?? extractedText.length).trim();
    pages[page] = pages[page] ? `${pages[page]}\n${body}` : body;
  });
  return pages;
}

const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const wordsOf = (s: string) => fold(s).match(/\p{L}{3,}/gu) ?? [];

export type SourceVisualContext = { fileNames: string[]; conceptIds: Set<string>; pageTexts?: Record<string, Record<number, string>> };
export type DroppedSourceVisual = { id?: string; reason: string };

/**
 * A modell leltárának determinisztikus megítélése, tételenként: séma, létező forrásfájl és oldal, egyedi azonosító, korlátok. A nem
 * létező fogalom-hivatkozás törlődik (a tétel marad). `verified`: a tétel szövegének szóegyezése az oldal kinyert szövegével.
 */
export function sanitizeSourceVisuals(raw: unknown, ctx: SourceVisualContext): { visuals: SourceVisual[]; dropped: DroppedSourceVisual[] } {
  const visuals: SourceVisual[] = [];
  const dropped: DroppedSourceVisual[] = [];
  const seen = new Set<string>();
  let chars = 0;
  for (const entry of Array.isArray(raw) ? raw : []) {
    const rawId = (entry as { id?: unknown } | null)?.id;
    const id = typeof rawId === "string" ? rawId.slice(0, 40) : undefined;
    const drop = (reason: string) => { dropped.push({ ...(id ? { id } : {}), reason }); };
    // Egyetlen forrásfájlnál a fájlnév egyértelmű (mint a fogalmaknál): a hiányzó `sourceFile` azt jelenti.
    // A `verified` mezőt a program tölti: a modell értéke eldobódik.
    const { verified: _model, ...fields } = (entry && typeof entry === "object" && !Array.isArray(entry) ? entry : {}) as Record<string, unknown>;
    const candidate = ctx.fileNames.length === 1 && fields.sourceFile === undefined ? { ...fields, sourceFile: ctx.fileNames[0] } : fields;
    const parsed = sourceVisualSchema.safeParse(candidate);
    if (!parsed.success) { drop(`hibás alak: ${parsed.error.issues.slice(0, 2).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ").slice(0, 200)}`); continue; }
    const v = parsed.data;
    if (!ctx.fileNames.includes(v.sourceFile)) { drop(`nem létező forrásfájl: ${v.sourceFile.slice(0, 80)}`); continue; }
    if (seen.has(v.id)) { drop("ismétlődő azonosító"); continue; }
    const pages = ctx.pageTexts?.[v.sourceFile];
    const lastPage = pages ? Math.max(0, ...Object.keys(pages).map(Number)) : 0;
    if (lastPage > 0 && v.page > lastPage) { drop(`nem létező oldal: ${v.page} (a fájl ${lastPage} oldalas)`); continue; }
    if (visuals.length >= SOURCE_VISUAL_LIMITS.maxItems) { drop(`a leltár legfeljebb ${SOURCE_VISUAL_LIMITS.maxItems} tétel`); continue; }
    const size = JSON.stringify(v).length;
    if (chars + size > SOURCE_VISUAL_LIMITS.maxChars) { drop(`a leltár legfeljebb ${SOURCE_VISUAL_LIMITS.maxChars} karakter`); continue; }
    const pageText = pages?.[v.page];
    const words = sourceVisualTexts(v).flatMap(wordsOf);
    const onPage = pageText ? new Set(wordsOf(pageText)) : null;
    const share = onPage && words.length ? words.filter((w) => onPage.has(w)).length / words.length : 0;
    seen.add(v.id); chars += size;
    visuals.push({ ...v, conceptIds: v.conceptIds.filter((c) => ctx.conceptIds.has(c)), verified: share >= SOURCE_VISUAL_TEXT_SHARE ? "text" : "visual-only" });
  }
  return { visuals, dropped };
}

/** A térkép `source_files` jsonb elemeiből a leltár egy listában (betöltés; hiányzó vagy hibás kulcs → nincs tétel). */
export function visualsOfSourceFiles(sourceFiles: unknown): SourceVisual[] {
  return (Array.isArray(sourceFiles) ? sourceFiles : []).flatMap((file) => {
    const list = (file as { visuals?: unknown } | null)?.visuals;
    return Array.isArray(list) ? list.flatMap((v) => { const p = sourceVisualSchema.safeParse(v); return p.success ? [p.data] : []; }) : [];
  });
}
