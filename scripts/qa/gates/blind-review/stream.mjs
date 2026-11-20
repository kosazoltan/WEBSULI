// OpenRouter streaming hívás díjmentes életjel-felügyelettel (docs/specs/2026-11-20-gpt-teljesitesi-or.md, kiegészítés).
// A GPT 6.2 jelzés nélkül is megállhat: a kapcsolat él, de nem jön adat. A stream minden darabja (a szolgáltató „: OPENROUTER
// PROCESSING” életjele is) újraindítja a csend-órát; ha `idleMs` ideig semmi nem jön, a hívás megszakad, és a futtató ugyanazokkal az
// üzenetekkel (ugyanabban a beszélgetésben) újrapróbál. A felügyelet maga nem hív API-t. A `finish_reason` nélkül véget érő stream
// csonka — szintén újrapróbálható hiba.

import { OpenRouterError, maskSecrets } from './openrouter.mjs';

/** Az SSE-darabokból összerakott válasz (ugyanaz az alak, mint a nem-streaming válaszé). */
export function assembleStream(events) {
  const msg = { role: 'assistant', content: '' };
  const tools = [];
  let finish = null;
  let usage = null;
  let model = null;
  let provider = null;
  let id = null;
  let reasoning = null;
  for (const ev of events) {
    if (ev.error) throw new OpenRouterError(`OpenRouter hiba a streamben: ${JSON.stringify(ev.error).slice(0, 300)}`, { status: Number(ev.error.code) || 0, retryable: true });
    model = ev.model ?? model;
    provider = ev.provider ?? provider;
    id = ev.id ?? id;
    if (ev.usage) usage = ev.usage;
    const ch = ev.choices?.[0];
    if (!ch) continue;
    const d = ch.delta ?? {};
    if (typeof d.content === 'string') msg.content += d.content;
    if (Array.isArray(d.reasoning_details)) reasoning = [...(reasoning ?? []), ...d.reasoning_details];
    for (const t of d.tool_calls ?? []) {
      const i = Number.isInteger(t.index) ? t.index : tools.length;
      tools[i] ??= { id: t.id ?? `call-${i}`, type: 'function', function: { name: '', arguments: '' } };
      if (t.id) tools[i].id = t.id;
      if (t.function?.name) tools[i].function.name += t.function.name;
      if (t.function?.arguments) tools[i].function.arguments += t.function.arguments;
    }
    if (ch.finish_reason) finish = ch.finish_reason;
  }
  if (tools.length) msg.tool_calls = tools.filter(Boolean);
  if (reasoning) msg.reasoning_details = reasoning;
  return { id, model, provider, usage, choices: [{ message: msg, finish_reason: finish }] };
}

/**
 * @param {{ fetchImpl?: Function, endpoint: string, key: string, body: object, idleMs?: number, timeoutMs?: number }} o
 */
export async function callOpenRouterStream({ fetchImpl = globalThis.fetch, endpoint, key, body, idleMs = 120_000, timeoutMs = 900_000 }) {
  const ctrl = new AbortController();
  let why = null;
  let reader = null;
  // A megszakítás az olvasót is leállítja (egy függő read() különben soha nem tér vissza).
  const stop = (reason) => { why = reason; ctrl.abort(); reader?.cancel(reason).catch(() => {}); };
  const total = setTimeout(() => stop(`a hívás teljes időkorlátja (${Math.round(timeoutMs / 1000)} s)`), timeoutMs);
  let idle = null;
  const kick = () => { clearTimeout(idle); idle = setTimeout(() => stop(`a stream ${Math.round(idleMs / 1000)} s óta csendben áll (életjel nélkül)`), idleMs); };
  try {
    let res;
    try {
      res = await fetchImpl(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, stream: true }), signal: ctrl.signal });
    } catch (e) {
      throw new OpenRouterError(`OpenRouter hálózati hiba: ${why ?? maskSecrets(String(e?.message ?? e), key).slice(0, 300)}`, { retryable: true });
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new OpenRouterError(`OpenRouter HTTP ${res.status}: ${maskSecrets(text, key).slice(0, 500)}`, { status: res.status, retryable: res.status === 429 || res.status >= 500 });
    }
    reader = res.body.getReader();
    const dec = new TextDecoder();
    const events = [];
    let buf = '';
    let done = false;
    kick();
    try {
      while (!done) {
        const { value, done: end } = await reader.read();
        if (end) break;
        kick(); // minden darab (az életjel-megjegyzés is) élő kapcsolatot jelez
        buf += dec.decode(value, { stream: true });
        let cut;
        while ((cut = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, cut).trim();
          buf = buf.slice(cut + 1);
          if (!line.startsWith('data:')) continue; // „: OPENROUTER PROCESSING” életjel vagy üres sor
          const data = line.slice(5).trim();
          if (data === '[DONE]') { done = true; break; }
          try { events.push(JSON.parse(data)); } catch { /* töredékes sor: a következő darabbal együtt érkezik */ }
        }
      }
    } catch (e) {
      throw new OpenRouterError(`OpenRouter stream megszakadt: ${why ?? maskSecrets(String(e?.message ?? e), key).slice(0, 300)}`, { retryable: true });
    }
    if (why) throw new OpenRouterError(`OpenRouter stream megszakítva: ${why}`, { retryable: true });
    const json = assembleStream(events);
    if (!json.choices[0].finish_reason) throw new OpenRouterError('OpenRouter: a stream finish_reason nélkül ért véget (csonka válasz) — újrapróba ugyanabban a beszélgetésben', { retryable: true });
    return json;
  } finally {
    clearTimeout(total);
    clearTimeout(idle);
  }
}
