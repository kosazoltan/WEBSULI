import test from "node:test";
import assert from "node:assert/strict";
import { cleanModelText, sanitizeSourceVisuals, SOURCE_VISUAL_KINDS, SOURCE_VISUAL_LIMITS, SOURCE_VISUAL_MAX_PAGE, SOURCE_VISUAL_TABLE, SOURCE_VISUALS_CONTRACT, sourceVisualSchema, sourceVisualTexts, splitPageTexts, visualsOfSourceFiles, type SourceDecisionNode, type SourceVisualKind } from "../shared/source-visuals";
import { sourceFileSchema } from "../shared/knowledge-map-schema";

/* docs/specs/2026-11-18-tananyag-gyartas-minoseg.md, S1a: a forrás vizuális leltárát séma és szabály ítéli meg; a hibás tétel kimarad. */

const base = { sourceFile: "lap.pdf", page: 1, role: "A mennyiségi kérdőszavak összevetése.", conceptIds: ["much"] };
const ctx = { fileNames: ["lap.pdf"], conceptIds: new Set(["much", "many"]) };
/** `depth` szint mély fa (a gyökér az 1. szint). */
const chain = (depth: number): SourceDecisionNode => (depth <= 1 ? { text: "levél" } : { text: `kérdés ${depth}`, branches: [{ label: "igen", node: chain(depth - 1) }] });

const VALID: Record<SourceVisualKind, unknown> = {
  table: { headers: ["megszámlálható", "megszámlálhatatlan"], rows: [["how many", "how much"], ["apples", ""]], headerTones: ["a", "b"] },
  process: { steps: ["Nézd meg a főnevet.", "Döntsd el, megszámlálható-e."] },
  decisionTree: { root: { text: "Megszámlálható?", branches: [{ label: "igen", node: { text: "how many" } }, { label: "nem", node: { text: "how much" } }] } },
  ruleBox: { tone: "rule", heading: "Szabály", items: ["A how many után többes szám áll."] },
  pictureCard: { cards: [{ label: "milk", depicts: "egy pohár tej", example: "How much milk?" }] },
  colorCode: { entries: [{ color: "zöld", tone: "a", meaning: "megszámlálható" }, { color: "narancs", tone: "b", meaning: "megszámlálhatatlan" }] },
  exercise: { instruction: "Egészítsd ki a kérdést!", items: ["___ apples are there?"], answerKey: ["How many"], pictures: ["három alma egy tálban"] },
  diagram: { description: "Tölcsér, amelybe a főnevek esnek.", parts: [{ label: "felső rész", meaning: "minden főnév" }] },
};
const INVALID: Record<SourceVisualKind, unknown> = {
  table: { headers: [], rows: [["a"]] },
  process: { steps: ["csak egy lépés"] },
  decisionTree: { root: { text: "Öt ág?", branches: [1, 2, 3, 4, 5].map((n) => ({ label: `ág ${n}`, node: { text: "levél" } })) } },
  ruleBox: { tone: "piros", items: ["Szabály."] },
  pictureCard: { cards: [{ label: "milk" }] },
  colorCode: { entries: [{ color: "zöld", tone: "a", meaning: "megszámlálható" }] },
  exercise: { items: ["utasítás nélkül"] },
  diagram: { description: "", parts: [] },
};

test("fajtánként az érvényes tétel megmarad, az érvénytelen okkal kimarad", () => {
  for (const [i, kind] of SOURCE_VISUAL_KINDS.entries()) {
    const good = sanitizeSourceVisuals([{ ...base, id: `v${i}`, kind, data: VALID[kind] }], ctx);
    assert.deepEqual(good.dropped, [], kind);
    assert.equal(good.visuals[0]?.kind, kind);
    const bad = sanitizeSourceVisuals([{ ...base, id: `v${i}`, kind, data: INVALID[kind] }], ctx);
    assert.equal(bad.visuals.length, 0, `${kind}: az érvénytelen adat nem maradhat`);
    assert.equal(bad.dropped[0].id, `v${i}`);
    assert.match(bad.dropped[0].reason, /^hibás alak: data/, kind);
  }
  assert.deepEqual(sanitizeSourceVisuals("nem tömb", ctx), { visuals: [], dropped: [], removedConceptRefs: [] });
  assert.match(sanitizeSourceVisuals(["szöveg"], ctx).dropped[0].reason, /hibás alak/);
});

