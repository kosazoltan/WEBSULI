/**
 * JM0 (adatvédelem, docs/specs/2026-11-16-jatekok-jatekelmeny*.md): e-mail-cím a szerver naplójában csak maszkolva szerepelhet.
 * `anna@example.com` → `a***@e***.com`. Hibás / üres bemenet nem szivárogtat: `***`.
 */
export function maskEmail(value: unknown): string {
  if (typeof value !== "string") return "***";
  const text = value.trim();
  const at = text.lastIndexOf("@");
  if (at < 1 || at === text.length - 1) return "***";
  const local = text.slice(0, at);
  const domain = text.slice(at + 1);
  const dot = domain.lastIndexOf(".");
  const host = dot > 0 ? domain.slice(0, dot) : domain;
  const tld = dot > 0 ? domain.slice(dot) : "";
  if (!host) return "***";
  const firstChar = (s: string) => Array.from(s)[0] ?? "";
  return `${firstChar(local)}***@${firstChar(host)}***${tld}`;
}
