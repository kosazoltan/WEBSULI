# Összefoglaló

Eredmény-e-mail bontás, B1b (a #510 bontásának 2. szelete; terv: `docs/specs/2026-11-22-eredmeny-email-bontas.md`, végrehajtás:
`docs/specs/2026-11-22-eredmeny-email-bontas-vegrehajtas.md` 1b. pont). Előzmény: B1a (#532) — a szerver a két mezőt opcionálisként már
fogadja, és élesben fut.

- A kliens a végleges beküldésben elküldi a kör kezdetét (`startedAt`, mindkét fajtánál) és — kvíznél — az utolsó válasz idejét
  (`lastAnsweredAt`); a levél így mutatja a kör kezdetét.
- A LE NEM ZÁRT kör, amelynek az utolsó válasza 7 napnál régebbi, utólag nem megy el. A korhatár az utolsó VÁLASZHOZ mér: a régen
  megnyitott, de ma megválaszolt kör elmegy.
- A régi kliens által tárolt körben nincs válaszidő: ennek a kora ismeretlen, nem minősül elavultnak (a korábbi küldési viselkedés marad).
- A körazonosító és a „már elküldve” jelző változatlan; a lezárt kör mindig megy.

## Elfogadás

- [x] A törzs megfelel a szerver szigorú sémájának (kvíz: mindkét mező; feladat: csak a kezdés) — böngészős próbában a sémával ellenőrizve.
- [x] 8 nappal az utolsó válasz után az elküldetlen, le nem zárt kör nem megy el (a kérés el sem indul); 6 nap után elmegy.
- [x] 8 napja megnyitott, de ma megválaszolt kör elmegy.
- [x] A régi formátumú (válaszidő nélküli) tárolt kör 8 nap múlva is elmegy, a `lastAnsweredAt` mező nélkül.
- [x] A meglévő viselkedés (egyszeri küldés, lezárás utáni nem-ismétlés, kihagyott kérdés −1) változatlan — a régi böngészős esetek zöldek.

## Futtatott ellenőrzések

- `npx tsx --test tests/result-report-complete.test.ts` → 5/5
- `node --import tsx scripts/run-e2e-tests.ts --workers=1 tests/lesson-result-email-quiz.spec.ts` → 6 passed
- `npm run gate:stage`, `npm run gate:push` → ZÖLD (75afa37f)
- `npm run gate:blind-review`: 1. kör NEM (1 blokkoló: a válaszidő nélküli régi kör a kezdés miatt elavultnak számított — javítva, böngészős esettel) → 2. (követő) kör IGEN, FELTÉTELLEL (0 blokkoló)
- Független ellenőr ítélete: IGEN, FELTÉTELLEL (fej: 75afa37f0f59)

Nem futtatott + ok: éles beküldés valódi levéllel NOT RUN — a böngészős próba csonkolt végponttal fut; a szerveroldal (B1a) változatlan és élesben működik. Kockázat: alacsony.

## Követő jegyek (a 2. vak kör feltételei)

- L2 (meglévő viselkedés): a korhatár a beküldés indítása előtt fut, nem minden újrapróba előtt — a B2 (hálózati réteg) szeletben.
- Egy elavult megjegyzés pontosítása a beküldőben (a 2. kör kis lelete).

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
