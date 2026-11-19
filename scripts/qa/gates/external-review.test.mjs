import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
  classifyHttp, estimateTokens, extractSections, fitBudget, isEnvFile, isExcludedPath, main, maskClip, maskSecrets, MASK_WINDOW, parseArgs,
  readKeyFromEnvFile, scanSecrets, DEFAULT_THINKING,
} from "./external-review.mjs";

// A teszt-kulcsokat darabokból rakjuk össze, hogy maga a forrás ne akassza meg a titok-szűrőket.
const FAKE_KEY = ["AI", "za", "Sy", "X".repeat(33)].join("");

describe("fájlszűrés", () => {
  it("kizárja a .env-et, a bináris / kép / mérés / lock fájlokat", () => {
    for (const p of [".env", "source/.env", "source/.env.local", "a/b.png", "x.webm", "docs/measurements/j1a/m.json",
      "source/package-lock.json", "node_modules/x/index.js", "certs/server.pem"]) assert.equal(isExcludedPath(p), true, p);
  });
  it("beengedi a forrásfájlokat és a .env.example-t", () => {
    for (const p of ["source/server/index.ts", "source/client/src/pages/A.tsx", ".env.example", "docs/specs/x.md"]) assert.equal(isExcludedPath(p), false, p);
    assert.equal(isEnvFile(".env.example"), false);
  });
});

describe("titok-szűrés", () => {
  it("Google-kulcsot, privát kulcsot, jelszavas URL-t és valódi e-mailt talál, az értéket nem adja vissza", () => {
    const pk = ["-----BEGIN ", "PRIVATE KEY-----"].join("");
    const url = ["postgres://user:", "S3cretPassw0rd", "@db.host/x"].join("");
    const mail = ["kovacs.janos", "outlook.com"].join("@");
    const text = `+const k = "${FAKE_KEY}";\n+${pk}\n+${url}\n+írj: ${mail}`;
    const hits = scanSecrets(text, "diff");
    assert.deepEqual([...new Set(hits.map((h) => h.kind))].sort(), ["Google API-kulcs", "jelszavas kapcsolati URL", "nem engedélyezett e-mail-cím", "privát kulcs"].sort());
    assert.ok(!JSON.stringify(hits).includes(FAKE_KEY));
    assert.ok(!JSON.stringify(hits).includes(mail));
  });
  it("az engedélyezett / szintetikus címeket és a fájlneveket átengedi", () => {
    const ok = ["valaki@pelda.hu", "noreply@websuli.vip", ["a.b+x", "gmail.com"].join("@"),"ikon@2x.png", "x@foo.test", ["k1tiltott+3", "gmail.com"].join("@")].join(" ");
    assert.deepEqual(scanSecrets(ok, "f"), []);
  });
  it("skipRemoved: a törölt diff-sort nem nézi", () => {
    const mail = ["valodi", "gmail.com"].join("@");
    assert.equal(scanSecrets(`-régi ${mail}\n+új sor`, "diff", { skipRemoved: true }).length, 0);
    assert.equal(scanSecrets(`+új ${mail}`, "diff", { skipRemoved: true }).length, 1);
  });
  it("a fő folyamat titoknál MEGÁLL és nem küld (SECRET kód, a hálózatot nem éri el)", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ke-"));
    const g = (...a) => execFileSync("git", ["-C", dir, ...a], { stdio: "ignore" });
    g("init", "-q"); g("config", "user.email", "t@example.com"); g("config", "user.name", "t");
    fs.writeFileSync(path.join(dir, "a.ts"), "export const a = 1;\n"); g("add", "."); g("commit", "-qm", "1");
    fs.writeFileSync(path.join(dir, "a.ts"), `export const k = "${FAKE_KEY}";\n`); g("commit", "-qam", "2");
    const ki = path.join(dir, "out.md");
    const origFetch = globalThis.fetch; let called = 0; globalThis.fetch = async () => { called++; throw new Error("nem hívható"); };
    try {
      await assert.rejects(main(["--repo", dir, "--base", "HEAD~1", "--head", "HEAD", "--ki", ki]), (e) => e.code === "SECRET" && !e.message.includes(FAKE_KEY));
      assert.equal(called, 0);
    } finally { globalThis.fetch = origFetch; }
  });
});

