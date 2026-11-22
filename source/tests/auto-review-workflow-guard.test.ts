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

/**
 * Szerkezeti olvasás (Copilot-szál + vak ellenőr L1, hibaosztály: a szövegkeresés a YAML-szintet nem látja). A lépés mezői csak a
 * lépés SAJÁT szintjén (a `- name:` kötőjele + 2 szóköz) számítanak; az `env` és a `with` alatti kulcsok csak a saját blokkjukban.
 */
type Step = { name: string; indent: number; lines: string[] };

/** A `steps:` lista elemei: `- name: …` sortól a következő, azonos behúzású `- ` elemig. */
function parseSteps(lines: string[]): Step[] {
  const out: Step[] = [];
  let current: Step | null = null;
  let itemIndent = -1;
  for (const line of lines) {
    const m = /^( *)- name:\s*(.+?)\s*$/.exec(line);
    if (m && (itemIndent < 0 || m[1].length === itemIndent)) {
      itemIndent = m[1].length;
      current = { name: m[2], indent: itemIndent + 2, lines: [] };
      out.push(current);
      continue;
    }
    if (current && line.trim() !== "" && indentOf(line) <= itemIndent) current = null;
    current?.lines.push(line);
  }
  return out;
}

function stepIn(lines: string[], name: string): Step {
  const found = parseSteps(lines).filter((s) => s.name === name);
  assert.equal(found.length, 1, `pontosan egy „${name}” lépés kell`);
  return found[0];
}

