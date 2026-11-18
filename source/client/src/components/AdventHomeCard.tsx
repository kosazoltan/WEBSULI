/**
 * Adventi naptár — főoldali kártya a Hero és a tananyagok között (docs/specs/2026-11-18-adventi-naptar.md 14.; tulajdonosi
 * követelmény 2026-11-18: „teljes szélességű, de nem túl magas kártyán, hogy azonnal lássák … és azonnal tudjanak vele játszani”).
 *
 * Elrendezés-ugrás ellen a doboz helyét a kliens órája alapján AZONNAL lefoglaljuk (november 24. – január 6.); a tartalom a
 * szerver válaszával töltődik ugyanabba a rögzített magasságú dobozba. A szerver a tekintély: ha a naptár nem él (kikapcsolt
 * flag), a doboz összecsukódik. Szezonon kívül a komponens semmit sem rajzol és semmit sem kér le.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { adventNow } from "@shared/advent/calendar";
import { homeCardReserve, homeCardStatus } from "@shared/advent/home-card";
import AdventArt from "@/advent/AdventArt";
import { ADVENT_STATUS_KEY, fetchAdventStatus, useAdventState } from "@/advent/useAdvent";
import "@/advent/advent.css";

export default function AdventHomeCard() {
  const reserved = useMemo(() => homeCardReserve(new Date()), []);
  const clientPhase = useMemo(() => adventNow(new Date()).phase, []);
  const status = useQuery({ queryKey: ADVENT_STATUS_KEY, queryFn: fetchAdventStatus, enabled: reserved, staleTime: 5 * 60_000, retry: 1 });
  const live = status.data?.enabled === true && status.data.phase !== "before" && status.data.phase !== "closed";
  const state = useAdventState(reserved && live);
  if (!reserved) return null;
  // A szerver szerint nem él a naptár (kikapcsolt flag, vagy a böngésző órája téved): a kártya eltűnik.
  if (status.isSuccess && !live) return null;
  if (status.isError) return null;
  // Amíg a szerver nem válaszol, a böngésző órája szerinti fázis dönt arról, van-e gomb — így a gomb azonnal ott van.
  const phase = status.data?.phase ?? clientPhase;
  const teaser = phase === "teaser";
  const view = homeCardStatus(live && state.data ? state.data : null);
  const days = status.data?.daysUntilStart;
  const text = teaser && !state.data ? (days ? `Hamarosan: december 1. — még ${days} nap` : "Hamarosan: december 1.") : view.text;
  const cta = teaser ? null : view.cta;
  return (
    <section className="advent-home-card" data-testid="advent-home-card" aria-labelledby="advent-home-card-title">
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
