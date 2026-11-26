/**
 * V5a (docs/specs/2026-11-24-valtozatossag-12-tengely-vegrehajtas.md): szókereső és keresztrejtvény — DETERMINISZTIKUS rácsgenerátor
 * (a mag a szavakból / bejegyzésekből számolt), pontozás. DOM-mentes; a kliens és a séma is ezt használja.
 */
import { mulberry32, seedFrom } from "./seeded";
import { verdictOf, type TryScore } from "./try-scoring";

const up = (w: string) => w.trim().normalize("NFC").toLocaleUpperCase("hu");
const FILL = [..."AÁBCDEÉFGHIÍJKLMNOÓÖŐPRSTUÚÜŰVZ"];

export type WordPlacement = { word: string; row: number; col: number; dr: number; dc: number };
export type WordSearchGrid = { size: number; grid: string[][]; placements: WordPlacement[] };

/** Csak előre olvasható irányok (kisebbeknek is követhető): jobbra, le, átlósan le, átlósan fel. */
const DIRS: ReadonlyArray<readonly [number, number]> = [[0, 1], [1, 0], [1, 1], [-1, 1]];

export function readWordInGrid(grid: readonly string[][], p: Pick<WordPlacement, "word" | "row" | "col" | "dr" | "dc">): string {
  return [...up(p.word)].map((_, i) => grid[p.row + p.dr * i]?.[p.col + p.dc * i] ?? "").join("");
}

export function buildWordSearch(words: readonly string[]): WordSearchGrid {
  const list = words.map((w) => w.trim()).filter(Boolean);
  const order = list.map((w, i) => ({ w, i })).sort((a, b) => [...b.w].length - [...a.w].length || a.i - b.i);
  const longest = Math.max(3, ...list.map((w) => [...w].length));
  const letters = list.reduce((n, w) => n + [...w].length, 0);
  let size = Math.min(14, Math.max(6, longest, Math.ceil(Math.sqrt(letters * 2))));
  for (;; size++) {
    const random = mulberry32(seedFrom(`szokereso\u0001${list.join("\u0002")}\u0001${size}`));
    const grid: string[][] = Array.from({ length: size }, () => Array.from({ length: size }, () => ""));
    const placed: WordPlacement[] = [];
    let ok = true;
    for (const { w } of order) {
      const chars = [...up(w)];
      let done = false;
      for (let attempt = 0; attempt < 400 && !done; attempt++) {
        const [dr, dc] = DIRS[Math.floor(random() * DIRS.length)];
        const row = Math.floor(random() * size), col = Math.floor(random() * size);
        const endR = row + dr * (chars.length - 1), endC = col + dc * (chars.length - 1);
        if (endR < 0 || endR >= size || endC >= size) continue;
        if (!chars.every((ch, i) => grid[row + dr * i][col + dc * i] === "" || grid[row + dr * i][col + dc * i] === ch)) continue;
        chars.forEach((ch, i) => { grid[row + dr * i][col + dc * i] = ch; });
        placed.push({ word: w, row, col, dr, dc });
        done = true;
      }
      if (!done) { ok = false; break; }
    }
    if (!ok && size < 20) continue;
    for (const r of grid) for (let c = 0; c < r.length; c++) if (!r[c]) r[c] = FILL[Math.floor(random() * FILL.length)];
    // A placements a BEMENET sorrendjében (a megjelenítő és a teszt ezt várja).
    placed.sort((a, b) => list.indexOf(a.word) - list.indexOf(b.word));
    return { size, grid, placements: placed };
  }
}

/**
 * Review #616: a kijelölés (két végcella) EGYENES betűsora — oda-vissza olvasva — melyik, még meg nem talált szóval egyezik. A rács
 * tényleges tartalma dönt, nem a generátor nyilvántartott helye: ha egy szó máshol is kiolvasható, az is helyes találat.
 */
