// GPT teljesítési őr — determinisztikus teljesség-ellenőrző (docs/specs/2026-11-20-gpt-teljesitesi-or.md).
// A GPT-modellek hajlamosak tervet / „következő lépésként…” szöveget adni a kész munka helyett, leletet javaslat nélkül írni,
// szakaszt vagy hibakereső pontot kihagyni. Ez a modul gépileg dönti el, hogy egy jelentés TELJES-e; a futtató (és a Codex-burok)
// hiány esetén ugyanabban a beszélgetésben folytatásra küldi a modellt a pontos hiánylistával.

/** A kötelező szakasz-fejlécek (a fejléc-sor ezzel a szöveggel kezdődik). */
export const REQUIRED = ['Ítélet', 'Leletek', 'A hibakereső pontok', 'Mit próbáltam megtörni, és nem sikerült', 'Mit NEM vizsgáltam'];

/**
 * Fordulat-minta Unicode-betűhatárral: a JavaScript `\b` csak ASCII-szóhatár, így az „és” elején vagy ékezetes betű után nem
 * illeszkedne (vak ellenőr L4).
 */
const P = (...alts) => new RegExp(alts.map((a) => `(?<![\\p{L}\\p{N}_])(?:${a})(?![\\p{L}\\p{N}_])`).join('|'), 'iu');

/** Megállási / felajánló / csonkító fordulatok (kódblokkon és soron belüli kódon kívül). */
export const FORBIDDEN = [
  [P('következő lépésként'), '„következő lépésként”'],
  [P('ha (?:szeretnéd|szeretné|szeretnétek|kéred|kéri)'), '„ha szeretnéd / kéred”'],
  [P('folytass(?:am|uk)', 'folytathatom'), '„folytassam?”'],
  [P('meg fogom', 'ellenőrizni fogom', 'meg fogjuk', 'vizsgálni fogom'), 'jövő idejű terv („meg fogom …”)'],
  [P('megnézem', 'megvizsgálom', 'utánanézek', 'átnézem', 'lefuttatom'), 'jövő idejű terv („megnézem …”)'],
  [P('és így tovább'), '„és így tovább”'],
  [P('példaként néhány', 'néhány példa'), '„példaként néhány”'],
  [P('next steps?'), '„next step”'],
  [P('let me know'), '„let me know”'],
  [P('would you like', 'shall i', 'do you want me'), '„would you like / shall I”'],
  [P("i(?:'ll| will)(?: now)? (?:check|look|investigate|review|run|continue)", 'i will now'), '„I will now …”'],
  [P('to be continued', 'folytatás következik'), '„folytatás következik”'],
];

/**
 * A pontsor szerződése (vak ellenőr L1): `<azonosító>. <ÍTÉLET> — <bizonyíték>`, ahol az ÍTÉLET zárt készletből való (talált hiba /
 * próbáltam [megtörni,] nem sikerült [megtörni] / nem alkalmazható), utána elválasztó (— – : -), és külön bizonyíték. A puszta cím
 * („Adatvédelmi hibakereső pont”) vagy a bizonyíték nélküli ítélet nem tárgyalt pont; „talált hiba” mellett a Leletek azonosítója kötelező.
 */
