/**
 * Tartalomjelzők a tanmenet-illesztéshez (docs/specs/2026-10-18-tanmenet-kiegeszites.md) — tiszta függvények. Ha a cím önmagában
 * nem illeszthető (pl. „6. osztályos matematika gyakorló feladatlap”), a tartalom címsorai / kulcsfogalmai döntenek.
 */
const MAX_HINTS = 30;

const strip = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim();

/** HTML-anyag: a h1–h3 címsorok szövege (egyedi, legfeljebb 30). */
export function hintsFromHtml(html: string): string[] {
  const body = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ");
  const heads = [...body.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)].map(m => strip(m[1])).filter(t => t && t.length <= 160);
  return [...new Set(heads)].slice(0, MAX_HINTS);
}

/** Strukturált lecke: a fejezet- és blokkcímek, valamint a magyarázó szövegek félkövér kulcsfogalmai. */
export function hintsFromLesson(json: unknown): string[] {
  const out: string[] = [];
  const sections = (json as { sections?: unknown })?.sections;
  if (!Array.isArray(sections)) return out;
  for (const s of sections) {
    const sec = s as { title?: unknown; heading?: unknown; blocks?: unknown };
    for (const t of [sec.title, sec.heading]) if (typeof t === "string" && t.trim()) out.push(t.trim());
    if (!Array.isArray(sec.blocks)) continue;
    for (const b of sec.blocks) {
      const blk = b as { title?: unknown; text?: unknown };
      if (typeof blk.title === "string" && blk.title.trim()) out.push(blk.title.trim());
      if (typeof blk.text === "string") for (const m of blk.text.matchAll(/\*\*([^*]{3,80})\*\*/g)) out.push(m[1].trim());
    }
  }
  return [...new Set(out)].slice(0, MAX_HINTS);
}
