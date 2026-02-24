---
name: tananyag-javito
description: >
  Csonkolt vagy hibás tananyag HTML fájlok javítása a v7.1 specifikáció szerint.
  AKTIVÁLÓDJON ha a felhasználó "javítsd a tananyagot", "javítsd", "hibás a tananyag",
  "csonkolt", "nem működik" szavakat használ és HTML tananyag van a kontextusban.
  Validálja, javítja és letölthető formátumban adja vissza a fájlt.
  Ellenőrzi a 4-oldalas struktúrát, kognitív elemeket, touch eventeket, IIFE wrappert.
---

# Tananyag Javító Skill v2.0 – Szinkronizálva v7.1-gyel

HTML tananyag fájlok validálása és javítása. Csonkolt, befejezetlen vagy hibás fájlok automatikus kiegészítése a **Tananyag Készítő v7.1** specifikáció szerint.

---

## 🎯 AKTIVÁLÁSI FELTÉTELEK

Aktiválódjon ha:
- "javítsd a tananyagot" / "javítsd" / "Javítsd!"
- "hibás", "csonkolt", "nem működik", "hiányzik"
- HTML tananyag fájl van feltöltve + javítási szándék
- Kontextus túlcsordulás miatt befejezetlen fájl

---

## 📋 WORKFLOW

### 1. FÁJL ELEMZÉS

```
🔍 ELEMZÉS INDÍTÁSA

📄 Fájl: [név].html
📏 Méret: [X] KB
🔢 Sorok: [N]

Struktúra ellenőrzés...
```

### 2. HIBA AZONOSÍTÁS (v7.1 szempontok)

| Komponens | Elvárt (v7.1) | Megtalált | Státusz |
|-----------|---------------|-----------|---------|
| HTML záró tag | `</html>` | ✓/✗ | 🟢/🔴 |
| Body záró tag | `</body>` | ✓/✗ | 🟢/🔴 |
| Script záró tag | `</script>` | ✓/✗ | 🟢/🔴 |
| **4 oldal struktúra** | 4 page div | [N] | 🟢/🟡/🔴 |
| **Tab navigáció (4 gomb)** | 4 tab | [N] | 🟢/🟡/🔴 |
| **Módszerek oldal** | ✓ | ✓/✗ | 🟢/🔴 |
| **Kognitív elemek (2. oldal)** | min. 10 | [N] | 🟢/🟡/🔴 |
| Kvíz kérdések | 75 | [N] | 🟢/🟡/🔴 |
| Kvíz válaszlehetőség/kérdés | 3 (ABC) | [N] | 🟢/🔴 |
| Szöveges feladatok | 45 | [N] | 🟢/🟡/🔴 |
| **Újragenerálás gomb** | Feladatok + Kvíz tetején | ✓/✗ | 🟢/🔴 |
| **IIFE wrapper** | `(function(){...})()` | ✓/✗ | 🟢/🔴 |
| **alert() tiltott** | 0 db | [N] | 🟢/🔴 |
| **Touch events** | dragdrop-ban | ✓/✗ | 🟢/🔴 |
| **Min 44px gombok** | minden interaktív | ✓/✗ | 🟢/🔴 |
| **CSS prefix** | egyedi prefix | ✓/✗ | 🟢/🔴 |
| Konfirmációs modal | HTML modal | ✓/✗ | 🟢/🔴 |
| JSON mentés | addEventListener | ✓/✗ | 🟢/🔴 |
| JavaScript funkciók | 15+ | [N] | 🟢/🟡/🔴 |
| Reszponzív CSS | 320px-2560px | ✓/✗ | 🟢/🔴 |

### 3. HIBALISTA GENERÁLÁS

```
📊 ELEMZÉS EREDMÉNYE

✅ OK: [N] komponens
⚠️ Hiányos: [N] komponens
❌ Hibás: [N] komponens

RÉSZLETES HIBÁK:
1. [Hiba leírása] - [Pozíció]
2. [Hiba leírása] - [Pozíció]
...

JAVASOLT JAVÍTÁSOK:
1. [Javítási lépés]
2. [Javítási lépés]
...
```

### 4. AUTOMATIKUS JAVÍTÁS (prioritás szerint)

