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

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** S2: a hírlevél tárgya — a keresztnév és a cikk címe (a cím vágva). */
export function newsletterSubject(first: string, title: string): string {
  const t = title.trim().replace(/\s+/g, " ");
  return `🔭 ${first}, mai felfedezésed: ${t.length > 70 ? `${t.slice(0, 69)}…` : t}`;
}

/** S2: a hírlevél törzse a reggeli levél stílusában; minden külső szöveg escape-elve. */
export function newsletterHtml(input: { first: string; title: string; teaser: string; question: string; articleUrl: string; materialTitle?: string | null; materialUrl?: string | null }): string {
  const { first, title, teaser, question, articleUrl, materialTitle, materialUrl } = input;
  const bridge = materialTitle && materialUrl
    ? `<div style="background:#0f172a;border:1px solid #38bdf8;border-radius:16px;padding:18px;margin-top:16px">
<p style="font-size:13px;margin:0 0 6px;color:#7dd3fc;font-weight:bold">HA EZ TETSZETT, EZT IS NÉZD MEG A WEBSULIN</p>
<p style="font-size:18px;font-weight:bold;margin:0 0 12px;color:#e0f2fe">${esc(materialTitle)}</p>
<a href="${esc(materialUrl)}" style="display:inline-block;background:#38bdf8;color:#0f172a;font-weight:bold;font-size:16px;text-decoration:none;padding:12px 22px;border-radius:999px">Megnyitom</a>
</div>`
    : "";
  return `<!doctype html><html lang="hu"><body style="margin:0;background:#0A0E27;font-family:Arial,Helvetica,sans-serif;color:#f8fafc">
<div style="max-width:560px;margin:0 auto;padding:24px">
<p style="font-size:22px;font-weight:bold;margin:0 0 8px">Szia, ${esc(first)}! 🔭</p>
<p style="font-size:15px;margin:0 0 18px;color:#e2e8f0">Ma ezt találtam neked:</p>
<div style="background:#1e1b4b;border:1px solid #fb923c;border-radius:16px;padding:20px">
<p style="font-size:13px;margin:0 0 6px;color:#fcd34d;font-weight:bold">MAI FELFEDEZÉS</p>
<p style="font-size:20px;font-weight:bold;margin:0 0 10px;color:#fdba74">${esc(title)}</p>
<p style="font-size:16px;line-height:1.5;margin:0 0 12px;color:#f1f5f9">${esc(teaser)}</p>
<p style="font-size:15px;margin:0 0 16px;color:#fde68a"><strong>Gondolkodj el rajta:</strong> ${esc(question)}</p>
<a href="${esc(articleUrl)}" style="display:inline-block;background:#fb923c;color:#0f172a;font-weight:bold;font-size:17px;text-decoration:none;padding:14px 24px;border-radius:999px">Elolvasom a cikket</a>
</div>
${bridge}
<p style="font-size:12px;color:#94a3b8;margin:20px 0 0">A cikk egy magyar ismeretterjesztő vagy hírportálon jelent meg; a WebSuli minden délután válogat neked egyet az érdeklődésed alapján.</p>
</div></body></html>`;
}
