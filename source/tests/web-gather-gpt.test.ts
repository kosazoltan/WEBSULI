import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkFetchUrl, fetchPublicPage, htmlToText, isPublicAddress, type RawRequest, type RawResponse } from "../server/studio/safe-fetch";
import { candidateUrls, enrichWithVisuals, fitVisualBudget, GATHER_VISUAL_BUDGET, gatherWebSourcesGpt, usableSource } from "../server/studio/web-gather-gpt";

/*
 * Spec 2026-10-15-tartalek-b4-webgyujtes (tulajdonosi döntés): a webes forrásgyűjtés GPT-6.1 Sol tartaléka — a GPT keres, a
 * szerver VÉDETTEN tölti le az oldalakat (SSRF: nem nyilvános cím sem közvetlenül, sem DNS-en, sem átirányításon át).
 */

test("isPublicAddress: nyilvános IPv4/IPv6 igen; privát, loopback, link-local, CGNAT, multicast, dokumentációs, leképezett nem", () => {
  for (const ip of ["8.8.8.8", "185.199.108.153", "2a00:1450:4001:82a::200e"]) assert.equal(isPublicAddress(ip), true, ip);
  for (const ip of ["10.0.0.1", "127.0.0.1", "169.254.169.254", "100.64.1.1", "192.168.1.1", "172.20.0.1", "0.0.0.0", "224.0.0.1",
    "198.18.0.1", "203.0.113.5", "::1", "::", "fe80::1", "fc00::1", "fd12:3456::1", "ff02::1", "2001:db8::1",
    "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:10.0.0.1", "64:ff9b::7f00:1", "nem-ip"]) {
    assert.equal(isPublicAddress(ip), false, ip);
  }
});

test("checkFetchUrl: csak https, alapértelmezett port, hitelesítő adat és belső gépnév nélkül", () => {
  assert.equal(checkFetchUrl("https://www.nkp.hu/tankonyv").hostname, "www.nkp.hu");
  for (const bad of ["http://www.nkp.hu/", "https://www.nkp.hu:8443/", "https://u:p@www.nkp.hu/", "https://localhost/", "https://db.internal/",
    "https://10.0.0.1/", "https://[::1]/", "ftp://example.org/", "nem url"]) {
    assert.throws(() => checkFetchUrl(bad), Error, bad);
  }
});

function response(status: number, headers: Record<string, string>, body: string | Uint8Array = ""): RawResponse {
  const bytes = typeof body === "string" ? new TextEncoder().encode(body) : body;
  return { status, headers, body: (async function* () { yield bytes; })(), destroy: () => undefined };
}
const publicLookup = async () => [{ address: "93.184.216.34", family: 4 }];

test("fetchPublicPage: privát címre oldódó gépnév → elutasítva, kérés nélkül", async () => {
  let requests = 0;
  const request: RawRequest = async () => { requests++; return response(200, { "content-type": "text/html" }, "<p>x</p>"); };
  await assert.rejects(fetchPublicPage("https://belso.example.org/", { lookup: async () => [{ address: "10.1.2.3", family: 4 }], request }), /Nem nyilvános/);
  await assert.rejects(fetchPublicPage("https://vegyes.example.org/", { lookup: async () => [{ address: "93.184.216.34", family: 4 }, { address: "127.0.0.1", family: 4 }], request }), /Nem nyilvános/);
  assert.equal(requests, 0);
});

test("fetchPublicPage: az átirányítás célja is ellenőrzött (http vagy privát cím → elutasítva); a kapcsolat az ellenőrzött címre megy", async () => {
  const seen: string[] = [];
  const request: RawRequest = async (url, address) => {
    seen.push(`${url.hostname}@${address.address}`);
    if (url.pathname === "/http") return response(302, { location: "http://www.nkp.hu/" });
    if (url.pathname === "/privat") return response(301, { location: "https://belso.example.org/" });
    return response(200, { "content-type": "text/html" }, "<p>x</p>");
  };
  const lookup = async (host: string) => host === "belso.example.org" ? [{ address: "192.168.0.10", family: 4 }] : publicLookup();
  await assert.rejects(fetchPublicPage("https://www.nkp.hu/http", { lookup, request }), /Csak https/);
  await assert.rejects(fetchPublicPage("https://www.nkp.hu/privat", { lookup, request }), /Nem nyilvános/);
  assert.deepEqual(seen, ["www.nkp.hu@93.184.216.34", "www.nkp.hu@93.184.216.34"]);
});

