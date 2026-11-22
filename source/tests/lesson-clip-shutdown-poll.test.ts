import { test } from "node:test";
import assert from "node:assert/strict";
import { ClipAbortError } from "../server/lesson-clips";
import { abortClipTranscodes, clipProviders, type ProviderTransport } from "../server/lesson-clips-providers";

// 2. vak kör L2 (docs/specs/2026-11-10-kisfilm-memoria-vegrehajtas.md): a leállítás a szolgáltatói várakozást is megszakítja (nem csak
// a futó ffmpeg-et), így a kör — és vele az advisory lock DB-kapcsolata — a pool lezárása előtt felszabadul. Külön tesztfájl (külön
// folyamat), mert a leállítás a modul állapotát véglegesen átállítja. Hálózat nincs: a fetch csonkolt.

test("leállítás: a mozgókép-lekérdezés várakozása azonnal megszakad, és megszakításként (nem állóképként) jelez", async () => {
  const realFetch = globalThis.fetch;
  const signals: AbortSignal[] = [];
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    if (init?.signal) signals.push(init.signal);
    return new Response(JSON.stringify({ status: "in_progress", polling_url: "/api/v1/videos/1" }), { status: 200 });
  }) as typeof fetch;
  try {
    // A lekérdezés is a csonkolt fetch-re megy, valódi DNS nélkül.
    const transport: ProviderTransport = { lookup: async () => [{ address: "104.18.2.115", family: 4 }], send: (url, _address, init) => fetch(url, { ...init, redirect: "manual" }) };
    const deps = clipProviders({ openRouter: "k" }, transport);
    const started = Date.now();
    const video = deps.video!({ bytes: Buffer.from("x"), mime: "image/jpeg" }, "p", 5);
    await new Promise((r) => setTimeout(r, 50));
    abortClipTranscodes();
    await assert.rejects(video, ClipAbortError);
    assert.ok(Date.now() - started < 2000, `a 6 mp-es lekérdezési várakozás nem tartja fel a leállást (${Date.now() - started} ms)`);
    assert.ok(signals.length > 0 && signals.every((s) => s.aborted), "a szolgáltatói kérések a leállítás jelét kapják");
    await assert.rejects(deps.image("p"), ClipAbortError, "leállítás után új szolgáltatói hívás megszakításként zárul");
  } finally {
    globalThis.fetch = realFetch;
  }
});
