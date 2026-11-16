/**
 * Párbaj-szabálymotor (terv `docs/specs/2026-11-16-jatekok-jatekelmeny.md` 10.5, döntés D14; végrehajtás JM-K / JM1).
 *
 * Tiszta TypeScript: a kliens (egyeszközös Párbaj aréna) és a szerver (online szoba, JM2) is ezt használja. Nincs benne
 * óra, véletlen, DOM vagy megjelenítés (J19 grep-őr: `tests/game-sim-determinism-guard.test.ts`); az időt a hívó méri és
 * adja át, így azonos bemenet-sorozat mindig azonos meccset ad.
 *
 * A szabály röviden:
 *  - mindenki 100 életerővel indul; a HELYES válasz a többi élő játékostól `10` alapsebzést vesz le, plusz sávos
 *    gyorsasági bónuszt (a saját válaszablakhoz mért arány: ≤ 25% → +2,5, ≤ 50% → +1,5, ≤ 75% → +0,5) — a bónusz
 *    legfeljebb az alap 25%-a; rossz vagy hiányzó válasz 0, és nincs levonás;
 *  - 2–4 főnél a sebzés a többi élő játékos közt egyenlően oszlik; a kerekítés felfelé megy (tized életerőre), így a
 *    sajátodat sosem csökkenti;
 *  - 7 kör, vagy amíg egy játékos kivételével mindenki életereje 0; holtversenynél legfeljebb 2 döntő kör, utána közös győzelem;
 *  - a gyorsaság ELFOGADOTT ideje a mérő fél (szerver / motor) mérésén alapul; a kliens állítása csak a mért késés-kereten
 *    belül (≤ 400 ms) térhet el lefelé, 200 ms alatti válasz nem kap bónuszt (`acceptedTimeMs`).
 */

export const DUEL_HP = 100;
export const DUEL_BASE_DAMAGE = 10;
export const DUEL_ROUNDS = 7;
export const DUEL_MAX_TIEBREAKS = 2;
export const DUEL_MIN_PLAYERS = 2;
export const DUEL_MAX_PLAYERS = 4;

/** Sávos gyorsasági bónusz; a `maxRatio` az elfogadott idő / saját válaszablak aránya (≤ 25% az alapsebzéshez). */
export const SPEED_BANDS: readonly { maxRatio: number; bonus: number }[] = [
  { maxRatio: 0.25, bonus: 2.5 },
  { maxRatio: 0.5, bonus: 1.5 },
  { maxRatio: 0.75, bonus: 0.5 },
];

/** Két helyes válasz elfogadott ideje ennyin belül holtverseny (a „leggyorsabb” címhez). */
export const TIE_MS = 200;
/** A kliens által állított idő legfeljebb ennyivel lehet kevesebb a mért időnél (és legfeljebb a mért késés mediánjával). */
export const MAX_LATENCY_SLACK_MS = 400;
/** Ennél gyorsabb elfogadott idő emberileg nem hihető: a válasz helyes marad, de bónusz nem jár, és a kör „gyanús”. */
export const HUMAN_MIN_MS = 200;

export type DuelAnswer = {
  playerId: string;
  correct: boolean;
  /** Az `acceptedTimeMs().acceptedMs`; `null`, ha a játékos nem válaszolt az ablakon belül. */
  acceptedMs: number | null;
  /** A játékos SAJÁT válaszablaka ebben a körben (a saját évfolyamához igazítva). */
  windowMs: number;
};

export type DuelRoundOutcome = {
  /** Az ebben a körben kapott sebzés játékosonként (minden élő játékos kulcsa szerepel, 0-val is). */
  damageTo: Record<string, number>;
  /** A játékos helyes válaszáért járó gyorsasági bónusz (0, ha rossz / nincs / gyanús / lassú). */
  speedBonus: Record<string, number>;
  /** A leggyorsabb helyes válaszoló; `null`, ha nincs helyes válasz, vagy az első kettő `TIE_MS`-on belül van. */
  fastestCorrect: string | null;
};