export function matchSelection(
  grid: readonly string[][], words: readonly string[], a: { r: number; c: number }, b: { r: number; c: number }, found: readonly string[] = [],
): string | null {
  const dy = b.r - a.r, dx = b.c - a.c;
  const len = Math.max(Math.abs(dy), Math.abs(dx));
  if (len === 0 || (dy !== 0 && dx !== 0 && Math.abs(dy) !== Math.abs(dx))) return null;
  const dr = Math.sign(dy), dc = Math.sign(dx);
  const line = Array.from({ length: len + 1 }, (_, i) => grid[a.r + dr * i]?.[a.c + dc * i] ?? "").join("");
  const back = [...line].reverse().join("");
  const done = new Set(found.map(up));
  return words.find((w) => !done.has(up(w)) && (up(w) === line || up(w) === back)) ?? null;
}

export type CrosswordEntry = { answer: string; clue: string };
export type CrosswordPlacement = CrosswordEntry & { row: number; col: number; dir: "across" | "down"; number: number };
export type Crossword = { rows: number; cols: number; placements: CrosswordPlacement[] };

/** Mohó, determinisztikus elhelyező: a leghosszabbal kezd; a következő az első érvényes keresztezésbe kerül, különben külön sorba. */
export function buildCrossword(entries: readonly CrosswordEntry[]): Crossword {
  const list = entries.map((e, i) => ({ ...e, answer: e.answer.trim(), i })).filter((e) => e.answer);
  const order = [...list].sort((a, b) => [...b.answer].length - [...a.answer].length || a.i - b.i);
  const cells = new Map<string, string>();
  const key = (r: number, c: number) => `${r},${c}`;
  type P = { e: (typeof list)[number]; row: number; col: number; dir: "across" | "down" };
  const placed: P[] = [];
  const cellsOf = (p: Omit<P, "e"> & { word: string[] }) => p.word.map((ch, i) => ({ r: p.dir === "across" ? p.row : p.row + i, c: p.dir === "across" ? p.col + i : p.col, ch }));
  const fits = (word: string[], row: number, col: number, dir: "across" | "down") => {
    const dr = dir === "down" ? 1 : 0, dc = dir === "across" ? 1 : 0;
    if (cells.has(key(row - dr, col - dc)) || cells.has(key(row + dr * word.length, col + dc * word.length))) return false;
    let crossings = 0;
    for (let i = 0; i < word.length; i++) {
      const r = row + dr * i, c = col + dc * i, have = cells.get(key(r, c));
      if (have !== undefined) { if (have !== word[i]) return false; crossings++; continue; }
      // Párhuzamos szomszéd nem érhet hozzá (a keresztezésen kívül).
      if (cells.has(key(r + dc, c + dr)) || cells.has(key(r - dc, c - dr))) return false;
    }
    return crossings > 0;
  };
  const put = (p: P) => { placed.push(p); for (const x of cellsOf({ ...p, word: [...up(p.e.answer)] })) cells.set(key(x.r, x.c), x.ch); };
  for (const e of order) {
    const word = [...up(e.answer)];
    if (!placed.length) { put({ e, row: 0, col: 0, dir: "across" }); continue; }
    let done = false;
    for (const q of placed) {
      if (done) break;
      const qWord = [...up(q.e.answer)];
      const dir = q.dir === "across" ? "down" : "across";
      for (let qi = 0; qi < qWord.length && !done; qi++) {
        for (let wi = 0; wi < word.length && !done; wi++) {
          if (qWord[qi] !== word[wi]) continue;
          const crossR = q.dir === "across" ? q.row : q.row + qi, crossC = q.dir === "across" ? q.col + qi : q.col;
          const row = dir === "down" ? crossR - wi : crossR, col = dir === "across" ? crossC - wi : crossC;
          if (fits(word, row, col, dir)) { put({ e, row, col, dir }); done = true; }
        }
      }
    }
    if (!done) {
      const maxRow = Math.max(...[...cells.keys()].map((k) => Number(k.split(",")[0])));
      const minCol = Math.min(...[...cells.keys()].map((k) => Number(k.split(",")[1])));
      put({ e, row: maxRow + 2, col: minCol, dir: "across" });
    }
  }
  const rs = [...cells.keys()].map((k) => Number(k.split(",")[0])), cs = [...cells.keys()].map((k) => Number(k.split(",")[1]));
  const r0 = Math.min(...rs), c0 = Math.min(...cs);
  // Számozás olvasási sorrendben (sor, oszlop), a bemenet sorrendjében visszaadva.
  const starts = [...new Set(placed.map((p) => key(p.row - r0, p.col - c0)))].sort((a, b) => { const [ar, ac] = a.split(",").map(Number), [br, bc] = b.split(",").map(Number); return ar - br || ac - bc; });
  const out = placed.map((p) => ({ answer: p.e.answer, clue: p.e.clue, row: p.row - r0, col: p.col - c0, dir: p.dir, number: starts.indexOf(key(p.row - r0, p.col - c0)) + 1, i: p.e.i }))
    .sort((a, b) => a.i - b.i).map(({ i: _i, ...rest }) => rest);
  return { rows: Math.max(...rs) - r0 + 1, cols: Math.max(...cs) - c0 + 1, placements: out };
}

