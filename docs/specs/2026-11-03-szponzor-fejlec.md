# Spec: szponzorfejléc a nyilvános főoldalon

> Dátum: 2026-11-03 · Szerző: Claude (Kósa Zoltán kérésére: „nagyon ízléses szponzorfejléc a publikus főoldalra, amely jelzi, hogy
> a tananyagkészítést az Exclusive Change és az Expressz Zálog szponzorálja. Mindkét logóra kattintva az adott cég honlapjára lehessen
> eljutni. Legyen ízléses és szép, ne rontsa a tananyag összképét, de legyen hatékony.”) · Állapot: JÓVÁHAGYVA

## Tények

- **Honlapok** — a tulajdonos megadta: „A bestchange.hu és az expresszzalog.hu a linkelendő címek.” (2026-11-03, ellenőrizve):
  - bestchange.hu: a `https://bestchange.hu` önaláírt („NO_SSL”) tanúsítványt ad, ami a látogatónak biztonsági figyelmeztetést
    jelentene; a `http://bestchange.hu` a `https://www.excbestchange.hu/hu/` lapra irányít („Exclusive Best Change – a megbízható
    váltótárs”, érvényes tanúsítvány). A link ezért közvetlenül erre a végcélra mutat;
  - expresszzalog.hu: a végcél `https://www.expresszzalog.hu/hu/`, címe „KEZDŐLAP – Expressz Zálog Zrt.”.
- **Logóválasztás** (a tulajdonos által feltöltött 6 kép közül):
  - **Exclusive Change:** a fehér hátterű vízszintes logó (piros app-ikon, fekete felirat, „a megbízható váltótárs”). Világos lapon
    elegáns, és a sötét kozmikus háttéren is jól olvasható; a piros hátterű változat harsány lenne a kártyák mellett.
  - **Expressz Zálog:** az egyetlen, narancs hátterű logó, saját narancs lapként, levágott és egyenletes margóval.
- **Eszközök:** `client/public/sponsors/exclusive-change.webp` (357×96, 7,5 KB) és `expressz-zalog.webp` (287×96, 6,3 KB).
  A 2× felbontás 48 px-es megjelenítéshez készült.
- **Hely:** a főoldal (`UserFileList.tsx`) a fejlécsáv (`HeroSection`) után, az üdvözlő kártya (`WelcomeCard`) előtt.

## 1. Cél

- Egy vékony, ízléses sáv: felirat („A tananyagkészítést támogatja”) és a két logó lekerekített lapon. Mindkét logó link a cég
  honlapjára, új lapon.
- Ne vonja el a figyelmet a tananyagokról: alacsony sáv (asztalon ~64 px, mobilon két sor), nincs animáció, csak finom emelés
  hoverre (`prefers-reduced-motion` mellett az sem).
- Hatékony: a felső harmadban, az első képernyőn látszik, nagy kattintási felülettel (≥ 44 px).

## 2. NEM cél

- Szponzor a leckeoldalakon, a játékokban vagy az admin felületen.
- Követés vagy analitika (nincs külső szkript, nincs süti).

## 3. Érintett területek

- `source/shared/sponsors.ts` (új): a szponzorok adatai (név, URL, logó, alt-szöveg, méret).
- `source/client/src/components/SponsorBar.tsx` (új): a sáv.
- `source/client/src/components/UserFileList.tsx`: `<SponsorBar />` a `HeroSection` után.
- `source/client/src/index.css`: `.sponsor-bar*` szabályok.
- `source/client/public/sponsors/*.webp` (új eszközök).
- `source/tests/sponsor-bar.test.ts` (új).

## 4. Rögzített döntések

- **A link:** `target="_blank"` és `rel="noopener noreferrer sponsored"` (a Google ajánlása a fizetett / szponzorált linkekre).
- **Akadálymentesség:**
  - a link `aria-label`-je: „Exclusive Change honlapja (új lapon nyílik)”;
  - a kép `alt`-ja a cég neve;
  - a sáv `<aside aria-label="Támogatóink">`.
- **A kép:**
  - `width`/`height` attribútum (nincs elrendezés-ugrás);
  - `loading="eager"`, `decoding="async"` (a felső harmadban van);
  - a logó magassága asztalon 40 px, mobilon 32 px.
- **Megjelenés:**
  - a sáv áttetsző sötét üveg (`rgba(255,255,255,0.06)`), hajszálvékony keret, 16 px sarok, a kártyák arculatához illően;
  - a logólapok fehérek, illetve narancsok, 10 px sarokkal, finom árnyékkal.

## 5. Edge case-ek

- Nagyon keskeny képernyő (320 px): a felirat a logók fölött, a logók egymás mellett, szükség esetén kisebbre skálázva; nincs
  vízszintes görgetés.
- A logó nem töltődik be: az `alt` szöveg látszik, a link működik.

## 6. Elfogadás (EARS)

- WHEN a főoldal betölt, THEN a fejléc alatt SHALL megjelenni a „A tananyagkészítést támogatja” sáv a két logóval.
- WHEN a felhasználó egy logóra kattint, THEN a cég honlapja SHALL új lapon nyílni (`https://www.excbestchange.hu/hu/`,
  `https://www.expresszzalog.hu/hu/`).
- WHEN a nézet 375 px vagy 1280 px széles, THEN SHALL nem lenni vízszintes túlcsordulás, és a logók SHALL olvashatók maradni.

## 7. Tesztterv

- `tests/sponsor-bar.test.ts`:
  - a szponzorlista: két cég, `https` URL, a logófájl létezik;
  - forrásszintű teszt: `target="_blank"`, `rel` benne `sponsored`, `aria-label`, `alt`;
  - a `UserFileList` beköti a sávot.
- A meglévő főoldali tesztek zöldek.
- Böngésző: helyi build eldobható adatbázissal, 375 és 1280 px, képernyőkép, linkcélok ellenőrzése.

## 8. Kockázatok / visszavonás

- Kockázat minimális (statikus komponens). Visszavonás: a merge commit revertje.

## 9. Végrehajtási utasítás

- Végrehajtás: `docs/specs/2026-11-03-szponzor-fejlec-vegrehajtas.md`
