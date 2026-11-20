// Titok- / személyesadat-szűrő a modellhez küldött szövegekre (vak ellenőr L14): a cél-fájl és a tervek az API-hívás ELŐTT
// átnézve; felismert mintánál a futtató megáll, és csak a minta fajtáját és sorát nevezi meg — az értéket soha nem írja ki.

const PATTERNS = [
  ['privát kulcs', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['authorization-fejléc', /\bAuthorization\s*:\s*(?:Bearer|Basic|Token)\s+[A-Za-z0-9._~+/=-]{12,}/i],
  ['bearer-token', /\bBearer\s+[A-Za-z0-9._~+/=-]{24,}/],
  ['API-kulcs (sk-…)', /\bsk-(?:or-v1-|ant-|proj-)?[A-Za-z0-9_-]{24,}/],
  ['GitHub-token', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})/],
  ['AWS-kulcs', /\bAKIA[0-9A-Z]{16}\b/],
  ['Google-API-kulcs', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['Slack-token', /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ['JWT', /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
];
/** Lazább minták — csak a cél-fájlra (a nyilvános repó terveiben dokumentációs példa is lehet ilyen, pl. helyi adatbázis-URL). */
const LOOSE = [
  ['kapcsolati szöveg jelszóval', /\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:[^\s@/]{3,}@[^\s/]+/i],
  ['jelszó / titok értékadás', /\b(?:password|passwd|jelszó|secret|api[_-]?key|token)\s*[=:]\s*["']?[A-Za-z0-9!#$%&*+./=?@^_~-]{12,}/i],
];
const EMAIL = /(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}(?![A-Za-z0-9])/;
/** Szándékosan nyilvános, nem személyes címek (dokumentációs példa, robot-aláírás). */
const EMAIL_OK = /@(?:example\.(?:com|org|net)|anthropic\.com|users\.noreply\.github\.com)$/i;

/**
 * @param {string} text
 * @param {{ email?: boolean, loose?: boolean }} [o] email / loose: e-mail-cím és a lazább minták is (a cél-fájlnál; a nyilvános
 *   repó terveiben szándékos példa is lehet)
 * @returns {{ kind: string, line: number }[]} soronként legfeljebb egy találat fajtánként; értéket NEM ad vissza
 */
export function findSensitive(text, { email = false, loose = email } = {}) {
  const out = [];
  String(text ?? '').replace(/\r\n/g, '\n').split('\n').forEach((l, i) => {
    for (const [kind, re] of loose ? [...PATTERNS, ...LOOSE] : PATTERNS) if (re.test(l)) out.push({ kind, line: i + 1 });
    if (email) {
      const m = EMAIL.exec(l);
      if (m && !EMAIL_OK.test(m[0])) out.push({ kind: 'e-mail-cím', line: i + 1 });
    }
  });
  // az authorization-fejléc magában foglalja a bearer-tokent — ugyanazon a soron csak egyszer jelezzük
  return out.filter((h, _, all) => !(h.kind === 'bearer-token' && all.some((x) => x.kind === 'authorization-fejléc' && x.line === h.line)));
}
