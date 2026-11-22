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
 *   --rendszer <helyi fájl> (a rendszer-utasítás felülírása, pl. szintézishez),
 *   --api interactions|stream (alap: interactions, háttér-mód + lekérdezés), --max-output-tokens N, --resume-id <azonosító>,
 *   --save-input <fájl> (a pontosan elküldött szöveg), --include-bank-data (a nyers szó- / évfolyam-bank adatfájlok is),
 *   --record (external-<fej>.json a kapuk bizonyíték-tárába; a pre-pr / pre-merge kapu figyelmeztetésként olvassa).
 * Siker CSAK: nem üres válasz + finishReason STOP + ítélet-fejezet a jelentésben; minden más hiányos / blokkolt, nem nulla kilépés.
 *
 * A kulcs: GEMINI_API_KEY környezeti változó, vagy --env-file. Soha nem kerül kimenetbe: minden szöveg, amely a
 * folyamatból kimegy (hiba, jelentés), átmegy a maskSecrets()-en.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import https from "node:https";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { evidenceDir, writeEvidence } from "./lib.mjs";
import { clipText, maskText, PH_EXTERNAL, WINDOW } from "./kitakaro.mjs";

export const DEFAULT_MODEL = "gemini-4-carbon";
// generateContent REST: ThinkingConfig.thinkingLevel enum (MINIMAL/LOW/MEDIUM/HIGH/XHIGH). Tulajdonosi döntés: sima HIGH.
export const DEFAULT_THINKING = "high";
export const DEFAULT_MAX_INPUT_TOKENS = 600_000;
export const MAX_OUTPUT_TOKENS = 32_768; // a gemini-4-carbon outputTokenLimit-je nem-streamelve (GET /v1beta/models/gemini-4-carbon)
// Interactions háttér-mód: a gondolkodás + kimenet közös kerete; 131 072 = legfeljebb ~1,31 USD kimenet hívásonként (költségfék).
export const INTERACTION_MAX_OUTPUT_TOKENS = 131_072;
export const STREAM_MAX_OUTPUT_TOKENS = 65_536; // streamelve (aistudio.google.com/docs/thinking: „Streaming … up to 65,536 tokens”); a gondolkodás is ebbe számít
const API = "https://generativelanguage.googleapis.com/v1beta/models/";

