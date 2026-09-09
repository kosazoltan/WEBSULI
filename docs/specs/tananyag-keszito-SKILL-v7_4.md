---
name: tananyag-keszito
description: >
  Interaktív, mobilbarát HTML tananyag létrehozása magyar diákok számára a Tananyag Készítő v7.4 specifikáció szerint.
  MINDIG AKTIVÁLÓDJON ha a felhasználó tananyag projektben dolgozik, vagy ha tananyagot, oktatási anyagot, feladatlapot,
  kvízt, interaktív HTML tanulást, diákoknak szóló leckét, vagy iskolai anyagot kér – bármilyen tantárgyhoz, évfolyamhoz.
  Idegen nyelvi leckénél kötelező text-to-speech (TTS) az idegen szavak meghallgatásához; a szöveges feladatok
  háromrétegű (szinonima + fuzzy + minőségi kapu) kiértékelő motorral, háromállapotú (elfogadva / részben jó / hiányos)
  eredménnyel értékelődnek. Minden generált HTML kötelezően Android-kompatibilis magyar ékezetkezelést kap
  (latin-ext alkészlet, bővített font-fallback, UTF-8 BOM). Aktiválódjon ha a kérés mellékletet (képet, dokumentumot, tankönyvi szöveget) tartalmaz
  oktatási célzattal. CSAK akkor ne aktiválódjon, ha a felhasználó KIFEJEZETTEN azt mondja, hogy ne használja ezt a skill-t.
---

# Tananyag Készítő v7.4

## BEVEZETŐ

Ez a skill interaktív, 4 oldalas HTML tananyagot generál K-8 diákok számára. A bemeneti
anyag lehet kép, PDF, dokumentum, tankönyvi szöveg, vagy csak a téma + évfolyam megadása.
Az elkészült fájl egyetlen önálló HTML, amely mobiltelefonon is teljes funkcionalitással
működik (320px-től 2560px-ig).

A v7.3 a v7.1 alapjaira épült, és három, gyakorlatban kipróbált újdonságot
épített be kötelező elemként:
1. **Háromrétegű szöveges-válasz kiértékelő motor** (a régi lapos kulcsszó-egyezés helyett).
2. **Idegen nyelvi leckéknél kötelező text-to-speech** (TTS) az idegen szavak meghallgatásához.
3. **Opcionális speech-to-text (diktálás)** a szöveges feladatoknál, helyes engedély- és
   iframe-kezeléssel.

A **v7.4** egyetlen, de azóta többször visszaigazolt hibát javít:
4. **Android-kompatibilis magyar ékezetkezelés** – tableten és telefonon a hosszú ő/ű betűk
   korábban ékezet nélkül vagy rossz fontról jelentek meg. Ez most kötelező építési lépés,
   lásd a "MAGYAR ÉKEZETEK ÉS BETŰTÍPUSOK" szakaszt.

---

## BEMENET FELDOLGOZÁSA

Az üzenet tartalmazhat:
- **Képeket / dokumentumokat**: tankönyvi oldalak, vázlatok – dolgozd fel teljes mélységgel.
- **Témamegjelölést**: pl. "fotoszintézis", "törtszámok", "countable/uncountable nouns".
- **Évfolyam / korosztály**: mindig igazítsd hozzá a szókincset, mondathosszt, példákat.
- **Stílusutasítást**: ha nincs megadva, modern, bátorító, közvetlen hang.
- **Célközönség jellemzőit** (kor, nem, esztétikai preferencia): igazítsd hozzá a dizájnt.
- **CSS prefix**: ha nincs, generálj 2-3 betűs egyedi prefixet a téma alapján (pl. fo-, tr-, cu-).

Ha az évfolyam nincs megadva, kérd el MIELŐTT elkezded a generálást.

### Idegen nyelvi lecke felismerése (FONTOS)

Ha a tananyag idegen nyelv tanulását célozza (angol, német, francia, spanyol stb. — akár
nyelvtan, akár szókincs, akár olvasás), akkor a **text-to-speech KÖTELEZŐ** (lásd a TTS
szakaszt lentebb). Ezt a felismerést a build elején kell megtenni, mert kihat az 1. oldal
és a szószedet felépítésére.

---

## 4 OLDALAS STRUKTÚRA (KÖTELEZŐ)

