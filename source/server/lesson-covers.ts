import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "./db";
import { designAssets } from "../shared/schema";
import { computeLessonArt } from "../shared/lesson-art-compute";
import { designThemeForClassroom } from "../shared/lesson-design";
import { lessonCoverId } from "../shared/lesson-cover-key";
import { hashWithoutArt, pinnedArt, SKIPPED_FILES, verifyPinned, type ArtPin } from "./lib/lesson-art-pin";
import { logger } from "./lib/logger";

/**
 * Új leckék automatikus borítója (docs/specs/2026-11-03-leckeborito-auto.md; tulajdonosi jóváhagyás 2026-11-03): a publikált, saját
 * borító nélküli lecke kivonatából Haiku-képterv → Seedream 5.0 Pro kép → Haiku-minőségkapu → `design_assets` sor → CSAK az
 * `art.picture` írása, tranzakcióban, az `art` nélküli hash-ellenőrzéssel. Napi plafon, `LESSON_COVERS=0` vészfék.
 */
export const COVER_IMAGE_MODEL = "bytedance-seed/seedream-5-0-pro";
export const COVER_TEXT_MODEL = "anthropic/claude-haiku-5.5";
/** OpenRouter-ár (2026-10-17, /endpoints): 1K kép 0,045 USD. */
export const COVER_IMAGE_USD = 0.045;
export const AUTO_ORIGIN = "MI-generált, saját (Seedream 5.0 Pro, automatikus leckeborító)";
const OPENROUTER = "https://openrouter.ai/api/v1";

/** A `design-assets/style.md` borító-, sáv- és közös sora (a katalógusképekkel azonos képi nyelv; a teszt őrzi az egyezést). */
export const COVER_STYLE = {
  kind: "Topic cover illustration for a lesson card, one clear central motif representing the topic, uncluttered background.",
  band: {
    explorer: "Soft, rounded storybook illustration, warm natural light, fresh mint and leaf greens with sunny yellow accents, simple shapes, large friendly forms, gentle depth like a modern children's picture book.",
    adventure: "Painterly adventure illustration, warm sand, apricot and orange tones with turquoise accents, sense of expedition and discovery, mountains, maps, trails, flags.",
    studio: "Mature, inspiring semi-realistic imagery, indigo, violet and teal palette, creative and scientific wonder, no cartoon characters.",
    laboratory: "Realistic, crisp photographic look, cool blues and graphite, engineering and science subjects, serious and precise, no cartoon characters.",
    future: "Cinematic, premium photographic look, deep navy with warm sunset or teal light, goals and future paths, people only seen from behind or far away, no identifiable faces.",
  },
  common: "Original artwork for a Hungarian children's learning platform. Friendly, optimistic, high quality, clean composition with generous calm space. Absolutely no text, letters, numbers, logos, watermarks, signatures or UI elements in the image. Gender-neutral and inclusive: no gender stereotypes, no pink-for-girls / blue-for-boys coding. Not resembling any existing brand, franchise, mascot or copyrighted character. Safe for children, nothing scary or violent.",
} as const;

/** Évfolyam-hangulat (ugyanaz, mint a kézi képtervekben). */
export function gradeMood(classroom: number): string {
  if (classroom >= 1 && classroom <= 4) return "Gentle, cheerful picture-book mood for young children.";
  if (classroom >= 5 && classroom <= 6) return "Adventurous, warm, lively mood for pre-teens, not babyish.";
  if (classroom >= 7 && classroom <= 8) return "Mature, inspiring mood for young teenagers, no childish cartoon look.";
  return "Serious, sophisticated, realistic mood for teenagers and adults.";
}