// ---------------------------------------------------------------- argumentumok
export function parseArgs(argv) {
  const multi = new Set(["spec", "paths", "fajl", "extra"]);
  const flags = new Set(["dry-run", "strict", "no-diff", "record", "include-bank-data"]);
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
// A nyers szó- / évfolyam-bank adatfájlok (több ezer sor szöveg) alapból kimaradnak: drágák, és kódhibát nem hordoznak.
const BANK_DATA = /(^|\/)source\/client\/src\/data\/(?:vocabBank\/[^/]+\/level-\d+\.ts|gradeQuizBank\/grade-\d+\.ts)$/;
export function isBankData(p) { return BANK_DATA.test(p.replace(/\\/g, "/")); }
const isExcludedPathBase = (p, opts) => isExcludedPath(p, opts);
export function isExcludedPath(p, { includeBankData = false } = {}) {
  const n = p.replace(/\\/g, "/");
  if (!includeBankData && isBankData(n)) return true;
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
  { kind: "Render-kulcs", re: /\brnd_[A-Za-z0-9]{20,}/ },
  { kind: "Neon-jelszó", re: /\bnpg_[A-Za-z0-9]{12,}/ },
  { kind: "privát kulcs", re: /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----/ },
  { kind: "JWT", re: /\beyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}/ },
  { kind: "Authorization-fejléc", re: /\bAuthorization\s*["']?\s*[:=]\s*["']?\s*(?:Bearer|Basic|Token|token)\s+[A-Za-z0-9._~+/=-]{8,}/i },
  { kind: "Bearer-token", re: /\bBearer\s+[A-Za-z0-9._~+/-]{20,}=*/ },
];

/**
 * Kapcsolati URL-ek: MINDEN előfordulás külön vizsgálva (a független review / Codex P1 / Vercel: a soronkénti loopback-kivétel egy
 * utána álló távoli, jelszavas URL-t is felmentett). Fail-closed: jelszavas userinfo NEM-loopback gazdán, vagy jelszó a
 * lekérdezésben → titok. Mentes csak a loopback gazda (localhost, 127.x, ::1) és az egyértelmű helyőrző-jelszó (`${…}`, `<…>`, `$VAR`).
 */
const URL_WITH_USERINFO = /\b([a-z][a-z0-9+.-]{1,20}):\/\/([^\s/@'"`<>]*)@(\[[^\]\s]+\]|[^\s/:?#'"`<>]+)/gi;
const QUERY_SECRET = /[?&](?:password|passwd|pwd|pass|secret|token|access_token|api_key|apikey|key|auth)=([^&#\s'"`<>]+)/gi;
// Csak az egyértelmű helyőrző mentes (fail-closed, visszaellenőrzés C1): `${…}`, csupa nagybetűs `$VALTOZO` / `%VALTOZO%`, `<…>`,
// `{{…}}`, `***`, `xxx`, `...`. Egy `$`-ral kezdődő valódi jelszó (pl. `$Ab12cd`) titok.
const PLACEHOLDER = /^(?:\$\{[^}]*\}|\$[A-Z_][A-Z0-9_]*|<[^>]*>|%[A-Z_]+%|\{\{[^}]*\}\}|\*+|[xX]{3,}|\.\.\.)$/;
export function isLoopbackHost(host) {
  const h = String(host).toLowerCase().replace(/^\[|\]$/g, "");
  return h === "localhost" || /^127(?:\.\d{1,3}){3}$/.test(h) || h === "::1" || h === "0:0:0:0:0:0:0:1";
}
export function scanConnectionUrls(line) {
  const kinds = [];
  for (const m of line.matchAll(URL_WITH_USERINFO)) {
    const userinfo = m[2];
    const cut = userinfo.indexOf(":");
    if (cut < 0) continue; // jelszó nélküli userinfo
    const pw = userinfo.slice(cut + 1);
    if (!pw || PLACEHOLDER.test(pw)) continue;
    if (isLoopbackHost(m[3])) continue;
    kinds.push("jelszavas kapcsolati URL");
  }
  for (const m of line.matchAll(QUERY_SECRET)) if (!PLACEHOLDER.test(m[1])) kinds.push("titok URL-paraméterben");
  return kinds;
}
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
 * A skipRemoved csak olyan szövegnél használható, amelynek a törölt sorai NEM mennek ki; a diffet a fő folyamat teljes egészében szűri.
 */
export function scanSecrets(text, source, { skipRemoved = false } = {}) {
  const hits = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (skipRemoved && line.startsWith("-") && !line.startsWith("---")) continue;
    for (const p of SECRET_PATTERNS) if (p.re.test(line)) hits.push({ source, line: i + 1, kind: p.kind });
    for (const kind of scanConnectionUrls(line)) hits.push({ source, line: i + 1, kind });
    for (const m of line.matchAll(EMAIL)) if (!isAllowedEmail(m[0])) hits.push({ source, line: i + 1, kind: "nem engedélyezett e-mail-cím" });
  }
  return hits;
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
/**
 * A kulcs és minden ismert titokforma (AIza, Bearer, GitHub- / sk-token, AWS-kulcs, DB-URL, e-mail) kitakarva — a közös,
 * lineáris kitakaróval (kitakaro.mjs, D6): a tartományok az eredeti szövegen és JSON-escape-dekódolt nézetén, egyesítve.
 */
export function maskSecrets(s, key) {
  return maskText(s, { keys: key ? [key] : [], ph: PH_EXTERNAL, compat: 'external' });
}

/** A maszkolás ablaka: a vágott kimenetű hívók csak ennyit maszkolnak a (akár óriási) válaszból. */
export const MASK_WINDOW = WINDOW;

/**
 * Kitakarás és vágás `max` hosszra (kitakaro.mjs `clipText`): legfeljebb max(MASK_WINDOW, max) hosszú szövegen a régi
 * viselkedés; különben a vágáspont se érzékeny tartományt, se token- / e-mail-futást nem metsz.
 */
export function maskClip(s, key, max) {
  return clipText(s, { keys: key ? [key] : [], ph: PH_EXTERNAL, max, compat: 'external' });
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
export function collectDiff(repo, base, head, mode, paths, opts = {}) {
  const isExcludedPath = (p) => isExcludedPathBase(p, opts);
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
  // null: a spec-olvasó erre hibát dob (megáll); a teljes fájl kimarad a küldésből (kevesebb bemenet, ártalmatlan).
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
/**
 * node:https, nem fetch: a Node beépített fetch-e (undici) 300 s-os headersTimeout-tal dolgozik, a nem-streamelő
 * generateContent pedig a fejlécet csak a teljes (akár 10+ perces, magas gondolkodású) válasz végén küldi → a fetch
 * 5 percnél megszakad, és a hívás feleslegesen újraindul (mérve 2026-11-17). Itt csak a saját teljes időkorlát él.
 */
function postJson(url, key, body, timeoutMs) {
  const data = Buffer.from(JSON.stringify(body));
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: "POST", headers: { "x-goog-api-key": key, "content-type": "application/json", "content-length": data.length } }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, text: Buffer.concat(chunks).toString("utf8"), retryAfter: res.headers["retry-after"] ?? null }));
      res.on("error", reject);
    });
    req.setTimeout(0);
    req.on("socket", (s) => s.setKeepAlive(true, 30_000));
    const timer = setTimeout(() => req.destroy(Object.assign(new Error(`időtúllépés ${Math.round(timeoutMs / 60000)} perc után`), { code: "TIMEOUT" })), timeoutMs);
    req.on("close", () => clearTimeout(timer));
    req.on("error", reject);
    req.end(data);
  });
}
export async function countTokens(model, key, systemText, userText) {
  const r = await postJson(`${API}${model}:countTokens`, key, { contents: [{ role: "user", parts: [{ text: `${systemText}\n\n${userText}` }] }] }, 120_000);
  if (r.status !== 200) return { error: `HTTP ${r.status}: ${maskClip(r.text, key, 400)}` };
  return { totalTokens: JSON.parse(r.text).totalTokens };
}
/**
 * SSE-folyam (streamGenerateContent?alt=sse) feldolgozása: a darabok szövegét összefűzi (a `thought: true` részeket nem),
 * a `usageMetadata`-t és a `finishReason`-t az utolsó előfordulásból veszi. Tiszta függvény (tesztelhető).
 */