test("mutáció: nem létező fájl, nem létező oldal, ismétlődő azonosító, hibás közös mező → kimarad a megnevezett okkal", () => {
  const item = { ...base, id: "v1", kind: "process", data: VALID.process };
  const pageTexts = { "lap.pdf": { 1: "első", 2: "második" } };
  const pageCounts = { "lap.pdf": 2 };
  assert.match(sanitizeSourceVisuals([{ ...item, sourceFile: "masik.pdf" }], ctx).dropped[0].reason, /^nem létező forrásfájl: masik\.pdf/);
  assert.match(sanitizeSourceVisuals([{ ...item, page: 3 }], { ...ctx, pageTexts, pageCounts }).dropped[0].reason, /^nem létező oldal: 3/);
  assert.equal(sanitizeSourceVisuals([{ ...item, page: 2 }], { ...ctx, pageTexts, pageCounts }).visuals.length, 1);
  // Review J1: jelölő csak az 1–2. oldalon, a tényleges oldalszám NEM ismert → a 3. oldali tétel megmarad (visual-only), nincs felső határ.
  const kept = sanitizeSourceVisuals([{ ...item, page: 3 }], { ...ctx, pageTexts });
  assert.deepEqual([kept.visuals.length, kept.visuals[0]?.verified, kept.dropped.length], [1, "visual-only", 0]);
  assert.equal(sanitizeSourceVisuals([{ ...item, page: SOURCE_VISUAL_MAX_PAGE }], ctx).visuals.length, 1, "a józan plafonig érvényes");
  assert.match(sanitizeSourceVisuals([{ ...item, page: SOURCE_VISUAL_MAX_PAGE + 1 }], ctx).dropped[0].reason, /hibás alak: page/);
  assert.match(sanitizeSourceVisuals([{ ...item, page: 0 }], ctx).dropped[0].reason, /hibás alak: page/);
  assert.match(sanitizeSourceVisuals([{ ...item, kind: "poster" }], ctx).dropped[0].reason, /hibás alak: kind/);
  assert.match(sanitizeSourceVisuals([{ ...item, id: "túl hosszú azonosító" }], ctx).dropped[0].reason, /hibás alak: id/);
  const twice = sanitizeSourceVisuals([item, { ...item, data: { steps: ["a", "b", "c"] } }], ctx);
  assert.equal(twice.visuals.length, 1);
  assert.deepEqual(twice.dropped, [{ id: "v1", reason: "ismétlődő azonosító" }]);
  // Egyetlen forrásfájlnál a hiányzó fájlnév egyértelmű; több fájlnál a hiány hiba.
  const { sourceFile: _file, ...noFile } = item;
  assert.equal(sanitizeSourceVisuals([noFile], ctx).visuals[0].sourceFile, "lap.pdf");
  assert.match(sanitizeSourceVisuals([noFile], { ...ctx, fileNames: ["lap.pdf", "b.pdf"] }).dropped[0].reason, /hibás alak: sourceFile/);
});

test("a nem létező fogalom azonosítója törlődik, a tétel marad", () => {
  const { visuals, dropped, removedConceptRefs } = sanitizeSourceVisuals([{ ...base, id: "v1", kind: "ruleBox", data: VALID.ruleBox, conceptIds: ["much", "nincs-ilyen", "many", "ez-sincs"] },
    { ...base, id: "v2", kind: "process", data: VALID.process }], ctx);
  assert.deepEqual(dropped, []);
  assert.deepEqual(visuals[0].conceptIds, ["much", "many"]);
  // Review J2: a törölt hivatkozás számolható (tételenként, név szerint); a hibátlan tétel nem szerepel.
  assert.deepEqual(removedConceptRefs, [{ id: "v1", conceptIds: ["nincs-ilyen", "ez-sincs"] }]);
  assert.deepEqual(sanitizeSourceVisuals([{ ...base, id: "v2", kind: "ruleBox", data: VALID.ruleBox, conceptIds: undefined }], ctx).visuals[0].conceptIds, []);
});

