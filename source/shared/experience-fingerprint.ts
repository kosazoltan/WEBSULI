/**
 * A kör / lecke rövid (32 bites FNV-1a) lenyomata — a régi körazonosító és több tárolókulcs alapja. B8: a kliensből ide költözött
 * (bájtra azonos), hogy a tiszta `shared/round-id.ts` is használhassa.
 */
export function experienceFingerprint(value: unknown): string {
  let hash = 2166136261;
  for (const c of JSON.stringify(value)) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(36);
}