| Tab | Cím | Tartalom |
|-----|-----|----------|
| 1 | 📖 Tananyag | Részletes lexikális tudás (+ szószedet idegen nyelvnél) |
| 2 | 🧠 Módszerek | Min. 8-10 kognitív aktivációs elem |
| 3 | ✏️ Feladatok | 45 feladatból 15 véletlenszerű |
| 4 | 🎯 Kvíz | 75 kérdésből 25 véletlenszerű |

---

## OLDAL 1 – TANANYAG

**Cél:** A tanuló korosztályának megfelelő, mélységes, lexikális tudás – NEM vázlat, hanem
folyamatos, érthetően tagolt szöveg.

### Tartalmi elvek
- Teljes tankönyvi anyag feldolgozása fejezetekre bontva.
- Definíciók, példák, felsorolások, összefoglalók.
- Korosztályhoz igazított szókincs és mondatstruktúra:
  - 1-3. évf.: rövid mondatok, sok vizuális elem, egyszerű szavak.
  - 4-6. évf.: közepes mondatok, analógiák, hétköznapi példák.
  - 7-8. évf.: összetettebb gondolatok, ok-okozat, elvont fogalmak.
- Info-box-ok (érdekesség, figyelem, összefoglalás).
- Vizuális kártyák szöveges tartalommal (NEM emoji állatképek).
- Ciklus-diagramok, folyamatábrák ahol releváns (CSS/SVG-vel).

### Kötelező elemek az 1. oldalon
- Fejezetek **kártyákon** (NEM accordion/collapsible – minden tartalom mindig látszódjon).
- Minden fejezet végén mini-összefoglaló box.
- Legalább 1 vizuális diagram vagy kártyasor.

### Szószedet idegen nyelvi leckénél (KÖTELEZŐ idegen nyelvnél)
- Külön szószedet-szekció: idegen szó + magyar jelentés + szófaj/típus + példamondat (idegen + magyar).
- **Minden idegen szó és példamondat mellett 🔊 TTS gomb** (lásd a TTS szakaszt).

---

## OLDAL 2 – MÓDSZEREK (KOGNITÍV AKTIVÁCIÓ)

**Cél:** Legalább 8-10 különböző pedagógiai eszköz, mind mobilon is érintéssel használható.

### Kötelező komponensek (mind szerepeljen)

| Komponens | Leírás |
|-----------|--------|
| prediction-box | "Szerinted mi fog történni ha...?" – tanuló beír, majd megmutatja a valós választ |
| gate-question | Kapukérdés (2-3 db): csak helyes válasz után mutatja a továbbit |
| myth-box | Igaz/hamis tévhit, magyarázattal |
| dragdrop-box | Húzd a helyére – touchevent + mouse-event |
| cause-effect | Ok→hatás lánc, kattintható lépésekkel |
| conflict-box | Meglepő tény vagy paradoxon |
| self-check | Önértékelő csúszka (1-5) visszajelzéssel |
| popup-trigger | Kattintásra/érintésre felugró kérdés |
| timeline | Folyamat vagy idősor interaktívan |
| analogy-box | Korosztályhoz illő hasonlat, ami az új fogalmat köti a meglévő tudáshoz |

### Mobilos követelmények a 2. oldalon
- Minden dragdrop-box: `touchstart`, `touchmove`, `touchend` + `mousedown`, `mousemove`, `mouseup`.
- Húzás közben legyen vizuális ujjkövetés (lebegő "ghost" elem) és célzóna-kiemelés.
- A `touchstart` után `touchmove`-ban `preventDefault()` (`passive:false`), hogy a húzás ne görgessen.
- Minden kattintható elem: min. 44px × 44px érintési terület.
- Popup-ok: ne takarják el egymást, legyen bezáró gomb.

---

## OLDAL 3 – SZÖVEGES FELADATOK

**Kritikus szabályok:**
- KIZÁRÓLAG az 1. oldal (Tananyag) tartalmából képzett kérdések.
- 45 feladatot generálj, ebből 15 jelenik meg véletlenszerűen.
- Nyílt végű kérdések, textarea inputtal.

### Kiértékelés: HÁROMRÉTEGŰ MOTOR (v7.2-től kötelező)

A korábbi kiértékelő egyetlen lapos kulcsszó-listával dolgozott, és pusztán a talált
kulcsszavak számából döntött. Két irányban hibázott: átengedte a puszta kulcsszó-felsorolást
("kulcsszó-halászat"), és elutasította a jó, de más szavakkal megfogalmazott válaszokat. A
v7.3 motor ezt javítja, offline (egyetlen HTML-fájlban, szerver nélkül, külső könyvtár nélkül,
ES5-kompatibilis, IIFE-be ágyazva).

