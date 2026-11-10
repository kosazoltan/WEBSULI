# Ügynök-csapdakatalógus — WEBSULI

Mért, ismétlődő hibák, amelyek tokent, időt vagy félbehagyott munkát okoztak. Minden bejegyzés:
**tünet → gyökérok → megelőzés**. Új hiba esetén ugyanabban a körben új bejegyzés jön ide
(önfejlesztési hurok, `AGENTS.md` „Befejezési mandátum”). Bejegyzést törölni csak akkor szabad, ha a
gyökérokot kód vagy kapu szünteti meg; ezt a bejegyzésben jelölni kell.

## C-01 — Más architektúrára települt `node_modules` (2026-11-03)

- **Tünet:** minden `tsx`-teszt „You installed esbuild for another platform … `@esbuild/win32-arm64` is
  present but this platform needs `@esbuild/win32-x64`”.
- **Gyökérok:** a `source/node_modules` egy ARM64-es gépen települt, és x64-en (AMD64) futott. A
  natív csomagok (esbuild, rollup, sharp, better-sqlite3) csak a telepítő CPU-jára kerülnek fel.
- **Megelőzés:** a program ARM64-en és x64-en is fut, de a `node_modules` gépenként települ:
  `npm.cmd ci` a `source/`-ban, másolni/szinkronizálni tilos. Első lépés gyanús hibánál:
  `npm run doctor:arch` (`source/scripts/check-native-arch.mjs`); a `npm test` a
  `tests/native-arch.test.ts`-sel, a CI a `native-arch` jobbal (Windows x64 + ARM64) kapja el.

## C-02 — Elavult kanban-útvonal a doksiban (2026-11-03)

- **Tünet:** a `docs/kanban.md` szerinti `D:\repo\Hermes-agent\…\kanban.mjs` nem létezik; a CLI más
  mappából futtatva „No items”-et ad.
- **Gyökérok:** a CLI átköltözött, és a táblát a **git toplevelből** oldja fel
  (`<repo>/.hermes/kanban.db`); a `HERMES_HOME` alatti táblát elutasítja.
- **Megelőzés:** a CLI-t mindig a WEBSULI gyökeréből futtasd (útvonal: `docs/kanban.md`). Üres lista
  előtt ellenőrizd, melyik táblát nyitotta meg.

## C-03 — Commitolatlan, félkész munka sessionök között (2026-11-03)

- **Tünet:** a NAT 2020 6. évfolyamos spec, tudástérképek és teszt 2026-09-29 óta untracked fájlként
  állt; a kanban-jegy `review`-ban maradt, senki nem zárta le.
- **Gyökérok:** a session lezárult teljességellenőrzés és commit nélkül.
- **Megelőzés:** session elején `git status --short` + kanban `list`; minden untracked spec /
  `-vegrehajtas.md` félbehagyott munka gyanúja → a saját végrehajtási utasítása szerint befejezni vagy
  NOT DONE + ok + kockázat a jegyre. Session végén a kiadott kérések tételes ellenőrzése.

## C-04 — Óriás parancskimenet elnyeli a kontextust (2026-11-03)

- **Tünet:** egy nagy `git pull` diffstatja 250 KB kimenetet adott (1957 fájl).
- **Megelőzés:** `git pull --quiet` után `git log --oneline -1` és `git diff --shortstat ORIG_HEAD HEAD`;
  hosszú kimenetnél `| tail`/`| grep` szűrés.

## C-05 — Üres Claude Code projektmemória (2026-11-03)

- **Tünet:** a `~/.claude/projects/C--Repo-WEBSULI/memory/` üres volt, a tulajdonosi mandátumok csak a
  repóban éltek; a globális `~/.claude/CLAUDE.md` nem ismerte őket.
- **Megelőzés:** tulajdonosi direktíva → repó vezérlőfájl **és** projektmemória **és** (ha minden
  repóra szól) globális CLAUDE.md, ugyanabban a körben.

## C-06 — Nincs git-identitás az egyik gépen (2026-11-03)

- **Tünet:** `git commit` → „Author identity unknown … unable to auto-detect email address (got '<felhasználó>@<gép>.(none)')”.
- **Gyökérok:** a gépen nincs `user.name` / `user.email` beállítva (gépenként eltér, mint az architektúra).
- **Megelőzés:** tartós config-módosítás helyett parancsonként:
  `git -c user.name="<név>" -c user.email="<github-noreply-cím>" commit …`
  (a korábbi commitok szerzője, `git log -1 --format="%an <%ae>"`); a tartós beállítás a tulajdonos döntése.

## C-07 — Flex-oszlop `min-h-0` nélkül + CSS-specificitás, csak vízszintes túlcsordulást mérő teszt (2026-11-03)

- **Tünet:** telefonon a webes készítés csevegőbuborékjai a gombokra és a mezőre lógtak; a csevegőmező 2 soros
  volt, a helyőrző levágódott; nyers `**markdown**`. A meglévő Playwright-tesztek zöldek voltak.
- **Gyökérok:** (1) fix magasságú dobozban `flex-1` gyerek `min-h-0` nélkül a tartalmáig nő és kilóg;
  (2) `:is()` a legerősebb argumentuma specificitását kapja — a `studio.css` 44 px-es szabálya felülírta a
  textarea 7.75em-es minimumát; (3) a tesztek csak `scrollWidth`-et mértek, takarást nem.
