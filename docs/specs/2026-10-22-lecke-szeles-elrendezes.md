# Stúdió-lecke: a kijelzőt kitöltő reszponzív elrendezés (7.5-ös skill szerint)

**Tulajdonosi kérés (2026-10-22, képernyőkép: 5. osztály Történelem — Görögország, asztali böngésző):** „A responsivitás nem megfelelő…
asztali gépeken, monitorokon nem tölti ki megfelelően a teret. Nagyon keskeny a tananyag. A 7.5-ös skillben benne volt…, hogy a
megjelenítéseket teljes mértékben keskeny telefonhoz, szétnyitható Honor Magic V6-hoz, táblagépekhez, asztali monitorokhoz, laptopokhoz,
nagyfelbontású kijelzőkhöz [kell igazítani]… ne torzítsd, hanem programozd le úgy, hogy kitöltse minden megjelenítő képernyőt optimális
mértékben a tananyag szövege, ábrái… Ne küldd keresztül a teljes tananyaggyártáson…, kívülről javítsd… kisebb, olcsóbb alügynökökkel.”

## Gyökérok (kód)
- `source/client/src/lesson-runtime/LessonRuntime.tsx:515` — `<article className="max-w-3xl mx-auto …">` (768 px);
- `source/client/src/lesson-runtime/lesson-experience.css:17` — `[data-experience] > article { max-width: 840px; }`.
→ Minden Stúdió-lecke minden kijelzőn legfeljebb 840 CSS-px széles; 1920 px-en a képernyő ~56%-a üres.

## Cél — a 7.5-ös skill „ASZTALI RESZPONZIVITÁS” táblája a lejátszó szelektoraira
| Szélesség | Elrendezés |
|---|---|
| ≤ 520 px | változatlan (egyhasábos, a mostani mobilszabályok). |
| 521–1199 px | egyhasábos; a konténer a nézet szélességét követi (oldalmargó `clamp(16px,2.6vw,72px)`), a rácsok `auto-fit`. |
| ≥ 1200 px | **Tananyag:** bal oldalon sticky fejezetlista (220–300 px), jobbra a fejezet; a fejezet blokkjai 2 oszlopos rácsban, a széles blokkok (ábra / animáció / gyakorlat / összefoglaló / fejezetcím) teljes szélességűek. **Módszerek, Feladatok:** 2 oszlop. |
| ≥ 1500 px | a fejezet magyarázó szövegei 2 hasábban folyhatnak (`column-count`), bekezdés nem törik ketté; címsor, ábra, rács, összefoglaló `column-span: all`. |
| ≥ 2000 px | Módszerek, Feladatok: 3 oszlop. |

**Fix szabályok:** konténer `max-width: 2400px`; bekezdés `max-width: 90ch`; ábra / SVG / animáció legfeljebb 920 px széles,
arányosan (nincs torzítás: `height:auto`, `aspect-ratio` megmarad); grid gyermek `min-width:0`; nincs vízszintes kilógás.
A kvíz egy-kérdéses köre olvasható szélességű marad (max. ~900 px, középre).

## Nem-cél
A leckék tartalma / újragyártása; a régi HTML-anyagok (`websuli-html-lesson`) elrendezése; a 6 témás színvilág.

## Eszközmátrix (valódi render, `tests/lesson-responsive.spec.ts` bővítve)
360×740, 390×844, Magic V6 külső 393×780, Magic V6 belső 835×810 és fekvő 904×740, 768×1024, 1024×768, 1366×768, 1440×900,
1920×1080, 2560×1440. Ellenőrzés: nincs vízszintes kilógás; a tartalom szélessége ≥ 1200 px-en a nézet ≥ 80%-a (max. 2400 px);
a fejezetlista ≥ 1200 px-en látható és sticky; a bekezdés ≤ 90ch; az ábra ≤ 920 px és arányos; képernyőkép minden méretről.

## Elfogadás (EARS)
- HA a nézet ≥ 1200 px, AKKOR a lecke tartalma a nézet szélességének legalább 80%-át kitölti (legfeljebb 2400 px), a Tananyag fülön sticky fejezetlista látszik.
- HA a nézet ≤ 520 px, AKKOR az elrendezés a mostanival azonos (a meglévő mobil tesztek zöldek).
- MINDEN mátrixméreten nincs vízszintes kilógás, a szöveg és az ábra nem torzul.
