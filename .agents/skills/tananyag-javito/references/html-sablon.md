# Tananyag HTML Sablon – v7.1 (4 oldalas)

Ez a referencia a teljes v7.1-es sablon struktúrát tartalmazza javításhoz/összehasonlításhoz.

---

## KÖTELEZŐ HTML VÁZA

```html
<!DOCTYPE html>
<html lang="hu">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>[TÉMA] – Tananyag</title>
  <style>
    /* PREFIX: XX- (2-3 betű, téma alapján, pl. fo-, mk-, tr-) */
    :root {
      --primary: [SZÍN];
      --success: #00b894;
      --error: #e17055;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Segoe UI, Noto Sans, system-ui, sans-serif; background: #f0f4ff; }

    /* ── NAV ─────────────────────────────────────────────── */
    .XX-nav {
      display: flex; flex-wrap: wrap; gap: 4px; padding: 8px;
      background: var(--primary); position: sticky; top: 0; z-index: 100;
    }
    .XX-nav button {
      flex: 1; min-width: 70px; border: none; border-radius: 8px; cursor: pointer;
      background: rgba(255,255,255,0.2); color: #fff;
      font-size: clamp(11px,2vw,15px); padding: clamp(8px,2vw,14px);
      min-height: 44px; transition: background 0.2s;
    }
    .XX-nav button.active, .XX-nav button:hover { background: rgba(255,255,255,0.4); }

    /* ── PAGES ───────────────────────────────────────────── */
    .XX-page {
      display: none; max-width: 900px; margin: 0 auto;
      padding: clamp(12px,4vw,32px);
    }
    .XX-page.active { display: block; animation: XX-fadeIn 0.4s ease; }

    /* ── CONFIRM MODAL ───────────────────────────────────── */
    .XX-overlay {
      display: none; position: fixed; inset: 0;
      background: rgba(0,0,0,0.5); z-index: 1000;
      justify-content: center; align-items: center;
    }
    .XX-overlay.show { display: flex; }
    .XX-modal {
      background: #fff; border-radius: 16px; padding: 32px;
      text-align: center; max-width: 340px; width: 90%;
      animation: XX-popIn 0.3s ease;
    }
    .XX-modal h3 { margin-bottom: 12px; color: var(--primary); }
    .XX-modal-btns { display: flex; gap: 12px; justify-content: center; margin-top: 20px; }
    .XX-modal-btns button {
      padding: 12px 24px; border: none; border-radius: 8px;
      cursor: pointer; font-size: 15px; min-height: 44px;
    }

    /* ── KOGNITÍV ELEMEK (2. oldal) ──────────────────────── */
    .XX-prediction { background: #fff3e0; border-left: 4px solid #ff9800; border-radius: 8px; padding: 16px; margin: 16px 0; }
    .XX-gate       { background: #e8f5e9; border-left: 4px solid #4caf50; border-radius: 8px; padding: 16px; margin: 16px 0; }
    .XX-myth       { background: #fce4ec; border-left: 4px solid #e91e63; border-radius: 8px; padding: 16px; margin: 16px 0; }
    .XX-conflict   { background: #fff8e1; border: 2px dashed #ffc107; border-radius: 8px; padding: 16px; margin: 16px 0; }
    .XX-self-check { background: #f3e5f5; border-radius: 8px; padding: 16px; margin: 16px 0; }
    .XX-cause-effect {
      display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
      background: #e3f2fd; border-radius: 8px; padding: 16px; margin: 16px 0;
    }
    .XX-cause, .XX-effect {
      flex: 1; min-width: 120px; background: #fff;
      border-radius: 8px; padding: 12px; text-align: center;
    }
    .XX-dragdrop { background: #e8eaf6; border-radius: 8px; padding: 16px; margin: 16px 0; }
    .XX-drop-zone {
      display: inline-block; min-width: 80px; min-height: 28px;
      border-bottom: 2px solid var(--primary); margin: 0 4px;
      padding: 2px 8px; background: rgba(255,255,255,0.7);
      border-radius: 4px; vertical-align: middle;
    }
    .XX-drag-item {
      display: inline-block; background: var(--primary); color: #fff;
      padding: 6px 14px; border-radius: 20px; margin: 4px;
      cursor: grab; min-height: 44px; line-height: 32px;
      touch-action: none; user-select: none;
    }
    .XX-gate-opt, .XX-myth-btn {
      display: block; width: 100%; text-align: left;
      padding: 12px 16px; margin: 6px 0; border: 2px solid #ddd;
      border-radius: 8px; cursor: pointer; min-height: 44px;
      background: #fff; font-size: clamp(13px,2vw,15px);
      transition: border-color 0.2s;
    }
    .XX-gate-opt:hover, .XX-myth-btn:hover { border-color: var(--primary); }

    /* ── FELADATOK / KVÍZ ────────────────────────────────── */
    .XX-exercise, .XX-quiz-item {
      background: #fff; border-radius: 12px; padding: 20px;
      margin: 12px 0; box-shadow: 0 2px 8px rgba(0,0,0,0.08);
    }
    .XX-exercise textarea {
      width: 100%; min-height: 80px; border: 2px solid #ddd;
      border-radius: 8px; padding: 10px; font-family: inherit;
      font-size: clamp(13px,2vw,15px); resize: vertical;
    }
    .XX-opt {
      display: block; width: 100%; text-align: left;
      padding: 12px 16px; margin: 6px 0; border: 2px solid #ddd;
      border-radius: 8px; cursor: pointer; min-height: 44px;
      background: #fff; font-size: clamp(13px,2vw,15px);
      transition: border-color 0.2s, background 0.2s;
    }
    .XX-opt:hover    { border-color: var(--primary); background: #f8f9ff; }
    .XX-opt.selected { border-color: var(--primary); background: #e8eeff; }
    .XX-opt.correct  { border-color: var(--success); background: #e8f8f3; }
    .XX-opt.wrong    { border-color: var(--error); background: #fff0ee; animation: XX-shake 0.4s; }

    /* ── ACTION BUTTONS ──────────────────────────────────── */
    .XX-btn-primary {
      background: var(--primary); color: #fff; border: none;
      padding: 14px 28px; border-radius: 10px; font-size: 16px;
      cursor: pointer; min-height: 44px; margin: 8px 4px;
    }
    .XX-btn-secondary {
      background: #eee; color: #333; border: none;
      padding: 14px 28px; border-radius: 10px; font-size: 16px;
      cursor: pointer; min-height: 44px; margin: 8px 4px;
    }

    /* ── RESULT ──────────────────────────────────────────── */
    .XX-result {
      background: #fff; border-radius: 16px; padding: 32px;
      text-align: center; margin: 20px 0;
    }
    .XX-grade {
      font-size: clamp(40px,10vw,72px); font-weight: bold;
      color: var(--primary); animation: XX-popIn 0.5s ease;
    }

    /* ── ANIMATIONS ──────────────────────────────────────── */
    @keyframes XX-fadeIn { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
    @keyframes XX-popIn  { 0%{opacity:0;transform:scale(0.5)} 100%{opacity:1;transform:scale(1)} }
    @keyframes XX-shake  { 0%,100%{transform:translateX(0)} 50%{transform:translateX(-8px)} }

    /* ── RESPONSIVE ──────────────────────────────────────── */
    @media (max-width: 480px) {
      .XX-nav button { font-size: 11px; padding: 8px 4px; }
      .XX-cause-effect { flex-direction: column; }
    }
    @media (min-width: 1400px) {
      .XX-page { max-width: 1100px; }
    }
  </style>
</head>
<body>

<!-- ═══ CONFIRM MODAL (minden értékeléshez) ═════════════════ -->
<div class="XX-overlay" id="XX-overlay">
  <div class="XX-modal">
    <h3>Biztosan beküldöd?</h3>
    <p>Az értékelés után nem módosíthatod a válaszaid.</p>
    <div class="XX-modal-btns">
      <button id="XX-cancel-btn" style="background:#eee">Mégse</button>
      <button id="XX-confirm-btn" style="background:var(--primary);color:#fff">Igen!</button>
    </div>
  </div>
</div>

<!-- ═══ NAVIGÁCIÓ (4 tab) ════════════════════════════════════ -->
<nav class="XX-nav">
  <button class="active" onclick="XX_showTab('p1')">📖 Tananyag</button>
  <button onclick="XX_showTab('p2')">🧠 Módszerek</button>
  <button onclick="XX_showTab('p3')">✏️ Feladatok</button>
  <button onclick="XX_showTab('p4')">🎯 Kvíz</button>
</nav>

<!-- ═══ 1. OLDAL – TANANYAG ══════════════════════════════════ -->
<div class="XX-page active" id="p1">
  <!-- Részletes lexikális tartalom:
       - fejezetek, alfejezetek
       - definíciók, példák
       - info-box, warning-box
       - vizuális kártyák (szöveges, NEM emoji képek)
       - ciklus/folyamat diagramok -->
</div>

<!-- ═══ 2. OLDAL – MÓDSZEREK (min. 10 kognitív elem) ════════ -->
<div class="XX-page" id="p2">

  <!-- 1. PREDICTION -->
  <div class="XX-prediction">
    <h4>🔮 Mit gondolsz?</h4>
    <p>Kérdés...</p>
    <textarea id="XX-pred-1" placeholder="Írd le a tippjedet..."></textarea>
    <button class="XX-btn-secondary" onclick="document.getElementById('XX-pred-reveal-1').style.display='block'">
      Megmutatom a választ
    </button>
    <div id="XX-pred-reveal-1" style="display:none;padding:12px;background:#fff;border-radius:8px;margin-top:8px">
      A valós válasz...
    </div>
  </div>

  <!-- 2-3. GATE QUESTIONS (2-3 db) -->
  <div class="XX-gate">
    <h4>🚪 Kapukérdés 1</h4>
    <p>Kérdés?</p>
    <button class="XX-gate-opt" onclick="XX_checkGate(1,this,false)">A) Rossz válasz</button>
    <button class="XX-gate-opt" onclick="XX_checkGate(1,this,true)">B) Helyes válasz</button>
    <div id="XX-gate-fb-1" style="display:none;margin-top:8px;font-weight:bold"></div>
  </div>

  <!-- 4. MYTH BOX -->
  <div class="XX-myth">
    <h4>🤔 Igaz vagy hamis?</h4>
    <p>"Tévhit szövege..."</p>
    <button class="XX-myth-btn" onclick="XX_revealMyth(1)">Megmutatom a választ</button>
    <div id="XX-myth-reveal-1" style="display:none;padding:12px;background:#fff;border-radius:8px;margin-top:8px">
      Valójában: magyarázat...
    </div>
  </div>

  <!-- 5. DRAG & DROP -->
  <div class="XX-dragdrop">
    <h4>🎯 Húzd a helyére!</h4>
    <p>A [fogalom] <span class="XX-drop-zone" data-answer="helyes"></span> jellemzője.</p>
    <div style="margin-top:8px">
      <span class="XX-drag-item" draggable="true" data-value="helyes">helyes</span>
      <span class="XX-drag-item" draggable="true" data-value="rossz">rossz</span>
    </div>
  </div>

  <!-- 6. CAUSE-EFFECT -->
  <div class="XX-cause-effect">
    <div class="XX-cause">🌱 OK<br><small>Ha...</small></div>
    <div style="font-size:24px;color:var(--primary)">→</div>
    <div class="XX-effect">🌊 HATÁS<br><small>Akkor...</small></div>
  </div>

  <!-- 7. CONFLICT BOX -->
  <div class="XX-conflict">
    <h4>⚡ Meglepő tény!</h4>
    <p>Váratlan, elgondolkodtató információ a témáról...</p>
  </div>

  <!-- 8. SELF CHECK -->
  <div class="XX-self-check">
    <h4>🎯 Mennyire érted a tananyagot?</h4>
    <input type="range" min="0" max="100" value="50"
      oninput="XX_updateSelf(1,this.value)" style="width:100%;margin:8px 0">
    <div>Tudásszint: <span id="XX-self-lbl-1">50</span>%</div>
  </div>

  <!-- 9. POPUP TRIGGER -->
  <button class="XX-btn-secondary" onclick="XX_showPopup(1)" style="margin:12px 0">
    💡 Kattints egy meglepetés kérdésért!
  </button>
  <div id="XX-popup-1" style="display:none;background:#fff;border-radius:12px;padding:20px;margin:8px 0">
    Popup kérdés vagy tény szövege...
  </div>

  <!-- 10. ANALOGY BOX -->
  <div style="background:#e0f7fa;border-left:4px solid #00bcd4;border-radius:8px;padding:16px;margin:16px 0">
    <h4>💡 Gondolj így rá!</h4>
    <p>Korosztályhoz illő hasonlat, ami köti az új fogalmat a meglévő tudáshoz...</p>
  </div>

</div>

<!-- ═══ 3. OLDAL – FELADATOK ═════════════════════════════════ -->
<div class="XX-page" id="p3">
  <!-- TETEJÉN: Újragenerálás -->
  <button class="XX-btn-secondary" id="XX-ex-regen">🔄 Új feladatok</button>
  <div id="XX-ex-container"></div>
  <!-- ALJÁN: Kiértékelés -->
  <button class="XX-btn-primary" id="XX-ex-eval">✅ Kiértékelés</button>
  <div id="XX-ex-result" style="display:none"></div>
</div>

<!-- ═══ 4. OLDAL – KVÍZ ═══════════════════════════════════════ -->
<div class="XX-page" id="p4">
  <!-- TETEJÉN: Újragenerálás -->
  <button class="XX-btn-secondary" id="XX-quiz-regen">🔄 Új kérdések</button>
  <div id="XX-quiz-container"></div>
  <!-- ALJÁN: Kiértékelés -->
  <button class="XX-btn-primary" id="XX-quiz-eval">✅ Kiértékelés</button>
  <div id="XX-quiz-result" style="display:none"></div>
</div>

<script>
(function() {
  'use strict';

  // ── EXERCISE BANK (45 feladat) ───────────────────────────
  const exerciseBank = [
    // { q: 'Kérdés?', keywords: ['kulcs1','kulcs2','szinonima'] }
    // ... 45 db
  ];

  // ── QUIZ BANK (75 kérdés, 3 válasz!) ────────────────────
  const quizBank = [
    // { q: 'Kérdés?', opts: ['A válasz', 'B válasz', 'C válasz'], correct: 0 }
    // ... 75 db
  ];

  // ── STATE ────────────────────────────────────────────────
  let currentExercises = [];
  let currentQuiz = [];
  let quizAnswers = {};
  let pendingAction = null;
  let exResultData = null;
  let quizResultData = null;

  // ── SHUFFLE ──────────────────────────────────────────────
  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // ── TAB NAVIGÁCIÓ ────────────────────────────────────────
  window.XX_showTab = function(id) {
    document.querySelectorAll('.XX-page').forEach(p => {
      p.classList.remove('active');
    });
    document.querySelectorAll('.XX-nav button').forEach((b, i) => {
      b.classList.remove('active');
      if (['p1','p2','p3','p4'][i] === id) b.classList.add('active');
    });
    document.getElementById(id).classList.add('active');
    if (id === 'p3' && currentExercises.length === 0) initExercises();
    if (id === 'p4' && currentQuiz.length === 0) initQuiz();
  };

  // ── EXERCISES ────────────────────────────────────────────
  function initExercises() {
    currentExercises = shuffle(exerciseBank).slice(0, 15);
    document.getElementById('XX-ex-container').innerHTML =
      currentExercises.map((ex, i) => `
        <div class="XX-exercise">
          <p><strong>${i+1}.</strong> ${ex.q}</p>
          <textarea id="XX-ex-${i}" placeholder="Írd ide a válaszodat..."></textarea>
        </div>
      `).join('');
  }

  // ── QUIZ ─────────────────────────────────────────────────
  function initQuiz() {
    currentQuiz = shuffle(quizBank).slice(0, 25);
    quizAnswers = {};
    document.getElementById('XX-quiz-container').innerHTML =
      currentQuiz.map((q, i) => `
        <div class="XX-quiz-item" id="XX-qitem-${i}">
          <p><strong>${i+1}. ${q.q}</strong></p>
          ${q.opts.map((opt, j) => `
            <button class="XX-opt" id="XX-opt-${i}-${j}"
              onclick="XX_selectOpt(${i},${j})">
              ${'ABC'[j]}) ${opt}
            </button>
          `).join('')}
        </div>
      `).join('');
  }

  window.XX_selectOpt = function(qi, oi) {
    if (quizAnswers[qi] !== undefined) return;
    document.querySelectorAll(`#XX-qitem-${qi} .XX-opt`)
      .forEach(b => b.classList.remove('selected'));
    document.getElementById(`XX-opt-${qi}-${oi}`).classList.add('selected');
    quizAnswers[qi] = oi;
  };

  // ── CONFIRM MODAL ────────────────────────────────────────
  document.getElementById('XX-cancel-btn').addEventListener('click', function() {
    document.getElementById('XX-overlay').classList.remove('show');
    pendingAction = null;
  });
  document.getElementById('XX-confirm-btn').addEventListener('click', function() {
    document.getElementById('XX-overlay').classList.remove('show');
    if (pendingAction === 'evalEx') evaluateExercises();
    else if (pendingAction === 'evalQuiz') evaluateQuiz();
    else if (pendingAction === 'regenEx') { initExercises(); }
    else if (pendingAction === 'regenQuiz') { initQuiz(); }
    pendingAction = null;
  });

  function askConfirm(action) {
    pendingAction = action;
    document.getElementById('XX-overlay').classList.add('show');
  }

  // ── EXERCISE EVENTS ──────────────────────────────────────
  document.getElementById('XX-ex-eval').addEventListener('click', function() {
    askConfirm('evalEx');
  });
  document.getElementById('XX-ex-regen').addEventListener('click', function() {
    const hasInput = currentExercises.some((_, i) =>
      document.getElementById(`XX-ex-${i}`)?.value.trim()
    );
    if (hasInput) askConfirm('regenEx');
    else initExercises();
  });

  // ── QUIZ EVENTS ───────────────────────────────────────────
  document.getElementById('XX-quiz-eval').addEventListener('click', function() {
    askConfirm('evalQuiz');
  });
  document.getElementById('XX-quiz-regen').addEventListener('click', function() {
    if (Object.keys(quizAnswers).length > 0) askConfirm('regenQuiz');
    else initQuiz();
  });

  // ── EVALUATE EXERCISES ───────────────────────────────────
  function evaluateExercises() {
    let correct = 0;
    const details = currentExercises.map((ex, i) => {
      const ans = (document.getElementById(`XX-ex-${i}`)?.value || '').toLowerCase();
      const hits = ex.keywords.filter(kw => ans.includes(kw.toLowerCase()));
      const ok = hits.length / ex.keywords.length >= 0.5;
      if (ok) correct++;
      return { q: ex.q, answer: ans, ok, hits };
    });
    const pct = Math.round((correct / 15) * 100);
    const grade = getGrade(pct);
    exResultData = { type:'feladatok', correct, total:15, percent:pct, grade, details, date:new Date().toISOString() };
    const r = document.getElementById('XX-ex-result');
    r.style.display = 'block';
    r.innerHTML = `
      <div class="XX-result">
        <div class="XX-grade">${grade.num}</div>
        <h3>${grade.text}</h3>
        <p>${correct}/15 helyes – ${pct}%</p>
        <button class="XX-btn-primary" id="XX-ex-save">💾 Eredmény mentése</button>
      </div>
    `;
    document.getElementById('XX-ex-save').addEventListener('click', function() {
      saveJSON(exResultData, 'feladatok_eredmeny.json');
    });
  }

  // ── EVALUATE QUIZ ────────────────────────────────────────
  function evaluateQuiz() {
    let correct = 0;
    const details = currentQuiz.map((q, i) => {
      const chosen = quizAnswers[i];
      const ok = chosen === q.correct;
      if (ok) correct++;
      document.querySelectorAll(`#XX-qitem-${i} .XX-opt`).forEach((b, j) => {
        if (j === q.correct) b.classList.add('correct');
        else if (j === chosen && !ok) b.classList.add('wrong');
      });
      return { q: q.q, chosen, correct: q.correct, ok };
    });
    const pct = Math.round((correct / 25) * 100);
    const grade = getGrade(pct);
    quizResultData = { type:'kviz', correct, total:25, percent:pct, grade, details, date:new Date().toISOString() };
    const r = document.getElementById('XX-quiz-result');
    r.style.display = 'block';
    r.innerHTML = `
      <div class="XX-result">
        <div class="XX-grade">${grade.num}</div>
        <h3>${grade.text}</h3>
        <p>${correct}/25 helyes – ${pct}%</p>
        <button class="XX-btn-primary" id="XX-quiz-save">💾 Eredmény mentése</button>
      </div>
    `;
    document.getElementById('XX-quiz-save').addEventListener('click', function() {
      saveJSON(quizResultData, 'kviz_eredmeny.json');
    });
  }

  // ── GRADING ──────────────────────────────────────────────
  function getGrade(p) {
    if (p >= 90) return { num:5, text:'🏆 Jeles' };
    if (p >= 75) return { num:4, text:'😊 Jó' };
    if (p >= 60) return { num:3, text:'🙂 Közepes' };
    if (p >= 40) return { num:2, text:'😐 Elégséges' };
    return { num:1, text:'😞 Elégtelen' };
  }

  // ── JSON SAVE ────────────────────────────────────────────
  function saveJSON(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ── COGNITIVE ELEMENT HANDLERS ───────────────────────────
  window.XX_checkGate = function(id, el, correct) {
    el.closest('.XX-gate').querySelectorAll('.XX-gate-opt')
      .forEach(b => b.style.pointerEvents = 'none');
    const fb = document.getElementById('XX-gate-fb-' + id);
    fb.style.display = 'block';
    fb.textContent = correct ? '✅ Helyes!' : '❌ Nem ez a helyes válasz.';
    fb.style.color = correct ? '#00b894' : '#e17055';
  };

  window.XX_revealMyth = function(id) {
    document.getElementById('XX-myth-reveal-' + id).style.display = 'block';
  };

  window.XX_updateSelf = function(id, val) {
    document.getElementById('XX-self-lbl-' + id).textContent = val;
  };

  window.XX_showPopup = function(id) {
    const el = document.getElementById('XX-popup-' + id);
    el.style.display = el.style.display === 'none' ? 'block' : 'none';
  };

  // ── DRAG & DROP (mouse + touch) ───────────────────────────
  let dragValue = null;

  document.addEventListener('dragstart', function(e) {
    if (e.target.classList.contains('XX-drag-item')) {
      dragValue = e.target.dataset.value;
      e.target.style.opacity = '0.5';
    }
  });
  document.addEventListener('dragend', function(e) {
    if (e.target.classList.contains('XX-drag-item')) {
      e.target.style.opacity = '';
    }
  });
  document.addEventListener('dragover', function(e) {
    if (e.target.classList.contains('XX-drop-zone')) e.preventDefault();
  });
  document.addEventListener('drop', function(e) {
    if (e.target.classList.contains('XX-drop-zone')) {
      e.preventDefault();
      handleDrop(e.target);
    }
  });
  document.addEventListener('touchstart', function(e) {
    if (e.target.classList.contains('XX-drag-item')) {
      e.preventDefault();
      dragValue = e.target.dataset.value;
      e.target.style.opacity = '0.5';
    }
  }, { passive: false });
  document.addEventListener('touchmove', function(e) {
    if (dragValue) e.preventDefault();
  }, { passive: false });
  document.addEventListener('touchend', function(e) {
    if (!dragValue) return;
    const touch = e.changedTouches[0];
    document.querySelectorAll('.XX-drag-item').forEach(d => d.style.opacity = '');
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    if (el && el.classList.contains('XX-drop-zone')) handleDrop(el);
  });

  function handleDrop(zone) {
    if (!dragValue) return;
    zone.textContent = dragValue;
    zone.style.color = zone.dataset.answer === dragValue ? '#00b894' : '#e17055';
    dragValue = null;
  }

})();
</script>
</body>
</html>
```

---

## GYORS REFERENCIA – v7.1 ELLENŐRZŐLISTA

| # | Elem | Kötelező |
|---|------|---------|
| 1 | 4 oldal (Tananyag/Módszerek/Feladatok/Kvíz) | ✅ |
| 2 | Min. 10 kognitív elem a 2. oldalon | ✅ |
| 3 | 45 feladat → 15 véletlenszerű | ✅ |
| 4 | 75 kvízkérdés → 25 véletlenszerű, **3 válasz (ABC)** | ✅ |
| 5 | IIFE wrapper | ✅ |
| 6 | Nincs alert()/confirm()/prompt() | ✅ |
| 7 | Touch events dragdrop-ban | ✅ |
| 8 | Min. 44px kattintható területek | ✅ |
| 9 | CSS prefix minden osztálynéven | ✅ |
| 10 | Konfirmációs HTML modal | ✅ |
| 11 | 🔄 Újragenerálás gomb TETEJÉN (Feladatok + Kvíz) | ✅ |
| 12 | JSON mentés globális változóval + addEventListener | ✅ |
| 13 | Reszponzív 320px–2560px, clamp() | ✅ |
| 14 | UTF-8 + Segoe UI | ✅ |