export type DuelPlayerStats = {
  /** Helyes válaszok száma. */
  correct: number;
  /** Ténylegesen beküldött válaszok (az ablakon belül). */
  answered: number;
  /** Feltett kérdések (a játékos élt a körben) — a pontosság nevezője. Additív mező a JM-K szerződéshez. */
  asked: number;
  bestStreak: number;
  streak: number;
  /** A leggyorsabb HELYES válasz elfogadott ideje; a gyanús (`< HUMAN_MIN_MS`) kör nem számít bele. */
  fastestMs: number | null;
};

export type DuelState = {
  /** A játékosok a csatlakozás / ülés sorrendjében. Additív mező a JM-K szerződéshez. */
  players: string[];
  hp: Record<string, number>;
  /** Lejátszott körök száma (a döntő körökkel együtt). */
  round: number;
  /** Lejátszott döntő körök száma. */
  tiebreaks: number;
  /** Melyik körben fogyott el a játékos életereje (`null`, ha még él) — a dobogó sorrendjéhez. Additív mező. */
  koRound: Record<string, number | null>;
  stats: Record<string, DuelPlayerStats>;
};

export type DuelVerdict = {
  finished: boolean;
  /** A rendes körök után holtverseny van, és még jár döntő kör. */
  needTiebreak: boolean;
  /** A győztes(ek); közös győzelemnél több. Amíg nincs vége, üres. */
  winners: string[];
  coWin: boolean;
  /** Helyezések: `podium[0]` az első hely (holtversenyben több játékos), stb. Amíg nincs vége, az aktuális állás. */
  podium: string[][];
};

const EPS = 1e-9;

/** Tized életerőre felfelé kerekít (lebegőpontos zaj ellen előbb ezredre). */
function ceilTenth(x: number): number {
  return Math.ceil(Math.round(x * 1000) / 100 - EPS) / 10;
}

function roundTenth(x: number): number {
  return Math.round(x * 10) / 10;
}

/** A sávos gyorsasági bónusz egy helyes válaszra; nem véges / nem pozitív ablaknál, lassú vagy gyanús válasznál 0. */
export function speedBonusFor(acceptedMs: number | null, windowMs: number): number {
  if (acceptedMs === null || !Number.isFinite(acceptedMs) || !Number.isFinite(windowMs) || windowMs <= 0) return 0;
  if (acceptedMs < HUMAN_MIN_MS) return 0;
  const ratio = acceptedMs / windowMs;
  for (const band of SPEED_BANDS) if (ratio <= band.maxRatio) return band.bonus;
  return 0;
}

/** Érvényes, számító válasz: helyes, és az elfogadott idő a saját ablakon belül van. */
function counts(a: DuelAnswer): boolean {
  return (
    a.correct === true &&
    a.acceptedMs !== null &&
    Number.isFinite(a.acceptedMs) &&
    a.acceptedMs >= 0 &&
    Number.isFinite(a.windowMs) &&
    a.windowMs > 0 &&
    a.acceptedMs <= a.windowMs
  );
}

/**
 * Egy kör kiértékelése. Csak az élő (`alive`) játékosok válasza számít, és csak élő játékos kap sebzést; játékosonként az
 * ELSŐ válasz-bejegyzés számít (a többit figyelmen kívül hagyja). Az ablakon túli válasz nem számít (a hívó amúgy
 * `ROUND_CLOSED`-dal elutasítja).
 */
export function scoreRound(answers: readonly DuelAnswer[], alive: readonly string[]): DuelRoundOutcome {
  const aliveSet = new Set(alive);
  const damageTo: Record<string, number> = {};
  const speedBonus: Record<string, number> = {};
  for (const id of alive) {
    damageTo[id] = 0;
    speedBonus[id] = 0;
  }
  const seen = new Set<string>();
  const scoring: DuelAnswer[] = [];
  for (const a of answers) {
    if (!aliveSet.has(a.playerId) || seen.has(a.playerId)) continue;
    seen.add(a.playerId);
    if (counts(a)) scoring.push(a);
  }
  const others = alive.length - 1;
  for (const a of scoring) {
    const bonus = speedBonusFor(a.acceptedMs, a.windowMs);
    speedBonus[a.playerId] = bonus;
    if (others <= 0) continue;
    const share = ceilTenth((DUEL_BASE_DAMAGE + bonus) / others);
    for (const id of alive) if (id !== a.playerId) damageTo[id] = roundTenth(damageTo[id]! + share);
  }
  let fastestCorrect: string | null = null;
  if (scoring.length > 0) {
    const sorted = scoring.slice().sort((x, y) => x.acceptedMs! - y.acceptedMs! || (x.playerId < y.playerId ? -1 : 1));
    const first = sorted[0]!;
    const second = sorted[1];
    fastestCorrect = second && second.acceptedMs! - first.acceptedMs! < TIE_MS ? null : first.playerId;
  }
  return { damageTo, speedBonus, fastestCorrect };
}

