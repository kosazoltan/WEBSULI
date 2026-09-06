# Spec: LS-9 — Korosztályos vizuális rendszer a lecke-futtatóban

> Dátum: 2026-09-06 · Szerző: Hermes (orchestrator) · Állapot: VÁZLAT (tulajdonosi jóváhagyásra vár)
> Kanban: #198 (WEBSULI). Szabály: 3+ fájlt érintő feladat csak JÓVÁHAGYOTT spec után indul.

## 0. Mért kiindulóállapot (2026-09-06, `/__lesson-runtime-probe`, build:e2e, classroom 7)

Bizonyíték: `%LOCALAPPDATA%/Temp/websuli-baseline/{desktop,mobile}.png` + computed-style mérés.

| Tény | Mért érték |
|---|---|
| Korosztály-logika | LÉTEZIK: `shared/lesson-schema.ts:54` `ageBandForClassroom` → `kid` (≤4) / `teen` (≤8) / `senior` |
| Amit a band ma befolyásol | KIZÁRÓLAG betűméret/vastagság: `LessonRuntime.tsx:33-37` `BAND_STYLES` (`text-lg` vs `text-base`, `text-2xl` vs `text-xl`) |
| Szín, ikon, grafika, elrendezés band szerint | NINCS — a három band pixelre ugyanazt a fehér kártyás listát kapja |
| Vizuális elem | 4 db (mind SVG az animate/try blokkokban); a H1 20 px/600, `--foreground` szín, fehér kártya |
| Animáció | 8 elem transition-nel (gomb hover), tartalmi animáció 0 |
| Szakasz-navigáció / haladásjelző | NINCS |
| Responsive | 390 px: `scrollWidth == clientWidth` (nincs túlfolyás), tap-target min-h-11 ✔ — a layout technikailag rendben, vizuálisan száraz |
| Szerző-prompt | `step-io.ts:223` „in a register matching the pupil's age band" — a band NEVE/leírása NEM szerepel a promptban, a modell csak a `classroom` számból következtethet |

Screenshot-tényállás (saját vizuális ellenőrzés, nem meter): egyszínű fehér kártyák, egy narancs gomb, egy számegyenes; nincs cím-hero, nincs fogalom-infografika, nincs színkód a blokk-típusokra. A tulajdonos „nyers, száraz lecke" panasza MEGALAPOZOTT.

## 1. Cél

A lecke-futtató (`LessonRuntime`) a `classroom`-ból derivált `AgeBand` szerint három, mérhetően különböző vizuális rendszert adjon (színvilág, tipográfia, blokk-identitás, díszítő és tartalmi animáció, infografikus recap, szakasz-haladásjelző), asztali ÉS mobil nézetben, WCAG AA kontraszttal, `prefers-reduced-motion` tisztelettel. Cél a figyelmet felkeltő, tanulást segítő megjelenés — nem dekoráció a dekorációért.

## 2. NEM cél

- Generált HTML-lecke visszahozása (CSP-t lazító, auditálhatatlan út — LS-2 döntés érvényben).
- Lecke-séma bővítése új blokk-kinddal (a 6 kind és 8+3 anim/try kind változatlan).
- Pipeline-lépések (extract/pedagogue/lektor/gate) logikájának módosítása; a D1/grounding kapuk érintetlenek.
- Képgenerálás (image_generate/ComfyUI) a leckébe: nem determinisztikus, költséges, forrás-hűség nem ellenőrizhető → külön szelet, ha valaha.
- Játékok (Tsunami, BrainRot stb.) UI-ja.

## 3. Érintett területek

