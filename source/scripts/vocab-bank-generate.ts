/**
 * Szóbank-bővítés keretes, gépileg számlált fizetős generálással (Szólétra S3; végrehajtás:
 * docs/specs/2026-11-22-szoletra-szintezes-vegrehajtas.md 10–13. lépés). Futtatás a `source/` mappából:
 *
 *   node --import tsx scripts/vocab-bank-generate.ts generate --lang <l> --step <0|1> --count <n> --out <jelölt.json> \
 *        --ledger <napló.jsonl> --budget-usd <x> [--model <m>] [--max-tokens <n>] [--exclude-from <a.json,b.json>]
 *   node --import tsx scripts/vocab-bank-generate.ts apply --lang <l> --candidates <a.json,b.json> --take0 <n> --take1 <n> \
 *        --ids-out <id-lista.json> [--dry-run]
 *   node --import tsx scripts/vocab-bank-generate.ts solve --questions <blind.json> --out <answers.json> \
 *        --ledger <napló.jsonl> --budget-usd <x> [--model <m>]
 *
 * Kulcs: csak `OPENROUTER_API_KEY` környezeti változóból (soha nem íródik ki). Költség: a válasz `usage.cost` mezője;
 * hiányában a futás megáll (nincs becslés). Futáskorlát: minden hívás ELŐTT napló-összeg + a hívás legrosszabb
 * költsége > keret → leállás hívás nélkül.
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { VOCAB_TOPICS } from "../client/src/data/vocabBank/topics";
import { BLOCKED_TERMS, normalizeTerm, vocabBankProblems } from "../client/src/data/vocabBank/validate";
import type { VocabEntry, VocabLang, VocabPos, VocabTopic } from "../client/src/data/vocabBank/types";
import { VOCAB_EN } from "../client/src/data/vocabBank/vocab-en";
import { VOCAB_DE } from "../client/src/data/vocabBank/vocab-de";
import { VOCAB_FR } from "../client/src/data/vocabBank/vocab-fr";
import { WORD_LADDER_EN } from "../client/src/data/wordLadder/en";
import { WORD_LADDER_DE } from "../client/src/data/wordLadder/de";
import { WORD_LADDER_FR } from "../client/src/data/wordLadder/fr";
import type { LadderItem } from "../client/src/data/wordLadder/types";
import { ladderDifficultyInput, vocabEntryStep } from "../client/src/lib/wordLadderGrading";

const VOCAB: Record<VocabLang, VocabEntry[]> = { en: VOCAB_EN, de: VOCAB_DE, fr: VOCAB_FR };
const MANUAL: Record<VocabLang, readonly LadderItem[]> = { en: WORD_LADDER_EN, de: WORD_LADDER_DE, fr: WORD_LADDER_FR };
const LANG_NAME: Record<VocabLang, string> = { en: "English", de: "German", fr: "French" };
const DEFAULT_GEN_MODEL = "anthropic/claude-sonnet-5.5";
const DEFAULT_SOLVE_MODEL = "anthropic/claude-opus-5.5";

export type LedgerRow = { ts: string; phase: string; model: string; promptTokens: number; completionTokens: number; costUsd: number; genId: string };
export type Candidate = { term: string; hu: string; topic: string; pos: string; example: string; exampleHu: string; alt?: string[] };

// ── költségnapló és futáskorlát ─────────────────────────────────────────────

export function ledgerTotal(path: string): number {
  if (!existsSync(path)) return 0;
  return readFileSync(path, "utf8").split("\n").filter(Boolean)
    .reduce((sum, line) => sum + (JSON.parse(line) as LedgerRow).costUsd, 0);
}

/** Legrosszabb hívásköltség: a bemenet felülbecsülve (3 karakter / token) + a teljes `max_tokens` kimenet. */
export function worstCaseCost(promptChars: number, maxTokens: number, price: { prompt: number; completion: number }): number {
  return Math.ceil(promptChars / 3) * price.prompt + maxTokens * price.completion;
}

/** Futáskorlát: true, ha a hívás a keretet túllépheti (ekkor hívni TILOS). */
export function wouldExceed(spent: number, worstCase: number, budget: number): boolean {
  return spent + worstCase > budget;
}

// ── duplikátum- és fokozatszűrés ────────────────────────────────────────────

const ARTICLE = /^(the|to|a|an|der|die|das|ein|eine|le|la|les|un|une|l'|l’)\s+|^(l'|l’)/iu;
/** Összevetési kulcs: normalizált, névelő nélkül (szigorúbb a validátornál: „le chat” = „chat”). */
export function dedupKey(term: string): string {
  return normalizeTerm(term).replace(ARTICLE, "").trim();
}

