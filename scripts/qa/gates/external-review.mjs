#!/usr/bin/env node
/**
 * Külső, más rendszerű kódellenőr (Google Gemini) — függőség nélküli Node ESM.
 *
 * Használat (PR / szelet):
 *   node scripts/qa/gates/external-review.mjs --repo <git-könyvtár> --base <ref> --head <ref> --cim "<cím>" \
 *     --spec <fájl>#<fejezetcím-regex> [--spec …] --lista <ellenőrzőlista.md> --ki <jelentés.md>
 * Köteg (összevont hatás, két ponttal): --diff-mode range [--paths <pathspec> …] [--fajl <útvonal> …]
 * Szintézis (repó nélkül): --no-diff --extra <helyi fájl> [--extra …]
 * Egyéb: --feladat <helyi fájl> (a kérdések), --model gemini-4-carbon, --thinking high,
 *   --max-input-tokens 600000, --max-diff-kb N, --dry-run (nem hív generateContent-et, csak countTokens),
 *   --env-file <fájl> (csak a GEMINI_API_KEY sort olvassa), --strict (kulcs / kvóta hiánya = bukás),
 *   --record (external-<fej>.json a kapuk bizonyíték-tárába; a pre-pr / pre-merge kapu figyelmeztetésként olvassa),
 *   --rendszer <helyi fájl> (a rendszer-utasítás felülírása, pl. szintézishez).
 *
 * A kulcs: GEMINI_API_KEY környezeti változó, vagy --env-file. Soha nem kerül kimenetbe: minden szöveg, amely a
 * folyamatból kimegy (hiba, jelentés), átmegy a maskSecrets()-en.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { evidenceDir, writeEvidence } from "./lib.mjs";

export const DEFAULT_MODEL = "gemini-4-carbon";
// generateContent REST: ThinkingConfig.thinkingLevel enum (MINIMAL/LOW/MEDIUM/HIGH/XHIGH). Tulajdonosi döntés: sima HIGH.
export const DEFAULT_THINKING = "high";
export const DEFAULT_MAX_INPUT_TOKENS = 600_000;
export const MAX_OUTPUT_TOKENS = 32_768; // a gemini-4-carbon outputTokenLimit-je (GET /v1beta/models/gemini-4-carbon)
const API = "https://generativelanguage.googleapis.com/v1beta/models/";

// ---------------------------------------------------------------- argumentumok
export function parseArgs(argv) {
  const multi = new Set(["spec", "paths", "fajl", "extra"]);
  const flags = new Set(["dry-run", "strict", "no-diff", "record"]);
  const o = { spec: [], paths: [], fajl: [], extra: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) throw new Error(`Ismeretlen argumentum: ${a}`);
    const k = a.slice(2);
    if (flags.has(k)) { o[k] = true; continue; }
    const v = argv[++i];
    if (v === undefined) throw new Error(`Hiányzó érték: ${a}`);
    if (multi.has(k)) o[k].push(v); else o[k] = v;
  }
  o.model ??= DEFAULT_MODEL;
  o.thinking = String(o.thinking ?? DEFAULT_THINKING).toLowerCase();
  o["max-input-tokens"] = Number(o["max-input-tokens"] ?? DEFAULT_MAX_INPUT_TOKENS);
  o["diff-mode"] ??= "triple";
  if (!o.ki) throw new Error("A --ki <jelentés.md> kötelező.");
  if (!o["no-diff"] && (!o.repo || !o.base || !o.head)) throw new Error("--repo, --base és --head kötelező (vagy --no-diff).");
  if (!["triple", "range"].includes(o["diff-mode"])) throw new Error("--diff-mode: triple | range");
  return o;
}

// ---------------------------------------------------------------- fájlszűrés
const BINARY_EXT = /\.(png|jpe?g|gif|webp|avif|ico|bmp|svgz|woff2?|ttf|otf|eot|pdf|mp3|mp4|m4a|wav|ogg|webm|mov|zip|gz|tgz|7z|rar|db|sqlite|wasm|exe|dll|node|bin|glb|gltf|ktx2|hdr|psd)$/i;
export function isEnvFile(p) {
  const base = p.split("/").pop();
  return /^\.env(\..*)?$/i.test(base) && !/\.example$|\.sample$|\.template$/i.test(base);
}
export function isExcludedPath(p) {
  const n = p.replace(/\\/g, "/");
  if (isEnvFile(n)) return true;
  if (BINARY_EXT.test(n)) return true;
  if (/(^|\/)docs\/measurements\//.test(n)) return true;
  if (/(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|[^/]+\.lock)$/.test(n)) return true;
  if (/(^|\/)node_modules\//.test(n)) return true;
  if (/\.(pem|key|p12|pfx|jks)$/i.test(n)) return true;
  return false;
}

// ---------------------------------------------------------------- titok-szűrés
// Kiindulás: scripts/qa/repo-rules.json (hook-minták) és source/tests/no-real-emails-guard.test.ts (címőr).
export const SECRET_PATTERNS = [
  { kind: "Google API-kulcs", re: /AIza[0-9A-Za-z_\-]{30,}/ },
  { kind: "Anthropic-kulcs", re: /sk-ant-[A-Za-z0-9_\-]{20,}/ },
  { kind: "OpenAI/OpenRouter-kulcs", re: /\bsk-(?:proj-|or-v1-)?[A-Za-z0-9]{32,}/ },
  { kind: "GitHub-token", re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}/ },
  { kind: "AWS-kulcs", re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { kind: "Slack-token", re: /\bxox[abprs]-[A-Za-z0-9-]{10,}/ },
  { kind: "Stripe-kulcs", re: /\b(?:sk|rk)_live_[A-Za-z0-9]{20,}/ },
  { kind: "Resend-kulcs", re: /\bre_[A-Za-z0-9]{8,}_[A-Za-z0-9]{16,}/ },
  { kind: "privát kulcs", re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/ },
  { kind: "jelszavas kapcsolati URL", re: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^\s:@/'"`]+:[^\s@/'"`$<{]{6,}@/i },
  { kind: "JWT", re: /\beyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}/ },
];
const ALLOWED_EMAIL_DOMAINS = ["pelda.hu", "example.com", "example.org", "example.net", "example.co.uk", "websuli.vip",
  "mail.web-suli.vip", "websuli.org", "resend.dev", "notresend.dev", "users.noreply.github.com", "x.hu", "b.hu", "c.hu",
  "-c.hu", "c-.hu", "-websuli.vip", "websuli-.vip", "iskola.hu"];
const RESERVED_TLDS = ["example", "test", "invalid", "localhost"];
// A címőr (source/tests/no-real-emails-guard.test.ts) pontos címlistájának másolata. A nyilvános repó miatt a forrásban nem állhat
// e-mail-alakú szöveg, ezért a címeket futásidőben rakjuk össze (helyirész, domain). Ha a címőr listája változik, ezt is frissíteni kell.
const AT = "@";
const ALLOWED_ADDRESSES = new Set([["noreply", "anthropic.com"], ["példa", "email.com"], ["példa", "domain.hu"], ["local", "label.label"],
  ["p", "www.nkp.hu"], ["a.b+x", "gmail.com"], ["ab", "gmail.com"], ["ab", "googlemail.com"], ["kisdiak", "gmail.com"], ["kisdiak+1", "gmail.com"],
  ["kisdiak+5", "gmail.com"], ["kis.diak+2", "gmail.com"], ["k.i.s.diak", "googlemail.com"]].map(([l, d]) => `${l}${AT}${d}`));
const SYNTHETIC_GMAIL_LOCALS = new Set(["k1tiltott", "k1-gold-unban", "k1goldunban", "k1felold2", "diakpelda", "masik",
  "k1baliaselotte", "k1ketpeldany", "k1zaralias", "aliasproba", "limitp", "rotgoogle", "rotkod"]);
const FILE_EXT_TLD = /\.(png|jpe?g|gif|svg|webp|avif|js|mjs|cjs|ts|tsx|jsx|css|json|map|html)$/;
const EMAIL = /(?<![\p{L}\p{N}._%+-])[\p{L}\p{N}._%+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,})(?![A-Za-z0-9-])/gu;

export function isAllowedEmail(address) {
  const lower = address.toLowerCase();
  const domain = lower.slice(lower.lastIndexOf("@") + 1);
  if (ALLOWED_ADDRESSES.has(lower)) return true;
  if ((domain === "gmail.com" || domain === "googlemail.com")) {
    const canonical = lower.slice(0, lower.lastIndexOf("@")).split("+")[0].replace(/\./g, "");
    return SYNTHETIC_GMAIL_LOCALS.has(canonical);
  }
  if (FILE_EXT_TLD.test(domain)) return true;
  if (RESERVED_TLDS.some((t) => domain === t || domain.endsWith(`.${t}`))) return true;
  return ALLOWED_EMAIL_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`));
}

/**
 * Titok / valódi e-mail keresése. A találat értékét SOSEM adja vissza, csak a forrás nevét, a sorszámot és a fajtát.
 * diff:true esetén a törölt ("-") sorokat kihagyja (azok már a nyilvános történetben vannak, a küldött diffben viszont benne
 * maradnak — ezért alapból mégis szkenneljük: a hívó dönti el).
 */
