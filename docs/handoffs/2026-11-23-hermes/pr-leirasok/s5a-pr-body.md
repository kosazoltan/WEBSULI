# Összefoglaló

TGM S5a — változatos visszajelzés-nyitás kódszótárból, a `STUDIO_LESSON_VARIETY` kapcsoló mögött (alapból KI).

Terv: `docs/specs/2026-11-18-tananyag-gyartas-minoseg.md`, `docs/specs/2026-11-20-tgm-valtozatossag-abrak-vegrehajtas.md`.

- A jelölt (új) leckéken a visszajelzés elé korosztályos, kódszótári nyitás kerül, de csak akkor, ha a modell szövege nem régi
  nyitással kezdődik. **NINCS LEVÁGÁS** (tulajdonosi döntés, 2026-11-22): a modell szövege bájtra változatlan marad, a kód,
  a képlet és a mínuszjel is (16 szöveg × 2 ítélet × 3 sáv teszt).
- A változatossági jelölő a gyártásban a modell kimenetének elfogadásakor eldobódik; a célzott fogalomjavítás a tárolt lecke
  állapotát követi (mindkét irány tesztelve).
- Élő régió: újratöltés után a mentett válasz nem kerül felolvasásra.
- KI állapotban a főág viselkedése változatlan (a jelöletlen leckék megjelenítése a főág szerinti).

## Futtatott ellenőrzések

- `npx tsx --test` (13 célzott fájl: lesson-variety-paths, lesson-feedback-openers, verdict-feedback-variety, lesson-variety-flag, lesson-ui-text, source-visuals-flag, lesson-opener, lesson-opener-bank-reuse, resource-s3a, single-run-engine, lesson-fusion-repair, single-run-concept-fix, seeded) → `tests 138, pass 138, fail 0`
- `npx playwright test -c playwright.lesson-variety.config.ts` → `8 passed`; regresszió: `lesson-practice` → `8 passed`, `lesson-interactions` → `4 passed`
- `npm run gate:stage` → ZÖLD (151 tesztfájl); `npm run gate:push` → ZÖLD (54e5518f)
- `npm run gate:blind-review` (3. kör) → IGEN, FELTÉTELLEL
- Független ellenőr ítélete: IGEN, FELTÉTELLEL (fej: 54e5518f2f31)

Nem futtatott + ok: a javítás alkalmazása és a fogalomjavítás mentésének DB-integrációs kódútja (csak a DB nélküli mag tesztelt) — kockázat alacsony: a kapcsoló élesben KI; képernyőolvasós (hangos) mérés NOT RUN — DOM-szintű próba fedi.

## Követő jegyek (a vak ellenőr 3. körének feltételei)

- **L1 (a forrásvizuál-kapcsoló bekapcsolása ELŐTT kötelező):** a modell kéretlen `variety` metaadata a forrásvizuál-ág
  sémáján át javítókört okozhat KI változatosság mellett is — a mező a modellsémákból kerüljön ki, vagy az első tartalmi kapu
  előtt dobódjon el. Élesben ma nincs hatása: `STUDIO_SOURCE_VISUALS` és `STUDIO_LESSON_VARIETY` is KI.
- L2: az élő régiót a válaszkezelő friss eseménye élesítse (ne a gyökér kattintás + időablak).
- L3: azonos szövegű második friss válasz is frissítse az élő régiót.
- L4: jelölt leckén a kódpélda bájthű megjelenítése (NFC-határok szabálya).
- L5: a böngészős mérő kérdésenként mérje a konkrét kódnyitást (vak kör 2 L5-tel együtt).

<!-- agentic-qa-kit:begin v1 -->
## Agent-PR ellenőrzőlista (kötelező AI-asszisztált PR-nál)

- [x] **CI-integritás:** a PR nem gyengít gate-et (nem törölt tesztet, nem csökkentett küszöböt, nem módosított CI-konfigot indoklás nélkül) — a levágási tesztek dokumentált spec-változás (NINCS LEVÁGÁS) miatt cserélődtek
- [x] **Duplikáció:** nem vezet be máshol már létező utility/helper másolatot más néven
- [x] **Kritikus útvonal:** a fő kódútvonalat ember végigkövette és megértette
- [x] **Security boundary:** auth/jogosultság/input-validáció határai érintetlenek vagy szándékosan, dokumentáltan változtak
- [x] **Tesztbizonyíték:** a nem-triviális viselkedés-változásra van teszt, és a teszt valódi logikát ellenőriz (nem "paper test")
- [ ] **Hatókör:** a diff csak a feladathoz tartozó fájlokat érinti; méret ~400 sor alatt (vagy indokolt) — 28 fájl, +1396/−45; ebből teszt +632, docs +369, éles kód +395/−45
<!-- agentic-qa-kit:end -->

🤖 Generated with [Claude Code](https://claude.com/claude-code)