/** A nyelv minden meglévő célszava: a teljes szóbank + a kézi Szólétra-bank célrészei (mondat nélkül). */
export function existingKeys(lang: VocabLang): Set<string> {
  const keys = new Set(VOCAB[lang].map((e) => dedupKey(e.term)));
  for (const q of MANUAL[lang]) {
    const input = ladderDifficultyInput(q);
    if (!input.sentence) keys.add(dedupKey(input.term));
  }
  return keys;
}

const POS_WORD = new Set<VocabPos>(["noun", "verb", "adj", "adv", "prep", "pron", "conj", "num", "interj"]);

/** Jelölt → bejegyzés (azonosító nélkül) vagy elutasítási ok. */
export function screenCandidate(c: Candidate, lang: VocabLang, taken: Set<string>): { entry?: Omit<VocabEntry, "id">; reason?: string } {
  if (!c || typeof c.term !== "string" || typeof c.hu !== "string") return { reason: "hiányos" };
  if (!(VOCAB_TOPICS as readonly string[]).includes(c.topic)) return { reason: `téma: ${c.topic}` };
  if (!POS_WORD.has(c.pos as VocabPos)) return { reason: `pos: ${c.pos}` };
  const key = dedupKey(c.term);
  if (!key || /\s/.test(key)) return { reason: "nem egyes szó" };
  if (taken.has(key)) return { reason: "duplikátum" };
  if (BLOCKED_TERMS[lang].some((b) => normalizeTerm(b) === key)) return { reason: "tiltott" };
  const entry: Omit<VocabEntry, "id"> = {
    term: c.term.trim(), hu: c.hu.trim(), kind: "word", level: 0, topic: c.topic as VocabTopic, pos: c.pos as VocabPos,
    example: c.example?.trim() ?? "", exampleHu: c.exampleHu?.trim() ?? "",
    ...(Array.isArray(c.alt) && c.alt.length ? { alt: c.alt.map((a) => String(a).trim()) } : {}),
  };
  const probe = { ...entry, id: `${lang}0-${entry.topic}-999` } as VocabEntry;
  const problems = vocabBankProblems([probe], lang);
  if (problems.length) return { reason: `validátor: ${problems[0]}` };
  return { entry };
}

export function stepOf(entry: Omit<VocabEntry, "id">, lang: VocabLang): number {
  return vocabEntryStep({ ...entry, id: `${lang}0-${entry.topic}-999` } as VocabEntry);
}

/** A téma következő szabad sorszáma a 0. szinten (a teljes bank azonosítóiból). */
export function nextIds(lang: VocabLang, entries: readonly VocabEntry[]): (topic: VocabTopic) => string {
  const max = new Map<string, number>();
  for (const e of entries) {
    const m = /^([a-z]{2})0-([a-z]+)-(\d{3})$/.exec(e.id);
    if (m && m[1] === lang) max.set(m[2]!, Math.max(max.get(m[2]!) ?? 0, Number(m[3])));
  }
  return (topic) => {
    const n = (max.get(topic) ?? 0) + 1;
    if (n > 999) throw new Error(`a(z) ${topic} téma sorszáma elfogyott`);
    max.set(topic, n);
    return `${lang}0-${topic}-${String(n).padStart(3, "0")}`;
  };
}

/** Egy sor a szintfájlba (a meglévő egysoros alak; idézőjel-mentesítés JSON-nal). */
export function entryLine(e: VocabEntry): string {
  const q = (s: string) => JSON.stringify(s);
  const alt = e.alt?.length ? `, alt: [${e.alt.map(q).join(", ")}]` : "";
  return `  { id: ${q(e.id)}, term: ${q(e.term)}, hu: ${q(e.hu)}, kind: "word", level: 0, topic: ${q(e.topic)}, pos: ${q(e.pos)}, example: ${q(e.example)}, exampleHu: ${q(e.exampleHu)}${alt} },`;
}

// ── OpenRouter ──────────────────────────────────────────────────────────────

async function modelPrice(model: string): Promise<{ prompt: number; completion: number }> {
  const res = await fetch("https://openrouter.ai/api/v1/models");
  if (!res.ok) throw new Error(`modellista: HTTP ${res.status}`);
  const data = (await res.json()) as { data: Array<{ id: string; pricing: { prompt: string; completion: string } }> };
  const m = data.data.find((x) => x.id === model);
  if (!m) throw new Error(`ismeretlen modell: ${model}`);
  return { prompt: Number(m.pricing.prompt), completion: Number(m.pricing.completion) };
}

