/**
 * Tesztek „hamisítása” (docs/specs/2026-11-20-teszt-hamisitas-utkozes.md): egyetlen karakter cseréje egy tőle KÜLÖNBÖZŐ
 * base64url-karakterre — a kimenet mindig eltér a bemenettől (a régi `slice(0, -2)` + rögzített végződés minta 1/4096, illetve
 * ~1/1024 eséllyel ugyanazt az értéket adta, és a teszt hibásan bukott).
 *
 * Aláírásnál (a szerver a DEKÓDOLT bájtokat veti össze) az ELSŐ karaktert cseréld (`index = 0`): a base64url utolsó karakterének
 * alsó bitjei kitöltés, ott a csere ugyanazt a bájtsort adhatja. Szöveges egyezésnél (pl. OAuth `state`) bármely pozíció jó.
 * Negatív index a végétől számít; tartományon kívüli index → kivétel.
 */
export function withDifferentChar(value: string, index: number): string {
  // Előbb az EREDETI index egészségét nézzük: a normalizálás (pl. 32 + (-1 - ε) → 31) lebegőpontos kerekítéssel elfedné a törtet.
  const at = Number.isInteger(index) ? (index < 0 ? value.length + index : index) : Number.NaN;
  if (!Number.isInteger(at) || at < 0 || at >= value.length) throw new RangeError(`withDifferentChar: a(z) ${index}. pozíció nincs a ${value.length} hosszú értékben`);
  const replacement = value[at] === "A" ? "B" : "A";
  return `${value.slice(0, at)}${replacement}${value.slice(at + 1)}`;
}
