# Websuli Design — az öt évfolyamsávos arculat a tananyag-megjelenítésben — terv

Tulajdonosi kérés (2026-10-16): a mellékelt design-csomagot kell a WEBSULI rendszerébe bevezetni, és „ezentúl ezek szerint
készüljenek el a tananyagok”. A leírás utasításait kell követni, nem saját design-jellemzőket.

A csomag a repóban:
- `docs/design/Websuli_Design_AI_Implementacios_Utasitas.md` — a mesterutasítás;
- `docs/design/Websuli_Design.html` — a vizuális referencia.

## Tulajdonosi döntések (2026-10-16)
1. **Hatókör:** a tananyag-megjelenítés, vagyis a lecke-lejátszó (Tananyag / Módszerek / Feladatok / Kvíz). A tanulói keret
   (kezdőlap, irányítópult) most nem.
2. **Az öt arculat kiváltja a régi színrendszert.** A színvilágot kizárólag az évfolyamsáv adja. Megszűnik:
   - a 15 véletlen élménytéma;
   - a 9 „vizuális világ”, köztük a nemi alapú `princess` (a „rózsaszín / kislánynak” kérés);
   - a díszítőeffekt (flair).

   A régi leckék is az új arculattal jelennek meg.
3. **Fontok:** önhostolt Inter (6–12.) és Nunito Sans (1–5.), a hivatalos Google Fonts-repóból (OFL), latin-ext és
   ő/ű/Ő/Ű-ellenőrzéssel.
4. **Memóriakártya és ismétlés-ütemezés** valódi mentéssel: külön szelet volt (nem része ennek a tervnek) — azóta kész (C szelet, 7e1ca668).

## A leírás kötelező elemei → megvalósítás
| Leírás | Megvalósítás |
|---|---|
| Öt téma: `explorer` 1–2, `adventure` 3–5, `studio` 6–8, `laboratory` 9–10, `future` 11–12; alapfelület, főszín, mély szöveg (táblázat, §1) | `shared/lesson-design.ts` — a táblázat értékei változatlanul. A lecke évfolyama választ (`designThemeForClassroom`). A 0. évfolyam (programozás alapjai) `studio`, mint a korábbi 7–8-as csoport. |
| Egy közös komponensrendszer, CSS-változókkal (§5) | A meglévő `--lesson-*` tokeneket a téma állítja (`[data-ws-theme]`). A komponensek nem duplikálódnak. |
| WCAG 2.2 AA, 4,5:1 normál szöveg, 3:1 grafika; „a kezdeti hexszínek vizuális irányok, éles szövegpárokra kontrasztteszt” (§2.6) | A főszín marad kitöltésnek, sávnak, keretnek. Ahol fehér szöveg nem éri el a 4,5:1-et a főszínen (mért: kalandok 3,88; jövőtervező 3,75), mért gomb- és szövegváltozat kell. Egységteszt minden szövegpárra. |
| Törzsszöveg: 1–2. o. 20–24px, 3–5. o. 18–20px, egyébként ≥ 16px; nincs 10–12px-es tananyagszöveg (§2.5, §8) | Témánként `--grade-size`: 22 / 19 / 17 / 16 / 16 px. A kiegészítő feliratok legalább 13px-esek. |
| Inter (6–12.), Nunito Sans (1–5.), önhostolt WOFF2, ő/ű tényleges fedettség, Noto Sans és rendszerfont tartalék (§2.3–4, §4) | `scripts/prepare-lesson-fonts.py` két új családdal (rögzített revízió, cmap-ellenőrzés, manifest). `lessonFontPair` szerint: 1–5. o. Nunito Sans, 0. és 6–12. o. Inter. |
| `prefers-reduced-motion`, nincs kötelező animáció (§2.7) | A meglévő mozgáskapu marad. A díszítőeffektek (flair, csillogás) megszűnnek. |
| Unisex, nincs nemi sztereotípia (§1) | A `designFromInstruction` nem választ világot nemi szavakból. A megjelenítés nem használ világot. |
| Vizuális hierarchia: a HTML élő előnézete (felső sáv, címsor, fehér csempék, főszínű gomb, másodlagos gomb, haladássáv, témakör-chipek) | A lecke felső sávja: „✦ Websuli / <téma neve>”. A leckeoldal a referencia élő előnézetének szerkezetét követi; a 11–12. o. sötét, kontrasztos panelekkel (§8). |
| Fókusz: 3px látható keret (§4 css) | `:focus-visible` 3px `#f4ab37`, a referencia szerint. |
| Ellenőrzés: Playwright mind az öt témában, 390 / 768 / 1440 px képernyőképekkel (§9.9) | Új e2e spec (lent). |

## Nem-cél
- A tanulói keret (AppShell, irányítópult, tantárgykártyák).
- A memóriakártya és az ismétlés-ütemezés: külön szelet (azóta kész, 7e1ca668).
- A gyártás promptjai.
- A régi, saját HTML-dizájnú anyagok (`html_files` `contentType: html`) átfestése. Ezek az új fontokat kapják (a
  `withLessonTypography` a `lessonFontPair`-t használja), a saját elrendezésük marad.

## Szélső esetek
- **Régi lecke ismeretlen vagy régi témával:** a megjelenítés nem a témából dolgozik, ezért nincs hiba. A séma a régi
  értékeket továbbra is elfogadja.
- **11–12. o. sötét téma:** sötét háttéren világos szöveg, a panelek is sötétek, mindegyik szövegpár mérve.
- **Csendes nézet:** a mozgás és az áttűnés kikapcsol, a színek tompulnak, a téma marad.
- **Programozás alapjai (0. o.):** `studio`, Inter.
- **Font nem töltődik be:** Noto Sans, majd rendszerfont, sans-serif tartalék.

## Elfogadás (EARS)
- HA a lecke évfolyama 1–2 / 3–5 / 6–8 / 9–10 / 11–12, AKKOR a gyökér `data-ws-theme` értéke
  `explorer` / `adventure` / `studio` / `laboratory` / `future`, és a főszín a táblázat értéke.
- Minden téma minden szöveg/háttér token-párja ≥ 4,5:1 (egységteszt a CSS-ből és a TS-tokenekből).
- A törzsszöveg számított mérete témánként ≥ a minimum (böngészős mérés).
- A Nunito Sans és az Inter WOFF2 a manifest szerint betöltődik, Google- vagy CDN-kérés nélkül. Az `Árvíztűrő tükörfúrógép`
  és az ő/ű/Ő/Ű látszik.
- 390, 768 és 1440 px-en nincs vízszintes kilógás, mind az öt témában.
- A „rózsaszín, kislánynak” kérés nem választ világot.