export function scanSecrets(text, source, { skipRemoved = false } = {}) {
  const hits = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (skipRemoved && line.startsWith("-") && !line.startsWith("---")) continue;
    for (const p of SECRET_PATTERNS) if (p.re.test(line) && !isLoopbackDbUrl(p, line)) hits.push({ source, line: i + 1, kind: p.kind });
    for (const m of line.matchAll(EMAIL)) if (!isAllowedEmail(m[0])) hits.push({ source, line: i + 1, kind: "nem engedélyezett e-mail-cím" });
  }
  return hits;
}

/** Helyi teszt-adatbázis (CI szolgáltatás-konténer, fejlesztői alapérték) kapcsolati URL-je nem titok. */
function isLoopbackDbUrl(p, line) {
  if (p.kind !== "jelszavas kapcsolati URL") return false;
  const m = /:\/\/[^\s:@/'"`]+:[^\s@/'"`]+@([^\s:/'"`]+)/i.exec(line);
  return Boolean(m && /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(m[1]));
}

// ---------------------------------------------------------------- kulcs és maszkolás
export function readKeyFromEnvFile(file) {
  const text = fs.readFileSync(file, "utf8");
  for (const l of text.split(/\r?\n/)) {
    const m = l.match(/^\s*(?:export\s+)?GEMINI_API_KEY\s*=\s*(.*?)\s*$/);
    if (m) return m[1].replace(/^["']|["']$/g, "") || null;
  }
  return null;
}
export function maskSecrets(s, key) {
  let out = String(s ?? "");
  if (key) out = out.split(key).join("***");
  return out.replace(/AIza[0-9A-Za-z_\-]{20,}/g, "AIza***");
}

// ---------------------------------------------------------------- keret
// Mérve (countTokens, 2026-11-17): magyar szöveg + kód ~2,5 karakter / token; a 3,5-ös becslés ~45%-kal alábecsült.
export const estimateTokens = (chars) => Math.ceil(chars / 2.5);

/**
 * fixedChars: a kötelező részek (diff, spec, lista, extra, utasítás) mérete. files: [{path, text}].
 * A legnagyobbak felől vesz be, amíg a keret engedi; ami nem fér, kimarad (a kisebbek még bejöhetnek).
 */
export function fitBudget(fixedChars, files, maxTokens) {
  const fixedTokens = estimateTokens(fixedChars);
  if (fixedTokens > maxTokens) {
    const err = new Error(`A kötelező bemenet (diff + spec + lista + extra) ~${fixedTokens} token, több mint a ${maxTokens} tokenes keret — bontsd kisebb kötegre.`);
    err.code = "TOO_BIG";
    throw err;
  }
  let used = fixedTokens;
  const included = [], omitted = [];
  for (const f of [...files].sort((a, b) => b.text.length - a.text.length)) {
    const t = estimateTokens(f.text.length + f.path.length + 40);
    if (used + t <= maxTokens) { included.push(f); used += t; } else omitted.push(f);
  }
  return { included, omitted, estTokens: used };
}

// ---------------------------------------------------------------- git
function git(repo, args, { maxBuffer = 512 * 1024 * 1024 } = {}) {
  return execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", maxBuffer, stdio: ["ignore", "pipe", "pipe"] });
}
export function pathspecExcludes() {
  return [":(exclude,glob)**/.env", ":(exclude,glob)**/.env.*", ":(exclude,glob)**/docs/measurements/**",
    ":(exclude,glob)**/package-lock.json", ":(exclude,glob)**/node_modules/**"];
}
export function collectDiff(repo, base, head, mode, paths) {
  const range = mode === "range" ? `${base}..${head}` : `${base}...${head}`;
  const spec = [...(paths.length ? paths : ["."]), ...pathspecExcludes()];
  const added = new Set(git(repo, ["diff", "--name-only", "--diff-filter=A", range, "--", ...spec]).split("\n").filter(Boolean));
  const names = git(repo, ["diff", "--name-only", "--diff-filter=d", range, "--", ...spec]).split("\n").filter(Boolean);
  const allNames = git(repo, ["diff", "--name-only", range, "--", ...spec]).split("\n").filter(Boolean);
  const keep = allNames.filter((p) => !isExcludedPath(p));
  const diff = keep.length ? git(repo, ["diff", "--no-color", "--no-ext-diff", "-M", range, "--", ...keep]) : "";
  return { diff, added, changed: names.filter((p) => !isExcludedPath(p)), skippedPaths: allNames.filter((p) => isExcludedPath(p)) };
}
export function showFile(repo, head, p) {
  try { return git(repo, ["show", `${head}:${p}`]); } catch { return null; }
}
export function extractSections(text, regexSrc) {
  const re = new RegExp(regexSrc, "u");
  const lines = text.split("\n");
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(#{1,6})\s/);
    if (!m || !re.test(lines[i])) continue;
    const lvl = m[1].length;
    let j = i + 1;
    while (j < lines.length) { const n = lines[j].match(/^(#{1,6})\s/); if (n && n[1].length <= lvl) break; j++; }
    out.push(lines.slice(i, j).join("\n"));
    i = j - 1;
  }
  return out;
}

// ---------------------------------------------------------------- utasítás
export const SYSTEM_INSTRUCTION = `Független kódellenőr vagy egy magyar oktatási webalkalmazás (WEBSULI: tananyagok, kvízek, böngészős játékok gyerekeknek) számára.
A kódot NEM te írtad, és a szerzők nem a te rendszeredhez tartoznak. A feladatod HIBÁT KERESNI, nem megerősítést adni. A kapott specifikációhoz (terv / végrehajtási utasítás) és ellenőrzőlistához mérsz.

Szabályok:
- Csak azt idézheted, ami a bemenetben szó szerint szerepel. Ne találj ki fájlt, függvényt, sort, flaget. A fájl:sor hivatkozásnál a sorszám a "TELJES FÁJL" blokkok sorszámozásából vagy a diff hunk-fejlécéből (@@ … +N …) jöjjön.
- Minden lelet tartalma: súlyosság (kritikus / magas / közepes / alacsony); fájl:sor; konkrét forgatókönyv (bemenet / állapot → rossz kimenet); a javítás iránya.
- Kritikus és magas leletnél írd le, mivel próbáltad megcáfolni (milyen védelmet kerestél a kódban, és miért nem elég).
- Amit a kapott szövegből nem lehet eldönteni (pl. egy nem csatolt fájl viselkedése, futásidejű mérés), azt NE találgasd: sorold a "Nem ellenőrizhető" fejezetbe "NEM ELLENŐRIZHETŐ a kapott anyagból" jelöléssel.
- Ha a bemenet egy része "nincs adat" jelölésű, arra ne építs állítást.
- Magyarul írj, Markdownban, PONTOSAN ezekkel a fejezetekkel, ebben a sorrendben:
  ## Ítélet
  (egy sor: ÖSSZEVONHATÓ — IGEN / IGEN, FELTÉTELLEL / NEM; köteg- vagy rendszerelemzésnél: ÁLLAPOT — RENDBEN / FELTÉTELLEL / KOCKÁZATOS, egy mondatos indoklással)
  ## Blokkoló leletek
  ## Egyéb leletek
  ## Javítási javaslatok
  (táblázat: azonosító · terület · probléma (fájl:sor vagy tényadat) · javaslat (konkrét lépés) · várható hatás · ráfordítás (kicsi/közepes/nagy) · kockázat · sürgősség (tesztelés előtt / hamarosan / később))
  ## Nem ellenőrizhető
  ## Mit vizsgált
  (mely fájlokat / fejezeteket nézted meg ténylegesen, és mit hagytál ki)`;

export function numbered(text) {
  return text.split("\n").map((l, i) => `${String(i + 1).padStart(5)}| ${l}`).join("\n");
}

export function buildUserPrompt({ cim, feladat, lista, specs, diff, files, extras, omitted, meta }) {
  const parts = [];
  parts.push(`# Ellenőrzési feladat: ${cim}\n\n${meta}`);
  if (feladat) parts.push(`# Kérdések / fókusz\n\n${feladat}`);
  if (lista) parts.push(`# Kötelező ellenőrzőlista\n\n${lista}`);
  for (const s of specs) parts.push(`# SPECIFIKÁCIÓ — ${s.label}\n\n${s.text}`);
  for (const e of extras) parts.push(`# KIEGÉSZÍTŐ ANYAG — ${e.label}\n\n${e.text}`);
  if (omitted.length) parts.push(`# Kihagyott teljes fájlok (keret miatt; a diffjük benne van)\n\n${omitted.map((f) => `- ${f.path}`).join("\n")}`);
  if (diff !== null) parts.push(`# DIFF\n\n\`\`\`diff\n${diff}\n\`\`\``);
  for (const f of files) parts.push(`# TELJES FÁJL (head): ${f.path}\n\n\`\`\`\n${numbered(f.text)}\n\`\`\``);
  return parts.join("\n\n---\n\n");
}

// ---------------------------------------------------------------- API
export function classifyHttp(status, bodyText) {
  if (status === 402 || (status === 429 && /prepay|credit|billing|quota exceeded|exceeded your current quota/i.test(bodyText))) return "quota";
  if (status === 429 || status >= 500) return "retry";
  return "fatal";
}
async function postJson(url, key, body, timeoutMs) {
  const r = await fetch(url, { method: "POST", headers: { "x-goog-api-key": key, "content-type": "application/json" },
    body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
  return { status: r.status, text: await r.text(), retryAfter: r.headers.get("retry-after") };
}
export async function countTokens(model, key, systemText, userText) {
  const r = await postJson(`${API}${model}:countTokens`, key, { contents: [{ role: "user", parts: [{ text: `${systemText}\n\n${userText}` }] }] }, 120_000);
  if (r.status !== 200) return { error: `HTTP ${r.status}: ${maskSecrets(r.text, key).slice(0, 400)}` };
  return { totalTokens: JSON.parse(r.text).totalTokens };
}
export async function generate({ model, key, systemText, userText, thinking, timeoutMs = 20 * 60_000, retries = 3, log = () => {} }) {
  const body = {
    systemInstruction: { parts: [{ text: systemText }] },
    contents: [{ role: "user", parts: [{ text: userText }] }],
    // A Gemini 4 modellek a temperature/topP/topK-t figyelmen kívül hagyják (aistudio.google.com/docs/text-generation), ezért nem küldjük.
    generationConfig: { maxOutputTokens: MAX_OUTPUT_TOKENS, thinkingConfig: { thinkingLevel: thinking.toUpperCase() } },
  };
  let last;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const r = await postJson(`${API}${model}:generateContent`, key, body, timeoutMs);
      if (r.status === 200) return JSON.parse(r.text);
      const cls = classifyHttp(r.status, r.text);
      last = Object.assign(new Error(`HTTP ${r.status}: ${maskSecrets(r.text, key).slice(0, 600)}`), { code: cls });
      if (cls !== "retry") throw last;
      last.waitMs = retryWaitMs(r);
    } catch (e) {
      if (e.code === "quota" || e.code === "fatal") throw e;
      last = e.code ? e : Object.assign(new Error(maskSecrets(e?.cause?.message || e.message, key)), { code: "retry" });
    }
    if (attempt < retries) { const w = Math.max(last.waitMs ?? 0, 15_000 * 2 ** attempt); log(`újrapróbálás ${attempt + 1}/${retries} ${w / 1000} s múlva: ${maskSecrets(last.message, key).slice(0, 160)}`); await new Promise((r) => setTimeout(r, w)); }
  }
  throw last;
}

/** 429-nél a válaszban jelzett várakozás (Retry-After fejléc vagy RetryInfo.retryDelay, pl. "37s"), ezredmásodpercben. */
export function retryWaitMs(r) {
  if (r.retryAfter && /^\d+$/.test(r.retryAfter)) return Number(r.retryAfter) * 1000;
  const m = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(r.text ?? "");
  return m ? Math.ceil(Number(m[1]) * 1000) + 1000 : 0;
}

// ---------------------------------------------------------------- bizonyíték (--record)
/**
 * `external-<fej>.json` a kapuk bizonyíték-tárába (docs/specs/2026-11-17-kulso-ellenor.md K4): állapot, modell, token-összegek, a
 * jelentés útja és SHA-256-ja. Kulcs és jelentés-szöveg NINCS benne. A pre-pr / pre-merge kapu csak figyelmeztetésként olvassa.
 */
export function externalRecord({ head, status, model, thinking, usage, report, now = () => new Date() }) {
  let sha = null;
  try { sha = createHash("sha256").update(fs.readFileSync(report)).digest("hex"); } catch { /* nincs jelentés */ }
  return { kind: "external", head, status, ok: status === "ok", model, thinking, at: now().toISOString(), report: path.resolve(report), reportSha256: sha,
    usage: usage ? { prompt: usage.promptTokenCount ?? null, thoughts: usage.thoughtsTokenCount ?? null, output: usage.candidatesTokenCount ?? null, total: usage.totalTokenCount ?? null } : null };
}
function record(o, head, status, usage) {
  if (!o.record || !o.repo || head === "-") return;
  let common = git(o.repo, ["rev-parse", "--git-common-dir"]).trim();
  if (!path.isAbsolute(common)) common = path.resolve(o.repo, common);
  writeEvidence(evidenceDir(common), `external-${head}`, externalRecord({ head, status, model: o.model, thinking: o.thinking, usage, report: o.ki }));
}

// ---------------------------------------------------------------- fő folyamat
export function readLocal(p) { return fs.readFileSync(p, "utf8"); }

export async function main(argv) {
  const o = parseArgs(argv);
  const started = Date.now();
  const log = (m) => process.stderr.write(`[external-review] ${m}\n`);
  let key = process.env.GEMINI_API_KEY || null;
  if (!key && o["env-file"]) key = readKeyFromEnvFile(o["env-file"]);

  // 1. bemenet
  let diff = null, changed = [], added = new Set(), skippedPaths = [], baseHash = "-", headHash = "-";
  const hasRepo = Boolean(o.repo && o.head);
  if (hasRepo) headHash = git(o.repo, ["rev-parse", o.head]).trim();
  if (hasRepo && o.base) baseHash = git(o.repo, ["rev-parse", o.base]).trim();
  if (!o["no-diff"]) {
    ({ diff, changed, added, skippedPaths } = collectDiff(o.repo, o.base, o.head, o["diff-mode"], o.paths));
    if (o["max-diff-kb"] && Buffer.byteLength(diff) > Number(o["max-diff-kb"]) * 1024) throw Object.assign(new Error(`A diff ${Math.round(Buffer.byteLength(diff) / 1024)} KB, a --max-diff-kb ${o["max-diff-kb"]} — bontsd kisebbre.`), { code: "TOO_BIG" });
  }
  const specs = [];
  for (const s of o.spec) {
    const cut = s.indexOf("#");
    const file = cut < 0 ? s : s.slice(0, cut);
    const rx = cut < 0 ? "" : s.slice(cut + 1);
    const text = hasRepo ? showFile(o.repo, o.head, file) : readLocal(file);
    if (text === null) throw new Error(`A spec nem olvasható a head-en: ${file}`);
    const secs = rx ? extractSections(text, rx) : [text];
    if (!secs.length) throw new Error(`A spec-fejezet nem található: ${file}#${rx}`);
    specs.push({ label: `${file}${rx ? ` (fejezet: /${rx}/)` : ""}`, text: secs.join("\n\n") });
  }
  const extras = o.extra.map((p) => ({ label: path.basename(p), text: readLocal(p) }));
  const lista = o.lista ? readLocal(o.lista) : "";
  const feladat = o.feladat ? readLocal(o.feladat) : "";
  const systemText = o.rendszer ? readLocal(o.rendszer) : SYSTEM_INSTRUCTION;

  const fileSet = new Set([...changed, ...o.fajl]);
  const files = [];
  // Új (A) fájlnál a diff már a teljes tartalmat hordozza: nem küldjük kétszer, kivéve ha --fajl-lal kifejezetten kérték.
  const forced = new Set(o.fajl);
  if (hasRepo) for (const p of fileSet) {
    if (added.has(p) && !forced.has(p)) continue;
    if (isExcludedPath(p)) continue;
    const t = showFile(o.repo, o.head, p);
    if (t !== null && !t.includes("\u0000")) files.push({ path: p, text: t });
  }

  // 2. titok-szűrés (küldés előtt, mindenre)
  const hits = [];
  if (diff) hits.push(...scanSecrets(diff, "diff", { skipRemoved: true }));
  for (const f of files) hits.push(...scanSecrets(f.text, f.path));
  for (const s of specs) hits.push(...scanSecrets(s.text, s.label));
  for (const e of extras) hits.push(...scanSecrets(e.text, e.label));
  hits.push(...scanSecrets(lista, "lista"), ...scanSecrets(feladat, "feladat"));
  if (hits.length) {
    const msg = `TITOK-SZŰRÉS: ${hits.length} gyanús találat, a bemenet NEM lett elküldve:\n` + hits.slice(0, 50).map((h) => `  - ${h.source}:${h.line} (${h.kind})`).join("\n");
    throw Object.assign(new Error(msg), { code: "SECRET" });
  }

  // 3. keret
  const fixedChars = (diff?.length ?? 0) + specs.reduce((a, s) => a + s.text.length, 0) + extras.reduce((a, e) => a + e.text.length, 0) + lista.length + feladat.length + systemText.length + 4000;
  const { included, omitted, estTokens } = fitBudget(fixedChars, files, o["max-input-tokens"]);
  const meta = [`- Base: ${baseHash}`, `- Head: ${headHash}`, `- Diff-mód: ${o["no-diff"] ? "nincs diff" : o["diff-mode"] === "range" ? "base..head (összevont hatás)" : "base...head (PR)"}`,
    o.paths.length ? `- Útvonal-szűrő: ${o.paths.join(", ")}` : null,
    skippedPaths.length ? `- Kizárt (bináris / mérés / lock / .env) útvonalak száma: ${skippedPaths.length}` : null].filter(Boolean).join("\n");
  const userText = buildUserPrompt({ cim: o.cim ?? "(cím nélkül)", feladat, lista, specs, diff, files: included.sort((a, b) => a.path.localeCompare(b.path)), extras, omitted, meta });
  const sentKb = Math.round(Buffer.byteLength(userText) / 1024);

  const header = (status, usage, thinking = o.thinking) => [
    `# Külső ellenőr — ${o.cim ?? ""}`,
    "",
    "> Külső, más rendszerű ellenőr (Google Gemini); nem lát a repóba, csak a kapott diffet / fájlokat — állításait a kódból ellenőrizni kell.",
    "",
    `- Modell: \`${o.model}\` · gondolkodási szint: \`${thinking}\` (thinkingConfig.thinkingLevel=${thinking.toUpperCase()})`,
    `- Dátum (UTC): ${new Date().toISOString()}`,
    `- Base / head: \`${baseHash}\` / \`${headHash}\``,
    `- Küldött anyag: ${sentKb} KB, becsült ~${estTokens} token${usage?.countTokens ? `, countTokens: ${usage.countTokens}` : ""}; teljes fájl: ${included.length} db, kihagyott teljes fájl: ${omitted.length} db`,
    `- Állapot: ${status}`,
    omitted.length ? `- Kihagyott teljes fájlok (a diffjük benne van): ${omitted.map((f) => `\`${f.path}\``).join(", ")}` : null,
    "",
  ].filter((x) => x !== null).join("\n");

  fs.mkdirSync(path.dirname(path.resolve(o.ki)), { recursive: true });
  if (o["save-input"]) fs.writeFileSync(o["save-input"], userText);

  if (!key) {
    const msg = "KIHAGYVA: nincs GEMINI_API_KEY (környezeti változó vagy --env-file).";
    fs.writeFileSync(o.ki, header(msg) + "\n");
    log(msg);
    record(o, headHash, "skipped", null);
    return o.strict ? 2 : 0;
  }
  const ct = await countTokens(o.model, key, systemText, userText).catch((e) => ({ error: maskSecrets(e.message, key) }));
  if (ct.totalTokens && ct.totalTokens > 1_000_000) throw Object.assign(new Error(`countTokens: ${ct.totalTokens} > 1 000 000`), { code: "TOO_BIG" });
  if (o["dry-run"]) {
    const msg = `PRÓBA (dry-run): generateContent nem futott. countTokens: ${ct.totalTokens ?? ct.error}`;
    fs.writeFileSync(o.ki, header(msg, { countTokens: ct.totalTokens }, o.thinking) + "\n");
    log(msg);
    process.stdout.write(JSON.stringify({ status: "dry-run", sentKb, estTokens, countTokens: ct.totalTokens ?? null, files: included.length, omitted: omitted.length }) + "\n");
    return 0;
  }
  let res;
  try {
    res = await generate({ model: o.model, key, systemText, userText, thinking: o.thinking, log });
  } catch (e) {
    const status = e.code === "quota" ? `KIHAGYVA (kvóta / keret): ${maskSecrets(e.message, key)}` : `SIKERTELEN: ${maskSecrets(e.message, key)}`;
    fs.writeFileSync(o.ki, header(status, { countTokens: ct.totalTokens }, o.thinking) + "\n");
    log(status.slice(0, 300));
    process.stdout.write(JSON.stringify({ status: e.code === "quota" ? "quota" : "error", sentKb, estTokens, countTokens: ct.totalTokens ?? null, ms: Date.now() - started }) + "\n");
    record(o, headHash, e.code === "quota" ? "quota" : "error", null);
    return e.code === "quota" && !o.strict ? 0 : 3;
  }
  const cand = res.candidates?.[0];
  const text = (cand?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? "").join("");
  const u = res.usageMetadata ?? {};
  const ms = Date.now() - started;
  const usageMd = ["", "---", "", "## Token-felhasználás", "",
    `- Bemenet (promptTokenCount): ${u.promptTokenCount ?? "?"}`, `- Gondolkodás (thoughtsTokenCount): ${u.thoughtsTokenCount ?? "?"}`,
    `- Kimenet (candidatesTokenCount): ${u.candidatesTokenCount ?? "?"}`, `- Összesen (totalTokenCount): ${u.totalTokenCount ?? "?"}`,
    `- finishReason: ${cand?.finishReason ?? "?"} · modellverzió: ${res.modelVersion ?? "?"} · futásidő: ${(ms / 1000).toFixed(1)} s`].join("\n");
  const status = cand?.finishReason === "STOP" ? "LEFUTOTT" : `LEFUTOTT, DE finishReason=${cand?.finishReason ?? "?"} (a válasz csonka lehet)`;
  fs.writeFileSync(o.ki, maskSecrets(header(status, { countTokens: ct.totalTokens }, o.thinking) + "\n" + text + "\n" + usageMd + "\n", key));
  record(o, headHash, "ok", u);
  process.stdout.write(JSON.stringify({ status: "ok", finishReason: cand?.finishReason, sentKb, estTokens, countTokens: ct.totalTokens ?? null, usage: u, ms }) + "\n");
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main(process.argv.slice(2)).then((c) => process.exit(c), (e) => {
    process.stderr.write(`[external-review] HIBA (${e.code ?? "?"}): ${maskSecrets(e.message, process.env.GEMINI_API_KEY)}\n`);
    process.exit(e.code === "SECRET" ? 4 : e.code === "TOO_BIG" ? 5 : 1);
  });
}
