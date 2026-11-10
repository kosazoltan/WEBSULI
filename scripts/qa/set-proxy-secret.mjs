#!/usr/bin/env node
// Spec 2026-11-10-korlat-kliens-ip (T4): a Vercel → Render megosztott titok (WEBSULI_PROXY_SECRET) létrehozása.
//
// Új, véletlen értéket generál, és beírja a Render szolgáltatás és a Vercel projekt (production + preview) környezetébe.
// Az érték SEHOL nem jelenik meg: a kimenet csak HTTP-státuszokat tartalmaz. Meglévő változót nem ír felül (csere:
// docs/specs/2026-11-10-korlat-kliens-ip.md, „Titokcsere”) — kivéve `--rotate` kapcsolóval: a Renderen az új érték az ÖSSZES
// korábban elfogadott érték elé kerül (review #411: részleges átállásnál a Vercel még a régit küldheti). A régiek törlése
// külön lépés, az átállás igazolása után: `--prune` (a Renderen csak a legújabb érték marad).
//
// Használat (a tulajdonos futtatja; kell hozzá RENDER_API_KEY és VERCEL_TOKEN):
//   node scripts/qa/set-proxy-secret.mjs
// Utána: Render-újratelepítés (a változó a következő telepítéskor él) és Vercel-újratelepítés.
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { RENDER_SERVICE_ID } from './verify-render-settings.mjs';

export const SECRET_KEY = 'WEBSULI_PROXY_SECRET';
export const VERCEL_PROJECT_ID = 'prj_dysEs2awmtu0qsj5pYrS3J7zz4DH';
export const VERCEL_TEAM_ID = 'team_QqHVwZvIe4pimDrztnwB7O1n';

const json = (token, body, method) => ({
  method,
  headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', accept: 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
  signal: AbortSignal.timeout(20_000),
});

/** A végrehajtandó lépések a meglévő állapotból — tiszta, tesztelhető döntés. */
export function planSecretWrite({ renderHas, vercelHas, rotate }) {
  if (!renderHas && !vercelHas) return 'create';
  if (rotate) return 'rotate';
  return 'refuse';
}

/** Csere: az új érték elöl, utána minden korábban elfogadott (review #411) — ismétlődés és üres elem nélkül. */
export function rotatedRenderValue(current, secret) {
  const previous = String(current ?? '').split(',').map((value) => value.trim()).filter(Boolean);
  return [...new Set([secret, ...previous])].join(',');
}

/** Lezárás: csak a legújabb (első) érték marad; ha nincs mit törölni, null. */
export function prunedRenderValue(current) {
  const values = String(current ?? '').split(',').map((value) => value.trim()).filter(Boolean);
  return values.length > 1 ? values[0] : null;
}

async function main() {
  const renderKey = process.env.RENDER_API_KEY;
  const vercelToken = process.env.VERCEL_TOKEN;
  if (!renderKey || !vercelToken) {
    console.error('[proxy-titok] Kell a RENDER_API_KEY és a VERCEL_TOKEN környezeti változó.');
    process.exit(2);
  }
  const rotate = process.argv.includes('--rotate');
  const prune = process.argv.includes('--prune');
  const renderUrl = `https://api.render.com/v1/services/${RENDER_SERVICE_ID}/env-vars/${SECRET_KEY}`;
  const vercelUrl = `https://api.vercel.com/v10/projects/${VERCEL_PROJECT_ID}/env?teamId=${VERCEL_TEAM_ID}`;

  const renderCurrent = await fetch(renderUrl, json(renderKey, undefined, 'GET'));
  const vercelList = await fetch(vercelUrl.replace('/v10/', '/v9/'), json(vercelToken, undefined, 'GET'));
  if (renderCurrent.status !== 200 && renderCurrent.status !== 404) throw new Error(`Render lekérdezés: HTTP ${renderCurrent.status}`);
  if (!vercelList.ok) throw new Error(`Vercel lekérdezés: HTTP ${vercelList.status}`);
  const renderHas = renderCurrent.status === 200;
  const vercelHas = ((await vercelList.json()).envs ?? []).some((env) => env.key === SECRET_KEY);

  const renderCurrentValue = renderHas ? await renderCurrent.json().then((body) => String(body.value ?? body.envVar?.value ?? '')) : '';
  if (prune) {
    const kept = prunedRenderValue(renderCurrentValue);
    if (kept === null) {
      console.log('[proxy-titok] Nincs törölhető régi érték a Renderen.');
      return;
    }
    const prunePut = await fetch(renderUrl, json(renderKey, { value: kept }, 'PUT'));
    console.log(`[proxy-titok] Render PUT ${SECRET_KEY} (régi értékek törlése): HTTP ${prunePut.status}`);
    process.exit(prunePut.ok ? 0 : 1);
  }
  const plan = planSecretWrite({ renderHas, vercelHas, rotate });
  if (plan === 'refuse') {
    console.error(`[proxy-titok] A változó már létezik (Render: ${renderHas}, Vercel: ${vercelHas}). Cseréhez: --rotate.`);
    process.exit(1);
  }
  const secret = randomBytes(32).toString('hex');
  // Csere alatt a Render a régi és az új értékeket is elfogadja (vesszővel tagolva); a régiek az átállás után: --prune.
  const renderValue = plan === 'rotate' ? rotatedRenderValue(renderCurrentValue, secret) : secret;

  const renderPut = await fetch(renderUrl, json(renderKey, { value: renderValue }, 'PUT'));
  console.log(`[proxy-titok] Render PUT ${SECRET_KEY}: HTTP ${renderPut.status}`);
  if (!renderPut.ok) process.exit(1);
  const vercelPost = await fetch(`${vercelUrl}&upsert=true`, json(vercelToken, { key: SECRET_KEY, value: secret, type: 'sensitive', target: ['production', 'preview'] }, 'POST'));
  console.log(`[proxy-titok] Vercel POST ${SECRET_KEY} (production + preview): HTTP ${vercelPost.status}`);
  if (!vercelPost.ok) process.exit(1);
  console.log('[proxy-titok] Kész. Következik: Render-újratelepítés, majd Vercel-újratelepítés (a változó telepítéskor lép életbe).');
  if (plan === 'rotate') console.log('[proxy-titok] Az élő próba (spec A6) után: node scripts/qa/set-proxy-secret.mjs --prune');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(`[proxy-titok] Hiba: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(2);
  });
}
