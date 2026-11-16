/**
 * JM7b — a regisztrált játékos becenevének szűrője és foglaltsági kulcsa (terv 10.4 „Regisztráció”, 10.9 gyermekvédelem;
 * végrehajtás „JM7b”). Tiszta TS (kliens és szerver közös), véletlen csak a hívó által adott forrásból.
 *
 * Szabályok (a sorrend számít — előbb a karakterkészlet, utána a tartalom):
 *  - Unicode NFKC normalizálás; vezérlő-, formázó- (nulla szélességű, kétirányú: U+200B–U+200F, U+202A–U+202E,
 *    U+2066–U+2069, U+FEFF), magán- és helyettesítő karakter, kombináló jel → elutasítva (a normalizálás ELŐTT és UTÁN is);
 *  - ENGEDÉLYLISTA (review #449, K1): csak ASCII betű és számjegy, a magyar ékezetes betűk (á é í ó ö ő ú ü ű és nagybetűs
 *    párjaik), szóköz, `_`, `-`; a végén opcionálisan a rendszer által adott `#1234` megkülönböztető. Minden más kódpont
 *    tiltva — a más írásrendszerű (cirill, görög) ÉS a latin írású hasonmás betűk (IPA, kiskapitális, pont nélküli i) is,
 *    így a foglaltsági kulcs és a tartalomszűrő nem kerülhető meg;
 *  - 3–16 karakter (a megkülönböztető nélkül), legalább egy betű; a szélső szóközök levágva, a többszörös szóköz egyre;
 *  - e-mail-, URL- és telefonszám-szerű minta tiltva;
 *  - trágár / sértő kifejezés magyarul és angolul — ékezet-, kis-/nagybetű-, leet- (0→o, 1→i, 3→e, 4→a, 5→s, 7→t, @→a,
 *    $→s) és ismétlés-független („kuuurva”) összevetéssel, a szóközök / jelek kihagyásával („f a s z”);
 *  - megtévesztő, hivatalosnak látszó név (admin, moderátor, websuli, tanár, igazgató, support …) tiltva.
 * A foglaltság kulcsa (`nicknameKey`) kis-/nagybetű-, ékezet- és elválasztó-független, és a vizuálisan összetéveszthető
 * karaktereket (0/o, 1/l/i/I/|) egybevonja („Kata” = „Kátá” = „K a t a”; „Leo” = „1eo”) — ugyanazzal a `confusableFold`-dal,
 * amelyen a trágárság- és a foglalt-név szűrő is fut (N1: az „ADMlN” / „GECl” így nem csúszik át); az adatbázisban EGYEDI index
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
  CHARS: "Csak a magyar ábécé betűi (ékezettel is), szám, szóköz, alsó vonás (_) és kötőjel (-) lehet benne.",
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
const ALLOWED = /^[A-Za-z0-9ÁÉÍÓÖŐÚÜŰáéíóöőúüű _-]+$/;
const LATIN_LETTER = /\p{Script=Latin}/u;
const LETTER = /\p{L}/u;
const DIGIT = /\p{N}/u;

/** Ékezet nélküli, kisbetűs alak (NFD + kombináló jelek ki). */
function stripMarks(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/**
 * Az EGYETLEN összetéveszthetőség-normalizálás (review #449 újraellenőrzés, N1): ékezet nélkül, kisbetűvel, a vizuálisan
 * összetéveszthető jelek egybevonva (0 → o; 1, l, I, |, ! → i — talpatlan betűtípusban a kis L és a nagy I azonos). Erre
 * épül a foglaltsági kulcs (`nicknameKey`) ÉS a tartalomszűrő alakja (`foldNickname`) is, így a becenév MINDEN l / I / 1
 * olvasata egyszerre vizsgált, és a kettő nem térhet el egymástól.
 */
export function confusableFold(text: string): string {
  return stripMarks(text).replace(/0/g, "o").replace(/[1l|!]/g, "i");
}

/**
 * A többi leet-csere (a 0 / 1 / | / ! a `confusableFold`-ban). N1b: a 2 / 6 / 9 is (2 ~ z, 6 / 9 ~ g) — CSAK a szűrőben;
 * a foglaltsági kulcs (`nicknameKey`) ezeket nem cseréli, így a tárolt nevek kulcsa változatlan.
 */
const LEET: Record<string, string> = { "2": "z", "3": "e", "4": "a", "5": "s", "6": "g", "7": "t", "8": "b", "9": "g", "@": "a", "$": "s" };

/** A tartalomszűrő alakja: az összetéveszthetők egybevonva, leet visszafordítva, csak a–z. */
export function foldNickname(text: string): string {
  return confusableFold(text).replace(/[2-9@$]/g, (c) => LEET[c] ?? c).replace(/[^a-z]/g, "");
}

/**
 * N1b: többkarakteres hasonmások (rn ~ m, vv ~ w, cl ~ d) — a szűrő TOVÁBBI olvasatai (a kulcsban nem). Az előfordulásonként
 * választható csere minden kombinációja (egy valódi „cl” mellett egy hasonmás is lehet: „Claucle”); a név akkor tiltott, ha
 * bármely olvasata az („adrnin”, „vvebsuli”, „Moclerator”). Legfeljebb 8 előfordulás kombinálódik (2^8 olvasat; egy
 * 16 karakteres névben ennél több nem fér el) — efölött csak a „mind” és a „semmi” olvasat.
 */
const MULTI_CHAR: Record<string, string> = { rn: "m", vv: "w", cl: "d" };
const MAX_MULTI_CHAR_SITES = 8;

function multiCharReadings(text: string): string[] {
  const plain = stripMarks(text);
  const sites = [...plain.matchAll(/rn|vv|cl/g)].map((m) => m.index!);
  if (sites.length === 0) return [];
  const build = (mask: (i: number) => boolean) => {
    let out = "";
    let at = 0;
    sites.forEach((pos, i) => {
      out += plain.slice(at, pos) + (mask(i) ? MULTI_CHAR[plain.slice(pos, pos + 2)]! : plain.slice(pos, pos + 2));
      at = pos + 2;
    });
    return out + plain.slice(at);
  };
  if (sites.length > MAX_MULTI_CHAR_SITES) return [build(() => true)];
  const readings: string[] = [];
  for (let m = 1; m < 1 << sites.length; m++) readings.push(build((i) => (m & (1 << i)) !== 0));
  return readings;
}

/**
 * Trágár / sértő szótövek (ékezet nélkül, kisbetűvel). A „szar” / „fos” csak toldalékkal szerepel (a „Szarvas”,
 * „Fosztó” ne essen ki). Bővítés: csak kézzel ellenőrzött tő, ellenpróbával (tests/nickname-filter.test.ts).
 */
export const BLOCKED_ROOTS: readonly string[] = [
  // magyar
  "fasz", "pina", "punci", "picsa", "geci", "kurva", "kurvi", "buzi", "szaros", "szarhazi", "szarfej", "fosos", "fospisztoly",
  "bazd", "bazm", "baszd", "baszo", "baszni", "basztam", "kocsog", "csicska", "ribanc", "hulye", "idiota", "nyomorek",
  "cigany", "zsido", "segg", "anyad", "mocskos", "dogolj", "megdoglesz", "lofasz", "fityma",
  "kibasz", "elbasz", "retkes", "szajha", "kurvaany", "majomarcu", "patkanyarcu", "rohadek", "rohadj",
  // angol
  "fuck", "shit", "bitch", "cunt", "dick", "cock", "pussy", "whore", "slut", "bastard", "asshole", "nigger", "nigga",
  "faggot", "retard", "rape", "porn", "sex", "nazi", "hitler", "kkk", "penis", "vagina", "boob", "tits", "wank", "jerkoff",
  "killyou",
  // N1b: helyesírási változatok
  "kurwa", "curva", "phasz", "phuck", "biatch", "fuk",
];

/** Kivétel-szavak, amelyekben egy tiltott tő ártatlanul szerepel (ellenpróbák: tests/nickname-filter.test.ts). */
const ROOT_EXCEPTIONS: Record<string, readonly string[]> = {
  sex: ["essex", "sussex", "sextans"],
  pina: ["pinata"],
  dick: ["dickens"],
  rape: ["grape", "drape", "trapez"],
  cock: ["peacock", "cockatoo"],
  nazi: ["ignazi"],
  fuk: ["fuksz"], // N1b: „Fukszia”
};

/** Egy tő a becenévvel AZONOS normalizálással (N1): a tő és a kivétel-szavai is `foldNickname`-en át hasonlítódnak. */
/** Futam: egy betű és az egymás utáni ismétlődéseinek száma („kuuurva” → k1 u3 r1 v1 a1). */
type Run = { ch: string; n: number };

function runsOf(text: string): Run[] {
  const runs: Run[] = [];
  for (const ch of text) {
    const last = runs[runs.length - 1];
    if (last && last.ch === ch) last.n++;
    else runs.push({ ch, n: 1 });
  }
  return runs;
}

type CompiledRoot = { runs: Run[]; exceptions: readonly string[] };

/**
 * N1b: futam-tűrő tő. A normalizált tő futamaihoz a MINIMÁLIS hossz: 1, de ahol az EREDETI tőben dupla betű áll, az
 * eredeti futam hossza — „nigger” → n i g≥2 e r (a „NIGGGER” is fennakad), „segg” → s e g≥2 (a „Segítő” átmegy), „kuuurva”
 * a „kurva”-ra illik. Az l / i összevonásból eredő futam („websuli” → „websuii”) nem dupla. A tövek csak a–z betűk, így a
 * normalizált tő hossza az eredetiével azonos. Az illesztés futamlistán, regex nélkül → lineáris, visszalépés nincs.
 */
function compileRoot(root: string, exceptions: readonly string[]): CompiledRoot {
  const folded = foldNickname(root);
  const runs: Run[] = [];
  let i = 0;
  for (const run of runsOf(folded)) {
    let originalRun = 1;
    for (let k = i; k < i + run.n;) {
      let m = k;
      while (m < i + run.n && root[m] === root[k]) m++;
      originalRun = Math.max(originalRun, m - k);
      k = m;
    }
    runs.push({ ch: run.ch, n: originalRun >= 2 ? originalRun : 1 });
    i += run.n;
  }
  return { runs, exceptions: exceptions.map(foldNickname) };
}

function compileRoots(roots: readonly string[], exceptionsFor: (root: string) => readonly string[]): CompiledRoot[] {
  return roots.map((root) => compileRoot(root, exceptionsFor(root)));
}

/** A normalizált név futamai (egyszer számolva); a kivétel-szó kiszedése után újraszámolva. */
type FoldedName = { text: string; runs: Run[] };
const foldedName = (text: string): FoldedName => ({ text, runs: runsOf(text) });

function containsRoot(name: FoldedName, root: CompiledRoot): boolean {
  const scrubbed = root.exceptions.reduce((acc, ex) => acc.split(ex).join(""), name.text);
  const runs = scrubbed === name.text ? name.runs : runsOf(scrubbed);
  const need = root.runs;
  for (let p = 0; p + need.length <= runs.length; p++) {
    let k = 0;
    while (k < need.length && runs[p + k]!.ch === need[k]!.ch && runs[p + k]!.n >= need[k]!.n) k++;
    if (k === need.length) return true;
  }
  return false;
}

/** Hivatalosnak / szervezőnek látszó nevek (megszemélyesítés ellen). */
export const RESERVED_ROOTS: readonly string[] = [
  "admin", "adminisztrator", "moderator", "moderalo", "websuli", "webiskola", "tanar", "tanito", "igazgato", "oktato",
  "rendszer", "system", "support", "staff", "official", "hivatalos", "owner", "tulajdonos", "sysop", "root", "ugyfelszolgalat",
  "operator", "fejleszto", "developer", "teacher", "principal", "anthropic", "claude",
];

const RESERVED_WORDS = new Set(["mod", "mods", "modi", "gm", "dev"]);
/** Ártatlan szavak, amelyekben egy foglalt tő szerepel („Badminton”). */
const RESERVED_EXCEPTIONS: readonly string[] = ["badminton"];

const BLOCKED = compileRoots(BLOCKED_ROOTS, (root) => ROOT_EXCEPTIONS[root] ?? []);
const RESERVED = compileRoots(RESERVED_ROOTS, () => RESERVED_EXCEPTIONS);

const EMAIL_PROVIDERS = ["gmail", "freemail", "citromail", "hotmail", "outlook", "yahoo", "icloud", "protonmail"].map(foldNickname);

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
  return confusableFold(prepareNickname(nickname)).replace(/[\s_#-]/g, "");
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
  // Review #449 (K1): ENGEDÉLYLISTA — csak ASCII betű / számjegy, a magyar ékezetes betűk, szóköz, `_`, `-` (az NFKC UTÁN).
  // Minden más kódpont — a latin írású hasonmás betűk is (IPA, kiskapitális, pont nélküli i) — elutasítva.
  if (COMBINING.test(base) || !ALLOWED.test(base)) {
    const chars = Array.from(base);
    if (problems.includes("EMAIL") || problems.includes("URL")) { /* az e-mail / URL üzenet elég */ }
    else if (chars.some((ch) => (LETTER.test(ch) && !LATIN_LETTER.test(ch)) || (DIGIT.test(ch) && !/[0-9]/.test(ch)))) problems.push("SCRIPT");
    else problems.push("CHARS");
  }
  if (len < PLAYER_NICK_MIN) problems.push("LENGTH_SHORT");
  if (len > PLAYER_NICK_MAX) problems.push("LENGTH_LONG");
  if (len > 0 && !Array.from(base).some((ch) => LETTER.test(ch))) problems.push("NO_LETTER");
  if (base.replace(/\D/g, "").length >= 6) problems.push("PHONE");
  // N1: a `folded` már az l / I / 1 / i összevont alak, a tövek ugyanígy normalizáltak — minden olvasat egyszerre vizsgált.
  // N1b: + a többkarakteres hasonmások olvasata (rn → m, vv → w, cl → d).
  const readings = [base, ...multiCharReadings(base)];
  const folds = readings.map(foldNickname);
  const names = folds.map(foldedName);
  if (names.some((f) => BLOCKED.some((root) => containsRoot(f, root)))) problems.push("BLOCKED");
  // A foglalt SZAVAK („mod”, „gm”, „dev”) a leet-normalizált szavakon ÉS az elválasztók nélküli teljes néven („M o d”, „G M”).
  const words = readings.flatMap((r) => r.split(/[\s_-]+/)).map(foldNickname).filter(Boolean);
  const reservedWord = [...words, ...folds].some((w) => RESERVED_WORDS.has(w));
  if (names.some((f) => RESERVED.some((root) => containsRoot(f, root))) || reservedWord) problems.push("RESERVED");

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
