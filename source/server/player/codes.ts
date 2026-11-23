/**
 * JM7a — e-mailes belépés tiszta segédfüggvényei (docs/specs/2026-11-16-jatekok-jatekelmeny-vegrehajtas.md „JM7a” 4.).
 * Adatbázis és hálózat nélkül: normalizálás, korlát-kulcs, kód / link-token generálás, HMAC-hash, korlátok.
 * A kód és a link-token SOHA nem tárolódik nyersen, és nem kerül naplóba; a hash kulcsa a SESSION_SECRET-ből levezetett.
 *
 * Korlátok együtt (biztonsági review #445):
 *  - Kód: 8 számjegy (10^8). Fiókonként (pontos cím) legfeljebb 5 hibás próba egy kódra ÉS legfeljebb 10 hibás próba
 *    24 óra alatt (utána a kódos út arra a címre zárva, a válasz kívülről változatlan; a linkes út működik).
 *    Kitalálási esély egy kiszemelt fiókra: ≤ 10 / 10^8 = 1·10^-7 naponta, ≤ 3650 / 10^8 ≈ 0,0037 % évente.
 *  - Levél: címenként (kanonizált korlát-kulcs, aliasok összevonva) 3 / 15 perc és 10 / 24 óra; IP-nként 50 / 15 perc
 *    és 150 / 24 óra; az egész szerveren a belépő levelekre `PLAYER_LOGIN_EMAIL_DAILY_MAX` / 24 óra (alap 300) — csak
 *    erre a levéltípusra, a többi levelezést nem érinti.
 */
import { createHmac, randomBytes, randomInt } from "node:crypto";

export const CODE_LENGTH = 8;
export const CODE_TTL_MS = 10 * 60_000;
export const LINK_TTL_MS = 15 * 60_000;
/** Hibás próba egy kódrekordon. */
export const MAX_CODE_ATTEMPTS = 5;
/** Hibás próba egy fiókra (pontos cím hash-e) 24 óra alatt — utána a kódos út zárva. */
export const MAX_FAILED_ATTEMPTS_PER_DAY = 10;
export const DAY_MS = 24 * 60 * 60_000;
/** Kódkérés korlát-kulcsonként (kanonizált cím) ennyi időablakban / naponta legfeljebb ennyiszer. */
export const START_PER_EMAIL_MAX = 3;
export const START_PER_EMAIL_DAILY_MAX = 10;
export const START_WINDOW_MS = 15 * 60_000;
/** IP-nként (iskolai NAT mögött egy osztály is beleférjen). */
export const START_PER_IP_MAX = 50;
export const START_PER_IP_DAILY_MAX = 150;
/** Beváltási kísérlet IP-nként (a fiókonkénti hibás-próba plafon mellé). */
export const VERIFY_PER_IP_MAX = 120;
/** A kódrekordok (a cím már a beváltáskor / lejáratkor törlődik) ennyi idő után teljesen törlődnek. */
export const CODE_RETENTION_MS = DAY_MS;
export const DEFAULT_LOGIN_EMAIL_DAILY_MAX = 300;

/** A belépő levelek szerverszintű 24 órás plafonja (`PLAYER_LOGIN_EMAIL_DAILY_MAX`, pozitív egész; hibás érték → alap). */
export function loginEmailDailyMax(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number((env.PLAYER_LOGIN_EMAIL_DAILY_MAX ?? "").trim());
  return Number.isInteger(n) && n > 0 && n <= 100_000 ? n : DEFAULT_LOGIN_EMAIL_DAILY_MAX;
}

const MAX_EMAIL_LENGTH = 254;
const MAX_LOCAL_LENGTH = 64;
/** Szigorú, egyetlen cím: helyi rész `[a-z0-9._%+-]`, ASCII domain címkékkel, betűs TLD. Szóköz, vezérlőkarakter,
 *  `<>(),;:"[]\`, többszörös `@`, „Név <cím>” alak, sortörés (fejléc-injektálás) mind elutasítva. */
const LOCAL = /^[a-z0-9][a-z0-9%+_-]*(?:\.[a-z0-9%+_-]+)*$/;
const DOMAIN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/;

