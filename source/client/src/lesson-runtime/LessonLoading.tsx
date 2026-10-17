import { Loader2 } from "lucide-react";
import { DESIGN_THEMES, designThemeForClassroom } from "@shared/lesson-design";

/**
 * Lecke megnyitása (docs/specs/2026-10-17-lecke-betoltes.md): egyetlen töltőképernyő a sáv felületén, a sávfejléc és a
 * hős helyén váz. Így a fehér → sávszín váltás és a két egymást követő töltőszöveg („Betöltés…”, „Lecke betöltése…”)
 * nem látszik „újragenerálásnak”. A színek a mért tokenekből jönnek (a lejátszó CSS-e ekkor még nem töltődött be).
 */
/**
 * `fullScreen`: a route-szintű betöltéskor (App Suspense) — a body háttere szándékosan sötétkék (a kezdőlap dizájnja), ezért a
 * töltő saját világos, teljes képernyős hátteret ad; különben a megnyitás sötétkék villanással kezdődne (mérve, 2026-10-17).
 */
export function LessonLoading({ classroom, fullScreen = false }: { classroom?: number | null; fullScreen?: boolean }) {
  const theme = typeof classroom === "number" ? DESIGN_THEMES[designThemeForClassroom(classroom)] : null;
  const surface = theme?.surface ?? "hsl(var(--background))";
  const panel = theme?.panel ?? "hsl(var(--muted))";
  const line = theme?.line ?? "hsl(var(--border))";
  const ink = theme?.muted ?? "hsl(var(--muted-foreground))";
  const block = { background: panel, border: `1px solid ${line}`, borderRadius: 24 } as const;
  return (
    <div className={`w-full ${fullScreen ? "min-h-screen" : "min-h-[70vh]"} px-4 py-4 sm:px-6`} style={{ background: surface }} data-testid="lesson-loading" data-ws-loading={theme?.id ?? "neutral"}>
      <div className="mx-auto w-full max-w-[1100px] flex flex-col gap-4">
        <div aria-hidden="true" style={{ ...block, height: 96 }} />
        <div aria-hidden="true" style={{ ...block, aspectRatio: "16 / 6", minHeight: 180 }} />
        <p role="status" className="flex items-center justify-center gap-2 text-sm font-semibold py-2" style={{ color: ink }}>
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Lecke betöltése…
        </p>
      </div>
    </div>
  );
}