#### A feladat adatformátuma (kötelező)

Minden szöveges feladat **objektum, NEM tömb**:

```javascript
{
  q:            "A kérdés szövege (magyar, ékezetes a megjelenítéshez).",
  required:     [ ["szinonima", "szinonima", ...],   // 1. KÖTELEZŐ fogalom
                  ["szinonima", "szinonima", ...] ],  // 2. KÖTELEZŐ fogalom
  bonus:        [ ["szinonima", ...], ... ],          // JUTALOM fogalmak (példák, extrák)
  minWords:     3,           // minimális szószám (minőségi kapu)
  needsSentence: true,       // true, ha magyarázó/mondatszerű válasz kell
  sample:       "Mintaválasz, ami a 🟡/❌ eseteknél megjelenik."
}
```

Szabályok a feladatok írásához:
- Egy `required` fogalom = egyenértékű megfogalmazások halmaza. A fogalom akkor teljesül, ha
  BÁRMELYIK szinonimája előfordul. Ide a válasz LÉNYEGI elemei kerülnek.
- A `bonus` a konkrét példák, extra helyes elemek (nem dönt a jó/rossz felett, csak színez).
- Felsoroló feladatnál ("írj 3 főnevet") a `required` lehet üres, a helyes elemek `bonus`-ba kerülnek.
- `needsSentence: true` csak ott, ahol valódi magyarázat a cél. Rövid fordításnál/felsorolásnál `false`.
- A `sample` mindig valódi, követendő mintaválasz legyen.
- A JS-be ASCII-biztos JSON-ként (`ensure_ascii=True`) kerül; a kódban NINCS cirill/tipográfiai idézőjel.

#### A motor három rétege

1. **Fogalmi illesztés szinonimákkal.** Minden kötelező fogalomnál elég egy szinonima-találat.
   Többszavas kifejezésnél MINDEN szó forduljon elő valahol (nem kell folytonosan egymás
   mellett), így a "nem szamol" illeszkedik a "nem tudok megszámolni"-ra is.

2. **Fuzzy egyezés.** Levenshtein-távolság (rövid szónál 0, közepesnél 1, hosszúnál 2 tűrés)
   + könnyű magyar tövezés (gyakori ragvégződések levágása) + összetett szó résztring-egyezés
   + ékezet-leszedés. Kezeli az elgépelést és a ragozást (diktált válaszoknál fontos).

3. **Minőségi kapuk.** (a) Minimális szószám. (b) Koherencia-kapu: ha `needsSentence`, a teljes
   ponthoz kell egy valódi kötőszó/mondatszerkezet-jelző (magyar VAGY angol funkciószó) ÉS
   legalább egy "saját" szó, ami egyik fogalomban sem szerepel. Ez akadályozza a puszta
   kulcsszó-felsorolás teljes pontját.

#### Háromállapotú kimenet
- ✅ **Elfogadva** (1 pont): minden kötelező fogalom megvan + koherens.
- 🟡 **Részben jó** (0.5 pont): a kötelező fogalmak fele megvan, VAGY minden fogalom megvan, de
  szólista-szerű. Megjelenik a "📖 Mintaválasz megnézése" gomb. A diák/tanár dönt.
- ❌ **Hiányos** (0 pont): túl rövid, vagy túl kevés kötelező fogalom.

A végeredménybe a fél pontok beszámítanak.

#### A motor referencia-implementációja (ES5, IIFE-be ágyazva)

