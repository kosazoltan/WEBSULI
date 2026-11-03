# Végrehajtás: korszerű fejléc és szponzorsáv (terv: `docs/specs/2026-11-03-hero-szponzor-2026.md`)

Munkakönyvtár: `source/`. Ág: `feat/hero-szponzor-2026` (az `origin/main`-ből).

## T1: új Exclusive Change logó

- **Forrás:** a tulajdonos feltöltése, `40ede38f-image.jpg` (1638×477, piros változat).
- **Kimenet:** `client/public/sponsors/exclusive-change.webp`, 96 px magas, WebP q≈90 (≈ 330×96), a kép teljes tartalmával.
- **Kód:** `shared/sponsors.ts`: az `exclusive-change` `width`/`height` értéke a fájl valós mérete.

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
- **Mobil:** a gombsor `w-full sm:w-auto`, a gombok `flex-1 sm:flex-none`; az Értesítés gomb sm-től látszik (mint eddig).
- **`EmailSubscribeDialog`:** a megnyitó gomb `hero-btn hero-btn--notify` (Bell ikon, „Értesítés” felirat md-től), testid marad.

## T3: szponzorsáv

- **`SponsorBar.tsx`:** a felirat elé `Heart` ikon (`aria-hidden`); a felirat és a logók közé `span.sponsor-bar-divider`
  (`aria-hidden`, sm-től).
- **CSS:**
  - `.sponsor-bar` a fejléc üvegnyelvén: 20 px sarok, színátmenetes fátyol, hajszálkeret;
  - logólap: 12 px sarok, `0 0 0 1px rgba(255,255,255,.14)` gyűrű + árnyék.

## T4: tesztek, kapuk, böngésző, PR

- **`tests/sponsor-bar.test.ts`, új esetek:**
  - a logófájl valós mérete egyezik a `SPONSORS`-szal, és az Exclusive képaránya > 3,2;
  - a `HeroSection.tsx`-ben minden `Button` a `hero-btn` osztályt viseli.
- **Kapuk:** `npx tsc --noEmit`, `npx tsc --noEmit -p tsconfig.test.json`, `npx eslint client/src server --max-warnings 0`,
  `npm test`.
- **Böngésző:** eldobható Postgres + `build:e2e` + `websuli-home-check`; 1280/375/320 px képernyőkép, túlcsordulás, gombmagasság.
- **PR:** docs commit → feat commit; háromfázisú ellenőrzés; `.audit-ok`; push; PR; automatikus merge; élő ellenőrzés + képek.
