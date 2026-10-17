/**
 * Régi (HTML) tananyagok eredménye e-mailben az adminoknak (docs/specs/2026-10-17-regi-anyag-eredmeny.md).
 *
 * A 183 tárolt HTML-t nem írjuk át; a /dev/:id kiszolgálás alakítja át és egészíti ki:
 * 1. `rewriteLocationAssignments` — a `window.location.href = …` (és `location.href =`, `window.location =`,
 *    `document.location… =`) értékadás bal oldala `(window.__websuliLoc||location).href` lesz. A jobb oldal változatlan,
 *    így a többsoros kifejezéseket sem kell értelmezni. A `__websuliLoc.href` setter a `mailto:` címet a szerverhez
 *    küldi (a levelező nem nyílik meg), minden mást a valódi `location.href`-nek ad tovább. Ha az elfogó nem töltődne
 *    be, a `||location` miatt a régi viselkedés marad.
 * 2. `MATERIAL_CAPTURE_SCRIPT` — a beinjektált futásidejű rész: a `mailto:` linkek, `a.click()` és `window.open`
 *    elfogása, és a kiértékelés utáni automatikus eredmény-beolvasás (új, százalékos eredményszöveg + a tanuló
 *    szöveges válaszai) csendes beküldéssel.
 */

const LOCATION_ASSIGNMENT = /(^|[^\w$.])((?:window\.|self\.|document\.)location(?:\.href)?|location\.href)(\s*=(?!=))/g;
const REPLACEMENT = "(window.__websuliLoc||location).href";

function rewriteJs(code: string): { code: string; count: number } {
  let count = 0;
  const out = code.replace(LOCATION_ASSIGNMENT, (_m, pre: string, _target: string, eq: string) => {
    count++;
    return `${pre}${REPLACEMENT}${eq}`;
  });
  return { code: out, count };
}

const SCRIPT_BLOCK = /(<script\b[^>]*>)([\s\S]*?)(<\/script\s*>)/gi;
const HANDLER_ATTR = /(\son[a-z]+\s*=\s*)("[^"]*"|'[^']*')/gi;