```javascript
/* --- normalizalas: kisbetu, ekezet le, kozpontozas le --- */
function ee_norm(s){
  s = (s||'').toLowerCase();
  s = s.replace(/[áà]/g,'a').replace(/[éè]/g,'e').replace(/í/g,'i')
       .replace(/[óòöő]/g,'o').replace(/[úùüű]/g,'u');
  s = s.replace(/[.,!?;:"'()\-\/]/g,' ');
  s = s.replace(/\s+/g,' ').replace(/^\s+|\s+$/g,'');
  return s;
}
/* --- konnyu magyar toldalek-levagas --- */
function ee_stem(w){
  var suf = ['ban','ben','bol','bel','rol','rel','tol','tel','nak','nek',
             'val','vel','hoz','hez','ra','re','ba','be','ot','et','at',
             'ok','ek','k','t','n','i'];
  var i;
  for(i=0;i<suf.length;i++){
    var s = suf[i];
    if(w.length > s.length + 2 && w.slice(-s.length) === s){ return w.slice(0, w.length - s.length); }
  }
  return w;
}
/* --- Levenshtein --- */
function ee_lev(a, b){
  var m=a.length, n=b.length, i, j;
  if(m===0) return n; if(n===0) return m;
  var prev=[], cur=[];
  for(j=0;j<=n;j++){ prev[j]=j; }
  for(i=1;i<=m;i++){
    cur[0]=i;
    for(j=1;j<=n;j++){
      var cost = (a.charAt(i-1)===b.charAt(j-1))?0:1;
      cur[j]=Math.min(prev[j]+1, cur[j-1]+1, prev[j-1]+cost);
    }
    for(j=0;j<=n;j++){ prev[j]=cur[j]; }
  }
  return prev[n];
}
function ee_tol(len){ if(len<=4) return 0; if(len<=7) return 1; return 2; }

function ee_wordHit(answerTokens, answerStems, word){
  var p = ee_norm(word); var ps = ee_stem(p); var t;
  for(t=0;t<answerTokens.length;t++){
    var tok = answerTokens[t];
    if(tok === p) return true;
    if(answerStems[t] === ps) return true;
    if(p.length >= 4 && tok.indexOf(p) !== -1) return true;
    if(p.length >= 4 && tok.length >= 4 && p.indexOf(tok) !== -1) return true;
    if(ee_lev(tok, p) <= ee_tol(Math.max(tok.length, p.length))) return true;
  }
  return false;
}
function ee_phraseHit(answerNorm, answerTokens, answerStems, phrase){
  var p = ee_norm(phrase); var parts = p.split(' ');
  if(parts.length === 1){ return ee_wordHit(answerTokens, answerStems, parts[0]); }
  var i;
  for(i=0;i<parts.length;i++){
    if(parts[i].length < 2) continue;
    if(!ee_wordHit(answerTokens, answerStems, parts[i])) return false;
  }
  return true;
}
function ee_conceptHit(answerNorm, answerTokens, answerStems, concept){
  var i;
  for(i=0;i<concept.length;i++){
    if(ee_phraseHit(answerNorm, answerTokens, answerStems, concept[i])) return true;
  }
  return false;
}
function ee_evaluate(answer, task){
  var norm = ee_norm(answer);
  var tokens = norm ? norm.split(' ') : [];
  var stems = []; var i;
  for(i=0;i<tokens.length;i++){ stems[i]=ee_stem(tokens[i]); }
  var wordCount = tokens.length;
  var minW = task.minWords || 1;
  var req = task.required || []; var bon = task.bonus || [];
  var hitReq = 0, hitBonus = 0;
  for(i=0;i<req.length;i++){ if(ee_conceptHit(norm,tokens,stems,req[i])) hitReq++; }
  for(i=0;i<bon.length;i++){ if(ee_conceptHit(norm,tokens,stems,bon[i])) hitBonus++; }
  var totalReq = req.length;
  if(wordCount < minW){
    return {state:'fail', score:0, hitReq:hitReq, totalReq:totalReq, hitBonus:hitBonus, reason:'tul rovid'};
  }
  if(totalReq === 0){
    var anyBonus = hitBonus > 0;
    return {state: anyBonus?'ok':'partial', score: anyBonus?1:0.5,
            hitReq:0, totalReq:0, hitBonus:hitBonus, reason:'bonusz-alapu'};
  }
  var ratio = hitReq / totalReq;
  var FUNC = [' mert ',' es ',' olyan ',' ami ',' amit ',' azt ',' hogy ',
              ' lehet ',' tudom ',' tudjuk ',' mint ',' ezert ',' igy ',' mivel ',' tehat ',
              ' is ',' are ',' there ',' have ',' has ',' do ',' does ',' a ',' an ',' the ',
              ' some ',' any ',' isn t ',' aren t ',' don t ',' how ',' much ',' many ',' of ',' on ',' in '];
  var padded = ' ' + norm + ' '; var hasFunc = false, f;
  for(f=0;f<FUNC.length;f++){ if(padded.indexOf(FUNC[f]) !== -1){ hasFunc=true; break; } }
  var allConcepts = [];
  for(i=0;i<req.length;i++){ allConcepts = allConcepts.concat(req[i]); }
  for(i=0;i<bon.length;i++){ allConcepts = allConcepts.concat(bon[i]); }
  var hasOwnWord = false;
  for(i=0;i<tokens.length;i++){
    if(tokens[i].length < 4) continue;
    if(!ee_conceptHit(' '+tokens[i]+' ', [tokens[i]], [stems[i]], allConcepts)){ hasOwnWord = true; break; }
  }
  if(ratio >= 1){
    if(task.needsSentence && !(hasFunc && hasOwnWord)){
      return {state:'partial', score:0.5, hitReq:hitReq, totalReq:totalReq, hitBonus:hitBonus,
              reason:'fogalmak megvannak, de inkabb szolista mint mondat'};
    }
    return {state:'ok', score:1, hitReq:hitReq, totalReq:totalReq, hitBonus:hitBonus, reason:'minden kotelezo fogalom megvan'};
  }
  if(ratio >= 0.5){
    return {state:'partial', score:0.5, hitReq:hitReq, totalReq:totalReq, hitBonus:hitBonus, reason:'kotelezo fogalmak resze hianyzik'};
  }
  return {state:'fail', score:0, hitReq:hitReq, totalReq:totalReq, hitBonus:hitBonus, reason:'tul keves kotelezo fogalom'};
}
```