1. **Csonkolt HTML záró tagek** → Pótlás
2. **Hiányzó 4. oldal (Módszerek)** → Generálás min. 10 kognitív elemmel
3. **Hiányzó oldalak (Feladatok / Kvíz)** → Generálás a meglévő minta alapján
4. **Tab navigáció 4 gombra javítása** → Módszerek tab hozzáadása
5. **alert() → HTML modal csere** → Minden alert() lecserélése
6. **IIFE wrapper hozzáadása** → Ha hiányzik
7. **Touch events pótlása** → dragdrop elemekhez
8. **Újragenerálás gombok** → Feladatok és Kvíz tetején
9. **Hiányzó kvíz kérdések** → Pótlás a témában (cél: 75, 3 válasz)
10. **Hiányzó feladatok** → Pótlás a témában (cél: 45)
11. **JavaScript funkciók** → Kiegészítés/javítás
12. **CSS hiányosságok** → Reszponzivitás, min-height, prefix

### 5. VALIDÁLÁS ÉS OUTPUT

```
✅ JAVÍTÁS KÉSZ (v7.1)

📄 Eredeti hibák: [N]
✅ Javított: [N]
📏 Új méret: [X] KB

Komponensek:
📖 1. oldal: Tananyag ✅
🧠 2. oldal: Módszerek ([N] kognitív elem) ✅
✏️ 3. oldal: Feladatok (45) ✅
🎯 4. oldal: Kvíz (75 × 3 válasz) ✅
🔘 Tab navigáció: 4 tab ✅
⚙️ JavaScript: [N] funkció ✅
📱 Touch events: ✅
🔒 IIFE wrapper: ✅
🚫 alert()-mentes: ✅

[LETÖLTÉS GOMB]
```

---

## 🔍 HIBA KATEGÓRIÁK (v7.1)

### 1. CSONKOLÁS HIBÁK

**Tünetek:**
- HTML nem ér véget `</html>` taggel
- Félbehagyott JavaScript tömb/függvény
- Nincs záró `</script>` vagy `</style>`
- Befejezetlen div struktúra

**Javítás:** Csonkolási pont azonosítása → hiányzó záró tagek számítása → rekonstrukció

### 2. STRUKTÚRA HIBÁK (leggyakoribb v7.1-nél)

**Régi 3 oldalas → Új 4 oldalas**

| Régi (v6) | Új (v7.1) |
|-----------|-----------|
| Tananyag | 📖 Tananyag |
| Feladatok | 🧠 Módszerek (ÚJ!) |
| Kvíz | ✏️ Feladatok |
| – | 🎯 Kvíz |

Ha a feltöltött tananyagban csak 3 oldal van, add hozzá a **Módszerek** oldalt min. 10 kognitív elemmel, és rendezd át a tab sorrendet.

### 3. TILTOTT ELEMEK (v7.1)

| Tiltott | Helyes megoldás |
|---------|----------------|
| `alert('...')` | HTML modal overlay |
| `confirm('...')` | HTML modal confirm |
| `prompt('...')` | HTML input modal |
| Inline JSON `onclick="..."` | Globális változó + `addEventListener` |
| Emoji képkártyák állatokhoz | Szöveges kártyák CSS-sel |

**Javítási minta – alert() csere:**
```javascript
// TILOS:
alert('Beküldöd?');

// HELYES:
document.getElementById('PREFIX-confirm-overlay').classList.add('show');
```

### 4. IIFE WRAPPER HIÁNY

```javascript
// HIÁNYZIK:
const exerciseBank = [...];
function initExercises() {...}

// JAVÍTVA:
(function() {
  'use strict';
  const exerciseBank = [...];
  function initExercises() {...}
  // ... minden kód itt
})();
```

### 5. TOUCH EVENTS HIÁNY (dragdrop)

```javascript
// HIÁNYOS (csak mouse):
item.addEventListener('dragstart', handler);

// TELJES (v7.1):
item.addEventListener('dragstart', handler);
item.addEventListener('touchstart', touchHandler, { passive: false });
item.addEventListener('touchmove', touchMoveHandler, { passive: false });
item.addEventListener('touchend', touchEndHandler);
```

### 6. KVÍZ HIBÁK (v7.1)

**Válaszlehetőségek száma:** 3 (A/B/C) – NEM 4!

