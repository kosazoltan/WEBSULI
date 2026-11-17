import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
  classifyHttp, estimateTokens, extractSections, fitBudget, isEnvFile, isExcludedPath, main, maskSecrets, parseArgs,
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
