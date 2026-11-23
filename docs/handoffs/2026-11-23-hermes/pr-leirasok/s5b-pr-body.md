# Összefoglaló

TGM S5b — változatos leckenyitás, a `STUDIO_LESSON_VARIETY` kapcsoló mögött (élesben KI). Terv: `docs/specs/2026-11-20-tgm-valtozatossag-abrak.md`
(11. szakasz), végrehajtás: `docs/specs/2026-11-20-tgm-valtozatossag-abrak-vegrehajtas.md`. Az S5a (#530) folytatása.

- A nyitás formáját és a hős nevét a kód osztja ki determinisztikusan (a térkép magjából); a kiosztott forma a lecke jelölőjében tárolódik,
  a lejátszó a nyitóblokk fejlécét ebből adja (közbeillesztett ábra után is).
- A gyakorlóbank módszersorrendje magból keveredik; pontosan két kapukérdés marad.
- A futás olvasói a futásra rögzített állapotot látják (nem a környezetet); a javítás megőrzi a nyitásformát, évfolyamváltásnál az új évfolyam formáját viszi.
- KI állapotban a gyártás kérései és a megjelenítés bájtra a főágé.

## Elfogadás

- [x] V8: mag nélkül a bankterv és a prompt bájtra a régi (rögzített példák).
- [x] V9: BE állapotban a prompt egyetlen nyitásformát és hosszt ír elő (nincs régi meseforma, nincs „5. mondat”).
- [x] V10: 50 magon mind a tíz módszerfajta megmarad, pontosan két kapukérdés (1–12 csomag), az első módszer legalább 6-féle.
- [x] V11: a nyitóblokk a kiosztott forma fejlécét kapja — ábra közbeillesztése után is; jelöletlen leckén a régi szabály.
- [x] A jelölő (verzió + nyitásforma) mentés, javítás és alkalmazás során megmarad; a modell jelölője nem megy át.

## Futtatott ellenőrzések

- `npx tsx --test` (lesson-variety-paths, lesson-opening-forms, lesson-bank-plan-seed, lesson-feedback-openers, lesson-fusion-repair, source-visuals-flag) → 55/55
- `npx playwright test -c playwright.lesson-variety.config.ts` → 12 passed
- `npx tsc -p . --noEmit`, `npm run check:test` → 0 hiba; `npm run gate:stage`, `npm run gate:push` → ZÖLD (dd124c7d)
- `npm run gate:blind-review`: 1. kör NEM (1 blokkoló, 3 közepes — mind javítva, teszttel) → 2. kör IGEN, FELTÉTELLEL (0 blokkoló) → review #534 hat lelete javítva → 3. (követő) kör IGEN, FELTÉTELLEL (0 blokkoló)
- Független ellenőr ítélete: IGEN, FELTÉTELLEL (fej: dd124c7d6340)

Nem futtatott + ok: valódi (fizetős) gyártás BE kapcsolóval NOT RUN — tulajdonosi jóváhagyással, az SK2 mérőszámával együtt; kockázat: a modell formakövetése nem mért.

## Követő jegyek (a 3. vak kör feltételei)

- L8: folytatáskor / javításkor a mentett formaazonosítóhoz a lektor az évfolyam csoportjának leírását kapja (azonos azonosító több korcsoportban) — javítás az S6a szeletben, teszttel.
- L6: kikapcsolt nyitókapcsoló (`STUDIO_LESSON_OPENER`) mellett az évfolyamváltó javítás ne írjon ki nem küldött nyitásformát a jelölőbe.
- L7: régi (v1) jelölőjű lecke javításakor a lektor mondatszám-szabálya kövesse a szerző tényleges nyitásszerződését.
- L9: kész bankkal folytatott (a lektornál megszakadt) BE futásra a kapuszám- és sorrendszabály nem fut újra — döntés: maradjon-e az átvétel.
- L5: a terv V12 pontja a tárolt állapotot nevezze meg (dokumentáció).

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
