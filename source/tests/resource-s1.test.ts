import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { waitForActiveRuns } from "../server/workflows/engine";
import { anthropicClient } from "../server/studio/single-run/conversation";
import { LEARNING_AUDIT_INTERVAL_MS } from "../server/workflows/learning-worker";
import { IMPROVE_SWEEP_INTERVAL_MS } from "../server/improve-orphans";

/* Spec 2026-10-19-eroforras-s1 — mért: a Neon soha nem függesztett fel (az időzítők ébren tartották); a bemenet 24%-a jött
   gyorsítótárból; egy kitelepítés megszakított egy okosítást. */

test("az időzítők ritkák: tanulási ellenőrzés 30 perc, okosítás-söprés 5 perc, ütemezett közzététel óránként, munkamenet-takarítás 6 óra", () => {
  assert.equal(LEARNING_AUDIT_INTERVAL_MS, 30 * 60_000);
  assert.equal(IMPROVE_SWEEP_INTERVAL_MS, 300_000);
  assert.match(fs.readFileSync("server/scheduledPublishing.ts", "utf8"), /cron\.schedule\("0 \* \* \* \*"/);
  assert.match(fs.readFileSync("server/studio/lesson-pipeline-routes.ts", "utf8"), /STUDIO_SWEEP_INTERVAL_MS = 300_000/);
  assert.match(fs.readFileSync("server/auth.ts", "utf8"), /pruneSessionInterval: 60 \* 60 \* 6/);
});

test("a hosszú gyártás mindkét gyorsítótár-töréspontja 1 órás", async () => {
  let params: Record<string, unknown> | null = null;
  const client = { messages: { stream(p: unknown) { params = p as Record<string, unknown>; return { finalMessage: async () => ({ content: [{ type: "text", text: "{}" }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } }) }; } } };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await anthropicClient({ client: client as any }).complete("RENDSZER", [{ role: "user", blocks: [{ type: "text", text: "szia" }] }]);
  const p = params as unknown as { system: Array<{ cache_control: unknown }>; cache_control: unknown };
  assert.deepEqual(p.system[0].cache_control, { type: "ephemeral", ttl: "1h" });
  assert.deepEqual(p.cache_control, { type: "ephemeral", ttl: "1h" });
});

test("leálláskor: futás nélkül azonnal; futásnál a végéig vár; a határidőn túl nem", async () => {
  let t = 0;
  const now = () => t;
  const sleep = async (ms: number) => { t += ms; };
  assert.equal(await waitForActiveRuns(280_000, () => 0, 2000, now, sleep), 0);
  assert.equal(t, 0, "futás nélkül nincs várakozás");
  let left = 3;
  const finishing = () => (t >= 10_000 ? 0 : left);
  assert.equal(await waitForActiveRuns(280_000, finishing, 2000, now, sleep), 0);
  assert.equal(t, 10_000);
  t = 0; left = 1;
  assert.equal(await waitForActiveRuns(280_000, () => left, 2000, now, sleep), 1, "a határidő után a maradék futás száma");
  assert.equal(t, 280_000);
});
