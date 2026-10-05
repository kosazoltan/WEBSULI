import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { OCR_FUSION_DECIDER, OCR_FUSION_READERS } from "../server/ai/models";
import {
  callClaudeOcr,
  fuseOcrReadings,
  fusionOcr,
  ocrFusionDisputes,
  ocrRequestParams,
  ocrVendorRequest,
  parseFusionChoices,
  UNCERTAIN_MARK,
  type ClaudeMessagesClient,
  type OcrFusionChoice,
} from "../server/studio/ocr";

/* Spec 2026-10-05-s11/7 (tulajdonosi döntés): két erős olvasó (A = gpt-6.1-sol high, B = claude-opus-5-5 medium), a döntő a
   fúziójuk. A fúziós lépés vitánként CSAK választ (A | B | own); a végső szöveget a kód rakja össze — a vitákon kívül semmi nem
   változhat. own → jel; hiányzó/érvénytelen döntés → az A alakja jellel; olvasó-kiesés → a másik + szótár-őr, degraded. */

const file = { name: "lap.jpg", kind: "image", content: "data:image/jpeg;base64,AA==" } as never;
const strip = (s: string) => s.split(UNCERTAIN_MARK).join("");

test("S11/7: a modellkonfiguráció — A = gpt-6.1-sol high, B = claude-opus-5-5 medium, döntő = gpt-6.1-sol high", () => {
  assert.deepEqual(OCR_FUSION_READERS.map((r) => `${r.model}:${r.effort}`), ["gpt-6.1-sol:high", "claude-opus-5-5:medium"]);
  assert.deepEqual(OCR_FUSION_DECIDER, { model: "gpt-6.1-sol", effort: "high" });
});

test("S11/7: a fúzió a vitákon kívül semmit nem írhat át — a döntő „szándékos” rontása (nem létező sorszám, más szöveg) hatástalan", () => {
  // A mért eset mintájára: a döntő a vitán kívüli sort „javítaná” („A világ [olvashatatlan] 1260” → „II. világháború 1939”).
  const a = "A világ [olvashatatlan] 1260\nÁzsia, Közel - Kelet térsége\nlépcsőzetes toronytemplom: zikkurat";
  const b = "A világ [olvashatatlan] 1260\nÁzsia, Közel - Kelet térsége\nlépkézetes toronytemplom: zikkurat";
  const disputes = ocrFusionDisputes(a, b);
  assert.deepEqual(disputes.map((d) => [d.n, d.a, d.b]), [[1, "lépcsőzetes", "lépkézetes"]]);
  assert.equal(disputes[0].line, "lépcsőzetes toronytemplom: zikkurat", "a döntő a hely sorát is látja");
  const hostile: OcrFusionChoice[] = [
    { n: 2, pick: "own", text: "II. világháború 1939" },
    { n: 0, pick: "B" },
    { n: 1, pick: "A", text: "II. világháború 1939\nÁzsia a Föld keleti térsége" },
  ];
  assert.equal(fuseOcrReadings(a, b, hostile).text, a, "csak az 1. vita dönthető, és ott az A maradt");
  // own a vitán: a teljes oldal „átírása” is csak a vita helyére kerül, minden új szava jelölt; a vitán kívüli sorok bájtra az A.
  const own = fuseOcrReadings(a, b, [{ n: 1, pick: "own", text: "II. világháború 1939 Ázsia" }]).text;
  const [l1, l2, l3] = own.split("\n");
  assert.equal(l1, "A világ [olvashatatlan] 1260");
  assert.equal(l2, "Ázsia, Közel - Kelet térsége");
  assert.equal(l3, `II.${UNCERTAIN_MARK} világháború${UNCERTAIN_MARK} 1939${UNCERTAIN_MARK} Ázsia${UNCERTAIN_MARK} toronytemplom: zikkurat`);
});

