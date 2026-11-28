# Végrehajtás: WEBSULI pótlások

> Terv: `docs/specs/2026-11-19-websuli-potlasok-terv.md` (ez a fájl annak 2. fázisa; a szelet-azonosítók, a tételtérkép és a
> döntések ott vannak). Dátum: 2026-11-19. Olvasó: MI-ügynök (orkesztrátor és szelet-megvalósító).
> Szabály: `AGENTS.md`, `docs/agent-haromfazisu-munka.md`, `docs/minosegkapuk.md`. Minden parancs Windows-on `npm.cmd` / `npx.cmd`.

## 0. Közös rész (minden szeletre; minden megvalósító ELŐSZÖR ezt olvassa)

### 0.1 Indítás (orkesztrátor)

1. Döntések: a terv 8. szakaszának kérdéseire a tulajdonos 2026-11-19 ~17:55 UTC-kor válaszolt (a terv 6. és 8. szakasza); nyitott
   tulajdonosi kérdés nincs. Új kérdés csak új tényből; akkor űrlapon, az ajánlott opció elöl. A futó #484 (J3a) merge-e előtt a D-04
   (a) szerint új pontskála-verziókulcs és új ranglista kell, a régi rekordok archívként megmaradnak — ezt a #484 megvalósítójának add át.
2. Indítási feltétel: a terv 3. szakaszának futó munkái beolvadtak, VAGY tulajdonosi válaszra várnak (ez nem tartja vissza a
   tervet). Egyszerre legfeljebb 4 szelet van folyamatban (WIP ≤ 4, projektmemória „kapugyorsítás döntései”).
3. Sorrend: a terv 7.1 táblázata. Egy szelet akkor indul, ha a „Függőség” oszlop minden eleme teljesült (beolvadt PR / megvan a
   döntés). Független szeletek közül a kisebb sorszám előbb.
4. Szeletenként egy megvalósító alügynök, saját munkafával. Javító körben UGYANAZT az alügynököt folytasd (SendMessage), ne újat
   (gyorsítótár). A vak ellenőr mindig friss.
5. Session eleji söprés minden munkamenetben: `git status --short`, `git worktree list`, kanban `list`. Félbehagyott ág / munkafa
   a saját végrehajtása szerint befejezendő.

### 0.2 Előkészítés (megvalósító, szeletenként)

```text
git fetch origin
git worktree add .claude/worktrees/<szelet-rövidnév> -b <ág> origin/main
cd .claude/worktrees/<szelet-rövidnév>/source ; npm.cmd ci     (node_modules másolása TILOS — AGENTS.md ARM64 + x64)
```

- Ág-nevek: `fix/…` hibánál, `feat/…` funkciónál, `chore/…` kapu / eszköz, `perf/…`, `test/…`. A meglévő ágon induló szeletnél
  (G-2, G-3, I-2, Q-1, Q-6, Q-9) az ágat hozd friss mainre: `git merge origin/main` (rebase és force-push tilos a nyitott PR-on).
- A szelet ELSŐ commitja a saját terv + végrehajtási pár, ha a szelet 3+ fájlt érint: `docs/specs/2026-11-2X-<név>.md` és
  `-vegrehajtas.md`, a végrehajtásban a terv TELJES `docs/specs/…` útvonalával. Ahol a meglévő terv (JÁTÉK, TGM, ADVENT) adja a
  lépéseket, a pár legfeljebb egy oldal: hivatkozás a fejezetre + az ebből a tervből jövő kiegészítés + az EARS.
- Commit-üzenet fájlból (`git commit -F <scratchpad>/msg.txt`), a végén:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

### 0.3 Kapuk (ebben a sorrendben, megkerülés nélkül)

| Lépés | Parancs (a munkafa gyökeréből) | Mikor |
|---|---|---|
| 1 | `npm.cmd run gate:stage` | minden szerkesztési szakasz után; csak zöld után tovább |
| 2 | célzott tesztek (szeletenként lent) — böngészős / DB kör gépi zárral | a szakasz végén |
| 3 | `npm.cmd run gate:push` (gépi zárral) | a szelet kódja kész |
| 4 | vak, hibakereső ellenőr — `npm.cmd run gate:blind-review` (GPT-6.2 Sol futtató; a `chore/vak-ellenor-deepseek` beolvadása után; addig a repóban érvényes vak alügynök-szabály) → `node scripts/qa/gates/record-review.mjs --head <fej> --verdict <IGEN|NEM> --report <jelentés>` | a gate:push zöldje után |
| 5 | `npm.cmd run gate:pr -- --body-file <scratchpad>/pr.md` (gépi zárral) | IGEN ítélet után |
| 6 | `.audit-ok` külön parancsban a git-gyökérben, majd `git push -u origin <ág>`, majd `gh pr create --title "…" --body-file <scratchpad>/pr.md` — mind külön, egyszerű parancs | gate:pr zöld |
| 7 | CI — egy figyelő a végéig; zöld CI-jú fejre csak blokkoló lelet miatt push | — |
| 8 | közvetlenül a merge előtt: `npm.cmd run gate:merge -- <PR>`, majd `gh pr merge <PR> --squash` | orkesztrátor |

- **Gépi zár:** a `feat/gepi-zar` beolvadása után a nehéz kör a repó zárszkriptjén át fut (a beolvadt `AGENTS.md` szakasz és a
  `websuli-gep-zar` skill szerint); előtte a futó munkamenet zárszabálya. Két nehéz kör egyszerre nem futhat a gépen.
- **Vak ellenőr megbízása:** csak a terv szelet-blokkja (cél, nem-cél, EARS) és a fej-hash; a megvalósító jelentése és „zöld”
  állításai NEM. Kötelező szakaszok: „Mit próbáltam megtörni, és nem sikerült”, „Mit NEM vizsgáltam”. Javítás után új vak kör a
  javított fejre (legfeljebb 3 kör, utána tulajdonosi döntés — projektmemória).