async function callModel(opts: { model: string; system: string; user: string; maxTokens: number; ledger: string; budget: number; phase: string; rawOut: string }): Promise<string> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY nincs a környezetben");
  const price = await modelPrice(opts.model);
  const spent = ledgerTotal(opts.ledger);
  const worst = worstCaseCost(opts.system.length + opts.user.length, opts.maxTokens, price);
  if (wouldExceed(spent, worst, opts.budget)) {
    throw new Error(`FUTÁSKORLÁT: eddig ${spent.toFixed(4)} USD + legrosszabb hívás ${worst.toFixed(4)} USD > keret ${opts.budget} USD`);
  }
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: opts.model, max_tokens: opts.maxTokens, temperature: 0.7, usage: { include: true }, reasoning: { effort: "low" },
      messages: [{ role: "system", content: opts.system }, { role: "user", content: opts.user }],
    }),
  });
  const body = (await res.json()) as {
    id?: string; error?: { message?: string };
    choices?: Array<{ finish_reason?: string; message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number; completion_tokens_details?: { reasoning_tokens?: number } };
  };
  if (!res.ok || body.error) throw new Error(`OpenRouter hiba: HTTP ${res.status} ${body.error?.message ?? ""}`);
  const cost = body.usage?.cost;
  if (typeof cost !== "number" || !Number.isFinite(cost)) throw new Error("a válaszban nincs usage.cost — a futás megáll (nincs becslés)");
  const row: LedgerRow = {
    ts: new Date().toISOString(), phase: opts.phase, model: opts.model,
    promptTokens: body.usage?.prompt_tokens ?? 0, completionTokens: body.usage?.completion_tokens ?? 0, costUsd: cost, genId: body.id ?? "",
  };
  appendFileSync(opts.ledger, `${JSON.stringify(row)}\n`, "utf8");
  const content = body.choices?.[0]?.message?.content ?? "";
  // A nyers választ a feldolgozás ELŐTT mentjük: egy elrontott JSON ne vesszen el kifizetett kimenetként.
  writeFileSync(opts.rawOut, content, "utf8");
  const finish = body.choices?.[0]?.finish_reason ?? "?";
  const reasoning = body.usage?.completion_tokens_details?.reasoning_tokens ?? 0;
  process.stdout.write(`[${opts.phase}] ${row.promptTokens} be / ${row.completionTokens} ki token (gondolkodás ${reasoning}), vége: ${finish}, ${cost.toFixed(5)} USD; napló-összeg ${(spent + cost).toFixed(4)} USD\n`);
  return content;
}

export function parseJsonArray<T>(text: string): T[] {
  const a = text.indexOf("[");
  const b = text.lastIndexOf("]");
  if (a < 0 || b <= a) throw new Error("a válaszban nincs JSON-tömb");
  return JSON.parse(text.slice(a, b + 1)) as T[];
}

// ── promptok ────────────────────────────────────────────────────────────────

const SHAPE: Record<VocabLang, string> = {
  en: "score = letters + 2 × (vowel groups − 1)",
  de: "score = letters / 1.35 + 2 × (vowel groups − 1)  (the article der/die/das is not counted)",
  fr: "score = letters / 1.2 + 2 × (vowel groups − 1)  (the article le/la/les is not counted; a final silent e IS a vowel group)",
};
const CONVENTION: Record<VocabLang, string> = {
  en: "Nouns without article (\"cat\"), verbs as bare infinitive (\"swim\").",
  de: "Nouns ALWAYS with article and capital letter (\"der Hund\", \"die Maus\", \"das Brot\"); verbs as infinitive (\"gehen\"); adjectives lowercase.",
  fr: "Nouns ALWAYS with definite article (\"le chat\", \"la main\", \"l'eau\" with ASCII apostrophe); verbs as infinitive (\"lire\"); keep all accents (é, è, ê, ç, ô…).",
};

