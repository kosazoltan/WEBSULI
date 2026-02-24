---
name: tananyag-keszito
description: >
  Interaktív, mobilbarát HTML tananyag létrehozása magyar diákok számára a Tananyag Készítő v7.1 specifikáció szerint.
  MINDIG AKTIVÁLÓDJON ha a felhasználó tananyag projektben dolgozik, vagy ha tananyagot, oktatási anyagot, feladatlapot,
  kvízt, interaktív HTML tanulást, diákoknak szóló leckét, vagy iskolai anyagot kér – bármilyen tantárgyhoz, évfolyamhoz.
  Aktiválódjon ha a kérés mellékletet (képet, dokumentumot, tankönyvi szöveget) tartalmaz oktatási célzattal.
  CSAK akkor ne aktiválódjon, ha a felhasználó KIFEJEZETTEN azt mondja, hogy ne használja ezt a skill-t.
---

# Tananyag Készítő v7.1

## BEVEZETŐ

Ez a skill interaktív, 4 oldalas HTML tananyagot generál K-8 diákok számára. A bemeneti anyag lehet kép, PDF, dokumentum, tankönyvi szöveg, vagy csak a téma + évfolyam megadása. Az elkészült fájl egyetlen önálló HTML, amely mobiltelefonon is teljes funkcionalitással működik.

---

## BEMENET FELDOLGOZÁSA

Az üzenet tartalmazhat:
- **Képeket / dokumentumokat**: tankönyvi oldalak, vázlatok – dolgozd fel teljes mélységgel
- **Témamegjelölést**: pl. "fotoszintézis", "törtszámok", "középkori Magyar Királyság"
- **Évfolyam / korosztály**: mindig igazítsd hozzá a szókincset, mondathosszt, példákat
- **Stílusutasítást**: ha nincs megadva, modern, bátorító, közvetlen hang
- **CSS prefix megadás**: ha nincs, generálj 2-3 betűs egyedi prefixet a téma alapján (pl. `fo-`, `tr-`, `mk-`)

Ha az évfolyam nincs megadva, kérd el MIELŐTT elkezded a generálást.

---

## 4 OLDALAS STRUKTÚRA (KÖTELEZŐ)

| Tab | Cím | Tartalom |
|-----|-----|----------|
| 1 | 📖 Tananyag | Részletes lexikális tudás |
| 2 | 🧠 Módszerek | Min. 8-10 kognitív aktivációs elem |
| 3 | ✏️ Feladatok | 45 feladatból 15 véletlenszerű |
| 4 | 🎯 Kvíz | 75 kérdésből 25 véletlenszerű |

---

## OLDAL 1 – TANANYAG

**Cél**: A tanuló korosztályának megfelelő, mélységes, lexikális tudás – NEM vázlat, hanem folyamatos, érthetően tagolt szöveg.

### Tartalmi elvek
- Teljes tankönyvi anyag feldolgozása fejezetekre bontva
- Definíciók, példák, felsorolások, összefoglalók
- Korosztályhoz igazított szókincs és mondatstruktúra:
  - 1-3. évf.: rövid mondatok, sok vizuális elem, egyszerű szavak
  - 4-6. évf.: közepes mondatok, analógiák, hétköznapi példák
  - 7-8. évf.: összetettebb gondolatok, ok-okozat, elvont fogalmak
- Info-box-ok (érdekesség, figyelem, összefoglalás)
- Vizuális kártyák szöveges tartalommal (NEM emoji állatképek)
- Ciklus-diagramok, folyamatábrák ahol releváns (CSS/SVG-vel)

### Kötelező elemek az 1. oldalon
- Fejezetek accordionban vagy kártyákon
- Minden fejezet végén mini-összefoglaló box
- Legalább 1 vizuális diagram vagy kártyasor

---

## OLDAL 2 – MÓDSZEREK (KOGNITÍV AKTIVÁCIÓ)

**Cél**: Legalább 8-10 különböző pedagógiai eszköz, mind mobilon is érintéssel használható.

### Kötelező komponensek (mind szerepeljen)

| Komponens | Leírás |
|-----------|--------|
| `prediction-box` | "Szerinted mi fog történni ha...?" – tanuló beír, majd megmutatja a valós választ |
| `gate-question` | Kapukérdés (2-3 db): csak helyes válasz után mutatja a továbbit |
| `myth-box` | Igaz/hamis tévhit, magyarázattal |
| `dragdrop-box` | Húzd a helyére – toucheventtel mobilon is |
| `cause-effect` | Ok→hatás lánc, kattintható lépésekkel |
| `conflict-box` | Meglepő tény vagy paradoxon |
| `self-check` | Önértékelő csúszka (1-5) visszajelzéssel |
| `popup-trigger` | Kattintásra/érintésre felugró kérdés |
| `timeline` | Folyamat vagy idősor interaktívan |
| `analogy-box` | Korosztályhoz illő hasonlat, ami az új fogalmat köti a meglévő tudáshoz |

### Mobilos követelmények a 2. oldalon
- Minden `dragdrop-box`: `touchstart`, `touchmove`, `touchend` eventek + `mousedown`, `mousemove`, `mouseup`
- Minden kattintható elem: min. 44px × 44px érintési terület
- Popup-ok: ne takarják el egymást, legyen bezáró gomb

---

## OLDAL 3 – SZÖVEGES FELADATOK

