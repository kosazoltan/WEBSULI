import { createHash } from "node:crypto";
import { lessonSchema, type Lesson } from "../shared/lesson-schema";
import {
  animateBlockIndexes, clip2Schema, clipDraftProblems, clipDraftSchema, clipSource, type Clip2, type ClipDraft, type LessonClipsResponse,
} from "../shared/lesson-clip";
import { CLIP_BAND_STYLE, clipBandFor, clipImagePrompt, type ClipBandStyle } from "../shared/clip-style";
import type { DesignThemeId } from "../shared/lesson-design";
import { spokenHu } from "../shared/hu-numbers";
import { logger } from "./lib/logger";
import type { ClipMediaKind } from "./lesson-clip-media";

/**
 * Fejezet-kisfilmek v2 (docs/specs/2026-11-10-fejezet-kisfilmek-v2.md): a kiszolgálás szűrője és a közzététel utáni háttérgyártás.
 * Ez a fájl adatbázis és hálózat nélküli: a tár (`ClipStore`) és a szolgáltatók (`ClipDeps`) befecskendezettek — az éles megvalósítás a
 * lesson-clips-db.ts és a lesson-clips-providers.ts. A lecke `json`-ját csak olvassa.
 */
export const CLIP_FRESH_DAYS = 3;
export const CLIP_MAX_ATTEMPTS = 2;
/**
 * Egyszerre ennyi fejezet készül (egy fejezet jelenetei párhuzamosak). Élesben mérve (2026-11-10): két fejezet párhuzamos
 * mozgóképeivel a 512 MB-os példány memóriája betelt, és a szerver újraindult — ezért egy.
 */
export const CLIP_PARALLEL = 1;
/** Ennyi saját memória fölött a kör kimarad (a példány korlátja 512 MB; az átkódolás további ~110 MB-ot kér). */
export const CLIP_RSS_LIMIT_BYTES = 360 * 1024 * 1024;
/** Egy tárolt mozgókép legfeljebb ekkora lehet (átkódolás után) — fölötte a jelenet állóképes marad. */
export const CLIP_VIDEO_MAX_BYTES = 2_500_000;

export type ClipMode = "off" | "idle" | "auto";
/** `LESSON_CLIPS=0`: vészfék. `LESSON_CLIPS_AUTO=on` + OpenRouter-kulcs: gyártás. Egyébként csak kiszolgál (nem költ). */
export function clipsMode(env: Record<string, string | undefined> = process.env): ClipMode {
  if (env.LESSON_CLIPS === "0") return "off";
  return env.LESSON_CLIPS_AUTO === "on" && env.OPENROUTER_API_KEY?.trim() ? "auto" : "idle";
}
const intEnv = (raw: string | undefined, fallback: number) => (raw && /^\d+$/.test(raw.trim()) ? Number(raw.trim()) : fallback);
export const clipDailyLimit = (env: Record<string, string | undefined> = process.env) => intEnv(env.LESSON_CLIP_DAILY_LIMIT, 2);
export const clipMediaBudgetBytes = (env: Record<string, string | undefined> = process.env) => intEnv(env.LESSON_CLIP_MEDIA_MAX_MB, 400) * 1024 * 1024;

export const clipSourceHash = (source: string): string => createHash("sha256").update(source).digest("hex");