export function createDuel(playerIds: readonly string[]): DuelState {
  const ids = playerIds.slice();
  if (ids.length < DUEL_MIN_PLAYERS || ids.length > DUEL_MAX_PLAYERS) {
    throw new RangeError(`createDuel: ${DUEL_MIN_PLAYERS}–${DUEL_MAX_PLAYERS} játékos kell (kapott: ${ids.length})`);
  }
  if (new Set(ids).size !== ids.length || ids.some((id) => typeof id !== "string" || id === "")) {
    throw new RangeError("createDuel: a játékos-azonosítók nem üres, egyedi szövegek");
  }
  const hp: Record<string, number> = {};
  const koRound: Record<string, number | null> = {};
  const stats: Record<string, DuelPlayerStats> = {};
  for (const id of ids) {
    hp[id] = DUEL_HP;
    koRound[id] = null;
    stats[id] = { correct: 0, answered: 0, asked: 0, bestStreak: 0, streak: 0, fastestMs: null };
  }
  return { players: ids, hp, round: 0, tiebreaks: 0, koRound, stats };
}

/** Az élő játékosok (életerő > 0) az ülésrendben. */
export function aliveOf(s: DuelState): string[] {
  return s.players.filter((id) => (s.hp[id] ?? 0) > EPS);
}

/**
 * A kör eredményének alkalmazása: új állapotot ad (a bemenetet nem módosítja). A statisztika az élő játékosokra frissül
 * (pontosság, sorozat, leggyorsabb helyes válasz — a gyanús kör kihagyva).
 */
export function applyRound(s: DuelState, o: DuelRoundOutcome, answers: readonly DuelAnswer[]): DuelState {
  const alive = aliveOf(s);
  const isTiebreak = s.round >= DUEL_ROUNDS;
  const round = s.round + 1;
  const hp = { ...s.hp };
  const koRound = { ...s.koRound };
  const stats: Record<string, DuelPlayerStats> = {};
  for (const id of s.players) stats[id] = { ...s.stats[id]! };

  const first = new Map<string, DuelAnswer>();
  for (const a of answers) if (!first.has(a.playerId)) first.set(a.playerId, a);

  for (const id of alive) {
    const dmg = o.damageTo[id] ?? 0;
    const safe = Number.isFinite(dmg) && dmg > 0 ? dmg : 0;
    hp[id] = Math.max(0, roundTenth(hp[id]! - safe));
    if (hp[id]! <= EPS && koRound[id] === null) koRound[id] = round;

    const st = stats[id]!;
    st.asked += 1;
    const a = first.get(id);
    const answeredInWindow =
      !!a && a.acceptedMs !== null && Number.isFinite(a.acceptedMs) && a.acceptedMs >= 0 && a.acceptedMs <= a.windowMs;
    if (answeredInWindow) st.answered += 1;
    if (a && counts(a)) {
      st.correct += 1;
      st.streak += 1;
      st.bestStreak = Math.max(st.bestStreak, st.streak);
      if (a.acceptedMs! >= HUMAN_MIN_MS) st.fastestMs = st.fastestMs === null ? a.acceptedMs! : Math.min(st.fastestMs, a.acceptedMs!);
    } else {
      st.streak = 0;
    }
  }
  return { players: s.players.slice(), hp, round, tiebreaks: s.tiebreaks + (isTiebreak ? 1 : 0), koRound, stats };
}

