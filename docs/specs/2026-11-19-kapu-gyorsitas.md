# Terv: kapu-gyorsítás — gépi összefésült próba a merge-kapuban, bizonyíték-átvitel főág-beolvasztás után, vak-kör szabály

> Dátum: 2026-11-19 · Állapot: tulajdonosi döntések (kérdőív, 2026-11-19) · Végrehajtás:
> `docs/specs/2026-11-19-kapu-gyorsitas-vegrehajtas.md` · Kanban: #91 (szkriptkapuk), #92 (C-61)

## 1. Probléma (mérve, 2026-11-17…19)

- **C-61 új CI-kör:** ha a main elmozdult a PR CI-ja óta, és a PR repó-szintű őrt / ellenőrzést érint, a `pre-merge-gate` FAIL-lel
  új teljes CI-t kér (a main beolvasztása + push → ~1 órás Playwright E2E). Egy őr-érintő PR így naponta több E2E-kört is fizetett.
- **Bizonyíték-vesztés beolvasztáskor:** a main beolvasztása új fejet ad; a vak ítélet (`review-<fej>`), a `pre-push-<fej>` és a
  `pre-pr-<fej>` a régi fejre szól, ezért a teljes push- / PR-kapu és egy újabb vak kör futott — akkor is, ha a PR saját változása
  bájtra azonos maradt.
- **Vak-kör oszcilláció:** egy doksin hat vak kör futott (#517), mert minden kör a változatlan részben is új, nem blokkoló leletet
  talált, és mindegyik új kört nyitott.

## 2. Cél

- **A)** A merge-kapu a C-61 esetben NEM kér új CI-t: maga futtatja le egy ideiglenes, leválasztott munkafában a PR feje + a friss
  `origin/main` összefésült állapotán (a) az összes őr-tesztet (ugyanaz a kód, amelyet a `pre-push-gate` C-61 lépése már futtat —
  közös modulba kiemelve), (b) a PR által érintett node-os egységteszteket (`source/tests/*.test.ts`) és `scripts/qa` teszteket
  (`*.test.mjs`). Ütközés / piros teszt / nem futtatható → FAIL (fail-closed); zöld → PASS. A bizonyítékba: a futtatott tesztek
  száma, az összefésült fa azonosítója, az időtartam. Cél: ≤ 3 perc.
- **B)** Bizonyíték-átvitel (`carry-over`) főág-beolvasztás után, szkripttel igazolva: ha az új fej egy merge commit, amelynek egyik
  szülője a korábbi, bizonyítékkal rendelkező fej, a másik az `origin/main` egy őse, a merge ütközésmentes (a `merge-tree` ugyanazt a
  fát adja), és a PR saját változása bájtra azonos (`git patch-id --verbatim` a régi és az új diffre), akkor a vak ítélet és a
  `pre-push` / `pre-pr` bizonyíték átvihető az új fejre egy gépi `carry-<fej>` rekorddal — az új fejen ekkor csak az A) szerinti
  összefésült próba fut. Bármi eltér → nincs átvitel.
- **C)** A vak körök szabálya: 1 teljes kör + célzott visszanézés (legfeljebb 3 kör), a gép-zár szabálya és a mai csapdák a
  runbookban / katalógusban.

## 3. Nem cél

- A CI, a `check-quality-gates` hook és a döntési szabályok (`decideMerge` többi lépése) módosítása; az átvitt rekordokat a hook a
  meglévő `ok === true` szabállyal fogadja el.
- E2E / böngészős / DB-teszt az összefésült próbában (az a CI dolga; a próba a node-os teszteket futtatja).

## 4. Megoldás

- **Közös modul** `scripts/qa/gates/merged-probe.mjs`: `mergedProbe(ctx, { head, base, files })` — a `pre-push-gate` eddigi
  `mergedGuardCheck` kódja (ideiglenes munkafa a `.claude/worktrees/_gate-merge-*` alatt, `git merge --no-commit --no-ff`,
  csomópont-hivatkozás a `node_modules`-ra, takarítás jelzésnél is), kiegészítve: a PR-fájlokból választott tesztek
  (`selectProbeTests`), TAP-összesítő a darabszámhoz (`tapCounts`), az összefésült fa (`git write-tree`) és az időtartam. A
  `pre-push-gate` ugyanezt hívja (`head: 'HEAD'`, `files: []`) — viselkedése változatlan.
