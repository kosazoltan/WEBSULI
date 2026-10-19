# Admin reszponzivitás — végrehajtási utasítás (ügynöknek)

Terv: `docs/specs/2026-10-19-admin-reszponzivitas.md`. Munkakönyvtár: `source/`. Ág: `fix/admin-reszponziv`.

1. **`client/src/pages/admin.tsx:644`:** a konténer osztályai `pt-1.5 sm:pt-2`, mobilon
   `pb-[calc(5rem+env(safe-area-inset-bottom))]`, egyébként `pb-1.5 sm:pb-2`.
2. **`client/src/components/MobileBottomNav.tsx`:**
   - a `nav` kapjon `pb-[env(safe-area-inset-bottom)]`-ot;
   - a lap `max-h-[80vh]` → `max-h-[80dvh] overflow-y-auto`.
3. **`client/src/components/ui/dialog.tsx`, `ui/alert-dialog.tsx`:** a tartalom alaposztályához
   `max-h-[calc(100dvh-2rem)] overflow-y-auto w-[calc(100%-1rem)]`.
   - A meglévő `max-w-*` / `w-*` felülírások (`cn`, `tailwind-merge`) továbbra is nyernek.
4. **`client/src/components/ui/sheet.tsx`:**
   - `top` / `bottom`: `max-h-[85dvh] overflow-y-auto`;
   - `left` / `right`: `overflow-y-auto`.
5. **`client/src/components/SimpleHtmlUpload.tsx`:**
   - **Méretezés:** a gyökér `h-[calc(100vh-…)]` helyett természetes magasság; a Card, a CardContent, a form és a mezőblokk
     `flex-1 min-h-0` kötése megszűnik.
   - **Szövegmező:** `h-[38dvh] min-h-[160px]`.
   - **Akciósor:**
     `sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] lg:bottom-0 z-10 bg-white dark:bg-gray-900 py-2`.
6. **Fix magasságok `min()`-re:**
   - `MaterialImprover.tsx` 600 px → `h-[min(600px,60dvh)]`;
   - `WebResearchAgentPanel.tsx:244` → `h-[min(480px,62dvh)]`, `:304` → `h-[min(320px,40dvh)]`;
   - `MaterialImprovementBackups.tsx:270` → `h-[min(400px,50dvh)]`.
7. **`client/src/components/FileEditDialog.tsx:69-70`:** `z-[60]`, `max-h-[calc(100dvh-1rem)]` (mindkét töréspont).
8. **Sortörés (`flex-wrap`):**
   - `MaterialImprover.tsx` :573, :629, :653, :685, :690;
   - `MaterialImprovementBackups.tsx:238`;
   - `PdfUpload.tsx:275`;
   - `LearnersPanel.tsx:82`;
   - `KnowledgeMapEditor.tsx:138`.
   - Mindegyik sornál ellenőrizd, hogy valóban gombsor.
9. **Tesztek** (`tests/admin-responsive.spec.ts` + helpers + `playwright.admin-responsive.config.ts`):
   - a 11 fül × 4 nézet: nulla elérhetetlen elem, nulla vízszintes kilógás (szigorú, nem jelentés);
   - HTML-feltöltés 250 kB-os fájllal × 5 nézet (a billentyűzetes is): a „Feltöltés” elérhető, kattintás után POST megy;
   - Tananyagjavító: lecke kiválasztása után a „Javítás indítása” elérhető (× 4 nézet);
   - Fájlszerkesztő: a ceruza után a „Mentés” elérhető, nem takarja a menü;
   - Felugró ablak: egy hosszú tartalmú ablak (e-mail küldés a fájlkártyáról) alsó gombja elérhető;
   - képernyőkép nézetenként: `test-results/admin-responsive/`.
10. **Ellenőrzés:**
    - `check`, `check:test`, `eslint` (érintett), `npm test`, `build`;
    - az új Playwright-konfig;
    - a meglévő Playwright-mérések, amelyek a módosított ablakalapot érintik: `admin-korszerusites`, `learners-newsletter`,
      `lesson-repair-workbench`, `web-research-completion`.
