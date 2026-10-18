/** Napi lelkesítő mondatok — a nyilvános üdvözlő kártya és a napi tananyag-e-mail közös forrása. */
export const MOTIVATION_LINES = [
  "Ma is egy lépéssel okosabb leszel — kezdjük!",
  "Minden nagy tudás egy kis kíváncsisággal kezdődik.",
  "Tíz figyelmes perc többet ér egy fáradt órányinál. Hajrá!",
  "A hibák a tanulás lépcsőfokai — bátran próbálkozz!",
  "Ami ma nehéz, holnap már könnyen megy.",
  "Nézd meg az újdonságokat, és szerezz egy kis sikerélményt!",
  "Lépésről lépésre — és egyszer csak érteni fogod.",
  "Büszke lehetsz magadra, hogy itt vagy. Folytassuk!",
] as const;

/** Naponta rögzített (determinisztikus) lelkesítő mondat — egy napon belül nem változik újratöltésre. */
export function motivationFor(name: string, date: Date): string {
  const day = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);
  return MOTIVATION_LINES[(day + name.length) % MOTIVATION_LINES.length];
}