test("korlátok: 61 tételből 60 marad; a karakterkeret feletti tétel kimarad", () => {
  const many = Array.from({ length: 61 }, (_, i) => ({ ...base, id: `v${i + 1}`, kind: "process", data: VALID.process }));
  const out = sanitizeSourceVisuals(many, ctx);
  assert.equal(out.visuals.length, SOURCE_VISUAL_LIMITS.maxItems);
  assert.deepEqual(out.dropped, [{ id: "v61", reason: "a leltár legfeljebb 60 tétel" }]);
  // Review J5: a sémára érvényes LEGNAGYOBB táblázat (8 × 40 cella, 100 karakteres cellák, 80 karakteres fejlécek) egyedül belefér a keretbe.
  const T = SOURCE_VISUAL_TABLE;
  const maxTable = { headers: Array.from({ length: T.columns }, () => "h".repeat(T.headerChars)), rows: Array.from({ length: T.rows }, () => Array.from({ length: T.columns }, () => "x".repeat(T.cellChars))) };
  const full = { ...base, role: "r".repeat(200), title: "t".repeat(160), conceptIds: Array.from({ length: 12 }, () => "much"), kind: "table", data: maxTable };
  const big = sanitizeSourceVisuals([{ ...full, id: "t1" }, { ...full, id: "t2" }], ctx);
  assert.deepEqual(big.visuals.map((v) => v.id), ["t1"], "a legnagyobb érvényes táblázat megmarad");
  assert.ok(JSON.stringify(big.visuals[0]).length <= SOURCE_VISUAL_LIMITS.maxChars);
  assert.deepEqual(big.dropped, [{ id: "t2", reason: "a leltár legfeljebb 40000 karakter" }], "a második már a keret fölött van");
});

test("a döntési fa 4 szintig érvényes; az 5 szint mély fa kimarad", () => {
  const tree = (depth: number) => sanitizeSourceVisuals([{ ...base, id: "v1", kind: "decisionTree", data: { root: chain(depth) } }], ctx);
  assert.equal(tree(4).visuals.length, 1);
  assert.equal(tree(5).visuals.length, 0);
  assert.match(tree(5).dropped[0].reason, /legfeljebb 4 szint/);
  // Review J3: 5 000 szint mély fa (iteratívan építve) → nincs kivétel, a tétel kimarad; a mellette álló jó tétel megmarad.
  let deep: SourceDecisionNode = { text: "levél" };
  for (let i = 0; i < 5000; i++) deep = { text: "kérdés", branches: [{ label: "igen", node: deep }] };
  const out = sanitizeSourceVisuals([{ ...base, id: "mély", kind: "decisionTree", data: { root: deep } }, { ...base, id: "v2", kind: "process", data: VALID.process }], ctx);
  assert.deepEqual(out.visuals.map((v) => v.id), ["v2"]);
  assert.deepEqual(out.dropped, [{ id: "mély", reason: "hibás alak: túl mély beágyazás" }]);
  // Váratlan hiba (dobó getter a tételben) sem jut ki: csak az a tétel marad ki.
  const hostile = Object.defineProperty({ ...base, id: "v9", kind: "process" }, "data", { enumerable: true, get() { throw new Error("bumm\nhamis sor"); } });
  const safe = sanitizeSourceVisuals([hostile, { ...base, id: "v2", kind: "process", data: VALID.process }], ctx);
  assert.deepEqual(safe.visuals.map((v) => v.id), ["v2"]);
  assert.deepEqual(safe.dropped, [{ id: "v9", reason: "váratlan hiba: bumm hamis sor" }]);
});

test("verified: szóegyezés az oldal szövegével → text; különben (vagy oldalszöveg nélkül) visual-only; a modell értéke nem számít", () => {
  const item = { ...base, id: "v1", kind: "ruleBox", page: 2, verified: "text", data: { tone: "rule", items: ["A how many után többes számú főnév áll."] } };
  const pages = (second: string) => ({ ...ctx, pageTexts: { "lap.pdf": { 1: "Bevezető oldal.", 2: second } } });
  // A tétel 7 darab 3+ betűs szava ékezet- és kisbetű-hajtogatva: 7-ből 7 egyezik.
  assert.equal(sanitizeSourceVisuals([item], pages("A HOW MANY UTAN TOBBES SZAMU FONEV ALL.")).visuals[0].verified, "text");
  // 7-ből 4 (57%) < 60%.
  assert.equal(sanitizeSourceVisuals([item], pages("how many után többes")).visuals[0].verified, "visual-only");
  // 7-ből 5 (71%) ≥ 60%.
  assert.equal(sanitizeSourceVisuals([item], pages("how many után többes számú")).visuals[0].verified, "text");
  // A szomszéd oldal szövege nem igazol.
  assert.equal(sanitizeSourceVisuals([{ ...item, page: 1 }], pages("A how many után többes számú főnév áll.")).visuals[0].verified, "visual-only");
  assert.equal(sanitizeSourceVisuals([item], ctx).visuals[0].verified, "visual-only", "oldalszöveg nélkül a modell „text” értéke eldobódik");
  // A kép leírása nem megjelenő szöveg: a kártya felirata dönt.
  const card = { ...base, id: "v2", kind: "pictureCard", data: { cards: [{ label: "milk", depicts: "tehén a réten" }] } };
  assert.equal(sanitizeSourceVisuals([card], { ...ctx, pageTexts: { "lap.pdf": { 1: "milk" } } }).visuals[0].verified, "text");
});

