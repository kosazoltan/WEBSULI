/**
 * „Mai felfedezés” hírlevél (docs/specs/2026-10-19-mai-felfedezes-hirlevel.md): az érdeklődési címkék közös szabálya (admin felület
 * és szerver).
 */
export const NEWSLETTER_LIMITS = { tags: 8, tagChars: 40 } as const;

/**
 * Tömb → tisztított címkelista: trim, üres elhagyva, kis-nagybetűtől független egyediség (az első alak marad), legfeljebb 8 címke,
 * egyenként legfeljebb 40 karakter. Nem tömb, nem szöveg, túl hosszú vagy vezérlőkarakteres címke → null (hibás kérés).
 */
export function normalizeInterests(input: unknown): string[] | null {
  if (!Array.isArray(input)) return null;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    if (typeof raw !== "string") return null;
    // Review #312: a vezérlőkarakter (tab, sortörés is) a normalizálás ELŐTT hiba; a vessző és a pontosvessző a felület elválasztója,
    // ezért címkén belül nem lehet (különben a következő mentéskor a címke kettéválna).
    // eslint-disable-next-line no-control-regex
    if (/[\u0000-\u001f\u007f]/.test(raw) || /[,;]/.test(raw)) return null;
    const tag = raw.trim().replace(/ {2,}/g, " ");
    if (!tag) continue;
    if (tag.length > NEWSLETTER_LIMITS.tagChars) return null;
    const key = tag.toLocaleLowerCase("hu");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out.length > NEWSLETTER_LIMITS.tags ? null : out;
}

/** A szövegmező (vesszővel vagy pontosvesszővel elválasztott) → címkék; a felület ebből küldi a tömböt. */
export const interestsFromText = (text: string): string[] => text.split(/[,;\n]/).map((t) => t.trim()).filter(Boolean);
