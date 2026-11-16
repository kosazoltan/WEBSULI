# Játékok telefonos reszponzivitása — Vihargarázs és a meta-képernyők (FIX, kanban #59)

Ág: `fix/jatek-telefonos-reszponzivitas` · végrehajtás: `docs/specs/2026-11-16-jatek-telefonos-reszponzivitas-vegrehajtas.md`

## A tulajdonos hibajelentése (2026-11-16, valódi Android telefonról, szó szerint)

> „Nem jó a telefonos reszponzivitás.”

Mellékelt képernyőkép: Android, ÁLLÓ nézet (kép 1080×2420, a CSS-nézet kb. 412 px széles, a rendszersávok között
~880 px magas), a Viharvadász (`/games/tornado-hunter-200`) „Vihargarázs” képernyője. A képen:

1. a garázs-panel alja levág: a járműszűrő gombok („Mind (160)”, „Felderítő”, „Elfogó”) sora félbevágva a külső keret
   alsó élénél, a 160 járműves lista egyáltalán nem látszik, és semmi nem jelzi, hogy görgetni lehetne;
2. három keret egymásban (fejléc-kártya → külső panel → belső kártya), mindegyik saját margóval;
3. a jármű képe helyén üres színátmenetes négyzet;
4. a hat fejlesztés-sor magas, csak öt üres pötty látszik rajta: nincs ár, nem látszik, mire kell koppintani;
5. a kiválasztott jármű részletei felül, a járműlista alul — a választáshoz végig kell görgetni a fejlesztéseken.

A tulajdonos célja: a 7 játék mai mobiljáték-színvonalú telefonos játék 3–12. évfolyamos gyerekeknek; a menü- és a
garázsképernyő ugyanolyan gondos, mint maga a játék.

## Mérés a javítás előtt (valódi böngésző, érintéses Pixel 7 profil, `origin/main` e1852e89 + d2c4c7d0)

Új testvér-mérő: `source/tests/support/game-meta-quality.ts` (X1–X7, lent), eset: `source/tests/game-meta-quality.spec.ts`.
A javítás ELŐTTI kódon futtatva a Vihargarázs mind a 6 nézetben (360×640, 390×844, 412×800, 412×915, 844×390,
915×412) ELBUKIK: a 160 járműgomb mindegyike „levágva: látható 159×0 / 159×102px” (X3), a „Vissza” gomb 2 px-e
levágva (X3), az utolsó jármű nem hozható a nézetbe (X4), a jármű képe „üres színátmenetes helykitöltő 64×64px” és a
rácscsempék „… 167×48px” (X6). Képek: `docs/measurements/jatek-reszponziv/elotte/`. A Viharvadász többi meta-képernyője
(Szintek, Rekordok, Statisztika, Beállítások) a „Vissza” gomb levágása miatt bukik (X3).

## Gyökérok (fájl:sor, `origin/main`)

- `source/client/src/pages/TornadoHunter200.tsx:359` — `fixedScreen={screen !== "menu"}`: a menün kívül MINDEN képernyő
  (garázs, szintek, beállítás, rekordok, statisztika) a játéktér „rögzített, görgetés nélküli” keretét kapja.
- `source/client/src/game-engine/mobile/GameShell.tsx:47,63` → `data-fixed-screen="true"`.
- `source/client/src/index.css:919–927`: a gyökér `height: 100dvh; overflow: hidden`; `928–937`: a `main`
  `overflow: hidden`; `939–947`: a `[data-game-card-content]` `overflow: hidden; flex: 1 1 auto; min-height: 0`.
  Ez a 3D játéktérnek való (ott nincs lapgörgetés); egy TARTALOM-képernyőn viszont a lap nem görgethető.