- **Megelőzés:** fix magasságú flex-oszlopban minden szinten `min-h-0`; `:is()`-listába ne kerüljön olyan elem,
  amelyre külön, gyengébb szabály vonatkozik; UI-tesztben `elementFromPoint`-takarásvizsgálat a fő vezérlőkre
  (letiltott gombnál `pointer-events` visszakapcsolva), 390 px-en is. Spec: `docs/specs/2026-11-03-webes-keszites-mobil.md`.

## C-08 — `git add -A` egy másik ágon a gitignore-olatlan helyi állapotot is felveszi (2026-11-03)

- **Tünet:** a `main`-ből nyitott javító ágon a `git add -A` a `.hermes/kanban.db`-t is commitolta (a
  `.hermes/` gitignore-ja csak a még nem mergelt ágon volt); push előtt észrevéve, `git rm --cached`-del kivéve.
- **Megelőzés:** ágváltás után `git add -A` helyett név szerinti `git add <fájlok>`, és commit előtt
  `git show --stat HEAD` / `git diff --cached --stat` átnézése.

## C-09 — Több natív addon egy Node-folyamatban: időszakos heap-sérülés kilépéskor (Windows, 2026-11-03)

- **Tünet:** a `native-arch` teszt a Windows x64 CI-n kimenet nélkül bukott (`'test failed'`); helyben a
  `node scripts/check-native-arch.mjs` ~25–40%-ban `0xC0000374` (STATUS_HEAP_CORRUPTION) kóddal állt le —
  Git Bashban ez `127`-ként látszik, ami „parancs nem található”-nak tűnik (az első futáskor így félre is olvastam).
- **Gyökérok (felezéssel mérve, 20 futás/eset):** a két esbuild-szolgáltatás (gyökér 0.25 + tsx 0.27), a rollup
  natív addonja és a sharp vagy a better-sqlite3 **együtt** egy folyamatban; bármelyik elhagyásával 0/20.
- **Megelőzés:** natív modulok ellenőrzése modulonként külön folyamatban (`spawnSync`), a teszt is külön folyamatként
  futtatja az ellenőrzőt, és bukáskor kiírja a kimenetet. Windows-on a `127`/nem nulla kilépési kódot mindig a
  valódi NTSTATUS-szal (`$LASTEXITCODE`, `spawnSync().status`) kell értelmezni, nem a Bash-leképezéssel.

## C-10 — Az automatikus merge a review-javítás előtt mergelt (2026-11-03)

- **Tünet:** a #391 a kötelező ellenőrzések után 19:06-kor mergelődött az eredeti fejjel (`4a19b0f9`); a review- és a
  Windows-CI-javítás (`528a5013`) később került az ágra, így a `main`-be nem jutott be. Squash merge után a
  `git merge-base --is-ancestor` sem jelzi ezt — tartalom szerint kellett ellenőrizni.
- **Gyökérok:** az auto-merge csak a kötelező ellenőrzésekre vár (a `native-arch` nem kötelező), a review-kommentekre nem.
- **Megelőzés:** review-javítás közben az auto-merge-et ki kell kapcsolni, vagy a feltöltés előtt `gh pr view --json state`;
  „kész” jelentés előtt tartalom szerint ellenőrizni, hogy a javítás a `main`-ben van (`git show origin/main:<fájl> | grep`).
- **Mellékcsapda:** a push-audit hook a parancs *szövegében* is „git … push” mintát keres — heredoc-ba írt doksiszöveg
  is kiválthatja; doksi-bővítést Edit eszközzel végezz.

## C-11 — Shell-escapelés: a `sed` elnyelte a backslash-t, a heredoc szétesett (2026-11-03)

- **Tünet:** `sed -i 's/…egese?|…/…egese?\\b|…/'` után a fájlban `egese?b` lett (a `\b` szóhatár helyett betű); egy idézőjeleket
  és backtickeket tartalmazó Python-heredoc „unexpected EOF”-fal állt le; a CRLF/LF-csere `sed`-del nem hatott.
- **Megelőzés:** reguláris kifejezést vagy többsoros kódot tartalmazó szerkesztés Edit eszközzel vagy a scratchpadba írt
  szkriptfájllal (`python -I <fájl>`), nem inline `sed`/heredoc-kal; utána mindig visszaolvasás (`sed -n <sor>p`) — nem a
  `grep -c` mintájára hagyatkozva, mert annak az escapelése is elcsúszhat.

## C-12 — `content-visibility: auto`: a teljes oldalas képernyőképen üres kártyák (2026-11-03)

