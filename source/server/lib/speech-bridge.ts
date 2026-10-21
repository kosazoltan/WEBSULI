/**
 * Spec 2026-10-21-diktalas-hid: a régi HTML-anyagok diktálásának gyökérok-javítása.
 *
 * GYÖKÉROK: 2026-09-02 óta (8b8e2622, „izolált tananyag-origin”) a `/dev/:id` anyag KÜLÖN originről, kereszt-domaines iframe-ben fut
 * (biztonság: az anyag scriptje nem éri el az app sütijeit). A böngészők a Web Speech API beszédfelismerését kereszt-domaines keretben
 * elutasítják (`not-allowed`), a régi segéd ezt csak a konzolba írta — a diktálás csendben megszűnt (a WebSuli 🎤 gombja és az anyagok
 * saját, v7.3+ diktálása is).
 *
 * JAVÍTÁS (az izoláció megtartásával): a keretben a `SpeechRecognition` / `webkitSpeechRecognition` egy HÍD — ugyanazt a felületet adja
 * (start / stop / abort, onresult / onerror / onend / onstart, addEventListener), a tényleges felismerést viszont a WebSuli főoldala
 * (azonos originű, engedélyezett környezet) futtatja `postMessage`-en keresztül. A főoldal csak a saját iframe-jének válaszol.
 * Keret nélkül (az anyag külön lapon) a natív felismerés marad.
 */
export const SPEECH_BRIDGE_SCRIPT = `<script>/* WEBSULI DIKTÁLÁS-HÍD */(function(){
  try {
    if (window.self === window.top) return;
    var NativeSR = window.SpeechRecognition || window.webkitSpeechRecognition;
    var sessions = {};
    var seq = 0;
    function Bridged() {
      this.lang = ''; this.continuous = false; this.interimResults = false; this.maxAlternatives = 1;
      this.onresult = null; this.onerror = null; this.onend = null; this.onstart = null;
      this._listeners = {}; this._id = null; this._ended = false;
    }
    Bridged.prototype.addEventListener = function(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); };
    Bridged.prototype.removeEventListener = function(type, fn) { var l = this._listeners[type] || []; var i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); };
    Bridged.prototype._emit = function(type, ev) {
      ev = ev || {}; ev.type = type; ev.target = this;
      try { if (typeof this['on' + type] === 'function') this['on' + type](ev); } catch (e) { console.error(e); }
      var l = (this._listeners[type] || []).slice();
      for (var i = 0; i < l.length; i++) { try { l[i].call(this, ev); } catch (e) { console.error(e); } }
    };
    Bridged.prototype._finish = function(error) {
      if (this._ended) return;
      this._ended = true;
      if (error) this._emit('error', { error: error, message: error });
      this._emit('end');
      if (this._id) delete sessions[this._id];
    };
    Bridged.prototype.start = function() {
      var self = this;
      this._ended = false;
      this._id = 'sr' + (++seq) + '-' + Date.now();
      sessions[this._id] = this;
      var lang = this.lang || document.documentElement.lang || 'hu-HU';
      window.parent.postMessage({ type: 'websuli-sr:start', id: this._id, lang: lang, continuous: !!this.continuous, interimResults: !!this.interimResults, maxAlternatives: this.maxAlternatives || 1 }, '*');
      // Ha a szülő nem WebSuli (nincs híd), ne ragadjon be: a natív felismerés próbája, különben hiba.
      var id = this._id;
      setTimeout(function() {
        if (sessions[id] === self && !self._bridged) {
          delete sessions[id];
          if (NativeSR) { try { var n = new NativeSR(); n.lang = lang; n.continuous = self.continuous; n.interimResults = self.interimResults; n.maxAlternatives = self.maxAlternatives;
            n.onresult = function(e) { self._emit('result', e); }; n.onerror = function(e) { self._emit('error', e); }; n.onend = function() { self._finish(); }; n.onstart = function() { self._emit('start'); };
            self._native = n; n.start(); return; } catch (e) {} }
          self._finish('service-not-allowed');
        }
      }, 2500);
    };
    Bridged.prototype.stop = function() { if (this._native) { try { this._native.stop(); } catch (e) {} return; } if (this._id) window.parent.postMessage({ type: 'websuli-sr:stop', id: this._id }, '*'); };
    Bridged.prototype.abort = function() { if (this._native) { try { this._native.abort(); } catch (e) {} return; } if (this._id) window.parent.postMessage({ type: 'websuli-sr:abort', id: this._id }, '*'); };
    window.addEventListener('message', function(ev) {
      if (ev.source !== window.parent) return;
      var d = ev.data || {};
      if (typeof d.type !== 'string' || d.type.indexOf('websuli-sr:') !== 0) return;
      var s = sessions[d.id];
      if (!s) return;
      // A szülő azonnal nyugtáz (az engedélykérés előtt) — így a lassú engedélyezés sem vált a natív (keretben tiltott) útra.
      if (d.type === 'websuli-sr:ack') { s._bridged = true; return; }
      s._bridged = true;
      if (d.type === 'websuli-sr:started') { s._emit('start'); }
      else if (d.type === 'websuli-sr:result') {
        var results = (d.results || []).map(function(r) { var alts = (r.alternatives || []).map(function(a) { return { transcript: a.transcript, confidence: a.confidence }; }); alts.isFinal = !!r.isFinal; alts.item = function(i) { return alts[i]; }; return alts; });
        results.item = function(i) { return results[i]; };
        s._emit('result', { resultIndex: d.resultIndex || 0, results: results });
      }
      else if (d.type === 'websuli-sr:error') { s._finish(d.error || 'aborted'); }
      else if (d.type === 'websuli-sr:end') { s._finish(); }
    });
    window.SpeechRecognition = Bridged;
    window.webkitSpeechRecognition = Bridged;
  } catch (e) { console.error('[WEBSULI DIKTÁLÁS-HÍD]', e); }
})();</script>`;