test("fetchPublicPage: nem szöveges tartalom és túl nagy oldal elutasítva; iso-8859-2 helyesen dekódolva", async () => {
  await assert.rejects(fetchPublicPage("https://www.nkp.hu/kep", { lookup: publicLookup, request: async () => response(200, { "content-type": "image/png" }, "x") }), /Nem szöveges/);
  await assert.rejects(fetchPublicPage("https://www.nkp.hu/nagy", { lookup: publicLookup, maxBytes: 10, request: async () => response(200, { "content-type": "text/html" }, "<p>tizenegynél hosszabb</p>") }), /Túl nagy/);
  const latin2 = new Uint8Array([...new TextEncoder().encode("<title>T"), 0xf5, ...new TextEncoder().encode("rt</title><p>Sz"), 0xe1, ...new TextEncoder().encode("ml"), 0xe1, ...new TextEncoder().encode("l"), 0xf3, ...new TextEncoder().encode("</p>")]);
  const page = await fetchPublicPage("https://www.nkp.hu/tort", { lookup: publicLookup, request: async () => response(200, { "content-type": "text/html; charset=iso-8859-2" }, latin2) });
  assert.equal(page.title, "Tőrt");
  assert.equal(page.text, "Számláló");
});

test("htmlToText: script/stílus kihagyva, blokkhatáron sortörés, cím külön", () => {
  const { title, text } = htmlToText("<html><head><title> Törtek </title><style>p{}</style><script>alert(1)</script></head><body><h1>A tört</h1><p>A számláló   felül van.</p><noscript>JS kell</noscript></body></html>");
  assert.equal(title, "Törtek");
  assert.equal(text, "A tört\n\nA számláló felül van.");
});

test("candidateUrls: előbb a hivatkozások, utána a források; https, egyedi, utm és horgony nélkül, legfeljebb 12", () => {
  const urls = candidateUrls([
    { type: "web_search_call", action: { sources: [{ url: "https://b.hu/x?utm_source=g" }, { url: "http://c.hu/" }, { url: "https://a.hu/1#r" }] } },
    { type: "message", content: [{ annotations: [{ type: "url_citation", url: "https://a.hu/1" }, { type: "url_citation", url: "https://d.hu/" }] }] },
  ]);
  assert.deepEqual(urls, ["https://a.hu/1", "https://d.hu/", "https://b.hu/x"]);
  const many = candidateUrls([{ action: { sources: Array.from({ length: 30 }, (_, i) => ({ url: `https://s${i}.hu/` })) } }]);
  assert.equal(many.length, 12);
});

test("gatherWebSourcesGpt: a keresés URL-jeiből a Claude-úttal azonos szabályú források (rövid és hibaoldal kiesik), legfeljebb 8", async () => {
  const long = "A törtek összeadásakor a nevezőket közös nevezőre hozzuk, majd a számlálókat összeadjuk. ".repeat(3);
  const searches: Array<{ model: string }> = [];
  const sources = await gatherWebSourcesGpt({ message: "törtek összeadása", classroom: 5 } as never, {
    model: "gpt-6.1-sol",
    search: async (req) => { searches.push({ model: req.model }); return { output: [{ action: { sources: Array.from({ length: 12 }, (_, i) => ({ url: `https://s${i}.hu/` })) } }], usage: { input_tokens: 10, output_tokens: 2 } }; },
    download: async (url) => {
      if (url === "https://s0.hu/") throw new Error("HTTP 500");
      if (url === "https://s1.hu/") return { url, title: "rövid", text: "kevés" };
      if (url === "https://s2.hu/") return { url, title: "403 Forbidden", text: long };
      return { url, title: `Oldal ${url}`, text: long };
    },
  });
  assert.equal(searches[0].model, "gpt-6.1-sol");
  assert.equal(sources.length, 8);
  assert.ok(sources.every((s) => !["https://s0.hu/", "https://s1.hu/", "https://s2.hu/"].includes(s.url)));
  assert.equal(usableSource({ url: "https://x.hu/", title: "", text: long })?.title, "https://x.hu/");
  await assert.rejects(gatherWebSourcesGpt({ message: "t", classroom: 5 } as never, {
    model: "gpt-6.1-sol", search: async () => ({ output: [{ action: { sources: [{ url: "https://s.hu/" }] } }] }), download: async () => { throw new Error("x"); },
  }), /egy oldal sem volt letölthető/);
});

