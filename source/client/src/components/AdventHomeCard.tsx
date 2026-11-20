/**
 * Adventi naptár — főoldali kártya a Hero és a tananyagok között (docs/specs/2026-11-18-adventi-naptar.md 14., 20.; tulajdonosi
 * követelmény 2026-11-18: „teljes szélességű, de nem túl magas kártyán, hogy azonnal lássák … és azonnal tudjanak vele játszani”).
 *
 * A „látszik-e” döntés az ELSŐ RAJZOLÁS ELŐTT megszületik, hálózati kör nélkül: a buildbe égetett kapcsoló + a böngésző órája
 * (Europe/Budapest). Szezonban a kártya azonnal a végleges méretén jelenik meg — a lista soha nem ugrik (cél: CLS ≤ 0,02).
 * Kikapcsolt kapcsolónál és szezonon kívül a komponens semmit nem rajzol és semmit nem kér le. A szerver státusza csak
 * felülbírál: ha a naptár ott nem él (hibás bekapcsolási sorrend, elállított óra), a kártya összecsukódik.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { adventNow } from "@shared/advent/calendar";
import { homeCardReserve, homeCardStatus } from "@shared/advent/home-card";
import AdventArt from "@/advent/AdventArt";
import { adventCardNow } from "@/advent/season-flag";
import { ADVENT_STATUS_KEY, fetchAdventStatus, hasAdventIdentity, useAdventState } from "@/advent/useAdvent";
import "@/advent/advent.css";

export default function AdventHomeCard() {
  const clock = useMemo(() => {
    const now = adventCardNow();
    if (!now || !homeCardReserve(now)) return null;
    const at = adventNow(now);
    return { teaser: at.phase === "teaser", daysUntilStart: at.daysUntilStart };
  }, []);
  const active = clock !== null;
  const status = useQuery({ queryKey: ADVENT_STATUS_KEY, queryFn: fetchAdventStatus, enabled: active, staleTime: 5 * 60_000, retry: 3 });
  const serverSaysOff = status.isSuccess && !(status.data.enabled === true && status.data.phase !== "before" && status.data.phase !== "closed");
  // A fázis a szervertől jön, amint megvan; addig a böngésző órája szerinti.
  const teaser = status.data?.phase ? status.data.phase === "teaser" : clock?.teaser ?? false;
  // Személyes állapotot csak attól kérünk, akinek MÁR van naptára (eszközazonosító vagy tanulói link) — a főoldal senkinek nem
  // hoz létre és nem küld azonosítót (vak ellenőr S8). A „Hamarosan” időszakban nincs mit lekérni.
  const personal = useMemo(() => hasAdventIdentity(), []);
  const state = useAdventState(active && status.isSuccess && !serverSaysOff && !teaser && personal, false);

  if (!active || serverSaysOff) return null;
  const view = homeCardStatus(state.data ?? null);
  const days = status.data?.daysUntilStart ?? clock.daysUntilStart;
  const text = teaser ? (days ? `Hamarosan: december 1. — még ${days} nap` : "Hamarosan: december 1.") : view.text;
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