export type LessonDigest = { title: string; subject: string; classroom: number; headings: string[]; text: string };
/** A képtervhez a lecke kivonata: cím, tantárgy, évfolyam, fejezetcímek (≤ 10), a tanítószöveg eleje (≤ 450 karakter). */
export function lessonDigest(json: Record<string, unknown>): LessonDigest {
  const sections = Array.isArray(json.sections) ? (json.sections as Array<{ heading?: unknown; blocks?: unknown }>) : [];
  const headings = sections.map(s => (typeof s.heading === "string" ? s.heading.trim() : "")).filter(Boolean).slice(0, 10);
  const texts: string[] = [];
  for (const s of sections) for (const b of (Array.isArray(s.blocks) ? s.blocks : []) as Array<{ kind?: unknown; text?: unknown }>) {
    if (b?.kind === "explain" && typeof b.text === "string" && texts.join(" ").length < 450) texts.push(b.text.replace(/\s+/g, " ").trim());
  }
  return { title: String(json.title ?? ""), subject: String(json.subject ?? ""), classroom: Number(json.classroom ?? 0), headings, text: texts.join(" ").slice(0, 450) };
}

const PLAN_SYSTEM = `You design the cover image of ONE lesson on a Hungarian school learning platform. Read the lesson digest and answer with JSON only:
{"scene": "<English scene description, 35-70 words>", "alt": "<Hungarian, one sentence, 40-140 characters, describes what the image shows>"}
Rules:
- One concrete, specific, recognisable scene of what THIS lesson is about, never a generic school-subject picture (no generic books, pencils,
  classroom or blackboard). Literature: the world or a key scene of the work, period-accurate. History: the era and place, people only from
  behind or far away. Language lessons: an everyday situation illustrating the topic. Maths / science / IT: a vivid, tangible real-world
  depiction or experiment of the concept; IT screens show only soft abstract shapes, no logos or code.
- Hard bans: no text, letters, digits, numerals, symbols, equations, labels, signs, readable pages, written boards, maps with labels, flags
  with emblems or national flags, clock faces with numerals; no identifiable real persons' faces; no weapons; nothing scary, gory, violent or
  sad; no brands or copyrighted characters. If the topic is about numbers or letters, show it with objects, never write the symbols.
- One clear central motif, uncluttered background. Do not name an art style (it is appended automatically).`;

const QA_SYSTEM = `You check a generated lesson cover image. Answer with JSON only: {"text": boolean, "unsafe": boolean, "matches": boolean, "note": "<max 15 words>"}
- "text": true if ANY letters, digits, numerals, writing, pseudo-writing, signs, labels or national flags are visible anywhere.
- "unsafe": true if anything is scary, violent, gory, sexual, shows a weapon, or is otherwise unsuitable for school children.
- "matches": true if the image clearly shows the planned scene.`;

export type ChatPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
export type CoverDeps = {
  chat(system: string, user: ChatPart[]): Promise<string>;
  image(prompt: string): Promise<{ bytes: Buffer; mime: string }>;
};