- **Merge-kapu:** a `decideMainMoved` a „main elmozdult + a PR repó-szintű ellenőrzést érint, és a main a hatókörébe nyúlt / a lista
  nem olvasható” esetben `probeNeeded: true`-t ad; a `main()` ekkor lekéri a PR fejét (`git fetch origin pull/<n>/head`, a hash
  egyezik a `headRefOid`-dal) és a friss maint (a hash egyezik a GitHub `main` csúcsával), lefuttatja a próbát, és a döntés a próba
  eredményén múlik: PASS → „összefésült próba zöld (N teszt, fa, s)”, minden más → FAIL. A hatókör-tábla (`repoWideScopes`) a próba
  kiváltója marad. A hiányzó hatókör-tábla továbbra is FAIL (konfighiba).
- **Átvitel:** `scripts/qa/gates/carry-over.mjs` (`npm run gate:carry -- --from <régi fej> [--to HEAD]`): a feltételek ellenőrzése
  (`checkCarry`), a próba (`mergedProbe`), majd a `carry-<új fej>.json` és az átvitt `review-` / `pre-push-` / `pre-pr-<új fej>`
  rekordok (`carriedFrom`, `carry` mezővel). Csak `ok: true` régi rekord vihető át; a vak ítélet kötelező.

## 5. Ütközés a #513-mal (`fix/merge-kapu-rest`, `2373a3f4`)

A #513 a `pre-merge-gate.mjs` adatgyűjtését (`collectMergeData`) és lépés-összerakását (`mergeSteps`) írja át. A kapu-gyorsítás megy
előbb a főágra; a #513 beolvasztásakor a feloldás: (1) a `decideMainMoved` / `decideMerge` `probe` paramétere marad; (2) a próba a
`main()`-ben a `collectMergeData` UTÁN és a `mergeSteps` ELŐTT fut (a `collectMergeData` adja a `pr.headRefOid`-ot, a `mainSha`-t,
a fájllistát); (3) a `mergeSteps` a `probe`-ot továbbadja a `decideMerge`-nek. Ellenőrzés a feloldás után: a „C-61 / próba” tesztek
és a #513 W1 / V1 tesztjei is zöldek.

## 6. Elfogadás (EARS)

<!-- acceptance-checklist -->
- [ ] AMIKOR a main elmozdult és a PR repó-szintű ellenőrzést érint, a merge-kapu NEM kér új CI-t, hanem az összefésült próba
  eredménye dönt (zöld → PASS a darabszámmal, a fa azonosítójával, az időtartammal; ütközés / piros / nem futtatható → FAIL).
- [ ] A `pre-push-gate` C-61 lépése ugyanazt a modult hívja; viselkedése változatlan.
- [ ] AMIKOR a fej egy ütközésmentes main-beolvasztás, amelynek egyik szülője a bizonyítékkal rendelkező régi fej, és a PR saját
  változása bájtra azonos, a `gate:carry` átviszi a vak ítéletet és a `pre-push` / `pre-pr` bizonyítékot (gépi `carry-` rekorddal);
  bármely feltétel hiányában nem.
- [ ] A vak-kör szabály, a gép-zár szabálya és a mai csapdák a runbookban / a skillekben / a katalógusban.
- [ ] Az összefésült próba ≤ 3 perc (mérve).

## 7. Javítókör a vak review 1. köre (ítélet: NEM) után — koordinátori döntések (2026-11-19)

- **L1 (blokkoló):** a `gate:carry` `--base` kapcsolója megszűnik; az alap mindig a friss `origin/main` (a szkript lekéri, és a csúcsát
  a GitHub szerinti `main`-nel egyezteti; hiba / eltérés → nincs átvitel); a `carry-` rekord a main hash-ét is tárolja. Halmozott
  PR-láncra nincs átvitel (a doksi kimondja).
