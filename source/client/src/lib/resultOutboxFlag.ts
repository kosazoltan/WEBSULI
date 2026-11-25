/**
 * B7 (docs/specs/2026-11-25-eredmeny-email-b7.md) — tulajdonosi döntés (űrlap, 2026-11-21): „Szűkítés: tartós sor külön”. A böngészős
 * TARTÓS kimenő sor (a végleges beküldések `localStorage`-sora, az induláskori ürítés, a korhatár / fülbiztosság) kapcsoló mögött áll,
 * ALAPBÓL KI. KI állásban az eredmény-beküldés a mostani módon megy (lapon belüli újrapróba), a tárolóba nem ír, induláskor nem ürít.
 * - Élesben csak a build-idejű `VITE_RESULT_OUTBOX_ENABLED=1` kapcsolja be.
 * - Az e2e-buildben (`VITE_ENABLE_RUNTIME_PROBE=1`) a böngészős teszt futás közben is bekapcsolhatja (`window.__websuliResultOutbox = true`,
 *   az oldal szkriptjei előtt). Éles buildben ez a horog nem él.
 */
export function resultOutboxEnabled(): boolean {
  if (import.meta.env.VITE_RESULT_OUTBOX_ENABLED === "1") return true;
  if (import.meta.env.VITE_ENABLE_RUNTIME_PROBE !== "1") return false;
  try { return (window as unknown as { __websuliResultOutbox?: unknown }).__websuliResultOutbox === true; } catch { return false; }
}
