// Tesztsegéd: a kitakaró (scripts/qa/gates/kitakaro.mjs) közös, táblázatos esetei — minden ismert tokenforma × minden
// kimeneti alak (sima, JSON-escape-elt, teljesen \uXXXX-kódolt) × vágási helyzet. A kapuk, a külső ellenőr és a design-assets
// tesztjei ugyanezt a táblát futtatják (docs/specs/2026-11-19-kitakaro-negyzetes-regex.md, 2. vak kör 169cb025).
// A szintetikus titkokat futásidőben rakjuk össze, hogy a repó őrei (no-real-emails, lint-gate) ne lássák literálként.

const at = '@';
const J = (...p) => p.join('');

/** A hívónak átadott, mintára nem illeszkedő kulcs (`#`-ot is tartalmaz, 43 karakter). */
export const CALLER_KEY = J('kulcs#', 'abcdef0123456789'.repeat(2), '#vege');

/**
 * Ismert formák: `raw` a szövegbe kerülő alak, `body` a rész, amelynek egyetlen 6 karakteres darabja sem maradhat a kimenetben
 * (sem nyersen, sem a kimenet JSON-escape-dekódolt alakjában). `keyed`: csak kulcsot átvevő úton értelmes.
 */
export const SECRET_CASES = [
  { name: 'AIza', raw: J('AI', 'za', 'Sy', 'K'.repeat(33)), body: J('Sy', 'K'.repeat(33)) },
  { name: 'Bearer teljes készlet', raw: J('Bearer ', 'ya29', '+AbC/dEf=~', 'Q'.repeat(12)), body: J('ya29', '+AbC/dEf=~', 'Q'.repeat(12)) },
  { name: 'Bearer sortöréssel', raw: J('Bearer', '\n', 'Zt0k', '+Ab/Cd=~', 'P'.repeat(12)), body: J('Zt0k', '+Ab/Cd=~', 'P'.repeat(12)) },
  { name: 'Bearer + sk-proj', raw: J('Bearer ', 'sk-', 'proj-', 'R'.repeat(20), '+/Zz=~', 'W'.repeat(8)), body: J('proj-', 'R'.repeat(20), '+/Zz=~', 'W'.repeat(8)) },
  { name: 'sk-ant', raw: J('sk-', 'ant-', 'x9Y8z7W6'.repeat(3)), body: 'x9Y8z7W6'.repeat(3) },
  { name: 'sk-or', raw: J('sk-', 'or-', 'v1-', 'abcd'.repeat(8)), body: J('v1-', 'abcd'.repeat(8)) },
  { name: 'GitHub ghp', raw: J('gh', 'p_', 'A1b2C3d4E5f6'.repeat(3)), body: 'A1b2C3d4E5f6'.repeat(3) },
  { name: 'GitHub pat', raw: J('github', '_pat_', 'B2c3D4e5F6g7'.repeat(3)), body: 'B2c3D4e5F6g7'.repeat(3) },
  { name: 'AWS', raw: J('AK', 'IA', 'ABCDEFGH12345678'), body: 'ABCDEFGH12345678' },
  // 3. vak kör (25de6739): ideiglenes AWS-azonosító, kis- / nagybetűs HTTP-séma, nagybetűs DB-séma.
  { name: 'AWS ASIA', raw: J('AS', 'IA', 'QRSTUVWX87654321'), body: 'QRSTUVWX87654321' },
  { name: 'bearer kisbetűs', raw: J('bearer ', 'lo0k', '+Wx/Yz=~', 'N'.repeat(12)), body: J('lo0k', '+Wx/Yz=~', 'N'.repeat(12)) },
  { name: 'BEARER nagybetűs', raw: J('BEARER ', 'UP9k', '+Rs/Tu=~', 'H'.repeat(12)), body: J('UP9k', '+Rs/Tu=~', 'H'.repeat(12)) },
  { name: 'PostgreSQL nagybetűs', raw: J('PostgreSQL', '://dba:', 'jelszo987', at, 'db.pelda.hu/prod'), body: J('dba:', 'jelszo987', at, 'db.pelda.hu/prod') },
  { name: 'e-mail', raw: J('fiok.tulaj', at, 'pelda.hu'), body: J('fiok.tulaj', at, 'pelda.hu') },
  { name: 'e-mail tokenalakú helyi résszel', raw: J('AI', 'za', 'Sy', 'M'.repeat(30), at, 'levelezo.pelda.org'), body: J('Sy', 'M'.repeat(30), at, 'levelezo.pelda.org') },
  { name: 'DB-URL', raw: J('postgres', '://admin:', 'titok123', at, 'ep-pelda.neon.tech/db'), body: J('admin:', 'titok123', at, 'ep-pelda.neon.tech/db') },
  { name: 'hívói kulcs', raw: CALLER_KEY, body: CALLER_KEY, keyed: true },
  // 4. vak kör (ac6447f5): egymást elfedő előtagok, backslash a DB-jelszóban, cím közvetlenül sortörés után.
  { name: 'L1 Bearer-séma kétszer', raw: J('Auth scheme: Bearer', '\n', 'Bearer ', 'M4synthetic', '+/Q8=~Tail'), body: J('M4synthetic', '+/Q8=~Tail') },
  { name: 'L1 két összeírt ghp', raw: J('gh', 'p_', 'C1d2E3f4G5h6'.repeat(2), 'gh', 'p_', 'J7k8L9m0N1p2'.repeat(2)), body: 'J7k8L9m0N1p2'.repeat(2) },
  { name: 'L2 backslash a DB-jelszóban', raw: J('postgres', '://admin:', 'jel', '\\', 'szo_SYNTHETIC_PASSWORD_TAIL', at, '10.0.0.5:5432/db'), body: J('admin:', 'jel', '\\', 'szo_SYNTHETIC_PASSWORD_TAIL') },
  { name: 'L4 cím sortörés után', raw: J('timeout', '\n', 'owner.x', at, 'pelda.hu', '\n', 'keep'), body: J('owner.x', at, 'pelda.hu') },
  // 5. vak kör (5c9568c5) L1: `Bearer-` kezdetű, csak betűs / kötőjeles hitelesítő (a főág kitakarta).
  { name: 'L1(5) Bearer- kezdetű hitelesítő', raw: J('Authorization: Bearer ', 'Bearer-', 'abcdefghij', '-klmnopqr'), body: J('abcdefghij', '-klmnopqr') },
];

