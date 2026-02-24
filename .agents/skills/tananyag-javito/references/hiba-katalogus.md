# Tananyag HTML Hiba Katalógus – v7.1

---

## 1. STRUKTÚRA HIBÁK

### 1.1 Régi 3 oldalas → Új 4 oldalas struktúra

**v6 (RÉGI):** Tananyag | Feladatok | Kvíz

**v7.1 (HELYES):** 📖 Tananyag | 🧠 Módszerek | ✏️ Feladatok | 🎯 Kvíz

**Hiányzó Módszerek oldal pótlása:**
```html
<!-- 2. TAB GOMB hozzáadása a nav-hoz: -->
<button class="PREFIX-tab-btn" data-tab="p2" onclick="PREFIX_showTab('p2')">
  🧠 Módszerek
</button>

<!-- 2. OLDAL DIV hozzáadása: -->
<div id="p2" class="PREFIX-tab-content" style="display:none">
  <!-- Min. 10 kognitív elem kerül ide -->
  <!-- prediction-box, gate-question, myth-box, dragdrop-box, -->
  <!-- cause-effect, conflict-box, self-check, popup-trigger, -->
  <!-- timeline, analogy-box -->
</div>
```

---

## 2. CSONKOLÁS HIBÁK

### 2.1 JavaScript csonkolás – befejezetlen tömb

```javascript
// HIBÁS (csonkolt):
const quizBank = [
  { q: "Mi a fotoszintézis?", opts: ["Energia", "Légzés", "Anyagcsere"
  // << VÉGE

// JAVÍTOTT (v7.1 – 3 válasz!):
const quizBank = [
  { q: "Mi a fotoszintézis?", opts: ["Fényenergia → kémiai energia", "Sejtlégzés", "Anyagcsere"], correct: 0 }
];
```

### 2.2 JavaScript csonkolás – befejezetlen függvény

```javascript
// HIBÁS:
function evaluateQuiz() {
  let score = 0;
  currentQuiz.forEach(q => {
  // << VÉGE

// JAVÍTOTT:
function evaluateQuiz() {
  let score = 0;
  currentQuiz.forEach((q, i) => {
    const chosen = quizAnswers[i];
    if (chosen === q.correct) score++;
  });
  const pct = Math.round((score / currentQuiz.length) * 100);
  showQuizResult(score, pct);
}
```

### 2.3 HTML csonkolás – hiányzó záró tagek

```html
<!-- HIBÁS: -->
<div class="quiz-container">
  <div class="question">
    <h3>1. kérdés</h3>
    <!-- << VÉGE -->

<!-- JAVÍTOTT: -->
<div class="quiz-container">
  <div class="question">
    <h3>1. kérdés</h3>
  </div>
</div>
```

---

## 3. TILTOTT ELEMEK (v7.1)

### 3.1 alert() / confirm() / prompt() – TILOS

```javascript
// ❌ TILOS:
alert('Biztosan beküldöd?');
if (confirm('Újraindítod?')) { ... }

// ✅ HELYES – HTML modal:
document.getElementById('PREFIX-overlay').classList.add('show');
// A modal tartalmaz Igen/Mégse gombokat addEventListener-rel
```

**Teljes modal implementáció:**
```html
<div class="PREFIX-overlay" id="PREFIX-overlay">
  <div class="PREFIX-modal">
    <h3>Biztosan beküldöd?</h3>
    <p>Az értékelés után nem módosíthatod a válaszaid.</p>
    <div class="PREFIX-modal-btns">
      <button id="PREFIX-cancel-btn">Mégse</button>
      <button id="PREFIX-confirm-btn">Igen, beküldöm!</button>
    </div>
  </div>
</div>

<script>
(function() {
  document.getElementById('PREFIX-cancel-btn').addEventListener('click', function() {
    document.getElementById('PREFIX-overlay').classList.remove('show');
  });
  document.getElementById('PREFIX-confirm-btn').addEventListener('click', function() {
    document.getElementById('PREFIX-overlay').classList.remove('show');
    evaluateQuiz(); // vagy evaluateExercises()
  });
})();
</script>
```

### 3.2 Inline JSON onclick – TILOS

