import { DESIGN_ASSET_CATALOG } from "@shared/design-asset-catalog";
import { pickLessonArt, type LessonArt as Art } from "@shared/design-assets";
import { DESIGN_THEMES, type DesignThemeId } from "@shared/lesson-design";
import { LessonCoverArt } from "./LessonCoverArt";

/**
 * Websuli lecke-hős (docs/specs/2026-10-17-websuli-lecke-hos.md): a jóváhagyott képkészletből választott borító vagy sávhős,
 * az 1–5. évfolyamon a kabalával és a sáv szóbuborékával. Szöveg nincs a képen, a cím a kártyán áll (mért tokenek).
 * Ha a sávhoz még nincs jóváhagyott kép, a régi rajzos tartalék (LessonCoverArt) jelenik meg.
 */
export function lessonArtFor(lesson: { subject: string; title: string }, theme: DesignThemeId): Art {
  return pickLessonArt(lesson, theme, DESIGN_ASSET_CATALOG);
}

export function LessonArt({ art, theme, subject }: { art: Art; theme: DesignThemeId; subject: string }) {
  const image = art.cover ?? art.hero;
  const bubble = DESIGN_THEMES[theme].bubble;
  if (!image) return <LessonCoverArt subject={subject} />;
  return <figure className="ws-art" data-art={art.cover ? "cover" : "hero"}>
    <img src={image.src} alt={image.alt} loading="eager" decoding="async" />
    {art.mascot && bubble && <div className="ws-mascot">
      <img src={art.mascot.src} alt="" aria-hidden="true" decoding="async" />
      <p className="ws-bubble">{bubble}</p>
    </div>}
  </figure>;
}
