// Díjmentes életjel-felügyelet (docs/specs/2026-11-20-gpt-teljesitesi-or.md, kiegészítés): csendben álló stream, csonka stream,
// szívverés, a Codex-burok beragadás-felismerése és a „tokens used” sor olvasása. Egyik teszt sem hív valódi API-t.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CFG, REPORT } from './_fixture.mjs';
import { callOpenRouterStream } from './stream.mjs';
import { judgeHeartbeat } from './heartbeat.mjs';
import { networkStall, runCodexComplete, sessionIdFrom, tokensUsed, watchedExec } from './codex-complete.mjs';
import { checkCompleteness } from './completeness.mjs';
import { createBudget, runReview } from './blind-review.mjs';

const enc = new TextEncoder();
/** Hamis streaming válasz: darabok, darabonkénti késleltetéssel; `hang` = utána nem jön több adat (a kapcsolat nyitva marad). */
function sse(chunks, { delayMs = 0, hang = false } = {}) {
  const body = new ReadableStream({
    async start(ctrl) {
      for (const c of chunks) { if (delayMs) await new Promise((r) => setTimeout(r, delayMs)); ctrl.enqueue(enc.encode(c)); }
      if (!hang) ctrl.close();
    },
  });
  return async (_url, init) => {
    // a futtató maga bontja az olvasót; a zárolt stream cancel()-je elutasít — ezt elnyeljük
    init.signal?.addEventListener('abort', () => { body.cancel().catch(() => {}); });
    return { ok: true, status: 200, body, text: async () => '' };
  };
}
const ev = (o) => `data: ${JSON.stringify(o)}\n\n`;

test('stream: a darabokból összeáll a válasz (szöveg, eszközhívás részletekben, használat, szolgáltató); az életjel-megjegyzés nem zavar', async () => {
  const f = sse([': OPENROUTER PROCESSING\n\n',
    ev({ id: 'gen-1', model: 'openai/gpt-6.2-sol', provider: 'OpenAI', choices: [{ delta: { content: 'Vizsgálom' } }] }),
    ev({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'c1', function: { name: 'read_', arguments: '{"pa' } }] } }] }),
    ev({ choices: [{ delta: { tool_calls: [{ index: 0, function: { name: 'file', arguments: 'th":"a.ts"}' } }] }, finish_reason: 'tool_calls' }] }),
    ev({ usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0.001, completion_tokens_details: { reasoning_tokens: 3 } }, choices: [] }),
    'data: [DONE]\n\n']);
  const r = await callOpenRouterStream({ fetchImpl: f, endpoint: 'x', key: 'k-123456', body: {}, idleMs: 1000 });
  assert.equal(r.provider, 'OpenAI');
  assert.equal(r.choices[0].finish_reason, 'tool_calls');
  assert.deepEqual(r.choices[0].message.tool_calls, [{ id: 'c1', type: 'function', function: { name: 'read_file', arguments: '{"path":"a.ts"}' } }]);
  assert.equal(r.usage.completion_tokens_details.reasoning_tokens, 3);
});

test('stream: csendben álló kapcsolat (életjel nélkül) → megszakítás, újrapróbálható hiba; finish_reason nélküli vég → csonka, újrapróbálható', async () => {
  const hang = sse([ev({ choices: [{ delta: { content: 'félig' } }] })], { hang: true });
  await assert.rejects(callOpenRouterStream({ fetchImpl: hang, endpoint: 'x', key: 'k-123456', body: {}, idleMs: 80 }), (e) => e.retryable === true && /csendben áll/.test(e.message));
  const cut = sse([ev({ choices: [{ delta: { content: 'félig' } }] }), 'data: [DONE]\n\n']);
  await assert.rejects(callOpenRouterStream({ fetchImpl: cut, endpoint: 'x', key: 'k-123456', body: {}, idleMs: 1000 }), (e) => e.retryable === true && /finish_reason nélkül/.test(e.message));
});

test('stream: a lassan, de folyamatosan érkező válasz NEM szakad meg (a csend-óra minden darabnál újraindul)', async () => {
  const chunks = [...Array.from({ length: 6 }, (_, i) => ev({ choices: [{ delta: { content: `rész${i} ` } }] })), ev({ choices: [{ delta: {}, finish_reason: 'stop' }] }), 'data: [DONE]\n\n'];
  const slow = sse(chunks, { delayMs: 40 });
  const r = await callOpenRouterStream({ fetchImpl: slow, endpoint: 'x', key: 'k-123456', body: {}, idleMs: 100 });
  assert.equal(r.choices[0].finish_reason, 'stop', 'a teljes idő (~320 ms) több a csend-korlátnál (100 ms), de a darabok között soha nincs 100 ms csend');
  assert.match(r.choices[0].message.content, /rész5/);
});

