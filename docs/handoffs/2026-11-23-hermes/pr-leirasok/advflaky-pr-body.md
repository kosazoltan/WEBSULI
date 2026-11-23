# Összefoglaló

Az adventi végpontok DB-integrációs tesztje („legrosszabb eset egy alanytól …”) véletlenszerűen bukott a CI-ban (main 442a9653, #522):
a rögzített `g09-math-001` néha éppen az 1. ablak egyik kérdése volt, amelyre a szerver helyesen, idempotens ismétlésként 200-at ad.
A teszt mostantól a kör által nem mutatott 9. évfolyamos kérdést küld; a mérce (409 a végleg hibás ablak új válaszára) változatlan.
Csak tesztfájl változik. Terv: `docs/specs/2026-11-18-adventi-naptar.md` (A10, A49).

## Elfogadás

- [x] A végleg hibás ablakra küldött ÚJ válasz 409 (a mérce változatlan).
- [x] A teszt nem függ a sorsolástól: a kör által nem mutatott kérdést küld.
- [x] Csak tesztfájl változik.

## Futtatott ellenőrzések

- `npm run gate:stage` → ZÖLD; `npm run gate:push` → ZÖLD (1ed1dc68)
- `npm run check:test` → 0 hiba
- `npm run gate:blind-review` → IGEN, FELTÉTELLEL (0 blokkoló, 0 közepes)
- Független ellenőr ítélete: IGEN, FELTÉTELLEL (fej: 1ed1dc68a9a2)

Nem futtatott + ok: a DB-integrációs teszt helyben NOT RUN (a CI „DB integrációs tesztek” jobja futtatja) — kockázat alacsony, csak teszt változik.

<!-- agentic-qa-kit:begin v1 -->
## Agent-PR ellenőrzőlista (kötelező AI-asszisztált PR-nál)

- [x] **CI-integritás:** a PR nem gyengít gate-et (nem törölt tesztet, nem csökkentett küszöböt, nem módosított CI-konfigot indoklás nélkül)
- [x] **Duplikáció:** nem vezet be máshol már létező utility/helper másolatot más néven
- [x] **Kritikus útvonal:** a fő kódútvonalat ember végigkövette és megértette
- [x] **Security boundary:** auth/jogosultság/input-validáció határai érintetlenek vagy szándékosan, dokumentáltan változtak
- [x] **Tesztbizonyíték:** a nem-triviális viselkedés-változásra van teszt, és a teszt valódi logikát ellenőriz (nem "paper test")
- [x] **Hatókör:** a diff csak a feladathoz tartozó fájlokat érinti; méret ~400 sor alatt (vagy indokolt)
<!-- agentic-qa-kit:end -->

🤖 Generated with [Claude Code](https://claude.com/claude-code)