- A garázs tartalma (részletek + 6 fejlesztés-sor, `TornadoHunter200.tsx:672–745`) magasabb a 100dvh-nál, ezért a
  flex-oszlop az egyetlen zsugorodni tudó elemet, a járműrácsot (`:760` `overflow-y-auto flex-1 min-h-0`) 0 px-re nyomja,
  a szűrősort (`:748`) pedig a kártya `overflow: hidden`-je levágja. NEM `100vh`/`100dvh` hiba (a keret már `dvh`-t
  használ), hanem a rögzített keret rossz helyen való alkalmazása + egy görgő doboz, amely 0-ra zsugorodhat.
- Üres kép: `:674–677` (és a menü „Aktuális jármű” kártyája `:541–544`, a rácscsempe `:775–778`) egy szöveg nélküli
  színátmenetes `div`. A járműnek van formája (`lib/tornado/vehicles.ts` `silhouette: "pickup" | "wedge" | "tank" | "van" |
  "beast"`), de azt csak a 3D hálóépítő (`tornado/buildMeshes.ts:105`) használja; 2D kép-eszköz nincs a repóban.
- Fejlesztés-sor: `:727–739` — a gomb csak címkét és `○○○○○` pöttyöket ír ki; az ár (`upgradeCost`) és a pénz elégsége
  sehol nem látszik.
- A „Vissza” levágása: `ScreenHeader` (`:1097`) `-ml-2` negatív margó a `overflow: hidden` kártyában.

## Cél

1. Álló telefonon a garázs EGYETLEN, természetes lapgörgetéssel bejárható; semmi nincs levágva; nincs görgő-a-görgőben;
   a biztonsági sávok (`--game-safe-*`) figyelembe véve.
2. Kevesebb keret, ésszerű margó: 360 px-en a tartalom legalább ~328 px széles.
3. A járműválasztó felül: vízszintesen görgethető szűrősor + vízszintesen lapozható járműsor; alatta a kiválasztott jármű
   és a fejlesztések. (Indoklás: a meglévő felépítésből kis kockázattal; fülekkel szemben nem rejt el semmit, és a
   jármű váltása után a hatása azonnal látszik alatta.)
4. Tömör fejlesztés-sor (≥ 48 px, nem 110 px): szint-pöttyök, a következő szint ÁRA, egyértelmű „+” művelet; ha nincs elég
   SC, az is látszik (halvány ár, lakat nélküli „kevés SC” jelzés); maximumon „MAX”.
5. A jármű képe helyén kategóriánként (sziluett szerint) eltérő SVG-rajz a jármű saját színeivel, a ritkaság színű
   kerettel / ragyogással — a garázs részleteiben, a járműsorban és a menü „Aktuális jármű” kártyáján is.
6. Fekvő nézetben (szélesség > magasság) két hasáb: bal a szűrő + járműlista, jobb a részletek + fejlesztések; mindkettő
   saját görgetésű, a lap maga nem görög (így nincs görgő-a-görgőben), 390 px magasságon is levágás nélkül.
7. A Szintek lista a rögzített keretben marad EGY jelzett belső görgetővel (a `game-viewport-experience.spec.ts` „C1
   Viharvadász szintlista … nincs oldalgörgetés” esete kéri, a teszt nem lazítható). A Beállítás / Rekordok /
   Statisztika természetes lapgörgetést kap: a rögzített keretben a kártya `overflow-y-auto`-ját az `index.css`
   `[data-game-card-content] { overflow: hidden }` szabálya felülírta, így az alja a FELHASZNÁLÓNAK elérhetetlen volt
   (a `scrollIntoView` viszont elgörgette — ezért mérte az első mérő-változat tévesen jónak; lásd X3-szigorítás).

### Kiegészítés — orkesztrátori review (2026-11-16, #467)

- Fekvő garázs: a fejléc a bal hasábba került, a szűrő egy sorban, vízszintesen lapozva; mindkét hasáb `ScrollPane`
  (`client/src/tornado/ScrollPane.tsx`): alsó átúszás + nyíl, amíg van lent tartalom, `data-scroll-hint="more" | "end"`.
  A Szintek lista és a közös „Hogyan játsszak?” ablak ugyanígy jelzi a túlcsordulást (`components/useScrollHint.ts`).
