/**
 * JM7b — a regisztrált játékos becenevének szűrője és foglaltsági kulcsa (terv 10.4 „Regisztráció”, 10.9 gyermekvédelem;
 * végrehajtás „JM7b”). Tiszta TS (kliens és szerver közös), véletlen csak a hívó által adott forrásból.
 *
 * Szabályok (a sorrend számít — előbb a karakterkészlet, utána a tartalom):
 *  - Unicode NFKC normalizálás; vezérlő-, formázó- (nulla szélességű, kétirányú: U+200B–U+200F, U+202A–U+202E,
 *    U+2066–U+2069, U+FEFF), magán- és helyettesítő karakter, kombináló jel → elutasítva (a normalizálás ELŐTT és UTÁN is);
 *  - csak latin írású betű (magyar ékezetek engedve), számjegy, szóköz, `_`, `-`; a végén opcionálisan a rendszer
 *    által adott `#1234` megkülönböztető — más írásrendszer (cirill, görög …) tiltva: ez az alap homoglifa-szabály
 *    (pl. a cirill „а” nem keverhető a latin „a”-val);
 *  - 3–16 karakter (a megkülönböztető nélkül), legalább egy betű; a szélső szóközök levágva, a többszörös szóköz egyre;
 *  - e-mail-, URL- és telefonszám-szerű minta tiltva;
 *  - trágár / sértő kifejezés magyarul és angolul — ékezet-, kis-/nagybetű-, leet- (0→o, 1→i, 3→e, 4→a, 5→s, 7→t, @→a,
 *    $→s) és ismétlés-független („kuuurva”) összevetéssel, a szóközök / jelek kihagyásával („f a s z”);
 *  - megtévesztő, hivatalosnak látszó név (admin, moderátor, websuli, tanár, igazgató, support …) tiltva.
 * A foglaltság kulcsa (`nicknameKey`) kis-/nagybetű-, ékezet- és elválasztó-független, és a vizuálisan összetéveszthető
 * karaktereket (0/o, 1/l/i/I/|) egybevonja („Kata” = „Kátá” = „K a t a”; „Leo” = „1eo”); az adatbázisban EGYEDI index
 * véd a versenyhelyzet ellen (`player_accounts.nickname_key`).
 * A megjelenítés mindenhol szövegként történik (React-szövegcsomópont) — HTML-ként soha.
 */

export const PLAYER_NICK_MIN = 3;
export const PLAYER_NICK_MAX = 16;
/** A rendszer által adott megkülönböztető (`#1234`) — csak ütközéskor ajánljuk, kézzel is beírható. */
export const DISCRIMINATOR = /#(\d{4})$/;

export type NicknameProblem =
  | "INVISIBLE" | "CHARS" | "SCRIPT" | "LENGTH_SHORT" | "LENGTH_LONG" | "NO_LETTER" | "EMAIL" | "URL" | "PHONE" | "BLOCKED" | "RESERVED";

export type NicknameCheck =
  | { ok: true; nickname: string; key: string }
  | { ok: false; problems: NicknameProblem[] };

export const NICKNAME_MESSAGES: Record<NicknameProblem, string> = {
  INVISIBLE: "Láthatatlan vagy különleges vezérlőjel nem lehet a becenévben.",
  CHARS: "Csak betű, szám, szóköz, alsó vonás (_) és kötőjel (-) lehet benne.",
  SCRIPT: "Csak a magyar / angol ábécé betűi lehetnek benne (ékezettel is).",
  LENGTH_SHORT: `Legalább ${PLAYER_NICK_MIN} karakter legyen.`,
  LENGTH_LONG: `Legfeljebb ${PLAYER_NICK_MAX} karakter lehet.`,
  NO_LETTER: "Legyen benne legalább egy betű.",
  EMAIL: "E-mail-cím nem lehet becenév.",
  URL: "Weboldal-cím nem lehet becenév.",
  PHONE: "Telefonszám-szerű számsor nem lehet a becenévben.",
  BLOCKED: "Ez a becenév nem megfelelő. Válassz másikat!",
  RESERVED: "Ez hivatalos névnek tűnik (pl. admin, tanár, WebSuli) — válassz másikat!",
};

// Vezérlő (Cc), formázó (Cf: nulla szélességű, kétirányú, BOM), magán (Co), helyettesítő (Cs), ki nem osztott (Cn) karakter.
const INVISIBLE = /[\p{Cc}\p{Cf}\p{Co}\p{Cs}\p{Cn}\p{Zl}\p{Zp}]/u;
const COMBINING = /\p{M}/u;
const ALLOWED = /^[\p{L}\p{N} _-]+$/u;
const LATIN_LETTER = /\p{Script=Latin}/u;
const LETTER = /\p{L}/u;
const DIGIT = /\p{N}/u;

/** Ékezet nélküli, kisbetűs alak (NFD + kombináló jelek ki). */
function stripMarks(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "@": "a", "$": "s", "!": "i", "|": "i" };