- **Őr-érintő PR** (`*-guard.test.ts`, `scripts/qa/**`, `.github/workflows/**`): saját merge-ablakban (C-61).
- **Merge előtt** a `gate:merge` futásőr-lépése ellenőrzi az aktív gyártást; `source/` változás telepítést indít.
- PR-leírás: `.github/pull_request_template.md`; benne a terv szelet-azonosítója, a lefedett P- / K- / kanban-tételek, a
  „Független ellenőr ítélete: … (fej: …)” sor és a futtatott parancsok kimenete.

### 0.4 Tiltások

- Teszt gyengítése, törlése, `.skip` / `.only`; `--no-verify`; force-push; a kapu megkerülése; a `.claude/settings*.json` írása.
- Titok, e-mail-cím, valós tanulói adat a kódban, tesztben, naplóban, PR-ben (szintetikus `example.com` címek; őr:
  `no-real-emails-guard.test.ts`).
- Éles adat törlése / módosítása, fizetős hívás (képgyártás, ElevenLabs, modell-próbafutás), éles levélküldés, éles flag-váltás
  tulajdonosi jóváhagyás nélkül. A jóváhagyás a tulajdonos saját chat-üzenete, ügynöké nem.
- Más szelet fájljának „mellékes” javítása. Új talált hibából kanban-jegy + csapda-bejegyzés (`docs/agent-csapdak.md`), nem diff.

### 0.5 Elkészültség (minden szeletre)

Egy szelet akkor kész, ha: (1) a szelet minden EARS-pontja mellett teszt vagy mérés áll, a kimenettel a PR-leírásban; (2) UI-nál
valódi böngészős kör 360×640, 844×390 és 827×896 (dpr 2,625) nézetben, átfedés / levágás / vízszintes görgetés nélkül, képernyőkép a
PR-ben; (3) a 0.3 mind a 8 lépése zöld; (4) beolvadt; (5) a terv 4. szakaszában a sor „kész”-re vált a merge-commit hash-ével (külön
docs-commit a következő szeletben vagy a záró körben); (6) a lefedett kanban-jegyek lezárva a PR-számmal; (7) retro a merge előtt
(mi ment rosszul, mennyibe került, milyen javítás került a repó tudásába — fájlnévvel), és futás utáni higiénia (munkafa, helyi ág
eltávolítva; távoli ág csak jóváhagyással).

## 1. P1 szeletek

### A-1 — Advent S6: admin-előnézet, takarító, bekapcsolás

- Előfeltétel: a PR-B és a PR-C beolvadt. Határidő: a merge legkésőbb november 30. (D-11 (a): a bekapcsolás az A-1 beolvadásával,
  a tulajdonos előnézeti próbája után).
- Ág: `feat/advent-s6-elonezet-takarito`.
- Lépések:
  1. Hajtsd végre a `docs/specs/2026-11-18-adventi-naptar-vegrehajtas.md` „S6” fejezetét (313–341. sor) a „Kiegészítés 5”
     felülírásával (az előnézet flagtől független, cím `/adventi-naptar?elonezet=ÉÉÉÉ-HH-NN`).
  2. #172: új őr-teszt `source/tests/advent-flag-sweeper-guard.test.ts` — bukik, ha a `render.yaml` `ADVENT_CALENDAR` értéke `on`, de a
     `startAdventSweeper` hívása nincs a szerver indulási útján (a `source/server/player/sweeper.ts` bekötésének helyén). A
     `render.yaml` megjegyzése: a korlátok példányonként számolnak.
  3. #171: az adventi terv E21 szövegét igazítsd: kikapcsolt flagnél a CSRF nélküli POST 403 (mellékhatás nélkül).
  4. #166: a `source/tests/advent-calendar.spec.ts`-ben (a PR-C / S6 hozza létre; a mainen még nincs) bejelentkezett játékos esete; ha az e2e-szerveren a `PLAYER_ACCOUNTS` csak
     specenként kapcsolható, kapcsold BE abban a specben; ha nem lehetséges, NOT RUN + ok a PR-ben, és a HTTP-szintű DB-teszt fedje.
  5. A `render.yaml`-ba `ADVENT_CALENDAR=on` kerül ebben a PR-ban (D-11 (a)); a merge csak a tulajdonos előnézeti próbája után,
     legkésőbb november 30-án; a PR-leírás első sora: „ÉLES BEKAPCSOLÁS — tulajdonosi
     jóváhagyás kell a merge előtt”.
- Ellenőrzés (a `source/`-ból): `node --import tsx --test tests/admin-route-guard.test.ts tests/advent-flag-sweeper-guard.test.ts` →
  `fail 0`; `node --import tsx scripts/run-e2e-tests.ts tests/advent-calendar.spec.ts` (gépi zárral) → minden `passed`;
  `npm.cmd run test:learning-db` (gépi zárral) → `fail 0`.
- Kész, ha: 0.5 + a tulajdonos az előnézetben megnézte a december 1-jei és a 24-i állapotot, és a merge-et jóváhagyta.

### A-2 — Advent S5: eredménylevél

- Előfeltétel: PR-B beolvadt. Ág: `feat/advent-s5-eredmenylevel`.
- Lépések: az adventi végrehajtás „S5” (290–311. sor) + „Kiegészítés 5” (a küldés pillanata: végleges eredmény). Hamis küldő
  tesztben (`setAdventSender`).
- Ellenőrzés: `npm.cmd run test:learning-db` → `fail 0` (három címzett → három levél; ismétlés → nincs újabb; bukó küldő → pótolható;
  névtelen → nulla); `node --import tsx --test tests/no-real-emails-guard.test.ts` → `fail 0`.
- Kész, ha: 0.5.

### T-1 — Pontozó: polinom végpont, két számeredmény (#121, #122)