describe("keret-vágás", () => {
  it("a legnagyobb fájlok felől vesz be; ami nem fér, kimarad, a kisebb még bejöhet", () => {
    const f = (p, n) => ({ path: p, text: "x".repeat(n) });
    const r = fitBudget(2500, [f("kicsi", 250), f("nagy", 25_000), f("kozepes", 2500)], 1000 + 1100 + 120);
    assert.deepEqual(r.included.map((x) => x.path), ["kozepes", "kicsi"]);
    assert.deepEqual(r.omitted.map((x) => x.path), ["nagy"]);
  });
  it("a diff (kötelező rész) soha nem vágódik: ha nem fér, TOO_BIG hiba", () => {
    assert.throws(() => fitBudget(2.5 * 2001, [], 2000), (e) => e.code === "TOO_BIG");
  });
  it("becslés: karakter / 2,5", () => assert.equal(estimateTokens(5), 2));
});

describe("kulcs és maszkolás", () => {
  it("a hibaüzenetből kimaszkolja a pontos kulcsot és az AIza-mintát", () => {
    const m = maskSecrets(`hiba: key=${FAKE_KEY} és ${FAKE_KEY.slice(0, 30)}`, FAKE_KEY);
    assert.ok(!m.includes(FAKE_KEY)); assert.ok(!m.includes(FAKE_KEY.slice(0, 30)));
  });
  it("az env-fájlból csak a GEMINI_API_KEY sort olvassa", () => {
    const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ke-")), ".env");
    fs.writeFileSync(p, `MASIK=1\nGEMINI_API_KEY="${FAKE_KEY}"\nHARMADIK=2\n`);
    assert.equal(readKeyFromEnvFile(p), FAKE_KEY);
  });
  it("kulcs nélkül: KIHAGYVA, 0-s kilépés; --strict mellett 2", async () => {
    const saved = process.env.GEMINI_API_KEY; delete process.env.GEMINI_API_KEY;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ke-")); const ki = path.join(dir, "o.md");
    const lista = path.join(dir, "l.md"); fs.writeFileSync(lista, "- pont\n");
    try {
      assert.equal(await main(["--no-diff", "--extra", lista, "--ki", ki]), 0);
      assert.match(fs.readFileSync(ki, "utf8"), /KIHAGYVA/);
      assert.equal(await main(["--no-diff", "--extra", lista, "--ki", ki, "--strict"]), 2);
    } finally { if (saved !== undefined) process.env.GEMINI_API_KEY = saved; }
  });
  // docs/specs/2026-11-19-kitakaro-negyzetes-regex.md: összeomlás nélkül, vágás a kitakarás előtt.
  it("20 M karakteres AIza-futás: nem dob, nincs kulcs", () => {
    const s = "AIza" + "a".repeat(20_000_000);
    let m;
    assert.doesNotThrow(() => { m = maskSecrets(s, FAKE_KEY); });
    assert.equal(m, "AIza***");
    let c;
    assert.doesNotThrow(() => { c = maskClip(s + FAKE_KEY, FAKE_KEY, 600); });
    assert.ok(c.length <= 600); assert.ok(!c.includes(FAKE_KEY.slice(0, 8)));
  });
  it("az ablakhatáron félbevágott kulcs nem marad a kimenetben, a végső hossz korlátos", () => {
    for (const d of [1, 8, 20, 30, FAKE_KEY.length - 1]) {
      const s = "x".repeat(MASK_WINDOW - d) + FAKE_KEY + "y".repeat(1000);
      const out = maskClip(s, FAKE_KEY, MASK_WINDOW);
      assert.ok(!out.includes(FAKE_KEY.slice(0, Math.min(d, 8))), `eltolás ${d}`);
      assert.ok(maskClip(s, FAKE_KEY, 600).length <= 600);
    }
  });
  it("#521: az ablakhatáron átnyúló token-karakterfutás teljesen eltávolítva (nem csak fix 64 karakter)", () => {
    for (const inWindow of [30, 100, 5000]) {
      const s = "#".repeat(MASK_WINDOW - inWindow) + "T".repeat(inWindow + 500) + " vége";
      const out = maskClip(s, FAKE_KEY, MASK_WINDOW);
      assert.ok(!out.includes("T"), `ablakban ${inWindow} token-karakter`);
      assert.ok(out.length > 0 && out.length <= MASK_WINDOW);
    }
    // a határon NEM átnyúló futás (szóköz a határon túl) megmarad
    const kint = "#".repeat(MASK_WINDOW - 10) + "T".repeat(10) + " ".repeat(100);
    assert.ok(maskClip(kint, FAKE_KEY, MASK_WINDOW).endsWith("#".repeat(10)), "a határ előtti szöveg a kulcshossz-sávon túl megmarad");
  });
  it("#521 / A3: 64-nél hosszabb, AIza-mintára nem illeszkedő (nem token-karakteres) kulcs az ablakhatáron sem marad", () => {
    const key = "ab#cd#" + "ef#01#".repeat(12);
    for (const d of [1, 8, 30, 70, key.length - 1]) {
      const s = "x".repeat(MASK_WINDOW - d) + key + "y".repeat(1000);
      assert.ok(!maskClip(s, key, MASK_WINDOW).includes(key.slice(0, Math.min(d, 8))), `eltolás ${d}`);
    }
  });
  it("az ablaknál rövidebb szövegen a régi viselkedés (maszkolás, majd vágás)", () => {
    const t = "e".repeat(300) + ` key=${FAKE_KEY} ` + "f".repeat(1700);
    assert.equal(maskClip(t, FAKE_KEY, 400), maskSecrets(t, FAKE_KEY).slice(0, 400));
    assert.equal(maskClip(undefined, FAKE_KEY, 10), "");
  });
});