export type ClipRow = { lessonId: string; sectionIndex: number; heading: string; sourceHash: string | null; status: "ready" | "failed"; clip: unknown; attempts: number };
export type ClipLesson = { id: string; publishedAt: Date | null; json: unknown };
export type PutMedia = (kind: ClipMediaKind, mime: string, bytes: Buffer) => Promise<string>;
/** Az adatréteg (élesben a `dbClipStore`, tesztben memóriabeli). */
export type ClipStore = {
  lesson(id: string): Promise<ClipLesson | null>;
  /** Publikált, legfeljebb `days` napja közzétett leckék, a legfrissebb elöl. */
  freshLessons(days: number): Promise<ClipLesson[]>;
  rows(lessonId: string): Promise<ClipRow[]>;
  upsert(row: ClipRow & { model: string }): Promise<void>;
  /** A mai (UTC) napon gyártást kapott leckék azonosítói — a napi plafonhoz. */
  lessonsToday(): Promise<string[]>;
  putMedia: PutMedia;
  /** A tárolt média összmérete bájtban — a tárkerethez. */
  mediaBytes(): Promise<number>;
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

/** Csak a kész, ma is érvényes (v2) kisfilm megy ki, ha a fejezet címe és szövege a gyártás óta nem változott. */
export function servableClips(lesson: Pick<Lesson, "sections">, rows: readonly ClipRow[]): LessonClipsResponse["clips"] {
  const eligible = new Map(eligibleSections(lesson).map((e) => [e.sectionIndex, e]));
  const out: LessonClipsResponse["clips"] = [];
  for (const row of rows) {
    const section = eligible.get(row.sectionIndex);
    if (row.status !== "ready" || !section || section.heading !== row.heading || row.sourceHash !== section.hash) continue;
    const parsed = clip2Schema.safeParse(row.clip);
    if (parsed.success) out.push({ sectionIndex: row.sectionIndex, clip: parsed.data });
  }
  return out.sort((a, b) => a.sectionIndex - b.sectionIndex);
}

const isFresh = (publishedAt: Date | null, now: Date) => !!publishedAt && now.getTime() - publishedAt.getTime() <= CLIP_FRESH_DAYS * 86_400_000;

/** A gyártásra váró fejezetek: nincs azonos lenyomatú, érvényes kész soruk, és van még próbálkozásuk. */
export function clipTodo(lesson: Pick<Lesson, "sections">, rows: readonly ClipRow[]): Array<EligibleSection & { attempts: number }> {
  const byIndex = new Map(rows.map((r) => [r.sectionIndex, r]));
  return eligibleSections(lesson).flatMap((e) => {
    const row = byIndex.get(e.sectionIndex);
    const same = !!row && row.heading === e.heading && row.sourceHash === e.hash;
    if (!row || !same) return [{ ...e, attempts: 0 }];
    if (row.status === "ready") return clip2Schema.safeParse(row.clip).success ? [] : [{ ...e, attempts: 0 }];
    return row.attempts < CLIP_MAX_ATTEMPTS ? [{ ...e, attempts: row.attempts }] : [];
  });
}

const parseLesson = (json: unknown): Lesson | null => { const p = lessonSchema.safeParse(json); return p.success ? p.data : null; };

/** A végpont válasza; null: nincs ilyen publikált lecke. `pending`: gyártás fut, a lecke friss, és van még elkészítendő fejezet. */
export async function lessonClipsResponse(store: ClipStore, lessonId: string, mode: ClipMode, now = new Date()): Promise<LessonClipsResponse | null> {
  const lesson = await store.lesson(lessonId);
  if (!lesson?.publishedAt) return null;
  const parsed = mode === "off" ? null : parseLesson(lesson.json);
  if (!parsed) return { clips: [], pending: false };
  const rows = await store.rows(lessonId);
  return { clips: servableClips(parsed, rows), pending: mode === "auto" && isFresh(lesson.publishedAt, now) && clipTodo(parsed, rows).length > 0 };
}

/** A külső szolgáltatók. A `speech` és a `video` hiányozhat (nincs kulcs): a kisfilm akkor is elkészül (tartalék hang, állókép). */
export type ClipDeps = {
  chat(system: string, user: string): Promise<string>;
  image(prompt: string): Promise<{ bytes: Buffer; mime: string }>;
  /** A kezdőkép minőségkapuja: szöveg / nem biztonságos / nem a jelenet → `ok: false`. */
  check(image: { bytes: Buffer; mime: string }, scene: string): Promise<{ ok: boolean; note: string }>;
  /** A tárolásra szánt kép (1280×720 WebP). */
  still(image: { bytes: Buffer; mime: string }): Promise<Buffer>;
  speech?: (text: string, voice: ClipBandStyle["voice"]) => Promise<Buffer>;
  /** A kész hang visszaírása szöveggé (a hangkapuhoz); hiányában a hang ellenőrzés nélkül megy tovább. */
  hear?: (audio: Buffer) => Promise<string>;
  /** A hang hossza ezredmásodpercben (0: nem megállapítható). */
  audioMs(bytes: Buffer): number;
  /**
   * A jelenet mozgóképe MÁR ÁTKÓDOLVA, kicsiben; null: nem tárolható (nincs ffmpeg / az átkódolás nem sikerült). A nyers (4–17 MB-os)
   * klip soha nem kerül a folyamat memóriájába: a szolgáltató lemezre tölti, és onnan kódolja át.
   */
  video?: (image: { bytes: Buffer; mime: string }, prompt: string, seconds: number) => Promise<Buffer | null>;
};

const OVERLAYS = `- {"kind":"title","text":"<legfeljebb 70 karakter>"} — a kisfilm címe; az ELSŐ jelenet ábrája mindig ez.
- {"kind":"formula","parts":[{"t":"<legfeljebb 28 karakter>","note":"<elhagyható, legfeljebb 44>"}],"caption":"<elhagyható, legfeljebb 110>"} — képlet, szabály vagy számolás 1–4 darabban.
- {"kind":"steps","items":[{"text":"<legfeljebb 70 karakter>"}]} — 2–4 lépés vagy felsorolás.
- {"kind":"compare","left":{"label":"<legfeljebb 44>"},"right":{"label":"<legfeljebb 44>"},"verdict":"<elhagyható, legfeljebb 70>"} — két dolog szembeállítása.
- {"kind":"graph","xLabel":"<pl. t (s)>","yLabel":"<pl. s (m)>","points":[[x,y],...]} — 2–8 pont, x szerint növekvő; csak a fejezet számadataiból.
- {"kind":"vectors","body":"<a test neve>","arrows":[{"dir":"left|right|up|down","label":"<pl. 10 N>","size":1-3}]} — erők vagy irányok egy testen, 1–4 nyíl.
- {"kind":"lessonVisual","blockIndex":<szám>} — a fejezet saját ábrája; CSAK a megadott ábrablokk-indexek egyike lehet.`;

/** A forgatókönyvíró utasítása a korosztály profiljával. */
export function clipSystemPrompt(band: DesignThemeId): string {
  const style = CLIP_BAND_STYLE[band];
  const [min, max] = style.narration.scenes;
  return `Egy magyar iskolai tanulóoldal EGY leckefejezetéhez írsz rövid, rajzfilmes magyarázó kisfilmet. A kisfilm egy HELYZETET játszik el a fejezet
lényegéről: minden jelenet egy mozgó rajzolt kép, közben egy mesélő elmond egy-két mondatot, a képre pedig egy pontos ábra úszik.
Válaszod KIZÁRÓLAG egyetlen JSON-objektum, előtte és utána semmi:
{"title":"<rövid magyar cím>","scenes":[{"say":"<magyar>","image":"<English>","motion":"<English>","alt":"<magyar>","overlay":{...}}]}

Mezők jelenetenként:
- "say": a mesélő hangosan elhangzó magyar szövege. Legfeljebb ${style.narration.sayMax} karakter; az összes "say" együtt legfeljebb ${style.narration.totalMax}.
  Képletet, jelet, mértékegység-rövidítést SZAVAKKAL írj ("méter per másodperc", "a sebesség az út és az idő hányadosa"). A mennyiség
  állhat számjeggyel ("120 méter", "9,8"), a sorszám viszont szavakkal ("második törvény"); zárójel és emoji nincs benne.
- "image": a jelenet KEZDŐKÉPÉNEK angol leírása (1–2 mondat): konkrét, lerajzolható helyzet a fejezet szövegéből. Stílust NE írj (automatikusan hozzáadódik).
  A képen soha nincs szöveg, szám, betű, felirat, képlet. ${style.cast ? "A képen mindig szerepeljenek a kisfilm állandó szereplői (\"the two children\" / a megadott figura) — a leírásuk automatikusan hozzáadódik." : "Kabala, rajzfilmfigura nincs; ember legfeljebb hátulról vagy távolról."}
- "motion": angolul, 1–2 mondat: mi MOZOG a képen a jelenet alatt (a szereplők, a tárgy, a kamera). A mozgás azt mutassa meg, amiről a "say" szól.
- "alt": a kép rövid magyar leírása látássérülteknek.
- "overlay": a képre úszó pontos ábra — minden szám, képlet és szakszó ITT jelenik meg. Pontosan az alábbiak egyike (elhagyható, de az első jelenetnél kötelező):
${OVERLAYS}

A korosztály szabályai (${min === max ? min : `${min}–${max}`} jelenet):
${style.narration.rules.map((rule) => `- ${rule}`).join("\n")}

Közös szabályok:
- CSAK a kapott fejezetszöveg állításait, fogalmait és számadatait használd. Új tény, új példa, új szám nem szerepelhet — az ábrán sem.
- A jelenetek egyetlen összefüggő helyzetet alkossanak (ugyanaz a helyszín és szereplők), ne különálló diákat.
- Nincs markdown, HTML, webcím.`;
}

export type ClipInput = { title: string; subject: string; classroom: number; heading: string; source: string; animateIndexes: number[] };

/** Az első `{…}` blokk JSON-ként (a modell néha szöveget is ír köré); hibás válasz: null. */
function parseJsonObject(text: string): unknown {
  const start = text.indexOf("{"), end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(text.slice(start, end + 1)); } catch { return null; }
}

