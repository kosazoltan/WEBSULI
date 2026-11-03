# Végrehajtás: borító-bélyegképes főoldali kártyák (terv: `docs/specs/2026-11-03-fooldal-boritokartyak.md`)

Munkakönyvtár: `source/`. Ág: `feat/fooldal-boritokartyak` (`main`-ről).

## T1: függőség

- `npm.cmd install sharp@^0.34` (a `dependencies` közé). Ellenőrzés: `node -e "require('sharp')"`, és a `package-lock.json` tartalmazza
  az `@img/sharp-linux-x64` opcionális csomagot.

## T2: szerver

- **`server/design-assets.ts`:**
  - `export async function makeThumbnail(bytes: Buffer): Promise<Buffer>`: `sharp(bytes).resize(480, 320, { fit: "cover" }).webp({ quality: 70 }).toBuffer()`.
  - `GET /:id/thumb`:
    - id-ellenőrzés;
    - meta (sha256) → ETag `"<sha>-t480"` → 304;
    - gyorsítótár (`Map`, 400 elem, a legrégebbi kiesik);
    - ha nincs a gyorsítótárban: bájtok → `makeThumbnail` → küldés `image/webp`, `Cache-Control: public, max-age=604800`;
    - hibánál 500 + `logger.error`.
  - Az útvonal a `/:id` ELŐTT legyen regisztrálva.
- **`server/storage.ts`, `getAllHtmlFiles`:**
  - második lekérdezés: `select html_file_id, json->'art'->>'picture' as picture from lessons where published_at is not null order by published_at desc`;
  - `Map` (első előfordulás) → minden sor kap egy `cover: string | null` mezőt;
  - hibánál `cover: null` (a lista nem bukhat el miatta).
- **`HtmlFile` lista-típus:** opcionális `cover`.

## T3: közös logika

- **`shared/home-card-theme.ts`:**
  - `homeCardTheme(classroom)` → `{ band, shape, radius, accent, strong, strongInk, panel, ink, muted, line, heroFrom, heroTo }`
    a `DESIGN_THEMES`-ből;
  - `coverIdFor(cover, classroom)` → `cover ?? \`hero-${band}\``.
- **`client/src/lib/band-icons.ts`:** `BAND_ICON`. A `LessonRuntime.tsx` innen importál (ugyanaz az objektum).

## T4: kliens

- **`UserFileList.tsx` kártya:**
  - `<Card className="group cursor-pointer glass-card material-card-cell home-card h-full" data-band={band} data-testid=…>`, inline
    CSS-változók: `--hc-accent`, `--hc-strong`, `--hc-strong-ink`, `--hc-panel`, `--hc-ink`, `--hc-muted`, `--hc-line`,
    `--hc-from`, `--hc-to`, `--hc-radius`;
  - felül `<div class="home-card-media">` + `<img src="/api/design-assets/<coverId>/thumb" loading="lazy" decoding="async" width="480" height="320" alt="" onError=…>`;
  - a kép bal alsó sarkában a sávjelvény (`.home-card-emblem[data-shape]` + ikon), jobb felül az évfolyam-chip;
  - alatta a panel: „Most tanuljuk” (`badge-current-<id>`), `h3` cím, leírás, lábléc (kedvelés + nyíl a `--hc-strong` színnel).
- **Szűrősáv:** az évfolyam-chip aktív állapotban a sáv `strong` színét kapja; a „Mind” a semleges kiemelést. A testid-k változatlanok.
- **Szekciócím:** „Tananyagok” + darabszám.
- **Rács:** `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3`.
- **`index.css`:**
  - `.home-card` (sarok, panel, árnyék);
  - `.home-card-media` (3:2, színátmenet-tartalék);
  - `.home-card-emblem[data-shape=circle|tilted|hexagon|square|diamond]`;
  - hover-emelés csak `@media (prefers-reduced-motion: no-preference)`.
  - A `.glass-card` és a `.material-card-cell` szabályai változatlanok.

## T5: tesztek és ellenőrzés

- **Új:** `tests/home-card-theme.test.ts`, `tests/design-thumb.test.ts`.
- **Futtatás:**
  - `npx tsc --noEmit` (app és teszt);
  - `npx eslint client/src server --max-warnings 0`;
  - `npm test`;
  - a releváns e2e helyben, ha a környezet engedi; a teljes e2e a CI-ban.
- **Böngésző:**
  - helyi dev szerver (`.claude/launch.json`), 390 és 1280 px;
  - `scrollWidth <= innerWidth`;
  - minden látható kártyán betöltött kép (`naturalWidth > 0`), címe nincs levágva (`h3` sorok ≤ 2);
  - képernyőkép.

## T6: PR → CI → merge → deploy → éles ellenőrzés

- docs-commit, aztán feat-commit; háromfázisú ellenőrzés; `.audit-ok`; PR; CI zöld; a botok reviewja kezelve; merge.
- Élesben (`/api/health` revízió):
  - főoldal 390 és 1280 px-en;
  - a bélyegkép mérete (`content-length`) ≪ a borítóé;
  - 304 ETag-gel.