```javascript
// HELYES v7.1 struktúra:
{ q: 'Mi a fotoszintézis?', opts: ['Fényenergia → kémiai energia', 'Légzés', 'Anyagcsere'], correct: 0 }
```

**Kötelező UI:**
- 🔄 Újragenerálás gomb a TETEJÉN
- ✅ Kiértékelés gomb az ALJÁN
- Konfirmációs HTML modal a kiértékelés előtt

### 7. FELADAT HIBÁK (v7.1)

**Kötelező UI:**
- 🔄 Újragenerálás gomb a TETEJÉN
- ✅ Kiértékelés gomb az ALJÁN
- Szinonima-alapú kiértékelés (kulcsszavak)

### 8. KOGNITÍV ELEMEK HIÁNYA (2. oldal)

Min. 10 elem kell a Módszerek oldalon:

| Elem | Ha hiányzik |
|------|-------------|
| `prediction-box` | Generálj 1-2 előrejelzős kérdést |
| `gate-question` | Generálj 2-3 kapukérdést |
| `myth-box` | Generálj 2 tévhitkártyát |
| `dragdrop-box` | Generálj 1-2 húzd-a-helyére feladatot |
| `cause-effect` | Generálj 1-2 ok-hatás láncot |
| `conflict-box` | Generálj 1 meglepő tényt |
| `self-check` | Generálj önértékelő csúszkát |
| `popup-trigger` | Generálj 1 popup kérdést |
| `timeline` | Generálj folyamat/idősor elemet |
| `analogy-box` | Generálj korosztályhoz illő hasonlatot |

### 9. CSS / RESZPONZIVITÁS HIBÁK

**Kötelező CSS ellenőrzések:**
- Van-e egyedi CSS prefix?
- Minden gomb min. 44px magas?
- Van-e 320px–2560px közötti reszponzivitás?
- Van-e `clamp()` a font-size-okhoz?

```css
/* Hiányzó reszponzív alap – pótlás: */
* { box-sizing: border-box; }
body { font-family: Segoe UI, Noto Sans, system-ui, sans-serif; }
@media (max-width: 480px) { .PREFIX-nav button { font-size: 11px; } }
button { min-height: 44px; }
```

---

## 🛠️ JAVÍTÁSI LOGIKA RÉSZLETESEN

### A. 4 oldalas struktúra pótlása

Ha csak 3 oldal van (pl. v6-os tananyag):
1. Azonosítsd a meglévő oldal-DIV-ek CSS osztályait
2. Azonosítsd a tab prefix-t (pl. `fo-`, `mk-`)
3. Hozz létre egy új **Módszerek** oldalt a meglévő témához igazított kognitív elemekkel
4. Add a tab navigációhoz a 🧠 Módszerek gombot (2. pozícióba)
5. Rendezd át: Tananyag → Módszerek → Feladatok → Kvíz

### B. Csonkolás javítás

1. Keress befejezetlen stringeket (`'`, `"` páratlan)
2. Keress páratlan zárójeleket `{`, `[`, `(`
3. Keress hiányzó záró HTML tageket
4. Számítsd ki: hány `</div>`, `</script>`, `</body>`, `</html>` hiányzik
5. Rekonstruáld a struktúrát a helyes sorrendben

### C. Tartalom pótlás

**Kvíz pótlás** – ha kevesebb mint 75 kérdés:
- Azonosítsd a meglévő kérdések témáját
- Generálj új kérdéseket ugyanabban a témában
- 3 válaszlehetőség kötelező
- Fenntartsd a nehézségi szintet

**Feladat pótlás** – ha kevesebb mint 45 feladat:
- Azonosítsd a meglévő feladatok típusát
- Generálj újakat a tananyag tartalmából
- Szinonima lista minden feladathoz

---

## 📊 STÁTUSZ JELZÉSEK

```
🟢 OK - Komponens rendben
🟡 Hiányos - Részben működik
🔴 Hibás - Nem működik / hiányzik
⚪ Nem alkalmazható
```

---

## ⚡ GYORS PARANCSOK

