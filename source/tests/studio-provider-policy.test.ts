import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { createStudioStepProvider, STUDIO_STEP_POLICY, studioConnection } from "../server/ai/studio-provider";
import { ClaudeProvider } from "../server/ai/ClaudeProvider";
import { OpenRouterProvider } from "../server/ai/OpenRouterProvider";
import { callStepModel, stepDeadlineMs, jsonFailureShape, parseModelJson } from "../server/studio/run-step";
import { AIProviderTimeoutError } from "../server/ai/AIProvider";

/*
 * Spec 2026-09-19 (modellmátrix + Opus 5 tervkészítő) — the request SHAPES the Studio
 * sends, captured at the HTTP boundary so a wrong field name is caught here, not as a
 * production 400.
 */

function withEnv(t: TestContext, values: Record<string, string>) {
  const before = Object.fromEntries(Object.keys(values).map(k => [k, process.env[k]]));
  Object.assign(process.env, values);
  t.after(() => { for (const [k, v] of Object.entries(before)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });
}

test("a pedagógus a közvetlen Anthropic API-n fut: claude-opus-5, adaptív gondolkodás, effort medium, 16000 max_tokens", async t => {
  withEnv(t, { AI_INTEGRATIONS_ANTHROPIC_API_KEY: "test-placeholder" });
  let captured: Record<string, unknown> | undefined;
  t.mock.method(globalThis, "fetch", async (url: unknown, init?: RequestInit) => {
    assert.equal(String(url), "https://api.anthropic.com/v1/messages");
    captured = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({
      id: "msg_1", type: "message", role: "assistant", model: "claude-opus-5", stop_reason: "end_turn", stop_sequence: null,
      content: [{ type: "thinking", thinking: "…", signature: "sig" }, { type: "text", text: '{"sections":[]}' }],
      usage: { input_tokens: 10, output_tokens: 5 },
    }), { headers: { "Content-Type": "application/json" } });
  });
  const provider = createStudioStepProvider("claude-opus-5", "pedagogue");
  assert.ok(provider instanceof ClaudeProvider);
  const result = await callStepModel(provider, { step: "pedagogue", model: provider.model, system: "Terv", user: "Csak JSON" });
  assert.deepEqual(result.json, { sections: [] }, "a thinking blokk után a text blokk a válasz");
  assert.equal(captured?.model, "claude-opus-5");
  assert.deepEqual(captured?.thinking, { type: "adaptive" });
  assert.deepEqual(captured?.output_config, { effort: "medium" });
  assert.equal(captured?.max_tokens, STUDIO_STEP_POLICY.pedagogue.maxTokens);
  assert.equal(STUDIO_STEP_POLICY.pedagogue.maxTokens, 16_000);
  assert.equal(captured?.system, "Terv");
  assert.ok(!("budget_tokens" in ((captured?.thinking as object) ?? {})), "budget_tokens tilos Opus 5-ön");
});

test("a bank és az ábra lépés OpenRouteren fut, reasoning.effort=low", async t => {
  withEnv(t, { OPENROUTER_API_KEY: "test-placeholder" });
  const bodies: Record<string, unknown>[] = [];
  t.mock.method(globalThis, "fetch", async (url: unknown, init?: RequestInit) => {
    assert.equal(String(url), "https://openrouter.ai/api/v1/chat/completions");
    bodies.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content: '{"ok":true}' }, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }),
      { headers: { "Content-Type": "application/json" } });
  });
  for (const step of ["bank", "animator"] as const) {
    const provider = createStudioStepProvider("z-ai/glm-5.3-flash", step);
    assert.ok(provider instanceof OpenRouterProvider);
    await callStepModel(provider, { step: "animator", model: provider.model, system: "S", user: "U" });
  }
  assert.equal(bodies.length, 2);
  for (const body of bodies) {
    assert.equal(body.model, "z-ai/glm-5.3-flash");
    assert.deepEqual(body.reasoning, { effort: "low" });
    assert.equal(body.max_completion_tokens, 24_000);
    // Spec §7o (mérve): a glm-válaszok ~1/8-a szintaktikailag törött JSON volt (nem csonka) — a
    // szolgáltatói JSON-mód ezt a hibaosztályt megszünteti, a tartalmat nem érinti.
    assert.deepEqual(body.response_format, { type: "json_object" }, "a bank/animátor kérés JSON-módban megy");
  }
});

