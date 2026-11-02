# Kétszínű fókuszgyűrű — végrehajtási utasítás (AI-ügynöknek)

Terv: `docs/specs/2026-10-17-fokuszgyuru-ketszinu.md`. Ág: `claude/jolly-varahamihira-b2fe3f`. Egy PR (~100 sor diff).
Minden parancs a `source/` könyvtárból fut.

## 1. CSS — `source/client/src/lesson-runtime/lesson-design.css`

1. A fejléc-komment 9. sorában a „a fókusz a referencia 3px-es borostyán kerete” helyett: „a fókusz kétszínű gyűrű: a
   referencia 3px-es borostyán körvonala és egy sötét belső gyűrű (világos felületen is ≥ 3:1, §2.6)”.
2. A `/* ---------- fókusz … */` blokk cseréje erre (pontosan):

   ```css
   /* ---------- fókusz (a referencia 3px borostyán kerete + sötét belső gyűrű; docs/specs/2026-10-17-fokuszgyuru-ketszinu.md) ----------
      A borostyán a világos felületeken csak ~1,7–1,96:1, a sötét #10233C ott ≥ 13,6:1; a 11–12. o. sötét témáján fordítva
      (borostyán ≥ 5,99:1). A szelektor 5 attribútumos, hogy a témás elemek saját árnyéka ne nyomja el a gyűrűt. */
   [data-band][data-experience][data-ws-theme] :is(a, button, input, textarea, select, summary, [tabindex]):focus-visible {
     outline: 3px solid #F4AB37; outline-offset: 3px; box-shadow: 0 0 0 3px #10233C;
   }
   /* A kiválasztott fül főszínű belső kerete fókuszban is megmarad. */
   [data-band][data-experience][data-ws-theme] .fusion-tabs button[aria-selected="true"]:focus-visible {
     box-shadow: inset 0 0 0 2px var(--ws-accent), 0 0 0 3px #10233C;
   }
   ```

## 2. Unit teszt — `source/tests/lesson-design.test.ts`

1. A „a témás lecke nem animál, és a fókusz a referencia 3px-es borostyán kerete” teszt (dokumentált spec-változás, a terv
   §4/§6) új címe: „a témás lecke nem animál, és a fókusz kétszínű gyűrű (borostyán körvonal + sötét belső gyűrű)”. Az
   állítás: `/:focus-visible \{\s*outline: 3px solid #F4AB37; outline-offset: 3px; box-shadow: 0 0 0 3px #10233C;/`, és a
   kiválasztott fül szabálya: `/\.fusion-tabs button\[aria-selected="true"\]:focus-visible \{\s*box-shadow: inset 0 0 0 2px var\(--ws-accent\), 0 0 0 3px #10233C;/`.
2. Új teszt: „a fókuszgyűrű valamelyik színe minden téma felületén, csempéjén és halvány felületén ≥ 3:1 (§2.6)”.
   - A két színt a CSS fókuszszabályából olvassa ki (regex: `outline: 3px solid (#…)` és `box-shadow: 0 0 0 3px (#…)`).
   - Témánként `cssToken(id, "--ws-surface" | "--ws-panel" | "--ws-soft")`, plusz a Csendes nézet blokkjának ugyanezen
     tokenjei.
   - Hiba, ha `max(contrastRatio(amber, bg), contrastRatio(dark, bg)) < 3`; továbbá `contrastRatio(amber, dark) ≥ 3`.
3. Parancs: `node --import tsx --test tests/lesson-design.test.ts` → elvárt: minden teszt `ok`, 0 fail.

## 3. Böngészős teszt — `source/tests/lesson-design.spec.ts`

Új teszt: „billentyűs fókusz: kétszínű gyűrű, legalább egy szín ≥ 3:1 a háttérhez (explorer, future)”.
- Témák: `classroom=1` (explorer), `classroom=11` (future); 1440×900.
- `page.goto('/__lesson-runtime-probe?fusion=1&classroom=<c>')`, majd `Tab` legfeljebb 60-szor, amíg az aktív elem a
  `.fusion-tabs button[aria-selected="true"]`.
- Elvárt: `el.matches(':focus-visible')`; `outline-color` = `rgb(244, 171, 55)`, `outline-width` = `3px`;
  `box-shadow` tartalmazza a `rgb(16, 35, 60) 0px 0px 0px 3px` részt és az inset főszín-keretet.
- Kontraszt: a gyűrű két színe a gyökér (`[data-ws-theme]`) számított `background-color`-jához és a `.fusion-tabs`
  hátteréhez: max ≥ 3.
- Képernyőkép: `test-results/websuli-design/focus-<id>.png` (a fülsor környéke, `clip`), meg kell nézni.
- Parancs: `npx.cmd playwright test tests/lesson-design.spec.ts --workers=1 --reporter=line` → elvárt: minden teszt
  passed.

## 4. Kapuk

- `npx.cmd tsc --noEmit` (vagy a repo `check` scriptje) → 0 hiba.
- `node --import tsx --test tests/lesson-design.test.ts` → pass.
- Playwright a fenti paranccsal → pass; a két fókusz-képernyőkép megtekintve.

## 5. Commit és push

- Commit-üzenet fájlból (`git commit -F <scratchpad>/msg.txt`).
- Push előtt külön parancsban: `Set-Content -LiteralPath D:\repo\WEBSULI\.audit-ok -Value ([DateTime]::UtcNow.ToString('o'))`.
- PR a `main`-re.
