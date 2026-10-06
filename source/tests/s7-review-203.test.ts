import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { memoryWorkflows } from "./helpers/workflow-store";
import { failOnSchemaInvalid, ModelSchemaError, runToolWorkflow } from "../server/workflows/tool-run";
import { workflowPhase } from "../server/workflows/engine";
import { correctionFindingNeeded, proposeSourceCorrections } from "../server/studio/source-corrections";

/** Review #203 (PR #203) — a S7 workflow-rendbetétel review-leletei. */
const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

test("review #203: ismeretlen tananyagra a kvízgenerálás 404-es hibát ad, futás nem jön létre", async () => {
  const { generateMaterialQuiz, QuizMaterialNotFound } = await import("../server/gameQuizGeneratorService");
  const asked: string[] = [];
  await assert.rejects(
    generateMaterialQuiz("torolt-anyag", 10, "owner", { materialExists: async (id) => { asked.push(id); return false; } }),
    (error: unknown) => error instanceof QuizMaterialNotFound && /Tananyag nem található: torolt-anyag/.test(error.message),
  );
  assert.deepEqual(asked, ["torolt-anyag"]);
  // The route maps it to 404 before any workflow work.
  const routes = readFileSync(join(ROOT, "server/routes.ts"), "utf8");
  assert.match(routes, /if \(e instanceof QuizMaterialNotFound\) return res\.status\(404\)/);
  const service = readFileSync(join(ROOT, "server/gameQuizGeneratorService.ts"), "utf8");
  assert.ok(service.indexOf("throw new QuizMaterialNotFound(") < service.indexOf("return runToolWorkflow({ mode: \"quiz\""), "a létezés-ellenőrzés a futás ELŐTT van");
});

test("review #203: a séma-hibás modellválasz lelet + bukott futás (nem kész javaslat)", async () => {
  const workflows = memoryWorkflows();
  await assert.rejects(runToolWorkflow({ mode: "htmlAssist", owner: "owner", id: "assist-1", request: { tool: "errors" }, store: workflows.store }, async () => {
    await workflowPhase("source");
    await workflowPhase("author");
    await workflowPhase("gate");
    await failOnSchemaInvalid(true, "A modell válaszából hiányzik a javított HTML.");
    await workflowPhase("readback");
    return { value: undefined, result: { kind: "proposal" as const, id: "file-1" } };
  }), ModelSchemaError);
  const view = workflows.records.get("assist-1")!.view;
  assert.equal(view.state, "error");
  assert.ok(view.skillFindings?.some((f) => f.code === "schema"), "schema lelet rögzült");
  assert.equal(view.result, undefined);
  // Valid answer: no finding, no stop.
  const ok = memoryWorkflows();
  await runToolWorkflow({ mode: "htmlAssist", owner: "owner", id: "assist-2", request: { tool: "errors" }, store: ok.store }, async () => {
    await workflowPhase("source"); await workflowPhase("author"); await workflowPhase("gate");
    await failOnSchemaInvalid(false, "nem kell");
    await workflowPhase("readback");
    return { value: undefined, result: { kind: "proposal" as const, id: "file-1" } };
  });
  assert.equal(ok.records.get("assist-2")!.view.state, "done");
  assert.ok(!ok.records.get("assist-2")!.view.skillFindings?.some((f) => f.code === "schema"));
  // Every model-answer schema check of the H/I paths stops the run (no bare finding-and-continue left).
  const routes = readFileSync(join(ROOT, "server/routes.ts"), "utf8");
  assert.doesNotMatch(routes, /workflowFinding\("schema"\)/);
  assert.equal(routes.match(/await failOnSchemaInvalid\(/g)?.length, 6);
});

test("review #203: a forrás-helyesbítés modell-/parse-hibája is source_correction lelet", async () => {
  const failed = await proposeSourceCorrections(async () => { throw new Error("modell nem elérhető"); }, [], { transcript: true });
  assert.match(failed.warning ?? "", /kimaradt/);
  assert.equal(correctionFindingNeeded(failed), true);
  assert.equal(correctionFindingNeeded({ corrections: [], rejected: ["x: elvetve"] }), true);
  assert.equal(correctionFindingNeeded({ corrections: [], rejected: [] }), false);
  const routes = readFileSync(join(ROOT, "server/studio/lesson-pipeline-routes.ts"), "utf8");
  assert.match(routes, /if \(correctionFindingNeeded\(result\)\) await workflowFinding\("source_correction"\)/);
});

test("review #203: a runExtraction tudástár-tranzakciója az elején és a végén lízing-kapus (workflowFence)", () => {
  const file = join(ROOT, "server/studio/run-extraction.ts");
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  let checked = 0;
  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === "runExtraction") {
      const findTx = (n: ts.Node) => {
        if (ts.isCallExpression(n) && n.expression.getText(source) === "db.transaction") {
          const fn = n.arguments[0];
          assert.ok(fn && (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) && ts.isBlock(fn.body));
          const statements = (fn.body as ts.Block).statements;
          assert.match(statements[0].getText(source), /^await workflowFence\(tx\);$/, "a tranzakció első lépése a kapu");
          assert.ok(ts.isReturnStatement(statements.at(-1)!));
          assert.match(statements.at(-2)!.getText(source), /^await workflowFence\(tx\);$/, "a commit előtti utolsó lépés a kapu");
          checked++;
        }
        n.forEachChild(findTx);
      };
      findTx(node);
    }
    node.forEachChild(visit);
  };
  visit(source);
  assert.equal(checked, 1);
});

test("review #203: a tanári helyesbítés km_concepts-írása lízing-zár alatt, és a zár-ütközés nem nyelődik el", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../server/studio/lesson-pipeline-routes.ts", import.meta.url), "utf8");
  const body = src.slice(src.indexOf("export async function correctMapFromOwner"), src.indexOf("\nexport ", src.indexOf("export async function correctMapFromOwner") + 10));
  assert.equal((body.match(/await workflowFence\(tx\)/g) ?? []).length, 2, "zár a tranzakció elején és végén");
  assert.match(body, /if \(error instanceof WorkflowConflict\) throw error;/);
});