test("S11/7: a döntés A / B szerint cserél; a B saját tördelése (soremelés) megmarad; az írásjel-eltérés nem vita (A marad)", () => {
  const a = "1. élén: papkirályok\n2. Előkelők: papok és határak\n→ parasztok";
  const b = "1. élén: papkirályok\n2. Előkelők: papok és katonák\nparasztok";
  const disputes = ocrFusionDisputes(a, b);
  assert.deepEqual(disputes.map((d) => [d.a, d.b]), [["határak", "katonák"]], "a nyíl-eltérés nem kerül a döntő elé");
  assert.equal(fuseOcrReadings(a, b, [{ n: 1, pick: "B" }]).text, "1. élén: papkirályok\n2. Előkelők: papok és katonák\n→ parasztok");
  assert.equal(fuseOcrReadings(a, b, [{ n: 1, pick: "A" }]).text, a);
  // egyoldalú vita (a B egy egész sorral több): a B választásánál a sor a saját soremelésével kerül be
  const a2 = "Mezopotámia\nTigris és Eufrátesz";
  const b2 = "Mezopotámia\nfolyóköz\nTigris és Eufrátesz";
  assert.equal(fuseOcrReadings(a2, b2, [{ n: 1, pick: "B" }]).text, b2);
  assert.equal(fuseOcrReadings(a2, b2, [{ n: 1, pick: "A" }]).text, a2);
});

test("S11/7: own → a saját alak minden új (egyik olvasatban sem szereplő) szava ⟦?⟧; ha nincs új szó, a szakasz vége", () => {
  const a = "Ázsia, Kesia térsége";
  const b = "Ázsia, Közel-Kelet térsége";
  const out = fuseOcrReadings(a, b, [{ n: 1, pick: "own", text: "Közel Kelet" }]).text;
  assert.equal(out, `Ázsia, Közel${UNCERTAIN_MARK} Kelet${UNCERTAIN_MARK} térsége`);
  // a két olvasat szavaiból összerakott, de egyikkel sem egyező alak is bizonytalan
  const a2 = "papok és határak katonák";
  const b2 = "papok és katonák határak";
  const mixed = fuseOcrReadings(a2, b2, [{ n: 1, pick: "own", text: "határak határak" }]).text;
  assert.ok(mixed.includes(UNCERTAIN_MARK), mixed);
  // own, amely szó szerint az egyik olvasat → nincs jel
  assert.equal(fuseOcrReadings(a, b, [{ n: 1, pick: "own", text: "Közel-Kelet" }]).text, b);
  // a döntő saját ⟦?⟧ jele megmarad
  assert.match(fuseOcrReadings(a, b, [{ n: 1, pick: "own", text: "Közel-Kelet⟦?⟧" }]).text, /Kelet⟦\?⟧ térsége$/);
});

test("S11/7: hiányzó / érvénytelen / ütköző döntés → az A alakja ⟦?⟧-lel (konzervatív)", () => {
  const a = "a fáraók uralkodási évének kezdetétől";
  const b = "a Nílus áradási éveinek kezdetétől";
  const expected = `a fáraók${UNCERTAIN_MARK} uralkodási${UNCERTAIN_MARK} évének${UNCERTAIN_MARK} kezdetétől`;
  assert.equal(fuseOcrReadings(a, b, []).text, expected, "nincs döntés");
  assert.equal(fuseOcrReadings(a, b, [{ n: 1, pick: "own", text: "  " }]).text, expected, "üres own");
  assert.equal(fuseOcrReadings(a, b, [{ n: 1, pick: "C" as never }]).text, expected, "ismeretlen pick");
  assert.equal(fuseOcrReadings(a, b, [{ n: 1, pick: "A" }, { n: 1, pick: "B" }]).text, expected, "ütköző ismétlés");
  // üres A-oldal (a B többet olvasott), döntés nélkül: az A szövege nem bővül, de a hely jelölt
  const gap = fuseOcrReadings("Mezopotámia\nTigris", "Mezopotámia\nfolyóköz\nTigris", []).text;
  assert.equal(strip(gap).replace(/\s+/g, " ").trim(), "Mezopotámia Tigris");
  assert.ok(gap.includes(UNCERTAIN_MARK));
  // a statisztika
  assert.deepEqual(fuseOcrReadings(a, b, []).stats, { A: 0, B: 0, own: 0, missing: 1 });
});

test("S11/7: a döntő JSON-ja toleránsan olvasva; hibás szerkezet → hiba (a hívó degraded-del kezeli)", () => {
  assert.deepEqual(parseFusionChoices('```json\n{"choices":[{"n":1,"pick":"B"},{"n":2,"pick":"own","text":"x"},{"n":3,"pick":"?"}]}\n```'),
    [{ n: 1, pick: "B" }, { n: 2, pick: "own", text: "x" }]);
  assert.throws(() => parseFusionChoices("nem json"));
  assert.throws(() => parseFusionChoices('{"lines":[]}'));
});

