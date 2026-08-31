# WEBSULI — biztonsági és kódminőségi átfésülés (2026-08-31)

Teljes kódbázis-audit az iskolakezdés előtt: sebezhetőség-keresés és -javítás,
lint/typecheck rendbetétel, holt kód eltávolítása, függőség-frissítés.

## 1. Javított sebezhetőségek

| # | Terület | Probléma | Javítás |
|---|---------|----------|---------|
| S1 | CSRF | `/api/auth/*` **minden** metódusra ki volt véve a CSRF-védelem alól, `/api/login` és `/api/logout` pedig teljesen védtelen volt. Egy idegen oldal így a látogató böngészőjét bekényszeríthette a támadó session-jébe (login-CSRF), vagy némán kiléptethette. | A blanket-skip megszűnt (`/api/auth/*` csak GET, az OAuth callback nem is ezen az útvonalon fut). A login/logout mostantól **fail-closed Origin/Referer allowlisten** megy át (`enforceOriginAllowlist`), same-origin kérés mindig átmegy. |
| S2 | CSRF / konfiguráció | Az Origin-allowlist csak az opcionális `ALLOWED_ORIGINS` env-változót nézte, a CORS viszont a beépített produkciós domaineket — két külön igazságforrás. | Új `server/lib/allowed-origins.ts`: **egyetlen** allowlist, amit a CORS és az Origin-ellenőrzés is használ. Az env-értékek origin-re normalizálódnak, a duplikátumok kiesnek. |
| S3 | Session | `/api/logout` csak `req.logout()`-ot hívott: a session sor és a cookie életben maradt, egy ellopott session-azonosító kilépés után is használható volt. | `req.session.destroy()` + `res.clearCookie('connect.sid')`. |
| S4 | SSRF | `POST /api/push/subscribe` publikus, és a tárolt `endpoint` URL-t a szerver később maga hívja meg (web-push). Bárki beírhatott belső címet (pl. `169.254.169.254`), és az értesítés-küldés SSRF-primitívvé vált. | Új `server/lib/push-endpoint.ts`: csak HTTPS és csak a valódi böngésző-push szolgáltatók hosztjai (Mozilla/FCM/WNS/Apple), suffix-egyezéssel; a `p256dh`/`auth` kulcsok formátuma is validált. |
| S5 | PII-szivárgás | `GET /api/materials/:id/comments` (publikus) visszaadta a hozzászólók e-mail címét (`authorEmail`) és a bejelentkezett felhasználók `users.email` mezőjét. | Az e-mail mezők kikerültek a publikus válaszból. |
| S6 | DoS | Az `express.json({ limit: '150mb' })` **minden** végpontra vonatkozott, így bármely névtelen kliens kimeríthette a szerver memóriáját olcsó publikus route-okra küldött óriási body-val. | A 150MB-os limit csak az admin/AI útvonalakra (`/api/html-files`, `/api/ai/`, `/api/admin/`) érvényes, minden másra 1MB. |
| S7 | DoS / adatszivárgás | `GET /api/html-files/search` (publikus) a teljes `content` mezőt adta vissza 50 találatig — egy anyag akár 100MB base64 PDF. Ráadásul a nyers adatbázis-hibaüzenetet is visszaküldte. | Csak metaadat-oszlopok (mint `getAllHtmlFiles`), a keresőminta 200 karakterre vágva, generikus hibaüzenet. |
| S8 | Visszaélés | `/api/tts` publikus, korlátozás nélküli Google-TTS relay volt; a publikus komment-/like-írások sem voltak rate-limitelve. | `ttsLimiter` (60/15 perc) és `publicWriteLimiter` (100/15 perc). A landing page-en minden betöltéskor futó, csak-olvasó POST-ok (`likes/batch`, `likes/check`) kivételt kapnak, hogy a NAT mögötti iskolai IP-k ne ütközzenek limitbe. |
| S9 | Input-validáció | A like-végpontok korlátlan hosszúságú, tetszőleges tartalmú `fingerprint` sztringet írtak az adatbázisba; a batch-végpont a `materialIds` elemeit sem ellenőrizte. | `normalizeFingerprint()` (max 128 karakter, `[A-Za-z0-9._:-]`), a batch pedig csak string-típusú, max 64 karakteres id-ket fogad. |
| S10 | Kliens (CVE) | A pdf.js 3.x rávehető támadó által megadott JavaScript futtatására preparált PDF-betűtípuson keresztül (CVE-2024-4367). | `isEvalSupported: false` mindkét PDF-betöltési ponton (`ReactPdfViewer`, `EnhancedMaterialCreator`). |
| S11 | Modulrendszer | `require('web-push')` egy ESM-modulban. | Dinamikus `import()`. |

### Amit megnéztünk és rendben találtunk

- **SQL injection:** minden lekérdezés Drizzle-en keresztül, paraméterezve megy; nyers
  string-interpoláció nincs.
- **Path traversal:** a backup-fájlnevek `getSafeBackupPath()`-on mennek át (allowlist-regex
  + `BACKUP_DIR` prefix-ellenőrzés).
- **XSS a kliensen:** egyetlen `dangerouslySetInnerHTML` van (shadcn `chart.tsx`, generált
  CSS), `eval` / `new Function` / `document.write` sehol.
