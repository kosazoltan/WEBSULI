# Összefoglaló

TGM S6b — több kézzelfogható feladat és változatosabb szerzői hang, a `STUDIO_LESSON_VARIETY` kapcsoló mögött (élesben KI). Terv:
`docs/specs/2026-11-20-tgm-valtozatossag-abrak.md` (13. szakasz), végrehajtás: `docs/specs/2026-11-20-tgm-valtozatossag-abrak-vegrehajtas.md`.
Az S6a (#536) folytatása.

- A fogalom-fejezetek legalább harmada `try` blokkot kap (`planSections`): a fajta a fejezet típusából, `any`-nél a magból forgatva.
- A pótlás az S6a szabályait a VÉGLEGES sorokon megtartja (nincs azonos szomszéd, egy sor ≤ 40%).
- A kiosztott `try`-fajta a mentett tervben és a szerzői kérésben is szerepel (a beszélgetésben csak a modell eredeti terve áll).
- A kész lecke `try`-aránya jelzésként a telemetriába kerül (nem kapu); a szerző sávonként a magból választott leírt hangot kap.
- KI állapotban a terv, a szerzői kérés és a telemetria bájtra a főágé.

## Elfogadás

- [x] V17: 3…12 fejezetre a `try`-t tartalmazó fejezetek aránya ≥ 1/3, a fajta a típushoz illik, két egymást követő `try` nem azonos fajtájú (`any`).
- [x] V18: BE-nél a `tryShare` a telemetriában, 1/3 alatt minőségi jelzés (megállás nélkül).
- [x] V19: a hangkiosztás determinisztikus, 50 magon sávonként ≥ 2 hang; KI-nél a szerző-prompt bájtra a régi.
- [x] V20: a szimuláció küszöbei a `try`-beszúrással is teljesülnek.
- [x] A motorban (viselkedési teszt): a kiosztott sor és `try`-fajta a mentett tervben és a szerzői kérésben.

## Futtatott ellenőrzések

- `npx tsx --test tests/lesson-section-shapes.test.ts tests/lesson-try-voices.test.ts tests/lesson-variety-paths.test.ts` → 44/44
- `node --import tsx scripts/measure/shape-simulation.mts` → leggyakoribb minta 0,173 (< 0,35), azonos minta 0,129 (< 0,20)
- `npm run gate:stage`, `npm run gate:push` → ZÖLD (16824ffe)
- `npm run gate:blind-review`: 1. kör NEM (3 blokkoló: a mentett try-fajta elveszett folytatáskor; téves jelzés pontosan 1/3-nál; a forgatás ismételhetett — mind javítva, teszttel) → 2. (követő) kör IGEN, FELTÉTELLEL (0 blokkoló, 0 közepes; gyorsítótár-találat 92,6%)
- Független ellenőr ítélete: IGEN, FELTÉTELLEL (fej: 16824ffe47e6)

Nem futtatott + ok: valódi (fizetős) gyártás BE kapcsolóval NOT RUN — tulajdonosi jóváhagyással, az SK2 mérőszámával együtt; kockázat: a modell követése (try-fajta, hang) nem mért.

## Követő jegyek (a 2. vak kör feltétele)

- A végleges (publikált) leckén mért `tryShare` és a `try_share_low` jelzés cseréje motor-szintű viselkedési teszttel (most a segédfüggvény egységtesztje és szerkezeti őr fedi).
- A promptok gyorsítótárazott közös előtagja nem változott: a kiosztott sor és a try-fajta a szerzői kérés végén áll.

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