### Kötelező UI elemek a 3. oldalon
- **TETEJÉN**: 🔄 Újragenerálás gomb (új 15 feladat a 45-ből).
- **ALJÁN**: ✅ Kiértékelés gomb.
- Konfirmációs modal mielőtt elveti a kitöltést újragenerálásnál.
- Feladatonkénti háromállapotú visszajelzés (✅/🟡/❌) + indok + "📖 Mintaválasz" gomb a 🟡/❌ eseteknél.
- Eredmény megjelenítése az oldalon (ne alert!).
- Osztályzat: 90%=5 Jeles, 75%=4 Jó, 60%=3 Közepes, 40%=2 Elégséges, <40%=1 Elégtelen.
- JSON eredmény-export, localStorage email-mentés, mailto link.

---

## OLDAL 4 – KVÍZ

- 75 kérdést generálj, ebből 25 jelenik meg véletlenszerűen.
- 3 válaszlehetőség (A/B/C) minden kérdésnél.
- Helyes/helytelen visszajelzés azonnal minden kérdésnél.
- Pontszámítás: (helyes válaszok száma / 25) × 100 = %.

### Kötelező UI elemek
- TETEJÉN: 🔄 Újragenerálás gomb (új 25 kérdés a 75-ből).
- ALJÁN: ✅ Kiértékelés gomb.
- Konfirmációs modal mielőtt elveti a kitöltést.
- Eredmény megjelenítése az oldalon (ne alert!).
- Ugyanaz az osztályzási skála mint a 3. oldalon.

---

## TEXT-TO-SPEECH (IDEGEN NYELVI LECKÉNÉL KÖTELEZŐ)

Idegen nyelvi tananyagnál (angol, német, francia stb.) MINDEN idegen szó, kifejezés és
példamondat legyen meghallgatható. Ez nem opció, hanem kötelező elem.

### Követelmények
- **Web Speech API** (`SpeechSynthesis`), külső függőség nélkül.
- A felismert nyelvhez illő hang (`lang`), pl. angolnál `en-GB` vagy `en-US`, németnél `de-DE`.
- **Minden idegen elem mellett 🔊 gomb**, `data-tts` attribútummal, ami a felolvasandó idegen
  szöveget tartalmazza.
- Csak az **idegen** szöveget olvassa fel — a magyar fordítást/magyarázatot NE.
- Állítható sebesség (és lehetőleg pitch) — gyerekeknél lassabb alapérték (pl. 0.85) ajánlott.
- A gombok min. 44px érintési területűek.

### Referencia-implementáció

```javascript
var ttsRate = 0.85;
function speak(text, lang){
  if(!('speechSynthesis' in window)){ return; }
  window.speechSynthesis.cancel();
  var u = new SpeechSynthesisUtterance(text);
  u.lang = lang || 'en-GB';
  u.rate = ttsRate;
  u.pitch = 1.1;
  var voices = window.speechSynthesis.getVoices(); var k;
  for(k=0;k<voices.length;k++){ if(voices[k].lang === u.lang){ u.voice = voices[k]; break; } }
  window.speechSynthesis.speak(u);
}
/* minden [data-tts] elemre addEventListener('click', ...) -> speak(el.getAttribute('data-tts')) */
```

HTML-ben:
```html
<span class="[prefix]-en" data-tts="apple">apple</span>
<button class="[prefix]-tts-btn" data-tts="apple">🔊</button>
```

---

