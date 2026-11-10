import { optionOrder } from "./option-order";

/**
 * Spec 2026-11-10-hibavadaszat A5: a párosító feladat JOBB oszlopának megjelenítési sorrendje. A két oszlop azonos sorrendje mellett a
 * helyes pár mindig ugyanabban a sorban állna — a feladat gondolkodás nélkül megoldható. A sorrend a párok szövegéből determinisztikus
 * (újratöltés és visszaállított mentés után is ugyanaz); a visszaadott értékek az EREDETI indexek, a párosítás és a mentés azokkal dolgozik.
 */
export function matchRightOrder(pairs: ReadonlyArray<{ left: string; right: string }>): number[] {
  const order = optionOrder(pairs.map((p) => `${p.left}\u0000${p.right}`).join("\u0001"), pairs.length);
  // Ha a keverés épp az eredeti sorrendet adná, eggyel elforgatva jelenik meg (2 párnál a csere és az eredeti is megengedett).
  if (order.length > 2 && order.every((original, shown) => original === shown)) order.push(order.shift()!);
  return order;
}
