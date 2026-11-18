/**
 * Adventi naptár — főoldali kártya a Hero és a tananyagok között (docs/specs/2026-11-18-adventi-naptar.md 14.; tulajdonosi
 * követelmény 2026-11-18: „teljes szélességű, de nem túl magas kártyán, hogy azonnal lássák … és azonnal tudjanak vele játszani”).
 *
 * Előbb az állapot, utána a megjelenítés (review S4 F1): a kártya CSAK akkor jelenik meg, ha a szerver szerint a naptár él.
 * Kikapcsolt naptárnál (flag) semmi nem villan fel és a lista nem mozdul. A helyet előre csak az foglalja le, akinél ebben az
 * évadban a kártya már megjelent (helyi jelző) — nála a lista a tartalom megérkezésekor sem ugrik. Szezonon kívül a komponens
 * semmit sem rajzol és semmit sem kér le.
 */
import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { adventNow } from "@shared/advent/calendar";
import { homeCardReserve, homeCardStatus } from "@shared/advent/home-card";
import AdventArt from "@/advent/AdventArt";
import { ADVENT_STATUS_KEY, fetchAdventStatus, useAdventState } from "@/advent/useAdvent";
import "@/advent/advent.css";

const SEEN_KEY = "websuli.advent.cardSeen";
function seenSeason(): string | null {
  try { return window.localStorage.getItem(SEEN_KEY); } catch { return null; }
}
function rememberSeason(season: string | null): void {
  try { if (season) window.localStorage.setItem(SEEN_KEY, season); else window.localStorage.removeItem(SEEN_KEY); }
  catch { /* tárhely nélkül a kártya minden betöltéskor az állapot után jelenik meg */ }
}

export default function AdventHomeCard() {
  const clock = useMemo(() => { const now = new Date(); return { inSeason: homeCardReserve(now), season: String(adventNow(now).season) }; }, []);
  const seenBefore = useMemo(() => clock.inSeason && seenSeason() === clock.season, [clock]);
  const status = useQuery({ queryKey: ADVENT_STATUS_KEY, queryFn: fetchAdventStatus, enabled: clock.inSeason, staleTime: 5 * 60_000, retry: 1 });
  const live = status.data?.enabled === true && status.data.phase !== "before" && status.data.phase !== "closed";
  const state = useAdventState(clock.inSeason && live);
  const settled = status.isSuccess;
  useEffect(() => { if (settled) rememberSeason(live ? clock.season : null); }, [settled, live, clock.season]);

  if (!clock.inSeason || status.isError) return null;
  if (settled && !live) return null;
  if (!settled) {
    // Az állapot még úton van: csak annál foglalunk helyet, akinél a kártya ebben az évadban már megjelent — üresen, gomb nélkül.
    return seenBefore ? <div className="advent-home-card advent-home-card--reserved" data-testid="advent-home-card" data-state="reserved" aria-hidden="true" /> : null;
  }
  const teaser = status.data?.phase === "teaser";
  const view = homeCardStatus(state.data ?? null);
  const days = status.data?.daysUntilStart;
  const text = teaser && !state.data ? (days ? `Hamarosan: december 1. — még ${days} nap` : "Hamarosan: december 1.") : view.text;
  const cta = teaser ? null : view.cta;
  return (
    <section className="advent-home-card" data-testid="advent-home-card" data-state="ready" aria-labelledby="advent-home-card-title">
      <AdventArt id="advent-home-banner" className="advent-home-card__art" eager decorative />
      <div className="advent-home-card__text">
        <h2 id="advent-home-card-title" className="advent-home-card__title">Adventi naptár</h2>
        <p className="advent-home-card__status" data-testid="advent-home-status">{text}</p>
      </div>
      {cta ? (
        <Link href="/adventi-naptar?nyit=ma" className="advent-home-card__cta" data-testid="advent-home-cta">{cta}</Link>
      ) : null}
    </section>
  );
}