## SPEECH-TO-TEXT / DIKTÁLÁS (OPCIONÁLIS, AJÁNLOTT)

A szöveges feladatoknál a tanuló be is diktálhatja a választ. Web Speech API
(`SpeechRecognition` / `webkitSpeechRecognition`), `hu-HU` nyelvvel (a kérdések magyarul vannak).

### Kritikus helyességi szabályok (tesztelve)
- **Feature-detektálás:** ha nincs `SpeechRecognition`, a 🎤 gomb NE jelenjen meg (pl. iOS Safari)
  — maradjon a gépelés. Soha ne adj "halott" gombot.
- **User gesture megőrzése:** a `recognition.start()`-ot KÖZVETLENÜL a kattintás-handlerben hívd.
  NE tedd aszinkron `getUserMedia().then()` callbackbe — az elveszti a user activation-t, és a
  böngésző `not-allowed`-dal blokkol akkor is, ha az engedély rendben van.
- **`onend` ne írja felül a hibaüzenetet** (`hadError` flag).
- **Biztonságos kontextus:** `window.isSecureContext` ellenőrzés; csak HTTPS/localhost megy.
- **Iframe-kezelés:** ha a tananyag iframe-ben fut (pl. egy SPA jeleníti meg beágyazva), a szülő
  oldal Permissions Policy-ja letilthatja a mikrofont, ha az iframe-nek nincs `allow="microphone"`.
  - Detektáld: `window.self !== window.top`.
  - Iframe-ben adj figyelmeztetést + "Megnyitás saját ablakban" gombot, és `not-allowed` esetén a
    valódi okot magyarázd (beágyazás), ne a félrevezető "engedélyezd a lakatnál" üzenetet.
  - **A beágyazó oldalon** (nem a tananyagban) kell az `<iframe allow="microphone; autoplay">`.
- Aktív felismerés leállítása fülváltáskor és új feladatok generálásakor.

---

## MAGYAR ÉKEZETEK ÉS BETŰTÍPUSOK (ANDROID-KOMPATIBILITÁS) — v7.4, KÖTELEZŐ

**A hiba, amit ez a szakasz megelőz:** Android táblagépen és telefonon a tananyagok
ékezet nélkül vagy hibás betűkkel jelentek meg. Az ok nem a fájl kódolása, hanem az,
hogy a Google Fonts a magyar **ő (U+0151), Ő (U+0150), ű (U+0171), Ű (U+0170)** betűket
NEM a `latin`, hanem a `latin-ext` alkészletbe teszi. A többi magyar ékezet (á, é, í, ó,
ö, ú, ü) az U+0000–00FF tartományban van, ezért azok jók maradnak — pontosan ettől
tűnik úgy, mintha "véletlenszerűen" hiányoznának ékezetek.

Az Android WebView gyakran nem tölti le a `latin-ext` fájlt (a `unicode-range` alapú
lusta betöltés miatt), a `system-ui` kulcsszót pedig régebbi WebView-k nem ismerik fel,
így a fallback kiszámíthatatlan.

### A négy kötelező védelmi réteg

**1. Google Fonts URL — kérd expliciten a latin-ext alkészletet**

```html
<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&family=Poppins:wght@600;700;800&family=Cinzel:wght@600;700&subset=latin,latin-ext&display=swap" rel="stylesheet">
```

A `&subset=latin,latin-ext` paraméter nem hagyható el.

**2. Bővített font-fallback — SOHA ne `system-ui` legyen az első fallback**

Minden `font-family` deklarációban teljes láncot adj meg, Android rendszerfontokkal:

```css
/* kenyérszöveg */   font-family:'Nunito','Noto Sans',Roboto,'Droid Sans','DejaVu Sans',Arial,sans-serif;
/* címsorok */       font-family:'Poppins','Noto Sans',Roboto,'Droid Sans','DejaVu Sans',Arial,sans-serif;
/* díszbetű */       font-family:'Cinzel','Noto Serif',Roboto,Georgia,'DejaVu Serif',serif;
```

A `Noto Sans`, `Roboto` és `Droid Sans` Androidon natívan elérhető és teljes magyar
karakterkészlettel rendelkezik. TILOS a `system-ui` és a csupasz `sans-serif` fallback.

**3. Glyph-warmup elem — kényszerítsd ki a latin-ext letöltését**

A `<body>` legelejére, minden használt betűtípuscsaládra:

```html
<div class="[prefix]gw" aria-hidden="true">
  <i class="[prefix]gw1">ÁÉÍÓÖŐÚÜŰáéíóöőúüű</i>
  <i class="[prefix]gw2">ŐŰőűÖÜöü</i>
  <i class="[prefix]gw3">ŐŰőűÖÜöü</i>
</div>
```

```css
.[prefix]gw{position:fixed;top:-300px;left:0;opacity:0;pointer-events:none;font-size:1px;line-height:1;user-select:none;}
.[prefix]gw i{font-style:normal;}
.[prefix]gw .[prefix]gw1{font-family:<kenyérszöveg-stack>;}
.[prefix]gw .[prefix]gw2{font-family:<címsor-stack>;}
.[prefix]gw .[prefix]gw3{font-family:<díszbetű-stack>;}
```

`position:fixed` + negatív `top` — így nem okoz görgetést és vízszintes túlcsordulást sem.
Minden családhoz külön sor kell, mert a `latin-ext` fájl családonként külön töltődik le.

**4. Karakterkódolás megerősítése**

- A HTML fájlt **UTF-8 BOM**-mal mentsd (Pythonban: `encoding='utf-8-sig'`). Offline,
  fájlrendszerről megnyitott HTML-nél az Android WebView enélkül néha rosszul találgat.
- A `<head>` első két eleme:

```html
<meta charset="utf-8">
<meta http-equiv="Content-Type" content="text/html; charset=utf-8">
```

- A `<html lang="hu">` attribútum kötelező.

### Ami változatlan marad

A JS string-literálokban továbbra is `\uXXXX` escape-et használunk (`\u0151` = ő,
`\u0171` = ű), a kódazonosítók pedig ASCII-k. A megjelenítendő HTML-szövegben viszont
valódi UTF-8 ékezet áll — a fenti négy réteg éppen azt biztosítja, hogy ez minden
eszközön helyesen is jelenjen meg.

---

## TECHNIKAI KÖVETELMÉNYEK

### Kötelező
- **IIFE wrapper**: `(function(){ 'use strict'; ... })();`
- **ES5-kompatibilis** JS: `var`, hagyományos függvények, NINCS arrow function / template literal a
  kritikus utakon.
- **UTF-8 meta charset.**
- **Fontok: Google Fonts CDN** (Nunito, Poppins, Inter, Roboto, Orbitron stb.), KÖTELEZŐEN
  `&subset=latin,latin-ext&display=swap` paraméterrel és bővített fallback-lánccal — lásd a
  "MAGYAR ÉKEZETEK ÉS BETŰTÍPUSOK" szakaszt. **NE használj Segoe UI-t vagy `system-ui`-t
  elsődleges/első fallback fontként** (Androidon nem megbízható, eltűnik tőle az ő és ű).
- **CSS prefix**: minden osztálynév egyedi prefix-szel (pl. `cu-tab`, `cu-card`) — kivétel nélkül.
- **Reszponzív**: 320px–2560px között minden töréspontnál működik, vízszintes túlcsordulás nélkül.
- **TILOS**: `alert()`, `confirm()`, `prompt()` – csak HTML modal, callback-mintával.
- **TILOS**: inline JSON `onclick` attribútumban – globális változó + `addEventListener` (a magyar
  ékezetek elronthatják az inline JSON-t).
- **TILOS**: accordion / `<details>` / collapsible — minden tartalom mindig látszódjon.
- **Magyar karakterek**: megjelenítendő szövegben valódi UTF-8 ékezet; JS string-literálokban
  `\uXXXX` escape; kódazonosítók (változó, függvény, CSS class) CSAK ASCII.
- **TILOS** smart/tipográfiai idézőjel (`„"`) JS string-literálban; cirill karakter a kódban.
- **Touch events** minden interaktív elemnél; min. 44px kattintható terület.

### Fájlstruktúra
- Egyetlen önálló HTML fájl (CSS + JS beágyazva), **UTF-8 BOM-mal mentve** (`utf-8-sig`).
- Külső dependencia csak CDN-ről (Google Fonts).
- Fájlnév: `[tema]-tananyag-v7.html` (ékezetmentesen, kötőjellel).

### Build workflow (ajánlott)
1. Olvasd be ezt a SKILL.md-t.
2. Ha kell, web-kutatás a NAT 2020 tananyagtartalomhoz.
3. Moduláris Python scriptek: adatfájl → CSS → TAB1-4 → modal → IIFE-be ágyazott JS → assembler.
   Egyszeres idézőjeles heredoc (`python3 << 'PYEOF'`) a shell-interpoláció elkerülésére.