- Ág: `fix/pontozo-polinom-ket-szam`.
- Lépések:
  1. Bukó teszt ELŐBB: a `source/tests/fixtures/scorer-corpus.json`-ba szintetikus pozitív esetek („10x…”, „10x..”, „10x …”,
     „10x.” mondatvégen) és negatív esetek (rossz polinom ponttal); két szám: „30 · 7 210 → két szám”, ellenpár „12 000 egy szám”,
     „2.5x tizedes”. Futtasd: `node --import tsx --test tests/scorer-corpus.test.ts` → az új esetek bukjanak.
  2. `source/shared/polynomial.ts` 203. sor környéke: a záró pontsor / „…” a kifejezés végén ne legyen határ, hanem levágandó
     záró írásjel (a mondatvégi egy pont viselkedése változatlan).
  3. `source/shared/answer-value.ts` 184. sor `GAP_OR_NUMBER` és szükség szerint `source/shared/arithmetic-expression.ts` 10. sor
     `NUM`: műveleti jel után álló „szám szóköz 1–3 jegy” ne olvadjon ezres tagolású számmá, ha a kontextus két eredményt ad (a kanban
     #122 szövegének maradványesete); a „12 000” önálló alak marad egy szám.
  4. Mutációs ellenpróba: vond vissza ideiglenesen a 2. / 3. lépést → a teszt bukik; állítsd vissza.
- Ellenőrzés: `node --import tsx --test tests/scorer-corpus.test.ts` → `fail 0`; `npm.cmd test` → `fail 0` (a kliens
  `isPlayableQuestion` is ezt a kiértékelőt használja); `fill-blank-punctuation.spec.ts` a gate:pr böngészős körében → `passed`.
- Kész, ha: 0.5.

### T-2 — Pontozó: rubrika és visszamásolás (#130, #132)

- Előfeltétel: T-1 beolvadt (közös korpusz). Ág: `fix/pontozo-rubrika-visszamasolas`.
- Lépések:
  1. Keresd meg a rubrika-illesztést: `source/shared/lesson-experience-score.ts` (254. sor környéke) és hívói (`git grep -n "rubric"
     source/shared source/server`); a kanban #130 / #132 teljes szövegét olvasd be (`kanban.mjs show 130`, `show 132`).
  2. Bukó teszt ELŐBB a korpuszba: „nem tudom” → 0; „hát” a „hat” helyett → 0; csak a kérdés szavait ismétlő válasz → 0; ellenpár:
     tömör, helyes igen / nem / szám válasz → a mai pont.
  3. Javítás: az ékezet nem hajtható össze a rubrika-szóban (Oldalszál-döntés SK1b F2 szelleme: „kor ≠ kór”); a kérdés szövegéből
     átvett szavak nem adnak rubrika-találatot.
  4. Mutációs ellenpróba.
- Ellenőrzés: `node --import tsx --test tests/scorer-corpus.test.ts tests/open-answer-short.test.ts` → `fail 0`.
- Kész, ha: 0.5.

### I-1 — Kliens-IP hamisítás (#169)

- Ág: `fix/kliens-ip-cloudflare-ut`.
- Lépések:
  1. Olvasd: `source/server/lib/client-ip.ts` (teljes), `docs/specs/2026-11-10-korlat-kliens-ip.md` és párja,
     `scripts/qa/set-proxy-secret.mjs`, kanban `show 169`.
  2. A szelet tervében mérd fel és válaszd ki: hogyan igazolható a Cloudflare-út (a Vercel-úthoz hasonló jel), vagy a
     közvetlen Render-elérés elzárása szükséges-e (éles beállítás → a PR-ben „Tulajdonosi teendő”, az ügynök nem állítja).
  3. Bukó teszt ELŐBB: `RENDER=true`, igazolatlan kérés hamis `CF-Connecting-IP`-vel → a kulcs NEM a fejléc értéke.
  4. Javítás; a meglévő Vercel-út tesztjei változatlanul zöldek.
- Ellenőrzés: a kliens-IP egységtesztje (`git grep -l "resolveClientIp" source/tests`) → `fail 0`.
- Kész, ha: 0.5; éles beállítás-igény esetén a tulajdonosi teendő a PR-ben pontosan leírva.

### I-2 — Kisfilm memória (#418)

- Ág: a meglévő `kisfilm-memoria-javitas` (PR #418).
- Lépések: `git merge origin/main`; ütközésnél a main `source/server/lesson-clips.ts` újabb változásai megmaradnak; a PR-leírás
  „Független ellenőr” sora az új fejre; 0.3 3–8.
- Ellenőrzés: `node --import tsx --test tests/lesson-clip-worker.test.ts` (ha a név eltér: `git grep -l lesson-clip source/tests`)
  → `fail 0`.
- Kész, ha: 0.5. Az első éles memóriamérés NEM része: az a kisfilm-kapcsoló engedélyezett visszakapcsolása után, a PR-leírás
  kikapcsolási feltételével.

### T-3 — Eredménylevél kézbesítési szélei

- Előfeltétel: #510 beolvadt. Ág: `fix/eredmenylevel-szelek`.
- Lépések:
  1. Olvasd: `source/server/lesson-result-email.ts` (a #510 utáni main), `source/server/resend.ts`, kanban `show` 127, 128, 135, 137,
     139, 189, 190, 191. Döntsd el tételenként, hogy a #510 már lefedi-e (fájl:sor a PR-leírásba); a lefedettek kimaradnak.
  2. Óravezérelt bukó tesztek ELŐBB a `source/tests/learning-db.integration.ts`-be (és egységtesztbe, ahol DB nem kell):
     #189 (1–7 nap közti késői pillanatkép), #190 (jelzőírás-hiba + újraindítás), #191 (külön kulcstér), #128 (kézbesített, de
     időtúllépéses szolgáltatói válasz → újrapróba ugyanazzal az idempotencia-kulccsal, egy levél).
  3. Javítás; #127: `errorClass` a három régi naplósorban; #135: vagy tartós várakozó-tár, vagy őr-teszt, amely bukik, ha a
     `render.yaml` példányszáma 1 fölé megy (a kisebb változás választandó, indokkal).
- Ellenőrzés: `npm.cmd run test:learning-db` (gépi zárral) → `fail 0`; `node --import tsx --test tests/no-real-emails-guard.test.ts`.
- Kész, ha: 0.5.

### Q-1 — Szkriptkapuk P2: bizonyítéklánc + munkafánkénti napló

- Előfeltétel: #517 és #513 beolvadt. Ág: a meglévő `chore/szkriptkapuk-p2-bizonyitek-lanc` friss mainnel.
- Lépések: a #517-tel beolvadt `docs/specs/2026-11-17-szkriptkapuk-teljes-vertikum-vegrehajtas.md` P2 fejezete; kiegészítés: a
  kapunapló útvonala munkafa- és fejfüggő, forgatással (C-75). Bukó teszt ELŐBB: két párhuzamos `writeLog` két munkafából → két külön
  fájl.
- Ellenőrzés: `node --test scripts/qa/gates/lib.test.mjs scripts/qa/gates/pre-pr-gate.test.mjs scripts/qa/gates/pre-merge-gate.test.mjs`
  → `fail 0`. Őr-érintő: saját merge-ablak.
- Kész, ha: 0.5.

### Q-2 — Hook-szelet 1: fail-closed bemenet és lassúság

- Előfeltétel: #520 beolvadt. Ág: `chore/hook-szelet-1`.
- Lépések: tételenként bukó viselkedési teszt ELŐBB (`scripts/qa/hooks/check-quality-gates.test.mjs`, `hook-failure.test.mjs`),
  utána javítás: #158, #160, #176 (érvénytelen / szokatlan bemenet → kapu-köteles parancsra DENY), #159 (ismeretlen eszköznév), #174
  (nem WEBSULI-könyvtárból láncolt alak), #179 (100 000 karakteres kitöltött parancson minden hook < 1 s), #180 (a belső
  git-korlát exportált konstans), #182 (`xit\(` szóhatárral).
- Ellenőrzés: `node --test scripts/qa/hooks/check-quality-gates.test.mjs scripts/qa/hooks/hook-failure.test.mjs
  scripts/qa/hooks/settings-hooks.test.mjs` → `fail 0`; élő próba új munkamenetben a `docs/minosegkapuk.md` 117–121. sora szerint.
- Kész, ha: 0.5.

### Q-3 — Kapu: squash-követő háromfázisú hamis bukás, lépés-időkorlát

- Előfeltétel: `fix/kapu-gyorsitas` beolvadt. Ág: `fix/kapu-squash-idokorlat`.
- Lépések: #144 — `scripts/qa/three-phase-check.mjs`: a `merge-base..HEAD` listából hagyd ki azt a commitot, amelynek tartalmi
  változása már a mainen van (pl. `git cherry` / patch-id); bukó teszt ELŐBB a `three-phase-check.test.mjs`-be. #168 —
  `scripts/qa/gates/lib.mjs` lépés-futtató: időtúllépésnél „IDŐTÚLLÉPÉS <mp> s” sor, nem „kilépési kód 127”; teszt a
  `lib.test.mjs`-be.
- Ellenőrzés: `node --test scripts/qa/three-phase-check.test.mjs scripts/qa/gates/lib.test.mjs` → `fail 0`. Őr-érintő ablak.
- Kész, ha: 0.5.

## 2. P2 szeletek

- Végrehajtás (2026-11-28; terv `docs/specs/2026-11-19-websuli-potlasok-terv.md` 7.4): (a) `decideThreePhase` új, opcionális
  `upstream` halmaza — a mainen már tartalmilag meglévő commitok (`git cherry <base> HEAD` „-” sorai) kimaradnak a sorrend- és
  fájlvizsgálatból (mért: a squash-beolvadás után régi ágon az első „kódcommit” a már beolvadt szelet commitja volt → hamis bukás);
  (b) `realExec`: időtúllépésnél `code 124` és „IDŐTÚLLÉPÉS <mp> s” sor a 127-es kilépési kód helyett. Bukó tesztek előbb.

### G-21 — Szólétra olvashatóság és nyelvhelyesség (a P1-blokk után — D-16 (a))

- Előfeltétel: nincs (D-05 eldöntve). Ág: `fix/szoletra-olvashatosag-2`.
- Lépések:
  1. Bukó tesztek ELŐBB: (a) `source/tests/hu-accusative-guard.test.ts` — a `source/client/src` `.ts` / `.tsx` fájljaiban nincs
     `${…}t!`, `${…}ot!`, `${…}et!`, `${…}öt!` sablonos tárgyrag; (b) a `word-ladder-readability.spec.ts`-ben: győzelmi cím „Legyőzted
     Villámot!”, előzési felirat „Megelőzted Villámot!”; a válaszgomb-felirat számított `text-shadow` értéke világos gombon `none`; a
     „Te” felirat vízszintes közepe a saját jelölőjétől legfeljebb 24 px-re; a célszavas kérdés szövegében nincs „„…””.
  2. `WordLadderHuEn.tsx`: a 148. sori `RIVAL_NAME` helyett `{ name: "Villám", accusative: "Villámot" }` (egy helyen), a 808. és
     1816. sor ebből olvas.
  3. 1744. sor: a `${HOLD}-label` árnyéka csak sötét háttérnél; világos gombon nincs. A 3D-mód (1789–1797) változatlan.
  4. 1684–1695: a „Te” / „Villám” felirat a jelölővel együtt mozog (vagy a jelölő fölött / alatt), egyenlő állásnál nem fedik egymást.
  5. A célszó D-05 (a) szerint: a szó a mondatban marad, kiemelve (címkeszerű kiemelés a mondaton belül), a nagy külön kártya elmarad,
     „„…”” helyőrző nincs (`source/client/src/lib/wordLadder/focus.ts` + a kérdés-sáv megjelenítése); a teszt: a kérdésszöveg
     tartalmazza a célszót, és nincs külön célszó-kártya.
- Ellenőrzés: `node --import tsx --test tests/hu-accusative-guard.test.ts` → `fail 0`; mutációs ellenpróba (visszaírt `${RIVAL_NAME}t`
  → bukik); `node --import tsx scripts/run-e2e-tests.ts tests/word-ladder-readability.spec.ts` (gépi zárral) → `passed`;
  képernyőkép 827×896 dpr 2,625 nézetben a tulajdonosnak.
- Kész, ha: 0.5 + a tulajdonos képernyőképe a 4 tünetet nem mutatja.

### A-3 — Advent képgyártó utómunka (#200–#203)

- Előfeltétel: minden további fizetős képkör ELŐTT. Ág: `fix/advent-kepgyarto-utomunka`.
- Lépések: bukó tesztek ELŐBB a `source/tests/advent-art-pipeline.test.ts`-be injektálható `fetch`-csel (hálózat és fizetés nélkül):
  #200 (a következő kép várható ára + eddigi tényleges > keret → megáll a hívás előtt), #201 (`generateOne` végponttól végpontig),
  #202 (`--ref` nem létező fájl → azonnali hiba; `media_type` nélküli válasz kezelése; zár a napló olvasása előtt), #203 (SIGINT /
  SIGTERM → a `.run.lock` törlődik; halott pid-ű zár visszavehető). Javítás `source/scripts/design-assets/generate.ts`, `lib.ts`.
