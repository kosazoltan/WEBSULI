import pg from "pg"; import fs from "fs";
const env = fs.readFileSync(".env","utf8"); const url = env.match(/^DATABASE_URL=(.*)$/m)[1].trim().replace(/^"|"$/g,"");
const c = new pg.Client({connectionString:url, ssl:{rejectUnauthorized:false}}); await c.connect();
const rows = (await c.query(`select error_type, severity, left(message,180) message, url, occurrence_count, last_seen_at, resolved, commit_sha from error_logs where last_seen_at > now() - interval '7 days' order by last_seen_at desc limit 25`)).rows;
console.log("7 napon belül látott:", rows.length);
for (const r of rows) console.log(`${r.last_seen_at.toISOString().slice(0,16)} ×${r.occurrence_count} ${r.resolved?"[megoldva]":""} ${r.error_type} ${r.severity} | ${r.message.replace(/\s+/g," ")} | ${r.url ?? ""} | ${r.commit_sha?.slice(0,7) ?? ""}`);
await c.end();
