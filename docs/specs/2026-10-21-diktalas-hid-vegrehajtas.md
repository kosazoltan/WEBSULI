# Diktálás-híd — végrehajtás (AI-ügynöknek)

Terv: `docs/specs/2026-10-21-diktalas-hid.md`.

1. **`server/lib/speech-bridge.ts` (új):** `SPEECH_BRIDGE_SCRIPT` — csak keretben települ; `start` → `websuli-sr:start` (lang,
   continuous, interimResults, maxAlternatives); a szülő `ack` / `started` / `result` / `error` / `end` üzenetei natív eseményekké;
   2,5 s nyugta nélkül natív próba, különben `service-not-allowed` + `end`.
2. **`server/routes.ts`:** a híd a `<head>` elejére (teljes dokumentum és sablon); a globális segéd hibája látható üzenet (`showNote`).
3. **`client/src/lib/speech-bridge-host.ts` (új):** `useSpeechBridgeHost(iframeRef, materialOrigin)` — forrás-ellenőrzés, nyugta,
   valódi felismerés, `serializeResults`; `client/src/pages/Preview.tsx` bekötve.
4. **Teszt:** `tests/diktalas-hid.test.ts` (a szkript valódi futtatása szimulált keretben; a főoldali szerializálás).
