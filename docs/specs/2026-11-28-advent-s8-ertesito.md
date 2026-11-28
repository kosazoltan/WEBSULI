# S8 — adventi értesítő levél (élesítési terv)

Állapot: tulajdonosi döntés 2026-11-28 (űrlap): „előbb mutasd meg a címzettek számát és a levél szövegét, csak utána küldd”.
Alapterv: `docs/specs/2026-11-18-adventi-naptar-vegrehajtas.md` S8 + Kiegészítés 4 (szűkítés) és 5 (HMAC). Végrehajtás:
`docs/specs/2026-11-28-advent-s8-ertesito-vegrehajtas.md`.

- Címzettek: csak `email_subscriptions` (aktív) és `extra_email_addresses` (aktív); `player_accounts` és `users` soha.
- Száraz futás: darabszám forrásonként + tárgy + HTML, e-mail-cím nélkül; nem ír, nem küld.
- Éles küldés: a száraz futás darabszáma (`confirmCount`) kell, eltérésnél 409; címzettenként foglalás az `advent_announcements`-ben
  (HMAC-SHA-256 lenyomat), idempotencia-kulcs, sorban, szünettel (kéréskorlát); kétszeri küldés nem dupláz, a hibás és a megszakadt (15 perc–23 óra közötti függő) sor újrapróbálható.
- Az éles küldést a tulajdonos indítja az admin „Email diagnosztika” lapjának adventi paneljéről; az ügynök nem küld.
- Tesztben és e2e-módban valódi levél nem mehet ki (beállított hamis küldő nélkül a küldő hibát dob).