test('stream a futtatóban: a csendben álló hívás után ugyanazokkal az üzenetekkel újrapróbál, és a folytatás elfogadott jelentést ad', async () => {
  let n = 0;
  const bodies = [];
  const fetchImpl = async (url, init) => {
    n += 1;
    bodies.push(JSON.parse(init.body));
    if (n === 1) return sse([ev({ choices: [{ delta: { content: 'gondolkodom' } }] })], { hang: true })(url, init);
    return sse([ev({ id: 'gen-2', model: CFG.model, provider: 'OpenAI', choices: [{ delta: { tool_calls: [{ index: 0, id: 'c', function: { name: 'submit_report', arguments: JSON.stringify({ report: 'x', findings: [] }) } }] }, finish_reason: 'tool_calls' }] }),
      ev({ usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0.001 }, choices: [] }), 'data: [DONE]\n\n'])(url, init);
  };
  const box = { report: null };
  const tools = { counts: {}, notRun: [], call: async () => { box.report = REPORT('f'.repeat(40)); return 'ELFOGADVA'; } };
  const cfg = { ...CFG, stream: true, streamIdleSec: 0.08 };
  const r = await runReview({ cfg, key: 'k-0000', system: 'S', user: 'U', tools, box, budget: createBudget({ maxUsd: 2, maxRounds: 9, maxWallMs: 1e9, maxCompletionTokens: 1e9, cfg }), fetchImpl, sleep: async () => {} });
  assert.equal(r.complete, true);
  assert.equal(n, 2, 'egy újrapróba');
  assert.equal(bodies[0].stream, true);
  assert.equal(JSON.stringify(bodies[1].messages), JSON.stringify(bodies[0].messages), 'ugyanaz a beszélgetés');
});

test('szívverés: halad / beragadt / nem él / befejeződött — API-hívás nélkül', () => {
  const now = Date.parse('2026-11-20T10:00:00Z');
  const hb = (at, extra = {}) => ({ pid: 1234, at: new Date(at).toISOString(), phase: 'tool', ...extra });
  assert.equal(judgeHeartbeat(hb(now - 30_000), { nowMs: now, isAlive: () => true }).state, 'halad');
  assert.equal(judgeHeartbeat(hb(now - 20 * 60_000), { nowMs: now, isAlive: () => true, staleMs: 10 * 60_000 }).code, 2);
  assert.equal(judgeHeartbeat(hb(now - 30_000), { nowMs: now, isAlive: () => false }).code, 3);
  assert.equal(judgeHeartbeat(hb(now, { phase: 'done' }), { nowMs: now, isAlive: () => false }).code, 4);
});

test('Codex: munkamenet-azonosító (JSON és szöveges napló), „tokens used” a következő sorban szóközös tagolással, hálózati hurok', () => {
  assert.equal(sessionIdFrom('{"type":"thread.started","thread_id":"0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b"}'), '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b');
  assert.equal(sessionIdFrom('workdir: x\nsession id: 0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5c\n'), '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5c');
  assert.equal(tokensUsed('…\ntokens used\n380 573\n'), 380573, 'eddig 0-nak olvasta');
  assert.equal(tokensUsed('tokens used: 12,345'), 12345);
  assert.equal(tokensUsed('semmi'), null);
  assert.equal(networkStall('stream error: Reconnecting... 5/5'), true);
  assert.equal(networkStall('minden rendben'), false);
});

test('Codex-burok: beragadt (élő, de nem haladó) futás → technikai folytatás ugyanabban a munkamenetben; általános módban a teljes válasz elfogadva', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'codex-or-'));
  const out = join(dir, 'valasz.md');
  const calls = [];
  const ok = 'Kész az összes elem, a fájl megírva.\nTELJESSÉG: 12 / 12 — HIÁNYZÓ: nincs';
  const exec = async (file, args, opts) => {
    calls.push({ args, input: opts.input });
    if (calls.length === 1) { writeFileSync(out, 'félig…'); return { code: 124, stdout: 'session id: 0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5d\n', stderr: '', stalled: true }; }
    if (calls.length === 2) { writeFileSync(out, 'Ha szeretnéd, folytatom a maradék 4 elemmel.\nTELJESSÉG: 8 / 12 — HIÁNYZÓ: 4 elem'); return { code: 0, stdout: '', stderr: '' }; }
    writeFileSync(out, ok);
    return { code: 0, stdout: 'tokens used\n1 024\n', stderr: '' };
  };
  try {
    const r = await runCodexComplete({ exec, prompt: 'p', out, mode: 'generic' });
    assert.equal(r.ok, true);
    assert.equal(r.netRetries, 1, 'a beragadás technikai újrapróba');
    assert.equal(r.resumes, 1, 'a felajánló / félbehagyott válasz teljesítési folytatás');
    assert.deepEqual(calls[1].args.slice(0, 4), ['exec', 'resume', '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5d', '-']);
    assert.match(calls[1].input, /technikai okból/);
    assert.match(calls[2].input, /megállási \/ felajánló fordulat|maradt feldolgozatlan/);
    assert.equal(r.tokens, 1024);
    assert.equal(checkCompleteness(ok, { mode: 'generic' }).ok, true);
    assert.equal(checkCompleteness('Mit tegyek most?', { mode: 'generic' }).ok, false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('watchedExec: élő, de semmit nem író folyamatot a csend-korlát után leállít (díjmentes: csak a kimenet mérete)', async () => {
  const r = await watchedExec(process.execPath, ['-e', 'setTimeout(()=>{}, 60000)'], { stallMs: 300, pollMs: 100 });
  assert.equal(r.stalled, true);
  assert.equal(r.code, 124);
  const alive = await watchedExec(process.execPath, ['-e', 'let i=0;const t=setInterval(()=>{process.stdout.write("."); if(++i>5){clearInterval(t)}},60)'], { stallMs: 400, pollMs: 100 });
  assert.equal(alive.stalled, false, 'a haladó folyamatot nem állítja le');
});
