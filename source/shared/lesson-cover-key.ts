import type { DESIGN_ASSET_BANDS } from "./design-assets";

/**
 * Leckénkénti borítókép (docs/specs/2026-11-03-leckeborito.md): a lecke tartalomkulcsa — a (sáv, tantárgy, cím) hármas ékezet-,
 * írásjel- és kis-nagybetű-tűrő alakjából. Böngészőben és Node-ban azonos; ugyanaz a tartalom ugyanazt a képet kapja, a cím vagy
 * a sáv változása új kulcsot ad. A kép a verziókezelt katalógus `cover` eleme (`id` = a kulcs), mint a többi borító.
 */
type Band = (typeof DESIGN_ASSET_BANDS)[number];
export const LESSON_COVER_ID = /^cover-l-[a-f0-9]{16}$/;

// A `foldText` megfelelője — saját példány, hogy a design-assets ↔ lesson-cover import ne legyen körkörös.
const basis = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
function fnv1a(text: string, seed: number): string {
  let h = seed;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function lessonCoverId(lesson: { subject: string; title: string }, band: Band): string {
  const key = `${band}|${basis(lesson.subject)}|${basis(lesson.title)}`;
  return `cover-l-${fnv1a(key, 0x811c9dc5)}${fnv1a(key, 0x01000193)}`;
}

export const isLessonCoverId = (id: string | undefined): id is string => !!id && LESSON_COVER_ID.test(id);

