// A vak ellenőr OpenRouter-kliense (docs/specs/2026-11-18-vak-ellenor-deepseek.md, D2). Függőség nélküli Node ESM (beépített fetch).
// A kulcs CSAK környezeti változóból (vagy egy NEM követett helyi beállítás által mutatott .env fájlból) jön, és semmilyen
// kimenetbe nem kerül: minden szöveg, amely innen kimegy, átmegy a maskSecrets()-en.

import { existsSync, readFileSync } from 'node:fs';
import { redact } from '../lib.mjs';

export const KEY_NAME = 'OPENROUTER_API_KEY';
export const SECRETS_ENV_VAR = 'WEBSULI_SECRETS_ENV';
export const LOCAL_CONFIG_NAME = 'websuli-qa-local.json';

/** Egy .env szövegből CSAK az OPENROUTER_API_KEY sor értéke (más sort nem olvas ki). */
export function keyFromEnvText(text) {
  for (const l of String(text ?? '').split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?OPENROUTER_API_KEY\s*=\s*(.*?)\s*$/.exec(l);
    if (m) return m[1].replace(/^["']|["']$/g, '') || null;
  }
  return null;
}

/**
 * A kulcs betöltése. Sorrend: OPENROUTER_API_KEY → WEBSULI_SECRETS_ENV (.env útvonal) → <git-common-dir>/websuli-qa-local.json
 * (`{"secretsEnv": "<útvonal>"}`). A visszaadott `source` csak a forrás FAJTÁJA (útvonalat nem ír ki: gépfüggő, személyes adat).
 * @returns {{ key: string, source: string } | { key: null, error: string }}
 */
export function loadApiKey({ env = process.env, readFile = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : null), localConfigPath = null } = {}) {
  const direct = String(env[KEY_NAME] ?? '').trim();
  if (direct) return { key: direct, source: `${KEY_NAME} környezeti változó` };
  const candidates = [];
  if (env[SECRETS_ENV_VAR]) candidates.push({ path: env[SECRETS_ENV_VAR], source: `${SECRETS_ENV_VAR} által mutatott .env` });
  if (localConfigPath) {
    const raw = readFile(localConfigPath);
    if (raw) {
      try {
        const p = JSON.parse(raw).secretsEnv;
        if (typeof p === 'string' && p) candidates.push({ path: p, source: `${LOCAL_CONFIG_NAME} által mutatott .env` });
      } catch { return { key: null, error: `a ${LOCAL_CONFIG_NAME} nem érvényes JSON` }; }
    }
  }
  for (const c of candidates) {
    const key = keyFromEnvText(readFile(c.path));
    if (key) return { key, source: c.source };
  }
  return {
    key: null,
    error: `nincs OpenRouter-kulcs: állítsd be az ${KEY_NAME} környezeti változót, vagy a ${SECRETS_ENV_VAR} változóval / a `
      + `<git-common-dir>/${LOCAL_CONFIG_NAME} fájllal ({"secretsEnv": "<.env útvonala>"}) mutass egy .env fájlra (docs/minosegkapuk.md)`,
  };
}

/** A kulcs pontos értéke, az Authorization / Bearer / sk-or minták és a közös redact() — minden kimenet ezen megy át. */
export function maskSecrets(text, key) {
  let out = String(text ?? '');
  if (key && key.length >= 4) out = out.split(key).join('<kulcs>');
  out = out
    .replace(/\bAuthorization\b\s*["']?\s*[:=]\s*["']?[^\r\n"']*/gi, 'Authorization: <maszkolva>')
    .replace(/\bsk-or-[A-Za-z0-9_-]{8,}/g, '<kulcs>');
  return redact(out);
}

/** A hívás költsége: a válasz tényleges `usage.cost` mezője; ha nincs, a tokenszámokból a tartalék-árakkal (USD / millió token). */
export function usageCost(usage, fallback = {}) {
  if (!usage || typeof usage !== 'object') return null;
  if (typeof usage.cost === 'number' && Number.isFinite(usage.cost) && usage.cost >= 0) return { usd: usage.cost, source: 'usage.cost' };
  const p = Number(usage.prompt_tokens);
  const c = Number(usage.completion_tokens);
  if (!Number.isFinite(p) || !Number.isFinite(c)) return null;
  return { usd: (p * Number(fallback.input ?? 0) + c * Number(fallback.output ?? 0)) / 1e6, source: 'usage tokenek × tartalék-ár' };
}

export class OpenRouterError extends Error {
  constructor(message, { status = 0, retryable = false } = {}) {
    super(message);
    this.name = 'OpenRouterError';
    this.status = status;
    this.retryable = retryable;
  }
}

/**
 * Egy chat-completions hívás. Siker: a válasz JSON-ja. Hiba: OpenRouterError maszkolt, csonkolt üzenettel (a kérés fejlécei és a
 * kulcs soha nem kerülnek az üzenetbe; az eredeti kivételt NEM láncoljuk tovább, mert az a kérést is hordozhatja).
 */
export async function callOpenRouter({ fetchImpl = globalThis.fetch, endpoint, key, body, timeoutMs = 180_000 }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  let text;
  try {
    res = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    text = await res.text();
  } catch (e) {
    const why = e?.name === 'AbortError' ? `időtúllépés (${Math.round(timeoutMs / 1000)} s)` : maskSecrets(String(e?.message ?? e), key).slice(0, 300);
    throw new OpenRouterError(`OpenRouter hálózati hiba: ${why}`, { retryable: true });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    throw new OpenRouterError(`OpenRouter HTTP ${res.status}: ${maskSecrets(text, key).slice(0, 500)}`, {
      status: res.status, retryable: res.status === 429 || res.status >= 500,
    });
  }
  let json;
  try { json = JSON.parse(text); } catch {
    throw new OpenRouterError(`OpenRouter: a válasz nem JSON: ${maskSecrets(text, key).slice(0, 200)}`, { status: res.status, retryable: true });
  }
  if (json.error) {
    const code = Number(json.error.code) || res.status;
    throw new OpenRouterError(`OpenRouter hiba (${code}): ${maskSecrets(JSON.stringify(json.error), key).slice(0, 500)}`, {
      status: code, retryable: code === 429 || code >= 500,
    });
  }
  return json;
}