/** Az első `{…}` blokk JSON-ként (a modell néha szöveget is ír köré); hibás válasz: null. */
export function parseJsonObject(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{"), end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try { const v = JSON.parse(text.slice(start, end + 1)); return v && typeof v === "object" && !Array.isArray(v) ? v : null; } catch { return null; }
}

export function coverPrompt(scene: string, classroom: number): string {
  return [scene, gradeMood(classroom), COVER_STYLE.kind, COVER_STYLE.band[designThemeForClassroom(classroom)], COVER_STYLE.common].join(" ");
}

export type MadeCover = { bytes: Buffer; mime: string; prompt: string; alt: string; attempts: number };
/** Egy borító: képterv, legfeljebb két kép, mindegyik a minőségkapun. Kétszeres bukás vagy hibás terv: null. */
export async function makeCover(d: LessonDigest, deps: CoverDeps): Promise<MadeCover | null> {
  const brief = `Grade: ${d.classroom || "adult learners"}\nSubject: ${d.subject}\nTitle: ${d.title}\nChapters: ${d.headings.join(" | ")}\nTeaching text: ${d.text}`;
  const plan = parseJsonObject(await deps.chat(PLAN_SYSTEM, [{ type: "text", text: brief }]));
  const scene = typeof plan?.scene === "string" ? plan.scene.trim() : "";
  if (scene.length < 20) return null;
  const alt = typeof plan?.alt === "string" && plan.alt.trim().length >= 8 ? plan.alt.trim().slice(0, 200) : `${d.title} — a lecke borítóképe.`;
  const prompt = coverPrompt(scene, d.classroom);
  for (let attempt = 1; attempt <= 2; attempt++) {
    const img = await deps.image(prompt);
    const qa = parseJsonObject(await deps.chat(QA_SYSTEM, [{ type: "text", text: `Planned scene: ${scene}` }, { type: "image_url", image_url: { url: `data:${img.mime};base64,${img.bytes.toString("base64")}` } }]));
    if (qa && qa.text === false && qa.unsafe === false && qa.matches === true) return { ...img, prompt, alt, attempts: attempt };
    logger.warn(`[lesson-covers] minőségkapu bukott (${attempt}. kép, „${d.title.slice(0, 60)}”): ${JSON.stringify(qa).slice(0, 200)}`);
  }
  return null;
}

/** OpenRouter-függőségek; a kulcs csak a fejlécben él (naplóba, hibaüzenetbe nem kerül). */
export function openRouterDeps(key: string): CoverDeps {
  const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "HTTP-Referer": "https://websuli.vip", "X-Title": "WebSuli lesson covers" };
  const fail = (what: string, status: number, body: string) => new Error(`${what}: HTTP ${status} ${body.split(key).join("[kulcs]").slice(0, 200)}`);
  return {
    async chat(system, user) {
      const res = await fetch(`${OPENROUTER}/chat/completions`, { method: "POST", headers, body: JSON.stringify({ model: COVER_TEXT_MODEL, max_tokens: 400, temperature: 0.4, messages: [{ role: "system", content: system }, { role: "user", content: user }] }) });
      const text = await res.text();
      if (!res.ok) throw fail("képterv", res.status, text);
      return (JSON.parse(text) as { choices?: Array<{ message?: { content?: string } }> }).choices?.[0]?.message?.content ?? "";
    },
    async image(prompt) {
      const res = await fetch(`${OPENROUTER}/images`, { method: "POST", headers, body: JSON.stringify({ model: COVER_IMAGE_MODEL, prompt, aspect_ratio: "3:2", resolution: "1K", n: 1 }) });
      const text = await res.text();
      if (!res.ok) throw fail("kép", res.status, text);
      const img = (JSON.parse(text) as { data?: Array<{ b64_json?: string; media_type?: string }> }).data?.[0];
      const mime = img?.media_type ?? "image/png";
      if (!img?.b64_json || !/^image\/(jpeg|png|webp)$/.test(mime)) throw new Error("kép: üres vagy nem képtípusú válasz");
      return { bytes: Buffer.from(img.b64_json, "base64"), mime };
    },
  };
}

export type LessonLite = { id: string; htmlFileId: string | null; subject: string; classroom: number; title: string; picture: string | null };
/** Az adatréteg (élesben a `db`, tesztben memóriabeli). */
export type CoverStore = {
  /** Csak a publikált leckék. */
  lessons(): Promise<LessonLite[]>;
  lessonJson(id: string): Promise<Record<string, unknown> | null>;
  storedIds(): Promise<Set<string>>;
  insertCover(row: { id: string; band: string; subject: string; title: string; alt: string; bytes: Buffer; mime: string; promptHash: string }): Promise<void>;
  /** CSAK az `art.picture` írása tranzakcióban; true: frissült, false: a lecke azóta változott (kihagyva). */
  link(lesson: LessonLite, coverId: string): Promise<boolean>;
  insertedToday(): Promise<number>;
};

/** A lecke tartalomkulcsa, ha automatikus borítót kap (ugyanaz a szabály, mint mentéskor; a mostani kép kézi pinként számít). */
export function coverTarget(l: LessonLite, storedIds: ReadonlySet<string>): string | null {
  if (l.htmlFileId && SKIPPED_FILES.has(l.htmlFileId)) return null;
  const id = lessonCoverId(l, designThemeForClassroom(l.classroom));
  const art = computeLessonArt(l, l.id, new Set([...storedIds, id]), undefined, l.picture);
  return art?.picture === id ? id : null;
}

