/**
 * Vendég-becenév és becenév-szűrő (végrehajtás JM-K `nicknames.ts`; terv 10.4 „Vendég”, 10.9 gyermekvédelem).
 *
 * - `guestNickname(seed)`: két listából (melléknév + állat) seedelt választás — valódi nevet sosem kérünk;
 * - `nicknameProblems(nick)`: a regisztrált / beírt becenév szűrője (hossz 3–16, csak betű / szám / szóköz, nincs
 *   e-mail-, telefonszám- vagy URL-szerű minta, nincs trágár szó). Üres tömb = elfogadható.
 * Tiszta TS (kliens és szerver közös), véletlen és óra nélkül.
 */
import { createRng } from "./game-rng";

export const NICKNAME_ADJECTIVES: readonly string[] = [
  "Bátor", "Gyors", "Okos", "Vidám", "Ügyes", "Csillogó", "Fürge", "Merész", "Szorgos", "Kíváncsi",
  "Nyugodt", "Lelkes", "Villám", "Napsugár", "Titkos", "Vagány", "Kedves", "Éber", "Hős", "Szuper",
];

export const NICKNAME_ANIMALS: readonly string[] = [
  "Róka", "Bagoly", "Delfin", "Panda", "Sas", "Mókus", "Teknős", "Tigris", "Pingvin", "Sün",
  "Hiúz", "Vidra", "Koala", "Holló", "Gepárd", "Fóka", "Láma", "Zebra", "Hód", "Sólyom",
];

/** Seedelt vendég-becenév, pl. „Fürge Vidra”. Azonos seed → azonos név. */
export function guestNickname(seed: string): string {
  const rng = createRng(`nick:${seed}`);
  return `${rng.pick(NICKNAME_ADJECTIVES)} ${rng.pick(NICKNAME_ANIMALS)}`;
}

export const NICKNAME_MIN = 3;
export const NICKNAME_MAX = 16;

/** Trágár / sértő szótövek (kisbetűs, ékezet nélküli alak); a szűrő ékezet nélkül, szóközök nélkül is keres. */
const BLOCKED_ROOTS: readonly string[] = [
  // A „szar” / „fos” tő szándékosan csak toldalékkal szerepel: önállóan a „Szarvas”, „Fosztóképző” is fennakadna.
  "fasz", "pina", "punci", "geci", "kurva", "buzi", "picsa", "szaros", "szarhazi", "fosos", "bazd", "bazm", "baszd", "baszo", "kocsog",
  "csicska", "ribanc", "hulye", "idiota", "nyomorek", "cigany", "zsido", "nigger", "fuck", "shit", "bitch", "cunt",
  "dick", "pussy", "whore", "slut", "nazi", "hitler",
];

/** Ékezet- és kisbetű-független, a betűhelyettesítéseket (0→o, 1→i, 3→e, 4→a, 5→s, @→a) visszafordító alak. */
function foldForFilter(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/0/g, "o")
    .replace(/1/g, "i")
    .replace(/3/g, "e")
    .replace(/4/g, "a")
    .replace(/5/g, "s")
    .replace(/@/g, "a")
    .replace(/[^a-z]/g, "");
}

const EMAIL_LIKE = /[^\s@]+@[^\s@]+|\bat\s+\w+\s+(pont|dot)\s+\w+/i;
const URL_LIKE = /(https?:|www\.|\.(hu|com|net|org|io|eu)\b)/i;
const ALLOWED_CHARS = /^[\p{L}\p{N} ]+$/u;

/**
 * A becenév problémái magyar, gyereknek érthető üzenetekkel; üres tömb, ha rendben van. A hívó a becenevet előbb
 * `trim()`-eli; a szűrő a dupla szóközt is hibának veszi.
 */
export function nicknameProblems(nick: string): string[] {
  const problems: string[] = [];
  const text = typeof nick === "string" ? nick : "";
  const len = Array.from(text).length;
  if (len < NICKNAME_MIN) problems.push(`Legalább ${NICKNAME_MIN} karakter legyen.`);
  if (len > NICKNAME_MAX) problems.push(`Legfeljebb ${NICKNAME_MAX} karakter lehet.`);
  if (text !== text.trim() || /\s{2,}/.test(text)) problems.push("Ne kezdődjön / végződjön szóközzel, és ne legyen benne dupla szóköz.");
  if (EMAIL_LIKE.test(text)) problems.push("E-mail-cím nem lehet becenév.");
  else if (URL_LIKE.test(text)) problems.push("Weboldal-cím nem lehet becenév.");
  const digits = text.replace(/\D/g, "");
  if (digits.length >= 6) problems.push("Telefonszám-szerű számsor nem lehet becenévben.");
  if (text.length > 0 && !ALLOWED_CHARS.test(text) && !EMAIL_LIKE.test(text) && !URL_LIKE.test(text)) {
    problems.push("Csak betű, szám és szóköz lehet benne.");
  }
  const folded = foldForFilter(text);
  if (BLOCKED_ROOTS.some((root) => folded.includes(root))) problems.push("Ez a becenév nem megfelelő. Válassz másikat!");
  return problems;
}