/** A tartalomszűrő alakja: ékezet nélkül, kisbetűvel, leet visszafordítva, csak a–z. */
export function foldNickname(text: string): string {
  return stripMarks(text).replace(/[0134578@$!|]/g, (c) => LEET[c] ?? c).replace(/[^a-z]/g, "");
}

/** Az egymást követő azonos betűk egyre („kuuurva” → „kurva”). */
const collapse = (s: string) => s.replace(/(.)\1+/g, "$1");

/**
 * Trágár / sértő szótövek (ékezet nélkül, kisbetűvel). A „szar” / „fos” csak toldalékkal szerepel (a „Szarvas”,
 * „Fosztó” ne essen ki). Bővítés: csak kézzel ellenőrzött tő, ellenpróbával (tests/nickname-filter.test.ts).
 */
const BLOCKED_ROOTS: readonly string[] = [
  // magyar
  "fasz", "pina", "punci", "picsa", "geci", "kurva", "kurvi", "buzi", "szaros", "szarhazi", "szarfej", "fosos", "fospisztoly",
  "bazd", "bazm", "baszd", "baszo", "baszni", "basztam", "kocsog", "csicska", "ribanc", "hulye", "idiota", "nyomorek",
  "cigany", "zsido", "segg", "anyad", "mocskos", "dogolj", "megdoglesz", "lofasz", "fityma",
  "kibasz", "elbasz", "retkes", "szajha", "kurvaany", "majomarcu", "patkanyarcu", "rohadek", "rohadj",
  // angol
  "fuck", "shit", "bitch", "cunt", "dick", "cock", "pussy", "whore", "slut", "bastard", "asshole", "nigger", "nigga",
  "faggot", "retard", "rape", "porn", "sex", "nazi", "hitler", "kkk", "penis", "vagina", "boob", "tits", "wank", "jerkoff",
  "killyou",
];

/** Kivétel-szavak, amelyekben egy tiltott tő ártatlanul szerepel (ellenpróbák: tests/nickname-filter.test.ts). */
const ROOT_EXCEPTIONS: Record<string, readonly string[]> = {
  sex: ["essex", "sussex", "sextans"],
  pina: ["pinata"],
  dick: ["dickens"],
  rape: ["grape", "drape", "trapez"],
  cock: ["peacock", "cockatoo"],
  nazi: ["ignazi"],
};

function containsRoot(folded: string, root: string): boolean {
  const exceptions = ROOT_EXCEPTIONS[root] ?? [];
  const scrub = (s: string) => exceptions.reduce((acc, ex) => acc.split(ex).join(""), s);
  // A dupla betűs tő („segg”) csak pontos egyezéssel (összevonva „seg” lenne — a „Segítő” kiesne);
  // a többi az ismétlés-összevont alakban is keresendő („kuuurva”).
  if (/(.)\1/.test(root)) return scrub(folded).includes(root);
  return scrub(folded).includes(root) || scrub(collapse(folded)).includes(root);
}

/** Hivatalosnak / szervezőnek látszó nevek (megszemélyesítés ellen). */
const RESERVED_ROOTS: readonly string[] = [
  "admin", "adminisztrator", "moderator", "moderalo", "websuli", "webiskola", "tanar", "tanito", "igazgato", "oktato",
  "rendszer", "system", "support", "staff", "official", "hivatalos", "owner", "tulajdonos", "sysop", "root", "ugyfelszolgalat",
  "operator", "fejleszto", "developer", "teacher", "principal", "anthropic", "claude",
];

const RESERVED_WORDS = new Set(["mod", "mods", "gm", "dev"]);
/** Ártatlan szavak, amelyekben egy foglalt tő szerepel („Badminton”). */
const RESERVED_EXCEPTIONS: readonly string[] = ["badminton"];

const EMAIL_PROVIDERS = ["gmail", "freemail", "citromail", "hotmail", "outlook", "yahoo", "icloud", "protonmail"];

function isEmailLike(raw: string, folded: string): boolean {
  if (raw.includes("@")) return true;
  if (EMAIL_PROVIDERS.some((p) => folded.includes(p))) return true;
  return /(^|\s)(kukac|at)\s+\S+\s+(pont|dot)\s+\S+/i.test(raw);
}

function isUrlLike(raw: string, folded: string): boolean {
  if (/(https?|www)/i.test(raw) || folded.includes("http") || folded.includes("www")) return true;
  if (/\.(hu|com|net|org|eu|io)\b/i.test(raw)) return true;
  return /(^|\s)(pont|dot)\s*(hu|com|net|org|eu|io)(\s|$)/i.test(raw);
}

/** A beírt szöveg előkészítése: NFKC, szélső szóközök le, belső szóközök egyre. Nem szűr — csak egységesít. */
export function prepareNickname(raw: string): string {
  return raw.normalize("NFKC").trim().replace(/ {2,}/g, " ");
}

