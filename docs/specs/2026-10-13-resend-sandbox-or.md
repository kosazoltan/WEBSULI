# Resend sandbox-feladó őr + csendes küldési hiba jelzése — terv

## Háttér (ellenőrzött tények, 2026-10-13)
- Élesben 2026-09 óta minden e-mail bukott: a Render `RESEND_FROM_EMAIL` = `WebSuli <onboarding@resend.dev>`
  (Resend sandbox). A Resend ilyenkor csak a fiók saját címére küld, másnak 403-at ad
  („You can only send testing emails to your own email address…”).
- `server/resend.ts` `isResendConfigured()` csak azt nézte, hogy a változó nem üres → `ok: true`, így az
  Email diagnosztika panel (`client/src/components/EmailDiagnosticsPanel.tsx`) zöld „OK”-t mutatott.
- A hiba csak az `email_logs` `failed` soraiban látszott (utolsó `sent`: 2026-02-21). Az env-javítás megtörtént;
  ez a terv a visszaesés és a csendes hiba ellen szól.

## Cél
1. A sandbox-feladó (`@resend.dev` domain) „nincs megfelelően konfigurálva” állapot legyen, érthető okkal.
2. A diagnosztika panel jelezze, ha a legutóbbi küldések mind sikertelenek (bármely okból), a legutolsó hibaüzenettel.

## Nem-cél
- Nem módosítunk küldési logikát, sablont, címzett-feloldást, ütemezést.
- Nem hívjuk a Resend API-t a diagnosztikából (domain-ellenőrzés nincs; csak a feladó-domain szintaktikai vizsgálata).
- Nincs új végpont, DB-séma vagy env-változó.

## Érintett fájlok
- `source/server/lib/resend-sender.ts` (új, tiszta függvény — DB/hálózat nélkül tesztelhető)
- `source/server/resend.ts` (`isResendConfigured`, `getResendClient` használja)
- `source/client/src/components/EmailDiagnosticsPanel.tsx` (sandbox-útmutatás + „legutóbbi küldések mind sikertelenek” figyelmeztetés)
- `source/tests/resend-sender.test.ts` (új)

## Rögzített döntések
- Sandbox = a feladó cím domainje `resend.dev` vagy annak aldomainje (kis-nagybetű független).
  A feladó formái: `cím@domain` vagy `Név <cím@domain>`.
- Sandbox-feladónál `isResendConfigured()` → `ok: false`; így a meglévő őrök (feltöltés-értesítés kihagyása
  hibalogga, `/api/material-result` 503, egyedi küldés 500, heti összesítő) egyértelmű okot adnak a néma 403-as bukás helyett.
  Indok: a sandbox-feladó valódi címzettnek sosem kézbesít.
- `getResendClient()` ugyanezzel az okkal dob (a napi összesítő és a `sendAdminNotification` útja is lefedett).
- Hibás formátumú feladó (nincs `@`) → `ok: false`, ok: „RESEND_FROM_EMAIL érvénytelen”.
- Panel-figyelmeztetés: ha a `recentLogs` (a szerver `createdAt` szerint csökkenőben adja) első min(5, n) sora (n ≥ 3)
  mind `failed` → piros sáv a legutolsó hibaüzenettel. A logika a panel fájlban marad (a kliens nem importál szerveres modult).

## Edge case-ek
- `WEBSULI <noreply@websuli.vip>` → ok. `noreply@websuli.vip` → ok.
- `WebSuli <onboarding@resend.dev>`, `ONBOARDING@RESEND.DEV`, `x@mail.resend.dev` → sandbox.
- `x@notresend.dev`, `x@resend.dev.example.com` → NEM sandbox.
- `  ` / üres → a meglévő „hiányzik” ok marad.
- `WebSuli` (nincs cím) → érvénytelen.
- `recentLogs` < 3 sor → nincs figyelmeztetés; van köztük `sent` → nincs figyelmeztetés.

## Elfogadás (EARS)
- HA a `RESEND_FROM_EMAIL` domainje `resend.dev`, AKKOR `isResendConfigured()` `{ ok: false, reason }`-t ad, a reason
  tartalmazza: „resend.dev” és „websuli.vip”.
- HA a feladó hitelesített saját domainen van, AKKOR `ok: true, fromEmail`.
- AMIKOR a panel betölt és a legutóbbi ≥3 (max 5) log mind `failed`, A panel piros figyelmeztetést mutat a legutolsó hibával.
- `npm test` célzott tesztje zöld; `tsc --noEmit` 0 hiba; eslint az érintett fájlokra 0 hiba.
- Böngészős render-próba: a panel helyes állapotban jelenik meg (OK feladó, figyelmeztetés a régi hibasorokra nem
  jelenik meg, mert már vannak `sent` sorok).
