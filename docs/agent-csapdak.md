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
