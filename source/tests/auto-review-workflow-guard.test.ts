import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";

/**
 * Spec docs/specs/2026-11-19-bence-maradvany-tisztitas.md — az `auto-review.yml` minden PR-re megjegyzést ír, amelyet az
 * ügynökök élő dokumentációként olvasnak. A korábbi szöveg egy megszűnt szereplős rendszerre hivatkozott, és automatikus
 * beolvasztást ígért. A beolvasztást az orkesztrátor végzi a minőségkapuk után (docs/minosegkapuk.md).
 *
 * Az őr nem részszöveget keres a fájlban (vak ellenőr K-1: azt a fejléc-megjegyzés is kielégíti, és a kikommentelt sor is
 * „megvan”), hanem a két `script:` blokkot hamis github / context / core objektummal LEFUTTATJA, és a ténylegesen kiírt
 * megjegyzést, illetve az egyszeriség döntését méri. A YAML-szerkezetet (esemény, jogosultság, `if` feltételek)
 * formázástűrően, szövegesen rögzíti.
 */

const ROOT = join(import.meta.dirname, "..", "..");
const WORKFLOW = readFileSync(join(ROOT, ".github", "workflows", "auto-review.yml"), "utf8");
const LINES = WORKFLOW.split(/\r?\n/);

/** A régi állapotkulcs pontos szava: az átálláskor a „már lefutott” ellenőrzésnek fel kell ismernie (spec §4). */
const LEGACY_KEY_WORD = "bence-auto-review";
const TRIGGERS = ["@sourcery-ai review", "@codex review", "@vercel run a review"];
const FORBIDDEN_NAMES = /\b(?:bence|junior|openclaw|codi|eszter)\b|merge-eli/i;
/** Automatikus beolvasztás ígérete, bármilyen megfogalmazásban, amit eddig láttunk vagy a vak ellenőr kipróbált. */
const MERGE_PROMISE = /beolvad|beolvaszt|merge-eli|merge-elni|auto-?merge|automatikus(?:an)?\s+merge/i;
const ORCHESTRATOR_SENTENCE = /merge-et az orkesztrator vegzi a minosegkapuk \(docs\/minosegkapuk\.md\) utan/;

