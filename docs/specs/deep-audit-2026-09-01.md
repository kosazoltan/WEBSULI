# Spec — Mély kódaudit javítások (2026-09-01)

## Cél
A 2026-09-01-i teljes kódbázis-audit (5 párhuzamos elemző ügynök + refuter-kör) által
talált, forrásból megerősített hibák javítása a `fix/deep-audit-2026-09-01` ágon, minimális,
célzott módosításokkal, tesztekkel ahol a logika egységtesztelhető.

## Nem-cél
- Nincs refaktor, stílus-átírás, `any`-tisztítás, console.log-takarítás.
- Nem nyúlunk: `playwright.config.ts`, `.github/workflows/**` (külön munkamenet dolgozik rajtuk).
- Preview.tsx `allow-same-origin` marad (PR #2 szándékos döntés: mikrofon-engedély a tananyagokhoz).
- A publikus tananyag-HTML-be injektált ADMIN_EMAILS (routes.ts:220) kivezetése új API-t igényelne → BACKLOG.

## Javítandó tételek (forrásból megerősítve)

### Backend — KRITIKUS
- B1 storage.ts `createBackup` + `exportBackupSnapshot`: `getAllHtmlFiles()` üres `content`-et ad → teljes select; `restoreBackup`/`importBackupSnapshot` kapu: üres content-ű tananyag esetén hiba, nincs törlés. Restore map: `contentType`, `displayOrder` átvitele.
- B2 CSRF/Origin-őr a `/api/login`, `/api/logout` route-okon HALOTT (setupAuth előbb regisztrál, mint a routes.ts app.use). `enforceOriginAllowlist` közös lib-be (`server/lib/origin-guard.ts`), auth.ts a két route-on közvetlenül alkalmazza. Teszt: a valós sorrenddel (setupAuth-szerű regisztráció + guard) idegen Origin → 403.

### Backend — HIGH
- B3 scheduledPublishing.ts: `"htmlFiles"`/`"userId"` → `html_files`/`user_id`.
- B4 migráció 0007: `games_catalog` sorok `space-asteroid-quiz`, `brain-rot-steal` (ON CONFLICT DO NOTHING); `submitGameScore` ismeretlen gameId → `unknown_game` hiba (400).
- B5 storage.ts `deleteUser`: improved_html_files.created_by/applied_by + material_improvement_backups.created_by nullázás, egész blokk tranzakcióban.
- B6 improveAsync.ts: stream `error` chunk → throw (csonka HTML nem mentődik); status handler try/catch; `processing` guard 15 perc után stale → error; clearTimeout finally-ban; `replace(jsContent, () => fixedJs)`.
- B7 gameQuizGeneratorService.ts: `validItems.length === 0` → return a deaktiválás ELŐTT.
- B8 index.ts: `aiLimiter` a body-parser elé; nagy body-limit csak bejelentkezett adminnak (különben standard).

### Backend — MEDIUM/LOW (olcsó, biztonságos)
- B9 index.ts compression filter: `text/event-stream` kizárva.
- B10 ai-payload-guard: `content ?? fileData` méretmérés.
- B11 auth.ts Google callback: `req.session.regenerate` + `req.login`.
- B12 like: nem létező anyag → 404; `addMaterialLike` `onConflictDoNothing`.
- B13 SSE catch-ek: `!res.headersSent` → 500 JSON.
- B14 createReadStream `error` listener.
- B15 bulk-delete `deletedCount` = `.returning().length`.
- B16 popular: `COALESCE(total_views,0) DESC`.
- B17 upsertEmailSubscription target → `email`.
- B18 migrate.ts ssl `rejectUnauthorized` NODE_ENV alapú.
- B19 message típus-ellenőrzés (3 SSE endpoint), `content[0]` optional, `error: err.message` csak dev-ben, comments `.limit(200)`, sitemap `getBaseUrl()`, push unsubscribe `validatePushEndpoint`, quiz-bank catch csak `isMissingGamesTableError`-re fallback, error-mailer `_sendEmail` boolean, dailyViewSummary dátumszűrt lekérdezés, reorder chunkolt, `/dev` publicWriteLimiter.

### Kliens — játékok
- G1 BlockCraftQuiz: render-loop nem indul újra pálya/kör után → canvas mindig a DOM-ban (rejtve), `runningRef` resume; verifikálandó a tényleges start-útvonal.
- G2 SpaceAsteroidQuiz: `timeLeft`/`powerTimer` interval pause alatt is fut → `paused` guard + dep.
- G3 AchievementToast: önmagát törlő effect → két effect (queue→current, timer).
- G4 SpeedQuizMath: timeout nem számít hibának (`perfect`); BrainRotSteal: rossz kvízválasz nem számolt; BrainRotSteal 151-152 duplikált opciók; WordLadderHuEn: `answerLockedRef` + `timeoutsRef`.
- G5 ClassroomGateModal: role=dialog, aria-modal, Escape, kezdő fókusz.

### Kliens — oldalak/komponensek
- P1 pdf-view.tsx: CLASSROOM_COLORS index → fallback + `getClassroomLabel`.
- P2 EnhancedMaterialCreator: `allow-same-origin` ki (2 iframe); SSE `type==='error'` a belső try-n kívül (2 hely).
- P3 queryClient.ts: 403 body egyszeri olvasás.
- P4 ChatInterface: autoscroll a Radix viewportra.
- P5 PdfUpload: FileReader hibák toast-tal; objectURL logika törlése.
- P6 AdminFileDashboard: reset csak `!isDirty`; `selectedIds` szűrése; bulk-move MIN/MAX_CLASSROOM.
- P7 ExtraEmailsManager: promote gomb disabled csak isPending; `[...x].sort((a,b)=>a-b)` 3 hely.
- P8 AdminDocumentation: admin guard; admin.tsx validTabs bővítés.
- P9 MaterialImprover: confirm() delete + force-apply.
- P10 DatabaseManager: `databaseUrl` feltételes, szerver `databaseType: 'PostgreSQL'`.
- P11 AuthStatus: e-mail-alapú kezdőbetű → név/e-mail első betűje.

## Edge case-ek
- Backup restore régi (üres content-ű) backupból: kapu hibát ad, adat nem vész el.
- Login Origin nélkül (curl, natív kliens): az `enforceOriginAllowlist` meglévő szemantikája marad (same-origin / allowlist / hiányzó Origin kezelés változatlan).
- BlockCraft: első indítás, pálya-váltás, "Kör vége" → újraindítás, unmount közben futó loop.

## Elfogadás (EARS)
- WHEN admin backupot készít, THEN a backup minden tananyag teljes `content`-jét tartalmazza (unit teszt: createBackup nem hívja getAllHtmlFiles listanézetet — statikus guard teszt).
- WHEN restore üres content-ű tananyagot tartalmazó backupból indul, THEN hiba, nincs törlés.
- WHEN POST /api/login idegen Origin-nel érkezik a VALÓS regisztrációs sorrendben, THEN 403 (új unit teszt).
- WHEN publish_material job fut, THEN az SQL a `html_files` táblát frissíti (unit: SQL-szöveg guard).
- WHEN gameId nincs a katalógusban, THEN submitGameScore 400 `unknown_game`.
- `npx tsc --noEmit` 0 hiba; eslint 0 error, warning ≤ 989; minden meglévő + új unit teszt zöld; `npm run build` OK.