- Ellenőrzés: `node --import tsx --test tests/advent-art-pipeline.test.ts tests/design-assets.test.ts` → `fail 0`.
- Kész, ha: 0.5. Fizetős hívás a szeletben NINCS.

### A-4 — Advent S8 értesítő

- Előfeltétel: A-1 beolvadt. Ág: `feat/advent-s8-ertesito`.
- Lépések: az adventi végrehajtás „S8” (416–447. sor) a Kiegészítés 4 és 5 felülírásával (`includePlayers` nincs, HMAC-lenyomat).
- Ellenőrzés: `node --import tsx --test tests/advent-announce.test.ts tests/admin-route-guard.test.ts tests/no-real-emails-guard.test.ts`
  → `fail 0`; `npm.cmd run test:learning-db` → `fail 0`.
- Kész, ha: 0.5 + a levél szövege és a száraz futás leírása a tulajdonosnál; az éles küldést a tulajdonos indítja a panelről.

### A-5 — Advent: elsős felolvasás, tételátfedés (#151, #153)

- Előfeltétel: PR-C beolvadt. Ág: `feat/advent-felolvasas-atfedes`.
- Lépések: (1) #151 — a koszorús hét tétel átírása a `source/shared/advent/christmasBank/` alatt úgy, hogy egyik válasza se álljon
  másik kérdésében; a `christmas-validate.ts`-be új ellenőrzés (válasz-szivárgás tételek közt) bukó teszttel ELŐBB. (2) #153 — a
  kérdésnézetben 1. évfolyamnál felolvasó gomb a meglévő lánccal (`source/shared/speech-chain.ts`); hang nélküli eszközön a gomb
  rejtett.
