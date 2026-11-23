# WEBSULI — átadás a Hermes ügynöknek (2026-11-23)

> Készítette: a Claude Code „Felhős szálak összevonása” főszála (session `d097beb9…`), a tulajdonos kérésére: „Állítsd le a futást, és
> készíts egy nagyon-nagyon részletes handoffot és terveket, előélet-leírást egy nagy MD-fájlban, amit át tudok adni a Hermész ügynöknek,
> hogy innen folytassa a munkát. Pusholj föl a repóba mindent.”
>
> A futás 2026-11-23 kb. 11:00-kor LEÁLLÍTVA: minden háttérsor, kapu és vak kör áll, az árva folyamatok és az eldobható e2e-adatbázis
> eltávolítva, a kapusor-zár felszabadítva. A dokumentum ténymegállapításai a leállításkori állapotot írják le (főág: `fcf033ee`).

## Tartalom

0. Gyors indulás (az első 10 lépés)
1. A tulajdonos kötelező szabályai (összefoglaló)
2. Környezet, eszközök, parancsok
3. A főág állapota — mi olvadt be 2026-11-22/23-án
4. Nyitott PR-ok — állapot és pontos következő lépés
5. Ág- és munkafa-leltár
6. A főterv (H1–H9) és a részletes következő szeletek
7. Tulajdonosi döntések (meghozott) és döntési pontok (várnak)
8. Hibajegyzék — nyitott tételek
9. Tanulságok és csapdák (a 2026-11-22/23-i futásból)
10. Vak ellenőri körök: mérleg, költség, gyorsítótár
11. Kockázatok
12. Az átadott anyagok (melléklet-mappa)
13. Leállított folyamatok és a félbeszakadt lépések folytatása (2026-11-23 ~11:50)

---

## 0. Gyors indulás (az első 10 lépés a Hermes számára)

1. Olvasd el az 1. és a 9. fejezetet (szabályok, csapdák) — ezek a hibák TÉNYLEGESEN megtörténtek, ne ismételd őket.
2. `git -C D:/repo/WEBSULI fetch --prune`, `git -C D:/repo/WEBSULI pull --ff-only` (a fő checkout legyen friss), `gh pr list --state open`.
3. **Határidő: ADVENT (november 30.).** Első munka: az advent PR-C (4.1 / 6. H1 A1). **FIGYELEM: a fej a leállításkor `f6ea03bd` lett (főág-összefésülés) — a pontos lépések a 13.2/1-ben; az alábbi régi fejre szóló ítélet erre nem érvényes.** A fej (`448d4c5a`) 5. vak köre IGEN, FELTÉTELLEL, az
   ítélet rögzítve; a PR-kapu futás közben állt le → újrafuttatni (`npm run gate:pr -- --body-file docs/handoffs/2026-11-23-hermes/pr-leirasok/advc-pr-body.md`),
   majd push + PR. Utána advent S5+S6, utána a tulajdonos előnézeti próbája (döntési pont D1), utána egysoros bekapcsoló PR.
4. A #540 (S6c-1) befejezése (4.2): követő vak kör a javított fejre, rögzítés, PR-kapu, push, a Copilot-szál megválaszolása és lezárása, CI, merge.
5. Az arányos kapuk PR-ja (`fix/aranyos-kapuk`, 4.3): push-kapu, 2. vak kör (`--previous` az 1. kör jelentésével), PR — ez repó-szintű
   kaput érint, ezért nyitáskor ELSŐKÉNT olvad be (C-61), addig más ne menjen a főágba.
6. Ezután a főterv sorrendje (6. fejezet): S6c-2, SK2, B2…B8, kisfilm-bontások, kapurendszer (K3 vak futtató a főágra), pótlási terv.
7. Minden szelet: terv (`docs/specs/`) → végrehajtási utasítás (`*-vegrehajtas.md`, a kód ELŐTT commitolva) → kód → `gate:stage` →
   `gate:push` → vak kör (kivétel: kis javítás, ha az arányos kapuk már a főágon vannak) → `record-review` → `gate:pr` → push → PR →
   botok leletei (egy pushban, szálanként válasz + lezárás) → zöld CI → `gate:merge` → merge → fő checkout `pull --ff-only` → munkafa és ág törlése.
8. Minden beolvasztás után: a főterv végrehajtási fájljának állapotnaplója (`docs/specs/2026-11-23-foterv-vegrehajtas.md`), a hibajegyzék,
   és egy rövid bejegyzés a retró-naplóba (a mellékletben a Claude-oldali memória másolata).
9. Kérdés a tulajdonosnak MINDIG űrlapszerűen, opciókkal és megjelölt, indokolt javaslattal (az ajánlott opció elöl, „(Javasolt)”).
10. Magyarul kommunikálj a tulajdonossal.

---

## 1. A tulajdonos kötelező szabályai (összefoglaló — a forrás az `AGENTS.md` és a melléklet memóriája)

- **Nyelv:** a tulajdonossal minden üzenet magyar; a kód-azonosítók angolok.
- **Háromfázisú munka:** terv (`docs/specs/<dátum>-<név>.md`) → AI-olvasható végrehajtási utasítás (`*-vegrehajtas.md`, a terv teljes útjára
  hivatkozva) → kód. A végrehajtási fájl változása KORÁBBI commitban legyen, mint a kód (a `three-phase-check` a sorrendet is nézi; meglévő
  terv szeleténél is kell egy megvalósítási jegyzet a végrehajtási fájlba).
- **Befejezési mandátum:** félbehagyás tilos; minden kérés tételesen ellenőrzőlistára; a munka végén tételes teljesség-ellenőrzés.
- **Minőségkapuk (megkerülhetetlenek, `docs/minosegkapuk.md`):** `npm run gate:stage` (szakaszonként) → `gate:push` → független (vak)
  ellenőr + `node scripts/qa/gates/record-review.mjs` → `npm run gate:pr -- --body-file <leírás.md>` → push → PR → zöld CI → közvetlenül a
  merge előtt `npm run gate:merge -- <PR>`. A kaput megkerülni tilos; ha a kapu hibás, a kaput kell javítani (teszttel). `git --no-verify` TILOS.
- **Vak, hibakereső ellenőr:** csak a követelményt és a kódot kapja (a fejlesztő jelentését nem), feladatra szabott hibakereső pontokkal; a
  jelentésben kötelező a „Mit próbáltam megtörni” és a „Mit NEM vizsgáltam”. Modell: GPT-6.2 Sol (OpenRouter `openai/gpt-6.2-sol`,
  `reasoning.effort: high`), kulcs csak környezeti változóból (`OPENROUTER_API_KEY`), soha kiírva. A futtató helye: 2.3.
- **Konvergencia-törvény:** ugyanazt a hibát tilos ugyanúgy újra elkövetni; 3 egymást követő NEM, vagy 2 NEM nem csökkenő blokkolószámmal →
  nincs új kör: követelmény egy mondatban, hibaosztály-leltár, kisebb szelet, internetes szakmai forrás, végül tulajdonosi döntés.
  `--owner-override` CSAK a tulajdonos szó szerint idézett, űrlapon adott döntésével (2026-11-23-án egyszer jogosulatlanul próbáltam — a rendszer megtagadta).