export function parseSse(raw) {
  let text = "", usage = null, finishReason = null, modelVersion = null, events = 0, blockReason = null;
  for (const block of raw.split(/\r?\n\r?\n/)) {
    const data = block.split(/\r?\n/).filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trimStart()).join("\n");
    if (!data || data === "[DONE]") continue;
    let j;
    try { j = JSON.parse(data); } catch { continue; } // csonka utolsó esemény (megszakadt folyam): a finishReason hiánya jelzi
    events++;
    if (j.promptFeedback?.blockReason) blockReason = j.promptFeedback.blockReason;
    const c = j.candidates?.[0];
    for (const p of c?.content?.parts ?? []) if (!p.thought && typeof p.text === "string") text += p.text;
    if (c?.finishReason) finishReason = c.finishReason;
    if (j.usageMetadata) usage = j.usageMetadata;
    if (j.modelVersion) modelVersion = j.modelVersion;
  }
  return { text, usage, finishReason, modelVersion, events, blockReason };
}

const VERDICT_RE = /^#{1,3}\s*Ítélet\b[^\n]*\n+(?:\s*\n)*[^\n]*?\b(IGEN,\s*FELTÉTELLEL|IGEN|NEM|RENDBEN|FELTÉTELLEL|KOCKÁZATOS)(?![A-Za-zÁÉÍÓÖŐÚÜŰáéíóöőúüű])/imu;
const BLOCK_FINISH = new Set(["SAFETY", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII", "RECITATION", "IMAGE_SAFETY", "BLOCKED"]);
/**
 * A válasz minősítése (Codex P2 / Vercel a #490-en: HTTP 200, de nincs jelölt / szöveg → hamis „ok”). Siker CSAK: nem üres
 * szöveg, finishReason STOP (Interactions: completed → STOP), és a szövegben ítélet-fejezet (IGEN / IGEN, FELTÉTELLEL / NEM; köteg:
 * RENDBEN / FELTÉTELLEL / KOCKÁZATOS). Minden más `blocked` vagy `incomplete`.
 * @returns {{ status: 'ok'|'blocked'|'incomplete', reason: string }}
 */
export function evaluateResponse(res) {
  const text = String(res?.text ?? "");
  if (res?.blockReason || BLOCK_FINISH.has(String(res?.finishReason ?? ""))) return { status: "blocked", reason: `blokkolva (${res.blockReason ?? res.finishReason})` };
  if (res?.finishReason !== "STOP") return { status: "incomplete", reason: `finishReason=${res?.finishReason ?? "nincs"}` };
  if (!text.trim()) return { status: "incomplete", reason: "üres válasz" };
  // A kódblokkokon kívüli szöveg számít (visszaellenőrzés: a kódblokkban álló vagy visszhangzott sablon ne legyen „ok”).
  const prose = text.replace(/```[\s\S]*?(?:```|$)/g, "");
  if (!VERDICT_RE.test(prose)) return { status: "incomplete", reason: "nincs ítélet-fejezet a válaszban" };
  const missing = ["Blokkoló leletek", "Egyéb leletek", "Mit vizsgált"].filter((h) => !new RegExp(`^#{1,3}\\s*${h}`, "im").test(prose));
  if (missing.length) return { status: "incomplete", reason: `hiányzó kötelező fejezet: ${missing.join(", ")}` };
  if (/\(egy sor: ÖSSZEVONHATÓ — IGEN \/ IGEN, FELTÉTELLEL \/ NEM/.test(prose)) return { status: "incomplete", reason: "a válasz a sablont ismétli" };
  return { status: "ok", reason: "" };
}

function postStream(url, key, body, timeoutMs) {
  const data = Buffer.from(JSON.stringify(body));
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: "POST", headers: { "x-goog-api-key": key, "content-type": "application/json", accept: "text/event-stream", "content-length": data.length } }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, text: Buffer.concat(chunks).toString("utf8"), retryAfter: res.headers["retry-after"] ?? null, complete: res.complete }));
      res.on("aborted", () => reject(Object.assign(new Error("a folyam megszakadt (aborted)"), { code: "CONN" })));
      res.on("error", (e) => reject(Object.assign(e, { code: "CONN" })));
    });
    req.setTimeout(0);
    req.on("socket", (s) => s.setKeepAlive(true, 30_000));
    const timer = setTimeout(() => req.destroy(Object.assign(new Error(`időtúllépés ${Math.round(timeoutMs / 60000)} perc után`), { code: "TIMEOUT" })), timeoutMs);
    req.on("close", () => clearTimeout(timer));
    req.on("error", (e) => reject(e.code === "TIMEOUT" ? e : Object.assign(e, { code: "CONN" })));
    req.end(data);
  });
}

