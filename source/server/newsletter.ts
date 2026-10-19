import { createHash } from "node:crypto";
import cron from "node-cron";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "./db";
import { extraEmailAddresses, learnerNewsletters, learners } from "../shared/schema";
import { learnerTokenFor } from "./learners";
import { storage } from "./storage";
import { getMaterialPreviewUrl } from "./utils/config";
import { budapestDay, personalUrl, REMINDER_TIMEZONE } from "./daily-reminder";
import { firstNameOf } from "../shared/daily-reminder";
import { newsletterHtml, newsletterSubject } from "../shared/newsletter";
import { isAllowedArticleUrl, NEWSLETTER_DOMAINS } from "../shared/newsletter-sources";
import { logger } from "./lib/logger";
import type { PublicPage } from "./studio/safe-fetch";

/**
 * „Mai felfedezés” hírlevél (docs/specs/2026-10-19-mai-felfedezes-hirlevel.md, S2). Naponta 16:00-kor (Europe/Budapest) a
 * bekapcsolt tanulóknak: egy magyar cikk az érdeklődésükből (csak az engedélyezett forrásokról) + egy kapcsolódó anyag a bankból.
 * A tanulóról a modell csak az érdeklődést és az évfolyamot kapja — nevet, címet, tanulói azonosítót soha; mellette a letöltött cikkek
 * kivonatát és a tanuló évfolyamának anyaglistáját (azonosító + cím) mint adatot. Hiba vagy alkalmatlan cikk → aznap nincs levél.
 */