export type SweepReport = { missing: number; made: string[]; failed: string[]; linked: number };
/** Egy söprés: a hiányzó borítók közül legfeljebb `maxImages` gyártása, majd minden érintett lecke összekötése. */
export async function sweepLessonCovers(store: CoverStore, deps: CoverDeps, opts: { maxImages: number; skip?: ReadonlySet<string> }): Promise<SweepReport> {
  let stored = await store.storedIds();
  const groups = new Map<string, LessonLite[]>();
  for (const l of await store.lessons()) {
    const id = coverTarget(l, stored);
    if (id) groups.set(id, [...(groups.get(id) ?? []), l]);
  }
  const missing = [...groups.entries()].filter(([id]) => !stored.has(id) && !opts.skip?.has(id));
  const report: SweepReport = { missing: missing.length, made: [], failed: [], linked: 0 };
  for (const [id, group] of missing.slice(0, Math.max(0, opts.maxImages))) {
    const lead = group[0];
    try {
      const json = await store.lessonJson(lead.id);
      const made = json ? await makeCover(lessonDigest(json), deps) : null;
      if (!made) { report.failed.push(id); continue; }
      await store.insertCover({ id, band: designThemeForClassroom(lead.classroom), subject: lead.subject, title: lead.title, alt: made.alt, bytes: made.bytes, mime: made.mime, promptHash: createHash("sha256").update(made.prompt).digest("hex").slice(0, 16) });
      report.made.push(id);
      logger.info(`[lesson-covers] kész: ${id} („${lead.title.slice(0, 60)}”, ${made.attempts}. kép)`);
    } catch (error) {
      report.failed.push(id);
      logger.warn(`[lesson-covers] ${id} nem készült el:`, error instanceof Error ? error.message : String(error));
    }
  }
  stored = await store.storedIds();
  for (const [id, group] of groups) {
    if (!stored.has(id)) continue;
    for (const l of group) if (l.picture !== id && (await store.link(l, id))) report.linked++;
  }
  return report;
}

/**
 * Az összekötés terve a zárolt sorból: null, ha a lecke a söprés óta változott (cím, tantárgy, évfolyam vagy a tárolt kép) —
 * különben a csere adatai az ellenőrzéshez (`verifyPinned`).
 */
export function planLink(json: Record<string, unknown>, l: LessonLite, coverId: string): ArtPin | null {
  const art = json.art && typeof json.art === "object" && !Array.isArray(json.art) ? (json.art as Record<string, unknown>) : null;
  // Review #382: art nélküli leckéhez nem írunk (csak picture-ös art mellett a lejátszó nem pótolná a kabalát és az ikont).
  if (!art) return null;
  const picture = typeof art.picture === "string" ? art.picture : null;
  if (json.title !== l.title || json.subject !== l.subject || json.classroom !== l.classroom || picture !== l.picture) return null;
  return { id: l.id, art, to: coverId, hash: hashWithoutArt(json) };
}

export const dbCoverStore: CoverStore = {
  async lessons() {
    const { rows } = await db.execute(sql`SELECT id, html_file_id, json->>'subject' AS subject, json->>'classroom' AS classroom, json->>'title' AS title,
      json->'art'->>'picture' AS picture FROM lessons WHERE published_at IS NOT NULL`);
    return (rows as Array<Record<string, unknown>>).filter(r => typeof r.subject === "string" && typeof r.title === "string" && /^\d+$/.test(String(r.classroom ?? "")))
      .map(r => ({ id: String(r.id), htmlFileId: typeof r.html_file_id === "string" ? r.html_file_id : null, subject: String(r.subject), classroom: Number(r.classroom), title: String(r.title), picture: typeof r.picture === "string" ? r.picture : null }));
  },
  async lessonJson(id) {
    const { rows } = await db.execute(sql`SELECT json FROM lessons WHERE id = ${id}`);
    const json = (rows[0] as { json?: unknown } | undefined)?.json;
    return json && typeof json === "object" ? (json as Record<string, unknown>) : null;
  },
  async storedIds() {
    return new Set((await db.select({ id: designAssets.id }).from(designAssets)).map(r => r.id));
  },
  async insertCover(row) {
    await db.insert(designAssets).values({
      id: row.id, kind: "cover", band: row.band, subjects: [row.subject], keywords: [row.title], topic: null, alt: row.alt,
      mime: row.mime, sha256: createHash("sha256").update(row.bytes).digest("hex"), bytes: row.bytes, origin: AUTO_ORIGIN,
      model: COVER_IMAGE_MODEL, promptHash: row.promptHash, approvedAt: new Date(), updatedAt: new Date(),
    }).onConflictDoNothing({ target: designAssets.id });
  },
  async link(l, coverId) {
    return db.transaction(async tx => {
      const { rows } = await tx.execute(sql`SELECT json FROM lessons WHERE id = ${l.id} FOR UPDATE`);
      const json = (rows[0] as { json?: Record<string, unknown> } | undefined)?.json;
      const pin = json ? planLink(json, l, coverId) : null;
      if (!pin) return false;
      const { rows: after } = await tx.execute(sql`UPDATE lessons SET json = jsonb_set(json, '{art}', ${JSON.stringify(pinnedArt(pin))}::jsonb, true)
        WHERE id = ${l.id} RETURNING json`);
      verifyPinned(pin, (after[0] as { json: Record<string, unknown> }).json);
      return true;
    });
  },
  async insertedToday() {
    const { rows } = await db.execute(sql`SELECT count(*)::int AS n FROM design_assets WHERE origin = ${AUTO_ORIGIN} AND approved_at >= date_trunc('day', now() AT TIME ZONE 'utc') AT TIME ZONE 'utc'`);
    return Number((rows[0] as { n?: unknown } | undefined)?.n ?? 0);
  },
};