/**
 * Streamelt hívás, maxOutputTokens 65 536 (a gemini-4-carbon streamelve ennyit enged; nem-streamelve 32 768, és a
 * gondolkodás is ebbe számít — mérve: high szinten 32 765 gondolkodási tokennél MAX_TOKENS, üres válasz).
 * Újrapróbálás CSAK 429 / 5xx válaszkódra (a jelzett várakozással); időtúllépés / megszakadt kapcsolat / finishReason
 * nélküli folyam = hiba, nincs ismétlés (a szerver valószínűleg már kiszámlázta).
 */
export async function generate({ model, key, systemText, userText, thinking, maxOutputTokens = STREAM_MAX_OUTPUT_TOKENS, timeoutMs = 30 * 60_000, retries = 3, log = () => {}, transport = postStream, sleep = (ms) => new Promise((res) => setTimeout(res, ms)) }) {
  const body = {
    systemInstruction: { parts: [{ text: systemText }] },
    contents: [{ role: "user", parts: [{ text: userText }] }],
    // A Gemini 4 modellek a temperature/topP/topK-t figyelmen kívül hagyják (aistudio.google.com/docs/text-generation), ezért nem küldjük.
    generationConfig: { maxOutputTokens, thinkingConfig: { thinkingLevel: thinking.toUpperCase() } },
  };
  let last, attempts = 0;
  for (let attempt = 0; attempt <= retries; attempt++) {
    attempts++;
    let r;
    try {
      r = await transport(`${API}${model}:streamGenerateContent?alt=sse`, key, body, timeoutMs);
    } catch (e) {
      throw Object.assign(new Error(maskSecrets(e.message, key)), { code: e.code ?? "CONN", attempts });
    }
    if (r.status === 200) {
      const p = parseSse(r.text);
      if (!p.finishReason && p.blockReason) return { ...p, finishReason: "BLOCKED", attempts };
      if (!p.finishReason) throw Object.assign(new Error(`a folyam finishReason nélkül ért véget (${p.events} esemény, complete=${r.complete})`), { code: "INCOMPLETE", attempts, usage: p.usage });
      return { ...p, attempts };
    }
    const cls = classifyHttp(r.status, r.text);
    last = Object.assign(new Error(`HTTP ${r.status}: ${maskClip(r.text, key, 600)}`), { code: cls, attempts });
    if (cls !== "retry") throw last;
    if (attempt < retries) { const w = Math.max(retryWaitMs(r), 15_000 * 2 ** attempt); log(`újrapróbálás ${attempt + 1}/${retries} ${w / 1000} s múlva: ${maskClip(last.message, key, 160)}`); await sleep(w); }
  }
  throw last;
}