- Fejlesztés-sor: a sor egésze a gomb, az ár-jelvény csak jelzés („Koppints a sorra” felirat törölve); kevés SC-nél a
  koppintás a képernyő alján lebegő üzenetben megmondja, mennyi hiányzik („Még 1410 SC hiányzik: Motor 2. szint”).
- Mérő: X3 hiba, ha az elem csak `overflow: hidden` ős programbeli elgörgetésével hozható elő; X4 a legalsó SZÖVEGES
  elemet is nézi; új X8: a belső görgető jelzi a túlcsordulást, és az aljára érve a jelzés eltűnik. A garázs-esetben
  valódi érintéses görgetés (CDP touch-események) a lap / mindkét hasáb aljáig, 740×360-as fekvő nézetben is.
- „Mind (160)” vs. a tulajdonos képe: a képen a felirat betűinek csak a felső pár pixele látszik (levágva), a szám nem
  olvasható; a katalógus `VEHICLE_COUNT = 160` (`lib/tornado/vehicles.ts`), a felirat `VEHICLES.length`, mentett
  állapottól független, és a PR a katalógust nem érinti.
8. Közös „Hogyan játsszak?” ablak (`components/GamePedagogyPanel.tsx`, mind a 7 játék): a bezáró gomb 16×16 px → ≥ 44 px,
   és az ablak a biztonsági sávon belül marad.
9. Mérő: `game-meta-quality` (X1–X7) a CI-ban (a fő Playwright-futás minden `*.spec.ts`-t futtat) — a Vihargarázs 6
   nézetben, a többi Viharvadász-meta-képernyő 3 nézetben. Bizonyítottan bukik a javítás előtt, zöld utána.

## Nem-cél

