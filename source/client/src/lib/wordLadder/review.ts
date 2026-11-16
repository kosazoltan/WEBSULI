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

/**
 * A felolvasás terve a kérdés SZERKEZETÉBŐL (review #454, koordinátori szabály) — nem a prompt szövegéből találgatva.
 * A szóbankos tétel azonosítója `vocab:<bejegyzés>:<kérdéstípus>`:
 *  - `target-to-hu` / `phrase-meaning`: a kérdésben az idegen nyelvű szó / kifejezés áll → a megjelenéskor elhangzik;
 *  - `hu-to-target` / `cloze`: az idegen szó maga a VÁLASZ → megjelenéskor SEMMI, csak a válasz után (helyesnél
 *    megerősítés, hibánál a megoldás-kijelzéskor — ez tanít);
 *  - kézi bank / tananyag / ismeretlen típus: nincs felolvasás (a nyelv nem állapítható meg biztosan).
 * Magyar szöveg így soha nem kerül idegen nyelvű hangra (csak a bejegyzés `term`-je hangzik el).
 */
export function speechPlan(quizId: string, term: string | undefined): { atShow: string | null; afterAnswer: string | null } {
  const t = (term ?? "").trim();
  if (!quizId.startsWith("vocab:") || !t) return { atShow: null, afterAnswer: null };
  const type = quizId.split(":")[2] ?? "";
  if (type === "target-to-hu" || type === "phrase-meaning") return { atShow: t, afterAnswer: null };
  if (type === "hu-to-target" || type === "cloze") return { atShow: null, afterAnswer: t };
  return { atShow: null, afterAnswer: null };
}
