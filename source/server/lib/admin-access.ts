/**
 * JM7c-1 — az admin-jog EGYETLEN forrása (terv 10.4a, lezárt tulajdonosi döntés 2026-11-16: „A whitelistben rögzített adminok
 * maradnak kőkeményen adminok. […] tanulók és szülők […] játékos-fiók jogosultságuk van, nincs admin jogosultságuk.”).
 *
 *   admin  =  users.is_admin === true  ÉS  nem tiltott  ÉS  az e-mail-cím rajta van az admin-engedélylistán
 *
 * A képlet (`isAdminUser`) minden kérésnél újraszámolódik (a `deserializeUser` minden kérésnél friss sort olvas), ezért aki
 * lekerül a listáról, a KÖVETKEZŐ kérésénél már nem admin. Minden admin-ellenőrző ezt hívja (forrás-őr:
 * tests/admin-access-source-guard.test.ts).
 *
 * Engedélylista: `ADMIN_ALLOWLIST` (vesszővel tagolt címek). Ha nincs beállítva, vagy egyetlen érvényes cím sincs benne, az
 * alapértéke a meglévő `ADMIN_EMAIL` — így a telepítés után a mostani admin beállítás nélkül admin marad. Az `ADMIN_EMAILS`
 * CSAK értesítési lista (lesson-result-email, learner-reports), jogot NEM ad, és itt nem is olvassuk.
 *
 * Kizárás elleni védelem („fail-open a MEGLÉVŐ adminokra, soha nem új jogra”):
 *  - egyik változó sincs → a meglévő `is_admin` jelző marad érvényben, hangos figyelmeztetéssel;
 *  - a lista egyetlen létező, nem tiltott `is_admin` fiókra sem illik (elírt cím, rossz változó) → a lista nem zár ki
 *    mindenkit: a meglévő jelző marad érvényben, induláskor hangos, maszkolt hibanapló. Új admin-jog (Google-os első belépés,
 *    Felhasználók fül) ilyenkor sem adható listán kívüli címnek.
 * Indok: a lista hibája nem zárhatja ki a tulajdonost a saját felületéről; a jelzőt pedig csak listán lévő cím kaphatja meg,
 * tehát az őr senkinek nem ad olyan jogot, amely a telepítés előtt ne lett volna meg.
 */
import { logger } from "./logger";
import { maskEmail } from "./mask-email";

export type AdminPolicySource = "ADMIN_ALLOWLIST" | "ADMIN_EMAIL" | "none";

export type AdminPolicy = {
  source: AdminPolicySource;
  emails: ReadonlySet<string>;
  /** Az `ADMIN_ALLOWLIST` értéke be volt állítva, de egyetlen érvényes címet sem tartalmazott. */
  allowlistInvalid: boolean;
  /** A listában eldobott (hibás alakú) elemek száma. */
  invalidEntries: number;
  /** A kizárás elleni őr gyorsítótárának kulcsa (a lista tartalma). */
  key: string;
};

/** Az admin-jog számításához szükséges mezők (a `users` sor / `req.user` részhalmaza). */
export type AdminCandidate = { email?: string | null; isAdmin?: boolean | null; isBanned?: boolean | null };

/** A kizárás elleni őr adatforrása (élesben a pg-pool): a nem tiltott, `is_admin` jelzős fiókok címei. */
export type AdminAccessDb = { query: (sql: string) => Promise<{ rows: { email: string | null }[] }> };

const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
const POSITIVE_TTL_MS = 60_000;
const NEGATIVE_TTL_MS = 5_000;
const ACTIVE_ADMINS_SQL = "SELECT email FROM users WHERE is_admin = true AND COALESCE(is_banned, false) = false";

/** Kisbetűs, szóköz nélküli cím; hibás alak → null. */
export function normalizeAdminEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim().toLowerCase();
  return EMAIL_RE.test(text) ? text : null;
}

/** Vesszővel (pontosvesszővel, szóközzel) tagolt lista → egyedi, normalizált címek + az eldobott elemek száma. */
export function parseAdminAllowlist(raw: string | undefined | null): { emails: string[]; invalid: number } {
  const emails = new Set<string>();
  let invalid = 0;
  for (const part of (raw ?? "").split(/[,;\s]+/)) {
    if (!part) continue;
    const email = normalizeAdminEmail(part);
    if (email) emails.add(email);
    else invalid++;
  }
  return { emails: [...emails], invalid };
}