describe("egyéb", () => {
  it("alap gondolkodási szint: high", () => assert.equal(parseArgs(["--ki", "x", "--no-diff"]).thinking, DEFAULT_THINKING) || assert.equal(DEFAULT_THINKING, "high"));
  it("HTTP-osztályozás: 402 = kvóta, 429/503 = újra, 400 = végzetes", () => {
    assert.equal(classifyHttp(402, ""), "quota"); assert.equal(classifyHttp(429, "rate"), "retry");
    assert.equal(classifyHttp(503, ""), "retry"); assert.equal(classifyHttp(400, ""), "fatal");
  });
  it("spec-fejezet kivágás a következő azonos szintű címig", () => {
    const t = "# T\n## K — közös\nk1\n### K.2\nk2\n## J1 — Szökőár\nj1\n## J2\nj2";
    assert.deepEqual(extractSections(t, "^## K"), ["## K — közös\nk1\n### K.2\nk2"]);
    assert.deepEqual(extractSections(t, "^## J1 "), ["## J1 — Szökőár\nj1"]);
  });
});

import { retryWaitMs } from "./external-review.mjs";
describe("429 várakozás", () => {
  it("a Retry-After fejlécet és a RetryInfo.retryDelay-t követi", () => {
    assert.equal(retryWaitMs({ retryAfter: "20", text: "" }), 20_000);
    assert.equal(retryWaitMs({ retryAfter: null, text: '{"retryDelay": "37s"}' }), 38_000);
    assert.equal(retryWaitMs({ retryAfter: null, text: "{}" }), 0);
  });
});

describe("helyi teszt-adatbázis URL", () => {
  it("a loopback (localhost / 127.0.0.1) URL nem titok, a távoli igen", () => {
    const loc = ["postgres://postgres:", "postgres", "@127.0.0.1:5432/x"].join("");
    const rem = ["postgres://u:", "Sup3rS3cret", "@ep-x.neon.tech/db"].join("");
    assert.equal(scanSecrets(loc, "f").filter((h) => h.kind === "jelszavas kapcsolati URL").length, 0);
    assert.equal(scanSecrets(rem, "f").filter((h) => h.kind === "jelszavas kapcsolati URL").length, 1);
  });
});

