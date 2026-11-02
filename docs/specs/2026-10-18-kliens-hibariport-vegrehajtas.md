# Böngészős hibajelentés — végrehajtási utasítás (ügynöknek)

Terv: `docs/specs/2026-10-18-kliens-hibariport.md`. Munkakönyvtár: `source/`. Ág: `fix/kliens-hibariport`.

1. **`server/routes/error-report.ts`:** a `MAX_LENGTHS` exportálása (`export const`); más változás nincs.
2. **`server/routes/client-error.ts` (új):**
   - **Gyár:** `createClientErrorRouter({ reportSender?, dailyCap? = 200, now? = () => new Date() })`.
   - **Middleware-sor:**
     1. `enforceOriginAllowlist` (`../lib/origin-guard`);
     2. `rateLimit` (60 s, max 10, JSON-üzenet);
     3. napi plafon: a kulcs a budapesti nap (`Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Budapest' })`);
        napváltáskor a számláló nullázódik; ha `count >= dailyCap` → 429 `{ error: "daily cap reached" }`;
     4. a kezelő.
   - **A kezelő:**
     - `message`: string, vágva; üres → 400;
     - `errorType`: regex-őr, különben `"ClientError"`;
     - `stack`, `url`: vágva;
     - `browser`: a `user-agent`-ből;
     - `breadcrumbs`: tömb, legfeljebb 50 elem; az az elem marad meg, amelynek `JSON.stringify`-hossza legfeljebb
       500, a többi kimarad;
     - `requestId`: `req.requestId`;
     - `requestMethod`: nincs;
     - `userId` / `userEmail`: csak a `req.isAuthenticated?.()` és a `req.user` esetén, a munkamenetből;
     - `environment`: `process.env.NODE_ENV ?? "production"`.
     - A számláló a sikeres validálás után, a küldés előtt nő; a plafon tehát a validált jelentésekre vonatkozik.
     - A siker 202 `{ ok: true }`, a hiba 500 (`logger.error`).
   - **Alapértelmezett export:** `createClientErrorRouter()`.
3. **`server/index.ts`:** import, és a `/api/error-report` sor alá `app.use("/api/client-error", clientErrorRouter);`.
4. **`client/src/components/ErrorReporter.tsx`:**
   - a `reportError` a `fetch("/api/client-error", { method: "POST", credentials: "same-origin", keepalive: true, headers: { "Content-Type": "application/json" }, body })`-t hívja;
   - az `apiRequest`-import törlése, ha másutt nem kell;
   - a #127-es megjegyzés helyére a rövid leírás;
   - a `userId` / `userEmail` / `requestBody` a payloadban maradhat típus szinten, de a szerver eldobja.
   - A törzs mérete: a breadcrumbs már 50-re korlátozott.
5. **`tests/client-error-route.test.ts` (új, HTTP-szintű, mint az `error-report-hmac.test.ts`):**
   - `app.set('trust proxy', 1)` nélkül;
   - same-origin Origin → 202, és a küldő a megtisztított payloadot kapja (`userEmail` a törzsből NEM megy át,
     `environment` = szerver);
   - idegen Origin → 403, a küldő nem fut;
   - sem Origin, sem Referer → 403;
   - üres üzenet → 400;
   - `dailyCap: 2` → a 3. kérés 429, a küldő kétszer fut;
   - napváltás (`now` injektálva, budapesti éjfél után) → újra 202;
   - 60 breadcrumb → 50 megy át, a túl hosszú elem kimarad;
   - rossz `errorType` (`"<script>"`) → `"ClientError"`;
   - forrás-őr: az `ErrorReporter.tsx` a `/api/client-error`-t hívja, és nincs benne `/api/error-report`.
6. **Ellenőrzés:**
   - `npm.cmd run check`, `npm.cmd run check:test`, célzott eslint;
   - a két célzott teszt, majd `npm.cmd test` és `npm.cmd run build`;
   - böngészős próba helyi szerveren (`WEBSULI_E2E=1` eldobható DB): a konzolban kiváltott hiba → a hálózati fülön
     `/api/client-error` 202.
7. **Reverz mutáció:** a plafon-ellenőrzés törlése → a 429-es teszt bukjon; az origin-őr kivétele → a 403-as teszt bukjon.
