import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { ClipAbortError } from "../server/lesson-clips";
import { abortClipTranscodes, CLIP_TMP_PREFIX, clipProviders, type ProviderTransport } from "../server/lesson-clips-providers";

// 4. vak kör L2 (docs/specs/2026-11-10-kisfilm-memoria-vegrehajtas.md): a leállítás a függő DNS-feloldást is megszakítja — a jelenet
// azonnal megszakításként zárul, kérés nem indul, a munkamappa törlődik. Külön tesztfájl (külön folyamat), mert a leállítás a modul
// állapotát véglegesen átállítja. Valódi DNS és hálózat nincs: a szállítás és a fetch csonkolt.

test("leállítás: a letöltés függő DNS-feloldása azonnal megszakad, kérés nem indul, a munkamappa törlődik", async () => {
  const realFetch = globalThis.fetch;
  let sent = 0, lookups = 0;
  const transport: ProviderTransport = {
    lookup: () => { lookups++; return new Promise(() => undefined); },
    send: async () => { sent++; return new Response("x"); },
  };
  globalThis.fetch = (async () => new Response(JSON.stringify({ status: "completed", polling_url: "/api/v1/videos/1", unsigned_urls: ["https://cdn.example/v.mp4"] }), { status: 200 })) as typeof fetch;
  const own = () => readdirSync(tmpdir()).filter((name) => name.startsWith(`${CLIP_TMP_PREFIX}${process.pid}-`));
  try {
    const deps = clipProviders({ openRouter: "k" }, transport);
    const video = deps.video!({ bytes: Buffer.from("x"), mime: "image/jpeg" }, "p", 5);
    while (!lookups) await new Promise((r) => setTimeout(r, 1));
    assert.equal(own().length, 1, "a letöltés munkamappája létrejött");
    const started = Date.now();
    abortClipTranscodes();
    await assert.rejects(video, ClipAbortError);
    assert.ok(Date.now() - started < 2000, `a függő DNS nem tartja fel a leállást (${Date.now() - started} ms)`);
    assert.equal(sent, 0, "kérés nem indult");
    assert.deepEqual(own(), [], "a munkamappa törlődött");
  } finally {
    globalThis.fetch = realFetch;
  }
});