```javascript
// ❌ TILOS (ékezetek eltörnek):
<button onclick='saveResult({"eredmény":"Jeles","pont":95})'>Mentés</button>

// ✅ HELYES – globális változó + addEventListener:
let resultData = null;
// Értékelés után:
resultData = { eredmény: 'Jeles', pont: 95, ... };
// Gomb:
document.getElementById('PREFIX-save-btn').addEventListener('click', function() {
  if (!resultData) return;
  const blob = new Blob([JSON.stringify(resultData, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'eredmeny.json';
  a.click();
  URL.revokeObjectURL(a.href);
});
```

---

## 4. IIFE WRAPPER HIÁNY

```javascript
// ❌ HIÁNYZIK:
const exerciseBank = [...];
let currentExercises = [];
function initExercises() { ... }

// ✅ JAVÍTVA:
(function() {
  'use strict';

  const exerciseBank = [...];
  let currentExercises = [];

  function initExercises() { ... }

  // Tab váltó globálisan kell! (window-ra)
  window.PREFIX_showTab = function(id) { ... };

})();
```

**Fontos:** A tab-váltó és egyéb onclick-ből hívott függvényeket `window.PREFIX_fn = function()` formában kell deklarálni az IIFE-n belül!

---

## 5. TOUCH EVENTS HIÁNY

### 5.1 Dragdrop – csak mouse → touch is kell

```javascript
// ❌ HIÁNYOS:
item.setAttribute('draggable', 'true');
item.addEventListener('dragstart', function(e) {
  dragValue = e.target.dataset.value;
});

// ✅ TELJES v7.1:
item.setAttribute('draggable', 'true');
item.style.touchAction = 'none';

// Mouse drag
item.addEventListener('dragstart', function(e) {
  dragValue = e.target.dataset.value;
  e.target.style.opacity = '0.5';
});
item.addEventListener('dragend', function(e) {
  e.target.style.opacity = '';
});

// Touch drag
item.addEventListener('touchstart', function(e) {
  e.preventDefault();
  dragValue = e.target.dataset.value;
  e.target.style.opacity = '0.5';
}, { passive: false });

item.addEventListener('touchmove', function(e) {
  e.preventDefault();
}, { passive: false });

item.addEventListener('touchend', function(e) {
  e.preventDefault();
  e.target.style.opacity = '';
  const touch = e.changedTouches[0];
  const el = document.elementFromPoint(touch.clientX, touch.clientY);
  if (el && el.classList.contains('PREFIX-drop-zone')) {
    handleDrop(el);
  }
});

// Drop zone
zone.addEventListener('dragover', function(e) { e.preventDefault(); });
zone.addEventListener('drop', function(e) {
  e.preventDefault();
  handleDrop(e.target);
});

function handleDrop(zone) {
  if (!dragValue) return;
  zone.textContent = dragValue;
  const correct = zone.dataset.answer === dragValue;
  zone.style.color = correct ? '#00b894' : '#e17055';
  dragValue = null;
}
```

---

## 6. KVÍZ HIBÁK (v7.1)

### 6.1 4 válasz → 3 válasz javítás

```javascript
// ❌ RÉGI v6 (4 válasz):
{ q: 'Kérdés?', opts: ['A', 'B', 'C', 'D'], correct: 0 }

// ✅ ÚJ v7.1 (3 válasz):
{ q: 'Kérdés?', opts: ['A', 'B', 'C'], correct: 0 }
```

### 6.2 Hiányzó Újragenerálás gomb a tetején

```html
<!-- TETEJÉN kötelező: -->
<button class="PREFIX-regen-btn" id="PREFIX-quiz-regen">🔄 Új kérdések</button>
<div id="PREFIX-quiz-container"></div>
<!-- ALJÁN kötelező: -->
<button class="PREFIX-eval-btn" id="PREFIX-quiz-eval">✅ Kiértékelés</button>
```

```javascript
document.getElementById('PREFIX-quiz-regen').addEventListener('click', function() {
  // Ha van félkész kitöltés, confirm modal
  if (Object.keys(quizAnswers).length > 0) {
    pendingAction = 'regenQuiz';
    document.getElementById('PREFIX-overlay').classList.add('show');
  } else {
    initQuiz();
  }
});
```

### 6.3 Kötelező kvíz funkciók