/** Interactions-válaszból a végleges szöveg (a model_output lépések text tartalma) és a usage generateContent-alakra fordítva. */
export function parseInteraction(j) {
  let text = "";
  for (const s of j.steps ?? []) if (s.type === "model_output") for (const c of s.content ?? []) if (c.type === "text" && typeof c.text === "string") text += c.text;
  const u = j.usage ?? {};
  const usage = { promptTokenCount: u.total_input_tokens, thoughtsTokenCount: u.total_thought_tokens, candidatesTokenCount: u.total_output_tokens, totalTokenCount: u.total_tokens, cachedContentTokenCount: u.total_cached_tokens };
  return { text, usage, status: j.status, finishReason: j.status === "completed" ? "STOP" : String(j.status ?? "?").toUpperCase(), modelVersion: j.model, events: (j.steps ?? []).length };
}

function reqJson(method, url, key, body, timeoutMs = 120_000) {
  const data = body ? Buffer.from(JSON.stringify(body)) : null;
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method, headers: { "x-goog-api-key": key, "content-type": "application/json", ...(data ? { "content-length": data.length } : {}) } }, (res) => {
      const chunks = []; res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, text: Buffer.concat(chunks).toString("utf8"), retryAfter: res.headers["retry-after"] ?? null }));
      res.on("error", (e) => reject(Object.assign(e, { code: "CONN" })));
    });
    const timer = setTimeout(() => req.destroy(Object.assign(new Error("időtúllépés"), { code: "TIMEOUT" })), timeoutMs);
    req.on("close", () => clearTimeout(timer));
    req.on("error", (e) => reject(e.code === "TIMEOUT" ? e : Object.assign(e, { code: "CONN" })));
    req.end(data);
  });
}

/**
 * Interactions API, háttér-mód (aistudio.google.com/docs/long-decode): `background: true`, `max_output_tokens` > 65 536 →
 * a szerver futtatja a folytatási lépéseket, mi lekérdezzük. Így a `high` gondolkodás nem fogyasztja el a keretet
 * (mérve: generateContent-tel 104 ezer token bemenetnél 65 533 gondolkodási tokennél MAX_TOKENS, üres válasz).
 * Az interakció-azonosítót azonnal elmenti (`onId`), hogy megszakadt kliens után is lekérdezhető legyen (`--resume-id`).
 */