export function checkDraftAnswer(answer: string, band: DesignThemeId, input: ClipInput): { draft: ClipDraft } | { problems: string[] } {
  const parsed = clipDraftSchema.safeParse(parseJsonObject(answer));
  if (!parsed.success) return { problems: parsed.error.issues.slice(0, 8).map((i) => `${i.path.join(".") || "válasz"}: ${i.message}`) };
  const problems = clipDraftProblems(parsed.data, band, input.source, input.heading, input.animateIndexes);
  return problems.length ? { problems } : { draft: parsed.data };
}

/** A forgatókönyv: egy hívás, bukásnál egy javító hívás a hibalistával. */
export async function writeDraft(input: ClipInput, band: DesignThemeId, deps: Pick<ClipDeps, "chat">): Promise<{ draft: ClipDraft } | { problems: string[] }> {
  const system = clipSystemPrompt(band);
  const brief = `Évfolyam: ${input.classroom || "felnőtt"}\nTantárgy: ${input.subject}\nA lecke címe: ${input.title}\nA fejezet címe: ${input.heading}\nA fejezet ábrablokkjainak indexei (lessonVisual): ${input.animateIndexes.length ? input.animateIndexes.join(", ") : "nincs ábra — a lessonVisual nem használható"}\n\nA fejezet szövege:\n${input.source.slice(0, 6000)}`;
  const firstAnswer = await deps.chat(system, brief);
  const first = checkDraftAnswer(firstAnswer, band, input);
  if ("draft" in first) return first;
  const repair = `${brief}\n\nAz előző válaszod:\n${firstAnswer.slice(0, 5000)}\n\nEz nem felelt meg, javítsd ki, és add vissza a TELJES JSON-t:\n- ${first.problems.join("\n- ")}`;
  return checkDraftAnswer(await deps.chat(system, repair), band, input);
}