const indentOf = (line: string) => /^ */.exec(line)![0].length;
const normalize = (s: string) => s.replace(/\s+/g, " ").replace(/"/g, "'").trim();

type Step = { name: string; lines: string[] };

/** A `steps:` lista elemei: `- name: …` sortól a következő, azonos behúzású `- ` elemig. */
function steps(): Step[] {
  const out: Step[] = [];
  let current: Step | null = null;
  let itemIndent = -1;
  for (const line of LINES) {
    const m = /^( *)- name:\s*(.+?)\s*$/.exec(line);
    if (m && (itemIndent < 0 || m[1].length === itemIndent)) {
      itemIndent = m[1].length;
      current = { name: m[2], lines: [] };
      out.push(current);
      continue;
    }
    if (current && line.trim() !== "" && indentOf(line) <= itemIndent) current = null;
    current?.lines.push(line);
  }
  return out;
}

function step(name: string): Step {
  const found = steps().filter((s) => s.name === name);
  assert.equal(found.length, 1, `pontosan egy „${name}” lépés kell`);
  return found[0];
}

/** Egy lépés egyszerű `kulcs: érték` mezője (a lépés első szintjén); a teljes értéket közrefogó YAML-idézőjel nélkül. */
function field(s: Step, key: string): string | undefined {
  const re = new RegExp(`^ *${key}:\\s*(.+?)\\s*$`);
  for (const line of s.lines) {
    const m = re.exec(line);
    if (m) return m[1].replace(/^(["'])(.*)\1$/, "$2");
  }
  return undefined;
}

/** A lépés `script: |` blokkja, a blokk saját behúzása nélkül. */
function scriptOf(s: Step): string {
  const start = s.lines.findIndex((l) => /^ *script:\s*\|\s*$/.test(l));
  assert.ok(start >= 0, `a „${s.name}” lépésnek nincs script: | blokkja`);
  const keyIndent = indentOf(s.lines[start]);
  const body: string[] = [];
  for (const line of s.lines.slice(start + 1)) {
    if (line.trim() !== "" && indentOf(line) <= keyIndent) break;
    body.push(line);
  }
  const blockIndent = Math.min(...body.filter((l) => l.trim() !== "").map(indentOf));
  return body.map((l) => l.slice(blockIndent)).join("\n");
}

const CHECK = step("Check if already reviewed in this push");
const POST = step("Post review trigger comment");
const SKIP = step("Skip (already triggered for this SHA)");
const CHECK_SCRIPT = scriptOf(CHECK);
const POST_SCRIPT = scriptOf(POST);

type Comment = { body?: string | null };
type RunResult = { outputs: Record<string, string>; posted: string[] };

async function runScript(source: string, comments: Comment[], sha: string, env: Record<string, string> = {}): Promise<RunResult> {
  const outputs: Record<string, string> = {};
  const posted: string[] = [];
  const sandbox = {
    github: {
      rest: {
        issues: {
          listComments: async () => ({ data: comments }),
          createComment: async (args: { body: string }) => { posted.push(args.body); },
        },
      },
    },
    context: { repo: { owner: "o", repo: "r" }, issue: { number: 1 }, payload: { pull_request: { head: { sha } } } },
    core: { setOutput: (k: string, v: string) => { outputs[k] = v; }, info: () => {} },
    process: { env },
  };
  await vm.runInNewContext(`(async () => {\n${source}\n})()`, sandbox, { filename: "auto-review.yml#script" });
  return { outputs, posted };
}

/** A workflow egy futása: Check, majd a Post csak `already == 'false'` mellett (a feltétel szövegét külön teszt rögzíti). */
async function runWorkflow(comments: Comment[], sha: string): Promise<RunResult> {
  const check = await runScript(CHECK_SCRIPT, comments, sha);
  if (check.outputs.already !== "false") return check;
  const post = await runScript(POST_SCRIPT, comments, sha, { STATE_KEY: check.outputs.state_key });
  return { outputs: check.outputs, posted: post.posted };
}

const SHA = "a".repeat(40);
const OTHER_SHA = "b".repeat(40);

test("auto-review: a workflow neve semleges, a job neve változatlan", () => {
  assert.match(WORKFLOW, /^name:\s*["']?Auto Review["']?\s*$/m);
  assert.match(WORKFLOW, /^ {2}trigger-review-bots:\s*\r?\n\s+name:\s*["']?Trigger Sourcery \+ Codex review["']?\s*$/m);
});

test("auto-review: esemény, jogosultság és draft-feltétel változatlan", () => {
  const types = /^\s*types:\s*\[([^\]]*)\]/m.exec(WORKFLOW)?.[1];
  assert.ok(types, "a pull_request types listája nem található (flow-alak: types: [...])");
  assert.deepEqual(types.split(",").map((t) => t.trim()).filter(Boolean).sort(), ["opened", "ready_for_review", "reopened", "synchronize"]);
  assert.match(WORKFLOW, /^on:\s*\r?\n\s+pull_request:\s*$/m, "az esemény a pull_request legyen");

  const start = LINES.findIndex((l) => /^permissions:\s*$/.test(l));
  assert.ok(start >= 0, "a permissions blokk hiányzik");
  const perms: Record<string, string> = {};
  for (const line of LINES.slice(start + 1)) {
    if (line.trim() === "") continue;
    if (indentOf(line) === 0) break;
    const [k, v] = line.split(":").map((x) => x.trim());
    perms[k] = v;
  }
  assert.deepEqual(perms, { "pull-requests": "write", issues: "write", contents: "read" });

  const jobIf = /^ {4}if:\s*(.+?)\s*$/m.exec(WORKFLOW)?.[1]?.replace(/^(["'])(.*)\1$/, "$2");
  assert.equal(normalize(jobIf ?? ""),"github.event.pull_request.draft == false", "draft PR-en nem futhat");
});

test("auto-review: a lépések feltételei — Post csak új SHA-ra, Skip csak ismétlésre, a kulcs a Check kimenetéből jön", () => {
  assert.equal(field(CHECK, "id"), "check");
  assert.equal(normalize(field(POST, "if") ?? ""), "steps.check.outputs.already == 'false'");
  assert.equal(normalize(field(SKIP, "if") ?? ""), "steps.check.outputs.already == 'true'");
  assert.equal(normalize(field(POST, "STATE_KEY") ?? ""), "${{ steps.check.outputs.state_key }}");
});

test("auto-review: üres megjegyzéslistára egy megjegyzés, igaz szöveggel és a három önálló indítóval", async () => {
  const { outputs, posted } = await runWorkflow([], SHA);
  assert.equal(outputs.already, "false");
  assert.equal(posted.length, 1, "pontosan egy megjegyzés kell");
  const body = posted[0];
  const lines = body.split("\n").map((l) => l.trim());
  assert.equal(lines[0], `<!-- auto-review: ${SHA} -->`, "a megjegyzés az új állapotkulccsal kezdődik");
  for (const trigger of TRIGGERS) assert.ok(lines.includes(trigger), `a megjegyzésben nincs önálló sor: ${trigger}`);
  assert.match(body, /\*\*Atfogo review\*\* \(docs\/specs\/2026-10-18-atfogo-review\.md\)/, "hiányzik az átfogó review bekezdése");
  assert.match(body, /AGENTS\.md/, "az átfogó review bekezdése az AGENTS.md irányelveire hivatkozik");
  assert.equal(FORBIDDEN_NAMES.exec(body), null, "megszűnt szereplő a megjegyzésben");
  assert.equal(MERGE_PROMISE.exec(body), null, "automatikus merge ígérete a megjegyzésben");
  assert.match(body, ORCHESTRATOR_SENTENCE, "a megjegyzés nem mondja ki, hogy a merge-et az orkesztrátor végzi");
});

test("auto-review: ugyanarra a SHA-ra nem ír újra — sem az új, sem a régi kulcs után", async () => {
  const first = (await runWorkflow([], SHA)).posted[0];
  const again = await runWorkflow([{ body: "x" }, { body: first }], SHA);
  assert.equal(again.outputs.already, "true");
  assert.equal(again.posted.length, 0);

  const legacy = await runWorkflow([{ body: `<!-- ${LEGACY_KEY_WORD}: ${SHA} -->\nrégi megjegyzés` }], SHA);
  assert.equal(legacy.outputs.already, "true", "a régi kulcsot is fel kell ismerni (átállás)");
  assert.equal(legacy.posted.length, 0);
});

test("auto-review: más SHA kulcsa (új vagy régi) nem akadályozza az új megjegyzést", async () => {
  const comments: Comment[] = [
    { body: `<!-- ${LEGACY_KEY_WORD}: ${OTHER_SHA} -->` },
    { body: `<!-- auto-review: ${OTHER_SHA} -->` },
    { body: "auto-review: emlites SHA nelkul" },
    { body: null },
    {},
  ];
  const { outputs, posted } = await runWorkflow(comments, SHA);
  assert.equal(outputs.already, "false");
  assert.equal(posted.length, 1);
});

test("auto-review: a fájlban nincs megszűnt szereplő (a régi kulcs pontos szaván kívül)", () => {
  const text = WORKFLOW.split(LEGACY_KEY_WORD).join("");
  const hit = FORBIDDEN_NAMES.exec(text);
  assert.equal(hit, null, `tiltott szó a workflow-ban: ${hit?.[0]}`);
  assert.equal(MERGE_PROMISE.exec(text), null, "automatikus merge ígérete a workflow-ban");
  assert.equal(WORKFLOW.split(LEGACY_KEY_WORD).length - 1, 1, "a régi kulcs szava pontosan egyszer szerepelhet (csak a felismerésben)");
});

test("a gyökér .harness/ alatt nincs követett fájl (régi szereplős munkanapló)", () => {
  const tracked = execFileSync("git", ["ls-files", "--", ".harness"], { cwd: ROOT, encoding: "utf8" }).trim();
  assert.equal(tracked, "", `követett fájl a .harness/ alatt:\n${tracked}`);
});
