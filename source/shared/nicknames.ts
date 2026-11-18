/**
 * Vendég-becenév és becenév-szűrő (végrehajtás JM-K `nicknames.ts`; terv 10.4 „Vendég”, 10.9 gyermekvédelem).
 *
 * - `guestNickname(seed)`: két listából (melléknév + állat) seedelt választás — valódi nevet sosem kérünk;
 * - `nicknameProblems(nick)`: a beírt becenév problémái magyar üzenetekkel. JM7b óta EGYETLEN igazságforrás van: a szabályt a
 *   `shared/player-nickname.ts` (`checkPlayerNickname`) adja — ez csak arra delegál, és a hívótól a már levágott szöveget várja
 *   (szélső / dupla szóköz itt hiba, a regisztrációs út a szóközt egységesíti). Üres tömb = elfogadható.
 * Tiszta TS (kliens és szerver közös), véletlen és óra nélkül.
 */
import { createRng } from "./game-rng";
import {
  NICKNAME_MESSAGES, PLAYER_NICK_MAX, PLAYER_NICK_MIN, SUGGESTION_ADJECTIVES, SUGGESTION_ANIMALS, checkPlayerNickname,
} from "./player-nickname";

export const NICKNAME_ADJECTIVES: readonly string[] = SUGGESTION_ADJECTIVES;
export const NICKNAME_ANIMALS: readonly string[] = SUGGESTION_ANIMALS;

/** Seedelt vendég-becenév, pl. „Fürge Vidra”. Azonos seed → azonos név. */
export function guestNickname(seed: string): string {
  const rng = createRng(`nick:${seed}`);
  return `${rng.pick(NICKNAME_ADJECTIVES)} ${rng.pick(NICKNAME_ANIMALS)}`;
}

/** A hossz-határok a regisztrált becenévével azonosak (shared/player-nickname.ts). */
export const NICKNAME_MIN = PLAYER_NICK_MIN;
export const NICKNAME_MAX = PLAYER_NICK_MAX;

const SPACING = "Ne kezdődjön / végződjön szóközzel, és ne legyen benne dupla szóköz.";

/** A becenév problémái magyar, gyereknek érthető üzenetekkel (a közös szabály szerint); üres tömb, ha rendben van. */
export function nicknameProblems(nick: string): string[] {
  const text = typeof nick === "string" ? nick : "";
  const problems: string[] = [];
  if (text !== text.trim() || /\s{2,}/.test(text)) problems.push(SPACING);
  const check = checkPlayerNickname(text);
  if (!check.ok) problems.push(...check.problems.map((p) => NICKNAME_MESSAGES[p]));
  return problems;
}