```javascript
let quizBank = [/* 75 kérdés */];
let currentQuiz = [];
let quizAnswers = {};

function PREFIX_initQuiz() {
  currentQuiz = PREFIX_shuffle(quizBank).slice(0, 25);
  quizAnswers = {};
  renderQuiz();
}

function renderQuiz() {
  document.getElementById('PREFIX-quiz-container').innerHTML =
    currentQuiz.map((q, i) => `
      <div class="PREFIX-quiz-item" id="PREFIX-qitem-${i}">
        <p><strong>${i+1}. ${q.q}</strong></p>
        ${q.opts.map((opt, j) => `
          <button class="PREFIX-opt" id="PREFIX-opt-${i}-${j}"
            onclick="PREFIX_selectOpt(${i},${j})">
            ${'ABC'[j]}) ${opt}
          </button>
        `).join('')}
      </div>
    `).join('');
}

window.PREFIX_selectOpt = function(qi, oi) {
  if (quizAnswers[qi] !== undefined) return;
  document.querySelectorAll(`#PREFIX-qitem-${qi} .PREFIX-opt`)
    .forEach(b => b.classList.remove('selected'));
  document.getElementById(`PREFIX-opt-${qi}-${oi}`).classList.add('selected');
  quizAnswers[qi] = oi;
};
```

---

## 7. FELADAT HIBÁK (v7.1)

### 7.1 Hiányzó Újragenerálás gomb a tetején

```html
<!-- TETEJÉN kötelező: -->
<button id="PREFIX-ex-regen">🔄 Új feladatok</button>
<div id="PREFIX-ex-container"></div>
<!-- ALJÁN kötelező: -->
<button id="PREFIX-ex-eval">✅ Kiértékelés</button>
```

### 7.2 Szinonima-alapú kiértékelés (NEM szó szerinti)

```javascript
// ❌ HELYTELEN (szó szerinti egyezés):
const ok = answer === ex.answer;

// ✅ HELYES v7.1 (kulcsszó alapú):
function evaluateAnswer(answer, keywords) {
  const lower = answer.toLowerCase();
  const hits = keywords.filter(kw => lower.includes(kw.toLowerCase()));
  return hits.length / keywords.length;
}
// Elfogadás: ha >= 0.5 (legalább 50% kulcsszó megvan)
const ok = evaluateAnswer(answer, ex.keywords) >= 0.5;
```

---

## 8. KOGNITÍV ELEMEK (2. oldal) – HIÁNYZÓ IMPLEMENTÁCIÓK

### 8.1 Gate Question

```html
<div class="PREFIX-gate">
  <h4>🚪 Kapukérdés</h4>
  <p>Kérdés szövege?</p>
  <button class="PREFIX-gate-opt" onclick="PREFIX_checkGate(1,this,false)">A) Rossz</button>
  <button class="PREFIX-gate-opt" onclick="PREFIX_checkGate(1,this,true)">B) Helyes</button>
  <div id="PREFIX-gate-fb-1" style="display:none"></div>
</div>
```

```javascript
window.PREFIX_checkGate = function(id, el, correct) {
  el.closest('.PREFIX-gate').querySelectorAll('.PREFIX-gate-opt')
    .forEach(b => b.style.pointerEvents = 'none');
  const fb = document.getElementById('PREFIX-gate-fb-' + id);
  fb.style.display = 'block';
  fb.textContent = correct ? '✅ Helyes!' : '❌ Nem ez a helyes válasz.';
  fb.style.color = correct ? '#00b894' : '#e17055';
};
```

### 8.2 Self-Check Slider

```html
<div class="PREFIX-self-check">
  <h4>🎯 Mennyire érted a tananyagot?</h4>
  <input type="range" min="0" max="100" value="50"
    oninput="PREFIX_updateSelf(1, this.value)" style="width:100%">
  <div>Tudásszint: <span id="PREFIX-self-lbl-1">50</span>%</div>
</div>
```

```javascript
window.PREFIX_updateSelf = function(id, val) {
  document.getElementById('PREFIX-self-lbl-' + id).textContent = val;
};
```

### 8.3 Myth Box

```html
<div class="PREFIX-myth">
  <h4>🤔 Igaz vagy hamis?</h4>
  <p>"Tévhit szövege..."</p>
  <button class="PREFIX-myth-btn" onclick="PREFIX_revealMyth(1)">Megmutatom a választ</button>
  <div id="PREFIX-myth-reveal-1" style="display:none">
    Valójában: helyes magyarázat...
  </div>
