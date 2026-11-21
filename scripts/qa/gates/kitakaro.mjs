// A közös, lineáris kitakaró (docs/specs/2026-11-19-kitakaro-negyzetes-regex.md, D6 — 2. vak kör, 169cb025). Minden kimeneti út
// ezt használja: a kapuk `redact`-ja (lib.mjs), a külső ellenőr `maskSecrets` / `maskClip`-je (external-review.mjs) és a
// képgyártó `redact` / `redactClip`-je (source/scripts/design-assets/lib.ts); csak a helyőrzők különböznek.
//
// Menet: (1) az érzékeny tartományokat az EREDETI szövegen gyűjti (pontos kulcs minden — átfedő — előfordulása KMP-vel, a
// tokenminták lineáris regexszel, az e-mail regex nélküli pásztázóval), és ugyanezt a szöveg JSON-escape-dekódolt nézetén is
// (`\uXXXX`, `\n`, `\"` …), a találatot visszavetítve az eredeti pozíciókra; (2) a metsző tartományokat egyesíti; (3) csak ezután
// cserél, tartományonként egy helyőrzővel. Így egy korábbi csere nem törhet szét egy későbbi találatot (L2), és az escape-elt
// cím / token sem kerüli meg a szűrést (L3). Vágásnál a vágáspont se tartományt, se token- / e-mail-karakterfutást nem metsz.

/** A vágott kimenetű hívók ablaka. */
export const WINDOW = 64 * 1024;

