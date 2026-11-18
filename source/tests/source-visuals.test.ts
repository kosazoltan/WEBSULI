import test from "node:test";
import assert from "node:assert/strict";
import { cleanModelMultilineText, cleanModelText, sanitizeSourceVisuals, SOURCE_VISUAL_KINDS, SOURCE_VISUAL_LIMITS, SOURCE_VISUAL_MAX_PAGE, SOURCE_VISUAL_TABLE, SOURCE_VISUALS_CONTRACT, sourceVisualSchema, sourceVisualTexts, splitPageTexts, visualsOfSourceFiles, type SourceDecisionNode, type SourceVisualKind } from "../shared/source-visuals";
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
  assert.deepEqual(sanitizeSourceVisuals("nem tömb", ctx), { visuals: [], dropped: [], removedConceptRefs: [], truncatedCells: [] });
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
  // Review (S1a, túlélő mutáns): a határ RÖGZÍTETT szám a tesztben — az állandó elállítását a teszt megfogja.
  assert.equal(sanitizeSourceVisuals([{ ...item, page: 2000 }], ctx).visuals.length, 1, "a józan plafonig (2000) érvényes");
  assert.match(sanitizeSourceVisuals([{ ...item, page: 2001 }], ctx).dropped[0].reason, /hibás alak: page/);
  assert.equal(SOURCE_VISUAL_MAX_PAGE, 2000);
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
  const maxTable = { headers: Array.from({ length: 8 }, () => "h".repeat(80)), rows: Array.from({ length: 40 }, () => Array.from({ length: 8 }, () => "x".repeat(100))) };
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
  // Review (S1a, túlélő mutánsok): a határok RÖGZÍTETT számok — nem abból az állandóból számolnak, amelyet ellenőriznek.
  assert.deepEqual(SOURCE_VISUAL_TABLE, { columns: 8, rows: 40, cellChars: 100, headerChars: 80 });
  const one = (patch: Record<string, unknown>) => sanitizeSourceVisuals([{ ...base, id: "v1", kind: "table", data: VALID.table, ...patch }], ctx);
  const rows = (n: number) => ({ data: { headers: ["a"], rows: Array.from({ length: n }, () => ["x"]) } });
  const cols = (n: number) => ({ data: { headers: ["a"], rows: [Array.from({ length: n }, () => "x")] } });
  const refs = (n: number) => ({ conceptIds: Array.from({ length: n }, () => "much") });
  const cases: Array<[string, (n: number) => Record<string, unknown>, number, RegExp]> = [
    ["sor", rows, 40, /data\.rows/], ["oszlop", cols, 8, /data\.rows\.0/],
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

test("review U1: a túl hosszú cella (és fejléc) csonkolódik „…” jelöléssel és megszámolódik — a táblázat megmarad", () => {
  const table = (cell: string, header = "a") => sanitizeSourceVisuals([{ ...base, id: "v1", kind: "table", data: { headers: [header, "b"], rows: [[cell, "rövid"], ["másik", ""]] } }], ctx);
  const cellOf = (out: ReturnType<typeof table>) => (out.visuals[0] as { data: { headers: string[]; rows: string[][] } }).data;
  // A határon (100 karakter) a cella változatlan, csonkolás nincs.
  const exact = table("x".repeat(100));
  assert.deepEqual([exact.visuals.length, exact.truncatedCells.length, cellOf(exact).rows[0][0].length], [1, 0, 100]);
  // Eggyel fölötte: a táblázat MARAD, a cella 100 karakter, a vége „…”, a többi cella érintetlen.
  const over = table("x".repeat(101));
  assert.deepEqual(over.dropped, []);
  assert.equal(cellOf(over).rows[0][0], "x".repeat(99) + "…");
  assert.deepEqual(cellOf(over).rows, [["x".repeat(99) + "…", "rövid"], ["másik", ""]]);
  assert.deepEqual(over.truncatedCells, [{ id: "v1", cells: 1 }]);
  // Nagyon hosszú cella és 81 karakteres fejléc együtt: két csonkolás, a fejléc 80 karakter.
  const both = table("szó ".repeat(400), "h".repeat(81));
  assert.equal(both.visuals.length, 1);
  assert.deepEqual(both.truncatedCells, [{ id: "v1", cells: 2 }]);
  assert.deepEqual([cellOf(both).headers[0].length, cellOf(both).rows[0][0].length <= 100, cellOf(both).rows[0][0].endsWith("…")], [80, true, true]);
  // A csonkolás nem hagy fél helyettesítő-párt (az emoji a vágás helyén kimarad).
  const emoji = table("x".repeat(98) + "🙂🙂");
  assert.ok(!/[\p{Cs}]/u.test(cellOf(emoji).rows[0][0].replace(/\p{Extended_Pictographic}/gu, "")));
  assert.equal(cellOf(emoji).rows[0][0], "x".repeat(98) + "…");
  // Mutáció: más alakhibát a csonkolás nem takar el — a 41 soros táblázat ugyanúgy kimarad, és nem számolódik csonkoltnak.
  const tooMany = sanitizeSourceVisuals([{ ...base, id: "v1", kind: "table", data: { headers: ["a"], rows: Array.from({ length: 41 }, () => ["x".repeat(101)]) } }], ctx);
  assert.deepEqual([tooMany.visuals.length, tooMany.truncatedCells.length], [0, 0]);
  // Más fajtánál nincs csonkolás: a 201 karakteres lépés alakhiba marad.
  assert.equal(sanitizeSourceVisuals([{ ...base, id: "v1", kind: "process", data: { steps: ["a", "b".repeat(201)] } }], ctx).visuals.length, 0);
});

test("review U2: a védelmi határ az azonosító olvasását és a bejárást is fedi — dobó getter és Proxy sem ad kivételt", () => {
  const good = { ...base, id: "v2", kind: "process", data: VALID.process };
  // Dobó `id` getter: csak az a tétel marad ki (azonosító nélkül), a szomszéd megmarad.
  const hostileId = Object.defineProperty({ ...base, kind: "process", data: VALID.process }, "id", { enumerable: true, get() { throw new Error("id-bumm"); } });
  const a = sanitizeSourceVisuals([hostileId, good], ctx);
  assert.deepEqual(a.visuals.map((v) => v.id), ["v2"]);
  assert.deepEqual(a.dropped, [{ reason: "váratlan hiba: id-bumm" }]);
  // Proxy-tétel, amelynek MINDEN olvasása dob.
  const hostileItem = new Proxy({}, { get() { throw new Error("proxy-bumm"); }, ownKeys() { throw new Error("proxy-bumm"); } });
  const b = sanitizeSourceVisuals([good, hostileItem], ctx);
  assert.deepEqual([b.visuals.map((v) => v.id), b.dropped.length], [["v2"], 1]);
  assert.match(b.dropped[0].reason, /^váratlan hiba: proxy-bumm/);
  // Proxy-tömb, amelynek az 1. eleme olvasáskor dob: a bejárás folytatódik, a többi tétel megmarad.
  const hostileList = new Proxy([good, good, { ...good, id: "v3" }], { get(target, key, receiver) { if (key === "1") throw new Error("elem-bumm"); return Reflect.get(target, key, receiver); } });
  const c = sanitizeSourceVisuals(hostileList, ctx);
  assert.deepEqual(c.visuals.map((v) => v.id), ["v2", "v3"]);
  assert.deepEqual(c.dropped, [{ reason: "váratlan hiba: elem-bumm" }]);
  // Proxy-tömb, amelynek a hossza sem olvasható: üres leltár, megnevezett okkal — kivétel nélkül.
  const noLength = new Proxy([good], { get(target, key, receiver) { if (key === "length") throw new Error("hossz-bumm"); return Reflect.get(target, key, receiver); } });
  const d = sanitizeSourceVisuals(noLength, ctx);
  assert.deepEqual(d.visuals, []);
  assert.deepEqual(d.dropped, [{ reason: "váratlan hiba a bejárásban: hossz-bumm" }]);
  // A hiba üzenetének olvasása is dobhat: az ok ekkor is egysoros, rögzített szöveg.
  const hostileError = Object.defineProperty({ ...base, id: "v9", kind: "process" }, "data", { enumerable: true, get() { throw Object.defineProperty(new Error("x"), "message", { get() { throw new Error("üzenet-bumm"); } }); } });
  assert.deepEqual(sanitizeSourceVisuals([hostileError], ctx).dropped, [{ id: "v9", reason: "váratlan hiba: ismeretlen hiba" }]);
});

test("review U4: a többsoros forrásszöveg sortörése megmarad, ahol a tartalom része; táblázatcellában és a közös mezőkben szóköz", () => {
  assert.equal(cleanModelMultilineText("első sor\r\nmásodik\rharmadik\u0000vége\n\n\n\núj szakasz \n\tbehúzva\ud83e"), "első sor\nmásodik\nharmadik vége\n\núj szakasz\nbehúzva ");
  const verse = "Roses are red,\r\nViolets are blue,\nSugar is sweet.";
  const kept = (kind: SourceVisualKind, data: unknown) => sourceVisualTexts(sanitizeSourceVisuals([{ ...base, id: "v1", kind, data }], ctx).visuals[0]);
  // Vers a feladat utasításában, párbeszéd a feladat tételében, példamondat-lista a szabálydoboz pontjában és a kártya példájában.
  assert.deepEqual(kept("exercise", { instruction: verse, items: ["– How much milk?\n– Two glasses."] }), ["Roses are red,\nViolets are blue,\nSugar is sweet.", "– How much milk?\n– Two glasses."]);
  assert.deepEqual(kept("ruleBox", { tone: "tip", items: ["How many apples?\nHow many pears?"] }), ["How many apples?\nHow many pears?"]);
  assert.deepEqual(kept("pictureCard", { cards: [{ label: "milk", depicts: "egy pohár\ntej", example: "How much milk?\nNot much." }] }), ["milk", "How much milk?\nNot much."]);
  assert.deepEqual(kept("process", { steps: ["Olvasd el:\nA cat sat.", "Mondd ki."] }), ["Olvasd el:\nA cat sat.", "Mondd ki."]);
  // Táblázatcellában és fejlécben a sortörés szóköz (a cella egysoros adat).
  assert.deepEqual(kept("table", { headers: ["egy\nfejléc"], rows: [["két\nsor", "x\r\ny"]] }), ["egy fejléc", "két sor", "x y"]);
  // A közös mezők (cím, szerep, azonosító) egysorosak maradnak; a többsoros szövegben sincs más vezérlőkarakter.
  const item = sanitizeSourceVisuals([{ ...base, id: "v1", kind: "ruleBox", title: "Cím\nmásodik sor", role: "szerep\nfolytatás", data: { tone: "rule", items: ["a\u0000b\nc\u0007d"] } }], ctx).visuals[0];
  assert.deepEqual([item.title, item.role, sourceVisualTexts(item)], ["Cím második sor", "szerep folytatás", ["Cím második sor", "a b\nc d"]]);
  assert.ok(!/[^\P{Cc}\n]|\p{Cs}/u.test(JSON.parse(JSON.stringify(item.data)).items.join("")));
  // Mutáció: a csak sortörésből álló szöveg üres marad (alakhiba), nem lesz belőle tartalom.
  assert.equal(sanitizeSourceVisuals([{ ...base, id: "v1", kind: "ruleBox", data: { tone: "rule", items: ["\n\n"] } }], ctx).visuals.length, 0);
});

test("review F15: a sorelválasztó (U+2028 / U+2029) sortörésként, a kétirányú vezérlőkarakterek eltávolítva", () => {
  const LS = String.fromCharCode(0x2028), PS = String.fromCharCode(0x2029);
  const bidi = [0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069].map((c) => String.fromCharCode(c));
  // Egysoros szöveg (napló, cím, szerep, táblázatcella): a sorelválasztó szóköz — a JSON-sorba nem kerül nyers sorvég.
  assert.equal(cleanModelText(`első${LS}második${PS}harmadik`), "első második harmadik");
  assert.equal(cleanModelText(`ár: ${bidi.join("")}100 Ft`), "ár: 100 Ft");
  // Többsoros tartalom: a sorelválasztó valódi sortörés.
  assert.equal(cleanModelMultilineText(`első${LS}második${PS}${PS}${PS}harmadik${bidi[6]}`), "első\nmásodik\n\nharmadik");
  const item = sanitizeSourceVisuals([{ ...base, id: "v1", kind: "ruleBox", title: `Cím${LS}alcím`, role: `szerep${bidi[6]}`, data: { tone: "rule", items: [`sor 1${LS}sor 2${bidi[4]}`] } },
    { ...base, id: "v2", kind: "table", data: { headers: [`fej${PS}léc`], rows: [[`cel${LS}la${bidi[0]}`]] } }], ctx).visuals;
  assert.deepEqual([item[0].title, item[0].role, sourceVisualTexts(item[0]), sourceVisualTexts(item[1])], ["Cím alcím", "szerep", ["Cím alcím", "sor 1\nsor 2"], ["fej léc", "cel la"]]);
  const stored = JSON.stringify(item);
  for (const ch of [LS, PS, ...bidi]) assert.ok(!stored.includes(ch), `U+${ch.charCodeAt(0).toString(16)} nem maradhat a tárolt tételben`);
  // Ellenpróba: a nem vezérlő, ritka karakterek (ékezet, emoji, nulla szélességű kötő az emojiban) érintetlenek.
  assert.equal(cleanModelText("árvíztűrő 🙂 – „idézet”"), "árvíztűrő 🙂 – „idézet”");
});