**Kritikus szabályok:**
- **KIZÁRÓLAG az 1. oldal (Tananyag) tartalmából képzett kérdések** – semmit ne kérdezz, ami az anyagban nem szerepel
- 45 feladatot generálj, ebből 15 jelenik meg véletlenszerűen
- Nyílt végű kérdések, `textarea` inputtal

### Kiértékelés logikája
A kiértékelés NEM szó szerinti egyezést vizsgál, hanem:
1. Kulcsszó-lista minden feladathoz (szinonimák + rokonértelmű szavak is)
2. A válasz LÉNYEGÉT vizsgálja: ha a kulcsfogalom jelen van a válaszban, fogadja el
3. Elfogadás ha: **a kulcsszavak legalább X%-a** megtalálható a válaszban (feladatonként meghatározott küszöb)
4. Matematikai pontszámítás: `(elfogadott feladatok száma / 15) × 100 = %`

### Kötelező UI elemek
- **TETEJÉN**: 🔄 Újragenerálás gomb (új 15 feladat a 45-ből)
- **ALJÁN**: ✅ Kiértékelés gomb
- Konfirmációs modal mielőtt elveti a kitöltést újragenerálásnál
- Eredmény megjelenítése az oldalon (ne alert!)
- Osztályzat: 90%=5 Jeles, 75%=4 Jó, 60%=3 Közepes, 40%=2 Elégséges, <40%=1 Elégtelen

---

## OLDAL 4 – KVÍZ

- 75 kérdést generálj, ebből 25 jelenik meg véletlenszerűen
- 3 válaszlehetőség (A/B/C) minden kérdésnél
- Helyes/helytelen visszajelzés azonnal minden kérdésnél
- Pontszámítás: `(helyes válaszok száma / 25) × 100 = %`

### Kötelező UI elemek
- **TETEJÉN**: 🔄 Újragenerálás gomb (új 25 kérdés a 75-ből)
- **ALJÁN**: ✅ Kiértékelés gomb
- Konfirmációs modal mielőtt elveti a kitöltést
- Eredmény megjelenítése az oldalon (ne alert!)
- Ugyanaz az osztályzási skála mint a 3. oldalon

---

## TECHNIKAI KÖVETELMÉNYEK

### Kötelező
- `IIFE` wrapper: `(function() { ... })();`
- `UTF-8` meta charset, `Segoe UI` font stack
- CSS prefix: minden osztálynév egyedi prefix-szel (pl. `fo-tab`, `fo-card`)
- Reszponzív: 320px–2560px között minden törésponton működik
- **TILOS**: `alert()`, `confirm()`, `prompt()` – csak HTML modal
- **TILOS**: inline JSON `onclick` attribútumban – globális változó + `addEventListener`
- Touch events minden interaktív elemnél
- Min. 44px kattintható terület

### Fájlstruktúra
- Egyetlen önálló HTML fájl (CSS + JS beágyazva)
- Külső dependencia csak CDN-ről, offline fallback-kel ha lehetséges
- Fájlnév: `[tema]-tananyag-v7.html` (ékezetmentesen, kötőjellel)

### Tab-váltás
```javascript
// Példa tab-váltás logika
function showTab(tabId) {
  document.querySelectorAll('.[prefix]-tab-content').forEach(t => t.style.display = 'none');
  document.querySelectorAll('.[prefix]-tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(tabId).style.display = 'block';
  document.querySelector(`[data-tab="${tabId}"]`).classList.add('active');
}
```

### Drag & Drop (mobilon is)
```javascript
// Minden draggable elemre:
element.addEventListener('mousedown', startDrag);
element.addEventListener('touchstart', startDrag, { passive: false });
// + mousemove/touchmove/mouseup/touchend
```

---

## MINŐSÉGELLENŐRZÉSI LISTA (generálás előtt gondold végig)

Mielőtt a HTML kódot kiadod, ellenőrizd mentálisan:

- [ ] 1. oldal: korosztálynak megfelelő szókincs?
- [ ] 2. oldal: mind a 10 kognitív elem szerepel?
- [ ] 2. oldal: dragdrop touch eventekkel?
- [ ] 3. oldal: minden feladat az 1. oldal tartalmából?
- [ ] 3. oldal: szinonima-alapú kiértékelés implementálva?
- [ ] 3. oldal: Újragenerálás gomb TETEJÉN, Kiértékelés ALJÁN?
- [ ] 3. oldal: matematikailag helyes pontszámítás?
- [ ] 4. oldal: Újragenerálás gomb TETEJÉN, Kiértékelés ALJÁN?
- [ ] 4. oldal: matematikailag helyes pontszámítás?
- [ ] Nincs egyetlen `alert()` sem?
- [ ] Minden interaktív elem min. 44px?
- [ ] CSS prefix következetes?
- [ ] IIFE wrapper van?

---

## MENNYISÉGEK

| Típus | Generált | Megjelenített |
|-------|----------|--------------|
| Szöveges feladat | 45 | 15 (véletlenszerű) |
| Kvízkérdés | 75 | 25 (véletlenszerű) |
| Kognitív elem | min. 10 | mind (2. oldalon) |

---

## KIMENETI FORMAT

A kész HTML fájlt mentsd `/mnt/user-data/outputs/[tema]-tananyag-v7.html` helyre, majd használd a `present_files` tool-t a letölthetővé tételhez.