const unquote = (v: string) => v.replace(/^(["'])(.*)\1$/, "$2");

/** Egy blokk közvetlen gyermek-sorai (`at` behúzáson álló `key:` alatt, eggyel mélyebb szinten). */
function childLines(lines: string[], at: number, key: string): string[] | undefined {
  const start = lines.findIndex((l) => indentOf(l) === at && new RegExp(`^ *${key}:\\s*$`).test(l));
  if (start < 0) return undefined;
  const out: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() !== "" && indentOf(line) <= at) break;
    out.push(line);
  }
  return out;
}

/** Egy `at` behúzáson álló `kulcs: érték` (csak pontosan ezen a szinten). */
function valueAt(lines: string[], at: number, key: string): string | undefined {
  const re = new RegExp(`^ {${at}}${key}:\\s*(.+?)\\s*$`);
  for (const line of lines) { const m = re.exec(line); if (m) return unquote(m[1]); }
  return undefined;
}

/** A lépés közvetlen mezője (pl. `id`, `if`, `uses`). */
const field = (s: Step, key: string) => valueAt(s.lines, s.indent, key);
/** A lépés `env:` blokkjának egy kulcsa. */
const envField = (s: Step, key: string) => { const env = childLines(s.lines, s.indent, "env"); return env ? valueAt(env, s.indent + 2, key) : undefined; };

/** Az `actions/github-script` lépés `with.script: |` blokkja, a blokk saját behúzása nélkül. */
function githubScript(s: Step): string {
  assert.match(field(s, "uses") ?? "", /^actions\/github-script@v\d+$/, `a „${s.name}” lépés nem actions/github-script`);
  const withBlock = childLines(s.lines, s.indent, "with");
  assert.ok(withBlock, `a „${s.name}” lépésnek nincs with: blokkja`);
  const start = withBlock.findIndex((l) => indentOf(l) === s.indent + 2 && /^ *script:\s*\|\s*$/.test(l));
  assert.ok(start >= 0, `a „${s.name}” lépés with: blokkjában nincs script: | mező`);
  const body: string[] = [];
  for (const line of withBlock.slice(start + 1)) {
    if (line.trim() !== "" && indentOf(line) <= s.indent + 2) break;
    body.push(line);
  }
  const blockIndent = Math.min(...body.filter((l) => l.trim() !== "").map(indentOf));
  return body.map((l) => l.slice(blockIndent)).join("\n");
}

/** Az `on.pull_request` közvetlen kulcsai (a `types` mellett semmi — branch / path szűrő nem lehet; vak ellenőr L1). */
function pullRequestKeys(lines: string[]): string[] {
  const on = childLines(lines, 0, "on");
  assert.ok(on, "az on: blokk hiányzik");
  assert.deepEqual(on.filter((l) => l.trim() !== "" && indentOf(l) === 2).map((l) => l.trim().replace(/:.*$/, "")), ["pull_request"], "csak pull_request esemény");
  const pr = childLines(on, 2, "pull_request");
  assert.ok(pr, "a pull_request blokk hiányzik");
  return pr.filter((l) => l.trim() !== "" && indentOf(l) === 4).map((l) => l.trim().replace(/:.*$/, ""));
}

/** A teljes szerkezeti szerződés egy workflow-szövegen (a mutációs ellenpróbák ugyanezt hívják). */
function checkStructure(text: string): void {
  const lines = text.split(/\r?\n/);
  assert.deepEqual(pullRequestKeys(lines), ["types"], "az on.pull_request alatt csak types állhat");
  const check = stepIn(lines, "Check if already reviewed in this push");
  const post = stepIn(lines, "Post review trigger comment");
  const skip = stepIn(lines, "Skip (already triggered for this SHA)");
  assert.equal(field(check, "id"), "check");
  assert.equal(normalize(field(post, "if") ?? ""), "steps.check.outputs.already == 'false'", "a Post feltétele közvetlen lépésmező");
  assert.equal(normalize(field(skip, "if") ?? ""), "steps.check.outputs.already == 'true'", "a Skip feltétele közvetlen lépésmező");
  assert.equal(normalize(envField(post, "STATE_KEY") ?? ""), "${{ steps.check.outputs.state_key }}", "a STATE_KEY az env blokkból");
  githubScript(check);
  githubScript(post);
}

const CHECK = stepIn(LINES, "Check if already reviewed in this push");
const POST = stepIn(LINES, "Post review trigger comment");
const CHECK_SCRIPT = githubScript(CHECK);
const POST_SCRIPT = githubScript(POST);

type Comment = { body?: string | null };
type RunResult = { outputs: Record<string, string>; posted: string[]; calls: Array<{ api: string; owner: unknown; repo: unknown; issue_number: unknown }> };

async function runScript(source: string, comments: Comment[], sha: string, env: Record<string, string> = {}): Promise<RunResult> {
  const outputs: Record<string, string> = {};
  const posted: string[] = [];
  const calls: RunResult["calls"] = [];
  const sandbox = {
    github: {
      rest: {
        issues: {
          listComments: async (args: { owner: unknown; repo: unknown; issue_number: unknown }) => { calls.push({ api: "list", owner: args.owner, repo: args.repo, issue_number: args.issue_number }); return { data: comments }; },
          createComment: async (args: { body: string; owner: unknown; repo: unknown; issue_number: unknown }) => { calls.push({ api: "create", owner: args.owner, repo: args.repo, issue_number: args.issue_number }); posted.push(args.body); },
        },
      },
    },
    context: { repo: { owner: "o", repo: "r" }, issue: { number: 1 }, payload: { pull_request: { head: { sha } } } },
    core: { setOutput: (k: string, v: string) => { outputs[k] = v; }, info: () => {} },
    process: { env },
  };
  await vm.runInNewContext(`(async () => {\n${source}\n})()`, sandbox, { filename: "auto-review.yml#script" });
  return { outputs, posted, calls };
}

/** A workflow egy futása: Check, majd a Post csak `already == 'false'` mellett (a feltétel szerkezetét a checkStructure rögzíti). */
async function runWorkflow(comments: Comment[], sha: string, post: string = POST_SCRIPT): Promise<RunResult> {
  const check = await runScript(CHECK_SCRIPT, comments, sha);
  if (check.outputs.already !== "false") return check;
  const posted = await runScript(post, comments, sha, { STATE_KEY: check.outputs.state_key });
  return { outputs: check.outputs, posted: posted.posted, calls: [...check.calls, ...posted.calls] };
}

/** Vak ellenőr L2: minden API-hívás az esemény saját PR-jára (owner / repo / issue_number a context-ből). */
function assertAddressed(calls: RunResult["calls"]): void {
  assert.ok(calls.length >= 2, "listázás és kommentírás is történt");
  for (const c of calls) assert.deepEqual({ owner: c.owner, repo: c.repo, issue_number: c.issue_number }, { owner: "o", repo: "r", issue_number: 1 }, `${c.api}: rossz címzés`);
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

test("auto-review: a lépések feltételei — Post csak új SHA-ra, Skip csak ismétlésre, a kulcs a Check kimenetéből jön (szerkezetileg)", () => {
  checkStructure(WORKFLOW);
});

test("auto-review: szerkezeti mutációs ellenpróbák — mindegyik bukik (Copilot-szál, vak ellenőr L1)", () => {
  const mutants: Array<[string, (w: string) => string]> = [
    ["a Post `if` feltétele az env alá kerül", (w) => w.replace(/\n {8}if: steps\.check\.outputs\.already == 'false'\n {8}uses: actions\/github-script@v7\n {8}env:\n/, "\n        uses: actions/github-script@v7\n        env:\n          if: steps.check.outputs.already == 'false'\n")],
    ["branch-szűrő a pull_request alatt", (w) => w.replace(/\n {4}types: \[([^\]]*)\]\n/, "\n    types: [$1]\n    branches: [develop]\n")],
    ["path-szűrő a pull_request alatt", (w) => w.replace(/\n {4}types: \[([^\]]*)\]\n/, "\n    types: [$1]\n    paths: ['docs/**']\n")],
    ["a STATE_KEY a with alá kerül (env helyett)", (w) => w.replace(/\n {8}env:\n {10}STATE_KEY: (.+)\n {8}with:\n/, "\n        with:\n          STATE_KEY: $1\n")],
    ["a script nem a with alatt áll", (w) => w.replace(/(\n {6}- name: Post review trigger comment[\s\S]*?)\n {8}with:\n {10}script: \|/, "$1\n        script: |")],
    ["a Check nem github-script", (w) => w.replace(/(- name: Check if already reviewed in this push\n {8}id: check\n {8}uses: )actions\/github-script@v7/, "$1some/other-action@v1")],
  ];
  const base = WORKFLOW.replace(/\r\n/g, "\n"); // C-92: Windows-on CRLF-fel jön
  checkStructure(base);
  for (const [label, mutate] of mutants) {
    const mutated = mutate(base);
    assert.notEqual(mutated, base, `a mutáns nem módosított semmit: ${label}`);
    assert.throws(() => checkStructure(mutated), `a mutáns átment: ${label}`);
  }
});

test("auto-review: a listázás és a komment az esemény saját PR-jára megy; rossz PR-szám mutáns bukik (vak ellenőr L2)", async () => {
  assertAddressed((await runWorkflow([], SHA)).calls);
  const wrong = POST_SCRIPT.replace(/issue_number: context\.issue\.number,/, "issue_number: context.issue.number + 1,");
  assert.notEqual(wrong, POST_SCRIPT, "a mutáns nem módosított semmit");
  await assert.rejects(async () => assertAddressed((await runWorkflow([], SHA, wrong)).calls));
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
