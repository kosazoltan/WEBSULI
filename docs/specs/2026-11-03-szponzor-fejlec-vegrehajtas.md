# Végrehajtás: szponzorfejléc (terv: `docs/specs/2026-11-03-szponzor-fejlec.md`)

Munkakönyvtár: `source/`. Ág: `feat/szponzor-fejlec`.

## T1: adat és eszközök

- `client/public/sponsors/exclusive-change.webp` és `expressz-zalog.webp` (kész).
- `shared/sponsors.ts`: `SPONSORS = [{ id, name, url, logo, width, height }]`:
  - `exclusive-change`, Exclusive Change, `https://exclusive.hu/`, `/sponsors/exclusive-change.webp`, 357×96;
  - `expressz-zalog`, Expressz Zálog, `https://www.expresszzalog.hu/hu/`, `/sponsors/expressz-zalog.webp`, 287×96.
- **Ellenőrzés:** `npx tsc --noEmit`.

## T2: komponens és stílus

- `client/src/components/SponsorBar.tsx`:
  - `<aside className="sponsor-bar" aria-label="Támogatóink" data-testid="sponsor-bar">`;
  - felirat: `<span className="sponsor-bar-label">A tananyagkészítést támogatja</span>`;
  - linkenként: `<a className="sponsor-bar-link" href={url} target="_blank" rel="noopener noreferrer sponsored" aria-label={`${name} honlapja (új lapon nyílik)`} data-testid={`sponsor-${id}`}>` és benne `<img src={logo} alt={name} width height loading="eager" decoding="async" />`.
- `UserFileList.tsx`: `<SponsorBar />` a `<HeroSection … />` után.
- `index.css`:
  - `.sponsor-bar` (flex, középre, gap, padding, üveghatású háttér, hajszálkeret, 16 px sarok);
  - `.sponsor-bar-label` (12–13 px, nagybetűs, betűköz, `#C7D2FE`);
  - `.sponsor-bar-link` (min. 44 px, 10 px sarok, árnyék, `:focus-visible` gyűrű, hover emelés csak `no-preference`-nél);
  - `img` magasság 40 px (mobilon 32 px), `width: auto`.
- **Ellenőrzés:** `npx eslint client/src --max-warnings 0`.

## T3: tesztek, böngésző, PR

- **Teszt:** `tests/sponsor-bar.test.ts`.
- **Futtatás:** `npx tsc --noEmit` (app + teszt), `npm test`.
- **Böngésző:**
  - eldobható Postgres + `build:e2e` + helyi szerver;
  - 375/1280 px képernyőkép;
  - `scrollWidth <= innerWidth`;
  - a linkek `href`/`target`/`rel` értéke.
- **PR:** docs → feat commit, háromfázisú ellenőrzés, `.audit-ok`, PR, automatikus merge, élesben ellenőrzés.
