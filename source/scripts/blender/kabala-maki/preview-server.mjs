#!/usr/bin/env node
// Kabala-maki — helyi előnézeti kiszolgáló (csak fejlesztéshez; a programba nincs bekötve).
// A repó gyökerét szolgálja ki a 127.0.0.1-en, hogy az előnézet a three csomagot a source/node_modules-ból töltse (CDN nélkül).
// Használat: node source/scripts/blender/kabala-maki/preview-server.mjs   →   http://localhost:4599/
// (előfeltétel: npm ci a source/ alatt). A port a PORT környezeti változóval állítható.

import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..', '..');
const HOME = '/docs/measurements/kabala-maki/elonezet.html';
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
};
// Csak ami az előnézethez kell — a repó többi része (pl. source/.env) nem érhető el.
const ALLOWED = ['docs/measurements/kabala-maki/', 'source/client/public/models/kabala/', 'source/node_modules/three/'];

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  const pathname = decodeURIComponent(url.pathname === '/' ? HOME : url.pathname);
  const rel = normalize(pathname).replace(/^[\\/]+/, '').split(sep).join('/');
  const file = join(ROOT, rel);
  const allowed = ALLOWED.some((p) => rel.startsWith(p)) && file.startsWith(ROOT + sep) && TYPES[extname(file)];
  let size = -1;
  if (allowed) {
    try {
      const st = statSync(file);
      if (st.isFile()) size = st.size;
    } catch {
      size = -1;
    }
  }
  if (size < 0 || (req.method !== 'GET' && req.method !== 'HEAD')) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Nincs ilyen fájl');
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[extname(file)], 'content-length': size, 'cache-control': 'no-store' });
  if (req.method === 'HEAD') res.end();
  else createReadStream(file).pipe(res);
});

const port = Number(process.env.PORT) || 4599;
server.listen(port, '127.0.0.1', () => {
  console.log(`Kabala-maki előnézet: http://localhost:${port}/`);
});
