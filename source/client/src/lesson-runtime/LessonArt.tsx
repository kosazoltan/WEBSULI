import { useState } from "react";
import { DESIGN_ASSET_CATALOG } from "@shared/design-asset-catalog";
import { pickLessonArt, resolveStoredArt, type DesignAsset, type LessonArt as Art, type StoredLessonArt } from "@shared/design-assets";
import { DESIGN_THEMES, type DesignThemeId } from "@shared/lesson-design";
import { LessonCoverArt } from "./LessonCoverArt";

/**
 * Websuli lecke-hős (docs/specs/2026-10-17-websuli-lecke-hos.md): a jóváhagyott képkészletből választott borító vagy sávhős,
 * az 1–5. évfolyamon a kabalával és a sáv szóbuborékával. Szöveg nincs a képen, a cím a kártyán áll (mért tokenek).
 * Ha a sávhoz még nincs jóváhagyott kép, a régi rajzos tartalék (LessonCoverArt) jelenik meg.
 *
 * Lecke megnyitása (docs/specs/2026-10-17-lecke-betoltes.md): a mentéskor rögzített arculatot (`lesson.art`) olvassa, és az
 * adatbázis-végpontról tölti — megjelenítéskor nem számol. Csak a régi, arculat nélküli leckénél választ itt (`pickLessonArt`).
 */
export type ShownArt = Art & { fromDb?: boolean };
export function lessonArtFor(lesson: { subject: string; title: string; seed?: string; art?: StoredLessonArt }, theme: DesignThemeId): ShownArt {
  // Spec 2026-10-19-hos-kep-sav: a tárolt kép csak akkor marad, ha az új szabály szerint is illik (különben friss választás).
  const stored = resolveStoredArt(lesson.art, theme, DESIGN_ASSET_CATALOG, lesson);
  return stored ? { ...stored, fromDb: true } : pickLessonArt(lesson, theme, DESIGN_ASSET_CATALOG);
}

/** Az adatbázisból tárolt kép; ha a végpont nem adja (404/500/hálózat), egyszer a katalógus statikus fájljára vált. */
export function ArtImage({ asset, fromDb, alt, eager }: { asset: DesignAsset; fromDb?: boolean; alt: string; eager?: boolean }) {
  const [failed, setFailed] = useState(false);
  const src = fromDb && !failed ? `/api/design-assets/${asset.id}` : asset.src;
  return <img src={src} alt={alt} aria-hidden={alt ? undefined : true} loading="eager" decoding="async"
    {...(eager ? { fetchpriority: "high" } : {})} onError={() => { if (fromDb) setFailed(true); }} />;
}

export function LessonArt({ art, theme, subject }: { art: ShownArt; theme: DesignThemeId; subject: string }) {
  const image = art.cover ?? art.hero;
  const bubble = DESIGN_THEMES[theme].bubble;
  if (!image) return <LessonCoverArt subject={subject} />;
  return <figure className="ws-art" data-art={art.cover ? "cover" : "hero"} data-kabala={image.keywords.includes("kabala") || undefined} data-art-source={art.fromDb ? "db" : "catalog"}>
    <ArtImage key={image.id} asset={image} fromDb={art.fromDb} alt={image.alt} eager />
    {art.mascot && bubble && <div className="ws-mascot">
      <ArtImage key={art.mascot.id} asset={art.mascot} fromDb={art.fromDb} alt="" />
      <p className="ws-bubble">{bubble}</p>
    </div>}
  </figure>;
}
