/**
 * J5a / review #485 K1 — kupon módban a lecke tananyaga nem fogyhat el (lapszintű tartalék a #483 közös javításáig).
 *
 * #483 után törölhető: a közös `questionDirector` kupon-ága (D-J1a-10) ugyanezt adja; akkor ez a fájl és a Brain Rot
 * provider `material` ágának tartaléka (`// #483 után törölhető`) kivehető.
 *
 * Szabály (végrehajtás J5a 17.): kimerüléskor előbb a menetben hibázott (még nem javított) tétel, utána a legrégebben
 * látott; ≥ 2 tételnél soha nem a közvetlenül előző. Az ismétlés kulcsa `<kulcs>#ism<n>` (a director a menetben már feltett
 * kulcsot nem kérdezi újra), és `noReview` — az ismétlési sorba a tétel az első feltevéskor már bekerült.
 */

export const COUPON_REPEAT_SEP = "#ism";

/** Az ismétlés-változat kulcsából az eredeti tétel-kulcs. */
export function couponBaseKey(key: string): string {
  const i = key.indexOf(COUPON_REPEAT_SEP);
  return i < 0 ? key : key.slice(0, i);
}

export type CouponRepeat = {
  /** Egy kupon-kérdés megjelent (eredeti vagy ismétlés). */
  asked(key: string): void;
  /** A kimenet: jó → a hibázott tétel javítva; rossz / lejárat → hibázott. A megszakítás nem számít. */
  outcome(key: string, result: "correct" | "wrong" | "timeout" | "aborted"): void;
  /** A következő ismétlendő tétel (vagy null, ha a készlet üres) és az új változat-kulcs. */
  next<T>(items: readonly T[], keyOf: (item: T) => string): { item: T; key: string } | null;
  reset(): void;
};

export function createCouponRepeat(): CouponRepeat {
  let position = 0;
  let serial = 0;
  let lastKey: string | null = null;
  const lastSeen = new Map<string, number>();
  /** Hibázott, még nem javított tétel → a hiba sorszáma. */
  const missed = new Map<string, number>();
  return {
    asked(key) {
      const base = couponBaseKey(key);
      position += 1;
      lastSeen.set(base, position);
      lastKey = base;
    },
    outcome(key, result) {
      const base = couponBaseKey(key);
      if (result === "correct") missed.delete(base);
      else if ((result === "wrong" || result === "timeout") && !missed.has(base)) missed.set(base, position);
    },
    next(items, keyOf) {
      if (items.length === 0) return null;
      let best: { item: (typeof items)[number]; base: string; rank: number } | null = null;
      for (const item of items) {
        const base = keyOf(item);
        if (items.length >= 2 && base === lastKey) continue;
        // Kisebb rang előbb: a hibázottak (a legrégebbi hiba elöl), utánuk a legrégebben látott (soha nem látott: 0).
        const miss = missed.get(base);
        const rank = miss !== undefined ? miss - 1e9 : (lastSeen.get(base) ?? 0);
        if (!best || rank < best.rank) best = { item, base, rank };
      }
      if (!best) return null;
      serial += 1;
      return { item: best.item, key: `${best.base}${COUPON_REPEAT_SEP}${serial}` };
    },
    reset() {
      position = 0;
      serial = 0;
      lastKey = null;
      lastSeen.clear();
      missed.clear();
    },
  };
}