import { externalRecord } from "./external-review.mjs";
import { externalResult, STATUS } from "./lib.mjs";
describe("bizonyíték (--record) és a kapuk figyelmeztetése (K4)", () => {
  it("kulcs nélküli futás --record-dal: external-<fej>.json „skipped” állapottal, kulcs és jelentés-szöveg nélkül", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ke-rec-"));
    const g = (...a) => execFileSync("git", ["-C", dir, ...a], { encoding: "utf8" }).trim();
    g("init", "-q"); g("-c", "user.name=t", "-c", `user.email=t${"@"}example.com`, "commit", "-q", "--allow-empty", "-m", "x");
    const ev = fs.mkdtempSync(path.join(os.tmpdir(), "ke-ev-"));
    const saved = { k: process.env.GEMINI_API_KEY, e: process.env.WEBSULI_QA_EVIDENCE_DIR };
    delete process.env.GEMINI_API_KEY; process.env.WEBSULI_QA_EVIDENCE_DIR = ev;
    try {
      const ki = path.join(dir, "o.md");
      assert.equal(await main(["--repo", dir, "--base", "HEAD", "--head", "HEAD", "--ki", ki, "--record"]), 0);
      const head = g("rev-parse", "HEAD");
      const rec = JSON.parse(fs.readFileSync(path.join(ev, `external-${head}.json`), "utf8"));
      assert.equal(rec.status, "skipped");
      assert.equal(rec.ok, false);
      assert.match(rec.reportSha256, /^[0-9a-f]{64}$/);
      assert.ok(!JSON.stringify(rec).includes("KIHAGYVA"), "a jelentés szövege nincs a bizonyítékban");
    } finally {
      if (saved.k !== undefined) process.env.GEMINI_API_KEY = saved.k;
      if (saved.e !== undefined) process.env.WEBSULI_QA_EVIDENCE_DIR = saved.e; else delete process.env.WEBSULI_QA_EVIDENCE_DIR;
    }
  });
  it("externalRecord: token-összegek, kulcs nélkül", () => {
    const r = externalRecord({ head: "a".repeat(40), status: "ok", model: "m", thinking: "high", usage: { promptTokenCount: 5, totalTokenCount: 9 }, report: "nincs.md" });
    assert.deepEqual(r.usage, { prompt: 5, thoughts: null, output: null, total: 9 });
    assert.equal(r.reportSha256, null);
  });
  it("externalResult: hiány / KIHAGYVA / kvóta → WARN, lefutott → PASS, soha nem FAIL", () => {
    const h = "b".repeat(40);
    assert.equal(externalResult(null, h).status, STATUS.WARN);
    assert.equal(externalResult({ head: "c".repeat(40), status: "ok" }, h).status, STATUS.WARN, "más fejre szóló jelentés nem számít");
    assert.equal(externalResult({ head: h, status: "skipped" }, h).status, STATUS.WARN);
    assert.equal(externalResult({ head: h, status: "quota" }, h).status, STATUS.WARN);
    assert.equal(externalResult({ head: h, status: "error" }, h).status, STATUS.WARN);
    assert.equal(externalResult({ head: h, status: "ok", model: "m" }, h).status, STATUS.PASS);
  });
});

describe("független review B1 / J-a / J-d", () => {
  it("a diff TÖRÖLT sorában álló titok is megállítja a küldést (4), hálózat nélkül", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ke-b1-"));
    const g = (...a) => execFileSync("git", ["-C", dir, "-c", "user.name=t", "-c", `user.email=t${"@"}example.com`, ...a], { encoding: "utf8" }).trim();
    g("init", "-q");
    const tok = ["gh", "p_", "Q".repeat(36)].join("");
    fs.writeFileSync(path.join(dir, "a.txt"), `kulcs=${tok}\n`); g("add", "-A"); g("commit", "-q", "-m", "a");
    const base = g("rev-parse", "HEAD");
    fs.writeFileSync(path.join(dir, "a.txt"), "kulcs=<környezeti változó>\n"); g("commit", "-q", "-am", "b");
    const saved = process.env.GEMINI_API_KEY; process.env.GEMINI_API_KEY = FAKE_KEY;
    try {
      await assert.rejects(main(["--repo", dir, "--base", base, "--head", "HEAD", "--ki", path.join(dir, "o.md")]), (e) => e.code === "SECRET" && !e.message.includes(tok));
    } finally { if (saved !== undefined) process.env.GEMINI_API_KEY = saved; else delete process.env.GEMINI_API_KEY; }
  });
  it("Render / Neon kulcs-alak is titok", () => {
    assert.equal(scanSecrets(["rnd_", "a".repeat(24)].join(""), "f").length, 1);
    assert.equal(scanSecrets(["npg_", "b".repeat(14)].join(""), "f").length, 1);
  });
});