- **Tünet:** a főoldali nézetek full-page képén a képernyőn kívüli kártyák fehér helyőrzők — hibának látszik, pedig nem az.
- **Gyökérok:** a kártyákon `content-visibility: auto` van (review #297); a böngésző a nem látható tartalmat nem rendereli.
- **Megelőzés:** UI-ellenőrzésnél a vizsgált szakaszt görgesd a képernyőre, és elem-képernyőképet + `toBeVisible`-t használj
  a tartalomra; a full-page kép csak elrendezés-áttekintés.

## C-13 — Az `outline` gomb hover-szövegszíne felülírja az egyedi színt (2026-11-03)

- **Tünet:** a bekapcsolt (narancs hátterű) nézetgombra mutatva a szöveg sötétnarancs lett → olvashatatlan.
- **Gyökérok:** a `ui/button.tsx` `outline` változata `hover:text-orange-800`-at ad; az egyedi `text-white` hover-állapotban veszít.
- **Megelőzés:** `outline` gombon egyedi színnél a `hover:text-*`-ot is add meg; a Playwright-teszt rámutatott állapotban is
  mérje a `getComputedStyle().color`-t (fordított mutációval ellenőrizve).

## C-14 — Rebase git-identitás nélkül: a pick félbemarad, a változás staged marad (2026-11-03)

- **Tünet:** `git rebase origin/main` → „unable to auto-detect email address”; a `rebase --continue` „you have staged changes”.
- **Megelőzés:** ezen a gépen minden commitot létrehozó parancs (`commit`, `rebase`, `cherry-pick`) `-c user.name=… -c user.email=…`
  kapcsolóval fut (C-06); félbemaradt picknél `git commit -C <eredeti-sha>`, majd `rebase --continue`.

## C-15 — Új teszt elvárása találgatásból (2026-11-03)

- **Tünet:** a tantárgyi szakasz tanmenet-sorrendjét fejből írtam a tesztbe (`m1, m2, m3`); a valódi szabály (`curriculumSort`:
  a múltbeli eltérés ×1,5 súlyú) szerint `m1, m3, m2` — a kód volt helyes, az elvárás nem.
- **Megelőzés:** új teszt elvárását a szabályból vezesd le (számítással, a tesztben kommentként), ne a kimenetből és ne
  fejből; a meglévő tesztet ettől függetlenül soha nem szabad a bukás elfedésére átírni.

## C-16 — Követés csak `sessionStorage`-ból: kilépés után eltűnik a részletes nézet (2026-11-05)

- **Tünet:** a futó gyártás teljes folyamatábrája csak a Készítés fülön látszott, a futás azonosítója csak a lap
  `sessionStorage`-ában élt; új lap / alkalmazás-újraindítás után a tulajdonos csak a három összevont szakaszt látta.
- **Megelőzés:** hosszú háttérfolyamat követését szerveroldali forrásból is vissza kell tudni állítani (itt:
  `GET /api/studio/lessons/one-step/active`, `OwnerDraft.runId`); a böngészőtároló csak gyorsító, nem az egyetlen forrás.
- **Mellékes tanulság:** a Playwright-tesztek ebben a konténerben a projekt saját böngészőverziója helyett a
  `/opt/pw-browsers/chromium`-mal és `vite preview`-val futtathatók (minden `/api` mockolt), DB nélkül.

## C-17 — Összevonás a review-botok előtt (2026-11-05)

- **Tünet:** a #395-öt zöld CI-nél, a „Ready for review” után azonnal összevontam; a Sourcery / Copilot / Codex review
  csak utána futott le, és 3 valós hibát talált (fogalomjavítás-futás csatolása, „Bezárás” utáni újranyitás, lízing
  helyett korhatár) — ezek javító PR-t igényeltek.
- **Megelőzés:** a draftból kivett PR-nál a review-botok (Sourcery, Codex, Copilot) eredményét a CI mellett meg kell
  várni, és a megállapításaikat igazolni / megválaszolni az összevonás előtt.
- **Mellékes:** commitot ne `core.hooksPath=/dev/null` kapcsolóval hozz létre — az a hookok megkerülése (AGENTS.md).
- **Ismétlődés (2026-11-08, #403):** a Codex „nincs hiba” jelzése után bekapcsoltam az automatikus összevonást, de a Copilot review
  később érkezett, 5 valós P2-vel; az összevonást vissza kellett kapcsolni. A Codex, a Copilot ÉS a Sourcery (vagy a keret-elfogyás
  üzenete) is legyen meg a LEGUTOLSÓ commitra, mielőtt az automatikus összevonás bekapcsol.

## C-18 — Feltételezett telepítési szabály és „nem érem el” mérés nélkül (2026-11-05)

- **Tünet:** azt állítottam, hogy a Render a `main` minden összevonására telepít, és hogy a Rendert nem érem el. Közben
  a Render MCP-összekötő elérhető volt: a szolgáltatás build-szűrője (`docs/**`, `**/*.md`, `source/tests/**`,
  `.github/**`) a csak dokumentáció / teszt / CI változást nem telepíti, és a felületi build-parancs elnyeli a
  migrációs hibát (`|| echo MIGRATE_SKIPPED`).
- **Megelőzés:** telepítési / éles állítás előtt a Render MCP-vel (`get_service`, `list_deploys`) mérni;
  `node scripts/qa/verify-render-revision.mjs` (éles revízió), `node scripts/qa/verify-render-settings.mjs`
  (beállítás vs. repó). A Render MCP a szolgáltatás beállítását (build-parancs) nem tudja módosítani, és a felhős
  munkamenetből az `api.render.com` tiltott (403) — ilyen módosítás a tulajdonos lépése a Render-felületen.

## C-19 — Licenc általánosításból és commit identitás nélkül (2026-11-08)

- **Tünet 1:** a nyílt forrásokat kereső ügynök az OpenStax *Psychology 2e* / *Lifespan Development* licencét a kiadó
  „általában CC BY” gyakorlatából CC BY-nak vélte; a könyvek saját oldalán CC BY-NC-SA 4.0 áll (nem kereskedelmi).
- **Megelőzés 1:** licencet csak a forrás saját oldalán olvasott licencsorral rögzítünk (böngészőben, `get_page_text` /
  `javascript_tool`); keresési kivonat, kiadói általánosítás, tükörlap = UNVERIFIED, és a forrásjegyzékben így is szerepel.
- **Tünet 2:** a commit kétszer bukott: PowerShellben a `git commit -F -` here-stringet nem a stdinre, hanem pathspecként adta át;
  utána „Author identity unknown” (a C-14 már leírta, de commit előtt nem olvastam vissza a katalógust).
- **Megelőzés 2:** commit előtt a C-06 / C-14 szerint `git -c user.name=… -c user.email=… commit -F <scratchpad-fájl>`; a
  commit-üzenet mindig fájlból megy, nem here-stringből.
- **Tünet 3:** `[IO.File]::ReadAllText('docs\…')` relatív úttal a folyamat munkakönyvtárához (itt `source/`) oldódott fel, nem a
  PowerShell aktuális mappájához → „Could not find a part of the path”.
- **Megelőzés 3:** .NET fájlhívásnál mindig abszolút út (`C:\Repo\WEBSULI\…`).

## C-20 — Mérés előtt nem ellenőrzött adatbázis-azonosság (2026-11-08)

- **Tünet:** a `source/.env`-be bemásolt `DATABASE_URL` egy régi adatbázisra mutatott (`neondb`, foglalási táblák, 99 `html_files`
  sor 2025-12-ig, `knowledge_maps` nélkül); a térképválasztó „relation knowledge_maps does not exist” hibával állt le, kétszer.
- **Megelőzés:** élő adatbázist használó mérés előtt csak olvasó azonosság-próba (tábla-jelzők: `knowledge_maps`, `km_concepts`,
  `studio_jobs`; az URL-t nem kiírva). Ha az éles térkép nem kell (új forrás mérése), a `single-run-measure.mts` `file:<útvonal>`
  módja éles adatbázis nélkül fut — ezt kell először választani. Titkot ügynök nem másol fájlok között; a kitöltés a tulajdonos lépése.
- **Tünet 2:** a más repóból átmásolt `ANTHROPIC_API_KEY` érvénytelen volt (401 invalid x-api-key); a mérés hiba nélkül lefutott, mert a
  motor csendben a tartalék modellre (gpt-6.1-sol) váltott — a kimenet `fallback` mezője mutatta.
- **Tünet 3:** PowerShellből indított `bash -c "…"` a WSL-t hívta (nincs `/bin/bash`), nem a Git Bash-t → „execvpe(/bin/bash) failed”.
- **Megelőzés 3:** POSIX-parancs (awk, diff, tr) a Bash eszközzel fut, nem PowerShellbe ágyazott `bash -c`-vel.
- **Tünet 4:** a `Get-Date -Format o` parancsot a destruktív-parancs hook „meghajtó formázása”-ként tiltotta (a `-Format` szó miatt).
- **Megelőzés 4:** időbélyeg PowerShellben `[DateTime]::Now.ToString('o')` alakban; a `.audit-ok` jelzőt a valódi kapuk
  (lint, check, check:test, npm test, three-phase) után, külön hívásban írjuk.
- **Megelőzés 2:** fizetős mérés előtt egy 1 tokenes kulcspróba (a kulcsot nem kiírva), és minden futás után a `fallback` mező
  ellenőrzése; tartalékmodelles futás eredménye csak így jelölve kerülhet a mérési fájlba.

## C-21 — Képválasztási tartalék a korábbi döntések ellenőrzése nélkül; helyi szerver idegen adatbázissal (2026-11-08)

- **Tünet 1:** a „biológiához ne a híd jusson” javításra először tantárgyi (témaköri / kulcsszavas / általános) borítót terveztem
  tartaléknak; két meglévő teszt bukott (`design-assets.test.ts`), mert ez idegen témájú képet adott (matekra „függvények”, biológiára
  „sejt”), és ütközött a 2026-10-19-i tulajdonosi döntéssel (`hos-kep-sav`).
- **Megelőzés 1:** képválasztási (arculati) változás előtt a `design-assets.test.ts` / `stored-art.test.ts` állításait és a hivatkozott
  specet (`2026-10-19-hos-kep-sav`) elolvasni; a tartalék sosem lehet témaspecifikus kép.
- **Tünet 2:** a böngészős ellenőrzéshez a helyi fejlesztői szervert indítottam volna, de a `source/.env` `DATABASE_URL`-je egy idegen,
  régi adatbázisra mutatott (foglalási táblák) — a szerver indulása (migráció, söprések) oda írhatott volna.
- **Megelőzés 2:** helyi szerver indítása előtt az adatbázis azonossága (C-20 próba); idegen / éles adatbázissal NEM indul. Ilyenkor az
  élő oldal csak olvasó ellenőrzése a telepítés után.

## C-22 — Helyi HTML-mintaoldal a beépített böngészőpanelben (2026-11-09)

- **Tünet:** a betűtípus-összevetést `file://` oldalként nyitottam meg a beépített böngészőpanelben; a panel helyi fájlt csak statikus
  pillanatképként mutat, képernyőkép nem készíthető róla, és a külső (Google Fonts) betűk sem töltődnek be.
- **Megelőzés:** tulajdonosi választáshoz készülő vizuális minta → privát Artifact oldal (Google Fonts engedélyezett), vagy a repó
  Playwright-konfigurációja (pl. `playwright.lesson-typography.config.ts`, csak Vite, adatbázis nélkül) a képernyőképpel.
- **Megjegyzés:** betűcserénél a `scripts/prepare-lesson-fonts.py` eldobható venv-ben (`pip install "fonttools[woff]"`) fut; a meglévő
  családokat hash-egyezésnél bájtra változatlanul hagyja.
- **Tünet 2 (review #407):** a betűnév-cserénél a hívók keresése `"Inter"` (idézőjeles) mintára szűrt, így a `tests/lesson-labs.browser.ts`
  `'Inter, "Noto Sans", …'` elvárása kimaradt.
- **Megelőzés 2:** családnév-cserénél idézőjel nélküli, szóhatáros keresés (`grep -rnw Inter tests client server shared`), és MINDEN
  `playwright.*.config.ts` futtatása, amelynek tesztje `font-family`-t állít (`grep -l font-family tests/*.browser.ts`).

## C-23 — Böngészős felolvasás tartalék nélkül; régiós nyelvkód a TTS-szolgáltatásnak (2026-11-09)

- **Tünet:** Androidon a „Meghallgatás” „A hang most nem érhető el ezen az eszközön.” üzenetet adott: a lejátszó csak a böngésző
  `speechSynthesis` motorjára támaszkodott (nincs motor / nincs angol hang → hiba), és a nem-hibás `interrupted` is hibának számított.
- **Megelőzés:** böngésző-API-ra épülő funkcióhoz mindig legyen szerveroldali tartalék, és a puha hibakódokat (megszakítás) külön kell kezelni.
  A Vercel CSP (`default-src 'self'`) miatt hangtartalék csak azonos eredetű URL lehet (`data:` / `blob:` nem).
- **Tünet 2:** a `google-tts-api` az `en-GB` kódot elutasítja („lang might not exist”), csak az alapnyelvet (`en`) fogadja el.
- **Megelőzés 2:** külső szolgáltatás bemeneti formátumát élő próbával mérni a kódírás előtt, nem a fehérlistából feltételezni.

## C-24 — „Gyorsítótárazható” végpont, amelyet a CDN-szabály némán `no-store`-ra írt; IP-korlát a proxy címén (2026-11-09)

- **Tünet:** a `GET /api/tts/audio` a kódban `Cache-Control: public, max-age=86400` fejlécet küldött, élesben mégis `no-store` érkezett:
  a `vercel.json` `/api/(.*)` fejlécszabálya felülírta. A PR-leírás a gyorsítótárra hivatkozott kockázatcsökkentésként — méretlenül.
- **Megelőzés:** fejlécre épülő állítást (gyorsítótár, CSP, CORS) az éles címen `curl -D -` kimenettel kell igazolni, nem a szerverkódból.
  Külső átírásnál (Vercel → Render) a CDN csak `x-vercel-enable-rewrite-caching: 1` mellett veszi figyelembe a forrás fejléceit.
- **Tünet 2:** az IP-alapú korlát (`express-rate-limit`, `trust proxy: 1`) kulcsa a Vercel-proxy címe: a keret az összes látogatóé együtt.
- **Megelőzés 2:** proxy mögötti korlátnál a `Ratelimit-Remaining` fejlécet két útvonalon (közvetlen és proxyn át) össze kell vetni.
  A többi IP-alapú korlát (bejelentkezés stb.) ugyanígy érintett — kezelve: spec 2026-11-10-korlat-kliens-ip, részletek: C-25.
- **Tünet 3:** hangvégpont `Range` támogatás nélkül (iOS Safari `bytes=0-1` kéréssel tölt, 206-ot vár).
- **Megelőzés 3:** média-végpontnál `Accept-Ranges` + 206 az alap; próba: `curl -H "Range: bytes=0-1"`.
- **Tünet 4 (eljárási):** a kód a spec-módosítás előtt készült el; a shell heredoc → JS sablonszöveg út a regexekből kiette a `\`-t
  (`\d` → `d`), a `sed`-javítás sem hatott.
- **Megelőzés 4:** előbb a spec „Módosítás” szakasza, utána a kód. Regexet tartalmazó kódot az Edit eszközzel kell írni, nem shellből generálni.

## C-25 — Proxylánc mögötti kliens-IP: a `req.ip` egy váltakozó közbenső cím; titoktár-írás az ügynöknek tiltott (2026-11-10)

- **Tünet:** a C-24 feltevése („a kulcs a Vercel-proxy címe”) pontatlan volt. Mérve (`GET /api/learner/me`, 5 egymás utáni kérés
  ugyanarról a gépről): a `Ratelimit-Remaining` 1499, 1498, 1499, 1497, 1498 — a közvetlen Render-hívás is több számlálóra szóródott.
  A lánc Vercel → Cloudflare → Render terheléselosztó → Express; `trust proxy: 1` mellett a `req.ip` az `X-Forwarded-For` jobb
  szélső, kérésenként váltakozó eleme, nem a kliens és nem is egyetlen proxy címe.
- **Megelőzés:** IP-alapú kulcsot élesben úgy kell mérni, hogy UGYANAZ a kliens többször kér: a számlálónak egyesével, megszakítás
  nélkül kell csökkennie. Két út összevetése (C-24) ehhez kevés. Új `rateLimit(` csak `clientIpKeyGenerator`-ral
  (`server/lib/client-ip.ts`) — a `tests/client-ip.test.ts` forrásőre kikényszeríti.
- **Tünet 2:** a Render dokumentációja a kliens-IP fejlécekről nem ír; fejléc-visszhang végpont nincs. A proxy által írt fejléc
  (XFF bal széle) csak akkor hihető, ha a kérés bizonyítottan a proxytól jön — ehhez megosztott titok kell (Vercel `routes` →
  `transforms`, `op: set`), mert a közvetlen Render-cím nyilvános.
- **Megelőzés 2:** „megbízható fejléc” állítás előtt a szolgáltató dokumentációja + élő mérés; ha a dokumentáció hallgat, a
  specben a mérés legyen elfogadási feltétel, és a kódnak legyen biztonságos tartaléka (itt: `req.ip`).
  Mérve élesben (2026-11-10, #411 után): a Render továbbítja a Cloudflare `CF-Connecting-IP` fejlécét — közvetlen hívásnál 8 kérés
  egyetlen számlálót csökkentett, hamis XFF / hamis titok mellett is. A Vercelen át a keret a titok beállításáig szóródik.
- **Tünet 3:** az első kulcsteszt a helyi Expresst közvetlenül hívta, és hamis XFF-fel új keretet kapott — a tesztkörnyezetben
  nincs terheléselosztó, amely a lánc végére fűzné a valódi címet.
- **Megelőzés 3:** proxyfüggő viselkedés tesztjében a termelési láncot kell modellezni (`behindLoadBalancer` a tesztben).
- **Tünet 4 (eljárási):** a titok éles beírását (Render / Vercel környezeti változó) az ügynök munkamenetében a jogosultsági őr
  letiltotta („Secret-Store Writes”), miután a kód már erre épült.
- **Megelőzés 4:** titoktár-írást igénylő munkánál ezt a tervben tulajdonosi lépésként kell jelölni, futtatható szkripttel
  (`scripts/qa/set-proxy-secret.mjs`), és a kódnak a titok nélkül is biztonságosan kell futnia. A tiltást megkerülni tilos.
- **Tünet 5 (eljárási):** a commitot és a feltöltést (push) egy parancsba fűztem; a feltöltés előtti audit-hook az egész parancsot
  elutasította, így a commit sem készült el. A hook a parancs SZÖVEGÉT nézi: egy heredocban szereplő „git” + „push” szópár is tiltást vált ki.
- **Megelőzés 5:** commit, `.audit-ok` jelző és feltöltés három külön hívás (ld. a `.audit-ok` szabályt fent); dokumentumot az
  Edit / Write eszközzel kell írni, nem shell heredocból.

## C-26 — Hibavadászat tanulságai: visszatekintő regex a kliensben, `try` nélküli aszinkron kezelő, hamis tesztkettős (2026-11-10)

- **Tünet 1:** a kliens darabjaiba (`LessonRuntime-*.js`, `game-quiz-contract-*.js`) visszatekintő reguláris kifejezés (`(?<!…)`,
  `(?<=…)`) került a `shared/` modulokból. A 16.4 előtti Safari ezt szintaktikai hibának veszi: az egész darab nem fut, a lecke üres.
  A #348 review egy helyen már javította, de őr nem készült, így a minta visszaszivárgott.
- **Megelőzés 1:** kliensből elérhető fájlba visszatekintő regex nem kerülhet — a `tests/no-lookbehind-client.test.ts` a kliens
  importgráfját bejárva kikényszeríti. Helyette `(?:^|[^\p{L}])X`, vagy határ nélküli minta + az előző karakter ellenőrzése kódból.
  Egyszeri javítás őr nélkül nem javítás: az ismétlődő hibafajtához forrásőr-teszt kell.
- **Tünet 2:** Express 4 alatt a `try` nélküli `async` kezelő elutasított ígérete kezeletlen marad; Node 24 alatt ez leállítja a
  folyamatot (egy megszakadt adatbázis-kapcsolat egy névtelen GET-en át az egész szervert).
- **Megelőzés 2:** új `async` útvonal csak `try/catch`-csel vagy `asyncRoute` burkolóval (`server/lib/async-route.ts`); a
  `process.on('unhandledRejection')` csak védőháló, a kérés attól még válasz nélkül maradna.
- **Tünet 3:** „ma” ablak `setHours(0,0,0,0)`-val és időzóna nélküli `cron.schedule` — a Renderen UTC, a levél rossz órában megy,
  az esti adatok kiesnek. A többi ütemezés már `Europe/Budapest` volt; ez az egy kimaradt.
- **Megelőzés 3:** minden `cron.schedule` kapjon `timezone`-t, és a napablak tiszta, tesztelt függvény legyen (óraátállítással).
- **Tünet 4 (eljárási):** két új böngészős tesztem azért bukott, mert a hamis `getVoices()` sima objektumot adott, amelyet a valódi
  `SpeechSynthesisUtterance.voice` beállító elutasít — a `speak()` meg sem hívódott. A javítás jó volt, a tesztkettős volt hamis.
- **Megelőzés 4:** böngésző-API-t utánzó tesztkettősnél ellenőrizni kell, hogy a vizsgált ág tényleg lefut (pl. számláló a
  `speak()` hívásra); valódi típust váró beállítóhoz üres lista vagy valódi objektum kell.
- **Tünet 5:** a mértékegység-, a hálózatihiba- és a fülváltás-hiba közös gyökere a „részleges egyezés”: határ nélküli részlánc
  (`m` ⊂ `mm`), böngészőfüggő hibaszöveg (`includes('fetch')`), és a leállítás megkerülése (`speechSynthesis.cancel()` a közös
  `stopSpeech` helyett).
- **Megelőzés 5:** szöveges egyezésnél mindig mindkét oldali határ; hibát típus, nem szöveg alapján kell felismerni; erőforrást
  egyetlen közös leállító szabadítson fel, a hívók azt használják.

## C-27 — Gyártás-mérés tanulságai: néma teljes újragyártás, kiválasztó kérdés hamis ismétlődése, önellentmondó utasítás (2026-11-10)

Forrás: két élő gyártás mérése (`docs/specs/2026-11-10-gyartas-meres.md`).

- **Tünet 1:** a bank a futásidő 66–89%-a. A párhuzamosan épült csomagok keresztellenőrzése egyetlen ismétlődő kérdés miatt a
  TELJES kifizetett csomagot eldobta és újraírta (2 csomag = 7 perc), naplósor nélkül — a telemetria csak „javítókört” mutatott.
- **Megelőzés 1:** ahol van célzott javítómód, a drága út (teljes újraírás) csak tételhez nem köthető hibánál maradhat; minden
  ilyen ágnak legyen naplósora az okkal. Mérésnél a naplót időrendben is olvasni kell (mi fut 2–4 percig), nem csak a hibasorokat.
- **Tünet 2:** az ismétlődés-kulcs csak a kérdés szövegét nézte; a „Melyik állítás hamis?” típusú kérdés tartalma az opciókban van,
  ezért két különböző kérdés ismétlődésnek számított (7 javítókörből 4).
- **Megelőzés 2:** azonosság-kulcsot a tétel TELJES tartalmából kell képezni ott, ahol a megkülönböztető rész nem a címben van;
  a lazítás zárt mintára szóljon (ne heurisztikára), hogy a valódi ismétlődés-ellenőrzés ne gyengüljön.
- **Tünet 3:** a nyitó célkártya fejléce „Magyarázat” lett, mert az utasítás két egymás utáni sora ellentmondott („címkékkel, ebben
  a sorrendben” ↔ „címke nélkül is érthető”), a felismerő pedig a címkét megkövetelte.
- **Megelőzés 3:** ha a megjelenítés a modell kimenetének egy jelére épül, az utasítás azt a jelet egyértelműen követelje meg, ÉS a
  felismerő tűrje a hiányát (a már közzétett leckék nem gyárthatók újra egy fejléc miatt).
- **Tünet 4:** a számegyenes feliratai a bal széltől számolt minden n-edik osztásra kerültek — a 0 és a jelölt értékek felirat nélkül.
- **Megelőzés 4:** tengelyfelirat „szép” lépésközzel, a 0-hoz igazítva; a ritkítás utáni üres eredményre (nem a 0 rácsán álló
  osztások) legyen tartalék.
- **Tünet 5 (eljárási):** a böngészős tesztet `npx playwright test`-tel indítva a szerver megtagadja az indulást (a `source/.env`
  éles adatbázisa miatt, szándékos őr). **Megelőzés 5:** mindig `npm.cmd run test:e2e -- <fájl>` (eldobható adatbázist indít).
- **Tünet 6 (eljárási):** az admin-munkamenet a tulajdonos saját Chrome-jában él, a beépített böngészőpanelen nem. **Megelőzés 6:**
  admin-védett élő lépéshez a Claude in Chrome bővítmény kell; a gyártás a Stúdió felületén indítható, a futás a
  `GET /api/studio/lessons/one-step/:runId` lekérdezésével követhető.

## C-28 — Fejezet-kisfilmek: felhős munkamenet az éles leckéhez, fejléces végpont, hamis riasztás a parancsszövegre (2026-11-10)

Forrás: `docs/specs/2026-11-10-fejezet-kisfilmek.md`.

- **Tünet 1:** a „legutóbbi lecke” letöltése háromszor akadt el: a felhős munkamenet proxyja a `websuli.vip`-et 403-mal tiltotta; a
  Render-fiók Postgres-példánya nem a Websuli adatbázisa (`lessons` tábla nincs benne); a fejlécet küldeni nem tudó lekérő eszköz
  409-et kapott („újabb pontozó”).
- **Megelőzés 1:** publikált lecke JSON-ja: `curl -H "x-websuli-scoring: <LESSON_SCORING_VERSION>" https://websuli.vip/api/lessons/by-file/<htmlFileId>`
  (a lista: `GET /api/lessons`, de ~40 KB — fájlba kell menteni, nem a kontextusba). Felhős munkamenetben ehhez a „websuli”
  környezet kell (engedélyezett hosztok: `websuli.vip`, `websuli-api-eu.onrender.com`). A Websuli adatbázisának helye UNKNOWN —
  nem a Render-fiók `valuta-production` példánya.
- **Tünet 2:** a destruktív-parancs hook egy migrációs fájl MEGJEGYZÉSÉBEN álló, táblaeldobást említő visszaállítási mondatra
  tiltott (kétszer), mert a fájl tartalma heredocként a parancssorban állt.
- **Megelőzés 2:** fájltartalmat a fájlíró / szerkesztő eszközzel kell létrehozni, nem shell-heredockal — a hook a parancs szövegét nézi.
- **Tünet 3:** a széles (≥ 1200 px) leckenézetben a „Fejezet” legördülő rejtett (helyette oldalsó fejezetlista van): a böngészős
  szkript 30 mp-ig várt rá.
- **Megelőzés 3:** fejezetváltás tesztben a `chapter-nav` gombjaival széles nézetben, a legördülővel keskenyben.
- **Tünet 4:** a tervezett „teljes lecke ≤ 5 perc” becslés karakterszámból készült; a valódi hang mérése 12 fejezetre 7,4 percet adott.
- **Megelőzés 4:** hangos tartalom hosszát a valódi hangfájlok `ffprobe`-mérésével kell igazolni a forgatókönyv lezárása ELŐTT.

## C-29 — Az első kisfilm-próba megbukott: forma a tartalom előtt, a repo saját arculati szabálya figyelmen kívül (2026-11-10)

Forrás: tulajdonosi visszajelzés („borzasztó”) → `docs/specs/2026-11-10-fejezet-kisfilmek-v2.md`.

- **Tünet 1:** a v1 kisfilm emojis diasor lett gépi hanggal és egyetlen, gyerekes kabalával — a 9. osztályos fizikához is. A teljes
  lejátszó, tábla, háttérgyártás és 12 fejezetnyi forgatókönyv elkészült, mielőtt a tulajdonos egyetlen képkockát látott volna.
- **Gyökérok 1:** a legolcsóbb megvalósítható formát (meglévő hangvégpont, emoji) választottam, és a „stílus egységes” célt
  összekevertem a „minőség jó” céllal. A repo már tartalmazta a korosztályos képi szabályt (`server/lesson-covers.ts`
  `COVER_STYLE.band`: 6. évfolyamtól nincs rajzfilmfigura) — nem olvastam hozzá.
- **Megelőzés 1:** új, látható / hallható élményt adó funkciónál ELŐBB egyetlen valódi minta (kép + hang) megy a tulajdonos elé, és
  csak a szemle után épül tárolás, gyártósor, tömeges tartalom. Megjelenést érintő munkánál a meglévő arculati szabályok
  (`shared/lesson-design.ts`, `COVER_STYLE`, `design-assets/style.md`) elolvasása a terv része.
- **Tünet 2:** a Node beépített `fetch`-e a felhős munkamenetben nem megy át a proxyn (`ENOTFOUND api.openai.com`), miközben a `curl` igen.
- **Megelőzés 2:** szkriptből indított külső hívásnál `NODE_USE_ENV_PROXY=1` (Node ≥ 22.21); a kulcs a proxy hálózati titka, a
  fejlécbe helykitöltő kerül (`Bearer proxy-injected`), valódi kulcs soha.
- **Tünet 4:** az új `tests/lesson-clips.spec.ts` helyben (saját Vite-konfigurációval) zöld volt, a CI alap e2e-futásában 10 tesztje
  bukott: a `**/*.spec.ts` minta miatt az alap `playwright.config.ts` is felveszi, ott az épített szerver szolgáltatásmunkása él, és
  az `/api/*` kéréseket maga kéri le — a `page.route` csonkok helyett a valódi szerver felelt.
- **Megelőzés 4:** hálózatot csonkoló új spec ELSŐ sora `test.use({ serviceWorkers: "block" })` (a `lesson-fusion.spec.ts` mintája), és
  push előtt az alap konfigurációval is le kell futtatni: helyi Postgres 16 (`pg_ctlcluster 16 main start`), `DATABASE_URL` a
  loopbackre, `npm run db:migrate`, `node --import tsx tests/e2e-seed.ts`, `npx playwright test tests/<spec>`.
- **Tünet 5:** a generált mozgókép nyersen 4–17 MB klipenként (mérve); a próba idején ez nem tűnt fel, mert helyi fájlból játszott.
  Tárolás előtt derült ki, hogy egy lecke így több száz MB lenne az adatbázisban.
- **Megelőzés 5:** generált média MÉRETÉT a próba része mérni (nem csak az árát és az idejét); tárolás csak átkódolva, mérethatárral és
  tárkerettel (`CLIP_VIDEO_MAX_BYTES`, `LESSON_CLIP_MEDIA_MAX_MB`).
- **Tünet 6:** a hálózati titokként elmentett kulcsot az ügynök használni tudja, de kiolvasni nem — ezért másik rendszerbe (Render
  környezeti változó) nem tudja átírni. A tulajdonos ezt joggal nem értette.
- **Megelőzés 6:** kulcskéréskor előre meg kell mondani: „ezt csak ebben a munkamenetben tudom használni; a szerverre neked kell beírnod”.
- **Tünet 3:** a hangminőséget az ügynök nem tudja füllel megítélni — a „természetes hang” állítás mérés nélkül feltételezés.
- **Megelőzés 3:** hangról csak mérhető tényt szabad állítani (elkészült, hossz, modell, hangazonosító); a minőség a tulajdonos szemléje.