- Ellenőrzés: `node --import tsx --test tests/advent-christmas-bank.test.ts` → `fail 0`; böngészős kör 360×640.
- Kész, ha: 0.5.

### A-6 — Advent DB-kör két folyamatra (#152, #167, #173)

- Előfeltétel: PR-B beolvadt. Ág: `test/advent-db-kor-bontas`.
- Lépések: a `source/scripts/run-learning-db-tests.ts` két független folyamatra bontja a kört (a korlát NEM emelkedik); mérés
  terheletlen gépen.
- Ellenőrzés: `npm.cmd run test:learning-db` → `fail 0`, mindkét folyamat a korlát 70%-a alatt (idő a PR-ben).
- Kész, ha: 0.5.

### G-1 — Kupon-ismétlés felső korlátja (#108, #136)

- Ág: `fix/kupon-ismetles-korlat`.
- Lépések: (1) a szelet tervében rögzítsd a szerződést: a hibázott kuponos tétel legkésőbb hány kérdés múlva tér vissza 8 és 10–12
  tételnél; (2) bukó seedelt teszt ELŐBB (80 seed, 8 / 10 / 12 tétel, lejárt kupon + hibás válasz együtt) a director tesztjei közé
  (`git grep -l "LATE_RETURN_MAX" source/tests`); (3) javítás `source/client/src/game-engine/play/questionDirector.ts` 140. és 241.
  sor környéke.
- Ellenőrzés: `node --import tsx --test tests/<director-teszt>.test.ts tests/brainrot-sim.test.ts` → `fail 0`.
- Kész, ha: 0.5.

### G-2 — Joystick jobb kézre

