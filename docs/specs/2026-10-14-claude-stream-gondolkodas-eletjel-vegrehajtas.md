# Végrehajtás — Claude-stream gondolkodás-életjel

Spec: `docs/specs/2026-10-14-claude-stream-gondolkodas-eletjel.md`. Munkakönyvtár: `source/`.

1. `server/ai/ClaudeProvider.ts`
   - Új modul-szintű függvény: `streamThinking(model, thinking)`:
     - ha `thinking` objektum (`type: 'adaptive'`) → `{ ...thinking, display: 'summarized' }`;
     - különben ha `model` illeszkedik `/^claude-(opus|sonnet|fable)-5/` → `{ type: 'adaptive', display: 'summarized' }`;
     - különben `undefined`.
   - `chatStreamed` elején: `const thinking = streamThinking(params.model, params.thinking)`, és a `messages.stream` hívás
     paramétere `thinking ? { ...params, thinking } : params`.
   - Az eseményfordító generátorban a `{}` helyett aktivitás (`{ activity: true }`), ha:
     `content_block_delta` + `thinking_delta` vagy `signature_delta`;
     `content_block_start` + `content_block.type` ∈ {`thinking`, `redacted_thinking`};
     `content_block_stop`. Minden más esemény `{}` marad.
   - A `chatStreamed` doc-kommentje: a summarized-indok és az SDK ping-eldobás (forrás: `core/streaming.js`).
2. `tests/claude-stream-thinking-liveness.test.ts` (új), fetch-mock SSE-vel (a `tests/review-190.test.ts` mintája):
   - T1 (A1+A3): `claude-opus-5-5`, effort nélkül; események: `message_start`, `content_block_start` thinking, 6×
     `thinking_delta` 30 ms szünettel, `signature_delta`, `content_block_stop`, text blokk + `text_delta` "kész",
     `message_delta` (stop_reason end_turn), `message_stop`; idleMs 80 (össz-idő > 80 ms). Elvárás: `content === "kész"`,
     a kérés-törzs `thinking` mezője `{ type: "adaptive", display: "summarized" }`.
   - T2 (A3, display nélkül is): csak blokk-kezdet / aláírás / blokk-vég 50 ms-onként (idleMs 80, össz > 80 ms) → siker.
   - T3 (A4): `message_start`, `content_block_start` thinking, majd 5× `ping` 30 ms-onként, utána néma → `AIProviderIdleTimeoutError`.
   - T4 (A2): `reasoningEffort: "high"` → `thinking.display === "summarized"`, `output_config.effort === "high"`.
   - T5 (A6): `claude-3-5-haiku-latest`, effort nélkül → a törzsben nincs `thinking`.
2b. `tests/studio-provider-policy.test.ts` (pedagógus-teszt): `assert.deepEqual(captured?.thinking, { type: "adaptive" })` →
    `{ type: "adaptive", display: "summarized" }`, spec-hivatkozó kommenttel (dokumentált spec-változás, A5).
3. Ellenőrzés (`source/`):
   - `npm.cmd run check` → 0 hiba
   - `npm.cmd run check:test` → 0 hiba
   - `npm.cmd run lint` → 0 hiba, 0 warning
   - `node --import tsx --test tests/claude-stream-thinking-liveness.test.ts tests/review-190.test.ts tests/stream-collect.test.ts` → mind pass
   - `npm.cmd test` → teljes suite pass
4. Atomi commit a feature branchen (push nincs kérve).