let policyMemo: { raw: string; policy: AdminPolicy } | null = null;

/** Az érvényes admin-engedélylista (a környezeti változókból, a nyers érték szerint gyorsítótárazva). */
export function adminPolicy(env: NodeJS.ProcessEnv = process.env): AdminPolicy {
  const allowRaw = env.ADMIN_ALLOWLIST;
  const emailRaw = env.ADMIN_EMAIL;
  const raw = JSON.stringify([allowRaw ?? null, emailRaw ?? null]);
  if (env === process.env && policyMemo?.raw === raw) return policyMemo.policy;
  const allow = parseAdminAllowlist(allowRaw);
  const allowlistInvalid = (allowRaw ?? "").trim() !== "" && allow.emails.length === 0;
  let source: AdminPolicySource = "none";
  let emails: string[] = [];
  if (allow.emails.length > 0) {
    source = "ADMIN_ALLOWLIST";
    emails = allow.emails;
  } else {
    const fallback = parseAdminAllowlist(emailRaw);
    if (fallback.emails.length > 0) {
      source = "ADMIN_EMAIL";
      emails = fallback.emails;
    }
  }
  const sorted = [...emails].sort();
  const policy: AdminPolicy = { source, emails: new Set(sorted), allowlistInvalid, invalidEntries: allow.invalid, key: `${source}:${sorted.join(",")}` };
  if (env === process.env) policyMemo = { raw, policy };
  return policy;
}

/** Rajta van-e a cím az admin-engedélylistán (új admin-jog csak ilyen címnek adható). */
export function isAllowlistedAdminEmail(email: unknown, policy: AdminPolicy = adminPolicy()): boolean {
  const normalized = normalizeAdminEmail(email);
  return normalized !== null && policy.emails.has(normalized);
}

// ── Kizárás elleni őr ──────────────────────────────────────────────────────────────────────────────────────────────────
let guardDb: AdminAccessDb | null = null;
let guardState: { key: string; listedAdminExists: boolean; at: number } | null = null;
let guardInflight: { key: string; promise: Promise<void> } | null = null;

/** A szerver indításakor (auth.ts setupAuth) — az őr innen tudja lekérdezni a meglévő adminokat. */
export function configureAdminAccess(db: AdminAccessDb | null): void {
  guardDb = db;
  guardState = null;
  guardInflight = null;
}

function guardFresh(key: string, now = Date.now()): boolean {
  if (!guardState || guardState.key !== key) return false;
  return now - guardState.at < (guardState.listedAdminExists ? POSITIVE_TTL_MS : NEGATIVE_TTL_MS);
}

async function activeAdminEmails(): Promise<string[]> {
  if (!guardDb) return [];
  const { rows } = await guardDb.query(ACTIVE_ADMINS_SQL);
  return rows.map((r) => normalizeAdminEmail(r.email)).filter((e): e is string => e !== null);
}

async function refreshGuard(policy: AdminPolicy): Promise<void> {
  if (!guardDb) return;
  if (guardInflight?.key === policy.key) return guardInflight.promise;
  const promise = (async () => {
    try {
      const emails = await activeAdminEmails();
      guardState = { key: policy.key, listedAdminExists: emails.some((e) => policy.emails.has(e)), at: Date.now() };
    } catch (error) {
      // Lekérdezési hiba: az őr nem kapcsol be (szigorú lista marad), a hiba látszik.
      logger.error("[ADMIN-ACCESS] a meglévő adminok lekérdezése nem sikerült:", error instanceof Error ? error.message : "ismeretlen hiba");
    } finally {
      guardInflight = null;
    }
  })();
  guardInflight = { key: policy.key, promise };
  return promise;
}

/** Aktív-e a kizárás elleni őr (a lista egyetlen létező, nem tiltott adminra sem illik). Csak a friss állapotot nézi. */
function lockoutFallbackActive(policy: AdminPolicy): boolean {
  return guardFresh(policy.key) && guardState?.listedAdminExists === false;
}

