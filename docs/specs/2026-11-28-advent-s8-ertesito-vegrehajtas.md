# S8 végrehajtás — adventi értesítő levél

Terv: `docs/specs/2026-11-28-advent-s8-ertesito.md`. Ág: `feat/advent-s8-ertesito`.

1. `shared/advent/announce-email.ts` — tárgy + HTML (tiszta), a gomb a `/adventi-naptar` címre.
2. `server/advent/announce.ts` — `collectAnnounceRecipients`, `announceRecipientHash`, `announceAdvent` (injektált DB / küldő / titok).
3. `server/advent/announce-sender.ts` — valódi küldő (`sendAdminNotification`, csendes napló, idempotencia-kulcs); teszt / e2e: tiltva.
4. `server/routes.ts` — `POST /api/admin/advent/announce` (`isAuthenticatedAdmin`, globális CSRF; naplóba csak darabszám).
5. `client/src/components/AdventAnnouncePanel.tsx` + bekötés az admin „email-debug” lapjára.
6. Tesztek: `tests/advent-announce.test.ts` (sablon, A39, A37, A38, hibás sor, titok, küldőtiltás), `tests/advent-announce-db.integration.ts`
   (valódi foglaló SQL), `tests/admin-route-guard.test.ts` (a végpont admin-őr mögött).

| Parancs | Várt kimenet |
|---|---|
| `node --import tsx --test tests/advent-announce.test.ts tests/admin-route-guard.test.ts tests/no-real-emails-guard.test.ts` | `fail 0` |
| `npm.cmd run test:learning-db` | `fail 0` |