export type ChapterStats = { images: number; imageRetries: number; audio: number; audioRetries: number; audioImperfect: number; videos: number; videoFailures: number; bytes: number };

const describe = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, 200);

/** Egy mondat hangja legfeljebb ennyiszer készül el, amíg a visszaírt szöveg betűre nem egyezik. */
export const CLIP_SPEECH_ATTEMPTS = 3;
const letters = (text: string) => spokenHu(text).normalize("NFC").toLocaleLowerCase("hu").replace(/[^\p{L}]/gu, "");
/**
 * A hangkapu mértéke: az elmondandó és a visszahallott szöveg szerkesztési távolsága, csak a betűkön (írásjel, szóköz, kis- és nagybetű
 * nem számít; az ékezet IGEN — mérve 2026-11-10: a hangmodell „síkság” helyett „síkség”-et mondott). A számjegyek mindkét oldalon
 * szavakká íródnak (a felismerő a kimondott számot számjeggyel adja vissza). 0: betűre egyezik.
 */
export function speechDistance(expected: string, heard: string): number {
  const a = letters(expected), b = letters(heard);
  let row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = next;
  }
  return row[b.length];
}

/** Egy mondat hangja a hangkapuval: a betűre egyező változat, különben a próbálkozások közül a legpontosabb. */
export async function speakChecked(say: string, voice: ClipBandStyle["voice"], deps: Pick<ClipDeps, "speech" | "hear">): Promise<{ bytes: Buffer; attempts: number; distance: number | null }> {
  let best: { bytes: Buffer; distance: number | null } | null = null;
  for (let attempt = 1; attempt <= CLIP_SPEECH_ATTEMPTS; attempt++) {
    // A hangmodell a kiolvasott számot kapja („százhúsz méter”), a felirat a számjegyest mutatja.
    const bytes = await deps.speech!(spokenHu(say), voice);
    if (!deps.hear) return { bytes, attempts: attempt, distance: null };
    let distance: number | null;
    try { distance = speechDistance(say, await deps.hear(bytes)); } catch (error) { logger.warn(`[lesson-clips] a hangkapu nem érhető el, a hang ellenőrzés nélkül megy tovább: ${describe(error)}`); return { bytes, attempts: attempt, distance: null }; }
    if (!best || best.distance === null || distance < best.distance) best = { bytes, distance };
    if (distance === 0) return { bytes, attempts: attempt, distance: 0 };
  }
  return { ...best!, attempts: CLIP_SPEECH_ATTEMPTS };
}