/** Review #314: az ismétlésvédelem kanonikus URL-en mér (https, kisbetűs host, query/hash és záró perjel nélkül). */
export function canonicalArticleUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname.toLowerCase()}${u.pathname.replace(/\/+$/, "")}`;
  } catch { return url; }
}
export const NEWSLETTER_MODEL = "gpt-6.1-sol";
export const NEWSLETTER_LIMITS_S2 = { candidates: 8, downloads: 6, minChars: 600, excerptChars: 1500, materials: 60, teaser: 450, question: 160, recentDays: 60, attempts: 3 } as const;

export type ArticlePick = { url: string; title: string; teaser: string; question: string; materialId: string | null };
export type MaterialOption = { id: string; title: string };
export type NewsletterDeps = {
  /** Keresés az engedélyezett domainekre; a talált URL-ek. */
  search(input: { interests: string[]; grade: number }): Promise<string[]>;
  download(url: string): Promise<PublicPage>;
  /** Választás és ismertető (JSON, eszköz nélkül) — a nyers modellválasz. */
  choose(input: { system: string; user: string }): Promise<unknown>;
};

/**
 * Review #313: magyar-e a szöveg — nem egyetlen ékezet, hanem arány: a betűk legalább 2%-a magyar ékezetes, és van gyakori
 * magyar funkciószó. (Egy átlagos magyar szövegben az ékezetes betűk aránya ~8–10%.)
 */
export function looksHungarian(text: string): boolean {
  const letters = text.match(/\p{L}/gu)?.length ?? 0;
  const accented = text.match(/[áéíóöőúüű]/gi)?.length ?? 0;
  return letters > 0 && accented / letters >= 0.02 && /(^|\s)(és|hogy|egy|nem|is|meg|már|vagy|mert)(\s|$)/i.test(text);
}
const usable = (page: PublicPage) => page.text.trim().length >= NEWSLETTER_LIMITS_S2.minChars && looksHungarian(page.text);

/**
 * Review #313: a modell `ageAppropriate` ítéletétől FÜGGETLEN, determinisztikus szűrő a gyereknek kimenő szövegre (cím, ismertető,
 * kérdés) — egy cikkbe ágyazott utasítás (prompt-injekció) sem juttathat át ilyen szöveget. A katonai téma (repülők, csaták) nem tilos;
 * a naturalisztikus és felnőtt tartalom szavai igen.
 */
// Review #314: szótövek, hogy a ragozott alakokat is fogja (pl. „meggyilkolták”, „megkínozták”, „erőszakos”).
const UNSAFE_TERMS = /(holttest|hulla|lemészárol|mészárlás|kivégez|kivégzés|megerőszak|erőszakos|nemi erőszak|öngyilkos|szex|pornó|porno|drog|kábítószer|terror|merénylet|lefejez|brutális|vérfürdő|vérengzés|halálos áldozat|meggyilkol|gyilkos|gyilkoss|megöl|megkínoz|kínzás|kínoz|csonkít|tömegsír|lövöldözés)/i;
export const unsafeForChild = (text: string) => UNSAFE_TERMS.test(text);

/** A választó kérése — CSAK érdeklődés, évfolyam, cikk-kivonatok és anyaglista (ADAT). */
export function chooseRequest(input: { interests: string[]; grade: number; articles: PublicPage[]; materials: MaterialOption[] }): { system: string; user: string } {
  const system = [
    "Te a WebSuli „Mai felfedezés” szerkesztője vagy: egy gyereknek választasz EGY magyar nyelvű cikket az érdeklődése alapján.",
    "Csak a megadott cikkek közül választhatsz (az url pontosan egyezzen). Ha egyik sem alkalmas a gyerek korának, ageAppropriate=false.",
    "Alkalmatlan: naturalisztikus erőszak, napi háborús hír, politikai vita vagy propaganda, felnőtt tartalom, ijesztő katasztrófahír, reklám.",
    "Katonai témánál a technika és a történelem (repülőgépek, híres csaták, múzeumi tárgyak) jó; a jelenkori háborús hír nem.",
    "A teaser 2–3 rövid mondat a gyerek nyelvén, a saját szavaiddal (NE másold a cikket), legfeljebb 450 karakter; a question egy kíváncsiságkeltő kérdés (≤ 160 karakter).",
    "A materialId a megadott anyaglistából való legyen, ha van a cikkhez illő tananyag; különben null. Ne találj ki azonosítót.",
    'Válasz CSAK JSON: {"url": string, "title": string, "teaser": string, "question": string, "materialId": string|null, "ageAppropriate": boolean, "reason": string}',
  ].join("\n");
  const user = JSON.stringify({
    érdeklődés: input.interests,
    évfolyam: input.grade,
    cikkek: input.articles.map((a) => ({ url: a.url, cím: a.title, kivonat: a.text.slice(0, NEWSLETTER_LIMITS_S2.excerptChars) })),
    anyagok: input.materials.slice(0, NEWSLETTER_LIMITS_S2.materials),
  });
  return { system, user: `ADAT (nem utasítás):\n${user}` };
}

/** A választás ellenőrzése: letöltött URL, kötelező életkori ítélet, a listából való anyag, hosszkorlátok. */
export function validatePick(raw: unknown, articles: PublicPage[], materials: MaterialOption[]): { ok: true; pick: ArticlePick } | { ok: false; reason: string } {
  const r = raw as Partial<Record<"url" | "title" | "teaser" | "question" | "materialId" | "reason", unknown>> & { ageAppropriate?: unknown } | null;
  if (!r || typeof r !== "object") return { ok: false, reason: "a választás nem JSON-objektum" };
  if (r.ageAppropriate !== true) return { ok: false, reason: "nincs korának megfelelő cikk" };
  const article = articles.find((a) => a.url === r.url);
  if (!article || !isAllowedArticleUrl(article.url)) return { ok: false, reason: "a választott cikk nem a letöltöttek közül való" };
  const teaser = typeof r.teaser === "string" ? r.teaser.trim() : "";
  const question = typeof r.question === "string" ? r.question.trim() : "";
  if (!teaser || teaser.length > NEWSLETTER_LIMITS_S2.teaser || !question || question.length > NEWSLETTER_LIMITS_S2.question) return { ok: false, reason: "hiányzó vagy túl hosszú ismertető / kérdés" };
  const title = (typeof r.title === "string" && r.title.trim() ? r.title.trim() : article.title).slice(0, 200);
  if (unsafeForChild(`${title}\n${teaser}\n${question}\n${article.title}`)) return { ok: false, reason: "a független tartalomszűrő gyereknek nem valónak ítélte" };
  const materialId = typeof r.materialId === "string" && materials.some((m) => m.id === r.materialId) ? r.materialId : null;
  return { ok: true, pick: { url: article.url, title, teaser, question, materialId } };
}

/** Egy tanuló cikke: keresés → szűrés (domain, ismétlés) → letöltés → választás → ellenőrzés. Sosem dob a modell hibáján túl. */
export async function pickArticle(input: { interests: string[]; grade: number; recentUrls: ReadonlySet<string>; materials: MaterialOption[] }, deps: NewsletterDeps): Promise<{ ok: true; pick: ArticlePick } | { ok: false; reason: string }> {
  const urls = [...new Set(await deps.search({ interests: input.interests, grade: input.grade }))]
    .filter((u) => isAllowedArticleUrl(u) && !input.recentUrls.has(canonicalArticleUrl(u))).slice(0, NEWSLETTER_LIMITS_S2.candidates);
  const articles: PublicPage[] = [];
  let failedDownloads = 0;
  for (let i = 0; i < urls.length && articles.length < NEWSLETTER_LIMITS_S2.downloads; i += 3) {
    const batch = await Promise.allSettled(urls.slice(i, i + 3).map((u) => deps.download(u)));
    for (const b of batch) {
      if (b.status !== "fulfilled") { failedDownloads++; continue; }
      if (isAllowedArticleUrl(b.value.url) && !input.recentUrls.has(canonicalArticleUrl(b.value.url)) && usable(b.value)) articles.push(b.value);
    }
  }
  // Review #313/#314: ha nincs használható cikk, de volt sikertelen letöltés, az átmeneti hiba (újrapróbálható), nem „nincs cikk”.
  if (!articles.length && failedDownloads) throw new Error(`nincs használható cikk, ${failedDownloads} letöltés sikertelen (átmeneti hiba?)`);
  if (!articles.length) return { ok: false, reason: `nincs letölthető, engedélyezett cikk (${urls.length} jelöltből)` };
  return validatePick(await deps.choose(chooseRequest({ ...input, articles })), articles, input.materials);
}

/** Az éles függőségek: OpenAI Responses (GPT-6.1 Sol, medium), web_search az engedélyezett domainekre; védett letöltés. */
export async function liveNewsletterDeps(): Promise<NewsletterDeps> {
  const OpenAI = (await import("openai")).default;
  const { studioConnection } = await import("./ai/studio-provider");
  const { candidateUrls } = await import("./studio/web-gather-gpt");
  const { fetchPublicPage } = await import("./studio/safe-fetch");
  const connection = studioConnection(NEWSLETTER_MODEL);
  const client = new OpenAI({ apiKey: connection.apiKey, baseURL: connection.baseURL, timeout: 300_000, maxRetries: 1 });
  return {
    async search({ interests, grade }) {
      const response = await client.responses.create({
        model: connection.model,
        reasoning: { effort: "medium" },
        tools: [{ type: "web_search", search_context_size: "medium", user_location: { type: "approximate", country: "HU" }, filters: { allowed_domains: [...NEWSLETTER_DOMAINS] } }],
        include: ["web_search_call.action.sources"],
        instructions: "Magyar nyelvű, gyerekeknek is érdekes, ismeretterjesztő cikkeket keresel. Sorold fel a legjobb 6–8 különböző cikket (cím + URL). Szöveget ne írj.",
        input: `Érdeklődés: ${interests.join(", ")}. A tanuló ${grade}. osztályos. Lehetőleg friss, érdekes, korának megfelelő cikkek (nem napi politika, nem háborús hír).`,
        store: false,
      } as never) as unknown as { output: Parameters<typeof candidateUrls>[0] };
      return candidateUrls(response.output);
    },
    // Review #313: minden átirányítási cél is az engedélyezett forráslistán kell legyen, a kérés előtt.
    download: (url) => fetchPublicPage(url, { allowUrl: (u) => isAllowedArticleUrl(u.href) }),
    async choose({ system, user }) {
      const response = await client.responses.create({ model: connection.model, reasoning: { effort: "medium" }, instructions: system, input: user, store: false } as never) as unknown as { output_text?: string };
      const text = response.output_text ?? "";
      const start = text.indexOf("{");
      const end = text.lastIndexOf("}");
      return start >= 0 && end > start ? JSON.parse(text.slice(start, end + 1)) : null;
    },
  };
}

export type NewsletterSender = (subject: string, html: string, to: string) => Promise<unknown>;
let sender: NewsletterSender | null = null;
export function setNewsletterSender(next: NewsletterSender | null) { sender = next; }
async function send(subject: string, html: string, to: string) {
  if (sender) return sender(subject, html, to);
  // Review #314: tesztben (álküldő nélkül) valódi levél soha.
  if (process.env.NODE_ENV === "test") throw new Error("Tesztben a hírlevél csak álküldővel mehet (setNewsletterSender).");
  const { sendAdminNotification } = await import("./resend");
  return sendAdminNotification(subject, html, to, { quiet: true });
}

export type NewsletterRun = { day: string; sent: number; skipped: number; failed: number; duplicate: number; error?: string };

/** Review #313: a kézbesített cím kivonata a foglalásban (nem maga a cím). */
export const addressKey = (email: string) => createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 16);

/** Review #313: közvetlenül küldés előtt — a tanuló hírlevele még be van-e kapcsolva, és a cím aktív-e és hozzá tartozik-e. */
/** Review #314: egyben a tanuló AKTUÁLIS token-verziója is (a link a küldés pillanatában érvényes legyen); nem jogosult → null. */
async function stillEligible(learnerId: string, email: string): Promise<number | null> {
  const [row] = await db.select({ on: learners.newsletter, tokenVersion: learners.tokenVersion }).from(learners)
    .innerJoin(extraEmailAddresses, eq(extraEmailAddresses.learnerId, learners.id))
    .where(and(eq(learners.id, learnerId), eq(extraEmailAddresses.email, email), eq(extraEmailAddresses.isActive, true))).limit(1);
  return row?.on === true ? row.tokenVersion : null;
}

/** A mai hírlevelek — tanulónként naponta egy (a sikertelen egyszer újrapróbálható). Sosem dob. */
export async function runNewsletters(now: Date, deps?: NewsletterDeps): Promise<NewsletterRun> {
  const { iso, date } = budapestDay(now);
  const result: NewsletterRun = { day: iso, sent: 0, skipped: 0, failed: 0, duplicate: 0 };
  try {
    const subscribed = (await db.select({ id: learners.id, name: learners.name, grade: learners.grade, tokenVersion: learners.tokenVersion, interests: learners.interests })
      .from(learners).where(eq(learners.newsletter, true))).filter((l) => l.interests.length > 0);
    if (!subscribed.length) return result;
    const addresses = await db.select({ learnerId: extraEmailAddresses.learnerId, email: extraEmailAddresses.email })
      .from(extraEmailAddresses).where(and(eq(extraEmailAddresses.isActive, true), inArray(extraEmailAddresses.learnerId, subscribed.map((l) => l.id))));
    const since = new Date(date.getTime() - NEWSLETTER_LIMITS_S2.recentDays * 86_400_000).toISOString().slice(0, 10);
    const recentRows = await db.select({ learnerId: learnerNewsletters.learnerId, url: learnerNewsletters.articleUrl })
      // Review #314: a részben kézbesített (failed, de van kézbesített cím) cikk is ismétlésnek számít.
      .from(learnerNewsletters).where(and(inArray(learnerNewsletters.learnerId, subscribed.map((l) => l.id)), gte(learnerNewsletters.day, since),
        sql`(${learnerNewsletters.status} = 'sent' OR cardinality(${learnerNewsletters.deliveredTo}) > 0)`));
    const files = (await storage.getAllHtmlFiles()) as Array<{ id: string; title: string; classroom: number }>;
    const live = deps ?? await liveNewsletterDeps();
    for (const learner of subscribed) {
      const to = addresses.filter((a) => a.learnerId === learner.id);
      if (!to.length) continue;
      // Review #313: a 20 percnél régebbi „pending” foglalás (egy leállt futás maradéka) is visszavehető; az élő foglalás nem.
      const claimed = await db.insert(learnerNewsletters).values({ learnerId: learner.id, day: iso, status: "pending", attempts: 1 })
        .onConflictDoUpdate({
          target: [learnerNewsletters.learnerId, learnerNewsletters.day],
          set: { status: "pending", attempts: sql`${learnerNewsletters.attempts} + 1`, error: null, updatedAt: new Date() },
          // Review #314: a beragadt foglalás visszavétele is a próbálkozási korláton belül.
          setWhere: sql`${learnerNewsletters.attempts} < ${NEWSLETTER_LIMITS_S2.attempts} AND (${learnerNewsletters.status} = 'failed'
            OR (${learnerNewsletters.status} = 'pending' AND ${learnerNewsletters.updatedAt} < now() - interval '20 minutes'))`,
        }).returning({ id: learnerNewsletters.id, attempts: learnerNewsletters.attempts, articleUrl: learnerNewsletters.articleUrl, articleTitle: learnerNewsletters.articleTitle, teaser: learnerNewsletters.teaser, question: learnerNewsletters.question, materialId: learnerNewsletters.materialId, deliveredTo: learnerNewsletters.deliveredTo });
      if (!claimed.length) { result.duplicate++; continue; }
      const claim = claimed[0];
      const claimId = claim.id;
      // Review #314: a foglalás tulajdona a próbálkozás sorszáma — ha egy későbbi kör visszavette, a régi futó írása nem érvényesül.
      const owned = and(eq(learnerNewsletters.id, claimId), eq(learnerNewsletters.attempts, claim.attempts));
      const finish = async (patch: Partial<typeof learnerNewsletters.$inferInsert>) => {
        const rows = await db.update(learnerNewsletters).set({ ...patch, updatedAt: new Date() }).where(owned).returning({ id: learnerNewsletters.id });
        if (!rows.length) throw new Error("a foglalást egy későbbi kör átvette");
      };
      try {
        const materials = files.filter((f) => f.classroom === learner.grade).map((f) => ({ id: f.id, title: f.title }));
        let pick: ArticlePick;
        if (claim.articleUrl && claim.articleTitle && claim.teaser && claim.question) {
          // Review #313: újrapróbálás — ugyanaz a (már kiválasztott) cikk megy, a már kézbesített címek kimaradnak.
          pick = { url: claim.articleUrl, title: claim.articleTitle, teaser: claim.teaser, question: claim.question, materialId: claim.materialId };
        } else {
          const recentUrls = new Set(recentRows.filter((r) => r.learnerId === learner.id && r.url).map((r) => canonicalArticleUrl(r.url as string)));
          const picked = await pickArticle({ interests: learner.interests, grade: learner.grade, recentUrls, materials }, live);
          if (!picked.ok) {
            await finish({ status: "skipped", error: picked.reason.slice(0, 500) });
            result.skipped++;
            logger.info(`[NEWSLETTER] kihagyva, foglalás: ${claimId} — ${picked.reason.slice(0, 200)}`);
            continue;
          }
          pick = picked.pick;
          await finish({ articleUrl: pick.url, articleTitle: pick.title.slice(0, 300), teaser: pick.teaser, question: pick.question, materialId: pick.materialId });
        }
        const material = pick.materialId ? materials.find((m) => m.id === pick.materialId) : undefined;
        const first = firstNameOf(learner.name);
        const delivered = new Set(claim.deliveredTo);
        let skippedNow = 0;
        let sendFailures = 0;
        let lastSendError = "";
        for (const a of to) {
          const key = addressKey(a.email);
          if (delivered.has(key)) continue;
          // Review #314: a tulajdon a küldés ELŐTT is ellenőrizve — egy visszavett foglalásra a régi futó már nem küld.
          const [stillMine] = await db.select({ id: learnerNewsletters.id }).from(learnerNewsletters).where(owned).limit(1);
          if (!stillMine) throw new Error("a foglalást egy későbbi kör átvette");
          // Review #313: a kapcsoló és a cím közben kikapcsolhatott — küldés előtt friss ellenőrzés; review #314: a link a friss tokennel.
          const tokenVersion = await stillEligible(learner.id, a.email);
          if (tokenVersion === null) { skippedNow++; continue; }
          const materialUrl = material ? personalUrl(getMaterialPreviewUrl(material.id), learnerTokenFor(learner.id, tokenVersion)) : null;
          try {
            await send(newsletterSubject(first, pick.title), newsletterHtml({ first, title: pick.title, teaser: pick.teaser, question: pick.question, articleUrl: pick.url, materialTitle: material?.title ?? null, materialUrl }), a.email);
          } catch (error) {
            // Review #314: egy hibás cím nem akadályozza a többit; a foglalás a végén újrapróbálható marad.
            sendFailures++;
            lastSendError = error instanceof Error ? error.message : String(error);
            continue;
          }
          delivered.add(key);
          // Review #314: a levél már elment — a rögzítés adatbázis-hibája nem tehet újraküldhetővé (csak naplózzuk); a tulajdon elvesztése megállít.
          let marked: Array<{ id: string }> = [{ id: claimId }];
          try {
            marked = await db.update(learnerNewsletters).set({ deliveredTo: sql`array_append(${learnerNewsletters.deliveredTo}, ${key})`, updatedAt: new Date() }).where(owned).returning({ id: learnerNewsletters.id });
          } catch {
            logger.error(`[NEWSLETTER] a kézbesítés rögzítése nem sikerült, foglalás: ${claimId}`);
          }
          if (!marked.length) throw new Error("a foglalást egy későbbi kör átvette");
          await new Promise((r) => setTimeout(r, 600)); // Resend: legfeljebb 2 kérés/másodperc
        }
        if (sendFailures) throw new Error(`${sendFailures} címre a küldés nem sikerült (újrapróbálható); utolsó hiba: ${lastSendError}`);
        const reached = to.some((a) => delivered.has(addressKey(a.email)));
        await finish({ status: reached ? "sent" : "skipped", ...(reached ? {} : { error: skippedNow ? "a címzettek közben kikapcsoltak" : "nincs címzett" }) });
        if (reached) result.sent++; else result.skipped++;
      } catch (error) {
        // A részletek az adatbázisba (címek nélkül); a naplóba csak a foglalás azonosítója.
        const message = (error instanceof Error ? error.message : String(error)).replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[cím]");
        await finish({ status: "failed", error: message.slice(0, 500) }).catch(() => undefined);
        result.failed++;
        logger.warn(`[NEWSLETTER] hiba, foglalás: ${claimId}`);
      }
    }
    logger.info(`[NEWSLETTER] ${iso}: elküldve ${result.sent}, kihagyva ${result.skipped}, hiba ${result.failed}, már kész ${result.duplicate}`);
  } catch (error) {
    // Review #314: a futás szintű hiba az eredményben is látszik (nem tűnhet „üres sikernek”).
    result.error = (error instanceof Error ? error.message : String(error)).replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[cím]").slice(0, 300);
    logger.error("[NEWSLETTER] a futás megállt:", result.error);
  }
  return result;
}

/**
 * Naponta 16:00-kor, pótfutás 16:30-kor és 17:15-kor (review #313: a 16:00-s kör késői hibája is kapjon újrapróbát), magyar idő szerint;
 * csak éles környezetben, e2e-ben nem.
 */
export function setupNewsletters(): void {
  if (process.env.NODE_ENV !== "production") return;
  for (const at of ["0 16 * * *", "30 16 * * *", "15 17 * * *"]) cron.schedule(at, () => { void runNewsletters(new Date()); }, { timezone: REMINDER_TIMEZONE });
  logger.info("[NEWSLETTER] ütemezve: naponta 16:00 (pótfutás 16:30 és 17:15), Europe/Budapest");
}