test("gatherWebSources: a Claude-gyűjtés hibájánál (külső megszakítás és kulcs nélkül nem) a GPT-6.1 Sol tartalék gyűjt", () => {
  // A Claude-gyűjtés élő SDK-útja nem mockolható hálózat nélkül — a feltételek forrás-szinten rögzítve (meglévő R1-minta).
  const src = readFileSync(new URL("../server/studio/web-research-runner.ts", import.meta.url), "utf8");
  assert.match(src, /const gathered = await gatherWebSourcesClaude\(input, observer\);/);
  // Review #593: a sikeres elsődleges gyűjtés is megkapja a vizuális kiegészítést (hibatűrően).
  assert.ok(src.includes("await enrichWithVisuals(gathered.downloaded, gathered.searched ?? [], { signal: observer.signal }).catch(() => gathered.downloaded)"));
  // Review #222: a lease-hiba (WorkflowConflict) nem indít tartalékot; a kulcs és a külső megszakítás feltétele marad.
  assert.match(src, /if \(error instanceof WorkflowConflict\) throw error;\s*if \(observer\.signal\?\.aborted \|\| !fallback \|\| !studioModelReady\(fallback\)\) throw error;/);
  assert.match(src, /if \(error instanceof WebResearchFailure \|\| error instanceof WorkflowConflict\) throw error;/, "a Claude-út nem fedi el a lease-hibát");
  assert.match(src, /gatherWebSourcesGpt\(input, \{ model: fallback, signal: observer\.signal, onEvent: observer\.onEvent \}\)/);
});

// ---------------- Review #222 ----------------
test("review #222: IPv6 — csak globális unicast; site-local, dokumentációs (3fff::/20), benchmark, Teredo, 6to4, ORCHID tiltva", () => {
  for (const ip of ["2606:4700:4700::1111", "2a00:1450:4001:82a::200e", "2001:4860:4860::8888"]) assert.equal(isPublicAddress(ip), true, ip);
  for (const ip of ["fec0::1", "3fff::1", "3fff:0fff::1", "2001:2::1", "2001::1", "2002:a00:1::1", "2001:10::1", "2001:20::1", "4000::1", "1000::1"]) {
    assert.equal(isPublicAddress(ip), false, ip);
  }
});

test("review #222: site-local címre oldódó gépnév és átirányítás is elutasítva", async () => {
  const request: RawRequest = async (url) => url.pathname === "/ugras" ? response(302, { location: "https://belso6.example.org/" }) : response(200, { "content-type": "text/html" }, "<p>x</p>");
  const lookup = async (host: string) => host.startsWith("belso6") ? [{ address: "fec0::10", family: 6 }] : [{ address: "93.184.216.34", family: 4 }];
  await assert.rejects(fetchPublicPage("https://belso6.example.org/", { lookup, request }), /Nem nyilvános/);
  await assert.rejects(fetchPublicPage("https://www.nkp.hu/ugras", { lookup, request }), /Nem nyilvános/);
});

