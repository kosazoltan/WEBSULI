# Internetes készítés — új indítás — végrehajtási utasítás (ügynöknek)

Terv: `docs/specs/2026-10-19-webes-keszites-uj-inditas.md`. Munkakönyvtár: `source/`. Ág: `fix/webes-keszites-uj-inditas`.

1. **`client/src/components/studio/WebResearchAgentPanel.tsx`:**
   - **`startOver()`:**
     - ha `isLoading`, akkor `window.confirm(…)`; elutasításnál semmi;
     - különben `rememberResearch(null)`, `setPending(null)`, és minden állapot alaphelyzetbe: `messages` `[]`, `generatedHtml`
       `""`, `savedId` `null`, `failure` `null`, `canResume` `false`, `sources` `[]`, `warnings` `[]`, `status` `null`, `isLoading`
       `false`, `title` `""`.
     - A `pending` nullázása leállítja a követést (a `useEffect` takarítója).
   - **Új gomb a láblécben:** `data-testid="web-research-new"`, felirat „Új készítés”, `RotateCcw` ikon, `variant="outline"`,
     `min-h-11`.
     - Akkor látszik, ha `pending || savedId || failure || messages.length`.
     - Az `isLoading` nem tiltja; az `isSaving` igen.
   - **Végállapot:**
     - a `done` mindkét ágában (`!job.html` és a `job.html` ág) `rememberResearch(null)`;
     - `error` esetén, ha `job.canResume !== true`, szintén.
     - A `pending` állapot marad (a panel és a `WorkflowMonitor` a jelenlegi munkamenetben mutatja az eredményt).
2. **`tests/web-research-completion.spec.ts`:** két új teszt a meglévő harnesszel.
   - Beragadt `running` → az „Új készítés” engedélyezett → megerősítés (`page.on("dialog", d => d.accept())`) → a mező szabad
     → új üzenet → a POST új azonosítóval megy.
   - `done` → újratöltés → web mód → nincs `web-research-open-saved`, a panel üres; 390 és 1440 px, nincs kilógás.
3. **Ellenőrzés:**
   - `check`, `check:test`, `eslint`;
   - `npx playwright test --config playwright.web-research.config.ts`;
   - `npm test`, `build`.
