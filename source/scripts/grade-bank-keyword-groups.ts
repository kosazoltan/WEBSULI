/**
 * JBb (review #453) — emberi átnézést segítő gépi csoportosítás: az évfolyam-bank magyarázatai közül azokat, amelyek ugyanarról
 * a nyelvtani kulcsszóról (since / for / much / many …) állítanak szabályt, egymás mellé teszi, hogy a bankon belüli
 * ELLENTMONDÁS (két magyarázat ellentétes szabályt tanít) egy pillantással látsszon. Döntést nem hoz.
 *
 *   cd source && node --import tsx scripts/grade-bank-keyword-groups.ts [--subject english] [--grades 3-9] [--out <fájl.md>]
 */
import fs from "node:fs";

import { GRADE_QUIZ_ITEMS } from "../client/src/data/gradeQuizBank";

const arg = (k: string, d: string) => {
  const i = process.argv.indexOf(k);
  return i > 0 ? process.argv[i + 1]! : d;
};
const subject = arg("--subject", "english");
const [lo, hi] = arg("--grades", "3-12").split("-").map(Number) as [number, number];
const out = arg("--out", "");

/** Kulcsszó-csoportok: egy csoportba azok a szavak kerülnek, amelyek szabályát érdemes egymás mellett látni. */
const GROUPS: Record<string, string[]> = {
  english: [
    "since|for|ago|yet|already|ever|never|just",
    "much|many|a lot of|few|a few|little|a little",
    "some|any|no",
    "will|going to|shall",
    "used to|be used to|get used to",
    "in|on|at",
    "who|which|that|whose|where",
    "must|mustn't|have to|don't have to|should|might|may|can|could",
    "do|does|did",
    "am|is|are|was|were",
    "have got|has got|have|has",
    "this|that|these|those",
    "-ing|to \\+|infinitive|gerund",
    "comparative|superlative|more|most|-er|-est|than",
  ],
  hungarian: ["tárgy|alany|állítmány|határozó|jelző", "képző|jel|rag", "ikes", "felszólító|feltételes|kijelentő", "j|ly"],
};

const items = GRADE_QUIZ_ITEMS.filter((q) => q.subject === subject && q.grade >= lo && q.grade <= hi);
const lines: string[] = [`# Kulcsszó-csoportok — ${subject}, ${lo}–${hi}. évfolyam (${items.length} tétel)`, ""];
for (const group of GROUPS[subject] ?? []) {
  const words = group.split("|");
  const re = new RegExp(`(^|[^\\p{L}])(${words.join("|")})(?=[^\\p{L}]|$)`, "iu");
  const hits = items.filter((q) => re.test(q.explanation));
  if (hits.length === 0) continue;
  lines.push(`## ${words.join(" / ")} (${hits.length})`, "");
  for (const q of hits) lines.push(`- \`${q.id}\` — ${q.prompt} → **${q.options[q.correctIndex]}** — ${q.explanation}`);
  lines.push("");
}
const text = lines.join("\n");
if (out) fs.writeFileSync(out, text);
else process.stdout.write(text);
