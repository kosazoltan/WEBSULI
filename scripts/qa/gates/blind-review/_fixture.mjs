// Tesztsegéd a vak ellenőr tesztjeihez: valódi, eldobható git-tár mint „munkafa”. Nem teszt, nem éles kód.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

export const CFG = Object.freeze({
  model: 'teszt/modell', endpoint: 'https://openrouter.invalid/api/v1/chat/completions', mode: 'required', requiredFrom: '2026-11-19T00:00:00+01:00',
  minToolCalls: 5, maxUsdDefault: 2, maxUsdHardCap: 6, maxRounds: 60, maxRoundsHardCap: 150, maxWallMinutes: 25, maxWallMinutesHardCap: 60,
  maxTokensPerCall: 16000, maxCompletionTokensTotal: 200000, maxRetries: 2, toolOutputMaxChars: 12000, reportMaxChars: 40000, commandTimeoutSec: 60,
  promptCache: { mode: 'explicit', ttlSec: 300 }, fallbackPriceUsdPerMTok: { input: 1, output: 4, cacheRead: 0.1, cacheWrite: 1.25 },
  npmScripts: ['check'], allowPlaywright: false,
});

const git = (cwd, args) => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
};

/**
 * Eldobható git-tár két committal (base → head). `files`: a fej követett fájljai; `baseFiles`: a base állapota.
 * @returns {{ root: string, base: string, head: string, dir: string, cleanup: () => void }}
 */
export function makeRepo({ baseFiles = { 'README.md': 'alap\n' }, files = {} } = {}) {
  const dir = realpathSync.native(mkdtempSync(join(tmpdir(), 'blind-fixture-')));
  const root = join(dir, 'wt');
  mkdirSync(root);
  const write = (set) => { for (const [f, text] of Object.entries(set)) { mkdirSync(dirname(join(root, f)), { recursive: true }); writeFileSync(join(root, f), text); } };
  git(root, ['init', '-q']);
  const c = ['-c', 'user.name=teszt', '-c', 'user.email=teszt@example.com', '-c', 'core.autocrlf=false', '-c', 'commit.gpgsign=false'];
  write(baseFiles);
  git(root, ['add', '-A']);
  git(root, [...c, 'commit', '-q', '-m', 'base']);
  const base = git(root, ['rev-parse', 'HEAD']);
  write(files);
  git(root, ['add', '-A']);
  git(root, [...c, 'commit', '-q', '--allow-empty', '-m', 'head']);
  const head = git(root, ['rev-parse', 'HEAD']);
  return { root, base, head, dir, cleanup: () => rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }) };
}

/** Hamis OpenRouter: a megadott válasz-sorozatot adja vissza, és rögzíti a kérések törzsét. */
export function fakeOpenRouter(steps) {
  const bodies = [];
  let i = 0;
  const fetchImpl = async (_url, init) => {
    bodies.push(JSON.parse(init.body));
    const step = steps[Math.min(i, steps.length - 1)];
    i += 1;
    const s = typeof step === 'function' ? step(bodies.length) : step;
    if (s.throw) throw new Error(s.throw);
    return { ok: (s.status ?? 200) < 300, status: s.status ?? 200, text: async () => JSON.stringify(s.body) };
  };
  return { fetchImpl, bodies };
}

export const usage = (prompt, completion, { cached = 0, write = 0, cost } = {}) => ({
  prompt_tokens: prompt, completion_tokens: completion, ...(cost === undefined ? {} : { cost }), prompt_tokens_details: { cached_tokens: cached, cache_write_tokens: write },
});

let seq = 0;
/** Egy asszisztens-válasz eszközhívásokkal (`calls`: [név, argumentum-objektum | nyers szöveg]). */
export function reply({ calls = [], content = '', model = 'teszt/modell', use = usage(1000, 100, { cost: 0.01 }) } = {}) {
  seq += 1;
  return {
    body: {
      id: `gen-${seq}`, model, usage: use,
      choices: [{ message: { role: 'assistant', content, ...(calls.length ? { tool_calls: calls.map(([name, args], n) => ({ id: `call-${seq}-${n}`, type: 'function', function: { name, arguments: typeof args === 'string' ? args : JSON.stringify(args) } })) } : {}) } }],
    },
  };
}

export const REPORT = (head, verdict = 'IGEN') => `# Független review — próba\nFej: ${head}\n## Ítélet: ${verdict}\n## Leletek\nL1 — lásd lent.\n## Mit próbáltam megtörni, és nem sikerült\n- semmi\n## Mit NEM vizsgáltam\n- böngésző\n`;
