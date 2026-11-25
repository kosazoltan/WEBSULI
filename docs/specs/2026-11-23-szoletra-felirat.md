# Szólétra feliratok — tárgyrag és telefonos olvashatóság (terv)

**Dátum:** 2026-11-23 · **Feladat:** P-011 · **Ág:** `fix/szoletra-felirat-targyrag` (az `origin/main` `8b26289e` fejéről)
**Előzmény:** [`2026-11-17-szoletra-olvashatosag.md`](2026-11-17-szoletra-olvashatosag.md) (#498),
[`2026-11-18-szoletra-kovetes.md`](2026-11-18-szoletra-kovetes.md) (#500).
**Végrehajtás:** [`2026-11-23-szoletra-felirat-vegrehajtas.md`](2026-11-23-szoletra-felirat-vegrehajtas.md)

## Kiinduló állapot (mérve az `origin/main`-en)

1. **Tárgyrag:** `WordLadderHuEn.tsx` két mondata a rivális nevéhez nyers `t` betűt ragaszt: `Megelőzted ${RIVAL_NAME}t! 🎉`
   (előzés-felirat) és `🏁 Elérted a csúcsot! Legyőzted ${RIVAL_NAME}t!` (győzelmi cím). A jelenlegi névvel ez „Villámt” —
   helyesen „Villámot”. Más névvel (pl. „Kő” → „Követ”, „Ödön” → „Ödönt”, „Bence” → „Bencét”) a sablon szintén hibás.
2. **Text-shadow:** a fogás-felirat (`.wl-hold-label`, `text-shadow: 0 1px 2px #0009`) és a verseny-sor
   (`.wl-race-text`, `text-shadow: 0 1px 2px #000a`) árnyékkal próbál kontrasztot adni; telefonon (kis betű, nagy pixelsűrűség)
   ez maszatos szélt ad, a valódi kontraszt pedig a világos fa-szín mellett kevés (fehér a `#c08a5a`-n ≈ 2,8 : 1).
3. **Azonos szín:** a verseny-sor címkéi („Te”, „Villám”) és az állás-szöveg („Fej fej mellett!”, „+2 fok előnyöd van”)
   ugyanazzal a `#f8fafc` színnel jelennek meg — a címke és az érték nem válik el.

## Cél

- C1: a két mondat minden rivális-névre helyes legyen. **Döntés:** átfogalmazás, hogy a változóhoz ne kerüljön rag
  (a magyar tárgyrag a hangrendtől, az utolsó hangtól és szótőváltozástól függ — „Kő → követ”, „Villám → Villámot” —, ezt egy
  név-függő szabály csak hiányosan tudná). Új mondatok: előzés: `Előzés! ${név} most mögötted van! 🎉`; győzelem:
  `🏁 Elérted a csúcsot ${név} előtt!`. A többi név-mondat (`${név} előzött — kapaszkodj utána!`, `${név} most gyorsabb volt —
  a visszavágóban utolérheted!`, `${név} N fokkal előtted`, `… a 🏁 zászlóig ${név} előtt!`) eleve rag nélküli — maradnak.
  A mondatok tiszta függvényekből jönnek (`source/client/src/lib/wordLadder/captions.ts`), névparaméterrel tesztelhetők.
- C2: a fogás-felirat és a verseny-sor árnyék nélkül, valódi kontraszttal (≥ 4,5 : 1) olvasható: sötétebb fa-színátmenet a
  fogáson (a jó/rossz állapotban is), tömör sötét háttér a verseny-soron.
- C3: a verseny-sor címkéi a saját pöttyük (világosított) színét kapják, az állás-szöveg eltérő színű.

## Nem cél

A 3D kapaszkodó-lapok (≥ 600 px széles nézet) textúrája; a közös `InlineQuestion` / `ResultScreen`; más játék.

## Elfogadás (EARS)

<!-- acceptance-checklist -->
- [ ] E1 WHEN a játékos megelőzi a rivális VAGY megnyeri a menetet THEN the system SHALL a felirat-mondatot úgy adni, hogy
  a rivális neve után közvetlenül ne álljon betű (rag), bármely névre (egységteszt több névvel: Villám, Kő, Ödön, Bence,
  Zsófi, Rex, Anna, Tűz; forrás-őr: a lapon nincs `${RIVAL_NAME}<betű>` sablon).
- [ ] E2 WHEN telefonos nézetben (360×640, 390×844) kérdés van nyitva THEN the system SHALL a fogás-feliratot és a
  verseny-sort `text-shadow` nélkül, ≥ 4,5 : 1 kontraszttal rajzolni (fogás: a színátmenet minden színpontjához mérve,
  alap- és jó-állapotban; verseny-sor: a saját hátteréhez) — e2e.
- [ ] E3 WHEN a verseny-sor látszik THEN the system SHALL a címkéket („Te”, rivális) az állás-szövegtől eltérő színnel
  rajzolni — e2e.
- [ ] E4 WHEN a menet győzelemmel / vereséggel ér véget telefonos nézetben THEN the system SHALL a cím- és eredmény-sort a
  helyes mondattal mutatni; képernyőkép a kérdés-kártyáról, a verseny-sorról és a győzelmi lapról a teszt kimeneti mappájába.

## Kockázat

Alacsony: csak felirat-szöveg és stílus. A meglévő e2e-k (`word-ladder-play.spec.ts`, `word-ladder-readability.spec.ts`)
nem hivatkoznak a régi mondatokra (grep-pel ellenőrizve a végrehajtáskor).

## Átfedés korábbi ágakkal

`origin/fix/szoletra-olvashatosag` (#498) és `origin/fix/szoletra-kovetes-2` (#500) squash-merge-dzsel már a mainben van; a
`git log origin/main..<ág>` által listázott commitok a squash előtti eredetik. A két ág a tárgyragot és a fenti árnyékokat nem
érintette (a `git diff origin/main origin/<ág> -- WordLadderHuEn.tsx` csak a main későbbi változásait mutatja).