export type WordSearchSpec = { words: string[] };
export type CrosswordSpec = { entries: CrosswordEntry[] };
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
export const readWordSearch = (spec: unknown): WordSearchSpec => ({ words: arr((spec as { words?: unknown } | null)?.words).filter((w): w is string => typeof w === "string" && w.trim().length > 0).map((w) => w.trim()) });
export const readCrossword = (spec: unknown): CrosswordSpec => ({ entries: arr((spec as { entries?: unknown } | null)?.entries).flatMap((x) => {
  const o = (x ?? {}) as { answer?: unknown; clue?: unknown };
  return typeof o.answer === "string" && o.answer.trim() && typeof o.clue === "string" && o.clue.trim() ? [{ answer: o.answer.trim(), clue: o.clue.trim() }] : [];
}) });

/** Szókereső: pont = megtalált (különböző) szavak; max = a szavak száma. */
export function scoreWordSearch(spec: unknown, found: readonly string[]): TryScore {
  const words = readWordSearch(spec).words.map(up);
  const got = new Set(found.map(up).filter((w) => words.includes(w)));
  return { points: got.size, max: words.length, verdict: verdictOf(got.size, words.length) };
}
/** Keresztrejtvény: pont = helyes bejegyzések (kis- / nagybetű nem számít, az ékezet igen). */
export function scoreCrossword(spec: unknown, answers: ReadonlyArray<string | null | undefined>): TryScore {
  const entries = readCrossword(spec).entries;
  const points = entries.filter((e, i) => up(answers[i] ?? "") === up(e.answer)).length;
  return { points, max: entries.length, verdict: verdictOf(points, entries.length) };
}

export function wordGridProblems(kind: "wordSearch" | "crossword", spec: unknown): string[] {
  const p: string[] = [];
  if (kind === "wordSearch") {
    const raw = arr((spec as { words?: unknown } | null)?.words);
    const words = readWordSearch(spec).words;
    if (words.length < 3 || words.length > 10 || words.length !== raw.length) p.push("A szókereső 3–10 szót kér.");
    for (const w of words) if (!/^\p{L}{3,12}$/u.test(w)) p.push(`A szó 3–12 betű, szóköz és írásjel nélkül: ${w}`);
    if (new Set(words.map(up)).size !== words.length) p.push("A szókereső szavai különbözők legyenek.");
  } else {
    const raw = arr((spec as { entries?: unknown } | null)?.entries);
    const entries = readCrossword(spec).entries;
    if (entries.length < 3 || entries.length > 10 || entries.length !== raw.length) p.push("A keresztrejtvény 3–10 bejegyzést kér (megfejtés + meghatározás).");
    for (const e of entries) {
      if (!/^\p{L}{2,15}$/u.test(e.answer)) p.push(`A megfejtés 2–15 betű, szóköz nélkül: ${e.answer}`);
      if (e.clue.length > 200) p.push("A meghatározás legfeljebb 200 karakter.");
    }
    if (new Set(entries.map((e) => up(e.answer))).size !== entries.length) p.push("A megfejtések különbözők legyenek.");
  }
  return p;
}
