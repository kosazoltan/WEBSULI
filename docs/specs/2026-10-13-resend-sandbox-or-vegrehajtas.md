# Resend sandbox-feladó őr — végrehajtási utasítás (AI-olvasható)

Spec: `docs/specs/2026-10-13-resend-sandbox-or.md`. Munkakönyvtár: `source/`. Éles DB-írás és e-mail küldés TILOS.
Sorrend kötelező; minden lépés után a megadott parancs.

## 1. `server/lib/resend-sender.ts` (új, tiszta)
- `export const RESEND_SANDBOX_DOMAIN = "resend.dev";`
- `export function extractSenderAddress(from: string): string | null` — trim; ha `<...>` van, annak tartalma, különben a
  teljes szöveg; trim + kisbetű; csak ha `/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/` illik, különben `null`.
- `export function checkResendSender(from: string): { ok: true } | { ok: false; reason: string }`:
  - `extractSenderAddress` `null` → `{ ok:false, reason: "RESEND_FROM_EMAIL érvénytelen (pl. WEBSULI <noreply@websuli.vip>)" }`.
  - domain (`@` utáni rész) `=== "resend.dev"` vagy `.endsWith(".resend.dev")` →
    `{ ok:false, reason: "RESEND_FROM_EMAIL a Resend teszt-feladója (resend.dev) — csak a fiók saját címére kézbesít. Állítsd hitelesített domainre: WEBSULI <noreply@websuli.vip>" }`.
  - egyébként `{ ok: true }`.
Ellenőrzés: 4. lépés tesztje.

## 2. `server/resend.ts`
- Import: `import { checkResendSender } from "./lib/resend-sender";`
- `isResendConfigured()`: a `configuredFrom` üres-ág után: `const sender = checkResendSender(configuredFrom); if (!sender.ok) return { ok: false, reason: sender.reason };`
- `getResendClient()`: a `fromEmail` üres-ellenőrzés után ugyanez, `throw new Error(sender.reason)`; a `resendClient`
  hozzárendelés kerüljön a validálások UTÁN (hibás konfignál ne maradjon cache-elt kliens).
Ellenőrzés: `npm.cmd run check`.

## 3. `client/src/components/EmailDiagnosticsPanel.tsx`
- A „NINCS megfelelően konfigurálva” ág útmutatója: `RESEND_FROM_EMAIL` hitelesített domainnel, pl. `WEBSULI <noreply@websuli.vip>`.
- Új: `const recentWindow = data.recentLogs.slice(0, 5); const allRecentFailed = recentWindow.length >= 3 && recentWindow.every(l => l.status === "failed");`
  (a `data` megléte után, a Resend kártya alatt). Ha igaz: piros kártya „Az utolsó N küldés mind sikertelen” + a
  `recentWindow[0].error` szövege + `data-testid="alert-recent-failures"`.
Ellenőrzés: `npm.cmd run check`; `npx.cmd eslint client/src/components/EmailDiagnosticsPanel.tsx server/resend.ts server/lib/resend-sender.ts`.

## 4. `tests/resend-sender.test.ts` (új, `node:test` + `node:assert/strict`)
- ok: `WEBSULI <noreply@websuli.vip>`, `noreply@websuli.vip`, `x@notresend.dev`, `x@resend.dev.example.com`.
- sandbox (reason tartalmazza `resend.dev` és `websuli.vip`): `WebSuli <onboarding@resend.dev>`, `ONBOARDING@RESEND.DEV`, `x@mail.resend.dev`.
- érvénytelen: `WebSuli`, `<>`, `a@b`.
- `extractSenderAddress("Név <A@B.hu>") === "a@b.hu"`.
Ellenőrzés: `node --import tsx --test tests/resend-sender.test.ts` → minden pass.

## 5. Verifikáció
- `npm.cmd run check` → 0 hiba; célzott eslint → 0 error.
- Helyi szerver + admin Email diagnosztika panel a böngészőben: Resend „OK — feladó: WEBSULI <noreply@websuli.vip>”,
  nincs `alert-recent-failures` (vannak friss `sent` sorok). Ideiglenes `RESEND_FROM_EMAIL=WebSuli <onboarding@resend.dev>`-vel
  a `isResendConfigured()` kimenetét tsx egysorossal ellenőrizni (szerver indítása nélkül).
- Commit, PR — merge csak kérésre.
