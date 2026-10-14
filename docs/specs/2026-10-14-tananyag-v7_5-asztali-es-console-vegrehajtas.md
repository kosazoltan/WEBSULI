# Tananyag v7.5 – végrehajtási utasítás (AI számára)

Terv: `docs/specs/2026-10-14-tananyag-v7_5-asztali-es-console.md` · Fázis 2/3. A sorrend kötelező.

## T1 – v7.5 szerződés dokumentum

- **Fájl:** `docs/specs/tananyag-keszito-SKILL-v7_5-kiegeszites.md` (új).
- **Tartalom:**
  - miért készült (a két mért hiba);
  - töréspont-táblázat: ≤520 / 521–1199 / ≥1200 / ≥1500 / ≥2000 px;
  - referencia CSS `xx-` prefixszel;
  - Tab1 HTML-szerkezet (`toc` + `main`);
  - tiltólista (`console.*`, `debugger`, alert/confirm/prompt, details, inline `on*=`, arrow, template literal, nem ASCII JS, tipográfiai idézőjel);
  - buildsorrend;
  - kész-definíció;
  - a két szkript által mért feltételek.
- **Ellenőrzés:** `grep -c "console" docs/specs/tananyag-keszito-SKILL-v7_5-kiegeszites.md` ≥ 1, `grep -c "1500" …` ≥ 1.

## T2 – szkriptek

- **Fájlok:** `scripts/tananyag/tananyag_verify.py`, `scripts/tananyag/tananyag_browser_test.py`, `scripts/tananyag/README.md`.
- **Lépések:**
  - `tananyag_verify.py`:
    - CLI: `<html> [--prefix xx-]`; a prefixet a `class="xx-tab` mintából detektálja;
    - FAIL, ha: `console.*`, `debugger`, alert/confirm/prompt, `<details>`, inline `on*=`, arrow vagy template literal, nem ASCII JS, tipográfiai idézőjel a JS-ben, hiányzó BOM / `meta charset` / `lang="hu"` / viewport;
    - FAIL, ha nincs ≥1200 px és ≥1800 px `min-width` media query, vagy ha a `.{prefix}wrap` `max-width` < 1800 px;
    - betűk: Google Fonts latin-ext link **vagy** helyi `/fonts/lesson-fonts.css` fogadható el;
    - kilépési kód: 0 = OK, 1 = FAIL.
  - `tananyag_browser_test.py`:
    - Playwright Chromium, viewportok: 320, 375, 414, 768, 1024, 1280, 1440, 1920, 2560;
    - minden `[role=tab]`-ra: túlcsordulás = 0, érintési célpont ≥ 44 px;
    - ≥1280 px-en: panel ≥ 85%, ≥ 2 oszlop, bekezdés-sor ≤ 1150 px (`getClientRects` alapján);
    - 0 pageerror, 0 console-esemény;
    - motor-önteszt: `ee_evaluate` minden `sample`-re `ok`, üres válaszra `fail`;
    - `--shots <mappa>`: képernyőkép 375 / 1440 / 2560 px-en.
- **Ellenőrzés:** `python3 scripts/tananyag/tananyag_verify.py <v7.5-fájl>` → `FAIL: 0`, kilépési kód 0.

## T3 – skill-leírás

- **Fájl:** `.agents/skills/tananyag-keszito/SKILL.md`.
- **Lépés:** a „Kötelező menet” lista elé „v7.5 kiegészítés (2026-10-14)” szakasz, amely hivatkozik T1-re és T2-re, és kimondja: console/debugger tilos; asztali elrendezés kötelező; mindkét szkript 0-val kell kilépjen standalone HTML átadása előtt.
- **Ellenőrzés:** `grep -n "v7.5" .agents/skills/tananyag-keszito/SKILL.md`.

## T4 – alkalmazás-prompt

- **Fájl:** `source/server/ai/lesson-html-spec.ts`.
- **Lépések:**
  - Cseréld a `- Reszponzív 320–2560px: clamp() betűméret, @media 480px és 1400px, …` sort a v7.5 töréspont-szerződésre:
    - ≥1200 px: oldalsó tartalomjegyzék a Tananyag lapon, 2 oszlopos Módszerek/Feladatok/Kvíz;
    - ≥1500 px: kéthasábos fejezetek, `column-span:all` a címekre és ábrákra, `break-inside:avoid` a bekezdésekre;
    - ≥2000 px: 3 oszlop;
    - fő konténer `max-width` ≥ 1800 px, bekezdés `max-width:90ch`, ábra `max-width` ~920 px;
    - a sticky tab-nav és a min. 44 px marad.
  - A TILOS listába add hozzá: „`console.*` hívás és `debugger` (a kiadott HTML-ben nulla)”.
  - Az ÖNELLENŐRZÉS listába add hozzá: „0 console/debugger; asztalon (≥1200px) többoszlopos, nem keskeny elrendezés”.
- **Ellenőrzés:** `npm --prefix source run check` zöld.

## T5 – fail-closed kapu

- **Fájl:** `source/server/improve/verify-html.ts`.
- **Lépés:** a 4. ellenőrzés után új 5. pont:
  - vedd a futtatható `<script>` blokkokat (src nélküliek, a `application/json`, `ld+json` és `importmap` típusúak kihagyásával);
  - tartalmukon `stripStrings()` után keress `/\bconsole\s*\.\s*[A-Za-z_$]/` és `/\bdebugger\b/` mintát;
  - találat esetén a probléma: „Debug-kód (console.* / debugger) maradt a tananyag JavaScriptjében — a kiadott HTML-ben tilos (v7.5).”
- **Ellenőrzés:** T6 tesztjei.

## T6 – tesztek

- **Fájl:** `source/tests/improve-verify-html.test.ts`.
- **Új tesztek:**
  - `GOOD`-ba injektált `console.log('x');` → `ok:false`, a probléma `/console/` mintára illeszkedik;
  - `debugger;` → `ok:false`;
  - `var s='console.log mintapelda';` string-literálban → `ok:true`;
  - `<pre>console.log(1)</pre>` a body-ban, script-en kívül → `ok:true`.
- **Parancs:** `cd source && node --import tsx --test tests/improve-verify-html.test.ts` → minden teszt `pass`. Utána `npm run check` és `npm run check:test`.

## T7 – verifikáció és átadás

- A biológia v7.5-ös HTML-en mindkét szkript 0-val lép ki; a régi (v7, console-os, keskeny) változaton 1-gyel.
- Új branch `feat/tananyag-v7-5-asztali-console`, commit, push, PR a `main`-re. Merge nincs, az a tulajdonos döntése.
