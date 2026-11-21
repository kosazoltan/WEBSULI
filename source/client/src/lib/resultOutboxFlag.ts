/**
 * Spec 2026-11-17-eredmeny-email-kviz — tulajdonosi döntés (űrlap, 2026-11-21): „Szűkítés: tartós sor külön (Javasolt)”. A böngészős
 * TARTÓS kimenő sor (a végleges beküldések `localStorage`-sora, az induláskori ürítés, a címke / lejárat / fülbiztosság) kapcsoló mögött
 * áll, ALAPBÓL KI; a T-3 szeletben (`docs/specs/2026-11-20-eredmenylevel-tartos-sor.md`) külön PR-ban véglegesítjük.
 * KI állásban az eredmény-beküldés közvetlenül megy, sikertelenségnél csak a lapon belüli (memóriabeli) újrapróbával; a tárolóba nem ír,
 * induláskor nem ürít.
 * - Élesben csak a build-idejű `VITE_RESULT_OUTBOX_ENABLED=1` kapcsolja be.
 * - Az e2e-buildben (`VITE_ENABLE_RUNTIME_PROBE=1`) a böngészős teszt futás közben is bekapcsolhatja (`window.__websuliResultOutbox = true`,
 *   az oldal szkriptjei előtt), hogy ugyanazon a buildön mindkét állás mérhető legyen. Éles buildben ez a horog nem él.
 */
export function resultOutboxEnabled(): boolean {
  if (import.meta.env.VITE_RESULT_OUTBOX_ENABLED === "1") return true;
  if (import.meta.env.VITE_ENABLE_RUNTIME_PROBE !== "1") return false;
  try { return (window as unknown as { __websuliResultOutbox?: unknown }).__websuliResultOutbox === true; } catch { return false; }
}