test("S11/7: két olvasó → fúzió; nincs vita → A, döntő hívás nélkül; a döntő az A-t, a B-t és a sorszámozott vitákat kapja", async () => {
  let decided = 0;
  const same = fusionOcr(async () => "Ázsia, Közel-Kelet térsége", async () => "Ázsia, Közel-Kelet térsége", async () => { decided++; return []; });
  assert.equal(await same(file), "Ázsia, Közel-Kelet térsége");
  assert.equal(decided, 0);
  assert.equal(same.degraded(file), false);
  let seen: unknown;
  const ocr = fusionOcr(async () => "papok és határak", async () => "papok és katonák", async (_f, a, b, disputes) => { seen = { a, b, disputes }; return [{ n: 1, pick: "B" }]; });
  assert.equal(await ocr(file), "papok és katonák");
  assert.deepEqual(seen, { a: "papok és határak", b: "papok és katonák", disputes: [{ n: 1, a: "határak", b: "katonák", line: "papok és határak" }] });
  assert.equal(ocr.degraded(file), false);
});

test("S11/7: olvasó-kiesés → a másik olvasat egyedül + szótár-őr, degraded; mindkettő kiesik → hiba; döntő-hiba → A jellel, degraded", async () => {
  let decided = 0;
  const guardSeen: string[] = [];
  const guard = { lexicon: async () => { guardSeen.push("lexicon"); return (w: string) => w !== "Kesia"; } };
  const dropA = fusionOcr(async () => { throw new Error("429"); }, async () => "Kesia térsége", async () => { decided++; return []; }, guard);
  assert.equal(await dropA(file), `Kesia${UNCERTAIN_MARK} térsége`, "a B olvasat megy tovább, a szótár-őr jelöl (nincs erős sor-olvasó)");
  assert.equal(dropA.degraded(file), true);
  assert.equal(decided, 0);
  assert.deepEqual(guardSeen, ["lexicon"], "a szótár-őr a kiesésnél is fut");
  const dropB = fusionOcr(async () => "Ázsia térsége", async () => "   ", async () => { decided++; return []; });
  assert.equal(await dropB(file), "Ázsia térsége");
  assert.equal(dropB.degraded(file), true);
  const both = fusionOcr(async () => { throw new Error("A down"); }, async () => { throw new Error("B down"); }, async () => []);
  await assert.rejects(both(file), /A down/);
  const deciderDown = fusionOcr(async () => "papok és határak", async () => "papok és katonák", async () => { throw new Error("timeout"); });
  assert.equal(await deciderDown(file), `papok és határak${UNCERTAIN_MARK}`);
  assert.equal(deciderDown.degraded(file), true, "átmeneti hiba → nem kerül cache-be");
  // a következő sikeres olvasás törli a degraded jelzést
  const ok = fusionOcr(async () => "x", async () => "x", async () => []);
  await ok(file);
  assert.equal(ok.degraded(file), false);
});

