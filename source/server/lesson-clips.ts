import { createHash } from "node:crypto";
import { lessonSchema, type Lesson } from "../shared/lesson-schema";
import { CLIP_EFFECTS, CLIP_LIMITS, clipContentProblems, clipSchema, clipSource, type Clip, type LessonClipsResponse } from "../shared/lesson-clip";
import { CLIP_SEEDS, type ClipSeed } from "./lesson-clip-seeds";
import { logger } from "./lib/logger";

/**
 * Fejezetenkénti rajzfilmes kisfilmek (docs/specs/2026-11-10-fejezet-kisfilmek.md): a kiszolgálás szűrője, a kézi kisfilmek beírása és a
 * közzététel utáni háttérgyártás. Ez a fájl adatbázis nélküli (a tár felülete `ClipStore`; az éles megvalósítás: lesson-clips-db.ts),
 * a lecke `json`-ját csak olvassa.
 */
export const CLIP_TEXT_MODEL = "anthropic/claude-haiku-5.5";
export const CLIP_FRESH_DAYS = 3;
export const CLIP_MAX_ATTEMPTS = 2;
export const CLIP_PARALLEL = 3;
export const CLIP_MAX_TOKENS = 2000;
const OPENROUTER = "https://openrouter.ai/api/v1";

export type ClipMode = "off" | "seeds" | "auto";
/** `LESSON_CLIPS=0`: vészfék. `LESSON_CLIPS_AUTO=on` + kulcs: modellgyártás. Egyébként csak a kézi kisfilmek (nem költ). */
export function clipsMode(env: Record<string, string | undefined> = process.env): ClipMode {
  if (env.LESSON_CLIPS === "0") return "off";
  return env.LESSON_CLIPS_AUTO === "on" && env.OPENROUTER_API_KEY?.trim() ? "auto" : "seeds";
}

export const clipSourceHash = (source: string): string => createHash("sha256").update(source).digest("hex");

export type ClipRow = {
  lessonId: string; sectionIndex: number; heading: string; sourceHash: string | null; status: "ready" | "failed";
  clip: unknown; origin: "handmade" | "auto"; attempts: number;
};
export type ClipLesson = { id: string; publishedAt: Date | null; json: unknown };
/** Az adatréteg (élesben a `dbClipStore`, tesztben memóriabeli). */
export type ClipStore = {
  lesson(id: string): Promise<ClipLesson | null>;
  /** Publikált, legfeljebb `days` napja közzétett leckék, a legfrissebb elöl. */
  freshLessons(days: number): Promise<ClipLesson[]>;
  rows(lessonId: string): Promise<ClipRow[]>;
  /** Kézi sor: az automatikusat is felülírja. */
  upsertHandmade(row: Pick<ClipRow, "lessonId" | "sectionIndex" | "heading"> & { clip: Clip }): Promise<void>;
  /** Automatikus sor: kézi sort NEM ír felül. */
  upsertAuto(row: Omit<ClipRow, "origin"> & { model: string }): Promise<void>;
  /** A mai (UTC) napon automatikus gyártást kapott leckék azonosítói — a napi plafonhoz. */
  autoLessonsToday(): Promise<string[]>;
  /** Példányok közötti kizárás (advisory lock); foglalt zárnál null, a kör kimarad. */
  exclusive<T>(work: () => Promise<T>): Promise<T | null>;
};

export type EligibleSection = { sectionIndex: number; heading: string; source: string; hash: string };
/** A kisfilmre jogosult fejezetek: van elég tanítószövegük (a Célkártya és a mese nélkül). */
export function eligibleSections(lesson: Pick<Lesson, "sections">): EligibleSection[] {
  return lesson.sections.flatMap((section, sectionIndex) => {
    const source = clipSource(lesson, sectionIndex);
    return source ? [{ sectionIndex, heading: section.heading, source, hash: clipSourceHash(source) }] : [];
  });
}

