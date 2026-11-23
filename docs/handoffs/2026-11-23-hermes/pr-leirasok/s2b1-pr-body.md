# Összefoglaló

TGM S2b-1 — két új megjelenítő a forrás ábráihoz: elágazó **döntési fa** és **képes kártyák**, a `STUDIO_SOURCE_VISUALS` kapcsoló mögött
(élesben KI). Terv: `docs/specs/2026-11-22-tgm-s2b1-dontesi-fa-kepes-kartya.md`, végrehajtás:
`docs/specs/2026-11-22-tgm-s2b1-dontesi-fa-kepes-kartya-vegrehajtas.md`.

- Döntési fa: kis fa (egy szint, legfeljebb 4 ág) 640 px fölött vízszintes, minden más fa behúzott lista minden szélességen.
- Képes kártyák: a meglévő illusztráció-tisztítón átment SVG; a rajzok azonosítói kártyánként névterezve (a tisztító DOM-ján, csak attribútumokon).
- KI állapotban a gyártás kérései és a meglévő leckék megjelenítése változatlan; a régi leckék olvashatók.

## Elfogadás

- [x] V29: a két fajta a sémában és a szigorú paraméter-sémában; határok (3 szint, 13 csomópont, 2–8 kártya) pontos tesztekkel.
- [x] V30–V31: a fedettségi kapu a két fajtát megjelentnek méri; DOM-teszt.
- [x] V32: böngészős próba 360×640, 844×390, 1280×800 nézetben — nincs levágott szöveg, nincs vízszintes görgetés; a 13 csomópontos fa is.
- [x] Két kártya azonos helyi SVG-azonosítója nem ütközik; a rajz felirata érintetlen.
- Ismert korlát (nem része ennek a PR-nak): a képes kártya SVG-rajzán BELÜLI, a modell által rajzolt felirat kilóghat a rajzból — ezt a PR nem ellenőrzi (tulajdonosi döntés 2026-11-23: külön szelet, böngészőben mért `getBBox` alapon). A V32 a megjelenítő saját szövegeire vonatkozik.
- Jegyre menő kis leletek a záró vak körből: a papírháttér DOM-azonosítója többrajzos kártyán ismétlődik (látható hiba nem mérve); egy új teszt a gyártási kaput nem közvetlenül futtatja.

## Futtatott ellenőrzések

- `npx tsx --test tests/lesson-tree-cards.test.ts` → 8/8
- `npx playwright test -c playwright.source-visuals.config.ts -g "döntési fa"` → 3 passed (a képernyőképet megnéztem)
- `npx tsc -p . --noEmit`, `npm run check:test` → 0 hiba; `npm run gate:stage`, `npm run gate:push` → ZÖLD (dd4e8ba7)
- `npm run gate:blind-review` 3 kör: NEM (2 blokkoló) → NEM (2 blokkoló, a javításból) → IGEN, FELTÉTELLEL (0 blokkoló, 0 közepes)
- Független ellenőr ítélete: IGEN, FELTÉTELLEL (fej: 617825a2163b)

Nem futtatott + ok: a vezetővonal kontrasztarányának mérése NOT RUN (a szín sötétebb lett, de számszerűen nem mértem) — kockázat alacsony, a kapcsoló élesben KI; valódi gyártásból származó fa / kártya NOT RUN (fizetős próba, tulajdonosi jóváhagyással).

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