import { parseSse } from "./external-review.mjs";
describe("SSE-feldolgozás", () => {
  it("összefűzi a szöveget, kihagyja a gondolatot, az utolsó usage-t és finishReason-t veszi", () => {
    const ev = (o) => `data: ${JSON.stringify(o)}\r\n\r\n`;
    const raw = ev({ candidates: [{ content: { parts: [{ text: "titkos gondolat", thought: true }] } }] })
      + ev({ candidates: [{ content: { parts: [{ text: "Hel" }] } }], usageMetadata: { promptTokenCount: 5 } })
      + ev({ candidates: [{ content: { parts: [{ text: "ló" }] }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 5, thoughtsTokenCount: 9, candidatesTokenCount: 2 }, modelVersion: "m" });
    const p = parseSse(raw);
    assert.equal(p.text, "Helló"); assert.equal(p.finishReason, "STOP"); assert.equal(p.usage.thoughtsTokenCount, 9); assert.equal(p.events, 3);
  });
  it("finishReason nélküli folyam: finishReason null (a hívó HIBA-ként kezeli)", () => {
    assert.equal(parseSse(`data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: "fél" }] } }] })}\n\n`).finishReason, null);
  });
});

import { parseInteraction } from "./external-review.mjs";
describe("Interactions-válasz", () => {
  it("csak a model_output szövegét veszi, a usage-t generateContent-alakra fordítja", () => {
    const j = { status: "completed", model: "gemini-4-carbon", usage: { total_input_tokens: 10, total_thought_tokens: 20, total_output_tokens: 5, total_tokens: 35 },
      steps: [{ type: "user_input", content: [{ type: "text", text: "kérdés" }] }, { type: "thought", signature: "x" }, { type: "model_output", content: [{ type: "text", text: "Vál" }, { type: "text", text: "asz" }] }] };
    const p = parseInteraction(j);
    assert.equal(p.text, "Válasz"); assert.equal(p.finishReason, "STOP"); assert.equal(p.usage.thoughtsTokenCount, 20); assert.equal(p.usage.promptTokenCount, 10);
  });
  it("nem completed állapot: finishReason ≠ STOP", () => assert.equal(parseInteraction({ status: "incomplete", steps: [] }).finishReason, "INCOMPLETE"));
});

// ---- #490 bot-leletek: (1) minden kapcsolati URL külön, fail-closed; (2) hamis PASS ellen a válasz-minősítés -------------------------
import { evaluateResponse, generate, isBankData, isLoopbackHost, scanConnectionUrls } from "./external-review.mjs";
const J = (...p) => p.join("");
const AT_ = "@";
describe("#490 (1): kapcsolati URL-ek egyenként, fail-closed (táblázat)", () => {
  const local = J("postgres://postgres:", "postgres", AT_, "localhost:5432/x");
  const remote = J("postgres://admin:", "S3cretPw9", AT_, "db.pelda-szolgaltato.io/prod");
  const secretCases = {
    "helyi, utána távoli (egy sorban)": `${local} ${remote}`,
    "távoli, utána helyi": `${remote} ${local}`,
    "IP-címes gazda": J("mysql://u:", "Pw12345678", AT_, "10.0.0.5:3306/db"),
    "IPv6 gazda": J("postgresql://u:", "Pw12345678", AT_, "[2001:db8::7]/db"),
    "URL-kódolt jelszó": J("postgres://u:", "p%40ss%3Aw0rd", AT_, "ep-x.neon.tech/db"),
    "mongodb+srv": J("mongodb+srv://u:", "Pw12345678", AT_, "cluster0.pelda.mongodb.net/db"),
    "redis": J("redis://default:", "Pw12345678", AT_, "cache.pelda.io:6379"),
    "amqp": J("amqp://u:", "Pw12345678", AT_, "mq.pelda.io/vhost"),
    "jelszó a lekérdezésben": J("postgres://db.pelda.io/x?user=u&", "password=", "Pw12345678"),
    "Authorization-fejléc": J("Authorization: ", "Bearer ", "abcdef0123456789abcdef"),
    "Bearer önmagában": J("curl -H 'x: ", "Bearer ", "abcdefghijklmnopqrstuvwxyz0123'"),
    "Google-kulcs": J("AI", "za", "Sy", "Q".repeat(33)),
    "OpenAI-kulcs": J("sk-", "a".repeat(40)),
    "GitHub-token": J("gh", "p_", "Z".repeat(36)),
    "PEM-blokk": J("-----BEGIN ", "RSA ", "PRIVATE KEY-----"),
  };
  for (const [name, line] of Object.entries(secretCases)) {
    it(`titok: ${name}`, () => {
      const hits = scanSecrets(line, "f");
      assert.ok(hits.length >= 1, name);
      assert.ok(hits.every((h) => !JSON.stringify(h).includes("S3cretPw9") && !JSON.stringify(h).includes("Pw12345678")), "érték nem szivárog");
    });
  }
  const cleanCases = {
    "csak helyi": local,
    "127.0.0.1": J("postgres://postgres:", "postgres", AT_, "127.0.0.1:5432/x"),
    "[::1]": J("postgres://p:", "p", AT_, "[::1]:5432/x"),
    "helyőrző-jelszó": J("postgresql://postgres:", "${password}", AT_, "${address}/x"),
    "jelszó nélküli userinfo": J("https://git", AT_, "github.com/x/y"),
    "helyőrző a lekérdezésben": J("https://x.pelda.io/?", "token=", "<TOKEN>"),
  };
  for (const [name, line] of Object.entries(cleanCases)) it(`nem titok: ${name}`, () => assert.deepEqual(scanConnectionUrls(line), []));
  it("isLoopbackHost", () => {
    for (const h of ["localhost", "127.0.0.1", "127.1.2.3", "[::1]", "::1"]) assert.equal(isLoopbackHost(h), true, h);
    for (const h of ["10.0.0.1", "db.pelda.io", "[2001:db8::1]", "localhost.pelda.io"]) assert.equal(isLoopbackHost(h), false, h);
  });
  it("a nyers szó- / évfolyam-bank adatfájl alapból kimarad", () => {
    assert.equal(isBankData("source/client/src/data/vocabBank/de/level-2.ts"), true);
    assert.equal(isBankData("source/client/src/data/gradeQuizBank/grade-07.ts"), true);
    assert.equal(isBankData("source/client/src/data/gradeQuizBank/loader.ts"), false);
    assert.equal(isExcludedPath("source/client/src/data/gradeQuizBank/grade-07.ts"), true);
    assert.equal(isExcludedPath("source/client/src/data/gradeQuizBank/grade-07.ts", { includeBankData: true }), false);
  });
});

describe("#490 (2): siker csak kész, ítéletes jelentéssel — helyettesített HTTPS-válaszokkal", () => {
  const ev = (o) => `data: ${JSON.stringify(o)}\r\n\r\n`;
  const okText = "## Ítélet\nÖSSZEVONHATÓ — IGEN, FELTÉTELLEL: apróságok.\n## Blokkoló leletek\nnincs\n## Egyéb leletek\n- x\n## Mit vizsgált\n- diff";
  const transport = (text, status = 200) => async () => ({ status, text, retryAfter: null, complete: true });
  const call = (raw, status) => generate({ model: "m", key: "k", systemText: "s", userText: "u", thinking: "high", transport: transport(raw, status), sleep: async () => {} });
  it("kész, ítéletes válasz → ok", async () => {
    const r = await call(ev({ candidates: [{ content: { parts: [{ text: okText }] }, finishReason: "STOP" }] }));
    assert.deepEqual(evaluateResponse(r), { status: "ok", reason: "" });
  });
  it("blokkolt prompt (csak promptFeedback.blockReason) → blocked", async () => {
    const r = await call(ev({ promptFeedback: { blockReason: "SAFETY" } }));
    assert.equal(evaluateResponse(r).status, "blocked");
  });
  it("tartalomszűrés (finishReason SAFETY) → blocked", async () => {
    const r = await call(ev({ candidates: [{ content: { parts: [] }, finishReason: "SAFETY" }] }));
    assert.equal(evaluateResponse(r).status, "blocked");
  });
  it("üres válasz STOP-pal → incomplete", async () => {
    const r = await call(ev({ candidates: [{ content: { parts: [] }, finishReason: "STOP" }] }));
    assert.equal(evaluateResponse(r).status, "incomplete");
  });
  it("MAX_TOKENS (a gondolkodás kimerítette a keretet) → incomplete", async () => {
    const r = await call(ev({ candidates: [{ content: { parts: [{ text: "abc" }] }, finishReason: "MAX_TOKENS" }] }));
    assert.equal(evaluateResponse(r).status, "incomplete");
  });
  it("ítélet nélküli szöveg → incomplete", async () => {
    const r = await call(ev({ candidates: [{ content: { parts: [{ text: "Hosszú elemzés ".repeat(40) }] }, finishReason: "STOP" }] }));
    assert.deepEqual(evaluateResponse(r), { status: "incomplete", reason: "nincs ítélet-fejezet a válaszban" });
  });
  it("megszakadt folyam (finishReason nélkül, csonka utolsó esemény) → INCOMPLETE hiba, újrapróba nélkül", async () => {
    let calls = 0;
    const t = async () => { calls++; return { status: 200, text: `${ev({ candidates: [{ content: { parts: [{ text: "fél" }] } }] })}data: {"candid`, retryAfter: null, complete: false }; };
    await assert.rejects(generate({ model: "m", key: "k", systemText: "s", userText: "u", thinking: "high", transport: t, sleep: async () => {} }), (e) => e.code === "INCOMPLETE");
    assert.equal(calls, 1);
  });
  it("időtúllépés / megszakadt kapcsolat: NINCS újrapróba; 503: van", async () => {
    let calls = 0;
    const t = async () => { calls++; throw Object.assign(new Error("időtúllépés"), { code: "TIMEOUT" }); };
    await assert.rejects(generate({ model: "m", key: "k", systemText: "s", userText: "u", thinking: "high", transport: t, sleep: async () => {} }), (e) => e.code === "TIMEOUT");
    assert.equal(calls, 1);
    let n = 0;
    const t2 = async () => { n++; return n < 2 ? { status: 503, text: "", retryAfter: "0" } : { status: 200, text: ev({ candidates: [{ content: { parts: [{ text: okText }] }, finishReason: "STOP" }] }), retryAfter: null, complete: true }; };
    const r = await generate({ model: "m", key: "k", systemText: "s", userText: "u", thinking: "high", transport: t2, sleep: async () => {} });
    assert.equal(n, 2);
    assert.equal(evaluateResponse(r).status, "ok");
  });
  it("a kapu a hiányos / blokkolt bizonyítékot „HIÁNYZIK” figyelmeztetésként mutatja", () => {
    const h = "d".repeat(40);
    assert.match(externalResult({ head: h, status: "incomplete", reason: "MAX_TOKENS" }, h).note, /HIÁNYZIK/);
    assert.match(externalResult({ head: h, status: "blocked" }, h).note, /HIÁNYZIK/);
  });
});

describe("visszaellenőrzés (a3cf2bbf): C1 és a szigorúbb siker-feltétel", () => {
  it("C1: a $-ral kezdődő valódi jelszó titok; a csupa nagybetűs $VALTOZO helyőrző", () => {
    assert.equal(scanConnectionUrls(["postgres://app:", "$Ab12cd", "@", "db.pelda.io/x"].join("")).length, 1);
    assert.equal(scanConnectionUrls(["postgres://app:", "$DB_PASSWORD", "@", "db.pelda.io/x"].join("")).length, 0);
  });
  const stop = (text) => ({ text, finishReason: "STOP" });
  const fence = "`".repeat(3);
  it("kódblokkban álló ítélet, csak ítélet-fejezet, sablon-visszhang → incomplete", () => {
    assert.equal(evaluateResponse(stop(`${fence}\n## Ítélet\nIGEN\n## Blokkoló leletek\n## Egyéb leletek\n## Mit vizsgált\n${fence}`)).status, "incomplete");
    assert.equal(evaluateResponse(stop("## Ítélet\nIGEN")).status, "incomplete");
    assert.equal(evaluateResponse(stop("## Ítélet\n(egy sor: ÖSSZEVONHATÓ — IGEN / IGEN, FELTÉTELLEL / NEM; …)\n## Blokkoló leletek\n## Egyéb leletek\n## Mit vizsgált")).status, "incomplete");
  });
});
