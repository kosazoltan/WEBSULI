/**
 * Spec docs/specs/2026-11-20-tgm-valtozatossag-abrak.md (S5a, 5. szakasz 3. pont): a determinisztikus változatosság közös magja.
 * Tiszta: `Math.random`, óra és hálózat nélkül — ugyanaz a bemenet mindig ugyanazt a kiosztást adja (a futás megismételhető és mérhető).
 * Az algoritmus azonos az opciókeverés korábbi, saját példányával (`shared/option-order.ts`), így annak kimenete bájtra változatlan.
 */

/** FNV-1a 32 bit — gyors, stabil mag-hash (nincs kriptográfiai igény). UTF-16 kódegységenként, mint a korábbi `hash32`. */
export function seedFrom(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/** mulberry32 — determinisztikus [0, 1) sorozat a magból. */
export function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates keverés a magból; a bemenetet nem módosítja. */
export function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  const out = [...items];
  const random = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Egy elem a magból (üres listán `undefined`). */
export function seededPick<T>(items: readonly T[], seed: number): T | undefined {
  return items.length ? items[Math.floor(mulberry32(seed)() * items.length)] : undefined;
}
