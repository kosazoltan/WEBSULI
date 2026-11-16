import type { LadderItem } from "../data/wordLadder/types";
import { dedupeTiersByContent } from "../game-engine/no-repeat";
import { meaningKeys, termKey } from "../game-engine/vocab/questionGenerator";
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

/**
 * Egy sz\u00F6veg \u00F6sszevet\u00E9si kulcsai a k\u00F6z\u00F6s sz\u00F3bank-normaliz\u00E1l\u00E1ssal (`termKey` + `meaningKeys`, #432): \u00EDgy a \u201Ekutya, eb\u201D
 * k\u00E9zi v\u00E1lasz a \u201Ekutya\u201D jelent\u00E9s\u0171 bejegyz\u00E9st is lefoglalja; a sz\u00E9ls\u0151 \u00EDr\u00E1sjel \u00E9s a z\u00E1r\u00F3jeles pontos\u00EDt\u00E1s nem sz\u00E1m\u00EDt.
 */
const keysOf = (s: string): string[] => [termKey(s), ...meaningKeys(s)].filter(Boolean);

/** A szóbank-bejegyzés két nyelvi alakja (a kézi bankkal való ütközés-szűréshez). */
export type VocabMeaning = { term: string; hu: string };

/**
 * A kézi szintlista és a szóbank-készletek összefésülése: a kézi tételek elöl, a szóbankosak mögöttük, a végén
 * `dedupeTiersByContent`. Előtte két szűrés, hogy egy futásban ugyanaz a szó ne jöjjön kétszer:
 *  - egy bejegyzés csak egy szinten szerepel (kis vagy kimerült banknál a `buildPool` a szomszéd szintről is ad — a
 *    tétel a saját szintjén marad, különben az első helyén), mert más kérdéstípussal más lenne a promptja;
 *  - a szóbankos tétel kimarad, ha a bejegyzés BÁRMELYIK nyelvi alakja (`term` vagy `hu`) a kézi bank valamelyik
 *    helyes válasza — fordítási iránytól függetlenül (review #430: a „Kutya” németül → „der Hund” kézi kérdés után a
 *    „Mit jelent: der Hund?” → „kutya” szóbankos kérdés is kimarad). A `meaningOf` adja a bejegyzés két alakját; ha
 *    nincs megadva vagy nem ismeri, csak a generált helyes opciót nézi.
 * Végül, ha `isSeen` meg van adva: amíg a készletekben van a tartós napló szerint NEM látott bejegyzés, a látottak
 * kimaradnak (review #430, terv 4.4 / A4 — kis banknál a `buildPool` a 60-as készletet látottakkal is feltölti, a
 * `pickUnseen` pedig véletlenszerűen húz a szinten belül, a futásonként ürülő `seenRef` mellett). Ha minden látott,
 * mind marad (kimerülés).
 */
export function mergeVocabTiers<T extends FourChoiceQuiz>(
  manual: readonly (readonly T[])[],
  vocabPools: readonly (readonly LadderItem[])[],
  meaningOf?: (vocabId: string) => VocabMeaning | undefined,
  isSeen?: (vocabId: string) => boolean,
): (T | LadderItem)[][] {
  const manualKeys = new Set(manual.flat().flatMap((q) => keysOf(q.options[q.correctIndex] ?? "")));
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
        const meaning = meaningOf && vocabIdOfLadderItem(item.id) ? meaningOf(key) : undefined;
        const keys = [
          ...keysOf(item.options[item.correctIndex] ?? ""),
          ...(meaning ? [termKey(meaning.term), ...meaningKeys(meaning.hu)] : []),
        ];
        if (keys.some((k) => manualKeys.has(k))) continue;
        picked[level]!.push(item);
      }
    });
  }
  if (isSeen) {
    const fresh = (item: LadderItem) => !isSeen(vocabIdOfLadderItem(item.id) ?? item.id);
    if (picked.some((tier) => tier.some(fresh))) {
      for (let i = 0; i < picked.length; i++) picked[i] = picked[i]!.filter(fresh);
    }
  }
  return dedupeTiersByContent(manual.map((t, i) => [...t, ...picked[i]!]));
}