// Spec §7o (mérve, 4. mérés): a bank-hívás időtúllépését az SDK kétszer csendben újrapróbálta (3 × 240 s).
test("a bank/animátor kérése egyszer megy el: az SDK nem próbálja újra csendben (maxRetries 0)", async t => {
  withEnv(t, { OPENROUTER_API_KEY: "test-placeholder" });
  let fetches = 0;
  t.mock.method(globalThis, "fetch", async () => { fetches++; return new Response("upstream error", { status: 500 }); });
  for (const step of ["bank", "animator"] as const) {
    fetches = 0;
    const provider = createStudioStepProvider("z-ai/glm-5.3-flash", step);
    await assert.rejects(callStepModel(provider, { step: "animator", model: provider.model, system: "S", user: "U" }));
    assert.equal(fetches, 1, `${step}: egyetlen kérés, rejtett újrapróbálás nélkül`);
  }
});

// Spec §7o/3 (mérve, szondával reprodukálva JSON-módban, a bájtok a hibapozíciónál kiolvasva):
// 12 glm-válaszból 2 volt törött, két pontosan azonosított osztályban. Mindkettő a LEZÁRÓ karakter
// hibája — a tartalmat nem érinti —, ezért determinisztikusan helyreállítható, újraelemzéssel igazolva.
test("a mért sorosítási hibák javulnak modellkör nélkül; a tartalom változatlan", () => {
  // 1. osztály: a sztringet magyar záró idézőjel zárja, ezért a sorvég a sztringbe kerül.
  const curly = '{"feedback":["Sok gyökér behatol.","Természetesen hat, például repedésekben növő fák.”\n]}';
  assert.throws(() => JSON.parse(curly), /Bad control character/);
  const fixed = parseModelJson(curly);
  assert.deepEqual(fixed.json, { feedback: ["Sok gyökér behatol.", "Természetesen hat, például repedésekben növő fák."] });
  assert.deepEqual(fixed.repairs, ["gépelt záró idézőjel lezárásként"]);
  // 2. osztály: a kész JSON után csonka kerítés marad.
  const junk = '{"notes":[]}\n``';
  assert.deepEqual(parseModelJson(junk), { json: { notes: [] }, repairs: ["JSON utáni szemét eldobva"] });
  // Érvényes válasz: érintetlen, javítás nélkül — a magyar idézőjel a sztringen BELÜL marad.
  const legit = '{"a":"Azt mondta: „igen”.","b":"idézet: „kész”"}';
  assert.deepEqual(parseModelJson(legit), { json: { a: "Azt mondta: „igen”.", b: "idézet: „kész”" }, repairs: [] });
  // 3. osztály: a belső idézet „-vel nyílik, de egyenes "-rel zárul → idő előtt lezárja a JSON-sztringet.
  const inner = '{"q":"Használd a „mállás" és a „talajréteg" szavakat!","r":1}';
  assert.throws(() => JSON.parse(inner), /Expected ',' or/);
  const innerFixed = parseModelJson(inner);
  assert.deepEqual(innerFixed.json, { q: 'Használd a „mállás" és a „talajréteg" szavakat!', r: 1 });
  assert.deepEqual(innerFixed.repairs, ["sztringen belüli idézőjel escape-elve", "sztringen belüli idézőjel escape-elve"]);
  const paren = '{"d":"Hiányos állítás (pl. „A szél eróziót okoz") javítása."}';
  assert.deepEqual(parseModelJson(paren).json, { d: 'Hiányos állítás (pl. „A szél eróziót okoz") javítása.' });
  // Hiányzó vessző két mező között NEM javul össze egyetlen mezővé: az eredeti hiba bukik.
  assert.throws(() => parseModelJson('{"a":"x" "b":"y"}'), SyntaxError);
  assert.throws(() => parseModelJson('{"a":"x"\n"b":"y"}'), SyntaxError);
  // Amit nem lehet biztonságosan helyreállítani, az az EREDETI hibával bukik — nem találunk ki tartalmat.
  assert.throws(() => parseModelJson('{"a":}'), SyntaxError);
  assert.throws(() => parseModelJson('{"a":"csonka'), SyntaxError);
  assert.throws(() => parseModelJson('{"a":1,,"b":2}'), SyntaxError);
});

