// GPT teljesítési őr — determinisztikus teljesség-ellenőrző (docs/specs/2026-11-20-gpt-teljesitesi-or.md).
// A GPT-modellek hajlamosak tervet / „következő lépésként…” szöveget adni a kész munka helyett, leletet javaslat nélkül írni,
// szakaszt vagy hibakereső pontot kihagyni. Ez a modul gépileg dönti el, hogy egy jelentés TELJES-e; a futtató (és a Codex-burok)
// hiány esetén ugyanabban a beszélgetésben folytatásra küldi a modellt a pontos hiánylistával.

/** A kötelező szakasz-fejlécek (a fejléc-sor ezzel a szöveggel kezdődik). */
export const REQUIRED = ['Ítélet', 'Leletek', 'A hibakereső pontok', 'Mit próbáltam megtörni, és nem sikerült', 'Mit NEM vizsgáltam'];

/** Megállási / felajánló / csonkító fordulatok (kódblokkon és soron belüli kódon kívül). */
export const FORBIDDEN = [
  [/következő lépésként/i, '„következő lépésként”'],
  [/\bha (szeretnéd|szeretné|szeretnétek|kéred|kéri)\b/i, '„ha szeretnéd / kéred”'],
  [/\bfolytass(am|uk)\b|\bfolytathatom\b/i, '„folytassam?”'],
  [/\b(meg fogom|ellenőrizni fogom|meg fogjuk|vizsgálni fogom)\b/i, 'jövő idejű terv („meg fogom …”)'],
  [/\b(megnézem|megvizsgálom|utánanézek|átnézem|lefuttatom)\b/i, 'jövő idejű terv („megnézem …”)'],
  [/\bés így tovább\b/i, '„és így tovább”'],
  [/\bpéldaként néhány\b|\bnéhány példa\b/i, '„példaként néhány”'],
  [/\bnext steps?\b/i, '„next step”'],
  [/\blet me know\b/i, '„let me know”'],
  [/\bwould you like\b|\bshall i\b|\bdo you want me\b/i, '„would you like / shall I”'],
  [/\bi(?:'ll| will)(?: now)? (?:check|look|investigate|review|run|continue)\b|\bi will now\b/i, '„I will now …”'],
  [/\bto be continued\b|\bfolytatás következik\b/i, '„folytatás következik”'],
];

const VERDICT = /talált|hiba|próbáltam|nem sikerült|nem alkalmazható|nem releváns|rendben|megcáfolt|unverified|igazolt|nem érintett|nincs/i;
const CLOSING = /^`?TELJESSÉG:\s*(\d+)\s*\/\s*(\d+)\s*(?:pont\s*)?[—–-]\s*HIÁNYZÓ:\s*(.+?)\s*`?$/;
const NONE = /^(nincs|0|none)$/i;
const norm = (s) => String(s ?? '').replace(/\r\n/g, '\n');

/**
 * A hibakereső pontok azonosítói: a megbízás-sablon „Hibakereső pontok” blokkjának számozott sorai (1–9); a 8. a feladat-specifikus
 * helyőrző — ha a cél-fájlban vannak `8a.`, `8b.` … pontok, a 8. helyett ezek számítanak.
 */
export function debugPoints(templateText, goalText) {
  const t = norm(templateText);
  const a = t.indexOf('Hibakereső pontok');
  const b = t.indexOf('Szabályok:', a);
  const block = a >= 0 ? t.slice(a, b < 0 ? undefined : b) : '';
  const base = [...block.matchAll(/^(\d+)\.\s/gm)].map((m) => m[1]);
  const goalIds = [...new Set([...norm(goalText).matchAll(/^\s*(8[a-z])[.)]\s/gm)].map((m) => m[1]))];
  return base.flatMap((id) => (id === '8' && goalIds.length ? goalIds : [id]));
}

/** A modell saját szövege: a futtató gépi lábléce / összegzése előtti rész. */
export function modelText(text) {
  const s = norm(text);
  const cut = [s.indexOf('\n---\n## Gépi összegzés'), s.indexOf('\n---\n_Gépi lábléc')].filter((i) => i >= 0);
  return (cut.length ? s.slice(0, Math.min(...cut)) : s).replace(/\s+$/, '');
}

const stripCode = (s) => s.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`\n]*`/g, ' ');