- **Admin-védelem:** az `adminRouter` egésze `isAuthenticatedAdmin` mögött van
  (`app.use('/api/admin', isAuthenticatedAdmin, adminRouter)`).
- **Titkok:** a repóban nincs valódi kulcs — a dokumentumokban csak placeholder és
  publikus SSH-kulcs szerepel.

### Nyitva maradt (tudatos döntés)

- **`/dev/:id`** az admin által feltöltött HTML-t sandbox nélkül, azonos originen szolgálja
  ki (`scriptSrcAttr: 'unsafe-inline'`). Ez az interaktív tananyagok működéséhez kell, és
  csak adminok tölthetnek fel anyagot. A session cookie `httpOnly`, így közvetlen
  session-lopásra nem használható.
- **`pdfjs-dist` 3.x / `@react-pdf-viewer` 3.x**: a `npm audit` maradék riasztásainak
  nagy része innen jön. A pdf.js főverzió-emelése töri a `@react-pdf-viewer` 3.x API-t,
  ezért egyelőre az S10 szerinti `isEvalSupported: false` mitigáció maradt; a viewer
  cseréje külön feladat.

## 2. Függőségek

`npm audit --omit=dev`: **47 → 28** sebezhetőség, **kritikus: 1 → 0**.

- Frissítve: `drizzle-orm` 0.45.2 (**SQL injection** rosszul escape-elt azonosítókon),
  `express-rate-limit` 8.7 (IPv4-mapped IPv6 bypass), `nanoid` 5.1.16, `ws` 8.21,
  `nodemailer` 9.0.6, `postcss` 8.5.26.
- `overrides`: `axios` 1.20.0, `tar` 7.5.22, `underscore` 1.13.8, `uuid` 11.1.1,
  `@xmldom/xmldom` 0.9.8.
- Eltávolítva 15 nem használt függőség (köztük a sérülékeny `adm-zip`, és a nagy méretű
  `googleapis`): `@jridgewell/trace-mapping`, `@react-pdf-viewer/toolbar`, `adm-zip`,
  `cookie-parser`, `googleapis`, `ioredis`, `memoizee`, `memorystore`, `next-themes`,
  `openid-client`, `react-icons`, `redis`, `tw-animate-css`, `@types/memoizee`,
  `@types/dompurify` — 68 csomaggal kevesebb a telepítésben.

## 3. Holt kód

- 14 hivatkozás nélküli kliens-fájl (`AdvancedPdfViewer`, `ChemicalBackground`,
  `CodeViewer`, `FileBackupManager`, `FileGrid`, `FlipCard`, `Header`, `HtmlFixer`,
  `LevelUpCelebration`, `PdfViewer`, `XPBar`, `useClassroomTheme`, `authUtils`,
  `lib/logger`).
- `server/routes.ts.backup` (3607 sor), `server/gmail.ts` (elavult csonk),
  `source/test-results/.last-run.json`.
- `routes.ts`-ből: nem használt Zod-sémák, konstansok és a `requireAdmin` helper;
  `storage.ts`-ből egy felesleges, eldobott eredményű adatbázis-lekérdezés
  (`getBatchMaterialLikes`).

**Talált hiba mellékesen:** a `dailyViewSummary` a `./gmail` elavult
`sendAdminNotification`-jét importálta, ami feltétel nélkül `throw`-ol — a napi
összesítő e-mail sosem ment ki (a kivételt a körülvevő `catch` elnyelte). Átirányítva a
működő Resend-implementációra.

## 4. Lint / typecheck

- `npx tsc --noEmit`: **0 hiba** (és `target: "ES2022"` bekerült a `tsconfig.json`-ba —
  eddig hiányzott, így a tsc ES5-öt feltételezett és valid modern szintaxist utasított el).
- `npx eslint client/src server`: **1163 → 989** warning, 0 error.
  A CI baseline 1166-ról **989**-re szigorítva.
- Megszűnt: az összes `no-unused-vars` (130), `preserve-caught-error` (6),
  `no-useless-escape` (2), `prefer-const` (2), `ban-ts-comment` (1),
  `no-constant-binary-expression` (1), `no-require-imports` (1).
- Marad: 885 `no-console` és 102 `no-explicit-any` — ezek fokozatos migrációt igényelnek
  (`server/lib/logger.ts` már megvan hozzá), nem hordoznak közvetlen kockázatot.

## 5. Tesztek

- `tests/csrf-origin.test.ts` átírva: már a **valódi** `isOriginAllowed()` implementációt
  importálja a korábbi másolat helyett, és lefedi az új login/logout védelmet
  (idegen origin, hiányzó origin, same-origin, Referer-fallback, localhost-szabály).
- Új `tests/push-endpoint.test.ts` az SSRF-guardra.
- 21/21 unit teszt zöld; `npm run build` sikeres.

### NOT RUN

- A Playwright E2E csomag és a szerver élesindítása nem futott: mindkettőhöz élő
  `DATABASE_URL` kell, ami ebben a környezetben nem érhető el. Kockázat: a middleware-sorrend
  változásai (body-limit, rate limiter) csak típus- és build-szinten vannak igazolva,
  futásidejűen nem. A CI e2e-job lefedi őket.