/** Spec 4.4: csak a kész, ma is érvényes sémájú kisfilm megy ki, ha a fejezet címe (és automatikusnál a szövege) nem változott. */
export function servableClips(lesson: Pick<Lesson, "sections">, rows: readonly ClipRow[]): LessonClipsResponse["clips"] {
  const eligible = new Map(eligibleSections(lesson).map((e) => [e.sectionIndex, e]));
  const out: LessonClipsResponse["clips"] = [];
  for (const row of rows) {
    const section = eligible.get(row.sectionIndex);
    if (row.status !== "ready" || !section || section.heading !== row.heading) continue;
    if (row.sourceHash !== null && row.sourceHash !== section.hash) continue;
    const parsed = clipSchema.safeParse(row.clip);
    if (parsed.success) out.push({ sectionIndex: row.sectionIndex, clip: parsed.data });
  }
  return out.sort((a, b) => a.sectionIndex - b.sectionIndex);
}

const isFresh = (publishedAt: Date | null, now: Date) => !!publishedAt && now.getTime() - publishedAt.getTime() <= CLIP_FRESH_DAYS * 86_400_000;

/** Az automatikus gyártásra váró fejezetek: nincs kézi soruk, nincs azonos lenyomatú kész soruk, és van még próbálkozásuk. */
export function autoTodo(lesson: Pick<Lesson, "sections">, rows: readonly ClipRow[]): Array<EligibleSection & { attempts: number }> {
  const byIndex = new Map(rows.map((r) => [r.sectionIndex, r]));
  return eligibleSections(lesson).flatMap((e) => {
    const row = byIndex.get(e.sectionIndex);
    if (!row) return [{ ...e, attempts: 0 }];
    if (row.origin === "handmade" && row.heading === e.heading) return [];
    const same = row.origin === "auto" && row.heading === e.heading && row.sourceHash === e.hash;
    if (!same) return [{ ...e, attempts: 0 }];
    return row.status === "failed" && row.attempts < CLIP_MAX_ATTEMPTS ? [{ ...e, attempts: row.attempts }] : [];
  });
}

/** A leckéhez tartozó, még be nem írt kézi kisfilmek (a fejezetcím egyezik, és a tárolt sor nem ugyanez). */
export function seedTodo(lessonId: string, lesson: Pick<Lesson, "sections">, rows: readonly ClipRow[], seeds: Readonly<Record<string, readonly ClipSeed[]>> = CLIP_SEEDS): ClipSeed[] {
  return (seeds[lessonId] ?? []).filter((seed) => {
    if (lesson.sections[seed.sectionIndex]?.heading !== seed.heading || !clipSchema.safeParse(seed.clip).success) return false;
    const row = rows.find((r) => r.sectionIndex === seed.sectionIndex);
    return !(row && row.origin === "handmade" && row.heading === seed.heading && JSON.stringify(row.clip) === JSON.stringify(seed.clip));
  });
}

/** Spec 4.4: érdemes-e a kliensnek újra kérdeznie (készül még kisfilm ehhez a leckéhez). */
export function clipsPending(mode: ClipMode, lesson: ClipLesson, parsed: Pick<Lesson, "sections">, rows: readonly ClipRow[], now: Date, seeds: Readonly<Record<string, readonly ClipSeed[]>> = CLIP_SEEDS): boolean {
  if (mode === "off") return false;
  if (seedTodo(lesson.id, parsed, rows, seeds).length) return true;
  return mode === "auto" && isFresh(lesson.publishedAt, now) && autoTodo(parsed, rows).length > 0;
}

const parseLesson = (json: unknown): Lesson | null => { const p = lessonSchema.safeParse(json); return p.success ? p.data : null; };

