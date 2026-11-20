#!/usr/bin/env node
// Session-zárás: kérés-összevetés a higiénia előtt (docs/specs/2026-11-20-session-zaras.md; skill: websuli-session-zaras).
// Tulajdonosi utasítás 2026-11-20: a session végén a gép gyűjti ki a tulajdonos MINDEN üzenetét (szöveg, kép, beillesztett blokk),
// az ügynök tételenként bizonyítékkal felelteti meg az elkészült munkának, és a gép ellenőrzi — csak zöld után jöhet a higiénia.
//
// Használat (a munkafa / repó gyökeréből):
//   node scripts/qa/session-closeout.mjs collect --transcript <átirat.jsonl> [--format claude|codex|plain]
//   node scripts/qa/session-closeout.mjs verify  --transcript <átirat.jsonl> [--base origin/main]
//   (--transcript helyett: --session <id> — a Claude Code projektek könyvtárában keresi)
// A lista és a bizonyíték a közös bizonyíték-tárba kerül (<git-common-dir>/websuli-qa-evidence/closeout-<session>.md|.json,
// closeout-ok-<session>.json) — a repóba tulajdonosi szöveg / személyes adat nem kerül.

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { argValue, evidenceDir, isMain, realExec, redact, writeEvidence } from './gates/lib.mjs';

const TAG = '[session-zárás]';
const sha256 = (s) => createHash('sha256').update(s).digest('hex');
/** A Claude Code átiratban a tulajdonos saját üzenetének jele (JSON-szövegben az idézőjel escape-elt, tartalomban nem fordul elő). */
const HUMAN_MARK = Buffer.from('"origin":{"kind":"human"');
const ORIGIN_KEY = Buffer.from('"origin":{');
const REMINDER = /<system-reminder>[\s\S]*?<\/system-reminder>/g;
/** Régi (origin nélküli) átiratban a gép által beszúrt „user” sorok kezdete. */
const SYNTHETIC = /^<(?:task-notification|ci-monitor-event|local-command-|command-name|command-message|command-args|system-reminder|bash-|user-memory-input|tick)/;
const CONTINUATION = /^(?:folytasd|folytatás|mehet|tovább|ok[eé]?|igen|nem|rendben|köszi|köszönöm|jó|go|continue|yes|no)\b[\s.!?]*$/i;

// ---- Átirat-olvasás ------------------------------------------------------------------------------------------------------

function blocksOf(content) {
  if (typeof content === 'string') return { text: content, images: 0, toolResult: false };
  if (!Array.isArray(content)) return { text: '', images: 0, toolResult: false };
  const texts = [];
  let images = 0;
  let toolResult = false;
  for (const b of content) {
    if (!b || typeof b !== 'object') continue;
    if (b.type === 'text' || b.type === 'input_text') texts.push(String(b.text ?? ''));
    else if (b.type === 'image' || b.type === 'input_image') images += 1;
    else if (b.type === 'tool_result') toolResult = true;
  }
  return { text: texts.join('\n'), images, toolResult };
}

