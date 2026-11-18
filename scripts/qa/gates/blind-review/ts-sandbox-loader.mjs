// A vak ellenőr homokozójának TypeScript-betöltője (docs/specs/2026-11-18-vak-ellenor-deepseek.md, D3).
// Az ellenőr SAJÁT ellenpróbái a Node jogosultsági modelljében futnak (nincs gyerekfolyamat), ezért a tsx / esbuild nem használható.
// Ez a betöltő folyamaton belül, a munkafa `typescript` csomagjával fordít (.ts / .tsx / .mts), feloldja a `@shared/` és `@/`
// álneveket és a kiterjesztés nélküli importokat. Típusellenőrzést NEM végez (arra a `npx tsc --noEmit` való).
// Indítás: node --permission … --import <ez a fájl> <saját fájl>; a munkafa gyökere: BLIND_REVIEW_ROOT.

import { createRequire, registerHooks } from 'node:module';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = process.env.BLIND_REVIEW_ROOT || process.cwd();
const src = join(root, 'source');
const anchor = pathToFileURL(join(src, 'package.json')).href;
const ALIASES = [['@shared/', join(src, 'shared')], ['@/', join(src, 'client', 'src')]];
const SUFFIXES = ['', '.ts', '.tsx', '.mts', '.js', '.mjs', '.jsx', '/index.ts', '/index.tsx', '/index.js'];
const isTs = (p) => /\.(ts|tsx|mts)$/.test(p);
const isFile = (p) => { try { return existsSync(p) && statSync(p).isFile(); } catch { return false; } };

function pick(base) {
  for (const s of SUFFIXES) if (isFile(base + s)) return base + s;
  // `./x.js` import, amely mögött `x.ts` áll (TypeScript ESM-szokás)
  const m = /\.(m?js|jsx)$/.exec(base);
  if (m) for (const s of ['.ts', '.tsx', '.mts']) if (isFile(base.slice(0, -m[0].length) + s)) return base.slice(0, -m[0].length) + s;
  return null;
}

let tsMod;
const ts = () => { tsMod ??= createRequire(anchor)('typescript'); return tsMod; };

registerHooks({
  resolve(specifier, context, nextResolve) {
    let target = null;
    for (const [prefix, dir] of ALIASES) if (specifier.startsWith(prefix)) target = pick(join(dir, specifier.slice(prefix.length)));
    if (!target && /^\.{1,2}\//.test(specifier) && context.parentURL?.startsWith('file:')) {
      target = pick(resolve(dirname(fileURLToPath(context.parentURL)), specifier));
    }
    if (target) return isTs(target) ? { url: pathToFileURL(target).href, format: 'module', shortCircuit: true } : nextResolve(pathToFileURL(target).href, context);
    try {
      return nextResolve(specifier, context);
    } catch (e) {
      // Csomagnév a munkafa gyökeréből / az ideiglenes mappából: a függőségek a source/node_modules alatt vannak.
      if (e?.code === 'ERR_MODULE_NOT_FOUND' && !/^[./]|^file:|^node:/.test(specifier)) return nextResolve(specifier, { ...context, parentURL: anchor });
      throw e;
    }
  },
  load(url, context, nextLoad) {
    if (url.startsWith('file:') && isTs(url.split('?')[0]) && !url.includes('/node_modules/')) {
      const file = fileURLToPath(url);
      const t = ts();
      const out = t.transpileModule(readFileSync(file, 'utf8'), {
        fileName: file,
        compilerOptions: { module: t.ModuleKind.ESNext, target: t.ScriptTarget.ES2022, jsx: t.JsxEmit.ReactJSX, esModuleInterop: true, isolatedModules: true, inlineSourceMap: true, inlineSources: true },
      });
      return { format: 'module', source: out.outputText, shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});