/** A megerősítendő cím: trim + NFC + kisbetű, majd szigorú alak-ellenőrzés. Hibás → null. */
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().normalize("NFC").toLowerCase();
  if (email.length === 0 || email.length > MAX_EMAIL_LENGTH) return null;
  const at = email.indexOf("@");
  if (at < 1 || at !== email.lastIndexOf("@")) return null;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (local.length > MAX_LOCAL_LENGTH || !LOCAL.test(local) || !DOMAIN.test(domain)) return null;
  return email;
}

const GMAIL_DOMAINS = new Set(["gmail.com", "googlemail.com"]);

/**
 * A korlátok kulcsa (NEM a fiók azonosítója): a `+címke` mindenhol, Gmailnél a pontok is el, `googlemail.com` →
 * `gmail.com`. Így `a.b+x@gmail.com` és `ab@gmail.com` KÉT külön fiók lehet (a fiók a megadott, normalizált cím),
 * de a levél- és kódkérési keretük közös — egy postafiók aliasokkal sem bombázható.
 */
export function limitKey(normalizedEmail: string): string {
  const at = normalizedEmail.lastIndexOf("@");
  let local = normalizedEmail.slice(0, at);
  let domain = normalizedEmail.slice(at + 1);
  const plus = local.indexOf("+");
  if (plus >= 0) local = local.slice(0, plus);
  if (GMAIL_DOMAINS.has(domain)) { local = local.replace(/\./g, ""); domain = "gmail.com"; }
  return `${local}@${domain}`;
}

/**
 * P-020 (tulajdonosi döntés 2026-11-23): a játékos-fiók KULCSA — postafiókonként egy fiók. Konzervatív szabály: CSAK
 * `gmail.com` / `googlemail.com` címen vágjuk le a `+címkét`, töröljük a pontokat a helyi részből, és `googlemail.com` →
 * `gmail.com`; minden más domainen csak trim + kisbetű (ott a `+címke` megmarad, mert nem garantált, hogy ugyanaz a
 * postafiók). UGYANEZ a szabály SQL-ben a `player_accounts.email_key` generált oszlopban (migrations/0045) — a kettőnek
 * egyeznie kell (DB-teszt ellenőrzi). Eltér a `limitKey`-től (az a korlátok / tiltás tágabb kulcsa, minden domainen `+` nélkül).
 */
export function accountEmailKey(normalizedEmail: string): string {
  const email = normalizedEmail.trim().toLowerCase();
  const at = email.lastIndexOf("@");
  const domain = email.slice(at + 1);
  if (at < 1 || !GMAIL_DOMAINS.has(domain)) return email;
  const local = email.slice(0, at).split("+")[0]!.replace(/\./g, "");
  return `${local}@gmail.com`;
}

/** A hash-kulcs: HMAC(SESSION_SECRET, "player-auth-v1"). A titok rotációja a függő kódokat érvényteleníti (rövid életűek). */
export function playerAuthKey(env: NodeJS.ProcessEnv = process.env): Buffer {
  const secret = env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET must be set");
  return createHmac("sha256", secret).update("player-auth-v1").digest();
}

function hmacHex(key: Buffer, value: string): string {
  return createHmac("sha256", key).update(value).digest("hex");
}

export function emailHash(key: Buffer, normalizedEmail: string): string {
  return hmacHex(key, `email:${normalizedEmail}`);
}

/**
 * JM7b-utójavítás K1: a törölt, de tiltott fiók címének visszafejthetetlen ujjlenyomata (migrations/0041). A KANONIZÁLT
 * címből (`limitKey`: kisbetű, gmail-pont és `+alias` összevonva), hogy a változatokkal se lehessen tiltatlan fiókot nyitni.
 * A kulcs a `SESSION_SECRET`-ből levezetett: rotációja után a régi ujjlenyomatok nem egyeznek (a tiltás elvész — ugyanígy
 * érvénytelenednek a belépőkódok és a tanulói linkek is).
 */
export function banFingerprint(key: Buffer, normalizedEmail: string): string {
  return hmacHex(key, `ban:${limitKey(normalizedEmail)}`);
}

