# Végrehajtás: korszerű fejléc és szponzorsáv (terv: `docs/specs/2026-11-03-hero-szponzor-2026.md`)

Munkakönyvtár: `source/`. Ág: `feat/hero-szponzor-2026` (az `origin/main`-ből).

## T1: új Exclusive Change logó

- **Forrás:** a tulajdonos feltöltése, `40ede38f-image.jpg` (1638×477, piros változat).
- **Kimenet:** `client/public/sponsors/exclusive-change.webp`, 96 px magas, WebP q≈90 (≈ 330×96), a kép teljes tartalmával.
- **Kód:** `shared/sponsors.ts`: az `exclusive-change` `width`/`height` értéke a fájl valós mérete.
- **Ellenőrzés:** `node --import tsx --test tests/sponsor-bar.test.ts` → a logóteszt zöld (méret, piros háttér, fekete ikon a bal
  harmadban, fehér felirat); a régi fehér logóval ugyanez a teszt bukik.

## T2: fejléc (`HeroSection.tsx` + `index.css`)

- **Szerkezet:**
  - `<header className="hero-bar …">`;
  - háttér `div.hero-bar-bg` (a metszet, opacity 0,35) és `div.hero-bar-veil` (színátmenetes fátyol), mindkettő
    `aria-hidden`;
  - tartalom `motion.div`.
- **Márka:**
  - `span.hero-mark` (BookOpen ikon, borostyán színátmenet, 40/36 px);
  - `h1` benne `span.animate-rainbow-spectrum` „WebSuli”;
  - alcím `p.hero-tagline` (sm-től).
- **Statisztika:** `div[data-testid=hero-stats]`, benne két `span.hero-chip`.
- **Gombok:**
  - közös `hero-btn` osztály (46 px, pirula, üveg) és változatok: `hero-btn--primary` (Böngészés), `hero-btn--games`,
    `hero-btn--admin`, `hero-btn--login`;
  - a meglévő testid-k és a `ChevronDown … animate-bounce [animation-iteration-count:3]` maradnak.
- **Elrendezés (review #388):** egy sorba csak `xl`-től (≥ 1280 px) kerül minden, mert ott mérve elfér; alatta a gombsor saját,
  teljes szélességű sor (`w-full xl:w-auto`, gombok `flex-1 xl:flex-none`). Az alcím `text-overflow: ellipsis`, nem fut rá a
  chipekre. Az Értesítés gomb sm-től látszik, a felirata mindig.
- **Csökkentett mozgás:** a közös `Button` hover-emelése és nyomás-zsugorítása is ki van kapcsolva a fejlécgombokon.
- **Ellenőrzés:** `npx tsc --noEmit` és `npx eslint client/src --max-warnings 0` → 0 hiba; böngészőben 320 / 375 / 768 / 900 /
  1024 / 1280 px → nincs átfedés (a márka, a chipek és a gombok téglalapja diszjunkt), nincs vízszintes túlcsordulás, minden
  gomb 46 px.
- **`EmailSubscribeDialog`:** a megnyitó gomb `hero-btn hero-btn--notify` (Bell ikon, „Értesítés” felirat mindig), testid marad.

## T3: szponzorsáv

- **`SponsorBar.tsx`:** a felirat elé `Heart` ikon (`aria-hidden`); a felirat és a logók közé `span.sponsor-bar-divider`
  (`aria-hidden`, sm-től).
- **CSS:**
  - `.sponsor-bar` a fejléc üvegnyelvén: 20 px sarok, színátmenetes fátyol, hajszálkeret;
  - logólap: 12 px sarok, `0 0 0 1px rgba(255,255,255,.14)` gyűrű + árnyék, magán a képen (a link átlátszó, ≥ 44 px).
- **Ellenőrzés:** böngészőben a két link magassága ≥ 44 px, a logó körül nincs üres keret; `tests/sponsor-bar.test.ts` zöld.

## T4: tesztek, kapuk, böngésző, PR

- **`tests/sponsor-bar.test.ts`, új esetek:**
  - a logófájl valós mérete egyezik a `SPONSORS`-szal, és az Exclusive képaránya > 3,2;
  - a `HeroSection.tsx`-ben minden `Button` a `hero-btn` osztályt viseli.
- **Kapuk:** `npx tsc --noEmit`, `npx tsc --noEmit -p tsconfig.test.json`, `npx eslint client/src server --max-warnings 0`,
  `npm test`.
- **Böngésző:** eldobható Postgres + `build:e2e` + `websuli-home-check`; 1280/375/320 px képernyőkép, túlcsordulás, gombmagasság.
- **PR:** docs commit → feat commit; háromfázisú ellenőrzés; `.audit-ok`; push; PR; automatikus merge; élő ellenőrzés + képek.