| Fájl | Változás |
|---|---|
| `source/client/src/lesson-runtime/lesson-theme.css` (ÚJ) | `[data-band="kid|teen|senior"]` token-blokkok: `--lesson-bg/--lesson-surface/--lesson-ink/--lesson-accent/--lesson-accent-ink/--lesson-radius/--lesson-font-heading`, blokk-típus árnyalatok, keyframe-ek `@media (prefers-reduced-motion: no-preference)` alatt |
| `source/client/src/lesson-runtime/band-theme.ts` (ÚJ, tiszta modul) | `BAND_THEME: Record<AgeBand, BandTheme>` (címkék, ikonkészlet, font-osztály, blokk-fejléc szövegek) — node:test-tel tesztelhető, DOM nélkül |
| `source/client/src/lesson-runtime/LessonRuntime.tsx` | gyökér `data-band`, hero-fejléc (tárgy-ikon + cím + osztály-chip), szakasz-haladásjelző (sticky, mobilon kompakt), blokk-fejlécek (típus-ikon + felirat a band nyelvén), recap → infografikus fogalomkártyák |
| `source/client/src/lesson-runtime/blocks/animate-blocks.tsx` | belépő animáció SVG-kre (stroke-draw / fade-in), reduced-motion kapu; kind-onként band-szín |
| `source/client/src/lesson-runtime/LessonRuntimeProbe.tsx` | `?classroom=N` query → band-váltás a mérőoldalon (ma fix 7) |
| `source/server/studio/step-io.ts` `buildAuthorPrompt` | a band NEVE + 2 soros regiszter-leírás explicit a promptban; „legalább 1 animate ÉS 1 try blokk szakaszonként, ha a tartalom engedi" |
| `source/tests/lesson-band-theme.test.ts` (ÚJ) | egység-guardok |
| `source/tests/lesson-band-visual.spec.ts` (ÚJ, Playwright) | band × viewport render-kapu |
| `source/tests/lesson-contrast.spec.ts` | a meglévő pixel-alapú kontrasztmérő fusson MIND A 3 bandre |

## 4. Rögzített döntések és kényszerek

