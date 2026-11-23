# Összefoglaló

A PR-kapu (`gate:pr`) böngészős lépése a változott komponens nevét eddig RÉSZSZÓKÉNT kereste a tesztekben. Az adventi PR-C
`client/src/advent/sync.ts` fájlja miatt ez mind a 83 `tests/*.spec.ts` fájlt kiválasztotta (az `async` szó része), egy szálon; a futás
a 60 perces kereten elbukott, a kapu azon az ágon nem lehetett zöld. Terv: `docs/specs/2026-11-23-kapu-spec-valasztas-szohatar.md`,
végrehajtás: `docs/specs/2026-11-23-kapu-spec-valasztas-szohatar-vegrehajtas.md`.

- Új `mentionsStem(text, stem)`: a tő csak önálló azonosítóként egyezik (előtte / utána nem betű vagy számjegy, Unicode szerint; a kötőjel és az aláhúzás elválasztó); a tő
  szó szerint értendő.
- A `pickE2eSpecs` nem-játék ága ezt használja; a játék-ág, a változott spec-fájlok kötelező futtatása és a figyelmeztetés változatlan.

## Elfogadás

- [x] K1: részszó nem egyezik (`async` ≠ `sync`, `StudioPanelHeader` ≠ `StudioPanel`, `ésync` ≠ `sync`).
- [x] K2: önálló azonosító egyezik (útvonal vége, idézőjel, `getByTestId("…")`), és a csak képfájlnévben / próbaútvonalban említett modul is (`home-views-*.png`, `/__admin-tabs-probe`) — a VALÓDI spec-fájlokon tesztelve.
- [x] K3: a változott spec-fájl mindig fut; a játék-ág tesztjei változatlanul zöldek.
- [x] K4: az adventi PR-C változott fájllistájára a főág tesztjein 83 → 27 kiválasztott teszt.

## Futtatott ellenőrzések

- `node --test scripts/qa/gates/pre-pr-gate.test.mjs` → 9/9
- K4 mérés (a `pickE2eSpecs` futtatása a `feat/advent-c-felulet-es-elesites` változott fájllistájára) → régi szabály 83, új szabály 27
- `npm run gate:stage`, `npm run gate:push` → ZÖLD (e4136b2f)
- `npm run gate:blind-review`: 1. kör NEM (1 blokkoló: a kötőjeles határ három valós próbát kihagyott — javítva, a valódi spec-fájlokon tesztelve) → 2. kör IGEN, FELTÉTELLEL → a főág beolvasztása (C-61) → 3. (követő) kör IGEN, FELTÉTELLEL
- Független ellenőr ítélete: IGEN, FELTÉTELLEL (fej: e4136b2f4e26)

Nem futtatott + ok: az adventi PR-kapu teljes újrafuttatása ezzel a javítással NOT RUN — a beolvadás után, az adventi ágon fut (ott a javítás a főágból érkezik); kockázat: a 27 teszt futásideje nem mért.

## Követő jegyek (a 2. vak kör feltételei)

- L3 (kicsi): a határ a `\p{N}` miatt a számjegyen kívüli Unicode-számjeleket (pl. törtjel, római szám-jel) is az azonosító részének veszi.
- L4 (kicsi): a valódi spec-eket olvasó teszt a fájlnevet URL-ként értelmezi (különleges karakteres fájlnévnél hibás lenne).
- A `run-e2e-tests.ts` belső 60 perces kerete rövidebb a PR-kapu külső 90 perces kereténél (külön javítás).

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
