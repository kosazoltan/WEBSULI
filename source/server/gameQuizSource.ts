/**
 * TG-P5a (docs/specs/2026-11-27-tananyag-gyakorlati-p5a-vegrehajtas.md): a játékkvíz-generátor forráskivonata.
 * RED: a régi viselkedés (címketörlés + az első 14 000 karakter).
 */
export type TeachableQuizSource = { text: string; sections: number };

export function teachableQuizSource(html: string, budget = 14000): TeachableQuizSource | null {
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
  return { text: stripped.length > budget ? stripped.slice(0, budget) : stripped, sections: 1 };
}
