# Tananyag Készítő – v7.5 kiegészítés (runbook)

**Érvényes:** 2026-10-14-től minden tananyagra. Kiegészíti a `tananyag-keszito` v7.4 skillt. Ütközés esetén ez a runbook az irányadó.

**Eszközök** (a repó `scripts/tananyag/` mappájában):

| Fájl | Mire való |
|------|-----------|
| `scripts/tananyag/tananyag_verify.py` | statikus ellenőrzés, 25+ szabály |
| `scripts/tananyag/tananyag_browser_test.py` | böngészőteszt 320–2560 px között, asztali kihasználtsággal és motor-öntesztttel |

---

## 0. Miért készült (a két ismétlődő hiba)

| Hiba | Ok | Szabály |
|------|----|---------|
| `console.log(...)` maradt a kész HTML-ben | A régi memória „console.log debug”-ot írt elő | **v7.5: a kiadott HTML-ben 0 db `console.*` és `debugger`.** A debug csak a build-szkriptben vagy ideiglenes tesztfájlban lehet. |
| Asztali monitoron keskeny, mobil jellegű oszlop | `max-width:1180px`, egyhasábos kártyák. A teszt csak túlcsordulást mért, kihasználtságot nem. | **v7.5: asztali elrendezés kötelező (≥1200 / ≥1500 / ≥2000 px), és a böngészőteszt méri is.** |

---

## 1. Reszponzivitási szerződés (KÖTELEZŐ)

A tananyag **mobiltól (320 px) a széles monitorig (2560 px)** a képernyőhöz igazodik. A mobil elrendezés felnagyítása nem elég.

| Szélesség | Elrendezés |
|-----------|-----------|
| ≤ 520 px | Egysoros, 4 oszlopos tabsáv (kis betűvel). A gombok teljes szélességűek. A tartalomjegyzék tördelt chip-sor. |
| 521–1199 px | Egyhasábos kártyák, `auto-fit` rácsok. |
| **≥ 1200 px** | **Tab1:** bal oldalon sticky tartalomjegyzék (220–300 px), jobbra a tartalom. **Tab2:** a kártyák 2 oszlopban; a széles elemek (intro, analógia, dragdrop, tévhitek, idővonal) `grid-column:1/-1`. **Tab3–4:** a feladat- és kérdéskártyák 2 oszlopban. |
| **≥ 1500 px** | **Tab1 fejezetkártyái 2 hasábosak** (`column-count:2`). A címsorok, ábrák, rácsok, összefoglalók és infódobozok `column-span:all`. A bekezdés `break-inside:avoid`, így egy bekezdés soha nem törik két hasábra. |
| **≥ 2000 px** | Tab2, Tab3 és Tab4: 3 oszlop. |

**Fix szabályok:**
- A fő konténer **nem lehet keskeny**: `max-width:2400px` (vagy nincs), az oldalmargó `padding:0 clamp(16px,2.6vw,72px)`.
- **Olvasható sorhossz:** `.{p}root p{max-width:90ch;}` – egyetlen bekezdés sem lehet 1150 px-nél szélesebb.
- **Ábrák:** `.{p}fig > .{p}svg{max-width:920px}`, hogy széles monitoron ne nőjenek óriásira.
- A gridek mindig `minmax(0,1fr)` vagy `minmax(min(100%,Xpx),1fr)` formájúak, és minden flex/grid gyermek `min-width:0`. Így nincs túlcsordulás.
- Alap betűméret: `clamp(15px, .35vw + 14px, 19px)`.

### Referencia CSS (prefix: `xx-`)

```css
.xx-wrap{width:100%;max-width:2400px;margin:0 auto;padding:0 clamp(16px,2.6vw,72px) 48px;}
.xx-root p{max-width:90ch;}
.xx-fig > .xx-svg{max-width:920px;}
.xx-toc{display:flex;flex-wrap:wrap;gap:6px;}
.xx-main{min-width:0;}
@media (min-width:1200px){
  #xx-p1.xx-active{display:grid;grid-template-columns:clamp(220px,15vw,300px) minmax(0,1fr);gap:clamp(18px,1.6vw,36px);align-items:start;}
  .xx-toc{position:sticky;top:84px;flex-direction:column;flex-wrap:nowrap;max-height:calc(100vh - 100px);overflow:auto;}
  #xx-p2.xx-active{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;align-items:start;}
  #xx-p2 > .xx-card{margin:0;}
  #xx-p2 > .xx-intro{grid-column:1 / -1;} /* + a szeles interaktiv elemek */
  #xx-tasks,#xx-quiz{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;align-items:start;}
  #xx-tasks > *,#xx-quiz > *{margin:0;}
}
@media (min-width:1500px){
  #xx-p1 article.xx-card{column-count:2;column-gap:clamp(32px,2.6vw,64px);column-rule:1px solid var(--xx-line);}
  #xx-p1 article.xx-card > *{break-inside:avoid;}
  #xx-p1 article.xx-card > p{break-inside:avoid;margin-top:0;}
  #xx-p1 article.xx-card > :is(.xx-chhead,.xx-h2,.xx-h3,.xx-grid,.xx-fig,.xx-legend,.xx-split,.xx-sum,.xx-info){column-span:all;}
}
@media (min-width:2000px){
  #xx-p2.xx-active,#xx-tasks,#xx-quiz{grid-template-columns:repeat(3,minmax(0,1fr));}
}
```

**HTML-szerkezet Tab1-hez:**