- **Arányosság (tulajdonos, 2026-11-23):** kis javítás = legfeljebb 30 sor ÉLES kód (teszt és dokumentáció nem számít) — ehhez nem kell
  fizetős vak kör; a helyi push-kapu csak a kapcsolódó teszteket futtassa, a teljes készlet a GitHub CI-é. A kapukódban ez a
  `fix/aranyos-kapuk` ágon van (MÉG NINCS a főágon) — addig a mai főági kapuk minden PR-hoz ítéletet kérnek.
- **Prompt-gyorsítótár (tulajdonos, 2026-11-23, kötelező):** minden vak kör után ellenőrizni a „gyorsítótár-találat a 2. hívástól” értéket
  (cél ≥ 80%; mért átlag 93%); a legnagyobb megtakarítás a fölösleges kör elkerülése.
- **Titok:** titkot soha chatbe / kódba / commitba / naplóba; titokfájlt csak másolni, kiolvasni nem.
- **Destruktív / külső művelet:** env-kapcsolók élesítése (`STUDIO_LESSON_VARIETY`, `STUDIO_SOURCE_VISUALS`, `ADVENT_CALENDAR`,
  `LESSON_CLIPS_AUTO`, `MP_MODE`) MINDIG a tulajdonos lépése; fizetős modellfutás csak jóváhagyással; éles adat törlése csak jóváhagyással.
- **Git:** feature-ág → PR → zöld CI → merge (squash, `--match-head-commit <teljes sha>`). A push / PR / merge parancs önállóan fusson a
  munkafa gyökeréből (láncolás, `cd`, `-C`, átirányítás nélkül; PR-leírás `--body-file`-lal); közvetlenül előtte külön parancsban
  `touch .audit-ok` (a munkafában ÉS a fő checkout gyökerében).
- **Futás végi hurok (globális szabály):** retró a retró-naplóba, csapda a `docs/agent-csapdak.md`-be, memória, tapasztalat-kanban,
  skill-döntés, higiénia (beolvadt ágak / munkafák törlése; távoli ág csak jóváhagyással), gépi ellenőrző.

---

## 2. Környezet, eszközök, parancsok

### 2.1 Repó és munkafák

- Repó: `D:\repo\WEBSULI` (GitHub `kosazoltan/WEBSULI`), főág `main`. A fő checkout a `main`-en áll; a munka munkafákban folyik:
  `D:\repo\WEBSULI\.claude\worktrees\<név>` (5. fejezet). Új munkafa: `git worktree add -b <ág> .claude/worktrees/<név> origin/main`, majd
  `npm.cmd ci` a `source/` alatt (a `node_modules`-t másolni tilos — ARM64 / x64).
- Kapu-bizonyítékok: `<git-common-dir>/websuli-qa-evidence/` (`pre-push-<sha>.json`, `pre-pr-<sha>.json`, `review-<sha>.json`,
  `merge-<pr>-<sha>.json`). A Claude Code `check-quality-gates` hookja push / PR / merge előtt ezeket olvassa.
- **A hookok a Claude Code-hoz tartoznak** (`.claude/settings.json` PreToolUse: `check-destructive`, `warn-test-edit`, `check-audit-ok`,
  `check-quality-gates`, `enforce-repo-rules`). Hermesben ezek NEM futnak automatikusan — a Hermesnek magának kell betartania: zöld
  push-bizonyíték nélkül nincs push, zöld PR-bizonyíték nélkül nincs PR, 15 percnél nem régebbi zöld merge-bizonyíték nélkül nincs merge.

### 2.2 Kapuk (a főágon, `package.json`)