const VERDICT_LINE = /^(?:\*\*)?\s*(talált hib(?:a|át)|próbáltam(?:[\s,]+megtörni)?[\s,]+(?:és\s+)?nem sikerült(?:\s+megtörni)?|nem alkalmazható)\s*[.!]?\s*(?:\*\*)?\s*[—–:-]+\s*([\s\S]*)$/iu;
const MIN_EVIDENCE = 30;
const FIND_ID = /^\s*(?:#{1,6}\s*|[-*]\s*)(?:\*\*)?([A-Z][A-Za-z]?\d+[a-z]?)(?![A-Za-z0-9])/;
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

/** A kódkerítések tartalma sor- és hosszhű szóközökre cserélve — a fejléc- és pontsor-felismerés idézett szövegen nem fut (vak ellenőr L3). */
function blankFences(text) {
  let inFence = false;
  return text.split('\n').map((l) => {
    // hosszt megtartó csere (szóközök): a fejléc-pozíciók az eredeti szövegre is érvényesek
    if (/^\s*(```|~~~)/.test(l)) { inFence = !inFence; return ' '.repeat(l.length); }
    return inFence ? ' '.repeat(l.length) : l;
  }).join('\n');
}

/** Szakaszok: a fejléceket a kerítés-mentes szövegen keresi, a törzs az EREDETI szövegből (ugyanazokkal a sorhatárokkal). */
function sections(text) {
  const blank = blankFences(text);
  const heads = [...blank.matchAll(/^#{1,6}\s*(.+?)\s*$/gm)].map((m) => ({ title: m[1].replace(/\*/g, '').trim(), at: m.index, end: m.index + m[0].length }));
  return heads.map((h, i) => ({ ...h, body: text.slice(h.end, i + 1 < heads.length ? heads[i + 1].at : undefined), blankBody: blank.slice(h.end, i + 1 < heads.length ? heads[i + 1].at : undefined) }));
}

/** Egy kötelező szakasz teljes szövege a következő KÖTELEZŐ fejlécig (az alfejlécek — pl. „### L1” — a szakasz részei). */
function requiredSpan(secs, title) {
  const i = secs.findIndex((s) => s.title.startsWith(title));
  if (i < 0) return null;
  let body = secs[i].body;
  let blank = secs[i].blankBody;
  for (let k = i + 1; k < secs.length && !REQUIRED.some((r) => secs[k].title.startsWith(r)); k += 1) {
    body += `\n${'#'.repeat(3)} ${secs[k].title}${secs[k].body}`;
    blank += `\n${'#'.repeat(3)} ${secs[k].title}${secs[k].blankBody}`;
  }
  return { body, blank };
}

/** A Leletek szakasz lelet-azonosítói és a hozzájuk tartozó szövegrész (a következő lelet-sorig). */
function markdownFindings(secs) {
  const span = requiredSpan(secs, 'Leletek');
  if (!span) return [];
  const lines = span.body.split('\n');
  const blank = span.blank.split('\n');
  const out = [];
  for (let i = 0; i < blank.length; i += 1) {
    const id = FIND_ID.exec(blank[i])?.[1];
    if (!id) continue;
    let k = i + 1;
    while (k < blank.length && !FIND_ID.test(blank[k])) k += 1;
    out.push({ id, text: lines.slice(i, k).join('\n') });
  }
  return out;
}

/** A futtató gépi összegzésének lelet-listája (forgatókönyvvel és javítással) — rögzítéskor ez a viszonyítás. */
export const SUMMARY_FINDINGS_HEADING = '### Leletek forgatókönyvvel és javítással (a futtató írta a findings tömbből)';
function summaryFindingIds(text) {
  const s = norm(text);
  const at = s.indexOf(SUMMARY_FINDINGS_HEADING);
  if (at < 0) return null;
  const rest = s.slice(at + SUMMARY_FINDINGS_HEADING.length);
  const end = rest.search(/\n#{2,3} /);
  return [...(end < 0 ? rest : rest.slice(0, end)).matchAll(/^- \*\*([^*\s]+)\*\*/gm)].map((m) => m[1]);
}

/**
 * @param {string} text a jelentés (a gépi lábléc lehet benne — levágjuk)
 * @param {{ points: string[], findings?: object[]|null, mode?: 'review'|'generic' }} o
 *   mode = 'generic' (Codex-kutatás): nincs szakasz- és pontlista, csak nem üres válasz + tiltott fordulatok + a zárósor (x = y, HIÁNYZÓ: nincs).
 * @returns {{ ok: boolean, problems: string[], covered: number, total: number, missing: string[] }}
 */
export function checkCompleteness(text, { points = [], findings = null, mode = 'review', expectedTotal = null }) {
  const body = modelText(text);
  const problems = [];
  if (mode === 'generic') return checkGeneric(body, { expectedTotal });
  const secs = sections(body);
  for (const r of REQUIRED) if (!secs.some((s) => s.title.startsWith(r))) problems.push(`hiányzó kötelező szakasz: „${r}”`);

  // hibakereső pontok: saját sor, ítélet-szó, tartalom (a következő pont-sorig tartó szöveggel együtt)
  const mdFindings = markdownFindings(secs);
  const mdIds = new Set(mdFindings.map((f) => f.id));
  const pts = secs.find((s) => s.title.startsWith('A hibakereső pontok'));
  const missing = [];
  const lines = pts ? pts.body.split('\n') : [];
  const blankLines = pts ? pts.blankBody.split('\n') : [];
  const idAt = (k) => /^\s*(?:[-*]\s*)?(?:\*\*)?(\d+[a-z]?)[.)]/.exec(blankLines[k] ?? '')?.[1] ?? null;
  for (const id of points) {
    const i = blankLines.findIndex((_, k) => idAt(k) === id);
    if (i < 0) { missing.push(id); continue; }
    let chunk = lines[i].replace(/^\s*(?:[-*]\s*)?(?:\*\*)?\d+[a-z]?[.)]\s*(?:\*\*)?/, '');
    for (let k = i + 1; k < lines.length && !idAt(k); k += 1) chunk += `\n${lines[k]}`;
    const m = VERDICT_LINE.exec(chunk.trim());
    const evidence = m ? m[2].replace(/\s+/g, ' ').trim() : '';
    const found = m && /^talált/i.test(m[1]);
    const refs = found ? [...evidence.matchAll(/(?<![A-Za-z0-9])([A-Z][A-Za-z]?\d+[a-z]?)(?![A-Za-z0-9])/g)].map((x) => x[1]).filter((x) => mdIds.has(x)) : [];
    if (!m || evidence.replace(/\s+/g, '').length < MIN_EVIDENCE || (found && refs.length === 0)) missing.push(id);
  }
  if (missing.length) problems.push(`hibakereső pont hiányzik vagy ítélet / bizonyíték nélküli: ${missing.join(', ')} (minden pont saját sorban: „<azonosító>. <ítélet: talált hiba / próbáltam, nem sikerült megtörni / nem alkalmazható> — <bizonyíték, legalább ${MIN_EVIDENCE} karakter; talált hibánál a lelet azonosítójával, pl. L1>”)`);

  // a Leletek szakasz és a strukturált leletek kétirányú egyezése (vak ellenőr L2)
  const arr = Array.isArray(findings) ? findings : null;
  if (arr) {
    const arrIds = new Set(arr.map((f) => String(f?.id ?? '').trim()));
    for (const f of mdFindings) if (!arrIds.has(f.id)) problems.push(`${f.id}: a „Leletek” szakaszban szerepel, de a findings tömbben nincs (forgatókönyv + javaslat nélkül nem adható le) — vedd fel a tömbbe, vagy töröld a szövegből`);
  } else {
    const sumIds = summaryFindingIds(text);
    if (sumIds) {
      for (const f of mdFindings) if (!sumIds.includes(f.id)) problems.push(`${f.id}: a „Leletek” szakaszban szerepel, de a futtató gépi összegzésben nincs (a findings tömbből kimaradt lelet)`);
    } else {
      for (const f of mdFindings) if (!/forgatókönyv/i.test(f.text) || !/javaslat|javítás/i.test(f.text)) problems.push(`${f.id}: a lelet szövegéből hiányzik a forgatókönyv vagy a javaslat (Forgatókönyv: … / Javaslat: …)`);
    }
  }
  const verdictLine = /^#{1,6}\s*Ítélet:\s*(.+)$/m.exec(blankFences(body))?.[1]?.replace(/\*/g, '').trim() ?? '';
  const nFindings = arr ? arr.length : (summaryFindingIds(text) ?? mdFindings.map((f) => f.id)).length;
  if (/FELTÉTELLEL/i.test(verdictLine) && nFindings === 0) problems.push('„IGEN, FELTÉTELLEL” ítélethez legalább egy lelet kell (a feltétel a lelet) — vagy IGEN');
  if (/^NEM\b/.test(verdictLine) && nFindings === 0) problems.push('NEM ítélethez legalább egy (blokkoló) lelet kell');

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

function checkGeneric(body, { expectedTotal = null } = {}) {
  const problems = [];
  if (!body.trim()) problems.push('nincs záró válasz (a futás üres vagy csonka üzenettel ért véget)');
  const scan = stripCode(body);
  for (const [re, name] of FORBIDDEN) if (re.test(scan)) problems.push(`megállási / felajánló fordulat: ${name} — ez nem interaktív futás, senki nem válaszol`);
  const lines = body.split('\n').map((l) => l.trim()).filter(Boolean);
  const m = CLOSING.exec(lines.at(-1) ?? '');
  // az érdemi törzs: a zárósor ELŐTTI rész (vak ellenőr L8) — nem lehet üres, és nem zárulhat kérdéssel
  const bodyLines = m ? lines.slice(0, -1) : lines;
  if (lines.length && !bodyLines.length) problems.push('a válaszban a zárósoron kívül nincs érdemi tartalom');
  if (bodyLines.length && /\?\s*\**\s*$/.test(bodyLines.at(-1))) problems.push('a válasz (a zárósor előtt) kérdéssel zárul — ez nem interaktív futás');
  if (!m) problems.push('hiányzik a zárósor (a válasz utolsó sora): „TELJESSÉG: <kész> / <összes> — HIÁNYZÓ: nincs”');
  else if (Number(m[1]) !== Number(m[2]) || !NONE.test(m[3].trim())) problems.push(`a zárósor szerint maradt feldolgozatlan elem: ${lines.at(-1)}`);
  else if (Number(m[2]) < 1) problems.push('a zárósor nevezője 0 — legalább egy elvégzett elem kell');
  if (m && expectedTotal != null && Number(m[2]) !== Number(expectedTotal)) problems.push(`a zárósor nevezője (${m[2]}) nem a megbízás feladatszáma (${expectedTotal}) — a nevezőt nem a modell választja`);
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
