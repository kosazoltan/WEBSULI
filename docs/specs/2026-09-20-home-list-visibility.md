# A főoldal tananyaglistája sosem tűnhet el (2026-09-20)

## Bejelentés
„A főoldal, ha kilépek egy tartalomanyagból, nem töltődik újra; nem renderelődik újra automatikusan.”
Mellékelve képernyőkép táblagépről: a kártyák halványan, félig áttetszőn látszanak, a címek alig olvashatók.

## Mérés (nem találgatás)
A böngészőben reprodukálva: a lista konténerén `style="opacity: 0"` maradt
(`[data-testid="list-files"]`), a kártyák computed opacitása 0. Két úton áll elő ugyanaz:

1. **A könnyített mozgás döntése késve születik.** A `lightMotion` `useEffect`-ben állt be, ezért az
   ELSŐ renderelés még a teljes animációt kérte (`initial="hidden"`), ami azonnal `opacity: 0`-t írt a
   DOM-ba. Amint az effekt lefutott, mobilon `lightMotion = true` lett, és ezzel a Framer Motion
   `animate` CÉLJA eltűnt — a félbehagyott áttetszőséget már semmi nem vitte 1-re. Táblagépen
   (`pointer: coarse`, `max-width: 1023px`) ez MINDIG bekövetkezik.
2. **Rejtett dokumentumnál nincs animációs órajel.** A `requestAnimationFrame` szünetel, így a
   Framer-animáció el sem indul, és az `opacity: 0` véglegesen a DOM-ban marad. Ez magyarázza, miért
   pont visszalépés (lapváltás) után tűnt fel.

Mindkettő ugyanaz a tervezési hiba: **a tartalom láthatósága animációtól függött.**

## Javítás
- `client/src/lib/light-motion.ts`: a döntés tiszta függvény (`prefersLightMotion`), és az ELSŐ
  renderelésben, szinkron módon születik (`useState(prefersLightMotionNow)`); a média-lekérdezések
  későbbi változását továbbra is követjük. Nincs több utólagos átbillenés.
- A lista konténere nem kap animációs kezdőállapotot: se `initial`, se `animate`, se `variants`.
  A Framer Motion csak interakcióra marad (hover/tap).
- A beúszás CSS-be került (`.list-enter`) két szándékos megkötéssel:
  - **nincs `animation-fill-mode`** → a nyugalmi állapot a látható lista;
  - **csak `transform`-ot animál, áttetszőséget nem** → mérve: rejtett fülön a dokumentum idővonala
    megáll, és egy opacity-átmenet félúton (akár 0-nál) befagyhat. Mozgásnál a legrosszabb eset is
    csak 12 képpont eltolás, tartalom nem tűnik el.

## Nem cél
A lista ADATfrissítése (az a `docs/specs/2026-09-20-home-list-refresh.md` tárgya: staleTime 0,
`refetchOnMount: "always"`, `pageshow` refetch, frissítő gomb). Ez a spec kizárólag a MEGJELENÍTÉST
fedi: hogy a betöltött tananyagok mindig látszódjanak.

## Elfogadás
- WHEN a főoldal betöltődik érintőképernyőn vagy csökkentett mozgásnál THEN a lista konténerén nincs
  inline `opacity`, és a kártyák computed opacitása 1.
- WHEN a felhasználó kilép egy tananyagból és visszalép THEN a lista azonnal látható.
- WHEN az animáció el sem indul (rejtett fül, szüneteltetett órajel) THEN a tananyagok akkor is
  látszanak — a beúszás sosem állít áttetszőséget.
- Tesztek: `tests/home-list-visibility.test.ts` (a döntés tisztasága, a konténer animációmentessége,
  a keyframe fill-mode- és opacity-mentessége, a csökkentett mozgás tisztelete).

## Verifikáció (mérve, fejlesztői kiszolgálón)
375×812 mobil nézetben (`pointer: coarse`, `max-width: 1023px` — a bejelentés esete):
betöltés után `inline: null`, lista opacity **1**, 194 kártya, első kártya opacity 1. Tananyagba
belépés → `history.back()` → a lista változatlanul opacity **1**, a címek olvashatók. Képernyőkép
igazolja, hogy a kártyák élénkek (a bejelentett képen halványak voltak).