test("sourceVisualTexts: minden megjelenő szöveg (cím, cella, ág, pont, felirat); a képleírás és a szerep nem", () => {
  const texts = (kind: SourceVisualKind, title?: string) => sourceVisualTexts(sourceVisualSchema.parse({ ...base, id: "v1", kind, data: VALID[kind], ...(title ? { title } : {}) }));
  assert.deepEqual(texts("table", "Összevetés"), ["Összevetés", "megszámlálható", "megszámlálhatatlan", "how many", "how much", "apples"]);
  assert.deepEqual(texts("decisionTree"), ["Megszámlálható?", "igen", "how many", "nem", "how much"]);
  assert.deepEqual(texts("pictureCard"), ["milk", "How much milk?"]);
  assert.deepEqual(texts("exercise"), ["Egészítsd ki a kérdést!", "___ apples are there?", "How many"]);
  assert.deepEqual(texts("colorCode"), ["megszámlálható", "megszámlálhatatlan"]);
  assert.deepEqual(texts("diagram"), ["felső rész", "minden főnév"]);
});

test("splitPageTexts: három oldal a jelölők mentén; jelölő nélkül üres", () => {
  assert.deepEqual(splitPageTexts("[1. oldal]\nElső oldal.\n\n[2. oldal]\nMásodik\noldal.\n\n[3. oldal]\nHarmadik."), { 1: "Első oldal.", 2: "Második\noldal.", 3: "Harmadik." });
  assert.deepEqual(splitPageTexts("Sima szöveg jelölő nélkül."), {});
  // Review J6: az ismétlődő oldaljelölő szövege összefűződik (nem írja felül az elsőt).
  assert.deepEqual(splitPageTexts("[1. oldal]\nelső rész\n[2. oldal]\nmásik\n[1. oldal]\nmásodik rész"), { 1: "első rész\nmásodik rész", 2: "másik" });
});

test("mentés és betöltés: a source_files eleme hordozza a tételeket; régi térkép (kulcs nélkül) érvényes és üres leltárt ad", () => {
  const { visuals } = sanitizeSourceVisuals([{ ...base, id: "v1", kind: "table", data: VALID.table }, { ...base, id: "v2", kind: "process", data: VALID.process }], ctx);
  const files = [{ name: "lap.pdf", kind: "pdf", visuals: [visuals[0]] }, { name: "regi.txt", kind: "text" }, { name: "b.pdf", kind: "pdf", visuals: [visuals[1], { id: "hibás" }] }];
  assert.ok(sourceFileSchema.safeParse(files[0]).success);
  assert.ok(sourceFileSchema.safeParse(files[1]).success, "a régi sor visuals nélkül érvényes");
  assert.deepEqual(visualsOfSourceFiles(files).map((v) => v.id), ["v1", "v2"], "fájlsorrendben összefűzve; a hibás tárolt tétel kimarad");
  assert.deepEqual(visualsOfSourceFiles(null), []);
  assert.deepEqual(visualsOfSourceFiles([{ name: "regi.txt", kind: "text" }]), []);
});

test("a kérés szövege minden fajtát megnevez (az alak egy helyen él a sémával)", () => {
  for (const kind of SOURCE_VISUAL_KINDS) assert.ok(SOURCE_VISUALS_CONTRACT.includes(`- ${kind}: `), kind);
  assert.match(SOURCE_VISUALS_CONTRACT, /"visuals": \[\]/);
});