| Parancs | Művelet |
|---------|---------|
| `Elemezd!` | Teljes validálás v7.1 szerint |
| `Javítsd!` | Automatikus javítás minden hibára |
| `Javítsd a tananyagot!` | Teljes javítás + letöltés |
| `Módszerek!` | 2. oldal (kognitív elemek) pótlása |
| `Kvízek!` | Kvíz pótlás 75 kérdésre (3 válasz) |
| `Feladatok!` | Feladat pótlás 45-re |
| `Navigáció!` | 4 tabs javítás |
| `JS!` | JavaScript kiegészítés + IIFE |
| `Touch!` | Touch events pótlása |

---

## 🎯 MINŐSÉGI KRITÉRIUMOK (v7.1)

Javított fájl tartalma:

- ✓ Érvényes HTML5 struktúra
- ✓ **4 oldal** (Tananyag | Módszerek | Feladatok | Kvíz)
- ✓ **Min. 10 kognitív elem** a Módszerek oldalon
- ✓ 45 szöveges feladat (15 megjelenítve)
- ✓ 75 kvíz kérdés (25 megjelenítve, 3 válasz/kérdés)
- ✓ **IIFE wrapper**
- ✓ **Nincs alert()/confirm()/prompt()**
- ✓ **Touch events** dragdrop-ban
- ✓ **Min. 44px** kattintható területek
- ✓ **CSS prefix** minden osztálynéven
- ✓ Konfirmációs HTML modal
- ✓ **Újragenerálás gomb** Feladatok és Kvíz tetején
- ✓ JSON mentés globális változóval + addEventListener
- ✓ Értékelési rendszer: 90=5, 75=4, 60=3, 40=2, <40=1
- ✓ Reszponzív CSS 320px–2560px
- ✓ UTF-8 + Segoe UI font

---

## 🚫 KERÜLENDŐ

- ❌ Részleges javítás (vagy teljesen javít, vagy jelzi mi marad)
- ❌ Nem működő kód visszaadása
- ❌ Eredeti tartalom elvesztése
- ❌ Stílus megváltoztatása (ha nem kérik)
- ❌ Téma megváltoztatása
- ❌ alert() meghagyása "átmenetileg"

---

## 📝 OUTPUT FORMÁTUM

- Teljes, működő HTML fájl (CSS + JS beágyazva)
- UTF-8 kódolás
- Fájlnév: `[eredeti]_javitott.html`
- Mentés: `/mnt/user-data/outputs/[eredeti]_javitott.html`
- Letöltés: `present_files` tool-lal

---

## 💡 HASZNÁLATI PÉLDA

**User:** "Javítsd a tananyagot!"

**Claude:**
```
🔍 ELEMZÉS (v7.1)

📄 Fájl: biologia-fotoszintezis.html
📏 Méret: 42 KB | 🔢 Sorok: 1,847

📊 EREDMÉNY:

| Komponens | Elvárt | Talált | Státusz |
|-----------|--------|--------|---------|
| HTML záró | 1 | 0 | 🔴 |
| Oldalak | 4 | 3 | 🟡 |
| Módszerek oldal | ✓ | ✗ | 🔴 |
| Kognitív elemek | 10 | 0 | 🔴 |
| Kvízek | 75 | 34 | 🔴 |
| Feladatok | 45 | 45 | 🟢 |
| IIFE wrapper | ✓ | ✗ | 🔴 |
| alert() | 0 | 3 | 🔴 |
| Touch events | ✓ | ✗ | 🔴 |
| Újragenerálás gomb | ✓ | ✗ | 🔴 |

❌ 8 hiba azonosítva – javítás indul...

✅ KÉSZ: biologia-fotoszintezis_javitott.html
📏 Új méret: 98 KB | ✅ Minden v7.1 követelmény teljesítve
```

---

## 🔄 VERZIÓ

**v2.0** – 2025-02
- Szinkronizálva Tananyag Készítő v7.1-gyel
- 4-oldalas struktúra ellenőrzés (Módszerek oldal)
- Kognitív elemek validálása (min. 10)
- alert()/confirm() tiltás ellenőrzés
- IIFE wrapper ellenőrzés
- Touch events validálás
- CSS prefix ellenőrzés
- Újragenerálás gombok ellenőrzése
- Kvíz: 3 válasz/kérdés (ABC) ellenőrzés
- Min. 44px kattintható területek
