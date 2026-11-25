/**
 * Szólétra — a rivális nevét tartalmazó felirat-mondatok (docs/specs/2026-11-23-szoletra-felirat.md, P-011).
 *
 * A mondatok szándékosan úgy vannak megfogalmazva, hogy a név után ne álljon rag: a magyar tárgyrag a hangrendtől, az utolsó
 * hangtól és a szótőtől függ (Villám → Villámot, Kő → Követ, Bence → Bencét, Ödön → Ödönt), ezt egy névfüggő szabály csak
 * hiányosan tudná. A név mindig alanyesetben áll, utána szóköz vagy írásjel — így bármely rivális-névvel helyes a mondat.
 */

/** Előzés-felirat: a játékos előzött (`player`), vagy a rivális előzte meg a játékost (`rival`). */
export function overtakeCaption(by: "player" | "rival", name: string): string {
  return by === "player" ? `Előzés! ${name} most mögötted van! 🎉` : `${name} előzött — kapaszkodj utána!`;
}

/** A győzelmi eredménylap címe. */
export function winTitle(name: string): string {
  return `🏁 Elérted a csúcsot ${name} előtt!`;
}

/** A vereség eredmény-sorának eleje (biztató, nem gúnyos — terv 4.2). */
export function lossLine(name: string): string {
  return `${name} most gyorsabb volt — a visszavágóban utolérheted!`;
}

/** A verseny-sor állás-szövege; `lead` > 0: a játékos van elöl (fokban). */
export function leadCaption(lead: number, name: string): string {
  if (lead >= 1) return `+${Math.floor(lead)} fok előnyöd van`;
  if (lead <= -1) return `${name} ${Math.floor(-lead)} fokkal előtted`;
  return "Fej fej mellett!";
}