- Előfeltétel: a Szökőár-ág beolvadt. Ág: a meglévő `feat/joystick-jobb-kez` friss mainnel.
- Lépések: olvasd az ágon a saját tervpárt (`git show feat/joystick-jobb-kez --stat`, `docs/specs/2026-11-18-joystick-jobb-kez*.md`
  — ha nincs, írd meg 0.2 szerint); egyeztesd a Szökőár súgójával (#178); minden joystickos játékban jobb oldali tárcsa, bal oldali
  akciógomb.
- Ellenőrzés: `node --import tsx --test tests/game-touch-controls.test.ts` → `fail 0`; `games-touch-controls.spec.ts` és
  `game-mobile-quality.spec.ts` (gépi zárral) → `passed`, három nézetben.
- Kész, ha: 0.5.

### G-3 — Főoldali maki

> **Pontosítva (2026-11-23, H0 P-007 — `docs/specs/2026-11-23-teljes-hianyleltar.md` 4. pont):** a kompakt kabalasáv ÉS a maki
> prototípus is marad kísérletként; a `HOME_MASCOT` bekapcsolása továbbra is kizárólag tulajdonosi lépés.

- Előfeltétel: nincs (D-12 eldöntve). Ág: a meglévő `feat/kabala-fooldal` friss mainnel.
- Lépések: `git merge origin/main`; a `docs/specs/2026-11-18-kabala-fooldal.md` 10. szakaszába a D-12 (a) válasz (a 2. és 3. kérdés:
  bekapcsolás ellenőrzés után, körbevezetés csak az első látogatáskor); az orr környéke képernyőképen (álló kép + 3 képkocka) a
  tulajdonosnak; a `HOME_MASCOT` bekapcsolása CSAK a tulajdonos „rendben” válasza után (tulajdonosi flag-lépés).
- Ellenőrzés: `node --import tsx --test tests/home-mascot.test.ts tests/home-mascot-flag.test.ts tests/home-mascot-assets-guard.test.ts
  tests/kabala-model-budget-guard.test.ts` → `fail 0`; `home-mascot.spec.ts` (gépi zárral) → `passed`.
- Kész, ha: 0.5 + a tulajdonos az orrot rendben találta.

### G-4 — Élő apróhibák (#64, #109, #111, #141)

- Ág: `fix/jatek-aprohibak`.
- Lépések: tételenként reprodukció (böngésző, a jegy nézetében), bukó teszt, javítás. #141: komment a
  `source/tests/brainrot-sim.test.ts` 182. sora fölé („csak kupon módban érvényes”). #109: a `brainrot-play.spec.ts` B1 / Ú1 esete
  tízszer; ha 10/10 zöld, a jegy a futás kimenetével zárva, kódváltozás nélkül.
- Ellenőrzés: az érintett specek (gépi zárral) → `passed`.
- Kész, ha: 0.5.

### G-5 — Közös motor: órák (#114, #134, #199)

- Ág: `fix/jatekmotor-orak`. Fájlok: `source/client/src/game-engine/play/clock.ts`, `flow.ts`, `loop.ts`, `questionUi.ts`.
- Lépések: bukó tiszta teszt ELŐBB (4 fps és 60 fps ugyanazzal a bemenettel; burkolt director-ablak a flow-ban); javítás.
- Ellenőrzés: `node --import tsx --test tests/game-director.test.ts tests/game-play-question-ui.test.ts tests/game-combo-waves.test.ts`
  → `fail 0`.
- Kész, ha: 0.5.

### G-6 — Közös mérő, HoldButton, kérdés-sáv költség (#86, #98, #102)

- Előfeltétel: G-5. Ág: `fix/jatekmotor-mero-holdbutton`.
- Lépések: #98 G-C (b06 F-01 HoldButton beragadás, F-03…F-08; b05 F-03, F-04 — a visszaellenőrzött lelet-lista szerint); #102 a
  `game-mobile-quality.spec.ts` 827×896 és 896×827 nézettel, főszál-blokk < 50 ms/s; #86 az első hosszú kérdés rajzolási költsége.
- Ellenőrzés: `node --import tsx --test tests/game-touch-controls.test.ts tests/game-prompt-fit.test.ts` → `fail 0`;
  `game-mobile-quality.spec.ts` → `passed`.
- Kész, ha: 0.5.

### G-7 — Szünet alatti rajzolás (#74)

- Előfeltétel: nincs (D-10 (a): szünetben álló, elmosott kép). Ág: `perf/szunet-rajzolas`. Fájl:
  `source/client/src/game-engine/mobile/index.ts` (`requestGameFrame`).
- Ellenőrzés: böngészős mérés: szünetben a képkocka-számláló nem nő, a háttér az utolsó képkocka elmosott álló képe; folytatáskor a
  játék ugyanonnan megy tovább; `game-explanation-pause.spec.ts` → `passed`.
- Kész, ha: 0.5.

### G-8 — Szökőár utómunka

- Előfeltétel: a Szökőár-ág beolvadt. Ág: `fix/szokoar-utomunka`.
- Lépések: 1. a beolvadt fejen ellenőrizd #129 és #178 állapotát (ha zárt: kimarad); 2. #94 ÚA3, ÚA4; #196 betöltés közbeni
  tartalék-díszlet; #197 a figura vízszintes tartománya a valós szélességhez; #186 / #198 profilozás és javítás 4× CPU-lassítással.
- Ellenőrzés: `node --import tsx --test tests/tsunami-mobile.test.ts` → `fail 0`; `game-mobile-quality.spec.ts` (Szökőár eset) →
  `passed`; a mért képkocka-idők a PR-ben.
- Kész, ha: 0.5.

### G-9…G-19 — A játékhullám maradéka

Mindegyik külön szelet, külön ág (`feat/jatek-<j-azonosító>-<rövid-név>`), a `docs/specs/2026-11-16-jatekok-jatekelmeny-vegrehajtas.md`
megfelelő fejezete szerint (sorszámok: terv 7.5). Mindegyiknél kötelező: a fejezet „Elfogadás” pontjai tételesen a PR-ben; a
`docs/minosegkapuk.md` 150–157. sor 1–6. hibatípusára célzott teszt (véletlen válasz, kupon-kimerülés, levágás, a sim a szabályt
méri, győzelem nem fordul vereségre, a megállítási okok nem oldják fel egymást); a közös mobil mérő három nézetben. Kiegészítések:
G-13 (#93 J3c pont), G-15a (#85 K.4 pontjai; a balkezes tükrözés nem készül), G-17 (D-09 (a): a megállással adott válasz rövid
megerősítést kér — második koppintás vagy rövid tartás; bukó teszt ELŐBB: megállás megerősítés nélkül → nincs válasz), G-18 (a pontok
a M-4 pontkönyvből), G-19 (záró mérés az összes G-szelet után; átfogó review PR-kommentként).

### G-15b — Aszteroida egyujjas mód (D-08 (b))

- Előfeltétel: #486 és G-15a beolvadt. Ág: `feat/aszteroida-egyujjas`.
- Lépések:
  1. A szelet tervében rögzítsd a „tudatos célzás” jelét méréssel (pl. a kristály a célzás közepén van legalább X ms-ig, vagy külön
     koppintás a kristályra); a választás indoka a mért véletlen-válasz arány.
  2. Bukó tesztek ELŐBB: seedelt sim-teszt — 80 menet egyujjas módban, automata tüzeléssel, tudatos célzás nélkül → 0 válasz; tudatos
     célzással → menetenként pontosan annyi válasz, ahány célzás; a kérdés megjelenésekor már lenyomott ujj → első válasz csak
     felengedés és új célzás után; a kétujjas mód meglévő tesztjei változatlanul zöldek.
  3. Megvalósítás az Aszteroida oldalon és a #486-tal jött magban (a pontos útvonal a #486 beolvadása után; `git grep -l crystal
     source/client/src`); módválasztó a játék beállításaiban.
  4. Mutációs ellenpróba: a tudatos-célzás feltétel kivétele → a sim-teszt bukik.
- Ellenőrzés: a sim-teszt (`node --import tsx --test tests/<aszteroida-sim>.test.ts`) → `fail 0`; egyujjas érintéses böngészős kör
  360×640 és 844×390 nézetben (`game-mobile-quality.spec.ts`, Aszteroida eset, gépi zárral) → `passed`.
- Vak ellenőr kifejezett megtörési pontja: véletlen válasz automata tüzelésből, tartott ujj, több kristály egymás mellett.
- Kész, ha: 0.5.

### M-1 — Közös játék előfeltétele (#73, #97)

- Ág: `fix/parbaj-kilepes-gb`. Fájlok: `source/shared/duel/room-machine.ts`, `source/tests/rt-room-machine.test.ts`.
- Lépések: bukó állapotgép-teszt ELŐBB (3–4 fő, kilépés a visszavágó alatt); javítás; a #97 G-B leletek tételesen (kanban `show 97`,
  a hivatkozott visszaellenőrzött lelet-lista).
- Ellenőrzés: `node --import tsx --test tests/rt-room-machine.test.ts` → `fail 0`; `duel-online.spec.ts` (gépi zárral) → `passed`.
- Kész, ha: 0.5; utána D-07 (a): `MP_MODE` admin-pilot (a flag-váltás tulajdonosi lépés); a nyilvános bekapcsolás csak az M-5 (JM3b)
  beolvadása után.

### M-2 — JM7c-2, tiltás-holtpont, G-A leletek (#62, #75, #96)

- Ág: `feat/jm7c2-profilkapcsolas`. Részletek: JÁTÉK végrehajtás JM7c (2762).
- Ellenőrzés: `npm.cmd run test:learning-db` (`player-account-db.integration.ts`, `admin-authz-matrix-db.integration.ts`) → `fail 0`.
- Kész, ha: 0.5. Migráció: Drizzle-séma ↔ migráció egyezés a PR-ben.

### M-3 / M-4 — JM8a / JM8b pontkönyv

- Előfeltétel: M-2. Ágak: `feat/jm8a-pontkonyv-szerver`, `feat/jm8b-pontkonyv-kliens`. Részletek: JÁTÉK végrehajtás 2842, 2884.
- Kiegészítés (K-06): játékos-fióknál az eredménykártya a pontkönyv állapotát mutatja, nem a „nincs az értesítő listán” szöveget
  (`source/client/src/hooks/useGameScoreSync.ts:22`, `source/client/src/pages/TsunamiEscapeEnglish.tsx:858`); a régi Google-út
  viselkedése változatlan.
- Ellenőrzés: DB-teszt (pontkönyv írás, ismétlés-szűrés), böngészős kör játékos-fiókkal.
- Kész, ha: 0.5; `PLAYER_POINTS` alapból KI, bekapcsolása tulajdonosi lépés.

### M-5…M-8

JM3b, JM4–JM6, JM9–JM11 a JÁTÉK végrehajtás fejezetei szerint (terv 7.7); az M-5 (JM3b) az `MP_MODE` admin-pilot után indul, a
beolvadása után a tulajdonos kapcsolhat nyilvánosra (D-07 (a)).

M-8 (D-06 (a)), ág `feat/jatekos-kanonikus-cim`: a Gmail-cím kanonikus alakja (pont és +címke nélkül) új oszlopban, egyedi index csak
az új regisztrációkra érvényesítve; bukó DB-teszt ELŐBB (alias-címmel új regisztráció → elutasítás érthető üzenettel); a migráció a
meglévő ütköző fiókokat NEM módosítja, csak listázza (admin-panel lista); automatikus összevonás nincs. Ellenőrzés:
`npm.cmd run test:learning-db` (`player-account-db.integration.ts`) → `fail 0`; Drizzle-séma ↔ migráció egyezés a PR-ben.

### T-4 — Kérdésbank S2–S3 (#71, #149)

- Ág: a meglévő `perf/kerdesbank-karcsusitas-s1` helyett új `perf/kerdesbank-s2`. Részletek: `docs/specs/2026-11-17-kerdesbank-karcsusitas-vegrehajtas.md`.
- Ellenőrzés: `node --import tsx --test tests/game-quiz-contract-cache.test.ts` → `fail 0`; `quiz-bank-scale-db.integration.ts` →
  `fail 0`.
- Kész, ha: 0.5.

### T-5 — Kereső szélei (#142)

- Ág: `fix/kereso-osztaly-szelek`. Fájl: `source/shared/material-title.ts`.
- Ellenőrzés: `node --import tsx --test tests/home-views.test.ts` → `fail 0`; `home-views.spec.ts` → `passed`.
- Kész, ha: 0.5.

### TGM-lánc

Alszeletenként külön ág és PR, a terv 7.6 sorrendjében, a `docs/specs/2026-11-18-tananyag-gyartas-minoseg-vegrehajtas.md` 0. fejezete
(közös szabályok, 0.6 szkript-ellenőr, 0.7 kapcsoló) és a saját fejezete szerint. Kiegészítések: SK3 előtt a TGM-terv SK3 szakaszának
igazítása (külön docs-commit, D-02 (a): új futásidő- és összesített körszám-megállító NEM készül); S10/1 fizetős (≤ 30 USD,
eldobható DB, előtte futásőr); SK1c-ben D-03 (a) — **FELÜLÍRVA (P-066, 2026-11-23): belső kapuhibánál a feldolgozás folytatódik, a naplóban és az eredményben
jelzés („az ellenőrzés nem történt meg”), leállítás csak a fizetős próbafutás keményplafonjánál** — a korábbi szöveg: `enforce` módban a kapu saját hibájánál a lecke vázlat marad (nem publikálódik), és
e-mail megy az adminoknak (bukó teszt ELŐBB: a kapu kivételt dob → a lecke állapota vázlat, egy értesítés ment ki hamis küldővel);
S8c gyártás a tulajdonos indításával; S9-ben a `.agents/skills/websuli-gyartas-analitika/SKILL.md` forrás pótlása
(`node scripts/qa/gates/skills-sync-check.mjs` → zöld) és a D-01 (a) jóváhagyás (néma próbakimondás nélkül; 40 MB / hangverzió + 80 MB
abszolút) átvezetése a TGM-terv D4 / E48 pontjába; S10/2 után kérdés a tulajdonosnak a `STUDIO_SOURCE_VISUALS` bekapcsolásáról, a mért számokkal.

### Q-4 — Hook-szelet 2 (#124, #125, #177, #192–#195)

- Előfeltétel: Q-2. Ág: `chore/hook-szelet-2`. Tételenként bukó teszt ELŐBB, javítás, mutációs ellenpróba.
- Ellenőrzés: mint Q-2. Kész, ha: 0.5.

### Q-5 — Hook-szelet 3 (#120, #164, #175, #181, #184)

- Előfeltétel: Q-4. Ág: `chore/hook-szelet-3`.
- D-13 (a), két rész:
  1. A `.claude/settings.local.json` kikerül a követésből: `git rm --cached .claude/settings.local.json` + `.gitignore`-sor (a helyi
     fájl a gépen megmarad, a fájl tartalmához az ügynök nem nyúl). Teszt: a `settings-hooks.test.mjs` (vagy új őr) bukik, ha a fájl
     újra követett.
  2. A GitHub-MCP PR-nyitó / -összevonó / fájlfeltöltő eszközei a kapu-hook alá: a hook-kód (`scripts/qa/hooks/check-quality-gates.mjs`)
     felismeri ezek bemenetét, és ugyanazt a bizonyítékot követeli, mint a `gh pr create` / `gh pr merge`; viselkedési teszt ELŐBB. A
     `.claude/settings.json` matcher-sorát az ügynök NEM írja: a PR-ban a pontos javasolt sor „Tulajdonosi teendő” címmel.
- Kész, ha: 0.5.

### Q-6 — Szkriptkapuk P3–P5

- Előfeltétel: Q-1. Első commit: #187 és #188 a tervben. Utána P3, P4, P5 külön PR-onként a terv sorrendjében, a régi ágak
  (`chore/kapu-ingadozo`, `chore/kapu-allitas-ellenor`, `chore/kapu-teszt-integritas`) kódja forrásként.
- Kész, ha: 0.5 PR-onként.

### Q-7 — CI ingadozók (#76, #105, #143, #204)

- Ág: `test/ingadozok-4`. Tételenként: tíz futás terheletlen gépen, a terhelt futás elkülönítése, gyökérok; javítás a termékkódban
  vagy állapotra váró tesztben — a mérés szigora nem csökkenhet.
- Kész, ha: 0.5; spec-enként 10/10 zöld a PR-ben.

### Q-8 — Workflow-jogosultság, SHA-rögzítés, súlyok

- Előfeltétel: a Bence-ág beolvadt. Ág: `chore/ci-workflow-szigoritas`. Fájlok: `.github/workflows/ci.yml`, `auto-review.yml`,
  `scripts/qa/e2e-shards.mjs`, `scripts/qa/e2e-shard-weights.json`; teszt `scripts/qa/e2e-shards.test.mjs` (súly nélküli spec → FAIL).
- Kész, ha: 0.5; őr-érintő ablak.

### Q-9 — Állapot-ellenőrzők

- Előfeltétel: Q-1. (a) `chore/allapot-ellenorok`, (b) `chore/kapuk-beepites` — mindkettő friss mainnel, külön PR.
- Kész, ha: 0.5; a kanban-check kimenete a terv 4. szakaszának „kész” jegyeit felsorolja.

### I-3 / I-4 — Perf (#69, #72)

- Ágak: `perf/vercel-cache-elonezet`, `perf/nagy-olvasasok`. Előbb mérő (hívás / méret végpontonként, szintetikus mintán), utána
  javítás. `source/vercel.json` változása: a Vercel-előnézet nem hívja az éles API-t; a design-assets gyorsítótára megmarad.
- Kész, ha: 0.5; előtte / utána mért számok a PR-ben.

### I-5 — Futásidejű szkript-őrök J3–J10

- Alszeletenként külön ág (`feat/or-j<n>-…`). Minden őrnél előre: a termék-belépő (fájl:sor), a szintetikus szerződéses teszt, a
  mutációs ellenpróba. J10 első lépése (K-08): csak olvasó leltár az éles DB tábláinak növekedéséről és a megőrzési szabályokról —
  futtatás csak jóváhagyott olvasó hozzáféréssel; törlés NINCS.
- Kész, ha: 0.5 alszeletenként.

### G-20, Q-10, I-6 (P3)

- G-20: `refactor/szoletra-pacing` — a tárolás külön fájlba, determinizmus-őr; `node --import tsx --test tests/word-ladder-*.test.ts`.
- Q-10: `chore/fo-checkout-frissesseg` — `gate:push` / `gate:merge` WARN, ha a fő checkout HEAD-je ≠ `origin/main`; teszt a
  `pre-push-gate.test.mjs`-be.
- I-6: `chore/vezerles-dieta-2` — `docs/specs/2026-11-17-vezerles-dieta.md` 2. lépcső; link- és hívóleltár előbb.

## 3. Záró teljességellenőrzés (orkesztrátor, az utolsó szelet után)

1. A terv 4. szakaszának minden sora: „kész” merge-hash-sel, vagy „lezárva” indokkal, vagy NOT DONE + ok + kockázat.
2. A 10. szakasz elfogadási pontjai tételesen kipipálva, bizonyítékkal.
3. Kanban: a lefedett jegyek lezárva; új jegy a talált maradékra.
4. Átfogó review PR-kommentként a játékhullám (G-19) és a TGM (S10/2) zárásakor.
5. Retro, `docs/agent-csapdak.md` bővítése, memória- / skill- / kanban- / mappahigiénia (AGENTS.md „Befejezési mandátum”).