- **Felület-archetípus (claude-design „Surface-First"):** Decide/Learn — egy gondolat/szakasz, hero indokolt; NEM dashboard, NEM feature-grid.
- **Band-irányok** (tokenek a CSS-ben, nem a JSX-ben):
  - `kid` (0–4. o.): meleg, világos, nagy lekerekítés (16–20 px), játékos kerek betű (Nunito/Baloo 2 — a Nunito már a font-stackben), napsárga/zöld/korall akcentek, nagy ikonok, konfetti-mentes de „ünneplő" helyes-válasz visszajelzés.
  - `teen` (5–8. o.): élénk de hűvösebb (teal/lila/borostyán), színkódolt blokk-típusok chip-fejléccel, mérsékelt lekerekítés (12 px), Poppins fejléc.
  - `senior` (9–12. o.): szerkesztőségi — mélykék/grafit tinta, egy akcentszín, serif fejléc (Source Serif 4 / Fraunces), sűrűbb ritmus, minimál dísz.
- **Aki hátteret ad, adja a tintáját is** (#197 szabály) — minden `--lesson-*-bg`-hez párja `-ink`.
- **Kontraszt:** minden szöveg ≥ 4.5:1 (pixel-alapú mérő, `lesson-contrast.spec.ts` módszertana), gomb-szöveg is.
- **Mozgás:** minden nem-triviális animáció `@media (prefers-reduced-motion: no-preference)` alatt; 0 végtelen loop; belépő animációk ≤ 600 ms.
- **Tap-target ≥ 44 px** mobilon; hero és haladásjelző 360 px-en sem törik, `scrollWidth − clientWidth ≤ 1`.
- **Anti-slop tiltólista** (claude-design): nincs indigo/lila-kék gradiens alapból, nincs bal-szegély „accent rail", nincs glassmorphism, nincs ikon-minden-fejléc-fölött, nincs kitalált statisztika.
- **Nincs futtatott idegen szkript, nincs `dangerouslySetInnerHTML`** — a `/lesson/*` strict CSP (vercel.json) érintetlen.
- A `popular-web-designs` sablonok NEM klónozhatók (márka-arculat); csak posztúra-elvek (pl. Notion meleg minimalizmus → senior; Figma/Miro játékos akcentek → kid) — saját tokenekkel.

## 5. Edge case-ek

- `classroom = 0` (programozási alapok) → `kid` (schema-döntés, változatlan).
- Lecke `sections.length === 1` → haladásjelző elrejtve (egy lépés nem haladás).
- Recap `bullets.length > 6` → infografikus kártyák 2 oszlopba törnek, mobilon 1.
- `prefers-reduced-motion: reduce` → animationName `none` minden elemen; funkció változatlan.
- Sötét mód (`.dark`) → band-tokenek külön `.dark [data-band]` értékei; kontraszt mindkét módban.
- Mérőoldal `?classroom=abc` → fallback 7, konzol-hiba nélkül.
- Nagyon hosszú cím (120 karakter) mobilon → törik, nem vág (`overflow-wrap: anywhere`).

## 6. Elfogadási kritériumok (EARS)

- WHEN a lecke `classroom` ≤ 4 THEN the runtime root SHALL have `data-band="kid"` AND the computed `--lesson-accent` SHALL differ from the `teen` and `senior` values.
- WHEN bármely band bármely szövegeleme renderel (light+dark) THEN a pixel-mért kontraszt SHALL be ≥ 4.5:1.
- WHEN a viewport 360/390/768/1280 px THEN `scrollWidth − clientWidth` SHALL be ≤ 1 AND minden interaktív elem magassága SHALL be ≥ 44 px.
- WHEN `prefers-reduced-motion: reduce` THEN a lecke-gyökér alatt `animationName !== "none"` elemek száma SHALL be 0.
- WHEN a lecke ≥ 2 szakaszból áll THEN a haladásjelző SHALL list every section heading AND SHALL mark the section in view.
- WHEN a recap blokk renderel THEN each bullet SHALL appear as a distinct visual card (`data-recap-item`), not a `<li>` list.
- WHEN `buildAuthorPrompt` fut THEN the prompt SHALL contain the literal band name (`kid|teen|senior`) AND a register description, AND SHALL NOT contain any `km_concepts` UUID (#179 invariáns marad).

## 7. Tesztterv (RED előbb — a kód csak ezeket zöldíti)

Egység (`node:test`, `source/tests/lesson-band-theme.test.ts`):
1. `BAND_THEME` kulcsai === `AGE_BANDS` (új band → bukik, amíg nincs téma).
2. Mind a 3 band `accent` értéke páronként különbözik; minden `*Bg` tokenhez létezik `*Ink` pár.
3. `lesson-theme.css` parse-guard: minden `@keyframes` használat `prefers-reduced-motion: no-preference` blokkon belül van (komment-eltávolítás után, a #183 tanulsága szerint).
4. `buildAuthorPrompt(...)` tartalmazza a band nevét + leírását; nem tartalmaz UUID-t (kiterjeszti a meglévő #179 tesztet).

Playwright (`source/tests/lesson-band-visual.spec.ts`), a probe `?classroom=2|7|11` útján, `fullPage` screenshot mindhez:
5. `data-band` a vártnak megfelelő; `--lesson-accent` 3 különböző érték.
6. 4 viewport × 3 band: overflow ≤ 1, tap-target ≥ 44.
7. `reducedMotion: 'reduce'` kontextusban 0 animált elem; `no-preference` esetén ≥ 1 (bizonyítja, hogy VAN animáció és kapuzott).
8. Haladásjelző: N szakasz → N elem; 1 szakasz → hiányzik.
9. `lesson-contrast.spec.ts` bandenként (light+dark) — meglévő mérő paraméterezve.

Reverz-mutációk a kész kódon (mind RED-nek kell lennie): `data-band` attribútum törlése; a `kid` tokenek `teen`-re másolása; egy keyframe kiemelése a reduced-motion blokkból; a recap visszaállítása `<li>`-re; a band-név eltávolítása a promptból.

Vizuális bizonyíték (kötelező, tulajdonosi szabály 2026-09-06): screenshot mind a 3 band × 2 viewport × light/dark, saját vizuális ellenőrzéssel megnézve; ha a mért szám ellentmond a képnek, a mérő gyanús (#197 tanulság).

## 8. Kockázatok / visszavonási terv

- Web-font: MÉRVE `source/vercel.json:72` — `style-src 'self' 'unsafe-inline'` (a `fonts.googleapis.com` stíluslap TILTOTT), `font-src 'self' https://fonts.gstatic.com data:`. Következmény: `<link href="https://fonts.googleapis.com/...">` NEM működik `/lesson/*` alatt; a `@font-face` a saját `lesson-theme.css`-ben áll, a `.woff2` vagy `fonts.gstatic.com`-ról, vagy self-host `public/fonts` alól (offline-biztos, preferált). A CSP-t nem lazítjuk.
- Bundle-méret: cél ≤ +25 kB gzip a lecke-chunkra; mérés `vite build` kimenetből előtte/utána.
- Visszavonás: a téma CSS-fájl és `data-band` egy commit → `git revert` tiszta; a prompt-módosítás külön commit.
- Ízlés-kockázat: a tulajdonos dönt a 3 irányról a jóváhagyásnál (lásd nyitott kérdés).

## 9. Tulajdonosi döntés (2026-09-06)

Variáns-board (`tmp/ls-9-variant-board.html`, 3 band × A/B/C, mérve: 189 szövegelem 0 kontraszt-hiba, reduce-motion 0 animált elem) alapján a tulajdonos: **„A gyermeknek a C variáns, a divergens tetszik, az legyen a design irány."**

Rögzített C-tokenek (a boardból, mért kontraszttal):

| band | bg / surface | ink / muted | line | accent / accent-ink | check-head | fejléc-betű | radius |
|---|---|---|---|---|---|---|---|
| kid | `#12224a` / `#1b2f63` | `#f4f7ff` / `#c3cdf0` | `#37508f` | `#ffd166` / `#1b2340` | = accent | Nunito 800 (meglévő `kid-display`) | 20 px |
| teen | `#0b1220` / `#121b2e` | `#e6edf7` / `#9fb0c9` | `#25334d` | `#22d3ee` / `#06202a` | `#fbbf24` / `#1a1400` | Montserrat 700 (`teen-display`) | 10 px |
| senior | `#111418` / `#181c22` | `#e7ebf0` / `#a3adba` | `#2b323b` | `#7dd3fc` / `#06202a` | `#fda4af` / `#2a0710` | `Georgia, serif` 600 | 4 px |

Helyes válasz (mind): `--ok` zöld akcent (`#6ee7a8`/`#34d399`/`#86efac`), sötét betű a badge-en (`#062a1c`), `--ok-bg` sötétzöld felület világos tintával.

Karakterjegyek: kid — glow a sorszám-korongon és recap-ikonon; teen — mono feliratok a chip/fejléceken, izzó haladásjelző; senior — vonalazott háttér (32 px), akcent-keretes hero, mono meta.

Font-döntés (mérve): az `index.html:56` már betölti Nunito/Poppins/Montserrat-ot, a `tailwind.config.ts:30-38` `kid-display`/`teen-display` tokenjei léteznek de használatlanok → ezeket használjuk. Serif nincs betöltve → senior `Georgia, "Times New Roman", serif` rendszer-stack. **Nulla új font-kérés, nulla CSP-érintés, nulla bundle-költség.** Mivel a C irány önmagában sötét, a `.dark` mód külön tokenkészlete elmarad: a lecke-felület mindkét app-módban azonos (a hero/kártya saját `--lesson-*` tintát hoz, #197 szabály).