function sections(text) {
  const heads = [...text.matchAll(/^#{1,6}\s*(.+?)\s*$/gm)].map((m) => ({ title: m[1].replace(/\*/g, '').trim(), at: m.index, end: m.index + m[0].length }));
  return heads.map((h, i) => ({ ...h, body: text.slice(h.end, i + 1 < heads.length ? heads[i + 1].at : undefined) }));
}

/**
 * @param {string} text a jelentés (a gépi lábléc lehet benne — levágjuk)
 * @param {{ points: string[], findings?: object[]|null, mode?: 'review'|'generic' }} o
 *   mode = 'generic' (Codex-kutatás): nincs szakasz- és pontlista, csak nem üres válasz + tiltott fordulatok + a zárósor (x = y, HIÁNYZÓ: nincs).
 * @returns {{ ok: boolean, problems: string[], covered: number, total: number, missing: string[] }}
 */
export function checkCompleteness(text, { points = [], findings = null, mode = 'review' }) {
  const body = modelText(text);
  const problems = [];
  if (mode === 'generic') return checkGeneric(body);
  const secs = sections(body);
  for (const r of REQUIRED) if (!secs.some((s) => s.title.startsWith(r))) problems.push(`hiányzó kötelező szakasz: „${r}”`);

  // hibakereső pontok: saját sor, ítélet-szó, tartalom (a következő pont-sorig tartó szöveggel együtt)
  const pts = secs.find((s) => s.title.startsWith('A hibakereső pontok'));
  const missing = [];
  const lines = pts ? pts.body.split('\n') : [];
  const idAt = (l) => /^\s*(?:[-*]\s*)?(?:\*\*)?(\d+[a-z]?)[.)]/.exec(l)?.[1] ?? null;
  for (const id of points) {
    const i = lines.findIndex((l) => idAt(l) === id);
    if (i < 0) { missing.push(id); continue; }
    let chunk = lines[i].replace(/^\s*(?:[-*]\s*)?(?:\*\*)?\d+[a-z]?[.)]\s*(?:\*\*)?/, '');
    for (let k = i + 1; k < lines.length && !idAt(lines[k]); k += 1) chunk += ` ${lines[k]}`;
    if (chunk.replace(/\s+/g, ' ').trim().length < 20 || !VERDICT.test(chunk)) missing.push(id);
  }
  if (missing.length) problems.push(`hibakereső pont hiányzik vagy ítélet / tartalom nélküli: ${missing.join(', ')} (minden pont saját sorban: „<azonosító>. <ítélet: talált hiba / próbáltam, nem sikerült / nem alkalmazható> — <bizonyíték>”)`);

  // leletek: forgatókönyv + konkrét javaslat
  for (const f of Array.isArray(findings) ? findings : []) {
    const id = f?.id ?? '?';
    if (String(f?.scenario ?? '').replace(/\s+/g, '').length < 20) problems.push(`${id}: hiányzik a forgatókönyv (scenario: ki, milyen eszközön, mit csinál, mi történik)`);
    if (String(f?.fix ?? '').replace(/\s+/g, '').length < 15) problems.push(`${id}: hiányzik a konkrét javítási javaslat (fix: mit, hol, hogyan — teszttel)`);
  }

  // tiltott fordulatok (a jelentésben és a lelet-mezőkben)
  const scan = [stripCode(body), ...(Array.isArray(findings) ? findings : []).map((f) => stripCode(`${f?.title ?? ''} ${f?.scenario ?? ''} ${f?.fix ?? ''}`))].join('\n');
  for (const [re, name] of FORBIDDEN) if (re.test(scan)) problems.push(`megállási / felajánló fordulat: ${name} — a jelentés a kész munka, nem terv; ami nem készült el, az a „Mit NEM vizsgáltam” szakaszba kerül, múlt időben, okkal`);

  // zárósor: az utolsó nem üres sor, egyezik a gépi számítással
  const covered = points.length - missing.length;
  const last = body.split('\n').map((l) => l.trim()).filter(Boolean).at(-1) ?? '';
  const m = CLOSING.exec(last);
  if (!m) problems.push(`hiányzik a zárósor (a jelentés utolsó sora): „${closingLine({ covered, total: points.length, missing })}”`);
  else {
    const claimed = NONE.test(m[3].trim()) ? [] : m[3].split(/[,\s]+/).map((x) => x.trim()).filter(Boolean);
    if (Number(m[1]) !== covered || Number(m[2]) !== points.length || claimed.join(',') !== missing.join(',')) {
      problems.push(`a zárósor nem egyezik a gépi számítással — helyesen: „${closingLine({ covered, total: points.length, missing })}”`);
    }
  }
  return { ok: problems.length === 0 && missing.length === 0, problems, covered, total: points.length, missing };
}

function checkGeneric(body) {
  const problems = [];
  if (!body.trim()) problems.push('nincs záró válasz (a futás üres vagy csonka üzenettel ért véget)');
  const scan = stripCode(body);
  for (const [re, name] of FORBIDDEN) if (re.test(scan)) problems.push(`megállási / felajánló fordulat: ${name} — ez nem interaktív futás, senki nem válaszol`);
  const lines = body.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length && /\?\s*$/.test(lines.at(-1))) problems.push('a válasz kérdéssel zárul');
  const m = CLOSING.exec(lines.at(-1) ?? '');
  if (!m) problems.push('hiányzik a zárósor (a válasz utolsó sora): „TELJESSÉG: <kész> / <összes> — HIÁNYZÓ: nincs”');
  else if (Number(m[1]) !== Number(m[2]) || !NONE.test(m[3].trim())) problems.push(`a zárósor szerint maradt feldolgozatlan elem: ${lines.at(-1)}`);
  const covered = m ? Number(m[1]) : 0;
  const total = m ? Number(m[2]) : 0;
  return { ok: problems.length === 0, problems, covered, total, missing: [] };
}

export function closingLine({ covered, total, missing }) {
  return `TELJESSÉG: ${covered} / ${total} pont — HIÁNYZÓ: ${missing.length ? missing.join(', ') : 'nincs'}`;
}

/** A folytatásra küldött üzenet: a pontos hiánylista. */
export function continuationPrompt(result) {
  return [`A jelentés NEM TELJES (${result.covered} / ${result.total} hibakereső pont). Ne tervezz, ne kérdezz: fejezd be a munkát, és add le a TELJES jelentést. Hiányok:`,
    ...result.problems.map((p) => `- ${p}`), `Az utolsó sor pontosan: ${closingLine(result)} (a hiányok pótlása után a HIÁNYZÓ: nincs).`].join('\n');
}
