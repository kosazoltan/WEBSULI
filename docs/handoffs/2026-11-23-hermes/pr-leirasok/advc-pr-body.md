# Összefoglaló

Adventi naptár 3/3 — a felület (S3 naptároldal, S4 főoldali kártya) és az élesítés előtti javítások (terv 22. szakasz). Terv:
`docs/specs/2026-11-18-adventi-naptar.md`, végrehajtás: `docs/specs/2026-11-18-adventi-naptar-vegrehajtas.md`. Előzmény: #511 (mag és
karácsonyi készlet), #523 (adatmodell és végpontok). Szeletes funkció S1–S8; a záró S5 + S6 (eredménylevél, admin-előnézet, takarító)
a következő PR.

**Az `ADVENT_CALENDAR` kapcsoló alapból KI marad** (a `render.yaml` nem változik). Kikapcsolva az útvonal és a főoldali kártya a buildben
sincs benne (lusta darab); a főoldal, a Hero, a tananyaglista és a játékok viselkedése változatlan. A bekapcsolás külön, egysoros PR a
tulajdonos előnézeti próbája után (D-11).

- **S3, naptároldal:** 24 ablak, kérdés, visszajelzés, javítás (ablakonként legfeljebb 2), összesítés a szó szerinti záró üzenettel;
  telefonos elrendezés; fókuszkezelés és Escape a párbeszédablakban.
- **S4, szezonális főoldali kártya** a Hero és a tananyagok között (telefonon legfeljebb 132 px).
- **Élesítés előtti javítások (terv 22.):** friss évfolyam az átvételnél; alanyváltáskor törlődő kliensállapot; lezárt évadban mentett
  állás; a szerver órája szerinti éjféli frissítés (fázishatárok: nov. 24., dec. 1., dec. 25., jan. 7.); átmeneti hiba nem csukja össze
  a kártyát; teljes ablaklista a válaszban; `POST /api/advent/adopt` (CSRF, idempotens); a sérült mentésre célzott üzenet.
- **Tulajdonosi döntés 2026-11-21 (terv 22.11):** ha átvétel után ismétlés nélkül nincs teljes következő kör, a hiányzó helyekre a
  legrégebben látott kérdések kerülnek.

## Elfogadás

- [x] A terv 6., 12.5, 13.8, 14.6, 16.10 és 22. szakaszának elfogadási pontjai (24/24 → szó szerinti üzenet; ablakonként legfeljebb 2 javítás; dátumhatár és éjféli frissítés a szerver órája szerint, Europe/Budapest; szezon előtti és üres naptár zárószövege).
- [x] Kikapcsolt kapcsolóval nincs útvonal, nincs kártya, a főoldal változatlan.
- [x] A névtelen haladás párosításkor átkerül (idempotens, CSRF-védett).
- [x] Telefonos elrendezés (360×640, 844×390) átfedés és levágás nélkül; fókusz és Escape a párbeszédablakban.
- Ismert korlát: a végleges képek (S3c) még nincsenek kiválasztva — a felület helyőrző rajzokat mutat.

## Futtatott ellenőrzések

- `npm run gate:stage` → ZÖLD
- `npm run gate:push` → ZÖLD (448d4c5a)
- `npm run gate:blind-review`: 1. kör NEM (2 blokkoló) → javítva → 2. kör NEM (1 blokkoló) → javítva → 3. kör IGEN, FELTÉTELLEL (0 blokkoló, `d53178ef`) → a főág beolvasztása → 4. kör IGEN, FELTÉTELLEL → a főág (benne a #538 kapujavítás) beolvasztása → 5. (követő) kör IGEN, FELTÉTELLEL
- Független ellenőr ítélete: IGEN, FELTÉTELLEL (fej: 448d4c5af940)

Nem futtatott + ok: valódi eszközös (iOS Safari) próba NOT RUN — a böngészős tesztek Chromiumon futnak; éles adatbázison semmi nem futott (a kapcsoló KI). Kockázat: a tulajdonos előnézeti próbája (S6 után) fedi.

## Követő jegyek (a 3. vak kör feltételei — a kapcsoló bekapcsolása ELŐTT, az S5 + S6 PR-ban javulnak)

- L1: egy késve érkező átvételi válasz visszafestheti a már megoldott ablakot.
- L2: az „Újra” nem küldi újra a kész vendégeredmény átvételét.
- L3 (kicsi): átmeneti hibánál elvész a főoldalról indított ablaknyitás szándéka.
- L4: a sorőr átengedi a kirajzolhatatlan ablakrácsot (sérült mentés).

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
