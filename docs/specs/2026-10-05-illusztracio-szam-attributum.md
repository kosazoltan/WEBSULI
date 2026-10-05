# Illusztráció: érvénytelen szám-attribútum (`<rect y="+">`) — terv

## Lelet (élesen mérve, 2026-10-05)

- Lecke: `https://websuli.vip/preview/232b801b-4fdd-4eb1-a7fe-49fa038b9841` (Mezopotámia, 5. o.).
- Konzol: `Error: <rect> attribute y: Expected length, "+".`
- A hibás elem az **1. fejezet** (`lesson-section-0`) `illustration` ábrájában van (nem a 8. fejezetben):
  `<rect x="265" y="+" width="270" height="58" rx="14" fill="#ffffff" stroke="#0f172a" stroke-width="2">`
  (a „Mezopotámia” cím doboza). Ellenőrizve böngészőben, DOM-lekérdezéssel.
- Forrás: az ábratervező modell szabad SVG-je (`animKind: "illustration"`, `params.svg`). A kliens
  (`IllustrationAnim`, `client/src/lesson-runtime/blocks/explanatory-visuals.tsx`) és a szerver
  (`server/studio/visual-patch.ts`, `shared/lesson-visual-params.ts`) ugyanazt a tisztítót hívja:
  `sanitizeIllustration` (`shared/illustration-svg.ts`).

## Gyökérok

A `sanitizeIllustration` a viewBoxot szigorúan számként ellenőrzi, a geometriai attribútumok
(x, y, width, height, cx, r, …) értékét viszont nem — csak a nevük van allowlisten. Így a modell
hibás `y="+"` értéke átment a szerver kapuján, tárolódott, és a kliens változatlanul a DOM-ba írta.
A renderer nem számol y-t; a hibás érték a modell kimenetéből jön.

## Cél

1. A tisztító a számot/hosszt váró attribútumok értékét az SVG nyelvtana szerint ellenőrzi.
2. Érvénytelen értéknél az attribútumot **elhagyja** (a böngésző is az alapértékkel rajzolna — a kép
   ugyanaz marad, a konzolhiba megszűnik), és név szerint jelenti (`attrFixes`).
3. A szerver kapuja (`visualParamProblems`) új modellkimenetnél a jelentett hibát **problémaként**
   adja vissza, így a meglévő javító kör a modellel kijavíttatja — hibás rajz nem tárolódik.
4. A már publikált leckék (mint a Mezopotámia) a kliens újratisztításával hibaüzenet nélkül
   jelennek meg, adatbázis-módosítás nélkül.

## Nem-cél

- `d` és `points` útvonal-nyelvtan ellenőrzése (külön nyelvtan; most nincs mért hiba).
- A publikált lecke adatának átírása az éles DB-ben.
- A paraméteres rajzolók (bar chart stb.) módosítása — ott a y-t a kód számolja zod-sémából.

## Érintett fájlok

- `source/shared/illustration-svg.ts` — ellenőrzés + `attrFixes` mező.
- `source/shared/lesson-visual-params.ts` — kapu: `attrFixes` → probléma.
- `source/tests/illustration-svg.test.ts` — regressziós teszt (új tesztek).

## Rögzített döntések

- Ellenőrzött attribútumok és nyelvtan:
  - hossz (szám + opcionális egység `px|em|ex|%|pt|pc|cm|mm|in`): `x y x1 y1 x2 y2 cx cy r rx ry fx fy width height stroke-width font-size refX refY markerWidth markerHeight`;
    `text`/`tspan` `x y dx dy`: hosszlista (szóköz/vessző);
  - `rx`/`ry`: hossz vagy `auto`; `refX`/`refY`: hossz vagy `left|center|right|top|bottom`;
  - `font-size`: hossz vagy CSS kulcsszó (`xx-small … xx-large`, `smaller`, `larger`);
  - `offset`, `opacity`, `fill-opacity`, `stroke-opacity`, `stop-opacity`: szám vagy százalék.
- `width`/`height` a gyökéren eleve törlődik — ott nincs mit jelenteni.
- **Pontosítás (review #198):**
  - A gyökér `<svg>` elem többi ellenőrzött attribútuma (pl. `x`, `y`) is mérődik — `<svg x="+">` elmarad és jelentve
    `svg.x="+"`; csak a gyökér `width`/`height`-je kimarad a mérésből (úgyis törlődik).
  - Nem-negatív értéket váró attribútumok (SVG 2: negatív érték hiba): `width height r rx ry stroke-width markerWidth
    markerHeight font-size` — negatív érték (pl. `r="-10"`, `width="-1"`) érvénytelen: elhagyva, `attrFixes`-ben jelentve,
    így a kapu is problémának veszi. Helyzet-/eltolás-attribútumok (`x y x1 y1 x2 y2 cx cy fx fy dx dy refX refY`)
    továbbra is lehetnek negatívak.
- Idempotencia: `sanitize(sanitize(x)).svg === sanitize(x).svg`, a második körben `attrFixes` üres.

## Edge case-ek

- `y="+"`, `y=""`, `y="NaN"`, `width="auto"` → elhagyva, jelentve.
- `dy="10%"`, `x="10 20 30"` (text), `y="-1.5e2"`, `font-size="large"`, `offset="50%"` → érvényes.
- `x="10 20"` `rect`-en → érvénytelen (lista csak text/tspan esetén).
- `<svg x="+">` (gyökér) → elhagyva, `svg.x="+"` jelentve (review #198).
- `r="-10"`, `width="-1"`, `rx="-2"`, `stroke-width="-1"`, `font-size="-12"` → elhagyva, jelentve; `r="+5"`, `rx="0"` érvényes;
  `x="-5"`, `cx="-1"`, `dy="-1em"` érvényes (review #198).

## Elfogadás (EARS)

- HA a modell SVG-jében egy ellenőrzött attribútum értéke nem felel meg a nyelvtannak, AKKOR a tisztító
  kimenetéből az attribútum hiányzik, és az `attrFixes` tartalmazza `elem.attr="érték"` formában.
- HA a gyökér `<svg>` egy ellenőrzött attribútuma (a `width`/`height` kivételével) érvénytelen, VAGY egy nem-negatív
  attribútum értéke negatív, AKKOR az attribútum hiányzik a kimenetből, és az `attrFixes` jelenti (review #198).
- HA `attrFixes` nem üres, AKKOR `visualParamProblems("illustration", …)` legalább egy problémát ad.
- AMIKOR a Mezopotámia-lecke a javított klienssel (helyi build, éles API) jelenik meg, a böngésző konzoljában
  nincs `Expected length` hiba, és az 1. fejezet illusztrációja látszik.
- A teljes `npm test` és a `check` (tsc) zöld.
