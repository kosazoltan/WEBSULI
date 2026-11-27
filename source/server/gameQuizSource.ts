/**
 * TG-P5a (docs/specs/2026-11-27-tananyag-gyakorlati-p5a-vegrehajtas.md): a játékkvíz-generátor forráskivonata.
 *
 * A régi kivonat (címketörlés + az első 14 000 karakter) a fejlécet, a menüt és a pontozási előszót is a modellnek adta, a
 * tényleges példa pedig lecsúszhatott a keretről. Itt: az oldalváz (script, style, header, nav, footer, aside) kimarad, a
 * pontozási / időkeret-mondat a TG-P2a szabályával (`adminLineProblem`) kiesik, a keret a fejezetek (h1–h3) között oszlik el.
 * Csak fejlécből / pontozásból álló anyagnál `null` — a modellhívás előtt megáll.
 */
import { adminLineProblem } from "../shared/source-teaching-scope";

export type TeachableQuizSource = { text: string; sections: number };

/** Legalább ennyi betű / számjegy tanítható szöveg kell (fejléc nélkül), különben nincs miből kérdezni. */
const MIN_TEACHING_LETTERS = 40;
const SEP = "\n\n";

const decode = (s: string) => s
  .replace(/&nbsp;/g, " ")
  .replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">")
  .replace(/&quot;/g, "\"")
  .replace(/&#39;/g, "'")
  .replace(/&amp;/g, "&");

/** Mondatokra bont (a „3. feladat” sorszáma nem mondathatár: utána kisbetű jön). */
const sentences = (line: string) => line.replace(/([.!?])\s+(?=\p{Lu})/gu, "$1\n").split("\n");

// Review #634: a betű MELLETT a számjegy is tanítható tartalom (a számolós matematikai anyag főként számokból áll).
const letters = (s: string) => (s.match(/[\p{L}\p{N}]/gu) ?? []).length;

/** A szöveg levágása legfeljebb `n` karakterre, lehetőleg szóhatáron. */
function cut(text: string, n: number): string {
  if (text.length <= n) return text;
  const head = text.slice(0, n);
  const space = head.lastIndexOf(" ");
  return (space > n * 0.6 ? head.slice(0, space) : head).trimEnd();
}

export function teachableQuizSource(html: string, budget = 14000): TeachableQuizSource | null {
  const body = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|template|svg|head|header|nav|footer|aside)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<h[1-3]\b[^>]*>/gi, "\n\u0000")
    .replace(/<\/?(?:p|div|li|ul|ol|tr|td|th|table|section|article|main|h[1-6]|br|blockquote|figcaption|dt|dd)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  const sections: string[] = [];
  // A `\u0000` jel a h1–h3 címsor elejét jelöli: az első darab a címsor előtti bevezető, a többi első sora a fejezetcím.
  for (const [k, raw] of decode(body).split("\u0000").entries()) {
    const lines = raw.split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
    const heading = k > 0 ? lines.shift() ?? "" : "";
    const kept = lines
      .map((l) => sentences(l).map((s) => s.trim()).filter((s) => s && !adminLineProblem(s)).join(" "))
      .filter((l) => letters(l) > 0 || /\d/.test(l));
    if (!kept.length) continue;
    sections.push([heading && `## ${heading}`, ...kept].filter(Boolean).join("\n"));
  }
  const teaching = sections.reduce((n, s) => n + letters(s.replace(/^## .*$/mu, "")), 0);
  if (teaching < MIN_TEACHING_LETTERS) return null;

  // Vízszint-elosztás: a rövid fejezet egészben marad, a maradék keret egyenlően jut a hosszabbaknak.
  const room = Math.max(0, budget - SEP.length * (sections.length - 1));
  const quota = new Array<number>(sections.length).fill(0);
  let left = room;
  let open = sections.map((_, i) => i).sort((a, b) => sections[a].length - sections[b].length);
  while (open.length) {
    const share = Math.floor(left / open.length);
    const i = open[0];
    if (sections[i].length <= share) {
      quota[i] = sections[i].length;
      left -= quota[i];
      open = open.slice(1);
    } else {
      for (const j of open) quota[j] = share;
      open = [];
    }
  }
  const text = sections.map((s, i) => cut(s, quota[i])).filter(Boolean).join(SEP);
  return { text, sections: sections.length };
}