- A játék logikája (árak, feloldás, mentés, SC-egyenleg, `lib/tornado/*`) NEM változik; a meglévő `data-testid`-k maradnak.
- A 3D játéktér, a HUD, az érintővezérlés (joystick #456) és a közös mobil mérő M1–M12 mércéje nem változik.
- Más alügynökök lapjai (Szólétra `WordLadderHuEn.tsx` #454, Matek `SpeedQuizMath.tsx` J4b, Párbaj `DuelOnline.tsx` #464):
  csak leltár, kódmódosítás nélkül.
- Külső kép, licencelt grafika nem kerül be.

## Mérce — X1–X7 (`source/tests/support/game-meta-quality.ts`)

X1 nincs vízszintes túlcsordulás (≤ 2 px) · X2 nincs görgő-a-görgőben (függőleges görgető egy másik görgetőn vagy a görgő
lapon belül) · X3 minden látható interaktív elem görgetéssel a nézetbe hozható, ott teljesen látszik (ős nem vágja le, a
biztonsági sáv nem takarja), és a közepe önmagát találja el · X4 a lap alja elérhető (az utolsó interaktív elem a sáv
fölött teljesen látszik) · X5 érintési cél ≥ 44 px · X6 nincs üres kép-helykitöltő (0 méretű kép / vászon, betöltetlen kép,
≥ 32 px-es gyermek és szöveg nélküli színátmenetes doboz) · X7 minden látható szöveg ≥ 12 px.
Biztonsági sáv emulálva: álló 44/0/34/0, fekvő 0/44/21/44 (a közös mérő M4 értékei).

## Leltár a javítás előtt — a 7 játék meta-képernyői (360×640, 412×915, 844×390)

| Játék | Képernyő | Lelet (X) | Döntés |
|---|---|---|---|
| Viharvadász | Vihargarázs | X3 (160 jármű 0 px magas dobozban, szűrő levágva), X4, X6 | javítás (1. rész) |
| Viharvadász | Szintek / Rekordok / Statisztika / Beállítások | X3 „Vissza” 2 px levágva; belső görgő doboz | javítás |
| Viharvadász | menü, „Beállítások” nyitva | X6 üres 48×48 „Aktuális jármű” kép | javítás (SVG) |
| mind a 7 | „Hogyan játsszak?” ablak | X5 bezáró gomb 16×16 px; 360×640-en a Szólétra és a Kockavadász ablakában a bezáró a felső sávba lóg (X3) | javítás (közös komponens) |
| Kockavadász, Szökőár, Brain Rot, Aszteroida, Matek, Szólétra | kezdő + „Beállítások” nyitva (pályaválasztó, tantárgy, osztály, „Ellenfelek és irányítás”) | nincs X-lelet | — |
| Aszteroida | első indítás (osztályválasztás) | nincs X-lelet | — |
| Játékok lista (`/games`) | lista | nincs X-lelet | — |
| Párbaj (`DuelOnline.tsx`) | — | a lap még nincs a `main`-en (#464) | leltár a #464 után |

**Utána (a javítás után, ugyanazzal a leltár-futással):** mind a 69 mért képernyő/nézet (7 játék kezdő + „Beállítások”
nyitva + „Hogyan játsszak?”, Aszteroida első indítás, `/games` lista × 360×640 / 412×915 / 844×390) X1–X7 hibátlan.

## Edge case-ek

- Csak a kezdő jármű van meg, 1200 SC: a Motor 1. szint 900 SC → vásárlás után 300 SC, a 2. szint (1710 SC) „kevés SC”.
- Maximum szint (5): „MAX”, a sor nem vásárol (a logika eddig is `max_level`-t adott, ez marad).
- Zárolt jármű: a „Vásárlás” helyén letiltott „Zárolva (N. szint)” — letiltva is ≥ 48 px és teljesen látszik.
- Fekvő nézet tájolásváltáskor: a `useOrientation` (meglévő hook) vált; állapot (kiválasztott jármű, szűrő) megmarad.
- A kiválasztott jármű a járműsorban a nézetbe görgetődik (csak vízszintesen — a lap nem ugrik).
- Asztali egér: a vízszintes sor egérgörgővel / húzással is mozog (natív görgetés), a gombok fókuszálhatók.

## EARS elfogadás

- E1 HA a játékos álló telefonon (360×640 … 412×915) megnyitja a Vihargarázst, AKKOR a szűrő, a járműsor, a részletek és
  mind a 6 fejlesztés-sor egyetlen lapgörgetéssel elérhető, levágás és görgő-a-görgőben nélkül (X1–X7 zöld).
- E2 HA a játékos fekvő nézetben (844×390, 915×412) nyitja meg, AKKOR két hasábot lát, és mindkét hasáb minden eleme a
  hasáb görgetésével teljesen látható (X1–X7 zöld).
- E3 A fejlesztés-sor MINDIG mutatja a szintet (5 pötty), a következő szint árát vagy a „MAX”-ot, és hogy elég-e az SC.
- E4 A jármű képe helyén MINDIG a sziluett-kategóriának megfelelő SVG áll (5 eltérő forma), a ritkaság színével.
- E5 A garázs logikája változatlan: a meglévő egységtesztek (`tornado-progress`, `tornado-vehicles`, …) és e2e-k zöldek;
  az érintéses végigjárás (szűrő → jármű → fejlesztés → vissza) a 6 nézetben zöld.
- E6 A mérő a javítás ELŐTTI kódon bukik (idézett kimenet), utána zöld; az M1–M12 mérce nem változik.
- E7 A „Hogyan játsszak?” bezáró gombja ≥ 44 px mind a 7 játékban.

<!-- acceptance-checklist -->
- [ ] E1 álló garázs X1–X7 zöld 4 álló nézetben
- [ ] E2 fekvő garázs X1–X7 zöld 2 fekvő nézetben
- [ ] E3 fejlesztés-sor: pötty + ár / MAX + SC-elégség
- [ ] E4 SVG-sziluett 5 formával, ritkaság-színnel (garázs, járműsor, menü)
- [ ] E5 logika változatlan, érintéses végigjárás zöld
- [ ] E6 mérő: bukik előtte, zöld utána
- [ ] E7 „Hogyan játsszak?” bezáró ≥ 44 px
- [ ] Előtte / utána képpárok a `docs/measurements/jatek-reszponziv/` alatt