| Parancs | Mit futtat ma a főágon | Idő (mért) |
|---|---|---|
| `npm run gate:stage` | lint gyors mód + a változott fájlokhoz leképezett egységtesztek + minden őr-teszt | 25–60 s |
| `npm run gate:push` | tiszta fa, fetch, teljes lint, mindkét tsc, TELJES egységteszt, háromfázisú rend, PR-méret, friss main (C-61), C-62 | ~125 s |
| `npm run gate:pr -- --body-file <md>` | PR-leírás sablon, ítélet, a push-kapu MINDEN lépése újra, build, a változott komponenst említő böngészős tesztek (a #538 óta szóhatárral), DB-teszt szerverváltozásnál | 2–6 perc + böngészős út |
| `npm run gate:merge -- <PR>` | CLEAN, kötelező ellenőrzések a fejen, 0 nyitott szál, C-61, ítélet, futásőr, telepítés-jelzés, rt-állapot | ~40 s |

A `fix/aranyos-kapuk` ág ezt arányossá teszi (4.3): célzott push-egységteszt, a PR-kapu nem ismétli a push-kaput ugyanarra a fejre, kis javítás ítélet nélkül.

**PR-leírás kötelező szakaszai** (a `gate:pr` buktat nélkülük): `# Összefoglaló`; `## Elfogadás` `- [x]` tételekkel; `## Futtatott
ellenőrzések` (parancs + valós eredmény); egy `Nem futtatott + ok:` sor; `Független ellenőr ítélete: <IGEN | IGEN, FELTÉTELLEL> (fej: <12 hex>)`;
az agentic-qa-kit ellenőrzőlista; lábléc. Minta: `docs/handoffs/2026-11-23-hermes/pr-leirasok/*.md`.

### 2.3 Vak ellenőr futtató (NINCS a főágon!)

- Helye: munkafa `.claude/worktrees/vak-v2`, ág `chore/vak-ellenor-konvergencia` (fej `3072389a`; CSAK HELYBEN — a push-kapuja
  nem futott le, lásd 13.). Ez a kanonikus változat (blokkoló-definíció, `--previous` követő kör, beépített
  konvergencia-őr). A `chore/vak-ellenor-deepseek`, `chore/vak-futtato-1/2` ágak régebbi alternatívák — a K3 után törölhetők.
- Futtatás (a `vak-v2` munkafából):
  ```bash
  node scripts/qa/gates/blind-review/blind-review.mjs --base origin/main --head <40 hex> \
    --spec <terv.md> --goal <cél.md> --out <jelentés.md> [--previous <előző1.md,előző2.md>] \
    --node-modules /d/repo/WEBSULI/source/node_modules --max-usd 3 --max-minutes 40
  ```
  Utána a PR munkafájában: `node scripts/qa/gates/record-review.mjs --head <sha> --verdict "IGEN, FELTÉTELLEL" --report <jelentés.md>`.
- A cél-fájlok (feladatra szabott hibakereső pontok) mintái: `docs/handoffs/2026-11-23-hermes/vak-jelentesek/cel-*.md`.
- Kilépési kód 4 = a konvergencia-őr megállította (nincs új kör).

### 2.4 Segédszkriptek (a mellékletben is: `szkriptek/`)

- `websuli-kapusor.sh` — kapusor-zár: egy gépen egyszerre EGY helyi kapu / böngészős kör / vak kör fusson (`source …; kapusor_be "<név>"`).
- `websuli-doc-insert.py` — régi commit terv-szakaszának beszúrása a terv-dokumentum megfelelő helyére (ütközésfeloldás).
- `websuli-keep-both.py` — ütközés feloldása mindkét oldal megtartásával.
- `websuli-branch-audit.py` — csak olvasó ág-osztályozás (van-e új tartalom a főághoz képest, távoli / csak helyi).
- **Fájlszerkesztő Python-szkriptnél** az írást csak a sikeres átalakítás UTÁN nyisd meg (`out = f(s); open(p,'w').write(out)`) — a
  `open(p,'w').write(f(s))` hibánál ÜRES fájlt hagy (2026-11-23-án egy kapu-fájlt így kiürítettem; `git checkout`-tal helyreállt).

---

## 3. A főág állapota — mi olvadt be 2026-11-22/23-án

| PR | Tartalom | Főági commit | Vak körök |
|---|---|---|---|
| #522 | a régi „Bence / Junior” szereposztás eltávolítása a review-indítóból | `212b2a92` | 1 (IGEN F) |
| #531 | advent: sorsolásfüggetlen teszt | `13899b9a` | 1 (IGEN F) |
| #532 | eredmény-e-mail **B1a** — a szerver elfogadja a kör kezdetét, dátumsor a levélben | `9e292c0f` | 2 |
| #530 | TGM **S5a** — változatos visszajelzés-nyitás kódszótárból (kapcsoló mögött) | `dfe2ac50` | 3 |
| #533 | TGM **S2b-1** — döntési fa és képes kártyák megjelenítője | `ae57953a` | 7 |
| #534 | TGM **S5b** — változatos leckenyitás (forma, hősnév, kevert módszersorrend) | `412854e3` | 3 |
| #535 | TGM **S2b-2** — a forrás-ábrák megjelenítőinek leletei | `f7f94f22` | 3 |
| #536 | TGM **S6a** — fejezetív-készlet (hat minta, determinisztikus kiosztás) | `c87d1706` | 4 |
| #537 | TGM **S6b** — try-minimum és fajta-forgatás, szerzői hangok | `49397146` | 2 |
| #538 | kapujavítás: a PR-kapu a böngészős teszteket szóhatárral választja (az adventi PR-re 86 → 27 teszt) | `333a553a` | 3 |
| #539 | eredmény-e-mail **B1b** — a kliens elküldi a kör kezdetét / utolsó válasz idejét; 7 napos korhatár az utolsó válaszhoz | `fcf033ee` | 2 |

Minden TGM-szelet a `STUDIO_LESSON_VARIETY` kapcsoló mögött van (élesben KI): a kiadott leckéken semmi nem változott. A modell
követése (nyitásforma, fejezetminta, try-fajta, hang) NINCS mérve — fizetős próbagyártás kell (döntési pont D2).

---

## 4. Nyitott PR-ok — állapot és pontos következő lépés

### 4.1 Advent PR-C — még NINCS PR (ág `feat/advent-c-felulet-es-elesites`, munkafa `advent-c`, fej `448d4c5a`)

- Tartalom: S3 naptároldal (24 ablak, kérdés, javítás ablakonként legfeljebb 2, összesítés a szó szerinti záró üzenettel), S4 szezonális
  főoldali kártya (telefonon ≤ 132 px), élesítés előtti javítások (terv 22. szakasz). Kapcsoló: `ADVENT_CALENDAR` (élesben KI).
- Vak körök: 1. NEM (2 blokkoló) → 2. NEM (1) → 3. IGEN F (`d53178ef`) → 4. IGEN F (`1adcfef5`) → a #538 beolvasztása után 5. IGEN F
  (`448d4c5a`, rögzítve: `review-448d4c5a…`). A négy nyitott feltétel (L1–L4: késve érkező átvételi válasz, az „Újra” átvétel-ismétlése,
  átmeneti hibánál elvesző ablaknyitási szándék, a kirajzolhatatlan ablakrácsot átengedő sorőr) az S5+S6 ágon javítva.
- A PR-kapu 2026-11-23-án kétszer bukott, mindkétszer a KAPU hibája miatt (részszó-egyezés → 83/86 böngészős teszt, 60 perces keret).
  A #538 ezt javította. A 3. futás (27 teszt) a leállításkor futott — **újrafuttatni**:
  `cd .claude/worktrees/advent-c && npm run gate:pr -- --body-file <docs/handoffs/2026-11-23-hermes/pr-leirasok/advc-pr-body.md>`
  (a leírás ítélet-sora a `448d4c5af940` fejre szól). Zöld → `touch .audit-ok` (munkafa + fő gyökér) → `git push -u origin feat/advent-c-felulet-es-elesites`
  → `gh pr create --base main --head feat/advent-c-felulet-es-elesites --title "…" --body-file …` → botok → CI → `gate:merge` → merge.

### 4.2 #540 — TGM S6c-1 ábrafajta-terv (ág `feat/tgm-s6c1-abrafajta-terv`, munkafa `tgm-s6c1`)

- Távoli fej `ec757d9d` (CI zöld, 2 vak kör: NEM → IGEN F). Helyben 3 commit előrébb: `4b48a327` (a Copilot valós lelete: a leltárban
  nem létező `sourceVisualId` saját ábrának számít) + főág-összefésülés `8e5618cf` (push-kapu ZÖLD erre a fejre).
- Következő: követő (3.) vak kör a `8e5618cf` fejre (`--previous review-s6c1/jelentes1.md,jelentes2.md`, cél `cel-s6c1.md`), rögzítés,
  a leírás frissítése (`pr-leirasok/s6c1-pr-body.md`), `gate:pr`, push, a Copilot-szál (comment id `4663711411`) megválaszolása
  („_🤖 Addressed by …_” zárósorral) és lezárása, CI, `gate:merge`, merge.

### 4.3 Arányos kapuk — még NINCS PR (ág `fix/aranyos-kapuk`, munkafa `aranyos-kapuk`, fej `5317d597`)

- Terv: `docs/specs/2026-11-23-aranyos-kapuk.md` + végrehajtás. Tartalom: kis javítás (≤ 30 sor éles kód; csak éles kód / teszt /
  dokumentáció; NUL-határolt numstat; a merge-kapu a GitHub REST fájllistájából, bináris és átnevezés régi útja is) → ítélet nélkül PASS;
  célzott push-egységteszt (leképezett + őr; teljes készlet leképezetlen / közös / törölt kódfájlnál); a PR-kapu tiszta fán nem ismétli a
  push-kaput ugyanarra a fejre; build csak böngészős út nélkül. 129 kapu-teszt zöld, szakaszkapu zöld.
- 1. vak kör NEM (9 blokkoló): hat javítva, az ítélet-átvitel (A7) KIVÉVE külön szeletre (a helyi review-rekord nincs PR-hoz kötve; a
  főágból jött azonos fájlú sorok; egy újabb `NEM` sorrendje). 2. kör NEM futott le (leállítás).
- Következő: `gate:push` → 2. vak kör (`--previous review-aranyos/jelentes1.md`, cél `cel-aranyos.md`) → rögzítés → `gate:pr` → PR. Mivel
  `scripts/qa/`-t érint, nyitáskor ELSŐKÉNT olvad be (C-61).

### 4.4 A többi nyitott PR

| PR | Ág | Állapot | Következő lépés |
|---|---|---|---|
| #529 | `fix/kisfilm-videomodell` | 3 vak kör NEM; helyben +4 commit (`9c46b4a7`) | tulajdonosi döntés: BONTÁS (modellcsere + naplóvédelem / élesítési eljárás egyjelenetes próbával) — bontási terv még nincs |
| #527 | `feat/zaro-hurok-2` | záró hurok 1/3; a `feat/zaro-hurok-3` (helyben, munkafa `zaro-hurok`) erre épül | sorban beolvasztani (zh-2 → zh-3); a csapdafájl ütközik |
| #521 | `fix/kitakaro-negyzetes-regex` | nem konvergált (6 kör); helyben +32 | a tulajdonos döntése „szűkítés + bontás”: helyette `fix/kitakaro-elovagas` (helyben, 1 vak kör) |
| #513 | `fix/merge-kapu-rest` | 3 kör NEM; helyben +29 (`87ccd6c3`) | bontási terv kell (mely lelet melyik rész-PR-ba) |
| #510 | `fix/eredmeny-email-kviz` | 14 kör NEM → bontás 9 szeletre (B1a, B1b kész) | a PR a bontás forrása; B2…B8 a főágból, kézi átvétellel (6. H4) |
| #486 | `feat/jatek-j6a-aszteroida-kristaly` | 2026-11-19 óta áll; helyben +38 (4. vak kör) | a főág beolvasztása, kapuk, folytatás (H8) |
| #484 | `feat/jatek-j3a-kockavadasz-runabanya` | 2026-11-17 óta áll; helyben +33; ütközés a `BlockCraftQuiz.tsx`-ben | ütközésfeloldás, kapuk (H8) |

---

## 5. Ág- és munkafa-leltár (leállításkor)

„Távoli” = a távoli ág létezik; zárójelben a helyben előrébb járó commitok száma. A tulajdonos kérésére az ágak push-kapu sorát
leállítottam (13. fejezet): a távolira EZEN AZ ÁGON KÍVÜL egyetlen munkaág sem került fel. Minden csak helyi ágról helyi köteg-mentés van:
`C:\Users\kosaz\websuli-mentes\websuli-helyi-agak-2026-11-23.bundle` (236 MB).

| Munkafa | Ág | Fej | Állapot | Tartalom / következő lépés |
|---|---|---|---|---|
| advent-c | feat/advent-c-felulet-es-elesites | 448d4c5a | csak helyi | advent PR-C (4.1) |
| advent-s6 | feat/advent-s5-s6-elesites | 33d70e72 | csak helyi | advent S5 eredménylevél + S6 admin-előnézet és takarító; ráépül az advent-c-re; 1 vak kör; a `render.yaml` szándékosan nem változik |
| aranyos-kapuk | fix/aranyos-kapuk | 5317d597 | csak helyi | arányos kapuk (4.3) |
| tgm-s6c1 | feat/tgm-s6c1-abrafajta-terv | 8e5618cf | távoli (+3) | #540 (4.2) |
| tgm-s6c | feat/tgm-s6c-v2 | 87d74636 | csak helyi | a régi, egyben-S6c (megjelenítők + ábrafajta-terv); 1. vak kör NEM (5 blokkoló a megjelenítőkben) — az S6c-2 FORRÁSA |
| tgm-sk2 | feat/tgm-sk2-v2 | 05e5c569 | csak helyi | SK2 (változatosság mérőszáma, kapuja `report` módban, mérőszkript); a régi egyben-S6c-re épül → az S6c-1 / S6c-2 után át kell ültetni |
| vak-v2 | chore/vak-ellenor-konvergencia | 3072389a | csak helyi | a vak futtató kanonikus változata (2.3); K3: főágra vitele két PR-ban |
| vak-futtato-1 / -2 | chore/vak-futtato-1 / -2 | 4792922b / ab7ed9b1 | csak helyi | a deepseek-ág bontása (régebbi); a K3 után törölhető |
| vak-ellenor-deepseek | chore/vak-ellenor-deepseek | 784e1dca | csak helyi | az eredeti egyben-változat; a K3 után törölhető |
| eredmeny-510 | fix/eredmeny-email-kviz | 389ea8c3 | távoli (+13) | #510, a B2…B8 forrása |
| eredmeny-bontas | docs/eredmeny-email-bontas | e84bafd6 | csak helyi | a bontási terv (a főágon már bent a B1a-val) — törölhető, ha a tartalma azonos |
| kisfilm-videomodell | fix/kisfilm-videomodell | 9c46b4a7 | távoli (+4) | #529 |
| kisfilm-leallitas | fix/kisfilm-leallitas-hatarido | 632f4d9c | csak helyi | a #418 követő munkája (zár-életciklus, megszakítás); záró kör NEM → bontás; a gyártás élesben KI |
| merge-kapu-rest | fix/merge-kapu-rest | 87ccd6c3 | távoli (+29) | #513 |
| kitakaro-521 | fix/kitakaro-negyzetes-regex | 904203c2 | távoli (+32) | #521 |
| kitakaro-elovagas | fix/kitakaro-elovagas | 6ead8cfe | csak helyi | a #521 bontása (elővágás); 1 vak kör |
| szoletra-szintezes-2 | feat/szoletra-szintezes-2 | 75edf6ca | csak helyi | Szólétra S2: évfolyam-sávos belépés (a #528 utódja); a spec-fájlok ütköznek |
| szoletra-a1-bank | feat/szoletra-a1-bank | 459edfbc | csak helyi | Szólétra S3: +897 A1 szó (en/de/fr), fizetős generálással (7,34 USD a commit szerint) — a keret-jóváhagyás UNVERIFIED (D5) |
| szoletra-szintezes | feat/szoletra-szintezes | d1f5dbb3 | csak helyi, 2 commitolatlan doksi | régi egyben-változat; a két doksi (ND-döntések) átmentendő a -2 ágra |
| zaro-hurok | feat/zaro-hurok-3 | d13fa351 | csak helyi | záró hurok 3/3 (zh-1 → zh-2 → zh-3 lánc) |
| docs-potlasok | docs/websuli-potlasok | 131add44 | csak helyi | a pótlási terv (68 tétel, 50 szelet) — ezzel az átadással a dokumentumok a főágra kerülnek (átadó PR) |
| gepkoltoztetes-folytatas | docs/gepkoltoztetes-folytatas | fde09388 | csak helyi, 1 commitolatlan doksi | a 2026-11-21-i gépköltöztetési terv naplója; a főterv felülírta |
| teljes-revizio | docs/teljes-revizio | 9997ee79 | csak helyi | GPT-revízió (`docs/revizio/00–05`, +34 404 sor) |
| advent-kepgyarto | chore/advent-s3c0-kepgyarto | bbabfc49 | csak helyi | elavult (a #519 előd-ága) — higiéniai jelölt |
| foterv | docs/foterv-2026-11-23 | 7f70c61f | csak helyi | a főterv — ezzel az átadással a főágra kerül (átadó PR) |

Régi, munkafa nélküli helyi ágak (a köteg-mentésben benne vannak): pl. `fix/pontozo-polinom-ket-szam` (T-1), `fix/kliens-ip-cloudflare-ut`
(I-1), `chore/szkriptkapuk-p2-bizonyitek-lanc` (Q-1), `feat/joystick-jobb-kez`, `feat/kabala-fooldal`, `fix/szokoar-tema-es-sebesseg`,
`fix/kapu-gyorsitas`, `feat/gepi-zar`, `fix/hang-elomelegites`, `fix/idozitesfuggo-tesztek`, `feat/jatek-j7b-tornado-utelagazas` (távoli).

---

## 6. A főterv (H1–H9) és a részletes következő szeletek

Forrás: `docs/specs/2026-11-23-foterv.md` + `-vegrehajtas.md` (ezzel az átadással a főágra kerül). Sorrend-elv: a határidős hullám elöl;
egy gép = egy kapusor; közös fájlt (terv-dokumentum, `docs/agent-csapdak.md`) érintő PR beolvadása ELŐTT nem indul vak kör a következőn;
repó-szintű kaput érintő PR ELSŐKÉNT olvad be.

### H1 — Advent (határidő november 30.; terv `docs/specs/2026-11-18-adventi-naptar.md` + végrehajtás)
1. **A1 PR-C** — 4.1.
2. **A2 S5+S6** (`feat/advent-s5-s6-elesites`): az A1 beolvadása után `git merge origin/main` (ütközés várhatóan a `docs/agent-csapdak.md`-ben —
   mindkét oldal marad), `gate:stage`, `gate:push`, vak kör (`--previous` a `vak-jelentesek/review-advs6/jelentes1.md`-vel), PR.
3. **A3 előnézeti próba** — D1 döntési pont (űrlap): a végleges képek (S3c) nincsenek kiválasztva, a felület helyőrző rajzot mutat.
4. **A4 bekapcsoló PR** — egy sor a `render.yaml`-ban, CSAK a D1 igenje után.
5. Utána (ha a tulajdonos kéri): S3c végleges képek, S8 értesítő, A-5.

### H2 — TGM változatosság (terv `docs/specs/2026-11-20-tgm-valtozatossag-abrak.md` 12–17. szakasz; `2026-11-18-tananyag-gyartas-minoseg.md`)
1. **#540 S6c-1** — 4.2.
2. **S6c-2 megjelenítők** — új ág a főágból; a forrás a `feat/tgm-s6c-v2` megjelenítő-része (`client/src/lesson-runtime/blocks/variety-visuals.tsx`,
   `animate-blocks.tsx`, `lesson-design.css`, `lesson-visual-params.ts` `visualParamsContract`). Előfeltétel az S6c 1. vak körének öt
   blokkolója (`vak-jelentesek/review-s6c/jelentes1.md`): jelöletlen leckén MIND A HAT fajta a régi megjelenítőt kapja; a szóépítő nem állít
   hamis összeolvasott szót (`alma + -t ≠ almat`); az áltört a valódi egészrészt és maradékot mutatja; a térképpontok nem esnek egybe;
   a kisfilm-ráúszóban a magas idővonal nem vágódik le. Fajtánkénti böngészős próba 360×640 / 844×390 / 1280×800.
3. **SK2** (`feat/tgm-sk2-v2` átültetése a főágra az S6c-1 / S6c-2 után): `shared/variety-metrics.ts`, `gates/variety-gate.ts` (`report`),
   mérőszkript; a régi előtag-számolás az S5a-v2 szabályával (`startsWithLegacyOpener`).
4. **Mért próbagyártás** — D2 (fizetős, keret).
5. **S3a / S3b** (csak terv van): az ábrakészítő a forrástételeket előbb jelenítse meg; szókeret, szerző / lektor / bank forrástételekkel;
   `GATE_MODES.sourceCoverage` → `enforce`. D3: a forrás-fa 4 szint × 4 ág kontra a megjelenítő 3 szint / 13 csomópont.
6. **Követő jegyek** a beolvadt PR-okból (8. fejezet H-16).

### H3 — Kapurendszer
1. **Arányos kapuk** — 4.3.
2. **K3**: a vak futtató a főágra a `vak-v2` változatból (futtató; kapu- és hook-kötés + `websuli-vak-ellenor` skill + runbook).
3. **K2 / A7**: ítélet-átvitel PR-hoz kötött ítélet-rekorddal (a review-rekordba a PR száma és az ellenőrzött diff patch-id-ja; a két fej
   saját foltjának összevetése) — az arányos kapuk 1. vak körének L4–L6 leletei a követelmények.
4. A Gemini „második vélemény” kivezetése (`AGENTS.md` 169–171, `docs/minosegkapuk.md`, ellenőr-skill 4/b, a kapuk WARN-lépése).
5. PR-leírás generátor a kötelező szakaszokkal; `run-e2e-tests.ts` belső 60 perces kerete (a kapu külső kerete 90 perc).
6. #513 bontása; `fix/kitakaro-elovagas` PR a #521 helyett.

### H4 — Eredmény-e-mail (terv `docs/specs/2026-11-22-eredmeny-email-bontas.md` + végrehajtás)
Sorrend kötött, szeletenként ≤ 400 sor, halmozás tilos: **B2** hálózati réteg (keepalive, CSRF-érvénytelenítés, időkorlát, osztálykeret;
forrás: `queryClient.ts`, `server/lesson-result-limits.ts`; + a B1b követő jegye: a korhatár minden újrapróba előtt) → **B3**
képesség-jelzés (`shared/result-compat.ts`) → **B4** körönként egy levél, kilét a létrehozáskor, új kapcsoló (alapból KI) → **B5a / B5b**
„félbehagyva” pillanatkép szerver / kliens → **B6** leállításkori ürítés → **B7** tartós kimenő sor → **B8** nagy entrópiájú körazonosító
(kiegészítő terv kell). Forrás: a `fix/eredmeny-email-kviz` ág fájljai, kézi átvétellel.

### H5 — Kisfilm
#529 és `fix/kisfilm-leallitas-hatarido` bontási terve (terv-kiegészítés a `2026-11-22-kisfilm-videomodell.md` és a
`2026-11-10-kisfilm-memoria.md` alá) → rész-PR-ok → D4 (egyjelenetes fizetős próba) → a jóváhagyott sortörlés: a `lesson_clips` sor
(lecke `9cf4bda3-6b8e-4186-8588-73e17129dd1a`, `section_index` 0) CSAK a #529 (vagy bontása) telepítése után, mentéssel, és csak ha a lecke a
3 napos gyártási ablakon belül van — különben nem törlés, hanem jelzés a tulajdonosnak; utána értesíteni a „Fejezetenként videóanyagok
készítése” munkamenetet. A `LESSON_CLIPS_AUTO` a tulajdonos Render-beállítása.

### H6 — Pótlási terv P1 maradéka (`docs/specs/2026-11-19-websuli-potlasok-terv.md` 7.1)
T-1 pontozó (`fix/pontozo-polinom-ket-szam`), I-1 kliens-IP (`fix/kliens-ip-cloudflare-ut`), Q-1 szkriptkapuk P2, Q-2 hook-szelet 1,
Q-3 squash-követő / időkorlát, T-2 rubrika; T-3 a B-bontás része.

### H7 — Szólétra és záró hurok
Szintezés 2/2 (`feat/szoletra-szintezes-2`; a `feat/szoletra-szintezes` két commitolatlan doksiját átmenteni) → A1-bank (D5) → #527 / zh-3.

### H8 — Játékok és többjátékos
#486 → #484 → J7b → Szökőár → a pótlási terv G- és M-tételei.

### H9 — A pótlási terv P2 / P3 maradéka, a TGM további szeletei (S4a/b, SK3, S10, S7a/b, SK4, SK5, S9).

---

## 7. Tulajdonosi döntések

### 7.1 Meghozott döntések (dátummal; a mellékletben a memória részletezi)
- 2026-11-22: „Te vagy a főszál” — a fejlesztés a „Felhős szálak összevonása” munkamenetben fut; a felhős munkamenetek nem kezdenek / pusholnak WEBSULI-munkát.
- 2026-11-22: a felhős munkamenetek gép-hozzáférése engedélyezve; a #510 → „UUID vissza + bontás” (bontási terv jóváhagyva); a #513 és a
  kisfilm-leállítás záró köre NEM → bontás (a kisfilm élesben KI marad); a #529 záró köre NEM → bontás; a négy kapujavítás (blokkoló-definíció,
  követő kör, beépített őr, bizonyíték-átvitel + CI) jóváhagyva; a `lesson_clips` sortörlés feltételesen jóváhagyva (lásd H5).
- 2026-11-23: S2b-1 — a kilógófelirat-ellenőrzés kikerült (külön jegy, böngészős `getBBox`); záró kör jóváhagyva.
- 2026-11-23: a titokvédő hook visszakötése jóváhagyva (megtörtént: `~/.claude/settings.json`, Claude Code oldalon).
- 2026-11-23: a csak helyben lévő ágakhoz elég a helyi köteg-mentés (most a tulajdonos kérésére a push-kapun átmenő ágak felkerülnek).
- 2026-11-23: arányos kapuk (1. fejezet); prompt-gyorsítótár kötelező ellenőrzése; a push / merge / deploy engedélye a teljes ciklusra
  (a kapuk ettől megkerülhetetlenek).
- Korábbi, érvényes döntések: diák saját regisztráció a játékfiókhoz (nincs szülői kapu); közös játék csak online párbaj; bankmodell
  Opus marad; arculati bank előre gyártva; eredmény-e-mail az `ADMIN_EMAILS` címzettjeinek; tanulói link aláírt `?t=`; kisfilm-küszöb 480 MB.

### 7.2 Várakozó döntési pontok (űrlapon, megjelölt javaslattal kell feltenni)
| # | Mikor | Kérdés | Javaslat |
|---|---|---|---|
| D1 | H1 A3 | Az adventi előnézeti próba megfelelt-e — mehet-e a bekapcsoló PR (helyőrző képekkel, ha a végleges képek nincsenek kiválasztva)? | előnézet után igen, helyőrzővel |
| D2 | H2 | Fizetős próbagyártás BE kapcsolóval az SK2 mérőszámával — keret, darabszám | kis mintával (3–5 lecke), kerettel |
| D3 | H2 S3a | Forrás-fa 4 szint × 4 ág kontra megjelenítő 3 szint / 13 csomópont | a megjelenítő korlátja maradjon, a forrás csonkolva jelezzen |
| D4 | H5 | Kisfilm egyjelenetes fizetős próba és a sortörlés időpontja | a #529 bontásának telepítése után |
| D5 | H7 | A Szólétra A1-bank fizetős futásának kerete (ha nincs rögzített jóváhagyás) | a már elköltött 7,34 USD utólagos jóváhagyása + keret |
| D6 | zárás | A beolvadt távoli ágak törlése | igen, a beolvadtakra |
| D7 | — | A globális `CLAUDE.md` „minden fejlesztést független ellenőr néz át” sorának igazítása az arányos kapukhoz | igen (kis javítás kivétellel) |

---

## 8. Hibajegyzék — nyitott tételek (teljes: `kanban/hosszu-futas-hibajegyzek.md`)

| # | Súly | Hiba | Javítás módja |
|---|---|---|---|
| H-01 | A | Advent PR-C és S5+S6 PR nélkül (határidő 11-30) | H1 |
| H-05 | B | A vak futtató nincs a főágon, négy átfedő ág | H3 K3 |
| H-06 | B | Nincs bizonyíték-átvitel — összefésülés / dokumentum-ütközés új fejet és új kört kényszerít | H3 K2 / A7 (PR-hoz kötött rekord) |
| H-09 | B | Ingatag teszt: `tests/lesson-clip-worker.test.ts` „átkódolás: az időkorlát SIGKILL-lel él” párhuzamos futásban | időfüggetlenítés (C-96 minta) |
| H-11 | B | A PR-leírás kötelező szakaszai csak a kapu bukásából derülnek ki | PR-leírás generátor |
| H-15 | B | A modell kiosztás-követése nem mért | D2 |
| H-16 | B | Követő jegyek: S5b L6, L7, L9; S2b-1 kilógó felirat + ismétlődő `websuli-paper` DOM-azonosító; S2b-2 L1 (hibás régi ábra a kisfilmben), L3, L4, L5; S6a L4 (a tervezői szerepleírás régi íve); S6b motor-szintű tryShare-teszt; S6c-1 L3, L5; B1b L2 (korhatár újrapróbánál), elavult komment | a TGM-lánc végén „követő jegyek” szelet; a B1b L2 a B2-ben |
| H-17 | A | Eredmény-e-mail: 9 szeletből 2 kész | H4 |
| H-18 | A | Kisfilm: két ág nem konvergált, a gyártás élesben KI, sortörlés függőben | H5 |
| H-19 | B | #513, #521 nem konvergált | H3 bontás |
| H-20 | C | A pótlási terv 50 szeletéből 40+ nincs elkezdve | H6–H9 |
| H-22 | B | Gemini-sor aktív szabályként a repóban; a repó ellenőr-skillje nem vak megbízást ír | H3 |
| H-24 | C | Skill-tükör: 4 skill csak a forrásban, 1 csak a tükörben; a `skills-sync-check` csak ötöt néz | H3 |
| H-25 | C | `.github/workflows/auto-review.yml` 57: `bence-auto-review` maradvány | H3 |
| H-26 | B | A globális `CLAUDE.md` a főágon nem létező `npm run gate:blind-review`-t írja elő | K3 után érvényes; D7 |
| H-29 | B | `run-e2e-tests.ts` 60 perces belső kerete < a kapu 90 perces külső kerete | kis kapujavítás |
| H-30 | B | S6c egyben 5 blokkoló a megjelenítőkben | S6c-1 / S6c-2 bontás (H2) |

---

## 9. Tanulságok és csapdák (a 2026-11-22/23-i futásból; a `docs/agent-csapdak.md` C-TGM-1 / C-TGM-2 bejegyzései)

1. **Határidős munka elöl.** A futás a TGM-láncot vitte, miközben a november 30-i advent két ága PR nélkül állt — a főterv ezt fordította meg.
2. **„Amit a program kioszt, az jusson el a modellhez.”** Hibaosztály, kétszer: az S6a kiosztott blokksora és az S6b try-fajtája csak a
   mentett állapotba került, a szerzői KÉRÉSBE nem (a beszélgetésben a modell eredeti terve áll). Minden ilyen kiosztást a kérés VÉGÉN
   ki kell mondani, és folytatásnál (a szerző ELŐTT megszakadt futásból) is meg kell őrizni.
3. **Futás közbeni környezet-olvasás** (`lessonVarietyEnabled()`) minden áthozott régi ágban előfordult → mindig a futásra rögzített állapot.
4. **Minden író hely** (motor ÉS tároló) — a #534-ben a tároló újraszámolta a jelölőt; a memóriatárolós teszt zöldje nem bizonyítja az éles írót.
5. **A szabályt a VÉGLEGES kimeneten mérd** (záró recap, try-beszúrás után): az S6a első kiosztása a végleges blokksorokon sértette a 40%-ot.
6. **Jelzés a nyers darabszámból**, ne kerekített arányból (S6b: pontosan 1/3-nál téves figyelmeztetés).
7. **Bot kérte ÚJ ellenőrzés nem a futó szelet része** (S2b-1: 3 vak kör ment el egy kilógófelirat-ellenőrzésre, végül kikerült) — kivéve, ha valós hibát tár fel.
8. **Merge-sorrend (C-61, kétszer):** repó-szintű kaput / CI-t érintő nyitott PR ELSŐKÉNT olvad be; különben a merge-kapuja megbukik.
9. **Vak kör csak akkor**, ha a közös fájlt érintő előző PR beolvadt és a botok leletei javítva vannak — különben elavult fejre fut.
10. **Kapusor-zár:** két helyi kapu nem futhat egyszerre (kétszer megtörtént). Háttérsort csak a zárral, és mindig a futtató háttér-mechanizmussal (nem `&`-tel).
11. **A kapu hibája is hiba:** az adventi PR-kapu kétszer egy órát futott és bukott, mert a böngészős tesztek választása részszóra ment
    (`sync` ⊂ `async`) — a kaput kellett javítani (#538), nem a PR-t.
12. **Eszközök:** heredocban / `sed`-del a visszaperjel összeesik → fájlba írt szkript, `chr(92)`; a kapu-hook a parancs SZÖVEGÉRE is
    illeszt; a szerkesztő szkript csak siker után írjon (különben üres fájl); megszakított háttérsor után az árva folyamatfát pontos PID-del
    kell leállítani (`taskkill /PID <pid> /T /F`), mintaillesztéssel soha; az eldobható e2e-konténer is árván maradhat.
13. **Kapu megkerülése tilos:** a `--owner-override` jogosulatlan használatát a rendszer megtagadta; távoli mentő-refspecet a push-hook nem enged.
14. **Prompt-gyorsítótár:** 93% átlag — a költség fő tényezője a körök SZÁMA, nem a találati arány.

---

## 10. Vak ellenőri körök — mérleg (a mellékletben minden jelentés: `vak-jelentesek/`)

| Szelet | Körök (ítéletek) | Költség (USD) |
|---|---|---|
| S2b-1 | 7 (NEM, NEM, IGEN F, NEM, NEM, NEM, IGEN F) | 4,33 |
| S5b | 3 (NEM, IGEN F, IGEN F) | 3,22 |
| S6a | 4 (NEM, IGEN F, NEM, IGEN F) | 2,71 |
| #510 (utolsó két kör) | 2 (NEM, NEM) | 2,57 |
| S2b-2 | 3 (mind IGEN F) | 2,04 |
| advent PR-C (4–5.) | 2 (IGEN F, IGEN F) | 1,84 |
| #529 | 2 (NEM, NEM) | 1,77 |
| S6c-1 | 2 (NEM, IGEN F) | 1,37 |
| S6b | 2 (NEM, IGEN F) | 1,30 |
| B1b | 2 (NEM, IGEN F) | 1,19 |
| kapujavítás (#538) | 3 (NEM, IGEN F, IGEN F) | 1,14 |
| S6c (egyben) | 1 (NEM) | 1,07 |
| B1a | 2 (IGEN F, IGEN F) | 1,05 |
| arányos kapuk | 1 (NEM) | 0,80 |
| egyéb (#513, #522, docs, kl, advflaky, tgm) | — | ~7,9 |
| **Összesen ebben a munkamenetben** | **48 kör** | **34,34** |

Gyorsítótár-találat a 2. hívástól: átlag ~93%, minimum 85,8%, 80% alatti kör nem volt. Az S5a–S2b-2 korábbi köreinek jelentései (a
régi főszál scratchpadjából) nincsenek a mellékletben; a `review-tgm` mappa az S5a köreit tartalmazza.

---

## 11. Kockázatok

- **Határidő:** az advent PR-C + S5+S6 két nagy PR (≈ 4900 + 1800 sor) — ha egy követő kör NEM, azonnal bontás, nem újabb kör.
- **A vak futtató nincs a főágon:** ha a `vak-v2` munkafa / ág elveszne, nincs szabályos ellenőr (a köteg-mentés és ez a push véd).
- **Hookok Hermesben:** a Claude Code-hookok nem futnak — a kapukat a Hermesnek magának kell kikényszerítenie.
- **Nem mért modellviselkedés** (TGM) — D2 nélkül a bekapcsolás vakon történne.
- **Halmozott láncok:** zh-1 → zh-2 → zh-3; advent-c → advent-s6; S6c-1 → S6c-2 → SK2 — sorban kell beolvasztani.

---

## 12. Az átadott anyagok (melléklet-mappa: `docs/handoffs/2026-11-23-hermes/`)

| Mappa / fájl | Tartalom |
|---|---|
| `memoria/` | a Claude-oldali projektmemória másolata (`MEMORY.md` index + ~50 fájl: döntések, szabályok, főszál-állapot, retró-napló, főterv-mutató). A kulcshelyeket leíró fájl szándékosan kimaradt. |
| `kanban/hosszu-futas-hibajegyzek.md` | a hosszú futás hibajegyzéke (H-01…H-32: nyitott / folyamatban / javítva / beépítve) |
| `kanban/tapasztalat-kanban.md` | a tapasztalat-kanban (Hibák → Megoldás folyamatban → Megoldva — tanulság → Beépítve) |
| `skillek/websuli-szelet-futoszalag/SKILL.md` | a hosszú futás vezénylő skillje (lépéssor, hibaosztály-söprés, eszköz-csapdák, merge-sorrend, gyorsítótár) |
| `skillek/futas-vegi-zaras/SKILL.md` | a globális futás végi hurok skillje |
| `szkriptek/` | `websuli-kapusor.sh`, `websuli-doc-insert.py`, `websuli-keep-both.py`, `websuli-branch-audit.py`, `branch-audit.tsv` |
| `vak-jelentesek/` | a munkamenet minden vak ellenőri jelentése szeletenként (`review-<szelet>/jelentesN.md`) és a feladatra szabott cél-fájlok (`cel-*.md`) |
| `pr-leirasok/` | a PR-leírások (a kötelező szakaszokkal) — mintának és a nyitás előtt állókhoz (`advc-pr-body.md`, `s6c1-pr-body.md`, `kapu-pr-body.md`, …) |
| `docs/specs/2026-11-23-foterv.md` + `-vegrehajtas.md` | a főterv és az állapotnapló |
| `docs/websuli-potlasok.md`, `docs/specs/2026-11-19-websuli-potlasok-terv*.md` | a pótlási leltár (68 tétel) és terv (50 szelet) |
| `docs/agent-csapdak.md` | kiegészítve: C-TGM-2 (a 2026-11-23-i csapdák) |

---

## 13. Leállított folyamatok és a félbeszakadt lépések folytatása (2026-11-23 ~11:50)

A tulajdonos második kérése: „A most folyó futó folyamatokat is állítsd le. Azokat is rakd bele ebbe a nagy handoff leltárfájlba, hogy
folytathassa az ügynök.” A leállítás után ellenőrizve: nem fut WEBSULI-kapu, -teszt vagy -sor folyamat, nincs futó e2e-konténer, a
kapusor-zár (`C:\Users\kosaz\.claude\websuli-kapusor.lock`) eltávolítva, nincs futó Claude Code munkamenet a WEBSULI-csoportban.
A Hermes saját folyamatait (`hermes_cli … gateway run`) nem érintettem.

### 13.1 A leállított folyamatok

| # | Folyamat | Hol tartott a leállításkor | Mi maradt utána | Folytatás |
|---|---|---|---|---|
| 1 | **Átadás előtti push-kapu sor** (`szkriptek/atadas-push-kapu-sor.sh`): 26 munkaágon sorban főág-összefésülés (ütközésnél visszavonás) → `npm ci`, ha hiányzik → `npm run gate:push` → eredmény-sor | az ELSŐ ágon (`advent-c`), az egységtesztek közben; eredmény-sor egy sem készült | `advent-c`: új összefésülő commit `f6ea03bd` (a #539-es főág beolvasztva, ütközés nélkül), erre a fejre NINCS push-bizonyíték; a többi 25 ág érintetlen | 13.2 |
| 2 | Advent PR-C PR-kapu (27 böngészős teszt) — az első leállításkor (~11:00) | futás közben | a `448d4c5a` fejre zöld push-, de nincs PR-bizonyíték | 4.1 — a fej most `f6ea03bd` (13.2/1) |
| 3 | Arányos kapuk 2. vak köre — nem indult el | — | az 1. kör jelentése: `vak-jelentesek/review-aranyos/jelentes1.md` | 4.3 |
| 4 | S6c-1 (#540) követő vak köre — nem indult el | — | zöld push-bizonyíték a `8e5618cf` fejre | 4.2 |

### 13.2 A félbeszakadt lépések pontos folytatása

1. **`advent-c` (`f6ea03bd`)** — a főág-összefésülés kötelező volt (C-61: a PR-kapu a friss főágat követeli; a #539 a 448d4c5a után olvadt
   be). A 448d4c5a-ra rögzített IGEN, FELTÉTELLEL ítélet NEM érvényes az új fejre (a főágon nincs ítélet-átvitel, 6. H3 K2). Teendő:
   `npm run gate:push` a munkafában; vak kör a `f6ea03bd` fejre `--previous review-advc/jelentes4.md,review-advc/jelentes5.md`
   kapcsolóval (a követő kör a változásra és a nyitott feltételekre szűkít, olcsóbb); `record-review`; a PR-leírás ítélet-sorában az új fej
   első 12 jegye; `gate:pr`; feltöltés; PR.
2. **A többi munkaág feltöltése** (mentésként, PR nélkül is): munkafánként `git merge origin/main` (ütközésnél `git merge --abort`; az ág
   ilyenkor helyben marad — feljegyezni), `npm.cmd ci --prefix source --ignore-scripts`, ha nincs `source/node_modules`, `npm run gate:push`,
   zöldnél `touch .audit-ok` (munkafa + fő gyökér), majd önálló parancsként `git push -u origin <ág>`. A sor gépesítve:
   `bash docs/handoffs/2026-11-23-hermes/szkriptek/atadas-push-kapu-sor.sh` (a naplók helye `$S`, alapból `~/websuli-atadas-naplok`;
   az eredmény a `push-eredmeny.tsv`-ben; a feltöltést a szkript szándékosan NEM végzi). Javasolt sorrend (a szkriptben is): advent-c,
   advent-s6, tgm-s6c1, aranyos-kapuk, tgm-s6c, tgm-sk2, vak-v2, zaro-hurok, szoletra-szintezes-2, szoletra-a1-bank, szoletra-szintezes,
   kitakaro-elovagas, kisfilm-leallitas, eredmeny-510, kisfilm-videomodell, merge-kapu-rest, kitakaro-521, vak-futtato-1, vak-futtato-2,
   vak-ellenor-deepseek, docs-potlasok, eredmeny-bontas, foterv, gepkoltoztetes-folytatas, teljes-revizio, advent-kepgyarto.
   Időigény ágonként ~3–5 perc (`npm ci` nélkül ~2 perc). Figyelem: a nyitott PR-ok ágaira (eredmeny-510 = #510, kisfilm-videomodell =
   #529, merge-kapu-rest = #513, kitakaro-521 = #521, tgm-s6c1 = #540) a feltöltés CI-t és review-botokat indít, és a C-62 lépés előtte
   zöld CI-t kérhet.
3. **Commitolatlan munka mentése** (a leállítás előtt elvégezve, csak helyben): `gepkoltoztetes-folytatas` → `30bef7bc`,
   `szoletra-szintezes` → `3f5717a4` (mindkettő csak a saját `docs/specs` munkanaplója).
4. **Ez az átadó ág** (`docs/hermes-atadas-2026-11-23`) a távolin van; PR még nincs (a főági PR-kapu ehhez is vak ítéletet kér — a
   tulajdonos döntse el, kell-e PR, vagy elég az ág). Ha PR lesz: `gate:pr -- --body-file <leírás>`, és a PR-méret figyelmeztetést
   (~10 800 sor, szinte csak melléklet) a leírásban indokolni kell.
