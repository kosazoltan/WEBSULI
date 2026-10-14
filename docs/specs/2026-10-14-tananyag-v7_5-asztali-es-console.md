# Tananyag v7.5 – asztali reszponzivitás és console-mentesség (terv)

**Dátum:** 2026-10-14 · **Kérte:** tulajdonos (Kósa Zoltán), chatben · **Fázis:** 1/3

## Háttér (mért hibák)

1. A kész HTML tananyagban `console.log(...)` maradt (biologia9-sejtmembran… v7, 2026-10-14). A korábbi projektszabály „console.log debug”-ot írt elő, a kapuk nem tiltották.
2. Asztali monitoron a tananyag keskeny, mobil jellegű oszlopként jelent meg (`max-width:1180px`, egyhasábos kártyák). A meglévő ellenőrzés csak a vízszintes túlcsordulást mérte, a szélesség kihasználását nem.
3. Az alkalmazás HTML-promptja (`source/server/ai/lesson-html-spec.ts`, „TECHNIKAI KÖVETELMÉNYEK”) csak `@media 480px és 1400px`-et ír elő, asztali elrendezést nem; console-tilalom nincs benne. A fail-closed kapu (`source/server/improve/verify-html.ts`) sem ellenőrzi a console-hívásokat.

## Cél

- A kiadott HTML tananyagban **0 db `console.*` és `debugger`** legyen – promptban előírva, kapuban kikényszerítve.
- **Kötelező asztali elrendezés:**
  - ≥1200 px: oldalsó tartalomjegyzék, 2 oszlopos kártya-, feladat- és kvízrács;
  - ≥1500 px: kéthasábos fejezetek;
  - ≥2000 px: 3 oszlop;
  - a fő konténer nem keskeny, a bekezdés legfeljebb 90ch.
- Újrafuttatható ellenőrző szkriptek a repóban (statikus + böngészős), és a szabályok rögzítése a skill-dokumentációban.

## Nem-cél

- Meglévő, publikált tananyagok tömeges javítása.
- A Studio JSON-runtime elrendezésének átírása.
- A betűkészlet-szerződés módosítása: az alkalmazás helyi `/fonts/lesson-fonts.css`-t használ, a standalone skill Google Fonts latin-ext-et; mindkettő megengedett marad.

## Érintett fájlok

| Fájl | Változás |
|------|----------|
| `docs/specs/tananyag-keszito-SKILL-v7_5-kiegeszites.md` | ÚJ – a v7.5 szerződés (runbook) |
| `scripts/tananyag/tananyag_verify.py` | ÚJ – statikus kapu |
| `scripts/tananyag/tananyag_browser_test.py` | ÚJ – Playwright-teszt, 320–2560 px, asztali kihasználtság |
| `scripts/tananyag/README.md` | ÚJ – használat |
| `.agents/skills/tananyag-keszito/SKILL.md` | v7.5 szakasz és hivatkozás |
| `source/server/ai/lesson-html-spec.ts` | a reszponzív sor cseréje, console-tilalom, önellenőrző pont |
| `source/server/improve/verify-html.ts` | új kapu: `console.*` és `debugger` a script-blokkokban |
| `source/tests/improve-verify-html.test.ts` | új tesztek |

## Rögzített döntések

- A console-kapu **csak a `<script>` blokkok kódját** vizsgálja, a stringek és kommentek kiürítése után. Így egy informatika-lecke `<pre>` kódpéldája vagy egy string-literál nem ad álpozitívot.
- A kapu fail-closed: a hibás kimenet nem menthető alkalmazhatóként. Ez megegyezik a meglévő `alert()` kapu viselkedésével.
- A böngésző-szkript küszöbértékei:

  | Mérés | Feltétel |
  |-------|----------|
  | panel szélessége | ≥ 85% a ≥1280 px-es viewportnak |
  | oszlopok | ≥ 2 különböző x-pozíció |
  | bekezdés-sor szélessége | ≤ 1150 px |
  | érintési célpont | ≥ 44 px |
  | console-üzenet | 0 |

## Edge case-ek

- `console` szó string-literálban vagy kommentben: elfogadott.
- `window.console && console.log(...)` vagy `if(window.console){console.log()}`: elutasított.
- `debugger;` a script-blokkban: elutasított.
- JSON adatblokk (`type="application/json"`): kimarad, a meglévő parser-logikával összhangban.

## EARS-elfogadás

1. **WHEN** a generált HTML bármely futtatható `<script>` blokkja `console.<x>(` hívást vagy `debugger` utasítást tartalmaz, **THE** `verifyImprovedHtml` **SHALL** `ok:false`-t és egy magyar nyelvű problémát adni.
2. **WHEN** a `console` szó csak string-literálban, kommentben vagy HTML-szövegben fordul elő, **THE** kapu **SHALL** nem jelezni.
3. **THE** HTML-prompt **SHALL** tartalmazni az asztali töréspont-szerződést (≥1200 / ≥1500 / ≥2000 px) és a console/debugger-tilalmat.
4. **WHEN** a `scripts/tananyag/tananyag_browser_test.py` a v7.5 szerint készült fájlon fut, **THE** szkript **SHALL** 0-val kilépni; a régi, keskeny vagy console-os fájlon **SHALL** 1-gyel.
5. **THE** `npm --prefix source test` (érintett tesztfájl) és `npm --prefix source run check` **SHALL** zöld maradni.