/**
 * K1b: a törölt, tiltott fiókok ujjlenyomatának kulcsa — külön, stabil változó (`PLAYER_BAN_KEY`), hogy a munkamenet-titok
 * (`SESSION_SECRET`) rotációja ne érintse; hiányában visszaesés a `SESSION_SECRET`-ből levezetett kulcsra (`playerAuthKey`).
 */
export function playerBanKey(env: NodeJS.ProcessEnv = process.env): Buffer {
  const secret = (env.PLAYER_BAN_KEY ?? "").trim();
  return secret ? createHmac("sha256", secret).update("player-ban-v1").digest() : playerAuthKey(env);
}

/** A tiltás-ujjlenyomat kulcsának rövid azonosítója (nem fedi fel a kulcsot) — a rotáció rendszerszintű felismeréséhez. */
export function banKeyId(key: Buffer): string {
  return hmacHex(key, "ban-key-id").slice(0, 16);
}

/**
 * K1-c: a törölt fiók után megmaradt tiltás-ujjlenyomat megőrzési ideje hónapban, a tiltástól számítva
 * (`PLAYER_BAN_RETENTION_MONTHS`, 1–120 egész; hiányzó / hibás érték → 12). Az ÉLŐ tiltott fiók tiltása ettől nem jár le.
 */
export const DEFAULT_BAN_RETENTION_MONTHS = 12;
export function banRetentionMonths(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number((env.PLAYER_BAN_RETENTION_MONTHS ?? "").trim());
  return Number.isInteger(n) && n >= 1 && n <= 120 ? n : DEFAULT_BAN_RETENTION_MONTHS;
}

/**
 * JM7b (review #449): a kódrekordok CÉL szerinti elkülönítése — a fióktörlés kódjai külön e-mail-hash-tartományban élnek,
 * így a belépő- és a törlési kód egymás „legutóbbi kód” keresését nem zavarja, és egymás helyett nem váltható be.
 * A belépés hash-e változatlan (`emailHash`). A levélkeret: a belépő kérés a két cél kéréseit összesítve számolja, a törlési
 * kérés csak a sajátjait (`deleteLimitHash`, N3).
 */
export type CodePurpose = "login" | "delete";
export function purposeEmailHash(key: Buffer, normalizedEmail: string, purpose: CodePurpose): string {
  return purpose === "login" ? emailHash(key, normalizedEmail) : hmacHex(key, `email-delete:${normalizedEmail}`);
}

/** A cím mindkét céltartományának hash-e (hibás-próba plafon, törlés, export). */
export function allPurposeEmailHashes(key: Buffer, normalizedEmail: string): string[] {
  return [purposeEmailHash(key, normalizedEmail, "login"), purposeEmailHash(key, normalizedEmail, "delete")];
}

export function limitHash(key: Buffer, normalizedEmail: string): string {
  return hmacHex(key, `limit:${limitKey(normalizedEmail)}`);
}

/**
 * JM7b-utójavítás (N3): a törlési kódkérések SAJÁT címenkénti levélkerete. A törlési kódot csak a fiók bejelentkezett
 * munkamenete kérheti, ezért a névtelen belépőkód-kérések nem fogyaszthatják el; a belépő kérés kerete viszont a törlési
 * kéréseket is beszámítja (`[limitHash, deleteLimitHash]`), így a levélbomba elleni védelem nem gyengül.
 */
export function deleteLimitHash(key: Buffer, normalizedEmail: string): string {
  return hmacHex(key, `limit-delete:${limitKey(normalizedEmail)}`);
}

/** A kód hash-e a címhez kötve (ugyanaz a kód más címre nem érvényes). */
export function codeHash(key: Buffer, emailHashHex: string, code: string): string {
  return hmacHex(key, `code:${emailHashHex}:${code}`);
}

export function linkHash(key: Buffer, linkToken: string): string {
  return hmacHex(key, `link:${linkToken}`);
}

/** 8 jegyű, egyenletes eloszlású kód (`crypto.randomInt`). */
export function generateCode(): string {
  return String(randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, "0");
}

/** 32 bájtos átlátszatlan link-token (base64url, 43 jel) — e-mail-címet nem tartalmaz. */
export function generateLinkToken(): string {
  return randomBytes(32).toString("base64url");
}

export const CODE_PATTERN = /^\d{8}$/;
export const LINK_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