/** Nem JS típusú (pl. `application/json`, sablon) vagy külső (`src`) szkriptet nem érintünk. */
function isInlineJs(openTag: string): boolean {
  if (/\ssrc\s*=/i.test(openTag)) return false;
  const type = openTag.match(/\stype\s*=\s*["']?([^"'\s>]+)/i)?.[1]?.toLowerCase();
  return !type || type === "module" || /^(text|application)\/(java|ecma)script$/.test(type);
}

/** A `<script>` blokkokban és az `on…` eseménykezelő attribútumokban cseréli a location-értékadást; minden más változatlan. */
export function rewriteLocationAssignments(html: string): { html: string; count: number } {
  let count = 0;
  let out = "";
  let last = 0;
  const rewriteAttrs = (chunk: string) =>
    chunk.replace(HANDLER_ATTR, (_m, head: string, value: string) => {
      const r = rewriteJs(value);
      count += r.count;
      return head + r.code;
    });
  for (const m of html.matchAll(SCRIPT_BLOCK)) {
    const start = m.index ?? 0;
    out += rewriteAttrs(html.slice(last, start));
    const [, open, body, close] = m;
    if (isInlineJs(open)) {
      const r = rewriteJs(body);
      count += r.count;
      out += open + r.code + close;
    } else {
      out += m[0];
    }
    last = start + m[0].length;
  }
  out += rewriteAttrs(html.slice(last));
  return { html: out, count };
}

/**
 * A beinjektált futásidejű rész (ES5, önálló: nem függ a `globalEmailScript`-től). Kétszer is beinjektálható (a fejben és a
 * törzs végén); a második példány nem csinál semmit.
 */
export const MATERIAL_CAPTURE_SCRIPT = `
    <script>
    (function () {
      if (window.__websuliCapture) { return; }
      window.__websuliCapture = true;
      var materialId = (window.location.pathname.match(/\\/dev\\/([A-Za-z0-9_-]+)/) || [])[1] || '';
      var sent = {};
      var autoCount = 0;
      var MAX_AUTO = 5;

      function hash(s) { var h = 5381, i; for (i = 0; i < s.length; i++) { h = ((h << 5) + h + s.charCodeAt(i)) | 0; } return String(h); }
      function clip(s, n) { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n - 1) + '\\u2026' : s; }
      function notice(text, isError) {
        try {
          var el = document.createElement('div');
          el.setAttribute('role', 'status');
          el.setAttribute('data-websuli-notice', '');
          el.textContent = text;
          el.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483647;' +
            'padding:12px 18px;border-radius:10px;font:600 14px/1.3 Arial,sans-serif;color:#fff;' +
            'box-shadow:0 6px 24px rgba(0,0,0,.3);max-width:90vw;text-align:center;' +
            'background:' + (isError ? '#c0392b' : '#1e8449') + ';';
          document.body.appendChild(el);
          setTimeout(function () { if (el.parentNode) { el.parentNode.removeChild(el); } }, 4500);
        } catch (e) { /* a visszajelzés nem kritikus */ }
      }
      function post(subject, body, auto) {
        if (!materialId || typeof fetch !== 'function') { return Promise.resolve(false); }
        var key = hash(subject + '\\n' + body);
        if (sent[key]) { return Promise.resolve(true); }
        if (auto) { if (autoCount >= MAX_AUTO) { return Promise.resolve(false); } autoCount++; }
        sent[key] = true;
        return fetch('/api/material-result', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'omit',
          keepalive: true,
          body: JSON.stringify({ materialId: materialId, subject: clip(subject, 180), body: clip(body, 4900), auto: !!auto })
        }).then(function (r) { if (!r.ok) { delete sent[key]; } return r.ok; })
          .catch(function () { delete sent[key]; return false; });
      }

      // ---- 1. mailto: elfogása ------------------------------------------------------------------------------------
      function isMailto(v) { return /^\\s*mailto:/i.test(String(v == null ? '' : v)); }
      function parseMailto(url) {
        var s = String(url), q = s.indexOf('?'), out = { subject: '', body: '' }, parts, i, eq, k, v;
        if (q < 0) { return out; }
        parts = s.slice(q + 1).split(/&(?=(?:subject|body|cc|bcc|to)=)/i);
        for (i = 0; i < parts.length; i++) {
          eq = parts[i].indexOf('=');
          if (eq < 0) { continue; }
          k = parts[i].slice(0, eq).toLowerCase();
          v = parts[i].slice(eq + 1);
          try { v = decodeURIComponent(v); } catch (e) { /* nem kódolt szöveg: marad nyersen */ }
          if (k === 'subject' || k === 'body') { out[k] = v; }
        }
        return out;
      }
      function sendMailto(url) {
        var m = parseMailto(url);
        window.__websuliExplicitResult = true;
        post(m.subject || document.title || 'Tananyag eredmény', m.body, false).then(function (ok) {
          // sikertelen közvetlen küldés → az automatikus beolvasás maradjon tartalék (review #281)
          if (!ok) { window.__websuliExplicitResult = false; }
          notice(ok ? '\\u2705 Az eredményt elküldtük a tanárnak.' : '\\u26a0\\ufe0f Az eredményt nem sikerült elküldeni.', !ok);
        });
      }
      window.__websuliMailto = sendMailto;
      var loc = {};
      Object.defineProperty(loc, 'href', {
        get: function () { return window.location.href; },
        set: function (v) { if (isMailto(v)) { sendMailto(String(v)); return; } window.location.href = v; }
      });
      window.__websuliLoc = loc;
      try {
        var origAnchorClick = HTMLAnchorElement.prototype.click;
        HTMLAnchorElement.prototype.click = function () {
          var href = this.getAttribute('href');
          if (isMailto(href)) { sendMailto(href); return; }
          return origAnchorClick.apply(this, arguments);
        };
        var origOpen = window.open;
        window.open = function (u) {
          if (isMailto(u)) { sendMailto(String(u)); return null; }
          return origOpen.apply(window, arguments);
        };
      } catch (e) { /* régi böngésző: a link-elfogás így is működik */ }
      // Buborékfázisban: a tananyag saját onclick-je (pl. this.href = 'mailto:' + …) már lefutott, a böngésző még nem navigált.
      window.addEventListener('click', function (ev) {
        var a = ev.target && ev.target.closest ? ev.target.closest('a[href]') : null;
        if (a && isMailto(a.getAttribute('href'))) { ev.preventDefault(); sendMailto(a.getAttribute('href')); }
      }, false);

      // ---- 2. automatikus eredmény-beolvasás ---------------------------------------------------------------------
      var RESULT_NAME = /result|eredmeny|eredmény|score|pontszam|pontszám/i;
      var SKIP_NAME = /gate|drag|dd-|myth|pred|self|slider|timeline|websuli/i;
      var PERCENT = /\\d+(?:[.,]\\d+)?\\s*%/;
      var FRACTION = /\\d+\\s*\\/\\s*\\d+/;
      var GRADE = /jeles|közepes|elégséges|elégtelen|osztályzat|érdemjegy|jegy\\s*:/i;
      // a „helyes” / „pontosság” szó önmagában nem elég: az élő haladásjelzők (pl. „Kvíz … 8%”) ne menjenek ki
      var RESULT_WORD = /eredm|pontsz|jegy|osztályzat|osztalyzat|score|jeles|közepes|elégséges|elégtelen/i;
      var EVAL_CLICK = /[ée]rt[ée]kel|ellen[őo]r|eredm[ée]ny|bek[üu]ld|bead|befejez|k[ée]sz|v[ée]ge|submit|check|evaluat|finish|result|score|grade/i;
      var SKIP_TAG = /^(SCRIPT|STYLE|TEXTAREA|INPUT|BUTTON|SELECT|OPTION|NOSCRIPT|TEMPLATE)$/;
      var seen = {};

      function textOf(el) { return String(el.innerText || el.textContent || '').replace(/[ \\t\\r]+/g, ' ').replace(/\\s*\\n\\s*/g, '\\n').replace(/\\n{2,}/g, '\\n').trim(); }
      function nameOf(el) { return (el.id || '') + ' ' + (typeof el.className === 'string' ? el.className : ''); }
      function skipped(el) {
        for (var n = el; n && n !== document.body; n = n.parentElement) {
          if (n.hasAttribute && n.hasAttribute('data-websuli-notice')) { return true; }
          if (SKIP_NAME.test(nameOf(n))) { return true; }
        }
        return false;
      }
      function candidates() {
        var picked = [], all, i, el, w, node, t, up;
        if (!document.body) { return picked; }
        // (a) név szerint eredményelem (id/class)
        all = document.body.getElementsByTagName('*');
        for (i = 0; i < all.length; i++) {
          el = all[i];
          if (SKIP_TAG.test(el.tagName) || !RESULT_NAME.test(nameOf(el))) { continue; }
          t = textOf(el);
          // százalék, vagy pontszám (x / y) osztályzattal — a futó számláló (pl. „3/25”) önmagában nem eredmény
          if (t && t.length <= 3000 && (PERCENT.test(t) || (FRACTION.test(t) && GRADE.test(t))) && !skipped(el)) { picked.push(el); }
        }
        // (b) név nélküli eredménydoboz: százalékot tartalmazó szöveg, a legközelebbi rövid blokk eredményszóval
        w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
        while ((node = w.nextNode())) {
          if (!PERCENT.test(node.nodeValue || '')) { continue; }
          for (up = node.parentElement, i = 0; up && up !== document.body && i < 4; up = up.parentElement, i++) {
            if (SKIP_TAG.test(up.tagName)) { break; }
            t = textOf(up);
            if (t.length > 600) { break; }
            if (RESULT_WORD.test(t)) { if (!skipped(up)) { picked.push(up); } break; }
          }
        }
        // a beágyazottak közül a legkülső marad
        return picked.filter(function (el, idx) {
          for (var j = 0; j < picked.length; j++) { if (j !== idx && picked[j] !== el && picked[j].contains(el)) { return false; } }
          return picked.indexOf(el) === idx;
        });
      }
      function questionOf(field) {
        var lab = field.id ? document.querySelector('label[for="' + field.id.replace(/"/g, '') + '"]') : null;
        if (lab && textOf(lab)) { return textOf(lab); }
        for (var n = field.parentElement, i = 0; n && n !== document.body && i < 4; n = n.parentElement, i++) {
          var t = textOf(n);
          if (t) { return t; }
        }
        return '';
      }
      function learnerName() {
        var fields = document.querySelectorAll('input[type="text"], input:not([type])'), i, f, hint;
        for (i = 0; i < fields.length; i++) {
          f = fields[i];
          hint = (f.id || '') + ' ' + (f.name || '') + ' ' + (f.getAttribute('placeholder') || '');
          if (/n[ée]v|name/i.test(hint) && String(f.value || '').trim()) { return clip(String(f.value).trim(), 80); }
        }
        return '';
      }
      function answers() {
        var out = [], fields = document.querySelectorAll('textarea'), i, v;
        for (i = 0; i < fields.length; i++) {
          v = String(fields[i].value || '').trim();
          if (!v) { continue; }
          out.push('• ' + clip(questionOf(fields[i]), 200) + '\\n   \\u2192 ' + clip(v, 600));
        }
        return out;
      }
      // mode: 'baseline' (betöltés), 'eval' (kiértékelő jellegű kattintás után), 'other' (bármely más kattintás után).
      // Minden látott szöveg megjelölődik; más kattintás után csak az osztályzatot is tartalmazó eredmény megy ki.
      // Rendezett beküldés: az új eredmény a „pending”-be kerül (eredményhelyenként a legfrissebb), és az utolsó új eredmény után
      // SETTLE_MS nyugalommal, vagy az oldal elhagyásakor (pagehide / rejtett lap) EGY levélben megy ki. Így a feladatonkénti
      // „Ellenőrzés” futó statisztikája (pl. „Megoldott feladatok: 1 / 15”) nem küld minden lépésnél külön levelet.
      var SETTLE_MS = 30000;
      var pending = null, settleTimer = null;
      function scan(mode) {
        var found = candidates(), fresh = 0, i, t, k, slot;
        for (i = 0; i < found.length; i++) {
          t = clip(textOf(found[i]), 1500);
          k = hash(t);
          if (seen[k]) { continue; }
          seen[k] = true;
          if (mode === 'baseline' || !(mode === 'eval' || GRADE.test(t))) { continue; }
          slot = (found[i].id || nameOf(found[i]).trim() || 'blokk') + '#' + i;
          if (!pending) { pending = { order: [], texts: {} }; }
          if (!pending.texts.hasOwnProperty(slot)) { pending.order.push(slot); }
          pending.texts[slot] = t;
          fresh++;
        }
        if (fresh) {
          if (settleTimer) { clearTimeout(settleTimer); }
          settleTimer = setTimeout(flushSafely, SETTLE_MS);
        }
      }
      function flush() {
        if (settleTimer) { clearTimeout(settleTimer); settleTimer = null; }
        var p = pending;
        pending = null;
        // a tananyag maga küldi az eredményt (sendResultEmail / mailto) → nincs második, automatikus levél
        if (!p || window.__websuliExplicitResult) { return; }
        var texts = [], i;
        for (i = 0; i < p.order.length; i++) { texts.push(p.texts[p.order[i]]); }
        var title = clip((document.title || (document.querySelector('h1') || {}).textContent || 'Tananyag').trim(), 120);
        var name = learnerName();
        var ans = answers();
        var picks = document.querySelectorAll('input[type="radio"]:checked').length;
        var body = 'Automatikusan beolvasott eredmény (a tanuló kiértékelte a tananyagot).\\n' +
          (name ? 'Tanuló: ' + name + '\\n' : '') + '\\nEredmény:\\n' + texts.join('\\n---\\n') +
          (picks ? '\\n\\nBejelölt választások: ' + picks : '') +
          (ans.length ? '\\n\\nSzöveges válaszok:\\n' + ans.join('\\n') : '');
        post(title + ' — eredmény', clip(body, 4900), true);
      }
      function flushSafely() { try { flush(); } catch (e) { /* a beolvasás nem zavarhatja a tananyagot */ } }
      window.addEventListener('pagehide', flushSafely);
      document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') { flushSafely(); } });
      function isEvalClick(target) {
        var el = target && target.closest ? target.closest('button, input[type="button"], input[type="submit"], a, [onclick], [role="button"]') : null;
        if (!el) { return false; }
        return EVAL_CLICK.test((el.value || el.textContent || '') + ' ' + (el.getAttribute('onclick') || '') + ' ' + (el.id || ''));
      }
      var timer = null, pendingEval = false;
      document.addEventListener('click', function (ev) {
        pendingEval = pendingEval || isEvalClick(ev.target);
        if (timer) { clearTimeout(timer); }
        timer = setTimeout(function () {
          var mode = pendingEval ? 'eval' : 'other';
          timer = null; pendingEval = false;
          try { scan(mode); } catch (e) { /* a beolvasás nem zavarhatja a tananyagot */ }
        }, 1500);
      }, true);
      function baseline() { try { scan('baseline'); } catch (e) { /* lásd fent */ } }
      if (document.readyState === 'complete') { setTimeout(baseline, 500); } else { window.addEventListener('load', function () { setTimeout(baseline, 500); }); }
    })();
    </script>`;
