# Összefoglaló

TGM S6c-1 — ábrafajta-terv a kiszolgáló oldalon, a `STUDIO_LESSON_VARIETY` kapcsoló mögött (élesben KI). Terv:
`docs/specs/2026-11-20-tgm-valtozatossag-abrak.md` (14. szakasz, „Bontás”), végrehajtás: `docs/specs/2026-11-20-tgm-valtozatossag-abrak-vegrehajtas.md`.
Az egyben beadott S6c első vak köre 5 blokkolót talált az új ábra-megjelenítőkben; ezért két szeletre bontottuk — ez az S6c-1, a
megjelenítők (S6c-2) külön PR-ban jönnek, az öt lelet javításával.

- Tantárgyi ábra-ajánlás az ábrakészítőnek (a futásra rögzített BE állapotnál), csak az ábrakészítőnek ténylegesen elküldött
  paraméterleírásokban szereplő fajtákból; minden katalógus-tantárgy kap ajánlást.
- Jelzés (nem kapu), ha a kész lecke nem forráshoz kötött ábráinak több mint 40%-a egy fajta (legalább 5 ábránál) — a VÉGLEGES, publikált
  leckén; a telemetria (`visualKinds`) is onnan.
- A kliens és a paraméter-szerződés nem változik; KI állapotban az ábrakészítő kérése, a telemetria és a jelzések bájtra a főágé.

## Elfogadás

- [x] V23: az ajánlótábla minden katalógus-tantárgyra legalább két hirdetett fajtát ad; a promptba csak leírt fajta kerül.
- [x] V23: az ábrakészítő kérése a futás állapotát követi (KI futás BE környezetben is a régi; BE futás KI környezetben is az új).
- [x] V24: a forráshoz kötött ábra nem számít; 5 ábra alatt nincs jelzés; pontosan 40% megfelel.
- [x] A végleges mentés telemetriája és jelzése a publikált leckéből számol (motor-szintű viselkedési teszt).

## Futtatott ellenőrzések

- `npx tsx --test tests/visual-kind-plan.test.ts tests/lesson-variety-paths.test.ts` → 25/25
- `npm run gate:stage`, `npm run gate:push` → ZÖLD (ec757d9d)
- `npm run gate:blind-review`: 1. kör NEM (1 blokkoló: négy tantárgy nem kapott ajánlást — javítva, teszttel) → 2. (követő) kör IGEN, FELTÉTELLEL (0 blokkoló)
- Független ellenőr ítélete: IGEN, FELTÉTELLEL (fej: ec757d9d6f6b)

Nem futtatott + ok: valódi (fizetős) gyártás BE kapcsolóval NOT RUN — tulajdonosi jóváhagyással, az SK2 mérőszámával együtt; kockázat: a modell ajánláskövetése nem mért.

## Követő jegyek (a 2. vak kör feltételei)

- L5 (közepes): a végleges mentést mérő teszt a próbaleckén nem kap pozitív fajta-jelzést (az ábrák száma 5 alatt van) — egy ≥ 5 ábrás, 40% fölötti esettel bővítendő.
- L3 (kicsi): a prompt 40%-os mondatának nevezője (saját ábrák) egyértelműsítendő.
- S6c-2: a megjelenítők az 1. kör öt leletének javításával, külön PR-ban.

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
