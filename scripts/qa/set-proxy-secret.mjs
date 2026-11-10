#!/usr/bin/env node
// Spec 2026-11-10-korlat-kliens-ip (T4): a Vercel → Render megosztott titok (WEBSULI_PROXY_SECRET) létrehozása.
//
// Új, véletlen értéket generál, és beírja a Render szolgáltatás és a Vercel projekt (production + preview) környezetébe.
// Az érték SEHOL nem jelenik meg: a kimenet csak HTTP-státuszokat tartalmaz. Meglévő változót nem ír felül (csere:
// docs/specs/2026-11-10-korlat-kliens-ip.md, „Titokcsere”) — kivéve `--rotate` kapcsolóval, ami a Renderen a régi + új
// értéket együtt hagyja érvényben, hogy a csere alatt ne legyen kiesés.
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

async function main() {
  const renderKey = process.env.RENDER_API_KEY;
  const vercelToken = process.env.VERCEL_TOKEN;
  if (!renderKey || !vercelToken) {
    console.error('[proxy-titok] Kell a RENDER_API_KEY és a VERCEL_TOKEN környezeti változó.');
    process.exit(2);
  }
  const rotate = process.argv.includes('--rotate');
  const renderUrl = `https://api.render.com/v1/services/${RENDER_SERVICE_ID}/env-vars/${SECRET_KEY}`;
  const vercelUrl = `https://api.vercel.com/v10/projects/${VERCEL_PROJECT_ID}/env?teamId=${VERCEL_TEAM_ID}`;

  const renderCurrent = await fetch(renderUrl, json(renderKey, undefined, 'GET'));
  const vercelList = await fetch(vercelUrl.replace('/v10/', '/v9/'), json(vercelToken, undefined, 'GET'));
  if (renderCurrent.status !== 200 && renderCurrent.status !== 404) throw new Error(`Render lekérdezés: HTTP ${renderCurrent.status}`);
  if (!vercelList.ok) throw new Error(`Vercel lekérdezés: HTTP ${vercelList.status}`);
  const renderHas = renderCurrent.status === 200;
  const vercelHas = ((await vercelList.json()).envs ?? []).some((env) => env.key === SECRET_KEY);

  const plan = planSecretWrite({ renderHas, vercelHas, rotate });
  if (plan === 'refuse') {
    console.error(`[proxy-titok] A változó már létezik (Render: ${renderHas}, Vercel: ${vercelHas}). Cseréhez: --rotate.`);
    process.exit(1);
  }
  const secret = randomBytes(32).toString('hex');
  // Csere alatt a Render a régi és az új értéket is elfogadja (vesszővel tagolva); a régit a Vercel-telepítés után kell kivenni.
  let previous = '';
  if (plan === 'rotate' && renderHas) {
    const current = await renderCurrent.json();
    previous = String(current.value ?? current.envVar?.value ?? '').split(',')[0].trim();
  }
  const renderValue = previous ? `${secret},${previous}` : secret;

  const renderPut = await fetch(renderUrl, json(renderKey, { value: renderValue }, 'PUT'));
  console.log(`[proxy-titok] Render PUT ${SECRET_KEY}: HTTP ${renderPut.status}`);
  if (!renderPut.ok) process.exit(1);
  const vercelPost = await fetch(`${vercelUrl}&upsert=true`, json(vercelToken, { key: SECRET_KEY, value: secret, type: 'sensitive', target: ['production', 'preview'] }, 'POST'));
  console.log(`[proxy-titok] Vercel POST ${SECRET_KEY} (production + preview): HTTP ${vercelPost.status}`);
  if (!vercelPost.ok) process.exit(1);
  console.log('[proxy-titok] Kész. Következik: Render-újratelepítés, majd Vercel-újratelepítés (a változó telepítéskor lép életbe).');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(`[proxy-titok] Hiba: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(2);
  });
}