function generatePrompt(lang: VocabLang, step: 0 | 1, count: number, exclude: string[]): { system: string; user: string } {
  const range = step === 0 ? "score ≤ 5" : "5 < score ≤ 9";
  const system = "You are an experienced foreign-language teacher writing a beginner (CEFR A1) vocabulary bank for Hungarian children aged 8–10. You answer with a JSON array only.";
  const user = [
    `Write ${count} NEW single ${LANG_NAME[lang]} words (no multi-word phrases) that a Hungarian child in grade 3–4 learns first: very common, concrete, child-friendly A1 words.`,
    `Shape rule (it is checked by a program): ${SHAPE[lang]}; vowel groups = runs of a e i o u y ä ö ü é è ê ë à â î ï ô û ù œ æ. Every word MUST have ${range}.`,
    step === 0 ? "So: short, one-vowel-group words." : "So: short words with at most two vowel groups, or slightly longer one-group words.",
    `Conventions: ${CONVENTION[lang]}`,
    lang === "en" ? "" : `IMPORTANT for nouns: the example must contain the term WITH its article exactly as written (e.g. ${lang === "de" ? "„Der Tee ist heiß.”" : "„Le thé est chaud.”"}); if the sentence uses another form (${lang === "de" ? "den Tee, dem Tee, Tee" : "du thé, au thé, les thés"}), put exactly that form into "alt".`,
    "Spread the words over many different topics.",
    `Fields per item: term, hu (natural Hungarian meaning, may list 2 synonyms with comma), topic (one of: ${VOCAB_TOPICS.join(", ")}), pos (noun|verb|adj|adv|prep|pron|num|interj), example (a simple ${LANG_NAME[lang]} sentence of 4–10 words for children that contains the term EXACTLY as written — if the sentence needs an inflected form, add that form in "alt": ["…"]), exampleHu (accurate, natural Hungarian translation).`,
    "Sentences: start with a capital letter, end with a full stop, and contain NO ? ! : ; and NO double quote characters. Nothing about alcohol, tobacco, weapons, violence or gambling.",
    `Do NOT use any of these existing words (articles omitted): ${exclude.join(", ")}.`,
    `Return only the JSON array of ${count} objects.`,
  ].filter(Boolean).join("\n");
  return { system, user };
}

function solvePrompt(lang: string, items: unknown[]): { system: string; user: string } {
  const system = "You are a careful, independent solver checking a vocabulary quiz for Hungarian children aged 8–10. You answer with a JSON array only.";
  const user = [
    `Each item is a multiple-choice question about ${lang} vocabulary (prompt, 4 options indexed 0–3, an example sentence and its Hungarian translation).`,
    "For each item return { ref, answer (0–3 index of the single correct option, or null if none is correct), ambiguous (true if more than one option is acceptable), ageOk (false if not suitable for children), exampleOk (true only if the example is grammatical, natural AND exampleHu translates it accurately), note (short reason when anything is false/ambiguous/null, else empty) }.",
    "Solve every item yourself; do not assume the questions are correct.",
    JSON.stringify(items),
  ].join("\n");
  return { system, user };
}

// ── parancsok ───────────────────────────────────────────────────────────────

