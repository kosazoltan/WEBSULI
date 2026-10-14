# Tananyag ellenőrző szkriptek (v7.5)

Standalone HTML tananyag **átadása előtt** mindkét szkriptnek 0-s kilépési kóddal kell lefutnia.
Szerződés: [`docs/specs/tananyag-keszito-SKILL-v7_5-kiegeszites.md`](../../docs/specs/tananyag-keszito-SKILL-v7_5-kiegeszites.md).

## 1. Statikus kapu

```bash
python3 scripts/tananyag/tananyag_verify.py <fajl.html> [--prefix xx-] [--profile standalone|app]
```

Mit ellenőriz:
- BOM, `meta charset`, `lang="hu"`, viewport
- betűk profil szerint:
  - `standalone` (alapértelmezett, a Tananyag Készítő skill önálló HTML-je): Google Fonts latin-ext kötelező
  - `app` (websuli alkalmazás, `docs/lesson-improvement.md` tipográfiai szerződés): csak a helyi `/fonts/lesson-fonts.css`, Google Fonts tilos
- nincs `system-ui`
- glyph-warmup elem
- **0 db `console.*` és `debugger`**
- nincs alert/confirm/prompt, `<details>`, inline `on*=`, arrow function, template literal, tipográfiai idézőjel a JS-ben
- a JS csak ASCII
- IIFE + `'use strict'`
- 45 feladat (`q`, `required`, `bonus`, `minWords`, `needsSentence`, `sample`) és 75 kvízkérdés
- **van ≥1200 px-es és ≥1800 px-es media query, és a fő konténer nem keskeny**
- a CSS-prefix következetes

## 2. Böngészőteszt (Playwright Chromium)

```bash
pip install playwright && python3 -m playwright install chromium   # egyszer
python3 scripts/tananyag/tananyag_browser_test.py <fajl.html> --shots ./shots [--fonts-dir source/client/public/fonts]
```

Mit mér:
- 10 szélességen méri, 320 és 2560 px között (az 1200 px-es asztali határt is), minden tabon
- a gyökérrel kezdődő `/fonts/...` hivatkozást `file://` alatt a `--fonts-dir` mappából szolgálja ki, ennek hiányában üres válasszal zárja, így nem keletkezik hamis erőforrás-hiba
- 0 vízszintes túlcsordulás
- érintési célpont ≥ 44 px
- 0 JS-hiba és **0 console-üzenet**
- **≥1280 px-en minden tabra:**
  - a panel a viewport ≥ 85%-át foglalja
  - legalább 2 valódi oszlop van: egymás melletti testvér-elemek (panel-gyerekek, kártyák, feladatok) vagy CSS `column-count`; egy behúzott listaelem nem számít oszlopnak
  - egyetlen bekezdés-sor sem szélesebb 1150 px-nél
- a kiértékelő motor öntesztje: minden `sample` → ok, üres → fail

A képernyőképeket 375, 1440 és 2560 px-en szemmel is ellenőrizd.