- **L2 (próba-hatókör):** (a) minden őr; (b) ha a PR VAGY a main elmozdulása `scripts/qa/`, `.github/workflows/`, `.claude/`,
  `.agents/skills/` fájlt érint → a teljes `scripts/qa` kör + `skills-sync-check` + `three-phase-check`; (c) ha a PR ÉS a main
  elmozdulása is érint `source/`-t → a teljes egységkör, különben csak a PR által módosított tesztfájlok. Mérendő a legrosszabb eset
  futásideje (cél ≤ 5 perc).
- **L3:** fork-PR → FAIL („új CI kell”); a próba csak a független ítélet és a kötelező ellenőrzések zöldje után fut; szűrt
  környezet (engedélylista); a `node_modules` hivatkozás marad — a maradó kockázat a doksiban.
- **L4:** a main az őrök alsó korlátja: hiányzó őr → FAIL; őrönként kevesebb teszt, mint a mainen → FAIL; 0 teszt → FAIL.
- **L5:** a maradó kockázat (böngészős regresszió, nem egységtesztelt szemantikus ütközés) az „Ismert korlátok” alatt; a runbook
  pontosan azt írja, amit a kód futtat; az átvitel próbája ugyanazzal a hatókörrel fut.
- **L6:** tesztek: próba-ütközés / piros / 0 teszt / az őrök tényleg futnak; a merge-kapu `main()` bekötése (`mergeDecision`);
  `rec.head === from`; a túlélő mutánsok haljanak meg.
- **L7:** vak-kör szabály: a súlyosságot az ellenőr állapítja meg (nem minősíthető le); jegyre tett lelet → „IGEN, FELTÉTELLEL”, a
  jegyszámokkal a PR-leírásban; a célzott visszanézés a javítás hívóira is kiterjed.
- **L8 / L9:** `NEM` ítélet nem vihető át; a `carriedFrom` mellett a lánc az eredetileg ellenőrzött fejet őrzi (`reviewedHead`,
  `carryChain`); a próba időkorlátja 10 perc; a `gate-pr-<n>` segéd-ref törlődik; hiányzó `node_modules` → érthető üzenet; a PR
  fájllistája 100 fölött lapozott REST-listából (csonka → FAIL).

- **Tulajdonosi döntés (űrlap, 2026-11-19): a próba mércéje „≤ 7 perc + 1 újrafuttatás”.** Mért alap: a valódi eset 145 s; a
  legrosszabb eset (teljes egységkör, 509 fájl) egységrésze 252 s, és egy időérzékeny teszt (`vocab-distractor-overlap` bank-invariáns,
  60 s-os belső korlát) gépterhelés alatt hamisan bukott — kanban **#205** („Összefésült próba (merged-probe): a teljes egységkörben az
  időérzékeny teszt … gépterhelés alatt hamis FAIL-t ad — known-flaky kezelés vagy a korlát mérése a próbában”). A cél ≤ 7 perc a teljes
  egységkörös legrosszabb esetre. A #205 megoldásáig a merge-kapu próbája bukáskor **egyszer** újrafut; az újrafuttatás a naplóban és a
  `merge-probe-<PR>-<fej>` bizonyítékban jelölve (`attempts: 2`, `retried: true`, az 1. futás oka); ha az újrafuttatás is bukik → FAIL;
  kettőnél több futás nincs.