/** A végpont válasza; null: nincs ilyen publikált lecke. */
export async function lessonClipsResponse(store: ClipStore, lessonId: string, mode: ClipMode, now = new Date()): Promise<LessonClipsResponse | null> {
  const lesson = await store.lesson(lessonId);
  if (!lesson?.publishedAt) return null;
  const parsed = mode === "off" ? null : parseLesson(lesson.json);
  if (!parsed) return { clips: [], pending: false };
  const rows = await store.rows(lessonId);
  return { clips: servableClips(parsed, rows), pending: clipsPending(mode, lesson, parsed, rows, now) };
}

/** E7: a kézi kisfilmek beírása (publikált lecke, egyező fejezetcím). Visszaadja a beírt sorok számát. */
export async function seedHandmade(store: ClipStore, seeds: Readonly<Record<string, readonly ClipSeed[]>> = CLIP_SEEDS): Promise<number> {
  let written = 0;
  for (const lessonId of Object.keys(seeds)) {
    const lesson = await store.lesson(lessonId);
    const parsed = lesson?.publishedAt ? parseLesson(lesson.json) : null;
    if (!parsed) continue;
    for (const seed of seedTodo(lessonId, parsed, await store.rows(lessonId), seeds)) {
      await store.upsertHandmade({ lessonId, sectionIndex: seed.sectionIndex, heading: seed.heading, clip: seed.clip });
      written++;
    }
  }
  return written;
}

export const CLIP_SYSTEM = `Egy magyar iskolai tanulóoldal EGY leckefejezetéhez írsz rövid, rajzfilmes magyarázó kisfilmet. A kisfilm jelenetekből áll: minden
jelenetben egy narrátor elmond egy-két mondatot ("say"), közben a képernyőn egy egyszerű rajzfilmes kép látszik ("visual"). Válaszod KIZÁRÓLAG
egyetlen JSON-objektum, előtte és utána semmi:
{"v":1,"title":"<rövid cím, legfeljebb 60 karakter>","scenes":[{"say":"...","visual":{...}}]}

A "visual" pontosan az alábbi hat fajta egyike (más mező nem lehet benne):
- {"kind":"title","emoji":"<1 emoji>","text":"<legfeljebb 70 karakter>"} — nyitókép; az ELSŐ jelenet mindig ez.
- {"kind":"idea","emoji":"<1 emoji>","text":"<legfeljebb 110 karakter>"} — egy fogalom vagy kulcsmondat egy nagy rajzzal.
- {"kind":"formula","parts":[{"t":"<legfeljebb 28 karakter>","note":"<legfeljebb 44 karakter, elhagyható>"}],"caption":"<elhagyható, legfeljebb 110>"} —
  képlet, szabály vagy számolás 1–5 egymás után megjelenő darabban.
- {"kind":"steps","items":[{"emoji":"<elhagyható>","text":"<legfeljebb 70 karakter>"}]} — 2–4 lépés vagy felsorolás.
- {"kind":"compare","left":{"emoji":"..","label":"<legfeljebb 44>"},"right":{"emoji":"..","label":"<legfeljebb 44>"},"verdict":"<elhagyható, legfeljebb 70>"} —
  két dolog szembeállítása.
- {"kind":"motion","actor":"<1 emoji>","effect":"${CLIP_EFFECTS.join("|")}","caption":"<legfeljebb 110>"} — egy szereplő mozog: slide = egyenletesen
  halad, fall = leesik, push = meglökve felgyorsul, bounce = pattog / nyom, orbit = körbejár, grow = nő / emelkedik.

Szabályok:
- 4–6 jelenet. Egy "say" ${CLIP_LIMITS.sayMin}–${CLIP_LIMITS.say} karakter, az összes "say" együtt legfeljebb 520 karakter (kb. fél perc).
- CSAK a kapott fejezetszöveg állításait, fogalmait és számadatait használd. Új tény, új példa, új szám nem szerepelhet.
- A "say" hangosan elhangzó, tegező, az évfolyamhoz illő magyar szöveg: képletet, jelet, mértékegység-rövidítést szavakkal írj ("a sebesség az út
  és az idő hányadosa"), a jelölés a képre kerül. A "say"-ben ne legyen zárójel, emoji, felsorolásjel.
- A képernyőszöveg rövid, a "say"-t kiegészíti, nem ismétli szó szerint.
- A fejezet legfontosabb gondolatát magyarázd el úgy, hogy valaki, aki most hallja először, megértse: mi ez, hogyan működik, egy példa a szövegből.
- Nincs markdown, HTML, webcím, idézőjelbe tett forrásmegjelölés.`;

