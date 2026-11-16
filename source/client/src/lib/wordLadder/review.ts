/**
 * Szólétra — melyik ismétlési tétel „a miénk” (végrehajtás J2a 4.; J0b 11. eltérés: az ismétlési sor KÖZÖS a hét
 * játékban, az idegen tételt a provider `null`-lal utasítja el, és a director a menetre átugorja).
 *
 * Saját tétel: a választott nyelv szóbankja (`vocab:<lang>:…`), a választott nyelv kézi / szerver-bankjának tétele
 * (`bank:word-ladder-hu-en:<id>`, ahol az id a MOSTANI nyelv szintlistájában van — minden nyelv ugyanazt a gameId-t
 * használja a kulcsban, ezért a puszta előtag nem elég: review #454), és a mostani tananyag-tétel (`mat:<id>`).
 * Évfolyam-bank és más játék tétele nem. Tiszta függvény.
 */
export function ownsReviewKey(
  key: string,
  ctx: { gameId: string; lang: string; bankIds: ReadonlySet<string>; materialKeys: ReadonlySet<string> },
): boolean {
  if (key.startsWith("vocab:")) return key.startsWith(`vocab:${ctx.lang}:`);
  if (key.startsWith("bank:")) {
    const prefix = `bank:${ctx.gameId}:`;
    return key.startsWith(prefix) && ctx.bankIds.has(key.slice(prefix.length));
  }
  if (key.startsWith("mat:")) return ctx.materialKeys.has(key);
  return false;
}

/**
 * Egy menet szó-őre (review #454, koordinátori pontosítás): ugyanaz a szó egy menetben csak egy irányban jelenhet meg.
 * - `remember(key, q)`: a megjelent kérdés (a director-kulcsával) — a menet végéig megmarad;
 * - `sameAsShown(key)`: menet közbeni ismétlésnél a MÁR LÁTOTT kérdés (ugyanaz az irány és szöveg), nem egy újragenerált,
 *   esetleg fordított irányú változat;
 * - `freshAllowed(key)`: új tétel csak akkor, ha a kulcsa (szóbankos tételnél a bejegyzés) még nem jelent meg.
 */
export function createRunWordGuard<Q>() {
  const shown = new Map<string, Q>();
  return {
    remember(key: string, q: Q): void {
      if (!shown.has(key)) shown.set(key, q);
    },
    sameAsShown(key: string): Q | null {
      return shown.get(key) ?? null;
    },
    freshAllowed(key: string): boolean {
      return !shown.has(key);
    },
    reset(): void {
      shown.clear();
    },
  };
}

function isWordChar(ch: string | undefined): boolean {
  if (!ch) return false;
  if (ch >= "0" && ch <= "9") return true;
  return ch.toLowerCase() !== ch.toUpperCase();
}

/**
 * Szerepel-e a célnyelvi szó a promptban ÖNÁLLÓ szóként (review #454: a „„megy” angolul:” promptban a „go” részszó —
 * a puszta `includes` a választ olvasta volna fel a megjelenéskor). Kis-/nagybetűtől független; a határ betű / számjegy
 * nélküli karakter vagy a szöveg széle.
 */
export function promptHasTerm(prompt: string, term: string): boolean {
  const p = prompt.toLowerCase();
  const t = term.trim().toLowerCase();
  if (!t) return false;
  for (let i = p.indexOf(t); i >= 0; i = p.indexOf(t, i + 1)) {
    if (!isWordChar(p[i - 1]) && !isWordChar(p[i + t.length])) return true;
  }
  return false;
}