export async function generateInteraction({ model, key, systemText, userText, thinking, maxOutputTokens = INTERACTION_MAX_OUTPUT_TOKENS, pollMs = 20_000, timeoutMs = 90 * 60_000, retries = 3, resumeId = null, onId = () => {}, log = () => {} }) {
  const B = "https://generativelanguage.googleapis.com/v1beta/interactions";
  let id = resumeId, attempts = 0;
  if (!id) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      attempts++;
      const r = await reqJson("POST", B, key, { model, system_instruction: systemText, input: userText, background: true,
        generation_config: { max_output_tokens: maxOutputTokens, thinking_level: thinking.toLowerCase() } }, 300_000)
        .catch((e) => { throw Object.assign(new Error(maskSecrets(e.message, key)), { code: e.code ?? "CONN", attempts }); });
      if (r.status === 200) { id = JSON.parse(r.text).id; break; }
      const cls = classifyHttp(r.status, r.text);
      const err = Object.assign(new Error(`HTTP ${r.status}: ${maskClip(r.text, key, 600)}`), { code: cls, attempts });
      if (cls !== "retry" || attempt === retries) throw err;
      const w = Math.max(retryWaitMs(r), 15_000 * 2 ** attempt); log(`újrapróbálás ${attempt + 1}/${retries} ${w / 1000} s múlva: ${err.message.slice(0, 160)}`); await new Promise((res) => setTimeout(res, w));
    }
  }
  onId(id);
  const t0 = Date.now();
  let pollErrors = 0;
  while (true) {
    if (Date.now() - t0 > timeoutMs) throw Object.assign(new Error(`időtúllépés: az interakció ${Math.round(timeoutMs / 60000)} perc után sem zárult le (azonosító elmentve)`), { code: "TIMEOUT", attempts: Math.max(attempts, 1), interactionId: id });
    await new Promise((res) => setTimeout(res, pollMs));
    let r;
    try { r = await reqJson("GET", `${B}/${encodeURIComponent(id)}`, key); } catch (e) { if (++pollErrors > 10) throw Object.assign(new Error(maskSecrets(e.message, key)), { code: "CONN", attempts, interactionId: id }); continue; }
    if (r.status !== 200) { if (r.status >= 500 || r.status === 429) { if (++pollErrors > 10) throw Object.assign(new Error(`lekérdezés: HTTP ${r.status}`), { code: "CONN", attempts, interactionId: id }); continue; }
      throw Object.assign(new Error(`lekérdezés: HTTP ${r.status}: ${maskClip(r.text, key, 400)}`), { code: "fatal", attempts, interactionId: id }); }
    const j = JSON.parse(r.text);
    if (["in_progress", "queued"].includes(j.status)) continue;
    const p = parseInteraction(j);
    if (j.status !== "completed") throw Object.assign(new Error(`az interakció állapota: ${j.status}`), { code: "INCOMPLETE", attempts: Math.max(attempts, 1), usage: p.usage, interactionId: id, partial: p });
    return { ...p, attempts: Math.max(attempts, 1), interactionId: id };
  }
}

/** 429-nél a válaszban jelzett várakozás (Retry-After fejléc vagy RetryInfo.retryDelay, pl. "37s"), ezredmásodpercben. */
export function retryWaitMs(r) {
  if (r.retryAfter && /^\d+$/.test(r.retryAfter)) return Number(r.retryAfter) * 1000;
  const m = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(r.text ?? "");
  return m ? Math.ceil(Number(m[1]) * 1000) + 1000 : 0;
}

// ---------------------------------------------------------------- fő folyamat
export function readLocal(p) { return fs.readFileSync(p, "utf8"); }

// ---------------------------------------------------------------- bizonyíték (--record)
/**
 * `external-<fej>.json` a kapuk bizonyíték-tárába (docs/specs/2026-11-17-kulso-ellenor.md K4): állapot (ok / incomplete / blocked /
 * error / quota / skipped), modell, token-összegek, a jelentés útja és SHA-256-ja. Kulcs és jelentés-szöveg NINCS benne.
 */
export function externalRecord({ head, status, model, thinking, usage, report, reason = "", now = () => new Date() }) {
  let sha = null;
  try { sha = createHash("sha256").update(fs.readFileSync(report)).digest("hex"); } catch { /* nincs jelentés */ }
  return { kind: "external", head, status, ok: status === "ok", reason, model, thinking, at: now().toISOString(), report: path.resolve(report), reportSha256: sha,
    usage: usage ? { prompt: usage.promptTokenCount ?? null, thoughts: usage.thoughtsTokenCount ?? null, output: usage.candidatesTokenCount ?? null, total: usage.totalTokenCount ?? null } : null };
}
function record(o, head, status, usage, report, reason = "") {
  if (!o.record || !o.repo || head === "-") return;
  let common = git(o.repo, ["rev-parse", "--git-common-dir"]).trim();
  if (!path.isAbsolute(common)) common = path.resolve(o.repo, common);
  writeEvidence(evidenceDir(common), `external-${head}`, externalRecord({ head, status, model: o.model, thinking: o.thinking, usage, report, reason }));
}