export type ClipInput = { title: string; subject: string; classroom: number; heading: string; source: string };
export type ClipDeps = { chat(system: string, user: string): Promise<string> };

/** Az első `{…}` blokk JSON-ként (a modell néha szöveget is ír köré); hibás válasz: null. */
function parseJsonObject(text: string): unknown {
  const start = text.indexOf("{"), end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(text.slice(start, end + 1)); } catch { return null; }
}

/** A válasz ellenőrzése: séma + tartalmi kapuk. Üres hibalista: a kisfilm kész. */
export function checkClipAnswer(answer: string, input: Pick<ClipInput, "heading" | "source">): { clip: Clip } | { problems: string[] } {
  const parsed = clipSchema.safeParse(parseJsonObject(answer));
  if (!parsed.success) return { problems: parsed.error.issues.slice(0, 8).map((i) => `${i.path.join(".") || "válasz"}: ${i.message}`) };
  const problems = clipContentProblems(parsed.data, input.source, input.heading);
  return problems.length ? { problems } : { clip: parsed.data };
}

/** Egy fejezet kisfilmje: egy hívás, bukásnál egy javító hívás a hibalistával. */
export async function makeClip(input: ClipInput, deps: ClipDeps): Promise<{ clip: Clip } | { problems: string[] }> {
  const brief = `Évfolyam: ${input.classroom || "felnőtt"}\nTantárgy: ${input.subject}\nA lecke címe: ${input.title}\nA fejezet címe: ${input.heading}\n\nA fejezet szövege:\n${input.source.slice(0, 6000)}`;
  const firstAnswer = await deps.chat(CLIP_SYSTEM, brief);
  const first = checkClipAnswer(firstAnswer, input);
  if ("clip" in first) return first;
  const repair = `${brief}\n\nAz előző válaszod:\n${firstAnswer.slice(0, 4000)}\n\nEz nem felelt meg, javítsd ki, és add vissza a TELJES JSON-t:\n- ${first.problems.join("\n- ")}`;
  return checkClipAnswer(await deps.chat(CLIP_SYSTEM, repair), input);
}

/** OpenRouter-függőség; a kulcs csak a fejlécben él (naplóba, hibaüzenetbe nem kerül). */
export function openRouterClipDeps(key: string): ClipDeps {
  const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "HTTP-Referer": "https://websuli.vip", "X-Title": "WebSuli lesson clips" };
  return {
    async chat(system, user) {
      const res = await fetch(`${OPENROUTER}/chat/completions`, { method: "POST", headers, signal: AbortSignal.timeout(90_000), body: JSON.stringify({ model: CLIP_TEXT_MODEL, max_tokens: CLIP_MAX_TOKENS, temperature: 0.3, messages: [{ role: "system", content: system }, { role: "user", content: user }] }) });
      const text = await res.text();
      if (!res.ok) throw new Error(`kisfilm-forgatókönyv: HTTP ${res.status} ${text.split(key).join("[kulcs]").slice(0, 200)}`);
      const choice = (JSON.parse(text) as { choices?: Array<{ finish_reason?: string; message?: { content?: string } }> }).choices?.[0];
      if (choice?.finish_reason === "length") logger.warn("[lesson-clips] a modellválasz csonkolódott (finish_reason=length)");
      return choice?.message?.content ?? "";
    },
  };
}

async function inBatches<T>(items: readonly T[], size: number, work: (item: T) => Promise<void>): Promise<void> {
  for (let i = 0; i < items.length; i += size) await Promise.all(items.slice(i, i + size).map(work));
}

