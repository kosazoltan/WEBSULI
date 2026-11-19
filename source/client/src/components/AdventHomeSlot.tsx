/**
 * Adventi naptár — a főoldali kártya foglalata (docs/specs/2026-11-18-adventi-naptar.md 14., 20.; vak ellenőr K1).
 * A kártya kódja és CSS-e KÜLÖN darabban van: kikapcsolt build-kapcsolónál a lusta import sincs a buildben (a feltétel
 * build-időben hamis), szezonon kívül a darab nem töltődik le. Szezonban a foglalat az első rajzolástól a kártya végleges
 * méretén áll (a darab betöltése alatt is), így a lista nem ugrik (CLS).
 */
import { lazy, Suspense, useMemo } from "react";
import { homeCardReserve } from "@shared/advent/home-card";
import { ADVENT_BUILD_FLAG, adventCardNow } from "@/advent/season-flag";

const AdventHomeCard = ADVENT_BUILD_FLAG ? lazy(() => import("@/components/AdventHomeCard")) : null;

export default function AdventHomeSlot() {
  const reserve = useMemo(() => {
    if (!AdventHomeCard) return false;
    const now = adventCardNow();
    return now !== null && homeCardReserve(now);
  }, []);
  if (!AdventHomeCard || !reserve) return null;
  return (
    <Suspense fallback={<div aria-hidden="true" data-testid="advent-home-reserve" className="mb-3 h-[132px] w-full rounded-2xl bg-[#0b1d3a] md:h-[160px]" />}>
      <AdventHomeCard />
    </Suspense>
  );
}
