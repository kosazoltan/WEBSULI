import { useQuery } from "@tanstack/react-query";
import { Palette } from "lucide-react";
import { DESIGN_ASSET_CATALOG } from "@shared/design-asset-catalog";
import { artSummary, type StoredLessonArt } from "@shared/design-assets";
import { DESIGN_THEMES, designThemeForClassroom } from "@shared/lesson-design";
import { ArtImage } from "@/lesson-runtime/LessonArt";
import { lessonByFileQuery } from "@/lesson-runtime/lesson-query";

/**
 * Leckekészítő stúdió (docs/specs/2026-10-17-studio-ui.md): a kész lecke tárolt arculata — sáv, tantárgyikon, hős- vagy
 * borítókép, kabala (1–5.), témakör —, az adatbázisból (a lejátszóval azonos forrásból, újraszámolás nélkül).
 */
export function LessonArtSummary({ lessonId, htmlFileId }: { lessonId?: string; htmlFileId?: string }) {
  // Review #278: a feltöltési útvonal a közzétett anyag azonosítóját ismeri, a haladó ág a leckéét.
  const material = useQuery<{ htmlFileId: string }>({ queryKey: [`/api/lessons/${lessonId}/material`], retry: 1, enabled: !htmlFileId && !!lessonId });
  const fileId = htmlFileId ?? material.data?.htmlFileId;
  const lesson = useQuery({ ...lessonByFileQuery(fileId ?? ""), enabled: !!fileId });
  const data = lesson.data?.lesson as { classroom?: number; art?: StoredLessonArt } | undefined;
  if (!data || typeof data.classroom !== "number") return null;
  const band = designThemeForClassroom(data.classroom);
  const theme = DESIGN_THEMES[band];
  const s = artSummary(data.art, band, DESIGN_ASSET_CATALOG);
  const picture = s.art?.cover ?? s.art?.hero;
  return (
    <section className="rounded-xl border bg-card text-card-foreground p-4 space-y-3" data-testid="lesson-art-summary" aria-labelledby="lesson-art-title">
      <h3 id="lesson-art-title" className="flex items-center gap-2 font-semibold">
        <Palette className="w-4 h-4" aria-hidden="true" /> Arculat
      </h3>
      <p className="flex flex-wrap items-center gap-2">
        <span className="inline-block w-3 h-3 rounded-full" style={{ background: theme.strong }} aria-hidden="true" />
        <span>{theme.grades} osztály · {theme.name}</span>
        {s.topic && <span className="rounded-md border px-2 py-0.5">Témakör: {s.topic}</span>}
      </p>
      {s.legacy ? (
        <p className="text-muted-foreground">Régi lecke: az arculatot megnyitáskor választja.</p>
      ) : (
        <div className="flex flex-wrap items-end gap-3 [&_img]:rounded-lg [&_img]:border [&_img]:object-cover">
          {picture && <figure className="m-0 w-48 max-w-full" title={picture.alt}><div className="aspect-[3/2] [&_img]:w-full [&_img]:h-full"><ArtImage asset={picture} fromDb alt={picture.alt} /></div><figcaption className="text-xs text-muted-foreground mt-1">{picture.kind === "cover" ? "Borító" : "Sávhős"}</figcaption></figure>}
          {s.art?.subjectIcon && <figure className="m-0 w-16" title={s.art.subjectIcon.alt}><div className="w-16 h-16 [&_img]:w-full [&_img]:h-full"><ArtImage asset={s.art.subjectIcon} fromDb alt={s.art.subjectIcon.alt} /></div><figcaption className="text-xs text-muted-foreground mt-1">Ikon</figcaption></figure>}
          {s.art?.mascot && <figure className="m-0 w-16" title={s.art.mascot.alt}><div className="w-16 h-16 [&_img]:w-full [&_img]:h-full"><ArtImage asset={s.art.mascot} fromDb alt={s.art.mascot.alt} /></div><figcaption className="text-xs text-muted-foreground mt-1">Kabala</figcaption></figure>}
        </div>
      )}
    </section>
  );
}
