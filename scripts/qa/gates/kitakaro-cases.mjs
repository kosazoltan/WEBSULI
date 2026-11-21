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
  { name: 'e-mail', raw: J('fiok.tulaj', at, 'pelda.hu'), body: J('fiok.tulaj', at, 'pelda.hu') },
  { name: 'e-mail tokenalakú helyi résszel', raw: J('AI', 'za', 'Sy', 'M'.repeat(30), at, 'levelezo.pelda.org'), body: J('Sy', 'M'.repeat(30), at, 'levelezo.pelda.org') },
  { name: 'DB-URL', raw: J('postgres', '://admin:', 'titok123', at, 'ep-pelda.neon.tech/db'), body: J('admin:', 'titok123', at, 'ep-pelda.neon.tech/db') },
  { name: 'hívói kulcs', raw: CALLER_KEY, body: CALLER_KEY, keyed: true },
];

const u4 = (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`;

/** Kimeneti alakok: a beágyazott titok `pre … post` szövegben, sima / JSON-hibatörzs / teljesen \uXXXX-kódolt formában. */
export const ENCODINGS = {
  sima: (raw) => `pre ${raw} post`,
  json: (raw) => JSON.stringify({ error: { message: `pre ${raw} post` } }).split(at).join('\\u0040'),
  unicode: (raw) => `{"error":"pre ${[...raw].map(u4).join('')} post"}`,
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