/**
 * Egy fejezet kisfilmje: forgatókönyv → jelenetenként párhuzamosan kezdőkép (+ minőségkapu, egy újrapróba) → hang → mozgókép
 * (+ átkódolás). A mozgókép vagy a hang hibája nem buktatja a kisfilmet (állókép / tartalék hang); kezdőkép nélkül a kisfilm sikertelen.
 */
export async function makeChapterClip(input: ClipInput, band: DesignThemeId, deps: ClipDeps, putMedia: PutMedia): Promise<{ clip: Clip2; stats: ChapterStats } | { problems: string[] }> {
  const written = await writeDraft(input, band, deps);
  if ("problems" in written) return written;
  const style = CLIP_BAND_STYLE[band];
  const stats: ChapterStats = { images: 0, imageRetries: 0, audio: 0, audioRetries: 0, audioImperfect: 0, videos: 0, videoFailures: 0, bytes: 0 };
  const put: PutMedia = async (kind, mime, bytes) => { stats.bytes += bytes.length; return putMedia(kind, mime, bytes); };
  try {
    const scenes = await Promise.all(written.draft.scenes.map(async (scene) => {
      const prompt = clipImagePrompt(scene.image, band);
      let image = await deps.image(prompt);
      let verdict = await deps.check(image, scene.image);
      if (!verdict.ok) {
        stats.imageRetries++;
        image = await deps.image(prompt);
        verdict = await deps.check(image, scene.image);
        if (!verdict.ok) throw new Error(`a kezdőkép kétszer megbukott a minőségkapun (${verdict.note.slice(0, 80)})`);
      }
      stats.images++;
      const imageId = await put("image", "image/webp", await deps.still(image));
      let audio: string | undefined, ms: number | undefined;
      if (deps.speech) {
        try {
          const spoken = await speakChecked(scene.say, style.voice, deps);
          const bytes = spoken.bytes;
          stats.audioRetries += spoken.attempts - 1;
          if (spoken.distance) { stats.audioImperfect++; logger.warn(`[lesson-clips] a hang ${spoken.attempts} próbálkozás után sem egyezik betűre (eltérés: ${spoken.distance} betű): „${scene.say.slice(0, 60)}”`); }
          const length = deps.audioMs(bytes);
          audio = await put("audio", "audio/mpeg", bytes);
          if (length >= 500) ms = Math.min(60_000, length);
          stats.audio++;
        } catch (error) {
          logger.warn(`[lesson-clips] a hang nem készült el, a tartalék hang szól: ${describe(error)}`);
        }
      }
      let video: string | undefined;
      if (deps.video) {
        try {
          const seconds = Math.min(12, Math.max(4, Math.ceil((ms ?? scene.say.length * 65) / 1000)));
          const small = await deps.video(image, `${scene.motion} Keep exactly the art style, colours and characters of the first frame. Smooth, lively cartoon animation. No text, no captions.`, seconds);
          if (small && small.length <= CLIP_VIDEO_MAX_BYTES) { video = await put("video", "video/mp4", small); stats.videos++; }
          else { stats.videoFailures++; logger.warn(`[lesson-clips] a mozgókép nem tárolható (${small ? `${small.length} bájt` : "nincs ffmpeg / az átkódolás nem sikerült"}) — a jelenet állóképes`); }
        } catch (error) {
          stats.videoFailures++;
          logger.warn(`[lesson-clips] a mozgókép nem készült el, a jelenet állóképes: ${describe(error)}`);
        }
      }
      return { imageId, alt: scene.alt, say: scene.say, audio, ms, video, overlay: scene.overlay };
    }));
    const clip = clip2Schema.safeParse({
      v: 2, band, title: written.draft.title,
      shots: scenes.map((s) => ({ image: s.imageId, alt: s.alt })),
      scenes: scenes.map((s, i) => ({ say: s.say, ...(s.audio ? { audio: s.audio } : {}), ...(s.ms ? { ms: s.ms } : {}), ...(s.video ? { video: s.video } : {}), shot: i, camera: s.video ? "still" as const : (["in", "left", "out", "right"] as const)[i % 4], ...(s.overlay ? { overlay: s.overlay } : {}) })),
    });
    if (!clip.success) return { problems: clip.error.issues.slice(0, 6).map((i) => `${i.path.join(".")}: ${i.message}`) };
    return { clip: clip.data, stats };
  } catch (error) {
    return { problems: [describe(error)] };
  }
}

