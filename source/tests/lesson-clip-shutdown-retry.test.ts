import { test } from "node:test";
import assert from "node:assert/strict";
import { ClipAbortError } from "../server/lesson-clips";
import { CLIP_BAND_STYLE } from "../shared/clip-style";
import { abortClipTranscodes, clipProviders } from "../server/lesson-clips-providers";

// I/O-osztály leltár (docs/specs/2026-11-10-kisfilm-memoria-vegrehajtas.md): a hangszolgáltató torlódás (HTTP 429) utáni várakozása is
// a leállítás jelére azonnal megszakad. Külön tesztfájl (külön folyamat), mert a leállítás a modul állapotát véglegesen átállítja.
// Hálózat nincs: a fetch csonkolt.

test("leállítás: a 429 utáni újrapróbára várakozás azonnal megszakad, újabb kérés nem indul", async () => {
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => { calls++; return new Response("torlódás", { status: 429 }); }) as typeof fetch;
  try {
    const deps = clipProviders({ openRouter: "k", elevenLabs: "e" });
    const speech = deps.speech!("szöveg", CLIP_BAND_STYLE.adventure.voice);
    while (!calls) await new Promise((r) => setTimeout(r, 1));
    const started = Date.now();
    abortClipTranscodes();
    await assert.rejects(speech, ClipAbortError);
    assert.ok(Date.now() - started < 1000, `a 2,5 s-os várakozás nem tartja fel a leállást (${Date.now() - started} ms)`);
    assert.equal(calls, 1, "a leállítás után nincs újabb kérés");
  } finally {
    globalThis.fetch = realFetch;
  }
});