/** Determinisztikus álvéletlen (mulberry32), hogy a tábla minden futáson ugyanaz legyen. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// „Általános” sor (tulajdonosi osztályszabály, 2026-11-22): előre ismeretlen formájú, 24–64 karakteres titok a teljes
// token-karakterkészletből (betű, szám, + / = _ - . ~ % \), legalább egy betűvel és egy számmal; sima és sortöréssel kettévágott alakban.
const ALPHABET = J('ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz', '0123456789', '+/=_-.~%\\');
{
  const r = rng(20261122);
  for (let n = 0; n < 8; n++) {
    const len = 24 + Math.floor(r() * 41);
    let s = '';
    for (let i = 0; i < len; i++) s += ALPHABET[Math.floor(r() * ALPHABET.length)];
    s = J('Q', s.slice(1, -1), '7'); // legalább egy betű és egy szám
    SECRET_CASES.push({ name: `általános ${n + 1} (${len})`, raw: s, body: s });
    const k = 8 + Math.floor(r() * (len - 16));
    SECRET_CASES.push({ name: `általános ${n + 1} sortöréssel`, raw: J(s.slice(0, k), '\n', s.slice(k)), body: s, split: k });
  }
}

const u4 = (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`;

/** Kimeneti alakok: a beágyazott titok `pre … post` szövegben, sima / JSON-hibatörzs / teljesen \uXXXX-kódolt formában. */
export const ENCODINGS = {
  sima: (raw) => `pre ${raw} post`,
  json: (raw) => JSON.stringify({ error: { message: `pre ${raw} post` } }).split(at).join('\\u0040'),
  unicode: (raw) => `{"error":"pre ${[...raw].map(u4).join('')} post"}`,
  // Szókarakterhez tapadó alak (3. vak kör): `id_` előtag és `_x` utótag. A Bearer-séma előtt nincs előtag — a szóhoz tapadó
  // `…Bearer` ártalmatlan szó (2. vak kör L6), azt szándékosan nem takarjuk.
  tapado: (raw) => (/^bearer/i.test(raw) ? `pre ${raw}_x post` : `pre id_${raw}_x post`),
};

/** Független (a vizsgált kódtól eltérő) JSON-escape-dekódolás a szivárgás-ellenőrzéshez. */
export function decodeEscapes(s) {
  const map = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '"': '"', '\\': '\\', '/': '/' };
  return s.replace(/\\(u[0-9a-fA-F]{4}|["\\/bfnrt])/g, (_, e) => (e[0] === 'u' ? String.fromCharCode(parseInt(e.slice(1), 16)) : map[e]));
}

/** Az első kimaradt 6 karakteres titokdarab (nyersen vagy a kimenet dekódolt alakjában), vagy null. */
export function leak(out, body) {
  const views = [out, decodeEscapes(out)];
  for (let i = 0; i + 6 <= body.length; i++) {
    const g = body.slice(i, i + 6);
    if (views.some((v) => v.includes(g))) return g;
  }
  return null;
}

/** A titok kimaradt, különböző 6 karakteres darabjainak száma (nyersen vagy dekódolva) — a főággal való összevetéshez. */
export function leakCount(out, body) {
  const views = [out, decodeEscapes(out)];
  const seen = new Set();
  for (let i = 0; i + 6 <= body.length; i++) {
    const g = body.slice(i, i + 6);
    if (!seen.has(g) && views.some((v) => v.includes(g))) seen.add(g);
  }
  return seen.size;
}

/**
 * Nagy szöveg a vágási helyzetekhez: a kódolt titok a `limit - margin` vágáspont előtt, azt metszve, az ablakhatárt metszve és
 * utána. Kitöltés: `z ` (token- és szóköz-karakterek váltakozva). Visszaad: [{ pos, text }].
 */
export function clipPlacements(enc, limit, margin, total = limit + 4000) {
  const c0 = limit - margin;
  const half = Math.floor(enc.length / 2);
  return [
    ['előtte', c0 - enc.length - 300],
    ['a vágáspontot metszve', c0 - half],
    ['az ablakhatárt metszve', limit - half],
    ['utána', limit + 50],
  ].map(([pos, start]) => {
    const pre = 'z '.repeat(Math.ceil(start / 2)).slice(0, start);
    const text = pre + enc + 'z '.repeat(Math.ceil((total - start - enc.length) / 2));
    return { pos, text };
  });
}

/** Átfedő kulcs-előfordulások: a kulcs eleje = vége (`QWE`), két előfordulás egy közös `QWE`-n osztozik. */
export const OVERLAP_KEY = J('QWE', '#RTY'.repeat(10), '#QWE');
export const OVERLAP_TEXT = J('QWE', '#RTY'.repeat(10), '#QWE', '#RTY'.repeat(10), '#QWE');
