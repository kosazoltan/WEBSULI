/** Dry-run first. Apply the reviewed plan with optimistic concurrency and a local backup. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import pg from 'pg';
import { repairedMaterialTitle } from './materialTitleRepair';

dotenv.config({ quiet: true });
const mode = process.argv[2] ?? 'dry-run';
const output = path.resolve(process.argv[3] ?? '../artifacts/title-repair');
type Change = { id: string; before: string; after: string; contentHash: string };
const hash = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
async function main() {
  if (!['dry-run','apply','rollback'].includes(mode)) throw new Error('Use dry-run, apply or rollback');
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL missing');
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
  await client.connect();
  try {
    if (mode === 'dry-run') {
      const {rows} = await client.query<{id:string;title:string;content:string}>('SELECT id, title, content FROM html_files ORDER BY title');
      const changes:Change[]=[];
      const skipped:string[]=[];
      for(const row of rows) {
        let next:string;
        try { next=repairedMaterialTitle(row.title,row.content); }
        catch { skipped.push(row.title); continue; }
        if(next!==row.title) changes.push({id:row.id,before:row.title,after:next,contentHash:hash(row.content)});
      }
      fs.mkdirSync(output,{recursive:true});
      fs.writeFileSync(path.join(output,'plan.json'),JSON.stringify({scanned:rows.length,changes,skipped},null,2));
      const cell=(s:string)=>s.replace(/\|/g,'\\|').replace(/[\r\n]+/g,' ');
      fs.writeFileSync(path.join(output,'report.md'),`# Tananyagcímek száraz ellenőrzése\n\nÁtnézve: ${rows.length}. Javasolt csere: ${changes.length}. Hibás dokumentum: ${skipped.length}.\n\n| Meglévő cím | Dokumentum szerinti cím |\n|---|---|\n`+changes.map(c=>`| ${cell(c.before)} | ${cell(c.after)} |`).join('\n'));
      process.stdout.write(JSON.stringify({mode,scanned:rows.length,changes:changes.length,skipped:skipped.length,report:path.join(output,'report.md')})+'\n');
      return;
    }
    const plan = JSON.parse(fs.readFileSync(path.join(output,'plan.json'),'utf8')) as {changes:Change[]};
    await client.query('BEGIN');
    const reverse=mode==='rollback';
    if(!reverse) fs.writeFileSync(path.join(output,'before-apply.json'),JSON.stringify(plan,null,2),{flag:'wx'});
    for(const change of plan.changes) {
      const {rows}=await client.query<{title:string;content:string}>('SELECT title, content FROM html_files WHERE id=$1 FOR UPDATE',[change.id]);
      const row=rows[0];
      const expected=reverse?change.after:change.before;
      if(!row||row.title!==expected||hash(row.content)!==change.contentHash) throw new Error('Concurrent change; entire transaction rolled back');
      await client.query('UPDATE html_files SET title=$1 WHERE id=$2',[reverse?change.before:change.after,change.id]);
      const verified=await client.query<{title:string}>('SELECT title FROM html_files WHERE id=$1',[change.id]);
      if(verified.rows[0]?.title!==(reverse?change.before:change.after))throw new Error('Title readback mismatch');
    }
    await client.query('COMMIT');
    process.stdout.write(JSON.stringify({mode,updated:plan.changes.length,verified:true})+'\n');
  } catch(error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { await client.end(); }
}
main().catch(()=>{process.stderr.write('Title repair failed; no partial updates committed. Check connection, plan and concurrent changes.\n');process.exitCode=1;});