/** Helyezések: az élők életerő szerint, utánuk a később kiesettek; azonos érték azonos hely. */
function ranking(s: DuelState): string[][] {
  const key = (id: string): [number, number] => {
    const ko = s.koRound[id];
    return ko === null || ko === undefined ? [1, s.hp[id] ?? 0] : [0, ko];
  };
  const sorted = s.players.slice().sort((a, b) => {
    const [ga, va] = key(a);
    const [gb, vb] = key(b);
    if (ga !== gb) return gb - ga;
    if (Math.abs(va - vb) > EPS) return vb - va;
    return s.players.indexOf(a) - s.players.indexOf(b);
  });
  const podium: string[][] = [];
  let prev: [number, number] | null = null;
  for (const id of sorted) {
    const k = key(id);
    if (prev && prev[0] === k[0] && Math.abs(prev[1] - k[1]) <= EPS) podium[podium.length - 1]!.push(id);
    else podium.push([id]);
    prev = k;
  }
  return podium;
}

/**
 * Meccs-ítélet: vége, ha legfeljebb egy játékos él, vagy a 7 rendes kör után egyetlen vezető van; holtversenynél
 * legfeljebb `DUEL_MAX_TIEBREAKS` döntő kör jár, utána közös győzelem.
 */
export function verdict(s: DuelState): DuelVerdict {
  const podium = ranking(s);
  const alive = aliveOf(s);
  if (alive.length <= 1) {
    const winners = podium[0]!.slice();
    return { finished: true, needTiebreak: false, winners, coWin: winners.length > 1, podium };
  }
  if (s.round < DUEL_ROUNDS) return { finished: false, needTiebreak: false, winners: [], coWin: false, podium };
  const leaders = podium[0]!;
  if (leaders.length === 1) return { finished: true, needTiebreak: false, winners: leaders.slice(), coWin: false, podium };
  if (s.tiebreaks < DUEL_MAX_TIEBREAKS) return { finished: false, needTiebreak: true, winners: [], coWin: false, podium };
  return { finished: true, needTiebreak: false, winners: leaders.slice(), coWin: true, podium };
}

/** Pontosság 0..1 (feltett kérdésekre vetítve); kérdés nélkül 0. */
export function accuracyOf(st: DuelPlayerStats): number {
  return st.asked > 0 ? st.correct / st.asked : 0;
}

export type AcceptedTime = { acceptedMs: number; speedEligible: boolean; suspicious: boolean };

/**
 * Az elfogadott válaszidő (review #440): a MÉRŐ fél ideje az elsődleges.
 *  - `serverRtMs` = a válasz beérkezése − a kör megnyitása a mérő óráján (online: szerver; egyeszközös arénában: a motor);
 *  - `slack` = min(MAX_LATENCY_SLACK_MS, max(0, medianRttMs)); nem véges medián → 0;
 *  - hiányzó / nem véges / ≤ 0 `clientRtMs` → `acceptedMs = serverRtMs`;
 *  - különben `acceptedMs = clamp(clientRtMs, max(0, serverRtMs − slack), serverRtMs)`;
 *  - `speedEligible` = `acceptedMs ≥ HUMAN_MIN_MS`; alatta a válasz helyes marad, a bónusz 0, `suspicious = true`.
 * Nem véges / negatív `serverRtMs`-t 0-ra szorít (a mérő óra hibája ne adjon negatív időt).
 */
export function acceptedTimeMs(clientRtMs: number | null | undefined, serverRtMs: number, medianRttMs: number): AcceptedTime {
  const server = Number.isFinite(serverRtMs) && serverRtMs > 0 ? serverRtMs : 0;
  const slack = Number.isFinite(medianRttMs) ? Math.min(MAX_LATENCY_SLACK_MS, Math.max(0, medianRttMs)) : 0;
  let acceptedMs = server;
  if (typeof clientRtMs === "number" && Number.isFinite(clientRtMs) && clientRtMs > 0) {
    acceptedMs = Math.min(server, Math.max(Math.max(0, server - slack), clientRtMs));
  }
  const speedEligible = acceptedMs >= HUMAN_MIN_MS;
  return { acceptedMs, speedEligible, suspicious: !speedEligible };
}
