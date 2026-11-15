import type { LadderItem } from "../data/wordLadder/types";
import { dedupeTiersByContent } from "../game-engine/no-repeat";
import type { FourChoiceQuiz } from "../types/gameQuiz";

/**
 * S6 — a Szólétra és a központi szóbank összekötésének tiszta része (terv A7, 4.4; végrehajtás S6/8. lépés).
 * Külön modulban, hogy node-tesztből is mérhető legyen (a lap a böngésző-környezet miatt nem importálható).
 */

/** A szóbankból szintenként ennyi tétel kerül a futás készletébe. */
export const VOCAB_POOL_PER_LEVEL = 60;

/** A szóbankos tétel azonosítója `vocab:<bejegyzés-azonosító>:<kérdéstípus>`; a bejegyzés-azonosító a 2. mező. */
export function vocabIdOfLadderItem(id: string): string | null {
  if (!id.startsWith("vocab:")) return null;
  const entryId = id.split(":")[1];
  return entryId ? entryId : null;
}

const norm = (s: string) => s.normalize("NFC").toLowerCase().replace(/[\s\u00A0\u202F]+/g, " ").trim();

/**
 * A kézi szintlista és a szóbank-készletek összefésülése: a kézi tételek elöl, a szóbankosak mögöttük, a végén
 * `dedupeTiersByContent`. Előtte két szűrés, hogy egy futásban ugyanaz a szó ne jöjjön kétszer:
 *  - egy bejegyzés csak egy szinten szerepel (kis vagy kimerült banknál a `buildPool` a szomszéd szintről is ad — a
 *    tétel a saját szintjén marad, különben az első helyén), mert más kérdéstípussal más lenne a promptja;
 *  - a kézi bank valamelyik helyes válaszával azonos helyes válaszú szóbankos tétel kimarad.
 */
export function mergeVocabTiers<T extends FourChoiceQuiz>(
  manual: readonly (readonly T[])[],
  vocabPools: readonly (readonly LadderItem[])[],
): (T | LadderItem)[][] {
  const manualAnswers = new Set(manual.flat().map((q) => norm(q.options[q.correctIndex] ?? "")));
  const used = new Set<string>();
  const picked: LadderItem[][] = manual.map(() => []);
  for (const ownLevel of [true, false]) {
    vocabPools.forEach((pool, level) => {
      if (level >= picked.length) return;
      for (const item of pool) {
        if ((item.tier === level) !== ownLevel) continue;
        const key = vocabIdOfLadderItem(item.id) ?? item.id;
        if (used.has(key)) continue;
        used.add(key);
        if (manualAnswers.has(norm(item.options[item.correctIndex] ?? ""))) continue;
        picked[level]!.push(item);
      }
    });
  }
  return dedupeTiersByContent(manual.map((t, i) => [...t, ...picked[i]!]));
}