/**
 * A kérés elején (deserializeUser, belépés): ha a döntéshez az őr állapota kell (jelzős, de listán kívüli fiók), frissíti.
 * Jelző nélküli vagy listás fióknál nem kérdez le semmit. `user` nélkül (admin-műveletek listája) mindig frissít, ha kell.
 */
export async function prepareAdminAccess(user?: AdminCandidate | null): Promise<void> {
  const policy = adminPolicy();
  if (policy.source === "none") return;
  if (user && (user.isAdmin !== true || user.isBanned === true || isAllowlistedAdminEmail(user.email, policy))) return;
  // A pozitív eredmény (van listás admin → szigorú) 60 s-ig újrahasznosítható; a NEGATÍV (őr aktív) soha nem öröklődik
  // egy korábbi kérésből vagy az induláskori jelentésből — minden kérés elején újra ellenőrizzük.
  if (!guardFresh(policy.key) || guardState?.listedAdminExists !== true) await refreshGuard(policy);
}

/**
 * AZ admin-jog képlete. Minden admin-döntés ezt hívja (isAuthenticatedAdmin, deserializeUser, /api/auth/user, rt.ts,
 * admin-felirat, Felhasználók fül). Szinkron: a kizárás elleni őr állapotát a `prepareAdminAccess` frissíti a kérés elején.
 */
export function isAdminUser(user: AdminCandidate | null | undefined): boolean {
  if (!user || user.isAdmin !== true || user.isBanned === true) return false;
  const policy = adminPolicy();
  if (policy.source === "none") return true;
  if (isAllowlistedAdminEmail(user.email, policy)) return true;
  return lockoutFallbackActive(policy);
}

/** Induláskori, maszkolt állapotjelentés a naplóba (cím soha nem kerül ki teljes alakban). */
export async function reportAdminAccessStatus(): Promise<void> {
  const policy = adminPolicy();
  if (policy.allowlistInvalid) {
    logger.error("[ADMIN-ACCESS] HIBA: az ADMIN_ALLOWLIST be van állítva, de egyetlen érvényes e-mail-címet sem tartalmaz — helyette az ADMIN_EMAIL érvényes.");
  } else if (policy.invalidEntries > 0) {
    logger.warn(`[ADMIN-ACCESS] az ADMIN_ALLOWLIST ${policy.invalidEntries} hibás elemét figyelmen kívül hagytuk.`);
  }
  if (policy.source === "none") {
    logger.error("[ADMIN-ACCESS] FIGYELEM: sem ADMIN_ALLOWLIST, sem ADMIN_EMAIL nincs beállítva — a meglévő is_admin jelző marad érvényben (fail-open a meglévő adminokra), új admin-jog nem adható. Állítsd be az ADMIN_ALLOWLIST-et.");
    return;
  }
  logger.info(`[ADMIN-ACCESS] admin-engedélylista forrása: ${policy.source}, ${policy.emails.size} cím: ${[...policy.emails].map(maskEmail).join(", ")}`);
  if (!guardDb) return;
  try {
    const active = await activeAdminEmails();
    const listed = active.filter((e) => policy.emails.has(e));
    const unlisted = active.filter((e) => !policy.emails.has(e));
    guardState = { key: policy.key, listedAdminExists: listed.length > 0, at: Date.now() };
    if (unlisted.length > 0) {
      logger.warn(`[ADMIN-ACCESS] ${unlisted.length} is_admin jelzős fiók nincs az engedélylistán, ezért NEM admin: ${unlisted.map(maskEmail).join(", ")}`);
    }
    if (listed.length === 0) {
      logger.error(`[ADMIN-ACCESS] HIBA: az engedélylista (${policy.source}) egyetlen létező, nem tiltott admin-fiókra sem illik — a kizárás elleni őr bekapcsolt: a meglévő is_admin jelző marad érvényben, amíg a lista nincs javítva.`);
    } else {
      logger.info(`[ADMIN-ACCESS] ${listed.length} listás admin-fiók létezik; az engedélylista érvényben.`);
    }
  } catch (error) {
    logger.error("[ADMIN-ACCESS] az induláskori admin-ellenőrzés nem sikerült:", error instanceof Error ? error.message : "ismeretlen hiba");
  }
}