test("review #222: abszolút határidő — lassan csepegtető törzs és lefagyó DNS is megszakad", async () => {
  const slowBody: RawResponse = {
    status: 200, headers: { "content-type": "text/html" }, destroy: () => undefined,
    body: (async function* () { for (let i = 0; i < 100; i++) { await new Promise((r) => setTimeout(r, 20)); yield new TextEncoder().encode("<p>x</p>"); } })(),
  };
  const started = Date.now();
  await assert.rejects(fetchPublicPage("https://www.nkp.hu/lassu", { timeoutMs: 150, lookup: publicLookup, request: async () => slowBody }), /Időtúllépés|abort|timeout/i);
  assert.ok(Date.now() - started < 1500, "a határidő a teljes műveletre vonatkozik");
  await assert.rejects(fetchPublicPage("https://www.nkp.hu/dns", { timeoutMs: 100, lookup: () => new Promise(() => undefined), request: async () => slowBody }), /abort|timeout|Időtúllépés/i);
});

test("review #222: a GPT-keresés az előzmény első témáját és a kéréseket kapja; a checkpoint-kulcs beszélgetésenként eltér", async () => {
  const { gptGatherRequest, gptGatherCheckpointInput } = await import("../server/studio/web-gather-gpt");
  const input = { message: "igen, készítsd el", classroom: 5, conversationHistory: [{ role: "user", content: "Törtek összeadása 5. osztály" }, { role: "assistant", content: "Rendben" }] } as never;
  const req = gptGatherRequest(input);
  assert.equal(req.topicSeed, "Törtek összeadása 5. osztály");
  assert.match(req.request, /Törtek összeadása 5\. osztály[\s\S]*igen, készítsd el/);
  const other = gptGatherCheckpointInput({ message: "igen, készítsd el", classroom: 5, conversationHistory: [{ role: "user", content: "Fotoszintézis" }] } as never, "gpt-6.1-sol");
  assert.notDeepEqual(gptGatherCheckpointInput(input, "gpt-6.1-sol"), other);
});

test("review #222: folytatáskor a mentett GPT-forrás nyer (nincs új hálózati hívás), és a futás folytatható", async (t) => {
  const { executeWorkflow, workflowPhase } = await import("../server/workflows/engine");
  const { memoryWorkflows } = await import("./helpers/workflow-store");
  const { gatherWebSources, hasSavedResearchTurn } = await import("../server/studio/web-research-runner");
  const before = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  process.env.AI_INTEGRATIONS_OPENAI_API_KEY = "test-placeholder";
  t.after(() => { if (before === undefined) delete process.env.AI_INTEGRATIONS_OPENAI_API_KEY; else process.env.AI_INTEGRATIONS_OPENAI_API_KEY = before; });
  let fetches = 0;
  t.mock.method(globalThis, "fetch", async () => { fetches++; return new Response("{}", { status: 500 }); });
  const { store } = memoryWorkflows();
  const input = { message: "törtek összeadása", classroom: 5 } as never;
  const long = "A törtek összeadásakor a nevezőket közös nevezőre hozzuk, majd a számlálókat összeadjuk. ".repeat(3);
  let result: { downloaded: Array<{ url: string }> } | undefined;
  await executeWorkflow(store, { id: "web-resume", owner: "a", mode: "web" }, async () => {
    await workflowPhase("generate");
    await gatherWebSourcesGpt(input, { model: "gpt-6.1-sol", search: async () => ({ output: [{ action: { sources: [{ url: "https://s.hu/" }] } }] }), download: async (url) => ({ url, title: "T", text: long }) });
    result = await gatherWebSources(input, { onEvent: () => undefined });
    await workflowPhase("knowledge"); await workflowPhase("author"); await workflowPhase("gate"); await workflowPhase("publish"); await workflowPhase("readback");
    return { kind: "material" as const, id: "ok" };
  });
  assert.deepEqual(result?.downloaded.map((s) => s.url), ["https://s.hu/"]);
  assert.equal(fetches, 0, "a mentett tartalék-forrás mellett nincs új Claude-/GPT-hívás");
  const record = await store.read("web-resume", "a");
  assert.equal(hasSavedResearchTurn(record!, input), true);
});

