import { z } from "zod";

/**
 * A forrás vizuális leltára (docs/specs/2026-11-18-tananyag-gyartas-minoseg.md, S1a): a forrás táblázatai, folyamatai, döntési ábrái,
 * szabálydobozai, képes kártyái, színkódjai, feladatai és egyéb ábrái strukturált adatként. A tétel oldalszámmal igazolt tanítható
 * tartalom, nem szó szerinti idézet. Tiszta modul: a modell kimenetét séma és szabály ítéli meg; a hibás tétel kimarad (nincs javítókör).
 */
export const SOURCE_VISUAL_KINDS = ["table", "process", "decisionTree", "ruleBox", "pictureCard", "colorCode", "exercise", "diagram"] as const;
export type SourceVisualKind = (typeof SOURCE_VISUAL_KINDS)[number];
export const SOURCE_VISUAL_LIMITS = { maxItems: 60, maxChars: 40000 } as const;
/**
 * A leltár sémaverziója (review J4): a különálló kinyerés tartalmi lenyomatának része (`singleRunMapHash`), így a séma változása után
 * ugyanarra a fájlra nem a régi alakú (vagy leltár nélküli) térkép jön vissza jelzés nélkül. A séma érdemi változásakor emelendő.
 */
export const SOURCE_VISUALS_SCHEMA_VERSION = 1;
/** A döntési fa legnagyobb mélysége (a gyökér az 1. szint). */
export const SOURCE_VISUAL_TREE_DEPTH = 4;
/** `verified: "text"`, ha a tétel 3+ betűs szavainak legalább ekkora hányada szerepel az oldal kinyert szövegében. */
export const SOURCE_VISUAL_TEXT_SHARE = 0.6;
/** Józan abszolút oldalszám-plafon, ha a fájl tényleges oldalszáma nem ismert. */
export const SOURCE_VISUAL_MAX_PAGE = 2000;
/** A nyers tétel legnagyobb beágyazási mélysége — a 4 szintes döntési fa 12 szint; a mélyebb tétel a séma (és a rekurzió) ELŐTT kimarad. */
export const SOURCE_VISUAL_MAX_NESTING = 24;
/**
 * A táblázat korlátai egymással összhangban (review J5): a legnagyobb érvényes táblázat (8 oszlop × 40 sor × 100 karakteres cella,
 * ~34 000 karakter JSON-ként) belefér a `maxChars` keretbe.
 */
export const SOURCE_VISUAL_TABLE = { columns: 8, rows: 40, cellChars: 100, headerChars: 80 } as const;

const filled = (max: number) => z.string().trim().min(1).max(max);
const tone = z.enum(["a", "b", "c", "neutral"]);

export type SourceDecisionNode = { text: string; branches?: Array<{ label: string; node: SourceDecisionNode }> };
const nodeSchema: z.ZodType<SourceDecisionNode, z.ZodTypeDef, unknown> = z.lazy(() =>
  z.object({ text: filled(160), branches: z.array(z.object({ label: filled(60), node: nodeSchema })).max(4).optional() }));
const depthOf = (node: SourceDecisionNode): number => 1 + Math.max(0, ...(node.branches ?? []).map((b) => depthOf(b.node)));

const common = {
  id: z.string().regex(/^[A-Za-z0-9_-]{1,12}$/),
  sourceFile: filled(255),
  page: z.number().int().min(1).max(SOURCE_VISUAL_MAX_PAGE),
  role: filled(200),
  title: filled(160).optional(),
  conceptIds: z.array(z.string()).max(12).default([]),
  /** A program tölti (`sanitizeSourceVisuals`); a modell értéke nem számít. */
  verified: z.enum(["text", "visual-only"]).optional(),
};
const item = <K extends SourceVisualKind, D extends z.ZodTypeAny>(kind: K, data: D) => z.object({ ...common, kind: z.literal(kind), data });