async function inBatches<T>(items: readonly T[], size: number, work: (item: T) => Promise<void>): Promise<void> {
  for (let i = 0; i < items.length; i += size) await Promise.all(items.slice(i, i + size).map(work));
}

export type ClipRoundReport = { made: number; failed: number; lessons: number; videos: number; stoppedByBudget: boolean };
/** A háttérfolyamat egy köre, zár alatt: a friss leckék hiányzó kisfilmjei a napi plafonig és a tárkeretig. */
export async function runClipRound(store: ClipStore, deps: ClipDeps, mode: ClipMode, opts: { dailyLimit: number; mediaBudgetBytes: number; model: string; rss?: () => number }): Promise<ClipRoundReport | null> {
  if (mode !== "auto") return null;
  // Memóriaőr: ha a folyamat már sokat foglal, a kör kimarad — a gyártás soha nem dönthetik be a szervert.
  const rss = opts.rss?.() ?? 0;
  if (rss > CLIP_RSS_LIMIT_BYTES) { logger.warn(`[lesson-clips] a kör kimarad: a folyamat memóriája ${Math.round(rss / 1048576)} MB (határ: ${Math.round(CLIP_RSS_LIMIT_BYTES / 1048576)} MB)`); return null; }
  return store.exclusive(async () => {
    const report: ClipRoundReport = { made: 0, failed: 0, lessons: 0, videos: 0, stoppedByBudget: false };
    const today = new Set(await store.lessonsToday());
    for (const lesson of await store.freshLessons(CLIP_FRESH_DAYS)) {
      const parsed = parseLesson(lesson.json);
      if (!parsed) continue;
      const todo = clipTodo(parsed, await store.rows(lesson.id));
      if (!todo.length) continue;
      if (!today.has(lesson.id)) {
        if (today.size >= opts.dailyLimit) continue;
        today.add(lesson.id);
      }
      report.lessons++;
      const band = clipBandFor(parsed.classroom);
      await inBatches(todo, CLIP_PARALLEL, async (section) => {
        // Tárkeret: a tábla ne nőhessen korlát nélkül (mérve: egy fejezet néhány MB).
        if (report.stoppedByBudget || (await store.mediaBytes()) >= opts.mediaBudgetBytes) { report.stoppedByBudget = true; return; }
        const base = { lessonId: lesson.id, sectionIndex: section.sectionIndex, heading: section.heading, sourceHash: section.hash, attempts: section.attempts + 1, model: opts.model };
        const result = await makeChapterClip({ title: parsed.title, subject: parsed.subject, classroom: parsed.classroom, heading: section.heading, source: section.source, animateIndexes: animateBlockIndexes(parsed, section.sectionIndex) }, band, deps, store.putMedia);
        if ("clip" in result) {
          await store.upsert({ ...base, status: "ready", clip: result.clip });
          report.made++; report.videos += result.stats.videos;
          logger.info(`[lesson-clips] kész: ${lesson.id} / ${section.sectionIndex + 1}. fejezet — ${result.stats.images} kép (${result.stats.imageRetries} újrapróba), ${result.stats.audio} hang (${result.stats.audioRetries} újrapróba, ${result.stats.audioImperfect} pontatlan), ${result.stats.videos} mozgókép (${result.stats.videoFailures} nélkül), ${Math.round(result.stats.bytes / 1024)} kB`);
          return;
        }
        await store.upsert({ ...base, status: "failed", clip: null });
        report.failed++;
        logger.warn(`[lesson-clips] nem készült el (${lesson.id} / ${section.sectionIndex + 1}. fejezet, ${base.attempts}. kör): ${result.problems.join(" | ").slice(0, 300)}`);
      });
      if (report.stoppedByBudget) { logger.warn("[lesson-clips] a tárkeret betelt (LESSON_CLIP_MEDIA_MAX_MB) — a gyártás megáll"); break; }
    }
    return report;
  });
}