test("review J6: a felső korlátok a határon érvényesek, eggyel fölötte a tétel kimarad", () => {
  const T = SOURCE_VISUAL_TABLE;
  const one = (patch: Record<string, unknown>) => sanitizeSourceVisuals([{ ...base, id: "v1", kind: "table", data: VALID.table, ...patch }], ctx);
  const rows = (n: number) => ({ data: { headers: ["a"], rows: Array.from({ length: n }, () => ["x"]) } });
  const cell = (n: number) => ({ data: { headers: ["a"], rows: [["x".repeat(n)]] } });
  const cols = (n: number) => ({ data: { headers: ["a"], rows: [Array.from({ length: n }, () => "x")] } });
  const refs = (n: number) => ({ conceptIds: Array.from({ length: n }, () => "much") });
  const cases: Array<[string, (n: number) => Record<string, unknown>, number, RegExp]> = [
    ["sor", rows, T.rows, /data\.rows/], ["cella", cell, T.cellChars, /data\.rows\.0\.0/], ["oszlop", cols, T.columns, /data\.rows\.0/],
    ["role", (n) => ({ role: "r".repeat(n) }), 200, /role/], ["conceptIds", refs, 12, /conceptIds/], ["title", (n) => ({ title: "t".repeat(n) }), 160, /title/],
  ];
  for (const [name, make, limit, path] of cases) {
    assert.equal(one(make(limit)).visuals.length, 1, `${name}: ${limit} még érvényes`);
    const over = one(make(limit + 1));
    assert.equal(over.visuals.length, 0, `${name}: ${limit + 1} már nem`);
    assert.match(over.dropped[0].reason, path, name);
  }
});

test("review J6: a szóegyezés csak a 3+ betűs szavakat számolja (a 2 betűs szó sem a számlálóban, sem a nevezőben nincs)", () => {
  const item = (text: string) => ({ ...base, id: "v1", kind: "ruleBox", data: { tone: "tip", items: [text] } });
  const on = (text: string, page: string) => sanitizeSourceVisuals([item(text)], { ...ctx, pageTexts: { "lap.pdf": { 1: page } } }).visuals[0].verified;
  // „ab cd ef gh" nem számít: 1 számolt szóból 1 egyezik → text (2 betűs küszöbbel 5-ből 1 = 20% lenne).
  assert.equal(on("ab cd ef gh xyz", "xyz"), "text");
  // A 3 betűs szó már számít: 2 számolt szóból 1 (50%) → visual-only (4 betűs küszöbbel 1-ből 1 = text lenne).
  assert.equal(on("abc wxyz", "wxyz"), "visual-only");
  // Számolható szó nélkül nincs igazolás.
  assert.equal(on("ab cd", "ab cd"), "visual-only");
});

test("review J7: a modell szövege tisztítva kerül a naplóba és a tárolt tételbe (vezérlőkarakter, NUL, magányos helyettesítő)", () => {
  assert.equal(cleanModelText("a\nb\u0000c\ud83ed\r\n\te"), "a b c d e");
  assert.equal(cleanModelText("ép emoji 🙂 és ékezet: őű"), "ép emoji 🙂 és ékezet: őű");
  const forged = sanitizeSourceVisuals([{ ...base, id: "v1\n[HAMIS NAPLÓSOR] " + "x".repeat(80), kind: "process", data: VALID.process }], ctx);
  assert.equal(forged.dropped[0].id, ("v1 [HAMIS NAPLÓSOR] " + "x".repeat(80)).slice(0, 40), "sortörés nélkül, 40 karakterre vágva");
  assert.ok(!/[\n\r]/.test(forged.dropped[0].id! + forged.dropped[0].reason), "a naplóba menő azonosítóban és okban nincs sortörés");
  const stored = sanitizeSourceVisuals([{ ...base, id: "v1", kind: "ruleBox", role: "szerep\u0000\nmásodik sor", data: { tone: "rule", items: ["pont\ud83e vége", "<script>x</script>"] } }], ctx).visuals[0];
  assert.equal(stored.role, "szerep második sor");
  assert.deepEqual(sourceVisualTexts(stored), ["pont  vége", "<script>x</script>"], "a HTML-kódolás a megjelenítő dolga (S2) — a szöveg változatlan");
  assert.ok(!/[\p{Cc}\p{Cs}]/u.test(stored.role + sourceVisualTexts(stored).join("")));
});
