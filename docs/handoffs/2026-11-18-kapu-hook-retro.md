# Retro — kapu-hook: projektgyökér, héj szerinti értelmezés, hibánál tiltás (2026-11-17 – 2026-11-18)

Előzmény: `docs/handoffs/2026-11-17-jatekok-utomunka-retro.md`. Mért tényekből (`gh pr view`, `gh pr checks`, a kapuk bizonyíték- és
naplófájljai, a valódi héjas próbák kimenete).

## 1. Mért tények

| PR | Tartalom | Állapot |
|---|---|---|
| #489 | minőségkapuk (lint / szakasz / push / PR / merge kapu, kapu-hook, öt skill) | összevonva (`26bae97f`) |
| #490 | külső (Gemini) ellenőr; C-61 hatókör-alapon; a kapu-hook időtúllépéskor tilt; **minden hook a projektgyökérhez kötve** | összevonva (`3924beb7`) |
| #499 | a kapu-hook héj szerinti parancs-értelmezése (Bash / PowerShell), kevesebb hamis tiltás, 347 alakos valódi héjas próbatábla | összevonva (`49a849ef`) |
| #506 | a kapu-hook hibája tiltás (`onFailure: "block"`), az audit-hook időtúllépéskor tilt | nyitott |

- **A legnagyobb lelet (#490, a független ellenőr M1-e):** a `.claude/settings.json` hook-parancsai relatív útvonalúak voltak; a
  Claude Code a hookot az aktuális könyvtárban indítja, így alkönyvtárból (`source/`, munkafa) egyik hook sem futott, és a hook
  hibája alapból átengedés. A javítás után az orkesztrátor élő próbája a `source/`-ból kiadott feltöltést tiltotta.
- **Visszavont kör:** a tokenizálás első változata (`b6481b28`) NEM ítéletet kapott (két PowerShell-alakosztályt átengedett, amit az
  előző fej még tiltott). A #490 a már jóváhagyott tartalommal ment (három revert, bájtra azonos fa), a tokenizálás külön ágon,
  valódi héjas próbával (Git Bash, PowerShell 7, Windows PowerShell 5.1; 1041 futás, 0 átcsúszás) jött vissza (#499).
- **Soros merge-ablak:** a #499 kétszer kapott új beolvasztást, mert a main közben elmozdult (#498, majd #491), és a C-61 a
  repó-szintű őrt érintő PR-t megfogja; minden kör = `gate:push` (6–13 perc) + teljes CI (66–80 perc). A #506 a #497-re vár.
- **Terhelésfüggő bukások:** a `gate:push` egyszer a teljes egységteszten bukott (`rt-gateway`, `score-english-negation`;
  451 s a szokásos ~150–220 s helyett, két párhuzamos E2E-konténer mellett; külön futtatva 51/51 zöld). A `gate:stage` egyszer a
  `settings-hooks.test.mjs`-en bukott, mert az audit-hook 5 s-os git-korlátja terhelés alatt lejárt, és akkor átengedett — ezt a #506
  javítja (fail-closed, 10 s).

## 2. Mi ment rosszul és mennyibe került

1. **Két őr-érintő PR nem lehet egyszerre zöld** — a C-61 hatókör és a ~2 órás böngészős kör együtt soros merge-ablakot kényszerít;
   az őrt / kaput érintő PR-okat elsőként, egyenként kell beolvasztani. Ára: a #499-nél két extra beolvasztás + kapu + CI kör
   (~2 × 80 perc gépidő).
2. **A hook-parancsok elérhetőségét senki nem mérte a valódi settings-szel** a bevezetéskor — a #489 a hook-szkriptet tesztelte, a
   bekötést nem. Ára: egy teljes ellenőri kör + javító kör a #490-ben.
3. **Szöveg alapú idézés-tiltás** (a 2. körben) a szabályos PR-folyamatot hamisan tiltotta, és a héjjal ellentétes értelmezés két
   alakot átengedett — a valódi héjjal végzett különbségi próba nélkül ez nem látszott. Ára: egy NEM ítélet, három revert.
4. **Saját parancsok hamis tiltása:** a fejlesztés közben a hook többször tiltotta a saját, kapu-köteles szót csak szövegként
   tartalmazó parancsaimat (heredoc, láncolás) — megkerülés helyett szkriptfájlból írtam (kanban #124 jegyzet).

## 3. Elvégzett javítások ebben a futásban

- `.claude/settings.json`: minden hook-parancs `node "${CLAUDE_PROJECT_DIR}/scripts/qa/hooks/…"` (#490); `onFailure: "block"` a
  kapu-hookon (#506).
- `scripts/qa/hooks/settings-hooks.test.mjs`: a valódi settings minden hookja négy helyről (gyökér, `source/`, mélyebb könyvtár,
  munkafa), a kapu-hook bekötése és időkorlátja (#490, #499).
- `scripts/qa/hooks/check-quality-gates.mjs` + `fixtures/quoting-forms.json`: héj szerinti tokenizálás, valódi héjas próbatábla
  (#499); a „nem válaszolt” tiltás teendővel, hibás bemenet + kapu-köteles szöveg → tiltás (#506).
- `scripts/qa/hooks/check-audit-ok.mjs`: időtúllépéskor / indítási hibánál / belső hibánál tilt (#506, kanban #126).
- `docs/minosegkapuk.md`: élő próba a merge után; „A kapu-hook hibája” (az ügynök csak a hookot javíthatja, a védelem kikapcsolása
  tulajdonosi lépés — szöveg-őr teszttel).
- `docs/agent-csapdak.md`: C-73.

## 4. Kanbanra került

#124 (hamis tiltások), #125 (a repó-érték normalizálása), #126 (audit-hook — a #506 zárja), #158–#160 (nem szöveg típusú parancsmező;
az audit-hook ismeretlen eszköznévnél; az audit-hook null bemenetre), #164 (a szöveg-őr kiterjesztése a teljes runbookra és a
kapu-skillekre).