// W1a (A4, A5): dokumentum-mód — a PDF / kép elfogadva, a régi (hírlevél) alapmód változatlanul csak szöveget fogad.
test("A4: fetchPublicPage dokumentum-módban a PDF-et és a képet is elfogadja (képpel), alapból elutasítja", async () => {
  const pdfBytes = Buffer.from("%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [] /Count 0 >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n", "latin1");
  await assert.rejects(fetchPublicPage("https://www.nkp.hu/a.pdf", { lookup: publicLookup, request: async () => response(200, { "content-type": "application/pdf" }, pdfBytes) }), /Nem szöveges/);
  const png = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082", "hex");
  const img = await fetchPublicPage("https://www.nkp.hu/k.png", { documents: true, lookup: publicLookup, request: async () => response(200, { "content-type": "image/png" }, png) });
  assert.equal(img.format, "image");
  assert.equal(img.images?.length, 1);
});

test("A5: a gyűjtő dokumentum-módban tölt; szöveg nélküli (kép / szkennelt) forrás W1b nélkül nem kerül a listába", () => {
  assert.equal(usableSource({ url: "https://a.hu/k.png", title: "k", text: "", format: "image", images: [] }), undefined);
  // Review #592: az elfogadott dokumentum képei, formátuma és szkennelt-jele a W1b-nek megmarad.
  const img = { mime: "image/png", dataUrl: "data:image/png;base64,AA==", bytes: 1, sourceUrl: "https://a.hu/d.pdf" };
  const kept = usableSource({ url: "https://a.hu/d.pdf", title: "d", text: "x".repeat(400), format: "pdf", images: [img], needsOcr: true });
  assert.deepEqual({ format: kept?.format, images: kept?.images, needsOcr: kept?.needsOcr }, { format: "pdf", images: [img], needsOcr: true });
  const src = readFileSync(new URL("../server/studio/web-gather-gpt.ts", import.meta.url), "utf8");
  assert.match(src, /fetchPublicPage\(url, \{ signal, documents: true \}\)/);
});

// W1b (B2): a kép / szkennelt forrás szöveg nélkül is forrás; forrásonként legfeljebb 3 kép, egyenként ≤ 1 MB.
test("B2: usableSource — kép és szkennelt PDF szöveg nélkül elfogadva, hibaoldal nem; képkeret forrásonként", () => {
  const img = (bytes: number) => ({ mime: "image/png", dataUrl: "data:image/png;base64,AA==", bytes, sourceUrl: "https://a.hu/k.png" });
  const photo = usableSource({ url: "https://a.hu/k.png", title: "Térkép", text: "", format: "image", images: [img(10)], needsOcr: true });
  assert.equal(photo?.format, "image");
  assert.equal(photo?.images?.length, 1);
  const scan = usableSource({ url: "https://a.hu/s.pdf", title: "Szkennelt", text: "", format: "pdf", images: [], needsOcr: true, scan: { mime: "application/pdf" as const, dataUrl: "data:application/pdf;base64,JVBERg==" } });
  assert.equal(scan?.scan?.mime, "application/pdf");
  assert.equal(usableSource({ url: "https://a.hu/x", title: "Korlátozva", text: "", format: "image", images: [img(10)] }), undefined, "hibaoldal-cím");
  const many = usableSource({ url: "https://a.hu/d.pdf", title: "d", text: "x".repeat(400), format: "docx", images: [img(10), img(2_000_000), img(20), img(30), img(40)] });
  assert.deepEqual(many?.images?.map(i => i.bytes), [10, 20, 30]);
});

test("B2: a gyűjtés vizuális kerete — fölötte a szöveges forrás szövegként marad, a csak vizuális kimarad", () => {
  const img = { mime: "image/png", dataUrl: "data:image/png;base64,AA==", bytes: 1_000_000, sourceUrl: "https://a.hu/k.png" };
  const textual = { url: "https://a.hu/d", title: "d", text: "x".repeat(400), images: [img] };
  assert.equal(fitVisualBudget(textual, 0), textual);
  assert.deepEqual(fitVisualBudget(textual, GATHER_VISUAL_BUDGET), { url: "https://a.hu/d", title: "d", text: "x".repeat(400) });
  assert.equal(fitVisualBudget({ url: "https://a.hu/k.png", title: "k", text: "", format: "image", images: [img] }, GATHER_VISUAL_BUDGET), undefined);
});

