#!/usr/bin/env node
/**
 * WEBSULI — a változatosság-mérés bemenetének letöltése (CSAK SELECT; a munkamenet írásvédett).
 * Használat: node variety-fetch.mjs --env <source/.env> --modules <source mappa, ahol a node_modules/pg van> --out <mappa> [--n 15]
 * A kapcsolati szöveget csak a .env-ből olvassa, sehová nem írja ki. Kimenet: <out>/sample.json (teljes leckék, a legfrissebb
 * kiadottak közül tantárgyanként legfeljebb 2, angolból 4, tantárgy × évfolyam páronként 2) és <out>/population.json (minden
 * kiadott fusion-7.4-4 lecke a bank tasks / quiz / glossary nélkül). Utána: node --import tsx scripts/measure/variety-measure.mts --population <out>/population.json --baseline scripts/measure/fixtures/variety-baseline.json
 * Forrás: a 2026-11-18-i mérés munkamenet-jegyzete; spec docs/specs/2026-11-20-tgm-valtozatossag-abrak.md (15. szakasz).
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]]] : acc), []));
if (!args.env || !args.modules || !args.out) { console.error("Használat: node variety-fetch.mjs --env <.env> --modules <source> --out <mappa> [--n 15]"); process.exit(2); }
const pg = createRequire(path.join(path.resolve(args.modules), "package.json"))("pg");
const url = (fs.readFileSync(args.env, "utf8").match(/^DATABASE_URL\s*=\s*["']?([^"'\r\n]+)["']?/m) ?? [])[1];
if (!url) { console.error("Nincs DATABASE_URL a megadott .env-ben."); process.exit(2); }
const client = new pg.Client({ connectionString: url.replace(/([?&])(sslmode|channel_binding|sslrootcert)=[^&]*&?/g, "$1").replace(/[?&]$/, ""), ssl: { rejectUnauthorized: false } });
const q = async (sql, params) => { if (!/^\s*(select|with)\b/i.test(sql)) throw new Error("Csak SELECT futtatható."); return (await client.query(sql, params)).rows; };
const subjKey = (s) => s.toLocaleLowerCase("hu").normalize("NFD").replace(/\p{M}/gu, "").replace(/\s+(nyelv|nyelvtan|es irodalom|irodalom)\b.*/, "").trim();
try {
  await client.connect();
  await client.query("SET default_transaction_read_only = on");
  const FROM = `from lessons l join html_files h on h.id = l.html_file_id where l.published_at is not null and l.json->'experience'->>'version' = 'fusion-7.4-4'`;
  const meta = await q(`select l.id, l.json->>'title' title, l.json->>'subject' subject, (l.json->>'classroom')::int classroom, l.published_at ${FROM} order by l.published_at desc, l.id`);
  const picked = [], perSubject = new Map(), perPair = new Map(), want = Number(args.n ?? 15);
  for (const m of meta) {
    const k = subjKey(m.subject), cap = k === "angol" ? 4 : 2, pair = `${k}|${m.classroom}`;
    if ((perSubject.get(k) ?? 0) >= cap || (perPair.get(pair) ?? 0) >= 2) continue;
    perSubject.set(k, (perSubject.get(k) ?? 0) + 1); perPair.set(pair, (perPair.get(pair) ?? 0) + 1); picked.push(m);
    if (picked.length === want) break;
  }
  const ids = picked.map((p) => p.id);
  const full = new Map((await q(`select id, json from lessons where id = any($1)`, [ids])).map((r) => [r.id, r.json]));
  const clips = await q(`select lesson_id, status, origin, count(*)::int n from lesson_clips where lesson_id = any($1) group by 1,2,3`, [ids]);
  fs.mkdirSync(args.out, { recursive: true });
  fs.writeFileSync(path.join(args.out, "sample.json"), JSON.stringify(picked.map((p) => ({ ...p, json: full.get(p.id), clips: clips.filter((c) => c.lesson_id === p.id) }))));
  const pop = await q(`select l.id, l.published_at, (l.json #- '{experience,tasks}' #- '{experience,quiz}' #- '{experience,glossary}') json ${FROM} order by l.published_at desc, l.id`);
  fs.writeFileSync(path.join(args.out, "population.json"), JSON.stringify(pop));
  console.log(`Letöltve: ${picked.length} mintalecke, ${pop.length} kiadott lecke.`);
} catch (e) { console.error("Hiba:", String(e.message).replace(/postgres(ql)?:\/\/\S+/g, "[REDACTED]")); process.exitCode = 1; }
finally { await client.end().catch(() => {}); }