</div>
```

```javascript
window.PREFIX_revealMyth = function(id) {
  document.getElementById('PREFIX-myth-reveal-' + id).style.display = 'block';
};
```

---

## 9. NAVIGÁCIÓS HIBÁK (v7.1 – 4 tab)

### 9.1 Helyes tab struktúra

```html
<nav class="PREFIX-nav">
  <button class="PREFIX-tab-btn active" onclick="PREFIX_showTab('p1')">📖 Tananyag</button>
  <button class="PREFIX-tab-btn" onclick="PREFIX_showTab('p2')">🧠 Módszerek</button>
  <button class="PREFIX-tab-btn" onclick="PREFIX_showTab('p3')">✏️ Feladatok</button>
  <button class="PREFIX-tab-btn" onclick="PREFIX_showTab('p4')">🎯 Kvíz</button>
</nav>
```

```javascript
window.PREFIX_showTab = function(id) {
  document.querySelectorAll('.PREFIX-tab-content').forEach(t => t.style.display = 'none');
  document.querySelectorAll('.PREFIX-tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(id).style.display = 'block';
  document.querySelector(`[onclick="PREFIX_showTab('${id}')"]`).classList.add('active');
  if (id === 'p3' && currentExercises.length === 0) PREFIX_initExercises();
  if (id === 'p4' && currentQuiz.length === 0) PREFIX_initQuiz();
};
```

---

## 10. CSS HIBÁK

### 10.1 Hiányzó min-height gombokon

```css
/* ✅ KÖTELEZŐ minden kattintható elemen: */
.PREFIX-tab-btn,
.PREFIX-opt,
.PREFIX-eval-btn,
.PREFIX-regen-btn,
.PREFIX-gate-opt,
.PREFIX-myth-btn {
  min-height: 44px;
}
```

### 10.2 Hiányzó reszponzivitás

```css
/* Alap reszponzív (320px–2560px) */
* { box-sizing: border-box; }
body {
  font-family: Segoe UI, Noto Sans, system-ui, sans-serif;
  background: #f0f4ff;
}
.PREFIX-nav {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 8px;
  position: sticky;
  top: 0;
  z-index: 100;
}
.PREFIX-tab-btn {
  flex: 1;
  min-width: 70px;
  font-size: clamp(11px, 2vw, 15px);
  padding: clamp(8px, 2vw, 14px);
  min-height: 44px;
}
.PREFIX-page {
  max-width: 900px;
  margin: 0 auto;
  padding: clamp(12px, 4vw, 32px);
}
@media (max-width: 480px) {
  .PREFIX-tab-btn { font-size: 11px; padding: 8px 4px; }
}
@media (min-width: 1400px) {
  .PREFIX-page { max-width: 1100px; }
}
```

---

## 11. ÉRTÉKELÉSI FUNKCIÓK (v7.1)

### 11.1 Osztályzat számítás

```javascript
function PREFIX_getGrade(p) {
  if (p >= 90) return { num: 5, text: '🏆 Jeles' };
  if (p >= 75) return { num: 4, text: '😊 Jó' };
  if (p >= 60) return { num: 3, text: '🙂 Közepes' };
  if (p >= 40) return { num: 2, text: '😐 Elégséges' };
  return { num: 1, text: '😞 Elégtelen' };
}
```

### 11.2 JSON mentés (biztonságos, ékezetekkel)

```javascript
// Globális változó az eredménynek:
let resultData = null;

// Értékelés után töltsd fel:
resultData = {
  type: 'kviz',
  correct: score,
  total: 25,
  percent: pct,
  grade: PREFIX_getGrade(pct),
  details: [...],
  date: new Date().toISOString()
};

// Gombhoz addEventListener (NEM onclick attribútum!):
document.getElementById('PREFIX-save-btn').addEventListener('click', function() {
  if (!resultData) return;
  const blob = new Blob([JSON.stringify(resultData, null, 2)], {type: 'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'eredmeny.json';
  a.click();
  URL.revokeObjectURL(a.href);
});
```

---

## 12. SHUFFLE SEGÉDFÜGGVÉNY

```javascript
function PREFIX_shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
```

---

## 📊 VERZIÓ

**v2.0** – 2025-02 – Szinkronizálva Tananyag Készítő v7.1-gyel