// A futás kulcsa a legfelső hibaág maszkolásához (K1: az --env-file kulcsa nincs a process.env-ben).
let activeKey = null;

export async function main(argv) {
  const o = parseArgs(argv);
  const started = Date.now();
  const log = (m) => process.stderr.write(`[external-review] ${m}\n`);
  let key = process.env.GEMINI_API_KEY || null;
  if (!key && o["env-file"]) key = readKeyFromEnvFile(o["env-file"]);
  activeKey = key;

  // 1. bemenet
  let diff = null, changed = [], added = new Set(), skippedPaths = [], baseHash = "-", headHash = "-";
  const hasRepo = Boolean(o.repo && o.head);
  if (hasRepo) headHash = git(o.repo, ["rev-parse", o.head]).trim();
  if (hasRepo && o.base) baseHash = git(o.repo, ["rev-parse", o.base]).trim();
  if (!o["no-diff"]) {
    ({ diff, changed, added, skippedPaths } = collectDiff(o.repo, o.base, o.head, o["diff-mode"], o.paths, { includeBankData: Boolean(o["include-bank-data"]) }));
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
    if (isExcludedPath(p, { includeBankData: Boolean(o["include-bank-data"]) })) continue;
    const t = showFile(o.repo, o.head, p);
    if (t !== null && !t.includes("\u0000")) files.push({ path: p, text: t });
  }

  // 2. titok-szűrés (küldés előtt, mindenre)
  const hits = [];
  // A törölt ("-") sorok is kimennek a diffben → azokat is szűrjük (független review B1: a kiszivárgott kulcs eltávolítása a leggyakoribb eset).
  if (diff) hits.push(...scanSecrets(diff, "diff"));
  for (const f of files) hits.push(...scanSecrets(f.text, f.path));
  for (const s of specs) hits.push(...scanSecrets(s.text, s.label));
  for (const e of extras) hits.push(...scanSecrets(e.text, e.label));
  hits.push(...scanSecrets(lista, "lista"), ...scanSecrets(feladat, "feladat"));
  // A rendszer-utasítás és a cím is kimegy (review J-a).
  hits.push(...scanSecrets(systemText, "rendszer-utasítás"), ...scanSecrets(String(o.cim ?? ""), "cím"));
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
    `- Modell: \`${o.model}\` · gondolkodási szint: \`${thinking}\` (${(o.api ?? "interactions") === "stream" ? `streamGenerateContent, thinkingLevel=${thinking.toUpperCase()}` : `Interactions API háttér-mód, thinking_level=${thinking}, max_output_tokens=${o["max-output-tokens"] ?? INTERACTION_MAX_OUTPUT_TOKENS}`})`,
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
    record(o, headHash, "skipped", null, o.ki, "nincs GEMINI_API_KEY");
    return o.strict ? 2 : 0;
  }
  const ct = await countTokens(o.model, key, systemText, userText).catch((e) => ({ error: maskSecrets(e.message, key) }));
  if (ct.totalTokens && ct.totalTokens > 1_000_000) throw Object.assign(new Error(`countTokens: ${ct.totalTokens} > 1 000 000`), { code: "TOO_BIG" });
  if (o["dry-run"]) {
    const msg = `PRÓBA (dry-run): generateContent nem futott. countTokens: ${ct.totalTokens ?? ct.error}`;
    fs.writeFileSync(o.ki + ".proba.md", header(msg, { countTokens: ct.totalTokens }, o.thinking) + "\n"); // a valódi jelentést nem írja felül
    log(msg);
    process.stdout.write(JSON.stringify({ status: "dry-run", sentKb, estTokens, countTokens: ct.totalTokens ?? null, files: included.length, omitted: omitted.length }) + "\n");
    return 0;
  }
  let res;
  try {
    const api = o.api ?? "interactions";
    const maxOut = o["max-output-tokens"] ? Number(o["max-output-tokens"]) : undefined;
    res = api === "stream"
      ? await generate({ model: o.model, key, systemText, userText, thinking: o.thinking, maxOutputTokens: maxOut, log })
      : await generateInteraction({ model: o.model, key, systemText, userText, thinking: o.thinking, maxOutputTokens: maxOut, resumeId: o["resume-id"] ?? null, log,
        onId: (id) => { fs.writeFileSync(o.ki + ".interaction-id", id + "\n"); log(`interakció: ${id}`); } });
  } catch (e) {
    const status = e.code === "quota" ? `KIHAGYVA (kvóta / keret): ${maskSecrets(e.message, key)}` : `SIKERTELEN (${e.code ?? "?"}, ${e.attempts ?? 1} próba): ${maskSecrets(e.message, key)}`;
    fs.writeFileSync(o.ki + ".hiba.md", header(status, { countTokens: ct.totalTokens }, o.thinking) + "\n");
    log(status.slice(0, 300));
    // „eredmény nélkül elégett”: ha nem 4xx-szel utasította el a szerver, a bemenet (és a gondolkodás) valószínűleg számlázott
    const burned = ["TIMEOUT", "CONN", "INCOMPLETE"].includes(e.code) ? (ct.totalTokens ?? 0) * (e.attempts ?? 1) : 0;
    process.stdout.write(JSON.stringify({ status: e.code === "quota" ? "quota" : "error", code: e.code, attempts: e.attempts ?? 1, burnedInputTokens: burned, usage: e.usage ?? undefined, sentKb, estTokens, countTokens: ct.totalTokens ?? null, ms: Date.now() - started }) + "\n");
    record(o, headHash, e.code === "quota" ? "quota" : e.code === "INCOMPLETE" ? "incomplete" : "error", e.usage ?? null, o.ki + ".hiba.md", String(e.code ?? "hiba"));
    return e.code === "quota" ? (o.strict ? 2 : 0) : 3; // K2: kvóta / keret --strict mellett 2 (review J-b)
  }
  const u = res.usage ?? {};
  const ms = Date.now() - started;
  const usageMd = ["", "---", "", "## Token-felhasználás", "",
    `- Bemenet (promptTokenCount): ${u.promptTokenCount ?? "?"}`, `- Gondolkodás (thoughtsTokenCount): ${u.thoughtsTokenCount ?? "?"}`,
    `- Kimenet (candidatesTokenCount): ${u.candidatesTokenCount ?? "?"}`, `- Összesen (totalTokenCount): ${u.totalTokenCount ?? "?"}`,
    `- finishReason: ${res.finishReason} · modellverzió: ${res.modelVersion ?? "?"} · lépések / események: ${res.events} · próbák: ${res.attempts}${res.interactionId ? ` · interakció: ${res.interactionId}` : ""} · futásidő: ${(ms / 1000).toFixed(1)} s`].join("\n");
  const ev = evaluateResponse(res);
  const ok = ev.status === "ok";
  const status = ok ? "LEFUTOTT" : `${ev.status === "blocked" ? "BLOKKOLT" : "HIÁNYOS"}: ${ev.reason}, ${res.text.length} karakter szöveg — NEM kész jelentés, a második vélemény HIÁNYZIK`;
  // Hiányos / blokkolt választ nem mentünk a végleges néven (ne olvassa senki késznek).
  const out = ok ? o.ki : o.ki + ".hianyos.md";
  fs.writeFileSync(out, maskSecrets(header(status, { countTokens: ct.totalTokens }, o.thinking) + "\n" + res.text + "\n" + usageMd + "\n", key));
  record(o, headHash, ev.status, u, out, ev.reason);
  process.stdout.write(JSON.stringify({ status: ev.status, reason: ev.reason, finishReason: res.finishReason, textChars: res.text.length, sentKb, estTokens, countTokens: ct.totalTokens ?? null, usage: u, ms }) + "\n");
  return ok ? 0 : 3;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main(process.argv.slice(2)).then((c) => process.exit(c), (e) => {
    process.stderr.write(`[external-review] HIBA (${e.code ?? "?"}): ${maskSecrets(e.message, activeKey || process.env.GEMINI_API_KEY)}\n`);
    process.exit(e.code === "SECRET" ? 4 : e.code === "TOO_BIG" ? 5 : 1);
  });
}