// `[x]{n}[x]*` a `[x]{n,}` helyett: azonos nyelv, de a V8 20 M karakteren sem dob (D2).
const PATTERNS = [
  ['dburl', /postgres(?:ql)?:\/\/[^\s"'`<>]+/gi],
  ['token', /\b(?:ghp|gho|ghs|ghu|ghr)_[A-Za-z0-9]{16}[A-Za-z0-9]*\b/g],
  ['token', /\bgithub_pat_[A-Za-z0-9_]{16}[A-Za-z0-9_]*\b/g],
  ['token', /\bsk-(?:ant-)?[A-Za-z0-9_-]{16}[A-Za-z0-9_-]*\b/g],
  ['token', /\bsk-or-[A-Za-z0-9_-]+/g],
  ['aws', /\bAKIA[0-9A-Z]{16}\b/g],
  ['aiza', /AIza[0-9A-Za-z_-]{20}[0-9A-Za-z_-]*/g],
  ['bearer', /\bBearer\s+[A-Za-z0-9._~+/=-]+/g],
];

/** Helyőrző-készletek (a régi szerződések). */
export const PH_GATE = { key: '<token>', dburl: '<db-url>', token: '<token>', aws: '<aws-key>', aiza: '<token>', bearer: 'Bearer <token>', email: '<email>' };
export const PH_EXTERNAL = { ...PH_GATE, key: '***', aiza: 'AIza***' };
export const PH_DESIGN = { key: '[kulcs]', dburl: '[kulcs]', token: '[kulcs]', aws: '[kulcs]', aiza: '[kulcs]', bearer: 'Bearer [kulcs]', email: '[e-mail]' };

const isAlnum = (c) => (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
const isLetter = (c) => (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
/** Helyi rész: [A-Za-z0-9._%+-] */
const isLocalChar = (c) => isAlnum(c) || c === 46 || c === 95 || c === 37 || c === 43 || c === 45;
/** Címke: [A-Za-z0-9-] */
const isLabelChar = (c) => isAlnum(c) || c === 45;
/** Határ-érzékeny: token-karakter [A-Za-z0-9._~+/=-] és az e-mail `%`, `@` jele. */
const isSensitiveChar = (c) => isAlnum(c) || c === 46 || c === 95 || c === 126 || c === 43 || c === 47 || c === 61 || c === 45
  || c === 37 || c === 64;

/**
 * A tartomány vége a régi minta (`[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}`, mohó) szerint, vagy -1: pont-elválasztott,
 * nem üres címkék; a vége a legutolsó (legalább 2.) címke ≥ 2 betűs elejének vége.
 */
function domainEnd(s, start) {
  let i = start;
  let best = -1;
  for (let label = 0; ; label++) {
    const ls = i;
    while (i < s.length && isLabelChar(s.charCodeAt(i))) i++;
    if (i === ls) break;
    if (label >= 1) {
      let k = ls;
      while (k < i && isLetter(s.charCodeAt(k))) k++;
      if (k - ls >= 2) best = k;
    }
    if (i < s.length && s.charCodeAt(i) === 46) i++;
    else break;
  }
  return best;
}

/** E-mail-tartományok (D1: a régi minta pontos nyelve, korlát nélkül); két szomszédos `@` közti szakaszt legfeljebb kétszer olvas. */
function emailRanges(s, push) {
  let last = 0;
  for (let at = s.indexOf('@'); at >= 0;) {
    let st = at;
    while (st > last && isLocalChar(s.charCodeAt(st - 1))) st--;
    const end = st < at ? domainEnd(s, at + 1) : -1;
    if (end < 0) { at = s.indexOf('@', at + 1); continue; }
    push(st, end, 'email');
    last = end;
    at = s.indexOf('@', end);
  }
}

/** A kulcs MINDEN (átfedő) előfordulása, KMP-vel: O(n + k). */
function keyRanges(s, key, push) {
  const k = key.length;
  const fail = new Int32Array(k);
  for (let i = 1, j = 0; i < k; i++) {
    while (j > 0 && key.charCodeAt(i) !== key.charCodeAt(j)) j = fail[j - 1];
    if (key.charCodeAt(i) === key.charCodeAt(j)) j++;
    fail[i] = j;
  }
  for (let i = 0, j = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    while (j > 0 && c !== key.charCodeAt(j)) j = fail[j - 1];
    if (c === key.charCodeAt(j)) j++;
    if (j === k) { push(i - k + 1, i + 1, 'key'); j = fail[j - 1]; }
  }
}

const SIMPLE_ESC = { 110: '\n', 114: '\r', 116: '\t', 98: '\b', 102: '\f', 34: '"', 92: '\\', 47: '/' };
const hexVal = (c) => (c >= 48 && c <= 57 ? c - 48 : c >= 65 && c <= 70 ? c - 55 : c >= 97 && c <= 102 ? c - 87 : -1);

/**
 * A szöveg JSON-escape-dekódolt nézete pozíciótérképpel (`map[i]` = a nézet i. karakterének forrás-pozíciója, `map[d.length]` =
 * a szöveg hossza), vagy null, ha nincs benne `\`. Egy menet, lineáris.
 */
function decodedView(t) {
  if (t.indexOf('\\') < 0) return null;
  const map = new Int32Array(t.length + 1);
  const parts = [];
  let n = 0;
  let i = 0;
  while (i < t.length) {
    const b = t.indexOf('\\', i);
    const segEnd = b < 0 ? t.length : b;
    if (segEnd > i) {
      parts.push(t.slice(i, segEnd));
      for (let p = i; p < segEnd; p++) map[n++] = p;
      i = segEnd;
      if (b < 0) break;
    }
    const e = t.charCodeAt(i + 1);
    let ch = null;
    let len = 1;
    if (e === 117 && i + 5 < t.length) {
      let v = 0;
      let ok = true;
      for (let q = i + 2; q < i + 6; q++) { const h = hexVal(t.charCodeAt(q)); if (h < 0) { ok = false; break; } v = v * 16 + h; }
      if (ok) { ch = String.fromCharCode(v); len = 6; }
    } else if (SIMPLE_ESC[e] !== undefined) { ch = SIMPLE_ESC[e]; len = 2; }
    if (ch === null) { ch = '\\'; len = 1; }
    parts.push(ch);
    map[n++] = i;
    i += len;
  }
  map[n] = t.length;
  return { d: parts.join(''), map };
}

/** Tartományok egy szövegen (a `push` a forrás-pozíciókat kapja). */
function scan(s, keys, push) {
  for (const key of keys) keyRanges(s, key, push);
  for (const [kind, re] of PATTERNS) {
    re.lastIndex = 0;
    for (const m of s.matchAll(re)) push(m.index, m.index + m[0].length, kind);
  }
  emailRanges(s, push);
}

const PRIO = { key: 0, dburl: 1, token: 2, aws: 3, aiza: 4, bearer: 5, email: 6 };

/**
 * Az érzékeny tartományok az eredeti szövegen, egyesítve: rendezett, diszjunkt `[{ s, e, kind }]`. A metsző tartományok egybe
 * olvadnak; a helyőrző fajtája a legkorábban kezdődő (azonosnál a leghosszabb, majd a pontos kulcs) tartományé.
 */
export function findRanges(text, keys = []) {
  const ks = keys.filter((k) => typeof k === 'string' && k.length > 0);
  const raw = [];
  scan(text, ks, (s, e, kind) => { raw.push({ s, e, kind }); });
  const v = decodedView(text);
  if (v) scan(v.d, ks, (s, e, kind) => { raw.push({ s: v.map[s], e: v.map[e], kind }); });
  raw.sort((a, b) => a.s - b.s || b.e - a.e || PRIO[a.kind] - PRIO[b.kind]);
  const out = [];
  for (const r of raw) {
    const cur = out[out.length - 1];
    if (cur && r.s < cur.e) { if (r.e > cur.e) cur.e = r.e; } else out.push({ ...r });
  }
  return out;
}

function replaceRanges(text, ranges, ph, upto) {
  let out = '';
  let last = 0;
  for (const r of ranges) {
    if (r.s >= upto) break;
    out += text.slice(last, r.s) + ph[r.kind];
    last = r.e;
  }
  return out + text.slice(last, upto);
}

/** A teljes szöveg kitakarva. */
export function maskText(text, { keys = [], ph }) {
  const t = String(text ?? '');
  return replaceRanges(t, findRanges(t, keys), ph, t.length);
}

/**
 * Biztonságos vágáspont FORRÁS-koordinátában: `limit - margin`-ből indul (az eredeti határhoz mérve), és addig lép lejjebb, amíg
 * se érzékeny tartományt (egyesített, az eredeti szövegen gyűjtött), se token- / e-mail-karakterfutást nem metsz. Csak csökken,
 * a visszalépések diszjunkt szakaszokon futnak: lineáris.
 */
export function cutPoint(text, ranges, limit, margin) {
  let c = Math.max(0, Math.min(text.length, limit) - margin);
  let j = ranges.length - 1;
  for (;;) {
    const before = c;
    while (j >= 0 && ranges[j].s >= c) j--;
    if (j >= 0 && ranges[j].e > c) c = ranges[j].s;
    if (c > 0 && isSensitiveChar(text.charCodeAt(c)) && isSensitiveChar(text.charCodeAt(c - 1))) {
      while (c > 0 && isSensitiveChar(text.charCodeAt(c - 1))) c--;
    }
    if (c === before) return c;
  }
}

/**
 * Kitakarás és vágás `max` hosszra. Ha a szöveg legfeljebb max(WINDOW, max) hosszú: teljes kitakarás, majd vágás (a régi
 * viselkedés). Különben a forrás a `cutPoint`-ig marad (az ablak végéről legalább max(64, kulcshossz) karakter), és csak a
 * vágáspont előtti — ott teljes — tartományok cserélődnek.
 */
export function clipText(text, { keys = [], ph, max }) {
  const t = String(text ?? '');
  const ks = keys.filter((k) => typeof k === 'string' && k.length > 0);
  const ranges = findRanges(t, ks);
  const limit = Math.max(WINDOW, max);
  if (t.length <= limit) return replaceRanges(t, ranges, ph, t.length).slice(0, max);
  const margin = Math.max(64, ...ks.map((k) => k.length));
  return replaceRanges(t, ranges, ph, cutPoint(t, ranges, limit, margin)).slice(0, max);
}
