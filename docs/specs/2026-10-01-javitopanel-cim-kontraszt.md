# „Tananyag javítása” admin-panel címének kontrasztja (2026-10-01)

**Mért ok** (tulajdonosi telefon-képernyőkép, Playwright-mérés): a lecke alatti admin-panel címe `rgb(248,250,252)` színű
fehér (`bg-card`) háttéren — a kártyán nincs saját szövegszín, a cím a lecke-oldal örökölt (világos) szövegszínét kapja.

**Cél:** a cím (és a kártya minden saját szín nélküli szövege) a kártya előtérszínét kapja (`text-card-foreground`).
**Nem-cél:** a panel jogosultsága (tanulónak továbbra sem jelenik meg: `isAdmin` + `isAuthenticatedAdmin`), a lecke témái.
**Edge case:** az alkalmazás nem kapcsolja be a Tailwind `.dark` osztályt (nincs témaváltó) — a valós állapotok az OS
világos/sötét preferenciája; a teszt ezt a kettőt méri.
**Elfogadás (EARS):** HA admin megnyit egy lecke-előnézetet (390×844, OS világos ÉS sötét preferencia), AKKOR a „Tananyag
javítása” cím és a kártya háttere közti kontraszt ≥ 4,5:1.