```html
<section id="xx-p1" role="tabpanel">
  <nav class="xx-toc">…</nav>
  <div class="xx-main">
    <article class="xx-card" id="xx-ch1">…</article>
    …
  </div>
</section>
```

A tartalomjegyzék linkjei `data-target` attribútumot kapnak, a görgetést JS végzi (a sticky tabsáv magasságával korrigálva). Az aktív fejezet kiemelése `IntersectionObserver`-rel történik, feature-detektálással.

---

## 2. Tiltott a kiadott HTML-ben

- `console.log/info/warn/error/debug/table` és bármilyen `console.*` hívás
- `debugger`
- `alert()`, `confirm()`, `prompt()`
- `<details>`, accordion, collapsible
- inline `onclick` és egyéb `on*=` attribútum
- arrow function, template literal
- nem ASCII karakter a JS-ben (a build `\uXXXX`-re escape-eli)
- tipográfiai idézőjel (`„ ” “`) a JS-ben és a JS-be injektált adatban
- `system-ui` és Segoe UI fallback

---

## 3. Build pipeline (sorrend)

1. Olvasd be a SKILL.md-t **és ezt a runbookot**.
2. Írd meg a tartalmat moduláris fájlokba:

   | Fájl | Tartalom |
   |------|----------|
   | `tab1.html`, `tab2.html` | a két tartalmi fül |
   | `data.py` | 45 feladat + 75 kvízkérdés |
   | `svgs.py` | ábrák |
   | `style.css` | **benne az 1. pont asztali rétegével** |
   | `engine.js` | a skill referencia-motorja, változtatás nélkül |
   | `app.js` | **console nélkül** |
   | `shell.html` | váz |
   | `build.py` | összeállítás |

3. A `build.py` feladatai:
   - IIFE + `'use strict'` köré fűzés
   - a JS nem ASCII karaktereinek `\uXXXX`-re escape-elése
   - az adatból kicseréli a tipográfiai idézőjeleket
   - `assert` a darabszámokra
   - mentés `utf-8-sig`-gel (BOM)
4. `node --check` a teljes JS-re.
5. **`python3 scripts/tananyag/tananyag_verify.py <html>` → 0-s kilépési kód kötelező.**
6. **`python3 scripts/tananyag/tananyag_browser_test.py <html> --shots <mappa>` → 0-s kilépési kód kötelező.**
7. Nézd meg saját szemmel a képernyőképeket: 375 px, 1440 px és 2560 px, mind a 4 tabon.
8. Funkcionális kattintásteszt:
   - dragdrop egérrel és koppintással
   - kapukérdések
   - feladat-kiértékelés mintaválaszokkal (a pontszám és a jegy matematikailag helyes)
   - kvíz
   - újragenerálási modal
9. Átadás: `SendUserFile`, **valamint** `Projects project_write` → `tananyagok/<fajlnev>.html`.

**Kész-definíció:** a 4–8. lépés mind zöld. Ha bármelyik FAIL, a fájlt nem adjuk át.

---

## 4. A tesztek mit mérnek

**`tananyag_verify.py`**

- BOM, meta charset és http-equiv, `lang="hu"`, viewport
- `latin-ext`, nincs `system-ui`, glyph-warmup elem
- a szövegben vannak ő/ű betűk
- **0 `console.*`, 0 `debugger`**
- tiltott függvények, accordion, inline handler
- IIFE, csak ASCII JS, nincs arrow/template literal, nincs tipográfiai idézőjel
- 4 panel, 45 feladat (a mezőkkel együtt), 75 kvízkérdés
- **van ≥1200 px-es és ≥1800 px-es media query**
- **a konténer `max-width` értéke ≥ 1800 px**
- a CSS-prefix következetes

**`tananyag_browser_test.py`**

- 9 szélességen méri, 320 és 2560 px között
- 0 JS hiba, **0 console-üzenet**
- 0 vízszintes túlcsordulás
- minden érintési célpont ≥ 44 px
- **≥1280 px-en minden tabra:**
  - az aktív panel a viewport ≥ 85%-át foglalja
  - legalább 2 oszlopos az elrendezés
  - egyetlen bekezdés-sor sem szélesebb 1150 px-nél
- motor-önteszt: minden `sample` ✅, minden üres válasz ❌

---

## 5. Ellenőrző lista átadás előtt (v7.5 kiegészítés)

- [ ] `grep -c "console" <html>` értéke 0
- [ ] 1440 és 2560 px-en a Tab1-en van oldalsó tartalomjegyzék, a fejezetek 2 hasábosak
- [ ] 1440 px-en a Tab2–4 2 oszlopos, 2560 px-en 3 oszlopos
- [ ] 375 px-en egysoros tabsáv, nincs túlcsordulás
- [ ] mindkét teszt-szkript 0-val lép ki
- [ ] a fájl felkerült a projekt `tananyagok/` mappájába

---

## 6. Alkalmazás (websuli) oldali megfelelők

- Prompt: `source/server/ai/lesson-html-spec.ts` – TECHNIKAI KÖVETELMÉNYEK (asztali töréspontok, console-tilalom).
- Fail-closed kapu: `source/server/improve/verify-html.ts` – 5. pont: `console.*` / `debugger` a script-blokkokban → elutasítás.
- Az alkalmazás helyi `/fonts/lesson-fonts.css` betűkészletet használ; a `tananyag_verify.py` ezt is elfogadja a Google Fonts latin-ext link helyett.
- Terv és végrehajtás: `docs/specs/2026-10-14-tananyag-v7_5-asztali-es-console*.md`.