export const sourceVisualSchema = z.discriminatedUnion("kind", [
  // A cella lehet üres (a forrás táblázatának üres mezője is adat).
  item("table", z.object({ headers: z.array(filled(SOURCE_VISUAL_TABLE.headerChars)).min(1).max(SOURCE_VISUAL_TABLE.columns),
    rows: z.array(z.array(z.string().trim().max(SOURCE_VISUAL_TABLE.cellChars)).min(1).max(SOURCE_VISUAL_TABLE.columns)).min(1).max(SOURCE_VISUAL_TABLE.rows), headerTones: z.array(tone).max(SOURCE_VISUAL_TABLE.columns).optional() })),
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
  `- table: {"headers": string[1–8], "rows": string[][] (1–40 sor, soronként a fejléc sorrendjében; egy cella legfeljebb ${SOURCE_VISUAL_TABLE.cellChars} karakter), "headerTones"?: ("a" | "b" | "c" | "neutral")[]}`,
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

/**
 * `pageTexts`: a PROGRAM által kinyert, oldaljelölős szöveg (csak a `verified` méréséhez). `pageCounts`: a fájl TÉNYLEGES oldalszáma, ha
 * ismert — felső határ csak ebből képződik (review J1: a modell átiratának hiányos jelölői miatt érvényes tétel nem eshet ki).
 */
export type SourceVisualContext = { fileNames: string[]; conceptIds: Set<string>; pageTexts?: Record<string, Record<number, string>>; pageCounts?: Record<string, number> };
export type DroppedSourceVisual = { id?: string; reason: string };
export type SourceVisualsResult = { visuals: SourceVisual[]; dropped: DroppedSourceVisual[];
  /** A törölt, nem létező fogalom-hivatkozások (a tétel marad): tételazonosító + a törölt azonosítók (review J2). */
  removedConceptRefs: Array<{ id: string; conceptIds: string[] }>;
  /** A megtartott táblázatok csonkolt (túl hosszú) cellái és fejlécei: tételazonosító + darabszám (review U1). */
  truncatedCells: Array<{ id: string; cells: number }> };

/** Review J7: a modell szövege naplózás és tárolás előtt — vezérlőkarakter (sortörés, NUL) és magányos helyettesítő helyett szóköz. */
export const cleanModelText = (s: string) => s.replace(/[\p{Cc}\p{Cs}]+/gu, " ");
/**
 * Review U4: többsoros tartalomnál (vers, párbeszéd, példamondat-lista) a sortörés a tartalom része — megmarad (`\r\n` / `\r` → `\n`,
 * legfeljebb egy üres sor egymás után); minden más vezérlőkarakter és a magányos helyettesítő helyett szóköz. Naplóba NEM való.
 */
export const cleanModelMultilineText = (s: string) => s.replace(/\r\n?/g, "\n").replace(/[^\P{Cc}\n]+|\p{Cs}+/gu, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n");

/** A nyers érték beágyazási mélysége ITERATÍVAN, `limit` fölött megállva (review J3: a mély fa nem dobhat veremhibát). */
function nestingExceeds(value: unknown, limit: number): boolean {
  const stack: Array<[unknown, number]> = [[value, 0]];
  while (stack.length) {
    const [v, depth] = stack.pop()!;
    if (v === null || typeof v !== "object") continue;
    if (depth >= limit) return true;
    for (const child of Array.isArray(v) ? v : Object.values(v)) stack.push([child, depth + 1]);
  }
  return false;
}

/** A (már korlátos mélységű) nyers érték szövegeinek tisztítása; a kulcsok mindig egysorosak. `multiline`: a sortörés megmarad (U4). */
function cleanDeep(value: unknown, multiline: boolean): unknown {
  if (typeof value === "string") return multiline ? cleanModelMultilineText(value) : cleanModelText(value);
  if (Array.isArray(value)) return value.map((v) => cleanDeep(v, multiline));
  if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [cleanModelText(k), cleanDeep(v, multiline)]));
  return value;
}

/**
 * A nyers tétel tisztítása: a közös mezők (azonosító, fájlnév, szerep, cím) és a táblázat cellái egysorosak; a többi fajta `data`
 * szövegében a sortörés megmarad (review U4).
 */
function cleanEntry(entry: object): Record<string, unknown> {
  const table = (entry as { kind?: unknown }).kind === "table";
  return Object.fromEntries(Object.entries(entry).map(([k, v]) => [cleanModelText(k), cleanDeep(v, k === "data" && !table)]));
}

/** A `max`-nál hosszabb szöveg csonkolva, a végén „…” jelöléssel (fél helyettesítő-pár nélkül); a rövidebb változatlan. */
function clipText(value: unknown, max: number, onClip: () => void): unknown {
  if (typeof value !== "string") return value;
  const text = value.trim();
  if (text.length <= max) return value;
  onClip();
  return `${text.slice(0, max - 1).replace(/[\uD800-\uDBFF]$/, "").trimEnd()}…`;
}

/**
 * Review U1: egyetlen túl hosszú cella (vagy fejléc) nem dobhatja el a teljes táblázatot — a szöveg a korlátra csonkolódik („…”
 * jelöléssel), a táblázat marad; a visszatérés a csonkolt szövegek száma. Más alakhibához nem nyúl (azt a séma ítéli meg).
 */
function clipTableTexts(fields: Record<string, unknown>): { fields: Record<string, unknown>; clipped: number } {
  const data = fields.data as { headers?: unknown; rows?: unknown } | null | undefined;
  if (fields.kind !== "table" || !data || typeof data !== "object") return { fields, clipped: 0 };
  let clipped = 0;
  const count = () => { clipped++; };
  const headers = Array.isArray(data.headers) ? data.headers.map((h) => clipText(h, SOURCE_VISUAL_TABLE.headerChars, count)) : data.headers;
  const rows = Array.isArray(data.rows) ? data.rows.map((row) => (Array.isArray(row) ? row.map((cell) => clipText(cell, SOURCE_VISUAL_TABLE.cellChars, count)) : row)) : data.rows;
  return clipped ? { fields: { ...fields, data: { ...data, headers, rows } }, clipped } : { fields, clipped: 0 };
}

const errorText = (error: unknown): string => {
  try { return cleanModelText(error instanceof Error ? error.message : String(error)).slice(0, 120); } catch { return "ismeretlen hiba"; }
};

/**
 * A modell leltárának determinisztikus megítélése, tételenként: séma, létező forrásfájl és oldal, egyedi azonosító, korlátok. A nem
 * létező fogalom-hivatkozás törlődik (a tétel marad). `verified`: a tétel szövegének szóegyezése az oldal kinyert szövegével.
 */
export function sanitizeSourceVisuals(raw: unknown, ctx: SourceVisualContext): SourceVisualsResult {
  const visuals: SourceVisual[] = [];
  const dropped: DroppedSourceVisual[] = [];
  const removedConceptRefs: SourceVisualsResult["removedConceptRefs"] = [];
  const truncatedCells: SourceVisualsResult["truncatedCells"] = [];
  const seen = new Set<string>();
  let chars = 0;
  // A függvény SOHA nem dob (review J3, U2): a védelmi határ a bejárást (hossz, elem olvasása) és az azonosító olvasását is fedi —
  // dobó getter vagy Proxy is csak az adott tételt (a hossz olvasásának hibája a teljes listát) hagyja ki.
  let length = 0;
  try { length = Array.isArray(raw) ? raw.length : 0; } catch (error) { dropped.push({ reason: `váratlan hiba a bejárásban: ${errorText(error)}` }); }
  for (let index = 0; index < length; index++) {
    let id: string | undefined;
    const drop = (reason: string) => { dropped.push({ ...(id ? { id } : {}), reason }); };
    try {
    const entry: unknown = (raw as unknown[])[index];
    const rawId = (entry as { id?: unknown } | null)?.id;
    id = typeof rawId === "string" ? cleanModelText(rawId).slice(0, 40) : undefined;
    if (nestingExceeds(entry, SOURCE_VISUAL_MAX_NESTING)) { drop("hibás alak: túl mély beágyazás"); continue; }
    // Egyetlen forrásfájlnál a fájlnév egyértelmű (mint a fogalmaknál): a hiányzó `sourceFile` azt jelenti.
    // A `verified` mezőt a program tölti: a modell értéke eldobódik.
    const { verified: _model, ...cleaned } = entry && typeof entry === "object" && !Array.isArray(entry) ? cleanEntry(entry) : {} as Record<string, unknown>;
    const { fields, clipped } = clipTableTexts(cleaned);
    const candidate = ctx.fileNames.length === 1 && fields.sourceFile === undefined ? { ...fields, sourceFile: ctx.fileNames[0] } : fields;
    const parsed = sourceVisualSchema.safeParse(candidate);
    if (!parsed.success) { drop(`hibás alak: ${parsed.error.issues.slice(0, 2).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ").slice(0, 200)}`); continue; }
    const v = parsed.data;
    if (!ctx.fileNames.includes(v.sourceFile)) { drop(`nem létező forrásfájl: ${v.sourceFile.slice(0, 80)}`); continue; }
    if (seen.has(v.id)) { drop("ismétlődő azonosító"); continue; }
    const lastPage = ctx.pageCounts?.[v.sourceFile] ?? 0;
    if (lastPage > 0 && v.page > lastPage) { drop(`nem létező oldal: ${v.page} (a fájl ${lastPage} oldalas)`); continue; }
    if (visuals.length >= SOURCE_VISUAL_LIMITS.maxItems) { drop(`a leltár legfeljebb ${SOURCE_VISUAL_LIMITS.maxItems} tétel`); continue; }
    const size = JSON.stringify(v).length;
    if (chars + size > SOURCE_VISUAL_LIMITS.maxChars) { drop(`a leltár legfeljebb ${SOURCE_VISUAL_LIMITS.maxChars} karakter`); continue; }
    const pageText = ctx.pageTexts?.[v.sourceFile]?.[v.page];
    const words = sourceVisualTexts(v).flatMap(wordsOf);
    const onPage = pageText ? new Set(wordsOf(pageText)) : null;
    const share = onPage && words.length ? words.filter((w) => onPage.has(w)).length / words.length : 0;
    seen.add(v.id); chars += size;
    const unknownRefs = v.conceptIds.filter((c) => !ctx.conceptIds.has(c));
    if (unknownRefs.length) removedConceptRefs.push({ id: v.id, conceptIds: unknownRefs.map((c) => c.slice(0, 40)) });
    if (clipped) truncatedCells.push({ id: v.id, cells: clipped });
    visuals.push({ ...v, conceptIds: v.conceptIds.filter((c) => ctx.conceptIds.has(c)), verified: share >= SOURCE_VISUAL_TEXT_SHARE ? "text" : "visual-only" });
    } catch (error) { drop(`váratlan hiba: ${errorText(error)}`); }
  }
  return { visuals, dropped, removedConceptRefs, truncatedCells };
}

/** A térkép `source_files` jsonb elemeiből a leltár egy listában (betöltés; hiányzó vagy hibás kulcs → nincs tétel). */
export function visualsOfSourceFiles(sourceFiles: unknown): SourceVisual[] {
  return (Array.isArray(sourceFiles) ? sourceFiles : []).flatMap((file) => {
    const list = (file as { visuals?: unknown } | null)?.visuals;
    return Array.isArray(list) ? list.flatMap((v) => { const p = sourceVisualSchema.safeParse(v); return p.success ? [p.data] : []; }) : [];
  });
}