// Spec §7o/2 (mérve, 6–7. mérés): a puszta hossz nem mondta meg, csonka válasz vagy hibás sorosítás
// volt-e — a szerkezeti leírás ezt megkülönbözteti, tartalom kiadása nélkül.
test("a hibás JSON leírása szerkezeti tény: hossz, lezártság, hibapozíció — tartalom nélkül", () => {
  const broken = '{"a":"x" "b":2}';
  let shape = "";
  try { JSON.parse(broken); } catch (error) { shape = jsonFailureShape(broken, error); }
  assert.match(shape, /^15 karakter, lezárt, de középen hibás \(a modell sorosítása\), \d+\. pozíció$/);
  assert.doesNotMatch(shape, /"a"|"b"|x/, "a szöveg tartalma nem kerül a hibaüzenetbe");
  const truncated = '{"a":"hosszú érték", "b":[1,2,3';
  try { JSON.parse(truncated); } catch (error) { assert.match(jsonFailureShape(truncated, error), /csonka vagy nem JSON alakú/); }
  const prose = "Íme a csomag: nincs benne JSON.";
  try { JSON.parse(prose); } catch (error) { assert.match(jsonFailureShape(prose, error), /csonka vagy nem JSON alakú/); }
});

// Spec §7o (mérve, 5. mérés): az SDK kliens-timeoutja a fejlécekig él; a törzs olvasását csak a külső
// AbortSignal-határidő szakítja meg — ez minden szabályzatos lépésnek jár, nem csak a lektornak.
test("a bank/animátor kérés külső határidőt kap, amely a törzs olvasását is megszakítja (időtúllépés okkal)", async t => {
  withEnv(t, { OPENROUTER_API_KEY: "test-placeholder" });
  assert.equal(stepDeadlineMs("animator"), STUDIO_STEP_POLICY.animator.timeoutMs);
  assert.equal(stepDeadlineMs("bank"), STUDIO_STEP_POLICY.bank.timeoutMs);
  assert.equal(stepDeadlineMs("author"), undefined, "szabályzat nélküli lépésnek nincs külső határideje");
  const controller = new AbortController();
  let timeoutMs: number | undefined;
  t.mock.method(AbortSignal, "timeout", (ms: number) => { timeoutMs = ms; return controller.signal; });
  t.mock.method(globalThis, "fetch", async (_url: unknown, init?: RequestInit) => {
    controller.abort(new DOMException("A határidő lejárt", "TimeoutError"));
    assert.ok(init?.signal?.aborted, "a jelzés a kérésre van kötve");
    throw new DOMException("aborted", "AbortError");
  });
  const provider = createStudioStepProvider("z-ai/glm-5.3-flash", "animator");
  await assert.rejects(callStepModel(provider, { step: "animator", model: provider.model, system: "S", user: "U" }),
    (error: unknown) => error instanceof Error && error.cause instanceof AIProviderTimeoutError);
  assert.equal(timeoutMs, 240_000);
});

test("a lektor szabályzata változatlan; szabályzat nélküli lépés (author) nem kap effortot", async t => {
  withEnv(t, { OPENROUTER_API_KEY: "test-placeholder", AI_INTEGRATIONS_OPENAI_API_KEY: "test-placeholder" });
  assert.equal(STUDIO_STEP_POLICY.author, undefined);
  let body: Record<string, unknown> | undefined;
  t.mock.method(globalThis, "fetch", async (_url: unknown, init?: RequestInit) => {
    body = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content: "{}" }, finish_reason: "stop" }] }), { headers: { "Content-Type": "application/json" } });
  });
  await createStudioStepProvider("gpt-5.6-terra", "author").chat([{ role: "user", content: "x" }]);
  assert.equal(body?.reasoning, undefined);
  assert.equal(body?.reasoning_effort, undefined);
  assert.equal(body?.response_format, undefined, "szabályzat nélküli lépés JSON-módot sem kap");
});

test("studioConnection: az anthropic vendor a saját kulcsát kéri", () => {
  assert.throws(() => studioConnection("claude-opus-5", {}), /AI_INTEGRATIONS_ANTHROPIC_API_KEY/);
  const c = studioConnection("claude-opus-5", { AI_INTEGRATIONS_ANTHROPIC_API_KEY: "k" });
  assert.equal(c.vendor, "anthropic");
  assert.equal(c.model, "claude-opus-5");
});