function args(argv: string[]): Record<string, string | true> {
  const out: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith("--")) throw new Error(`ismeretlen argumentum: ${a}`);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) out[a.slice(2)] = true;
    else { out[a.slice(2)] = next; i++; }
  }
  return out;
}
const need = (a: Record<string, string | true>, k: string): string => {
  const v = a[k];
  if (typeof v !== "string" || !v) throw new Error(`hiányzó --${k}`);
  return v;
};
const langOf = (a: Record<string, string | true>): VocabLang => {
  const l = need(a, "lang");
  if (l !== "en" && l !== "de" && l !== "fr") throw new Error("--lang: en | de | fr");
  return l;
};

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  const a = args(rest);
  if (cmd === "generate") {
    const lang = langOf(a);
    const step = Number(need(a, "step")) === 0 ? 0 : 1;
    const count = Number(need(a, "count"));
    // A korábbi jelöltfájlok szavai is kizárva, hogy az egymás utáni kötegek ne ismételjék egymást.
    const keys = existingKeys(lang);
    if (typeof a["exclude-from"] === "string") {
      for (const f of a["exclude-from"].split(",").filter((x) => existsSync(x))) {
        for (const c of (JSON.parse(readFileSync(f, "utf8")) as { items: Candidate[] }).items) if (typeof c?.term === "string") keys.add(dedupKey(c.term));
      }
    }
    const exclude = [...keys].sort();
    const { system, user } = generatePrompt(lang, step, count, exclude);
    const text = await callModel({
      model: typeof a.model === "string" ? a.model : DEFAULT_GEN_MODEL, system, user,
      maxTokens: typeof a["max-tokens"] === "string" ? Number(a["max-tokens"]) : Math.min(32000, 250 * count + 2000),
      ledger: need(a, "ledger"), budget: Number(need(a, "budget-usd")), phase: `generate:${lang}:step${step}`, rawOut: `${need(a, "out")}.raw.txt`,
    });
    const items = parseJsonArray<Candidate>(text);
    writeFileSync(need(a, "out"), `${JSON.stringify({ lang, step, items }, null, 1)}\n`, "utf8");
    process.stdout.write(`jelölt: ${items.length}\n`);
    return;
  }
  if (cmd === "apply") {
    const lang = langOf(a);
    const want = [Number(need(a, "take0")), Number(need(a, "take1"))];
    const taken = existingKeys(lang);
    const picked: Array<Omit<VocabEntry, "id">> = [];
    const got = [0, 0];
    const rejected: Record<string, number> = {};
    for (const file of need(a, "candidates").split(",")) {
      const { items } = JSON.parse(readFileSync(file, "utf8")) as { items: Candidate[] };
      for (const c of items) {
        const { entry, reason } = screenCandidate(c, lang, taken);
        const step = entry ? stepOf(entry, lang) : -1;
        const r = reason ?? (step > 1 ? `fokozat ${step}` : got[step]! >= want[step]! ? `fokozat ${step} betelt` : undefined);
        if (r) { const k = r.split(":")[0]!; rejected[k] = (rejected[k] ?? 0) + 1; continue; }
        taken.add(dedupKey(entry!.term));
        got[step]!++;
        picked.push(entry!);
      }
    }
    const nextId = nextIds(lang, VOCAB[lang]);
    const entries: VocabEntry[] = picked.map((e) => ({ id: nextId(e.topic), ...e }));
    const all = [...VOCAB[lang], ...entries];
    const problems = vocabBankProblems(all, lang);
    if (problems.length) throw new Error(`validátor a teljes bankon: ${problems.slice(0, 5).join(" | ")}`);
    process.stdout.write(`elfogadva: 0. fokozat ${got[0]}, 1. fokozat ${got[1]}; elutasítva: ${JSON.stringify(rejected)}\n`);
    if (a["dry-run"] === true) return;
    const file = join(dirname(fileURLToPath(import.meta.url)), `../client/src/data/vocabBank/${lang}/level-0.ts`);
    const src = readFileSync(file, "utf8");
    const end = src.lastIndexOf("];");
    if (end < 0) throw new Error("a szintfájlban nincs tömbzáró");
    const marker = "  // ── S3 (2026-11-22): A1-bővítés, 0–1. fokozatú egyes szavak (scripts/vocab-bank-generate.ts) ──\n";
    const block = (src.includes(marker) ? "" : marker) + entries.map(entryLine).join("\n") + "\n";
    writeFileSync(file, src.slice(0, end) + block + src.slice(end), "utf8");
    const idsOut = need(a, "ids-out");
    const prev = existsSync(idsOut) ? (JSON.parse(readFileSync(idsOut, "utf8")) as string[]) : [];
    writeFileSync(idsOut, `${JSON.stringify([...prev, ...entries.map((e) => e.id)], null, 1)}\n`, "utf8");
    return;
  }
  if (cmd === "solve") {
    const q = JSON.parse(readFileSync(need(a, "questions"), "utf8")) as { lang: string; items: unknown[] };
    const answers: unknown[] = [];
    const batch = 60;
    for (let i = 0; i < q.items.length; i += batch) {
      const part = q.items.slice(i, i + batch);
      const { system, user } = solvePrompt(LANG_NAME[q.lang as VocabLang] ?? q.lang, part);
      const text = await callModel({
        model: typeof a.model === "string" ? a.model : DEFAULT_SOLVE_MODEL, system, user, maxTokens: 150 * part.length + 2000,
        ledger: need(a, "ledger"), budget: Number(need(a, "budget-usd")), phase: `solve:${q.lang}:${i / batch + 1}`,
        rawOut: `${need(a, "out")}.raw-${i / batch + 1}.txt`,
      });
      answers.push(...parseJsonArray(text));
    }
    writeFileSync(need(a, "out"), `${JSON.stringify({ items: answers }, null, 1)}\n`, "utf8");
    process.stdout.write(`válasz: ${answers.length} / ${q.items.length}\n`);
    return;
  }
  throw new Error("használat: generate | apply | solve (lásd a fájl fejlécét)");
}

if (process.argv[1] && /vocab-bank-generate\.ts$/.test(process.argv[1])) {
  main().catch((e: unknown) => {
    process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
    process.exit(1);
  });
}
