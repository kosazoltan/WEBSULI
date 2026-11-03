# Végrehajtás: üdvözlő kártya, játékkártyák, szülői nézet (terv: `docs/specs/2026-11-03-udvozlo-jatekkartyak-szulo.md`)

Munkakönyvtár: `source/`. Ág: `feat/kartyak-szulo-nezet` (az `origin/main`-ből).

## T1: admin → „Mind” (`UserFileList.tsx`)

- `const { isAdmin } = useAuth();`
- **Kezdőérték:** `!isAdmin && hasGrade(learnerGrade) ? learnerGrade : null`.
- **Effekt:** ha `isAdmin`, és az `appliedGrade.current !== "admin"`, akkor `appliedGrade.current = "admin"` és
  `setSelectedClassroom(null)`; különben a meglévő évfolyam-logika. Függőségek: `[learnerGrade, files, isAdmin]`.
- **Ellenőrzés:** `npx tsc --noEmit` → 0 hiba.

## T2: `WelcomeCard.tsx` — admin-nézet + új kinézet

- **Admin-nézet:**
  - `const { user, isAdmin } = useAuth();`
  - `name = isAdmin ? resolveLearnerName(account, storedName, override) : profile?.firstName ?? resolveLearnerName(…)`;
  - `pickGrade = isAdmin ? null : grade`, ezzel hívódik a `newestMaterials`;
  - a sorozat csak nem adminnál látszik;
  - a `submit` adminnál nem ír évfolyamot; az űrlapon adminnál nincs évfolyamválasztó.
- **Kinézet:**
  - `section.home-panel.welcome-panel`:
    - fejsor: `span.welcome-avatar` (a név első betűje, `aria-hidden`); a `h2` szövege változatlan („Szia, <span>név</span>!”);
      a motiváló `p`;
    - jobbra a `button.welcome-edit-btn`;
  - sorozat: `p.welcome-streak` chip;
  - ajánlók: `ul.welcome-picks` (1 / 3 oszlop); `button.welcome-pick`, benne:
    - `img.welcome-pick-thumb` (`file.coverThumb ?? /api/design-assets/${coverIdFor(file.cover, file.classroom)}/thumb`,
      64×64, `loading="lazy"`, `alt=""`);
    - „Új” jelvény, a cím (`line-clamp-2`), az évfolyam-chip (`getClassroomLabel`), nyíl.
  - Az űrlap: `form.home-panel.welcome-panel`, a mezők `welcome-input`.
  - A meglévő testid-k és szövegek maradnak; a „Mehet” gomb színátmenete változatlan (a kontrasztteszt rá épül).
- **Ellenőrzés:** `npx tsc --noEmit`, `npx eslint client/src --max-warnings 0` → 0 hiba.

## T3: `HomePracticeGames.tsx` — új kinézet

- **Szakaszfej:** `div.games-head` — `span.games-head-icon` (Gamepad2), `h2#heading-practice-games` „Gyakorló játékok”, a leírás
  (`p`), és a „Játékok menü →” `Link` (`.games-head-link`).
- **Rács:** `div.grid.grid-cols-2.sm:grid-cols-3.xl:grid-cols-4.gap-3`.
- **Kártyák:**
  - a link-kártyák `<Link href="/games/…" className="game-card" style={{ "--gc": "<szín>" }}>`, benne `GameCardBody` (ikon,
    jelvény, cím, leírás, lábléc);
  - a Szökőár `div.game-card`, a lábléce három `Link` (`.game-diff`, 40 px).
- **framer-motion nincs** (a beúszás CSS nélkül is rendben; a 7 kártyán nincs JS-animáció).
- **Ellenőrzés:** `node --import tsx --test tests/home-practice-games-catalog.test.ts` → a 7 href megvan.

## T4: CSS (`index.css`)

- **`.home-panel`:** a `.hero-bar` / `.sponsor-bar` nyelve (20 px sarok, sötétkék–ibolya színátmenet, hajszálkeret, belső fényél).
- **Üdvözlő:** `.welcome-*` — avatar 44 px, a pick-kártya `rgba(255,255,255,.06)` háttér, 14 px sarok, hover-keret.
- **Játékok:**
  - `.game-card`: `--gc` kiemelőszín, a felső fénycsík `linear-gradient`, a keret `color-mix`-mel, hover-emelés `no-preference`-nél;
  - `.game-icon` 48 px, `.game-badge` pirula, `.game-cta` a kiemelőszínnel, `.game-diff` 40 px.
- **Ellenőrzés:** a `tests/public-perf.test.ts` zöld (nincs `backdrop-filter`).

## T5: tesztek, böngésző, PR

- **Új tesztek:**
  - `tests/home-cards-modern.test.ts` (forrásszintű);
  - `tests/welcome-card.spec.ts`, új eset: admin párosított eszközön, és a nem admin ellenpróba.
- **Futtatás:**
  - `npx tsc --noEmit`, `npx tsc --noEmit -p tsconfig.test.json`, `npx eslint client/src server --max-warnings 0`, `npm test`;
  - `npx playwright test tests/welcome-card.spec.ts` (helyi build).
- **Böngésző:** eldobható Postgres + `build:e2e`; 320 / 375 / 768 / 1280 px képernyőkép, túlcsordulás.
- **PR:** docs → feat commit, háromfázisú ellenőrzés, `.audit-ok`, PR, automatikus merge, élő ellenőrzés + képek.
