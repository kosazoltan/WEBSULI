// K-PR (főterv H3; SQL #24 / #272): PR-leírás vázlat a kötelező szakaszokkal, a helyi kapu-bizonyítékokból kitöltve.
// Amit gép nem tudhat (az elfogadási feltételek, a „nem futtatott” indoka), az KITÖLTENDŐ jelölést kap, jelölőnégyzet NÉLKÜL — így a
// PR előtti kapu (`checkPrBody`) addig bukik, amíg az ember / ügynök ki nem tölti. Valós eredményt csak bizonyítékból ír, sosem kitalál.
//
// Használat: node scripts/qa/gates/pr-body.mjs [--base origin/main] [--head HEAD] [--ki <pr-leiras.md>]
import { writeFileSync } from 'node:fs';
import { argValue, isMain, makeContext, readEvidence } from './lib.mjs';

export const TODO = '<!-- KITÖLTENDŐ -->';

const stepsWith = (ev, status) => (ev?.steps ?? []).filter((s) => s.status === status).map((s) => s.name);

/** A gate-bizonyíték egy sora: ZÖLD / BUKOTT a fejen, a WARN / FAIL lépések nevével. Bizonyíték nélkül: nem futott. */
export function gateLine(label, ev, head) {
  const h = head.slice(0, 12);
  if (!ev || ev.head !== head) return `- \`${label}\` — NEM FUTOTT a \`${h}\` fejen (nincs bizonyíték) ${TODO}`;
  const warn = stepsWith(ev, 'WARN');
  const fail = stepsWith(ev, 'FAIL');
  return `- \`${label}\` — ${ev.ok ? 'ZÖLD' : 'BUKOTT'} a \`${h}\` fejen${fail.length ? `; FAIL: ${fail.join('; ')}` : ''}${warn.length ? `; WARN: ${warn.join('; ')}` : ''}.`;
}

/**
 * A leírás összeállítása tiszta adatokból (tesztelhető). `commits`: a saját commitok tárgysorai (összefésülők nélkül), `stat`: a
 * `git diff --shortstat` sora, bizonyítékok: `prePush`, `prePr`, `review` (a `review-<fej>.json`).
 */
export function buildPrBody({ head, base, commits = [], stat = '', prePush = null, prePr = null, review = null }) {
  const h = head.slice(0, 12);
  const verdict = review && review.head === head ? review.verdict : null;
  const lines = [
    '## Összefoglaló',
    `${TODO} — mi és miért (terv / SQL-tétel / PR-szál hivatkozással).`,
    '',
    ...(commits.length ? ['Commitok:', ...commits.map((c) => `- ${c}`)] : ['Commitok: nincs saját commit a bázishoz képest.']),
    '',
    `Méret (${base}...${h}): ${stat.trim() || 'nincs változás'}`,
    '',
    '## Elfogadás',
    `${TODO} — EARS-tételek jelölőnégyzettel (\`- [x] E1 WHEN … THEN … SHALL … (teszt neve)\`), csak teszttel igazolt tétel kap pipát.`,
    '',
    '## Tesztek (RED → GREEN)',
    `${TODO} — a javítás előtti valós bukás és az utána mért eredmény.`,
    '',
    '## Futtatott ellenőrzések',
    gateLine('npm run gate:push', prePush, head),
    ...(prePr ? [gateLine('npm run gate:pr', prePr, head)] : []),
    verdict
      ? `- helyi ellenőr (\`local-review.mjs\`): ${verdict} a \`${h}\` fejen — a high / medium leletek kódbeli igazolása / cáfolata: ${TODO}`
      : `- helyi ellenőr: NEM FUTOTT a \`${h}\` fejen — futtasd: \`node scripts/qa/gates/local-review.mjs --base ${base} --head HEAD\` ${TODO}`,
    '',
    ...(verdict ? [`Független ellenőr ítélete: ${verdict} (fej: ${h})`, ''] : []),
    '## Nem futtatott',
    `${TODO} — mit nem futtattál, miért, és mi a kockázat (vagy „nincs”).`,
    '',
    '## Agent-PR ellenőrzőlista',
    `${TODO} — pipáld: [ ] CI-integritás · [ ] Duplikáció · [ ] Kritikus útvonal · [ ] Security boundary · [ ] Tesztbizonyíték · [ ] Hatókör`,
    '',
  ];
  return lines.join('\n');
}

function main() {
  const args = process.argv.slice(2);
  const ctx = makeContext({ base: argValue(args, '--base') });
  const run = (a) => { const r = ctx.exec('git', a, { cwd: ctx.root }); if (r.code !== 0) throw new Error(`git ${a.join(' ')}: ${r.stderr.trim()}`); return r.stdout; };
  const head = run(['rev-parse', argValue(args, '--head') ?? 'HEAD']).trim();
  const commits = run(['log', '--no-merges', '--format=%s', `${ctx.base}..${head}`]).split('\n').map((s) => s.trim()).filter(Boolean).reverse();
  const stat = run(['diff', '--shortstat', `${ctx.base}...${head}`]);
  const body = buildPrBody({
    head, base: ctx.base, commits, stat,
    prePush: readEvidence(ctx.evDir, `pre-push-${head}`), prePr: readEvidence(ctx.evDir, `pre-pr-${head}`), review: readEvidence(ctx.evDir, `review-${head}`),
  });
  const out = argValue(args, '--ki');
  if (out) { writeFileSync(out, body); process.stdout.write(`[pr-body] vázlat: ${out} (a ${TODO} helyeket töltsd ki)\n`); } else process.stdout.write(body);
}

if (isMain(import.meta.url)) main();