test("S11/7: a Claude-olvasó kérése — image blokk (base64), output_config.effort, adaptive thinking, modell; csak a szövegblokk számít", async () => {
  const keyName = "AI_INTEGRATIONS_ANTHROPIC_API_KEY";
  const before = process.env[keyName];
  process.env[keyName] = "test-placeholder";
  try {
    const calls: Record<string, unknown>[] = [];
    let stop = "end_turn";
    const client: ClaudeMessagesClient = { messages: { stream: (params) => {
      calls.push(params as unknown as Record<string, unknown>);
      return { finalMessage: async () => ({ stop_reason: stop, content: [{ type: "thinking", thinking: "…", signature: "s" }, { type: "text", text: " Ázsia, Közel-Kelet térsége " }] }) as never };
    } } };
    const text = await callClaudeOcr({ name: "lap.jpg", kind: "image", content: "data:image/jpeg;base64,QUJD" } as never, "claude-opus-5-5", "medium", client);
    assert.equal(text, "Ázsia, Közel-Kelet térsége");
    const p = calls[0] as { model: string; max_tokens: number; system: string; thinking: unknown; output_config: unknown; messages: { role: string; content: unknown[] }[] };
    assert.equal(p.model, "claude-opus-5-5");
    assert.deepEqual(p.output_config, { effort: "medium" });
    assert.deepEqual(p.thinking, { type: "adaptive" });
    assert.ok(!("budget_tokens" in (p.thinking as object)));
    assert.ok(p.max_tokens >= 16_000, "a gondolkodás nem csonkíthatja az átiratot");
    assert.match(p.system, /verbatim transcriber/, "ugyanaz az OCR-skill, mint az A-é");
    assert.deepEqual(p.messages[0].content[0], { type: "image", source: { type: "base64", media_type: "image/jpeg", data: "QUJD" } });
    // PDF → document blokk
    await callClaudeOcr({ name: "a.pdf", kind: "pdf", content: "data:application/pdf;base64,UERG" } as never, "claude-opus-5-5", "medium", client);
    assert.deepEqual((calls[1] as { messages: { content: unknown[] }[] }).messages[0].content[0], { type: "document", source: { type: "base64", media_type: "application/pdf", data: "UERG" } });
    // csonka válasz → hiba (nem kerülhet csonka átirat a forrásba)
    stop = "max_tokens";
    await assert.rejects(callClaudeOcr({ name: "lap.jpg", kind: "image", content: "data:image/jpeg;base64,QUJD" } as never, "claude-opus-5-5", "medium", client), /nem teljes/);
    // nem támogatott képformátum → hiba (a kiesés-ág kezeli)
    await assert.rejects(callClaudeOcr({ name: "lap.heic", kind: "image", content: "data:image/heic;base64,QUJD" } as never, "claude-opus-5-5", "medium", client), /nem támogatja/);
  } finally {
    if (before === undefined) delete process.env[keyName]; else process.env[keyName] = before;
  }
});

test("S11/7: az effort a kérésbe kerül (OpenAI: reasoning_effort, OpenRouter: reasoning); high → nagyobb kimeneti keret; a low változatlan", () => {
  const low = ocrRequestParams("gpt-6.1-sol", "data:image/jpeg;base64,AA");
  const high = ocrRequestParams("gpt-6.1-sol", "data:image/jpeg;base64,AA", "high");
  assert.equal(low.max_completion_tokens, 6000);
  assert.ok(high.max_completion_tokens >= 24_000, "a high gondolkodás ne csonkítsa az átiratot");
  assert.equal((ocrVendorRequest("openai", high) as { reasoning_effort?: string }).reasoning_effort, "high");
  assert.equal((ocrVendorRequest("openai", low) as { reasoning_effort?: string }).reasoning_effort, "low");
  assert.deepEqual((ocrVendorRequest("openrouter", high) as { reasoning?: unknown }).reasoning, { effort: "high" });
});

test("S11/7: createCachedSourceOcr — a fúzió az első ág, ha mindkét olvasó és a döntő kulcsa kész; saját cache-kulcs; különben a régi lánc", () => {
  const src = readFileSync(new URL("../server/studio/run-extraction.ts", import.meta.url), "utf8");
  const body = src.slice(src.indexOf("export async function createCachedSourceOcr"));
  const fusionAt = body.indexOf("[readerA.model, readerB.model, decider.model].every((m) => studioModelReady(m))");
  const strongAt = body.indexOf("if (strongReady && thirdModel !== ocrModel)");
  assert.ok(fusionAt > 0 && fusionAt < strongAt, "a fúzió a régi lánc előtt, kulcs-feltétellel");
  assert.match(body, /fusionOcr\(a, b, \(file, ra, rb, disputes\) => callOcrFusionDecider\(file, decider\.model, decider\.effort, ra, rb, disputes\), guard\)/);
  assert.match(body, /callOcrReader\(file, readerA\.model, readerA\.effort\)/);
  assert.match(body, /callOcrReader\(file, readerB\.model, readerB\.effort\)/);
  assert.match(body, /`fusion-2-strong\|/, "saját gyorsítótár-kulcs");
  assert.match(body, /createHash\("sha256"\)\.update\(OCR_FUSION_DECIDER_PROMPT\)/, "a döntő prompt hash-e a kulcsban");
  assert.match(body, /withOcrCache\(fused, fusionKey, store, \(file\) => !fused\.degraded\(file\)\)/, "degraded nem kerül cache-be");
});