<!-- acceptance-checklist -->
- [ ] AMIKOR a `gate:carry` `--base`-szel indul, 2-es kilépéssel megáll; az alap a friss, GitHubbal egyeztetett `origin/main`, eltérésnél nincs átvitel.
- [ ] A próba hatóköre az L2 szerinti (őrök + feltételes teljes `scripts/qa` / egységkör), a main az őrök alsó korlátja (L4).
- [ ] Fork-PR-en, illetve zöld ítélet / kötelező ellenőrzés nélkül a próba nem fut (FAIL); a környezet szűrt (L3).
- [ ] `NEM` ítélet nem vihető át; a lánc megőrzi az eredeti fejet; 10 perces korlát; a segéd-ref törlődik; a fájllista hiánytalan (L8/L9).
- [ ] A runbook a kód szerinti hatókört és a maradó kockázatot írja; a vak-kör szabály az L7 szerint (runbook, AGENTS, skill, C-76).
- [ ] Minden javítás előbb bukó teszttel; a mutációs ellenpróba mutánsai (a vak ellenőr 9 túlélőjével együtt) elhalnak.
- [ ] A legrosszabb eset próba-futásideje mérve és jelentve (tulajdonosi mérce: ≤ 7 perc).
- [ ] A merge-kapu próbája bukáskor legfeljebb egyszer újrafut, jelölve a naplóban és a bizonyítékban; a második bukás FAIL (#205-ig).

## 8. Javítókör a 3. vak kör (GPT-6.2 Sol, ítélet: NEM, fej `00c939a8`) után

Minden lelet ELŐBB bukó teszttel (a lelet forgatókönyvével); a biztonsági leleteknél (L1, L2, L4) fail-closed.

- **L1:** a helyi próba (PR-kódot futtat) előfeltétele a MEGBÍZHATÓ, pontos fejhez kötött helyi ítélet (`review-<fej>.json`,
  `record-review`); a PR-leírás / komment ítélet-sora a próbát nem indíthatja.
- **L2:** a `gate:carry` nem ír felül a célfejre már rögzített ítéletet: ha `review-<új fej>` létezik → nincs átvitel; a vizsgálat a
  próba előtt ÉS közvetlenül az írás előtt fut, az írás kizárólagos létrehozással (`wx`) — a próba közben rögzített ítélet megmarad.
  A célfejen meglévő `pre-push-` / `pre-pr-` rekordot az átvitel nem írja felül.
- **L3:** a próba hatókörének történeti alapja külön bemenet (`scopeHead`): átvitelnél a régi, ellenőrzött fej; a PR- és a
  main-oldali fájllista a régi fej és a rögzített main SHA elágazási pontjától számolódik.
- **L4:** a próba és az átvitel a rögzített main SHA-t használja (nem a mozgó `origin/main` refet); a próba után a GitHub szerinti
  main újra lekérdezve — elmozdult → FAIL; a futásőr és az RT-állapot a próba UTÁN készül; a `merge-<PR>-<fej>` bizonyíték a
  `mainSha`-t is tárolja, a `check-quality-gates` hook a merge előtt a GitHub szerinti main csúccsal egyezteti (eltérés / hiány → DENY).
- **L5:** a main őr-alapmérése sikertelen (nem 0 kilépés) → FAIL; a korlát a ténylegesen sikeresen lefutott esetekből számol.
- **L6:** teljes QA-körnél a `skills-sync-check` / `three-phase-check` hiánya FAIL.
- **L7:** a próba szintetikus merge-commitot készít (szülők: a PR-fej és a main SHA), és a háromfázisú ellenőrző ezen fut.
- **L8:** futásonként egyedi segéd-ref, a takarítás a lekéréstől kezdve (minden hibaúton); a munkafa-takarítás tesztje a ténylegesen
  lassú futás tárát nézi.
- **L9:** egy monoton határidő a próbára: minden lépés (git is) a fennmaradó időt kapja, lejárt keretnél FAIL, a PASS előtt is
  ellenőrizve; a `merge-probe-` rekord az összidőt, futásonkénti időket és a hatókört is tárolja.
- **L10:** a PR fájllistája mindig a lapozott REST-listából (a régi név is); a próba git-listája `--no-renames`, ellenőrzött kilépéssel.
- **L11:** a `--base=…` alak is 2-es kilépés.

<!-- acceptance-checklist -->
- [ ] L1–L11 mindegyikére bukó teszt a javítás előtt, zöld utána; `gate:stage` zöld az új fejen.