export type ClipRoundReport = { seeded: number; made: number; failed: number; lessons: number };
/** A háttérfolyamat egy köre, zár alatt: kézi kisfilmek, majd (`auto` módban) a friss leckék hiányzó kisfilmjei a napi plafonig. */
export async function runClipRound(store: ClipStore, deps: ClipDeps | null, mode: ClipMode, opts: { dailyLimit: number; seeds?: Readonly<Record<string, readonly ClipSeed[]>> }): Promise<ClipRoundReport | null> {
  if (mode === "off") return null;
  return store.exclusive(async () => {
    const report: ClipRoundReport = { seeded: await seedHandmade(store, opts.seeds), made: 0, failed: 0, lessons: 0 };
    if (mode !== "auto" || !deps) return report;
    const today = new Set(await store.autoLessonsToday());
    for (const lesson of await store.freshLessons(CLIP_FRESH_DAYS)) {
      const parsed = parseLesson(lesson.json);
      if (!parsed) continue;
      const todo = autoTodo(parsed, await store.rows(lesson.id));
      if (!todo.length) continue;
      if (!today.has(lesson.id)) {
        if (today.size >= opts.dailyLimit) continue;
        today.add(lesson.id);
      }
      report.lessons++;
      await inBatches(todo, CLIP_PARALLEL, async (section) => {
        const base = { lessonId: lesson.id, sectionIndex: section.sectionIndex, heading: section.heading, sourceHash: section.hash, attempts: section.attempts + 1, model: CLIP_TEXT_MODEL };
        let result: { clip: Clip } | { problems: string[] };
        try {
          result = await makeClip({ title: parsed.title, subject: parsed.subject, classroom: parsed.classroom, heading: section.heading, source: section.source }, deps);
        } catch (error) {
          result = { problems: [error instanceof Error ? error.message : String(error)] };
        }
        if ("clip" in result) { await store.upsertAuto({ ...base, status: "ready", clip: result.clip }); report.made++; return; }
        await store.upsertAuto({ ...base, status: "failed", clip: null });
        report.failed++;
        logger.warn(`[lesson-clips] nem készült el (${lesson.id} / ${section.sectionIndex + 1}. fejezet, ${base.attempts}. kör): ${result.problems.join(" | ").slice(0, 300)}`);
      });
    }
    return report;
  });
}

export function clipDailyLimit(env: Record<string, string | undefined> = process.env): number {
  const raw = env.LESSON_CLIP_DAILY_LIMIT?.trim();
  return raw && /^\d+$/.test(raw) ? Number(raw) : 10;
}

const START_DELAY_MS = 90_000, INTERVAL_MS = 3 * 60_000;
let started = false;
/** Indítás (csak élesben hívja a szerver). `LESSON_CLIPS=0` mellett nem indul; kapcsoló nélkül csak a kézi kisfilmeket írja be. */
export function startLessonClipWorker(store: ClipStore, env: Record<string, string | undefined> = process.env): ClipMode {
  const mode = clipsMode(env);
  if (mode === "off" || started) return "off";
  started = true;
  const deps = mode === "auto" ? openRouterClipDeps(env.OPENROUTER_API_KEY!.trim()) : null;
  const dailyLimit = clipDailyLimit(env);
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const r = await runClipRound(store, deps, mode, { dailyLimit });
      if (r && (r.seeded || r.made || r.failed)) logger.info(`[lesson-clips] kör: ${r.seeded} kézi beírva, ${r.made} kisfilm kész, ${r.failed} sikertelen, ${r.lessons} lecke`);
    } catch (error) {
      logger.warn("[lesson-clips] a kör nem sikerült:", error instanceof Error ? error.message : String(error));
    } finally {
      running = false;
    }
  };
  setTimeout(() => void run(), START_DELAY_MS).unref?.();
  setInterval(() => void run(), INTERVAL_MS).unref?.();
  return mode;
}