/** A foglaltság kulcsa: ékezet- és kisbetű-független, elválasztók nélkül, az összetéveszthetők (0/o, 1/l/i/|) egybevonva. */
export function nicknameKey(nickname: string): string {
  return stripMarks(prepareNickname(nickname))
    .replace(/0/g, "o")
    .replace(/[1l|]/g, "i")
    .replace(/[\s_#-]/g, "");
}

/** A becenév ellenőrzése. Siker → a tárolandó (előkészített) alak és a foglaltsági kulcs. */
export function checkPlayerNickname(raw: unknown): NicknameCheck {
  if (typeof raw !== "string") return { ok: false, problems: ["LENGTH_SHORT"] };
  // A normalizálás ELŐTT is: az NFKC néhány formázó karaktert eltüntetne / átírna, de a szándék (rejtés) már látszik.
  if (INVISIBLE.test(raw)) return { ok: false, problems: ["INVISIBLE"] };
  const nickname = prepareNickname(raw);
  if (INVISIBLE.test(nickname)) return { ok: false, problems: ["INVISIBLE"] };
  const problems: NicknameProblem[] = [];
  const disc = DISCRIMINATOR.exec(nickname);
  const base = disc ? nickname.slice(0, disc.index) : nickname;
  // A tartalomszűrő a megkülönböztető NÉLKÜLI részen fut (a „#1234” leet-fordítása ne adjon ki véletlen tövet).
  const folded = foldNickname(base);
  const len = Array.from(base).length;

  if (isEmailLike(nickname, folded)) problems.push("EMAIL");
  else if (isUrlLike(nickname, folded)) problems.push("URL");
  if (COMBINING.test(base) || !ALLOWED.test(base)) {
    if (!problems.includes("EMAIL") && !problems.includes("URL")) problems.push("CHARS");
  } else if (Array.from(base).some((ch) => LETTER.test(ch) && !LATIN_LETTER.test(ch))) {
    problems.push("SCRIPT");
  } else if (Array.from(base).some((ch) => DIGIT.test(ch) && !/[0-9]/.test(ch))) {
    // Nem ASCII számjegy (pl. arab-indiai, teljes szélességű — az NFKC után is): megtévesztő, tiltva.
    problems.push("SCRIPT");
  }
  if (len < PLAYER_NICK_MIN) problems.push("LENGTH_SHORT");
  if (len > PLAYER_NICK_MAX) problems.push("LENGTH_LONG");
  if (len > 0 && !Array.from(base).some((ch) => LETTER.test(ch))) problems.push("NO_LETTER");
  if (base.replace(/\D/g, "").length >= 6) problems.push("PHONE");
  if (BLOCKED_ROOTS.some((root) => containsRoot(folded, root))) problems.push("BLOCKED");
  const words = stripMarks(base).split(/[\s_-]+/).filter(Boolean);
  const reservedScan = RESERVED_EXCEPTIONS.reduce((acc, ex) => acc.split(ex).join(""), folded);
  if (RESERVED_ROOTS.some((root) => reservedScan.includes(root)) || words.some((w) => RESERVED_WORDS.has(w))) problems.push("RESERVED");

  if (problems.length > 0) return { ok: false, problems };
  return { ok: true, nickname, key: nicknameKey(nickname) };
}

/** Ütközéskor ajánlott alak: a becenév + `#` + négy számjegy (a hossz-korlát a megkülönböztető nélkül értendő). */
export function withDiscriminator(nickname: string, n: number): string {
  const base = prepareNickname(nickname).replace(DISCRIMINATOR, "");
  return `${base}#${String(Math.abs(Math.trunc(n)) % 10_000).padStart(4, "0")}`;
}

/** A közös névlisták (a JM1 vendég-becenevei is ezekből: shared/nicknames.ts `guestNickname`). */
export const SUGGESTION_ADJECTIVES: readonly string[] = [
  "Bátor", "Gyors", "Okos", "Vidám", "Ügyes", "Csillogó", "Fürge", "Merész", "Szorgos", "Kíváncsi",
  "Nyugodt", "Lelkes", "Villám", "Napsugár", "Titkos", "Vagány", "Kedves", "Éber", "Hős", "Szuper",
];

export const SUGGESTION_ANIMALS: readonly string[] = [
  "Róka", "Bagoly", "Delfin", "Panda", "Sas", "Mókus", "Teknős", "Tigris", "Pingvin", "Sün",
  "Hiúz", "Vidra", "Koala", "Holló", "Gepárd", "Fóka", "Láma", "Zebra", "Hód", "Sólyom",
];

/** Ajánlott becenevek (melléknév + állat), ismétlés nélkül; a véletlen forrást a hívó adja (szerveren `crypto`). */
export function suggestNicknames(random: () => number, count: number): string[] {
  const out = new Set<string>();
  const max = SUGGESTION_ADJECTIVES.length * SUGGESTION_ANIMALS.length;
  for (let guard = 0; out.size < Math.min(count, max) && guard < count * 20; guard++) {
    const a = SUGGESTION_ADJECTIVES[Math.floor(random() * SUGGESTION_ADJECTIVES.length) % SUGGESTION_ADJECTIVES.length]!;
    const b = SUGGESTION_ANIMALS[Math.floor(random() * SUGGESTION_ANIMALS.length) % SUGGESTION_ANIMALS.length]!;
    const name = `${a} ${b}`;
    if (Array.from(name).length <= PLAYER_NICK_MAX) out.add(name);
  }
  return [...out];
}