export function coverWorkerConfig(env: Record<string, string | undefined> = process.env): { key: string; dailyLimit: number } | null {
  const key = env.OPENROUTER_API_KEY?.trim();
  if (!key || env.LESSON_COVERS === "0") return null;
  const raw = env.LESSON_COVER_DAILY_LIMIT?.trim();
  return { key, dailyLimit: raw && /^\d+$/.test(raw) ? Number(raw) : 20 };
}

/** A háttérfolyamat egy köre — a plafonnal; a `state` a folyamat napi számlálója (sikertelen kulcsok, fizetős képhívások). */
export type WorkerState = { day: string; images: number; failed: Set<string> };
export async function runCoverRound(store: CoverStore, deps: CoverDeps, dailyLimit: number, state: WorkerState, now = new Date()): Promise<SweepReport> {
  const today = now.toISOString().slice(0, 10);
  if (today !== state.day) { state.day = today; state.images = 0; state.failed.clear(); }
  // Képhívás-plafon: naponta legfeljebb a plafon kétszerese (a minőségkapu bukása új képet kér).
  const counted: CoverDeps = { chat: deps.chat, image: async p => { state.images++; return deps.image(p); } };
  const remaining = Math.max(0, Math.min(dailyLimit - (await store.insertedToday()), Math.floor((2 * dailyLimit - state.images) / 2)));
  const r = await sweepLessonCovers(store, counted, { maxImages: remaining, skip: state.failed });
  for (const id of r.failed) state.failed.add(id);
  return r;
}

const START_DELAY_MS = 2 * 60_000, INTERVAL_MS = 10 * 60_000;
let started = false;
/** Indítás (csak élesben hívja a szerver); kulcs nélkül vagy `LESSON_COVERS=0` mellett nem indul. */
export function startLessonCoverWorker(env: Record<string, string | undefined> = process.env, store: CoverStore = dbCoverStore): boolean {
  const config = coverWorkerConfig(env);
  if (!config || started) return false;
  started = true;
  const deps = openRouterDeps(config.key);
  const state: WorkerState = { day: "", images: 0, failed: new Set() };
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const r = await runCoverRound(store, deps, config.dailyLimit, state);
      if (r.made.length || r.failed.length || r.linked) logger.info(`[lesson-covers] söprés: ${r.made.length} kész, ${r.failed.length} sikertelen, ${r.linked} lecke összekötve, ${r.missing} hiányzott`);
    } catch (error) {
      logger.warn("[lesson-covers] a söprés nem sikerült:", error instanceof Error ? error.message : String(error));
    } finally {
      running = false;
    }
  };
  setTimeout(() => void run(), START_DELAY_MS).unref?.();
  setInterval(() => void run(), INTERVAL_MS).unref?.();
  return true;
}
