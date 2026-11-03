# Spec: korszerű főoldal — borító-bélyegképes, évfolyamsáv-arculatú tananyagkártyák

> Dátum: 2026-11-03 · Szerző: Claude (Kósa Zoltán kérésére) · Állapot: JÓVÁHAGYVA
>
> Tulajdonosi kérés: „A kártyákon mindig jelenítsük meg az adott tananyag kezdőképének bélyegképváltozatát. A kártyák színei az adott
> korosztályhoz meghatározott szín-, forma- és ikonkombinációkat jelöljék. … A rendezési elv egyelőre maradjon ugyanaz, de korszerűsítsük
> a főoldal megjelenítését is, hogy igazodjon a tananyagok minőségéhez.”

## Mért kiinduló állapot (felderítés, 2026-11-03)

- **Kártya:** `/` → `Home` → `UserFileList`, a kártya inline a `client/src/components/UserFileList.tsx:282-374`-ben.
  - Látható rajta: szövegből tippelt ikon, évfolyam-jelvény, cím, leírás, kedvelés.
  - **Kép nincs.**
  - A régi téma három csoportot ismer (1–4 / 5–8 / 9–12), ez eltér az öt évfolyamsávtól (`shared/lesson-design.ts` `DESIGN_THEMES`:
    1–2 / 3–5 / 6–8 / 9–10 / 11–12).
- **Lista (`GET /api/html-files`, `server/storage.ts:404`):** nincs benne a lecke `art.picture` mezője, az csak a `lessons.json`-ban van.
- **Borítók (`/api/design-assets/:id`):**
  - 1200×800 WebP, ~30–180 KB;
  - bélyegkép-változat nincs, képfeldolgozó függőség nincs;
  - az új, automatikus borítók (párhuzamos munkamenet) csak az adatbázisba kerülnek.
- **Rendezés:** `curriculumSort` (`shared/curriculum-order.ts`), kliensoldalon.
- **Sávikonok:** a lecke-lejátszóban (`LessonRuntime.tsx:45` `BAND_ICON`): Leaf / Compass / Brain / FlaskConical / TrendingUp.

## 1. Cél

- **Kártya:**
  - minden kártyán a tananyag kezdőképének bélyegképe (3:2) és a tananyag címe;
  - a kártya szín-, forma- és ikonkombinációja az évfolyamsávé.
- **Bélyegkép:** szerveroldalon, igény szerint, az adatbázisban tárolt borítóból készül (`sharp`), kis méretben és gyorsítótárazva.
- **Lista:** leckénként `cover` mezőt ad (`art.picture`). Ahol nincs (HTML-/PDF-anyag, arculat nélküli lecke), ott a sáv hős-képe a
  tartalék.
- **Korszerűbb megjelenés** (a rendezés VÁLTOZATLAN):
  - a szűrősáv évfolyam-chipjei a sáv színét kapják;
  - a kereső és a szekciócím (darabszámmal) letisztult;
  - a rács egyenletes, szellős.

## 2. NEM cél

- A rendezési elv (`curriculumSort`), a szűrési logika és a tanuló évfolyamára nyitás.
- A hős- és üdvözlő szakasz (`HeroSection`, `WelcomeCard`), a gyakorló játékok blokkja és a kozmikus háttér.
- Az admin kártya (`FileCard.tsx`), a lecke-lejátszó és a borítók előállítása (más munkamenet).

## 3. Érintett területek

- **`source/shared/home-card-theme.ts` (új, tiszta):** `homeCardTheme(classroom)` → sáv, színek (a `DESIGN_THEMES` mért tokenjei),
  forma (`shape`), sarokív; `coverIdFor(cover, classroom)` → borító vagy a `hero-<sáv>` tartalék.
- **`source/server/design-assets.ts`:**
  - új `GET /api/design-assets/:id/thumb`;
  - tiszta `makeThumbnail(bytes)` (480×320, WebP q70, `fit: cover`);
  - memóriabeli gyorsítótár (sha256 → bájtok, legfeljebb 400 elem), ETag = `"<sha256>-t480"`,
    `Cache-Control: public, max-age=604800`.
- **`source/server/storage.ts`, `getAllHtmlFiles`:** a `lessons` táblából leckénként a publikált `json->'art'->>'picture'` →
  `cover`. A listát a meglévő `HtmlFilesCache` tárolja; a publikálás eddig is üríti.
- **`source/client/src/components/UserFileList.tsx`:** az új kártya (bélyegkép, sávszín, forma, ikon, cím). Megmarad:
  - testid: `link-file-<id>`, `badge-current-<id>`, `list-files`, `button-filter-*`;
  - `h3` cím;
  - `glass-card material-card-cell` osztály;
  - nincs `backdrop-blur`, nincs framer-motion.
- **`source/client/src/lib/band-icons.ts` (új):** a `BAND_ICON` közös helyen; a lecke-lejátszó is innen importál.
- **`source/client/src/index.css`:** `.home-card*` szabályok (sávváltozók, formák, `prefers-reduced-motion`).
- **`package.json`:** `sharp` függőség.
- **Tesztek:** új unit tesztek; a meglévő e2e és forrásszintű tesztek változatlanul zöldek.