const cleanText = (t) => String(t ?? '').replace(REMINDER, '').replace(/\r\n/g, '\n').trim();
const pastedCount = (t) => Math.floor((t.match(/^\s*```/gm) ?? []).length / 2) + (t.match(/\[Pasted text #\d+/g) ?? []).length;

/** Claude Code átirat-sor → tulajdonosi üzenet vagy null. `hasOrigin`: a fájl az `origin` mezős (új) formátumú-e. */
function ownerFromClaude(j, hasOrigin) {
  if (!j || typeof j !== 'object' || j.type !== 'user') return null;
  if (j.isSidechain || j.isMeta || j.isCompactSummary || j.message?.role !== 'user') return null;
  if (hasOrigin ? j.origin?.kind !== 'human' : j.origin != null) return null;
  const b = blocksOf(j.message.content);
  if (b.toolResult) return null;
  const text = cleanText(b.text);
  if (!hasOrigin && SYNTHETIC.test(text)) return null;
  if (!text && !b.images) return null;
  return { uuid: String(j.uuid ?? ''), ts: String(j.timestamp ?? ''), text: text || '(csak kép)', images: b.images, pasted: pastedCount(text) };
}

const INJECTED_CODEX = /^(?:# AGENTS\.md instructions|<([a-z_]+)>[\s\S]*<\/\1>\s*$)/;

function parseLines(text) {
  const out = [];
  let bad = 0;
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch { bad += 1; }
  }
  return { rows: out, bad };
}

function detectFormat(text) {
  const first = text.split('\n').find((l) => l.trim());
  try {
    const j = JSON.parse(first ?? '');
    if (j?.type === 'session_meta' || j?.type === 'response_item' || j?.type === 'event_msg') return 'codex';
  } catch { return 'claude'; } // nem JSON első sor: a Claude-ág a sérült sorokat számolja
  return 'claude';
}

/**
 * A tulajdonos saját üzenetei időrendben. `format`: auto | claude | codex | plain.
 * @returns {{ format: string, messages: {uuid,ts,text,images,pasted}[], bad: number, originBased: boolean }}
 */
export function extractOwnerMessages(input, { format = 'auto' } = {}) {
  const text = Buffer.isBuffer(input) ? input.toString('utf8') : String(input ?? '');
  const fmt = format === 'auto' ? detectFormat(text) : format;
  if (fmt === 'plain') {
    const parts = text.replace(/\r\n/g, '\n').split(/^---[ \t]*$/m).map((s) => s.trim()).filter(Boolean);
    return { format: 'plain', bad: 0, originBased: false, messages: parts.map((t, i) => ({ uuid: `plain-${i + 1}-${sha256(t).slice(0, 12)}`, ts: '', text: t, images: 0, pasted: pastedCount(t) })) };
  }
  const { rows, bad } = parseLines(text);
  const seen = new Set();
  const messages = [];
  if (fmt === 'codex') {
    rows.forEach((j, i) => {
      const p = j?.payload;
      if (j?.type !== 'response_item' || p?.type !== 'message' || p.role !== 'user') return;
      const b = blocksOf(p.content);
      const t = cleanText(b.text);
      if (INJECTED_CODEX.test(t) || (!t && !b.images)) return;
      messages.push({ uuid: `codex-${i + 1}`, ts: String(j.timestamp ?? ''), text: t || '(csak kép)', images: b.images, pasted: pastedCount(t) });
    });
    return { format: 'codex', bad, originBased: false, messages };
  }
  const hasOrigin = text.includes('"origin":{');
  for (const j of rows) {
    const m = ownerFromClaude(j, hasOrigin);
    if (!m || seen.has(m.uuid)) continue;
    seen.add(m.uuid);
    messages.push(m);
  }
  return { format: 'claude', bad, originBased: hasOrigin, messages };
}

/**
 * Gyors számlálás (a Stop hook ezt használja): a bájtpufferben a tulajdonosi jelet keresi `offset`-től, csak a találati sort
 * parse-olja. Origin nélküli (régi) átiratnál a teljes szelet parse-olása a tartalék.
 * @returns {{ count: number, lastUuid: string | null }}
 */
export function scanOwnerSince(buf, offset = 0, { hasOrigin } = {}) {
  const origin = hasOrigin ?? buf.includes(ORIGIN_KEY);
  if (!origin) {
    const ms = extractOwnerMessages(buf.subarray(offset), { format: 'claude' }).messages;
    return { count: ms.length, lastUuid: ms.length ? ms[ms.length - 1].uuid : null };
  }
  const seen = new Set();
  let last = null;
  let i = buf.indexOf(HUMAN_MARK, offset);
  while (i !== -1) {
    const s = buf.lastIndexOf(10, i) + 1;
    let e = buf.indexOf(10, i);
    if (e === -1) e = buf.length;
    if (s >= offset) {
      let j = null;
      try { j = JSON.parse(buf.toString('utf8', s, e)); } catch { j = null; } // sérült / félig írt sor: nem tulajdonosi üzenet
      const m = ownerFromClaude(j, true);
      if (m && !seen.has(m.uuid)) { seen.add(m.uuid); last = m.uuid; }
    }
    i = buf.indexOf(HUMAN_MARK, e);
  }
  return { count: seen.size, lastUuid: last };
}

// ---- Tételek és a kitöltendő lista ---------------------------------------------------------------------------------------

const itemHash = (m) => sha256(`${m.text}\n#kepek=${m.images}`);

export function buildItems(messages) {
  return messages.map((m, i) => ({
    id: `U-${String(i + 1).padStart(3, '0')}`, uuid: m.uuid, ts: m.ts, text: m.text, images: m.images, pasted: m.pasted,
    sha256: itemHash(m), hint: m.text.length <= 40 && CONTINUATION.test(m.text.trim()) ? 'nem önálló kérés gyanú' : null,
  }));
}

export const STATUSES = ['KÉSZ', 'RÉSZBEN', 'FOLYAMATBAN', 'DÖNTÉSRE VÁR', 'ELVETVE', 'NEM ÉRTELMEZHETŐ', 'NEM ÖNÁLLÓ KÉRÉS', 'MEGVÁLASZOLVA'];

function header({ session, transcript, items }) {
  return [
    '# Session-zárás — kérés-összevetés',
    `<!-- closeout v1 session=${session} -->`,
    `Átirat: ${transcript}`,
    `Gyűjtve: ${new Date().toISOString()} · tulajdonosi üzenet: ${items.length}`,
    '',
    `Kitöltés: minden tételhez (és altételhez) \`Állapot:\` és \`Bizonyíték:\`. Állapotok: ${STATUSES.join(' | ')}.`,
    'Bizonyíték-alakok: `PR #12`, `commit abc1234` vagy `commit abc1234@ág`, `kanban #45`, `fájl docs/x.md:12`, `döntés U-004`,',
    '`→ U-002`; külön sorban: `Kérdés:`, `Válasz:`, `Megjegyzés:`. Összetett üzenet: `### U-007a — rövid cím` altételek.',
    'Szabályok: .agents/skills/websuli-session-zaras/SKILL.md · Ellenőrzés: node scripts/qa/session-closeout.mjs verify',
    '',
  ].join('\n');
}

function renderItem(it) {
  const time = it.ts ? it.ts.replace('T', ' ').replace(/\.\d+Z$|Z$/, ' UTC') : '—';
  const meta = [`Idő: ${time}`, `képek: ${it.images}`, `beillesztett blokk: ${it.pasted}`, ...(it.hint ? [it.hint] : [])].join(' · ');
  const lines = redact(it.text).split('\n');
  const quote = lines.slice(0, 60).map((l) => `> ${l}`.trimEnd());
  if (lines.length > 60) quote.push(`> … (+${lines.length - 60} sor; a teljes szöveg a closeout-*.json-ban)`);
  return [`## ${it.id}`, `<!-- uuid=${it.uuid} sha256=${it.sha256} -->`, meta, ...quote, '', 'Állapot:', 'Bizonyíték:', ''].join('\n');
}

function renderStatement(n) {
  return ['## Felelős nyilatkozat', `Minta: „A(z) ${n} tulajdonosi üzenet alapján a szakaszt elvégeztem és ellenőriztem; a nyitott tételek és okaik: U-…”`, 'Nyilatkozat:', ''].join('\n');
}

export function renderMarkdown({ session, transcript, items }) {
  return [header({ session, transcript, items }), ...items.map(renderItem), renderStatement(items.length)].join('\n');
}

/** A lista szakaszai: `[{ kind: 'item'|'statement'|'head', id, uuid, raw }]`. */
function sections(md) {
  const text = String(md).replace(/\r\n/g, '\n');
  const out = [];
  const re = /^## (.+)$/gm;
  const starts = [...text.matchAll(re)].map((m) => ({ at: m.index, title: m[1].trim() }));
  out.push({ kind: 'head', raw: text.slice(0, starts.length ? starts[0].at : text.length) });
  starts.forEach((s, i) => {
    const raw = text.slice(s.at, i + 1 < starts.length ? starts[i + 1].at : text.length);
    const idm = /^(U-\d{3,})\s*$/.exec(s.title);
    if (idm) out.push({ kind: 'item', id: idm[1], uuid: /<!-- uuid=(\S+) sha256=/.exec(raw)?.[1] ?? null, raw });
    else if (/^Felelős nyilatkozat/i.test(s.title)) out.push({ kind: 'statement', raw });
    else out.push({ kind: 'other', raw });
  });
  return out;
}

/** Ismételt gyűjtés: a meglévő kitöltés (uuid szerint) és a nyilatkozat megmarad, az új üzenet a végére kerül. */
export function mergeMarkdown(oldMd, { session, transcript, items }) {
  const old = sections(oldMd);
  const byUuid = new Map(old.filter((s) => s.kind === 'item' && s.uuid).map((s) => [s.uuid, s]));
  const used = new Set();
  const body = items.map((it) => {
    const prev = byUuid.get(it.uuid);
    if (prev) { used.add(it.uuid); return prev.raw.replace(/\n*$/, '\n'); }
    return renderItem(it);
  });
  const orphans = old.filter((s) => s.kind === 'item' && !used.has(s.uuid)).map((s) => s.raw.replace(/\n*$/, '\n'));
  const st = old.find((s) => s.kind === 'statement');
  return [header({ session, transcript, items }), ...body, ...orphans, st ? st.raw.replace(/\n*$/, '\n') : renderStatement(items.length)].join('\n');
}

const fold = (s) => String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toUpperCase().replace(/[\s_-]+/g, ' ').replace(/[.!:;,]+$/, '').trim();

export function normalizeStatus(raw) {
  const s = fold(raw);
  if (!s) return null;
  if (s === 'KESZ') return 'KESZ';
  if (s === 'RESZBEN') return 'RESZBEN';
  if (s === 'FOLYAMATBAN') return 'FOLYAMATBAN';
  if (s === 'DONTESRE VAR') return 'DONTESRE_VAR';
  if (s.startsWith('ELVETVE')) return 'ELVETVE';
  if (s.startsWith('NEM ERTELMEZHETO')) return 'NEM_ERTELMEZHETO';
  if (s.startsWith('NEM ONALLO')) return 'NEM_ONALLO';
  if (s === 'MEGVALASZOLVA') return 'MEGVALASZOLVA';
  return 'UNKNOWN';
}

const LABEL = { KESZ: 'KÉSZ', RESZBEN: 'RÉSZBEN', FOLYAMATBAN: 'FOLYAMATBAN', DONTESRE_VAR: 'DÖNTÉSRE VÁR', ELVETVE: 'ELVETVE', NEM_ERTELMEZHETO: 'NEM ÉRTELMEZHETŐ', NEM_ONALLO: 'NEM ÖNÁLLÓ KÉRÉS', MEGVALASZOLVA: 'MEGVÁLASZOLVA' };

const field = (block, name) => {
  const m = new RegExp(`^${name}:(.*)$`, 'm').exec(block);
  return m ? m[1].trim() : '';
};

function parseUnit(id, title, block) {
  const rawStatus = field(block, 'Állapot');
  const ev = field(block, 'Bizonyíték');
  const question = field(block, 'Kérdés');
  const answer = field(block, 'Válasz');
  const note = field(block, 'Megjegyzés');
  const all = `${ev}\n${note}`;
  return {
    id, title, rawStatus, status: normalizeStatus(rawStatus), question, answer, note,
    evidence: {
      prs: [...all.matchAll(/\bPR\s*#(\d+)/gi)].map((m) => Number(m[1])),
      commits: [...all.matchAll(/\bcommit\s+([0-9a-f]{7,40})(?:@([\w./-]+))?/gi)].map((m) => ({ hash: m[1].toLowerCase(), branch: m[2] ?? null })),
      kanban: [...all.matchAll(/\bkanban\s*#(\d+)/gi)].map((m) => Number(m[1])),
      files: [...all.matchAll(/\bf[aá]jl\s+([^\s:;,]+):(\d+)/gi)].map((m) => ({ path: m[1], line: Number(m[2]) })),
      decisions: [...all.matchAll(/\bd[öo]nt[ée]s\s+(U-\d{3,}[a-z]?)/gi)].map((m) => m[1]),
      follows: [...all.matchAll(/(?:→|->|folytatás)\s*(U-\d{3,}[a-z]?)/gi)].map((m) => m[1]),
    },
  };
}

/** A kitöltött lista: tételek (altételekkel) és a nyilatkozat. */
export function parseFilled(md) {
  const items = [];
  let statement = null;
  for (const s of sections(md)) {
    if (s.kind === 'statement') {
      const m = /^Nyilatkozat:([\s\S]*)$/m.exec(s.raw);
      statement = m ? m[1].trim() || null : null;
      continue;
    }
    if (s.kind !== 'item') continue;
    const sha = /sha256=([0-9a-f]{64})/.exec(s.raw)?.[1] ?? null;
    const subRe = /^### (U-\d{3,}[a-z])\b(.*)$/gm;
    const subs = [...s.raw.matchAll(subRe)];
    const mainBlock = subs.length ? s.raw.slice(0, subs[0].index) : s.raw;
    const unit = parseUnit(s.id, '', mainBlock);
    unit.subs = subs.map((m, i) => parseUnit(m[1], m[2].replace(/^\s*[—-]\s*/, '').trim(), s.raw.slice(m.index, i + 1 < subs.length ? subs[i + 1].index : s.raw.length)));
    items.push({ ...unit, uuid: s.uuid, sha256: sha });
  }
  return { items, statement };
}

// ---- Ellenőrzés -----------------------------------------------------------------------------------------------------------

/**
 * @param {{ items: object[], md: string, check: { commit(hash, branch), pr(n), kanban(n), file(path, line) }, base?: string }} p
 * @returns {{ ok: boolean, problems: string[], open: string[] }}
 */
export function verifyCloseout({ items, md, check, base = 'origin/main' }) {
  const problems = [];
  const open = [];
  const parsed = parseFilled(md);
  const byUuid = new Map(parsed.items.map((p) => [p.uuid, p]));
  const known = new Set(items.map((i) => i.uuid));
  for (const it of items) {
    const p = byUuid.get(it.uuid);
    if (!p) { problems.push(`${it.id}: a lista régebbi az átiratnál — ez a tulajdonosi üzenet nincs a listában; futtasd újra a collect-et (a kitöltés megmarad)`); continue; }
    if (p.sha256 !== it.sha256) problems.push(`${p.id}: a tétel szövege eltér az átirattól (sha256) — futtasd újra a collect-et, és ne írd át az idézetet`);
  }
  for (const p of parsed.items) if (!known.has(p.uuid)) problems.push(`${p.id}: ismeretlen tétel (az uuid nincs az átiratban) — a listát csak a collect bővítheti`);

  const allIds = new Set(parsed.items.flatMap((p) => [p.id, ...p.subs.map((s) => s.id)]));
  const refOk = (ref, self) => allIds.has(ref) && ref !== self.id && !ref.startsWith(`${self.id}`) && !self.id.startsWith(ref);

  const evalUnit = (u) => {
    const label = LABEL[u.status] ?? u.rawStatus;
    if (!u.status) { problems.push(`${u.id}: kitöltetlen (Állapot:) — pótold a munkát, vagy tedd kanban-jegyre / tulajdonosi kérdésre`); return; }
    if (u.status === 'UNKNOWN') { problems.push(`${u.id}: ismeretlen állapot „${u.rawStatus}” — elfogadott: ${STATUSES.join(' | ')}`); return; }
    const e = u.evidence;
    const verifyCited = ({ needDone }) => {
      let openFound = false;
      for (const c of e.commits) {
        const r = check.commit(c.hash, c.branch);
        if (!r?.ok) problems.push(`${u.id}: commit ${c.hash}${c.branch ? `@${c.branch}` : ''} — ${r?.note ?? 'nem igazolható'}`);
      }
      for (const n of e.prs) {
        const r = check.pr(n);
        if (!r) problems.push(`${u.id}: PR #${n} — nem igazolható (a gh nem adott választ / nem létező PR)`);
        else if (needDone && r.state !== 'MERGED') problems.push(`${u.id}: PR #${n} — állapota ${r.state}, a KÉSZ-hez MERGED kell`);
        else if (r.state === 'OPEN') openFound = true;
      }
      for (const n of e.kanban) {
        const r = check.kanban(n);
        if (!r) problems.push(`${u.id}: kanban #${n} — nem igazolható (a kanban-CLI nem érhető el: HERMES_KANBAN_CLI)`);
        else if (r.missing) problems.push(`${u.id}: kanban #${n} — nem létező jegy`);
        else if (needDone && r.status !== 'done') problems.push(`${u.id}: kanban #${n} — állapota ${r.status}, a KÉSZ-hez done kell`);
        else if (r.status !== 'done') openFound = true;
      }
      for (const f of e.files) {
        if (!check.file(f.path, f.line)) problems.push(`${u.id}: fájl ${f.path}:${f.line} — nincs az ${base}-en, vagy rövidebb ${f.line} sornál`);
      }
      return openFound;
    };
    switch (u.status) {
      case 'KESZ':
        if (!e.commits.length && !e.prs.length && !e.kanban.length && !e.files.length) problems.push(`${u.id}: KÉSZ, de nincs gépi bizonyíték (PR #n / commit <hash> / kanban #n / fájl <út>:<sor>)`);
        else verifyCited({ needDone: true });
        break;
      case 'RESZBEN':
      case 'FOLYAMATBAN':
        if (!verifyCited({ needDone: false })) problems.push(`${u.id}: ${label} — nyitott kanban-jegy vagy nyitott PR kell bizonyítéknak (kanban #n / PR #n)`);
        open.push(u.id);
        break;
      case 'DONTESRE_VAR':
        if (u.question.length < 10) problems.push(`${u.id}: DÖNTÉSRE VÁR — a Kérdés: sor (a tulajdonosnak feltett kérdés, opciókkal) kötelező`);
        verifyCited({ needDone: false });
        open.push(u.id);
        break;
      case 'ELVETVE':
        if (!e.decisions.length || !e.decisions.every((d) => refOk(d, u))) problems.push(`${u.id}: ELVETVE — „döntés U-xxx” hivatkozás kell egy létező, MÁSIK tételre (a tulajdonos döntését tartalmazó üzenet)`);
        break;
      case 'NEM_ERTELMEZHETO':
        if (u.question.length < 10) problems.push(`${u.id}: NEM ÉRTELMEZHETŐ — a Kérdés: sor (a rákérdezés szövege) kötelező`);
        open.push(u.id);
        break;
      case 'NEM_ONALLO':
        if (!(e.follows.some((f) => refOk(f, u)) || u.note.length >= 5)) problems.push(`${u.id}: NEM ÖNÁLLÓ KÉRÉS — „→ U-xxx” (amit folytat) vagy Megjegyzés: kell`);
        break;
      case 'MEGVALASZOLVA':
        if (u.answer.length < 20) problems.push(`${u.id}: MEGVÁLASZOLVA — a Válasz: sor (a válasz lényege, ≥ 20 karakter) kötelező`);
        open.push(u.id); // nem géppel igazolt: a nyilatkozatban fel kell sorolni
        break;
      default:
        break;
    }
  };
  for (const p of parsed.items) {
    if (!known.has(p.uuid)) continue;
    const units = p.subs.length ? (p.status ? [p, ...p.subs] : p.subs) : [p];
    units.forEach(evalUnit);
  }

  const st = parsed.statement;
  if (!st) problems.push('Felelős nyilatkozat: hiányzik (a „Nyilatkozat:” sor üres)');
  else {
    if (!/elvégeztem és ellenőriztem/i.test(st)) problems.push('Felelős nyilatkozat: hiányzik az „elvégeztem és ellenőriztem” kijelentés');
    if (!new RegExp(`(?<!\\d)${items.length} tulajdonosi üzenet`).test(st)) problems.push(`Felelős nyilatkozat: a tételszám hiányzik vagy hibás — „${items.length} tulajdonosi üzenet” kell`);
    for (const id of open) if (!new RegExp(`${id}(?![a-z0-9])`).test(st)) problems.push(`Felelős nyilatkozat: hiányzik a nyitott / nem géppel igazolt tétel: ${id} (és az oka)`);
  }
  return { ok: problems.length === 0, problems, open };
}

// ---- Gépi ellenőrzők (git / gh / kanban) ----------------------------------------------------------------------------------

export function kanbanCli(env = process.env) {
  if (env.HERMES_KANBAN_CLI) return env.HERMES_KANBAN_CLI;
  if (env.LOCALAPPDATA) return join(env.LOCALAPPDATA, 'hermes', 'skills', 'software-development', 'hermes-kanban-workflow', 'scripts', 'kanban.mjs');
  return null;
}

export function makeCheckers({ exec = realExec, root, mainRoot, base = 'origin/main', env = process.env }) {
  const git = (args) => exec('git', args, { cwd: root, timeoutMs: 30_000 });
  const exists = (ref) => git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
  return {
    commit(hash, branch) {
      const r = exists(hash);
      if (r.code !== 0) return { ok: false, note: 'nem létező commit ebben a repóban' };
      const full = r.stdout.trim();
      let target = base;
      if (branch) {
        target = [branch, `origin/${branch}`].find((b) => exists(b).code === 0);
        if (!target) return { ok: false, note: `a(z) ${branch} ág nem létezik (helyben sem, az origin-en sem)` };
      }
      const a = git(['merge-base', '--is-ancestor', full, target]);
      return a.code === 0 ? { ok: true } : { ok: false, note: `nincs az ${target}-en` };
    },
    pr(n) {
      const r = exec('gh', ['pr', 'view', String(n), '--json', 'state,number'], { cwd: root, timeoutMs: 30_000 });
      if (r.code !== 0) return null;
      try { const j = JSON.parse(r.stdout); return j?.state ? { state: String(j.state).toUpperCase() } : null; } catch { return null; }
    },
    kanban(n) {
      const cli = kanbanCli(env);
      if (!cli || !existsSync(cli)) return null;
      const r = exec(process.execPath, ['--no-warnings', cli, 'show', String(n)], { cwd: mainRoot, timeoutMs: 30_000 });
      if (r.code !== 0) return /no item with id/i.test(`${r.stdout}${r.stderr}`) ? { missing: true } : null;
      const m = /^#(\d+)\s+\[([\w-]+)\]/m.exec(r.stdout);
      return m && Number(m[1]) === n ? { status: m[2].toLowerCase() } : null;
    },
    file(path, line) {
      const r = git(['show', `${base}:${path.replace(/\\/g, '/')}`]);
      if (r.code !== 0) return false;
      const lines = r.stdout.replace(/\r\n/g, '\n').split('\n');
      if (lines.length && lines[lines.length - 1] === '') lines.pop();
      return line >= 1 && lines.length >= line;
    },
  };
}

// ---- CLI ------------------------------------------------------------------------------------------------------------------

export function sessionIdOf(transcript) {
  return basename(transcript).replace(/\.jsonl?$/i, '').replace(/[^A-Za-z0-9_.-]+/g, '_');
}

/** `--transcript <út>` vagy `--session <id>` → abszolút útvonal; hibánál Error. */
export function resolveTranscript(args, env = process.env) {
  const t = argValue(args, '--transcript');
  if (t) {
    const p = resolve(t);
    if (!existsSync(p)) throw new Error(`az átirat nem található: ${p}`);
    return p;
  }
  const id = argValue(args, '--session');
  if (id) {
    const projects = join(env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), 'projects');
    if (existsSync(projects)) {
      for (const d of readdirSync(projects)) {
        const p = join(projects, d, `${id}.jsonl`);
        if (existsSync(p)) return p;
      }
    }
    throw new Error(`a(z) ${id} session átirata nem található (${projects}) — add meg közvetlenül: --transcript <út>`);
  }
  throw new Error('add meg: --transcript <átirat.jsonl> vagy --session <id> (a Stop hook üzenete a pontos parancsot megadja)');
}

/** Bizonyíték-tár és gyökerek az aktuális könyvtárból. */
export function locate(exec = realExec, cwd = process.cwd()) {
  const r = exec('git', ['rev-parse', '--show-toplevel', '--git-common-dir'], { cwd, timeoutMs: 30_000 });
  if (r.code !== 0) throw new Error('nem git-repó: a parancsot a WEBSULI munkafájából / gyökeréből futtasd');
  const [top, common] = r.stdout.trim().split(/\r?\n/);
  const commonDir = isAbsolute(common) ? common : resolve(cwd, common);
  return { root: top, commonDir, mainRoot: basename(commonDir) === '.git' ? dirname(commonDir) : top, evDir: evidenceDir(commonDir) };
}

export function ownerSliceSha(items) {
  return sha256(items.map((i) => `${i.uuid}:${i.sha256}`).join('\n'));
}

export const listSha = (md) => sha256(String(md).replace(/\r\n/g, '\n'));

function load(args) {
  const transcript = resolveTranscript(args);
  const buf = readFileSync(transcript);
  const r = extractOwnerMessages(buf, { format: argValue(args, '--format', 'auto') });
  return { transcript, buf, ...r, items: buildItems(r.messages), session: sessionIdOf(transcript) };
}

function cmdCollect(args) {
  const L = load(args);
  const loc = locate();
  mkdirSync(loc.evDir, { recursive: true });
  const mdPath = join(loc.evDir, `closeout-${L.session}.md`);
  const md = existsSync(mdPath)
    ? mergeMarkdown(readFileSync(mdPath, 'utf8'), { session: L.session, transcript: L.transcript, items: L.items })
    : renderMarkdown({ session: L.session, transcript: L.transcript, items: L.items });
  writeFileSync(mdPath, md);
  writeEvidence(loc.evDir, `closeout-${L.session}`, {
    kind: 'closeout-list', session: L.session, transcript: L.transcript, format: L.format, originBased: L.originBased,
    transcriptBytes: L.buf.length, at: new Date().toISOString(),
    items: L.items.map((i) => ({ ...i, text: redact(i.text) })),
  });
  const img = L.items.filter((i) => i.images).length;
  const pasted = L.items.filter((i) => i.pasted).length;
  const cont = L.items.filter((i) => i.hint).length;
  process.stdout.write(`${TAG} ${L.items.length} tulajdonosi üzenet (képes: ${img}, beillesztett blokkos: ${pasted}, nem önálló kérés gyanú: ${cont}); formátum: ${L.format}; sérült sor: ${L.bad}\n`);
  process.stdout.write(`${TAG} kitöltendő lista: ${mdPath}\n`);
  process.stdout.write(`${TAG} következő: töltsd ki minden tételét (állapot + bizonyíték), írd meg a felelős nyilatkozatot, majd: node scripts/qa/session-closeout.mjs verify --transcript "${L.transcript}"\n`);
  return 0;
}

function cmdVerify(args) {
  const L = load(args);
  const loc = locate();
  const mdPath = join(loc.evDir, `closeout-${L.session}.md`);
  if (!existsSync(mdPath)) {
    process.stdout.write(`${TAG} HIBA: nincs zárólista (${mdPath}) — előbb: node scripts/qa/session-closeout.mjs collect --transcript "${L.transcript}"\n`);
    return 1;
  }
  const md = readFileSync(mdPath, 'utf8');
  const base = argValue(args, '--base', 'origin/main');
  const res = verifyCloseout({ items: L.items, md, base, check: makeCheckers({ root: loc.root, mainRoot: loc.mainRoot, base }) });
  if (!res.ok) {
    for (const p of res.problems) process.stdout.write(`${TAG} HIBA ${redact(p)}\n`);
    process.stdout.write(`${TAG} BUKOTT (${res.problems.length} hiba) — pótold a hiányzó munkát vagy tedd kanban-jegyre / tulajdonosi kérdésre, javítsd a listát (${mdPath}), és futtasd újra a verify-t. Megkerülni tilos.\n`);
    return 1;
  }
  const last = L.items.length ? L.items[L.items.length - 1].uuid : null;
  const p = writeEvidence(loc.evDir, `closeout-ok-${L.session}`, {
    kind: 'closeout', session: L.session, transcript: L.transcript, format: L.format, originBased: L.originBased,
    transcriptBytes: L.buf.length, ownerCount: L.items.length, lastOwnerUuid: last,
    ownerSliceSha256: ownerSliceSha(L.items), listSha256: listSha(md), open: res.open, at: new Date().toISOString(),
  });
  process.stdout.write(`${TAG} ZÖLD — ${L.items.length} tulajdonosi üzenet összevetve, nyitott tétel: ${res.open.length ? res.open.join(', ') : 'nincs'}\n`);
  process.stdout.write(`${TAG} bizonyíték: ${p}\n${TAG} ezután jöhet a higiénia: npm run session:hygiene -- --transcript "${L.transcript}"\n`);
  return 0;
}

function main() {
  const [cmd, ...args] = process.argv.slice(2);
  try {
    if (cmd === 'collect') process.exit(cmdCollect(args));
    if (cmd === 'verify') process.exit(cmdVerify(args));
    process.stderr.write(`${TAG} használat: node scripts/qa/session-closeout.mjs collect|verify --transcript <átirat.jsonl> | --session <id>\n`);
    process.exit(2);
  } catch (e) {
    process.stderr.write(`${TAG} HIBA: ${redact(e?.message ?? e)}\n`);
    process.exit(1);
  }
}

if (isMain(import.meta.url)) main();