test("review #593: a csak beágyazott képet tartalmazó (rövid szövegű) DOCX / PPTX is vizuális forrás", () => {
  const img = { mime: "image/png", dataUrl: "data:image/png;base64,AA==", bytes: 10, sourceUrl: "https://a.hu/d.docx" };
  assert.equal(usableSource({ url: "https://a.hu/d.docx", title: "Ábrák", text: "", format: "docx", images: [img] })?.images?.length, 1);
  assert.equal(usableSource({ url: "https://a.hu/p.pptx", title: "Diák", text: "Rövid", format: "pptx", images: [img] })?.format, "pptx");
  assert.equal(usableSource({ url: "https://a.hu/d.docx", title: "Üres", text: "", format: "docx", images: [] }), undefined);
});

test("review #593: az elsődleges gyűjtés vizuális kiegészítése — csak dokumentum-/képcím, a meglévőhöz csatolva, új csak vizuális forrás, keretek", async () => {
  const img = (n: number, bytes = 100) => ({ mime: "image/png", dataUrl: `data:image/png;base64,AA${n}`, bytes, sourceUrl: `https://a.hu/${n}.png` });
  const textual = { url: "https://a.hu/tankonyv.pdf", title: "Tankönyv", text: "x".repeat(400) };
  const html = { url: "https://a.hu/cikk", title: "Cikk", text: "y".repeat(400) };
  const asked: string[] = [];
  const pages: Record<string, unknown> = {
    "https://a.hu/tankonyv.pdf": { url: "https://a.hu/tankonyv.pdf", title: "Tankönyv", text: "x".repeat(400), format: "pdf", images: [img(1), img(2)] },
    "https://a.hu/szken.pdf": { url: "https://a.hu/szken.pdf", title: "Szkennelt", text: "", format: "pdf", images: [], needsOcr: true, scan: { mime: "application/pdf", dataUrl: "data:application/pdf;base64,JVBERg==" } },
    "https://a.hu/hiba.png": { url: "https://a.hu/hiba.png", title: "Korlátozva", text: "", format: "image", images: [img(3)] },
  };
  const download = async (url: string) => { asked.push(url); if (!pages[url]) throw new Error("nincs"); return pages[url] as never; };
  const out = await enrichWithVisuals([textual, html], ["https://a.hu/cikk", "https://a.hu/szken.pdf", "https://a.hu/hiba.png", "https://a.hu/nincs.docx"], { download });
  assert.deepEqual(asked.sort(), ["https://a.hu/hiba.png", "https://a.hu/nincs.docx", "https://a.hu/szken.pdf", "https://a.hu/tankonyv.pdf"], "HTML-oldalt nem tölt újra");
  assert.equal(out[0].images?.length, 2, "a szöveges forráshoz csatolva");
  assert.equal(out[0].text, textual.text, "a szöveg a Claude-gyűjtésé marad");
  assert.equal(out[1], html);
  assert.deepEqual(out.slice(2).map(s => s.url), ["https://a.hu/szken.pdf"], "csak vizuális új forrás; a hibaoldal kiesik");
  // Keret: a 12 MB fölött a szöveges forrás szöveg marad, a csak vizuális nem kerül be.
  const big = { "https://a.hu/tankonyv.pdf": { ...(pages["https://a.hu/tankonyv.pdf"] as object), images: [img(4, GATHER_VISUAL_BUDGET)] } };
  const capped = await enrichWithVisuals([textual], [], { download: async url => big[url as keyof typeof big] as never });
  assert.equal(capped[0].images, undefined);
  // Hibatűrő: minden letöltés hibázik → változatlan.
  assert.deepEqual(await enrichWithVisuals([textual], ["https://a.hu/x.pdf"], { download: async () => { throw new Error("le"); } }), [textual]);
});
