# Erőforrás S2a — végrehajtási utasítás (ügynöknek)

Terv: `docs/specs/2026-10-19-eroforras-s2a.md`. Munkakönyvtár: `source/`. Ág: `perf/s2a-forgalom`.

1. **`server/workflows/routes.ts` `GET /workflows`:** `runs: records.map(r => slimRun(r.view))`.
   - `slimRun` a `server/workflows/slim.ts`-ben, tiszta függvény: `{ ...view, visits: [], history: undefined, skill: undefined,
     skillFindings: undefined, resumeEdges: undefined }`.
   - Review #325: a karcsúsítás már az SQL-ben (`server/workflows/store.ts` `list`): `snapshot - 'visits' - 'history' - 'skill'
     - 'skillFindings' - 'resumeEdges'`, és `view.visits = []`; így a Neon → szerver forgalom is csökken. A lejárt bérlet miatti
     állapotkorrekció marad; az egyes futás lekérdezése teljes.
2. **`client/src/components/studio/WorkflowMonitor.tsx` `WorkflowHistory`:** `refetchInterval: q => q.state.data?.runs.some(r => ["running","waiting"].includes(r.state)) ? 5000 : 60_000`,
   `refetchIntervalInBackground: false`.
3. **`server/storage.ts` `getAllImprovedHtmlFiles`:** `getTableColumns(improvedHtmlFiles)` a `content` nélkül, `.limit(200)`,
   `createdAt` szerint csökkenő; a visszatérési típus `Omit<ImprovedHtmlFile, "content">`.
   - Ellenőrizd a hívókat (szerver és kliens), hogy egyik se használja a lista `content`-jét.
4. **`server/storage.ts` új `getImprovedHtmlFileStatus(id)`:** a terv mezői.
   - **Interfész:** `IStorage`, és ha van, a memóriás implementáció is.
   - **`improveAsync.ts` állapotvégpont:** előbb ezt hívja; a teljes `getImprovedHtmlFile` csak az időtúllépési ágban.
5. **`server/design-assets.ts`:** két lépés (meta → 304, különben bájtok).
   - Review #325: a második lekérdezés a `mime` + `sha256` + `bytes` hármast együtt olvassa, és a válasz fejlécei (ETag,
     Content-Type) ebből jönnek — a két lekérdezés közti háttérszinkron ne adhasson régi ETaget új bájtokhoz.
6. **`client/src/components/studio/SourceUploadForm.tsx:228`:** `false`.
7. **Fájlok:** `git rm client/public/christmas-bg.jpg client/public/christmas-bg.png client/public/hero-video.mp4`.
   - Előtte `grep` a teljes repóban (`server`, `client`, `shared`, `index.html`, `service-worker`).
8. **Tesztek:** `tests/resource-s2a.test.ts`:
   - a `slimRun` elhagyja a `visits` / `history` mezőt, a többit megtartja;
   - forrásszintű ellenőrzés: a lista-lekérdezés `content` nélkül, a képvégpont meta-lekérdezése `bytes` nélkül;
   - a három fájl nincs.
9. **Ellenőrzés:**
   - `check`, `check:test`, `eslint`, `npm test`, `build`;
   - az okosítás / fázissáv böngészőtesztje (`playwright.phase-bar.config.ts`) zöld.
10. **Kitelepítés:** összevonás csak akkor, ha a csak olvasó őr szerint nincs aktív futás.