## 4. Rögzített döntések

- **Sávok:** `designThemeForClassroom` (0 → studio). Színek: `accent`, `strong`/`strongInk` (mért ≥ 4,5:1), `panel`, `deep`, `muted`,
  `line` a `DESIGN_THEMES`-ből. A future sáv sötét felületű (panel `#233956`, szöveg `#EFF8FF`).
- **Forma (kártyasarok 16–20 px, szabályterv 76. sor) és a sávjelvény alakja:**

  | Sáv | Évfolyam | Sarok | Jelvény alakja | Ikon |
  |---|---|---|---|---|
  | explorer | 1–2. | 20 px | kör | Leaf |
  | adventure | 3–5. | 20 px | döntött lekerekített négyzet | Compass |
  | studio | 6–8., 0. | 18 px | hatszög | Brain |
  | laboratory | 9–10. | 16 px | lekerekített négyzet | FlaskConical |
  | future | 11–12. | 16 px | rombusz | TrendingUp |

- **Bélyegkép:**
  - `<img loading="lazy" decoding="async" width=480 height=320>`, 3:2 képarány, `object-fit: cover`, `alt=""`
    (dekoratív; a cím szövegként ott van);
  - hibánál (404, hálózat) a sáv színátmenete látszik, nem törött ikon.
- **Bélyegkép-végpont:**
  - csak a már tárolt képből dolgozik; ismeretlen id → 404, érvénytelen → 400;
  - a `sharp` hibája → 500 + napló, a kliens tartalékot mutat.
- **Szöveg:** a cím (`h3`) legfeljebb 2 sor, 15–16 px, 800-as súly; a leírás legfeljebb 2 sor, ≥ 13 px (szabályterv 141–143. sor).
  A cím a panelen áll, nem a képen: nincs kontraszt-kockázat.

## 5. Edge case-ek

- **210+ kártya:** a bélyegkép lusta betöltésű; a kártyán marad a `content-visibility: auto`.
- **Nincs `cover`:** a `hero-<sáv>` jön. Ha az sincs a táblában: 404 → színátmenet.
- **Több lecke ugyanahhoz a fájlhoz:** a legutóbb publikált (`published_at` desc) `art.picture`.
- **PDF-anyag:** a sáv hős-képe és egy PDF-jelölés a jelvény mellett (a régi `getFileIcon` a jelvényben nem kell).
- **0. évfolyam:** studio sáv.
- **Csökkentett mozgás:** nincs emelés vagy nagyítás animáció.

## 6. Elfogadás (EARS)

- WHEN a főoldal betölt, THEN minden kártya SHALL egy bélyegkép-képet (`/api/design-assets/<id>/thumb`) és a tananyag címét (`h3`)
  mutatni.
- WHEN a kártya évfolyama egy sávba esik, THEN a kártya SHALL a sáv színét, formáját és ikonját viselni (`data-band` attribútum).
- WHEN a bélyegkép-végpontot hívjuk, THEN SHALL ≤ 480×320-as WebP-t adni, a borítónál jóval kisebbet, ETaggel és 304-gyel.
- WHEN a lista betölt, THEN a sorrend SHALL azonos a `curriculumSort` eredményével (változatlan e2e: `curriculum-order.spec.ts`).
- WHEN 390 px és 1280 px széles a nézet, THEN nincs vízszintes túlcsordulás, levágott cím vagy átfedés (böngészős ellenőrzés).

## 7. Tesztterv

- **Unit:**
  - `tests/home-card-theme.test.ts`: 5 sáv, 0. évfolyam, tartalék-borító;
  - `tests/design-thumb.test.ts`: `makeThumbnail` mérete, formátuma, bájtmérete; a gyorsítótár-kulcs.
- **A meglévő `public-perf`, `home-list-visibility`, `curriculum`, `home-files-query` tesztek változatlanul zöldek.**
- **E2E (meglévő, változatlanul):** `curriculum-order`, `welcome-card`, `public-perf` (210 kártya), `websuli`, `material-list-recovery`.
- **Böngésző:** a helyi dev szerveren és élesben 390 és 1280 px (képernyőkép, túlcsordulás-mérés, betöltött bélyegképek mérete).

## 8. Kockázatok / visszavonás

- **`sharp` natív függőség:** a Render `npm ci` a linux-x64 előre fordított csomagját telepíti (az npm lockfile v3 rögzíti a
  platformfüggő opcionális csomagokat). Ha a betöltés elbukik, a végpont 500-at ad, a kártya pedig színátmenetet mutat: az oldal
  működik.
- **Memória:** 400 × ~15 KB ≈ 6 MB.
- **Visszavonás:** a merge commit revertje.

## 9. Végrehajtási utasítás

- Végrehajtás: `docs/specs/2026-11-03-fooldal-boritokartyak-vegrehajtas.md`
