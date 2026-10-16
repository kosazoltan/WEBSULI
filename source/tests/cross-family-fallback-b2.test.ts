import test from "node:test";
import assert from "node:assert/strict";
import { openAiPartsToClaude } from "../server/studio/claude-vision";

/*
 * Spec 2026-10-14-tartalek-b-szelet (B2, tulajdonosi döntés): a tantárgy-felismerés és a kivonatoló ellentétes családú
 * tartaléka — OpenAI → Opus 5.5 (medium), ugyanazokkal a forrásrészekkel (kép, PDF, szöveg) Claude-blokkként.
 */

const PNG = "data:image/png;base64,iVBORw0KGgo=";
const PDF = "data:application/pdf;base64,JVBERi0xLjQ=";

test("openAiPartsToClaude: szöveg → text, kép → image, PDF → document; nem data URL → hiba (nincs csendes kihagyás)", () => {
  const blocks = openAiPartsToClaude([
    { type: "text", text: "Forrás" },
    { type: "image_url", image_url: { url: PNG, detail: "high" } },
    { type: "file", file: { filename: "lap.pdf", file_data: PDF } },
  ]);
  assert.deepEqual(blocks[0], { type: "text", text: "Forrás" });
  assert.deepEqual(blocks[1], { type: "image", source: { type: "base64", media_type: "image/png", data: "iVBORw0KGgo=" } });
  assert.deepEqual(blocks[2], { type: "document", source: { type: "base64", media_type: "application/pdf", data: "JVBERi0xLjQ=" } });
  assert.throws(() => openAiPartsToClaude([{ type: "image_url", image_url: { url: "https://example.org/kep.png" } }]), /nem base64 data URL/);
});

// S4b (docs/specs/2026-10-16-egy-futas.md): a callScopeModel / scopeAnswerUsable (tantárgy-felismerő hívás és tartaléka) kivezetve — az esetei törölve.