4. Assembly után: cseréld le az esetleges tipográfiai idézőjeleket ASCII-ra a JS-blokkban.
5. Ékezet-háló: Google Fonts URL-be `&subset=latin,latin-ext`, minden `font-family`
   bővített fallback-láncra, glyph-warmup elem a `<body>` elejére, mentés `utf-8-sig`-gel.
6. Validálás: `node -c` a JS-re, majd a verify checklist.
7. Másold a `/mnt/user-data/outputs/` mappába, és add át a `present_files` tool-lal.

---

## VALIDÁLÁSI ELVÁRÁS (build után kötelező)

### Kiértékelő motor önteszt
- Mind a `sample` mintaválasz a SAJÁT feladatára ✅ eredményt adjon.
- Üres válasz → minden feladatnál ❌.
- Rossz válasz → túlnyomórészt ❌.

### TTS (idegen nyelvnél)
- Minden idegen szó/példamondat mellett van `data-tts` és 🔊 gomb.
- A felolvasandó szöveg idegen nyelvű (nem magyar).

### Általános minőségellenőrzési lista
- [ ] 1. oldal: korosztálynak megfelelő szókincs?
- [ ] 1. oldal: idegen nyelvnél szószedet + TTS minden idegen elemnél?
- [ ] 2. oldal: mind a 10 kognitív elem szerepel?
- [ ] 2. oldal: dragdrop touch eventekkel + ujjkövetéssel?
- [ ] 3. oldal: minden feladat az 1. oldal tartalmából?
- [ ] 3. oldal: háromrétegű motor (required/bonus/minWords/needsSentence/sample)?
- [ ] 3. oldal: háromállapotú kimenet (✅/🟡/❌) + mintaválasz gomb?
- [ ] 3. oldal: Újragenerálás gomb TETEJÉN, Kiértékelés ALJÁN?
- [ ] 3. oldal: matematikailag helyes pontszámítás (fél pontokkal)?
- [ ] 4. oldal: Újragenerálás TETEJÉN, Kiértékelés ALJÁN, helyes pontszámítás?
- [ ] Nincs egyetlen `alert/confirm/prompt` sem?
- [ ] Nincs accordion/`<details>`?
- [ ] Minden interaktív elem min. 44px?
- [ ] CSS prefix következetes mindenhol?
- [ ] IIFE wrapper + `'use strict'`?
- [ ] Google Fonts CDN `&subset=latin,latin-ext&display=swap` paraméterrel?
- [ ] Minden `font-family` bővített fallback-lánccal (Noto Sans / Roboto / Droid Sans), `system-ui` sehol?
- [ ] Glyph-warmup elem a `<body>` elején, minden betűtípuscsaládra külön sorral?
- [ ] A fájl UTF-8 BOM-mal mentve, `<meta charset>` + `http-equiv` egyaránt jelen?
- [ ] Az ő/ű betűk helyesen jelennek meg Android Chrome-ban is?
- [ ] `node -c` a JS-blokkra hibátlan?
- [ ] Nincs cirill / tipográfiai idézőjel a JS-ben?
- [ ] Reszponzív 320–2560px, 0 vízszintes túlcsordulás?

---

## MENNYISÉGEK

| Típus | Generált | Megjelenített |
|-------|----------|---------------|
| Szöveges feladat | 45 | 15 (véletlenszerű) |
| Kvízkérdés | 75 | 25 (véletlenszerű) |
| Kognitív elem | min. 10 | mind (2. oldalon) |

---

## KORLÁTOK (ŐSZINTÉN)

A kiértékelő motor nem érti a jelentést, csak fogalmakat illeszt okosabban. A 🟡 kategória pont
azért van, hogy a bizonytalan eseteket emberi átnézésre adja. A koherencia-kapu heurisztikus.
A legbiztosabb minőség továbbra is a gondos feladat-tervezésből (jó `required` fogalmak + valódi
`sample`) jön.

A TTS és a diktálás böngésző- és eszközfüggő: Chrome / Android Chrome a legmegbízhatóbb, iOS
Safari korlátozottabb (a diktálás ott jellemzően nem érhető el — a feature-detektálás emiatt
kötelező). Mindkettő HTTPS-t és (diktálásnál) mikrofon-engedélyt igényel.

---

## KIMENETI FORMAT

A kész HTML fájlt mentsd `/mnt/user-data/outputs/[tema]-tananyag-v7.html` helyre, majd használd a
`present_files` tool-t a letölthetővé tételhez.
