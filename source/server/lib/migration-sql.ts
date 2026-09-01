/**
 * BACKLOG T3 (2026-09-02) — a drizzle-kit által generált, teljes egészében
 * `/* … *\/` blokk-kommentbe csomagolt séma-fájl (0000_…) futtathatóvá tétele.
 *
 * A runner eddig az ilyen fájlt no-opként "applied"-nek jelölte, ezért egy üres
 * adatbázison az alaptáblák sosem jöttek létre, és a következő migráció 42P01-gyel bukott.
 * Itt a burkot lefejtjük; a statement-bontás és az "already exists" tolerancia a runner
 * meglévő logikája marad.
 */

/** Igaz, ha a fájl (a bevezető `--` sorok után) egyetlen blokk-kommentbe van csomagolva. */
export function isBlockCommentWrappedSql(raw: string): boolean {
  const lines = raw.split('\n');
  let i = 0;
  while (i < lines.length && /^\s*--/.test(lines[i]!)) i++;
  const rest = lines.slice(i).join('\n').trim();
  return rest.startsWith('/*') && rest.endsWith('*/');
}

/**
 * Lefejti a külső blokk-kommentet; a bevezető `--` kommentsorokat megtartja (a runner
 * úgyis kiszűri). Ha a fájl nincs becsomagolva, változatlanul adja vissza.
 */
export function unwrapBlockCommentedSql(raw: string): string {
  if (!isBlockCommentWrappedSql(raw)) return raw;
  const lines = raw.split('\n');
  let i = 0;
  while (i < lines.length && /^\s*--/.test(lines[i]!)) i++;
  const header = lines.slice(0, i).join('\n');
  const rest = lines.slice(i).join('\n').trim();
  const inner = rest.slice(2, rest.length - 2); // "/*" és "*/" nélkül
  return header ? `${header}\n${inner}` : inner;
}