const START_DELAY_MS = 90_000, INTERVAL_MS = 3 * 60_000;
let started = false;
/** Indítás (csak élesben hívja a szerver). Gyártás csak `auto` módban; különben nem indul időzítő. */
export function startLessonClipWorker(store: ClipStore, makeDeps: () => { deps: ClipDeps; model: string }, env: Record<string, string | undefined> = process.env): ClipMode {
  const mode = clipsMode(env);
  if (mode !== "auto" || started) return mode;
  started = true;
  const { deps, model } = makeDeps();
  const opts = { dailyLimit: clipDailyLimit(env), mediaBudgetBytes: clipMediaBudgetBytes(env), model, rss: () => process.memoryUsage().rss };
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const r = await runClipRound(store, deps, mode, opts);
      if (r && (r.made || r.failed || r.stoppedByBudget)) logger.info(`[lesson-clips] kör: ${r.made} kisfilm kész (${r.videos} mozgókép), ${r.failed} sikertelen, ${r.lessons} lecke`);
    } catch (error) {
      logger.warn("[lesson-clips] a kör nem sikerült:", describe(error));
    } finally {
      running = false;
    }
  };
  setTimeout(() => void run(), START_DELAY_MS).unref?.();
  setInterval(() => void run(), INTERVAL_MS).unref?.();
  return "auto";
}
