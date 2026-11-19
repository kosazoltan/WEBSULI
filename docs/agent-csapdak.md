# Ügynök-csapdakatalógus — WEBSULI

Mért, ismétlődő hibák, amelyek tokent, időt vagy félbehagyott munkát okoztak. Minden bejegyzés:
**tünet → gyökérok → megelőzés**. Új hiba esetén ugyanabban a körben új bejegyzés jön ide
(önfejlesztési hurok, `AGENTS.md` „Befejezési mandátum”). Bejegyzést törölni csak akkor szabad, ha a
gyökérokot kód vagy kapu szünteti meg; ezt a bejegyzésben jelölni kell.

## Index (tematikus)

Elég ezt az indexet beolvasni; a részletet (tünet, gyökérok, parancsok) csak a feladathoz illő azonosítónál olvasd el
(`grep -n "^## C-nn" docs/agent-csapdak.md`). Az azonosítók nem változnak. Új bejegyzéshez ide is kell egy sor.

### Git, PR, CI, review
- **C-03** — Session elején `git status --short` + kanban `list`; az untracked spec / `-vegrehajtas.md` félbehagyott munka: befejezni.
- **C-06** — Git-identitás hiányában parancsonként `git -c user.name=… -c user.email=… commit`; tartós beállítás a tulajdonosé.
- **C-08** — Ágváltás után név szerinti `git add <fájlok>`, nem `git add -A`; commit előtt `git diff --cached --stat`.
- **C-10** — Review-javítás közben az auto-merge kikapcsolva; „kész” előtt tartalom szerint ellenőrizni, hogy a javítás a mainen van.
- **C-14** — Rebase / cherry-pick is `-c user.name/email`-lel; félbemaradt picknél `git commit -C <sha>`, majd `--continue`.
- **C-17** — Összevonás előtt a review-botok eredményét is meg kell várni és megválaszolni, nem csak a CI-t.
- **C-37** — Az ELSŐ commit a végrehajtási fájl saját állapotsora; a kód utána; push előtt `three-phase-check.mjs`.
- **C-48** — Szelet-PR nem ír a közös, hozzáfűzős katalógusba; a csapda-javaslat a zárójelentésbe, az orkesztrátor gyűjti.
- **C-49** — A PR saját zöld CI-ja nem garancia: közös réteg változása után main beolvasása és újrafuttatás; ingadozó tesztre jegy.
- **C-61** — Repó-szintű őrt a friss mainen és a nyitott PR-ágakon is futtatni összevonás előtt; kivétel pontos listával, nem előtaggal.
- **C-62** — Zöld CI után nincs további push (doksi sem); a mondanivaló a zárójelentésbe / PR-leírásba megy.
- **C-63** — A kötelező ellenőrzés (E2E is) nem alku tárgya; megkerülés csak tulajdonosi engedéllyel.
- **C-70** — Mutációs ellenpróba előtt commit vagy másolat; visszaállítás után `cmp` — ne `git checkout <fájl>` commitolatlan munkán.

### Shell, Windows, eszközök
- **C-01** — A `node_modules` gépenként települ (`npm.cmd ci`), másolni tilos; gyanús natív hibánál `npm run doctor:arch`.
- **C-04** — Hosszú parancskimenetet szűrj (`--quiet`, `--shortstat`, `| tail`), ne öntsd a kontextusba.
- **C-09** — Natív modulokat külön folyamatban ellenőrizz; Windows-kilépési kódot a valódi NTSTATUS-szal értelmezz.
- **C-11** — Regexet / többsoros kódot Edit eszközzel vagy szkriptfájllal írj, ne inline `sed`/heredoc-kal; utána visszaolvasás.
- **C-35** — Regex csak Edit/Write-tal; `cat -A`-val bájtszintű visszaolvasás; teszt minden elválasztóra és „majdnem egyező” ellenpéldára.
- **C-38** — Friss munkafában `npm ci --prefix source --ignore-scripts`; a helyben bukó `native-arch` tesztet jelenteni, nem megkerülni.
- **C-39** — Git Bashben nincs `jq`: `gh … --json … --jq`; figyelő-hurok előtt a lekérdezést egyszer kézzel lefuttatni.
- **C-46** — Unicode-tartomány forrásban `\p{…}` kategóriával, ne `\uXXXX`-szel (az eszközparaméter dekódolja); `cat -A` ellenőrzés.
- **C-50** — Visszaperjeles szöveg csak Edit/Write-tal; bájtszintű visszaolvasás; szkriptes cserénél `git diff --stat` ellenőrzés.
- **C-72** — Apróságok: időbélyeg-összevetés SQL-ben, `Failed query` oka a `cause`-ban, Playwright PowerShellből, e2e-port a szervertől.
- **C-75** — `native-arch` önmagában ismert helyi kivétel (nem telepítési teendő); a push-kapu piros oka mindig a TÖBBI bukó teszt. Mérő-várakozás állapotra, ne időre.
- **C-76** — Takarás-döntés: a figura test (téglalap), nem pont; a mérce (`elementsFromPoint`) és a döntés ugyanazt a felületet nézze. Elakadásnál előbb a döntés bemeneteit naplózd.
- **C-77** — Menet közbeni lagg: profil előtt ne találgass; a `long-animation-frame` szkriptje és a CDP-minta megnevezi (itt: lusta `new AudioContext()` az első hangnál, 0,8–2 s). Tétlen főszál + hosszú képkocka = GPU-folyamat: Chrome-nyomkövetéssel nézd.

### Tesztelés, e2e, mérés
- **C-12** — `content-visibility: auto` mellett elem-képernyőkép + `toBeVisible`; a teljes oldalas kép csak áttekintés.
- **C-13** — Egyedi színű `outline` gombnál a `hover:text-*` is; a teszt rámutatott állapotban is mérje a színt.
- **C-15** — Új teszt elvárását a szabályból számítsd (kommentben), ne a kimenetből; meglévő tesztet bukás elfedésére soha.
- **C-30** — A helyi zöld nem a CI zöldje; környezeti zajt csak szűk, dokumentált mintával szűrj; saját scratchpad-almappa.
- **C-33** — Stabilitásra csak végállapotú elemen várj (élő HUD / vászon soha); az új várakozást a CI-vel azonos úton futtasd.
- **C-43** — Felület mércéje a tanulási cél: minden szöveg olvasható koppintás nélkül; mérés a leghosszabb valódi tétellel.
- **C-56** — „Mindig jól válaszoló” próbabotnál minden eltérés hibajel; a mérő a célpontok átfedését is mérje.
- **C-57** — Meta-képernyő mérése: `scrollIntoView` után az `overflow: hidden` ős se mozduljon; érintéses görgetés CDP touch-sorozattal.
- **C-64** — Poll-függvényben az állapotot egyetlen `page.evaluate` olvassa, ne több automatikusan váró lokátorhívás.
- **C-65** — Időtartam-állítást a lapon belül, képkockánként mérj; a lassú CI-hibát CPU-lassítással reprodukáld.

### UI, CSS, mobil
- **C-07** — Fix magasságú flex-oszlopban minden szinten `min-h-0`; UI-tesztben `elementFromPoint`-takarásvizsgálat 390 px-en is.
- **C-32** — Felülírható közös komponens-osztály az `@layer components`-be; `!`-os segédosztály csak indoklással.
- **C-42** — Mért elem belépő animációja `opacity` / `translate`, nem `scale`; `eslint-disable` csak a ténylegesen jelzett szabályra.
- **C-53** — Átírt játéknál előbb `grep` a régi `index.css`-szabályokra; kijelzés alatt képkockánként ne kérj állapotot.

### Játékmotor
- **C-34** — Fekvő tájolású játék kérése az e2e-ben kezelve; késleltetett írás funkcionális frissítéssel vagy ref-ből.
- **C-36** — A hitstop a hurok saját tartása (`holdFor`), nem a szorzó; teszt mindkét hívási sorrendre és szünettel.
- **C-41** — A vissza nem állítható idegen ismétlési tételt a menet átugorja és a sorban hagyja; elavult tétel idővel kikerül.
- **C-51** — Egy holtsáv, utána folytonos görbe; „lassú vezérlés” jelentésnél előbb a kitérés → mozgás görbét mérd.
- **C-52** — Mozgó célra a közös `pointerTapHandlers`; a lap és a szimuláció ugyanazt a meghajtót hívja.
- **C-66** — A fedőréteg közös úton állítsa meg a játékot; a leállást WebGL-hívásszámlálóval mérd.

### Tartalom- és bankgyártás
- **C-19** — Licencet csak a forrás saját oldaláról rögzíts (különben UNVERIFIED); commit-üzenet fájlból, .NET-hez abszolút út.
- **C-27** — Drága teljes újragyártás csak tételhez nem köthető hibánál, naplózott okkal; azonosság-kulcs a teljes tartalomból.
- **C-29** — Új látható / hallható funkciónál előbb egy valódi minta a tulajdonos elé; a repó arculati szabályai a terv részei.
- **C-31** — A vak megoldó után kötelező idióma- és szinonima-audit a teljes bankon; a `hu` nem tartalmazhatja a term-et.
- **C-44** — Bank forrásból, tételenkénti forrás-megjegyzéssel; a „hibás” helyesírási opciót hunspell ellenőrzi; audit az első körben.
- **C-45** — A vak megoldó `chosen` mezőjét kézzel írja; a tartalmi bizonyíték a forrásalapú audit; meglévő tesztet nem lazítunk.
- **C-54** — Minden `keyChanged` tétel újra-vak körbe; magyar szóhatár `(?!\p{L})` + `u`, nem `\b`.
- **C-55** — A Studio-lecke évfolyama három helyen él — mindhármat kövesd; futó munkát anyag / lecke / térkép / jegyzék szerint keress.

### Backend, biztonság, adat
- **C-16** — Hosszú háttérfolyamat követése szerveroldali forrásból is visszaállítható; a böngészőtároló csak gyorsító.
- **C-23** — Böngésző-API-ra épülő funkcióhoz szerveroldali tartalék; külső szolgáltatás formátumát élő próbával mérd.
- **C-24** — Fejléc-alapú állítást (cache, CSP, CORS) az éles címen `curl -D -`-vel igazolj, ne a szerverkódból.
- **C-25** — Új `rateLimit(` csak `clientIpKeyGenerator`-ral; IP-kulcsot ugyanazon kliens ismételt kérésével mérj; titoktár-írás tilos.
- **C-26** — Kliensben nincs visszatekintő regex; új `async` útvonal `try/catch`-csel vagy `asyncRoute`-tal; ismétlődő hibára forrásőr.
- **C-40** — Elsődleges korlátkulcs a felhasználó, mellette laza IP-plafon; teszt két felhasználóval egy IP-ről.
- **C-58** — Szűrőt csak új olvasat hozzáadásával bővíts; a régi elutasítási halmaz tesztben; differenciális próba kötelező.
- **C-59** — Egy tiltásnak egy igazságforrása (kanonikus cím ujjlenyomata a tiltáskor); megőrzési konstans egy helyen.
- **C-60** — Worktree-ben minden abszolút út a munkafa alatt; a teszt a saját átirányítást kapja el; negatív cache nem lehet fail-open.
- **C-67** — Kétoldalú folyamat állapota a szerveren; a kérő jelzése nem elfogadás; lejáratkor minden jelző törlődik.
- **C-68** — Token-forgatás csak nyugtával, kemény türelmi korláttal; protokolljavításnál véletlen állapottér-próba push előtt.
- **C-69** — Listázó végpont ne olvassa be a teljes tartalmat kérésenként; teljesítményt a célgép erőforrásaival mérj.
- **C-71** — A zár kulcsa titok nélküli; az élő állapot forrása maga az adat, nem a titokból képzett kulcs.

### Telepítés, éles mérés, adatbázis
- **C-18** — Telepítési / éles állítás előtt Render MCP-vel és a `verify-render-*.mjs` szkriptekkel mérj; a beállítás a tulajdonos lépése.
- **C-20** — Élő adatbázist használó mérés előtt csak olvasó azonosság-próba; ahol lehet, `file:` mód éles DB nélkül.
- **C-21** — Arculati képválasztás előtt a korábbi döntések (tesztek, spec) elolvasása; idegen DB-vel helyi szerver nem indul.
- **C-28** — Publikált lecke JSON-ja fejléces végponton; nagy választ fájlba, ne a kontextusba; fájltartalmat íróeszközzel.
- **C-47** — Az aktív-futás őrt KÖZVETLENÜL minden merge előtt; zöld PR-ok egy ablakban; hiányzó számláló = hiba, nem nulla.

### Munkaszervezés, doksi, memória
- **C-02** — A kanban CLI-t a WEBSULI gyökeréből futtasd; üres lista előtt nézd meg, melyik táblát nyitotta meg.
- **C-05** — Tulajdonosi direktíva egy körben: repó-vezérlőfájl + projektmemória (+ globális CLAUDE.md, ha minden repóra szól).
- **C-22** — Tulajdonosi vizuális mintához privát Artifact vagy a repó Playwright-konfigja; fontcserénél szóhatáros keresés.

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
- **Tünet 7:** a tulajdonos által jóváhagyott hangpróba után a gyártósorban „takarékosságból” megváltoztattam a hang formátumát
  (128 → 32 kbit/s), és ellenőrzés nélkül adtam ki a hangot; a hangmodell közben félreolvasott („síkság” → „síkség”).
- **Megelőzés 7:** jóváhagyott minta paraméterét (modell, formátum, hang) a gyártósor nem változtathatja meg csendben. Hangot csak
  hangkapun át szabad kiadni: visszaírás FÜGGETLEN felismerővel, betűre összevetés, újrapróba. A szolgáltató saját felismerője a saját
  hangjára elnéző — kapunak nem elég. A felismerőt előbb ismert jó és ismert rossz mintán kell kalibrálni.
- **Tünet 8:** a hangmodellek összevetésekor a pontozóm a felismerő számjegy-írását („0 és 200”) hibának vette — a jó hangok is rossznak
  látszottak. **Megelőzés 8:** mérőeszközt a mérés előtt ismert jó mintán kell ellenőrizni; ha a jó minta megbukik, a mérce a hibás.
- **Tünet 9:** párhuzamos hívások a szolgáltató egyidejűségi korlátjába ütköztek (ElevenLabs: 3; HTTP 429), egy jelenet hang nélkül maradt.
- **Megelőzés 9:** külső szolgáltató párhuzamos hívásai közös sorba állítóval, a mért korlát alatt; 429-re várakozás és újrapróba.
- **Tünet 3:** a hangminőséget az ügynök nem tudja füllel megítélni — a „természetes hang” állítás mérés nélkül feltételezés.
- **Megelőzés 3:** hangról csak mérhető tényt szabad állítani (elkészült, hossz, modell, hangazonosító); a minőség a tulajdonos szemléje.

## C-30 — A játék-mobil mérő: a helyi zöld nem a CI zöldje (2026-11-16)

Forrás: #425 / #429 CI-bukások, `docs/specs/2026-11-15-jatekok-mobil-szobank-vegrehajtas.md` K.7.3 „9/a”.

- **Tünet 1:** a mérő helyben (Vite, valódi GPU) zöld volt, a CI Playwright E2E-je GPU nélkül, buildelt szerverrel futva
  megbukott (szoftveres WebGL figyelmeztetések). **Megelőzés 1:** a helyi zöld nem bizonyítja a CI zöldjét; környezeti
  zajt (SwiftShader, driver „Performance” üzenet) csak szűken körülírt mintával, dokumentálva szabad kiszűrni.
- **Tünet 2:** a Chrome a zárt `<details>` tartalmát is „láthatónak” méri (`content-visibility`), ezért a StartScreen
  `settings` alá tett elemeknek is ≥ 48 px-esnek kell lenniük. **Megelőzés 2:** a mérő nem tekinthet el a zárt részektől.
- **Tünet 3:** közös scratchpadben az alügynökök felülírták egymás segédfájljait. **Megelőzés 3:** mindenki saját
  almappát használ.
- **Tünet 4:** a mérő belépő animáció közben mért (47,x px), a hálózati csonk rossz válaszalakot adott (`{ ok: true }` a
  tömb helyett). **Megelőzés 4:** mérés előtt stabilitás-várakozás (nem fix `waitForTimeout`); a csonk a valódi API
  válaszalakját utánozza. A kezdőképernyőre és a képernyőképre is (S13: `settleIfPresent`, a `shot()` beállt állapotban fotóz).

## C-31 — Szóbank-gyártás: amit a vak megoldó nem fog meg (2026-11-16)

Forrás: S3–S5 jegyzőkönyvek (`docs/measurements/2026-11-15-szobank-{en,de,fr}-vakmegoldo.md`), a #427 / #428 / #431 review-jai,
S13 utójavítás (`tests/vocab-bank-cognates.test.ts`).

- **Tünet 1:** a vak megoldó kanári 10/10 és 0 valódi hiba mellett is átengedte az idiómák tükörfordítását és az eltérő `hu`-jú
  szinonimapárokat (pl. „dzseki” ↔ „dzseki, bomberdzseki”); ezeket a review-botok találták meg. **Gyökérok 1:** a megoldó egy kérdésben
  csak a négy felkínált opciót látja, a bank egészét nem. **Megelőzés 1:** a vak kör után KÖTELEZŐ idióma- és szinonima-audit a teljes
  bankon (`report --overlaps` + idiómalista kézi átnézése); a vak megoldó eredménye önmagában nem bizonyít tartalmi helyességet.
- **Tünet 2:** a `hu` tartalmazta a term-et, vagy betűre azonos volt vele (de `lila` = „lila”, `der Park` = „park”, `fair` ⊂ „fair,
  sportszerű”, fr `le robot` = „robot”, en „half past …” a `hu` angol példájában) — a kérdésre tudás nélkül jó válasz adható. **Megelőzés 2:**
  a `hu` nem tartalmazhatja a term-et, és egyik jelentés-kulcsa sem lehet betűre azonos a névelő nélküli term-mel; az őr
  `tests/vocab-bank-cognates.test.ts` (az ékezetben eltérő nemzetközi szó, pl. Auto–autó, megengedett).
- **Tünet 3:** a párhuzamosan gyártott szintfájlok nem látták egymás szavait: azonos jelentésű, csak alakban eltérő bejegyzés került két
  szintre (de „es regnet in Strömen” L2 ↔ „in Strömen regnen” L3; „wie geht's” ↔ „wie geht es dir”). A term-egyezés-validátor ezt nem
  fogja (a term különbözik). **Megelőzés 3:** láncolt gyártás (az alacsonyabb szint kész term-listája foglalási lista a magasabbnak), vagy
  előre kiosztott szólisták; a végén `report --overlaps` a duplikátumokra is.
- **Tünet 4:** a megoldók részletenkénti válaszai elcsúsztak (a válasz a szomszéd kérdéshez tartozott), ami hamis jelzéseket adott.
  **Megelőzés 4:** a válaszfájl tételenként a `chosen` opció SZÖVEGÉT is tartalmazza, és a pontozó az opciószöveg egyezését is ellenőrzi.
- **Tünet 5:** az ügynök Write / Edit eszköze a `\u00A0` (és `\u202F`) escape-et nyers karakterré írja — a szóbank-fájlban, a commit-üzenetben
  és a PR-leírásban is. **Megelőzés 5:** írás után `grep -c $'\xc2\xa0' <fájl>`; találatnál `perl -CSD -pi -e 's/\x{00A0}/\x5Cu00A0/g'`
  (adatfájlban), szövegben pedig sima szóköz.
- **Tünet 6:** a vesszős `hu`-felsorolás egy általános szót is jelentés-kulccsá tett („bizonyul (valaminek), kiderül, hogy” → „hogy”), így
  a generátor fölöslegesen zárt ki elterelőket. **Megelőzés 6:** a `hu`-ban vessző csak önálló jelentések között álljon; mellékmondatos
  magyarázat zárójelbe (a `meaningKeys` a zárójeles részt eldobja).

## C-32 — Közös CSS-osztály rétegen kívül: a Tailwind segédosztály hatástalan (2026-11-16)

Forrás: S7 (`SpeedQuizMath.tsx` `!text-[…]` kerülőút), S13 / B7.

- **Tünet:** a `.game-answer-btn` gombra tett `text-[clamp(…)]` nem hatott, a játék `!important`-tal kerülte meg.
- **Gyökérok:** Tailwind 3-ban a rétegen kívüli szabály a forrásban a `@tailwind utilities` UTÁN áll, azonos fajlagosságnál ezért nyer.
- **Megelőzés:** felülírhatónak szánt közös komponens-osztály a `@layer components` blokkba kerül (őr: `tests/game-answer-btn-layer.test.ts`);
  `!`-os segédosztály csak indoklással.

## C-33 — „Beállt állapotra várás” élő elemen: a PR CI-ja zöld, a main CI piros (2026-11-16)

Forrás: main CI 43794783447 (b5041240, #437 után): Playwright E2E 3 failed (a `block-craft-quiz` „full: M1 M2 M3 négy
állapotban” mind a 3 nézetben, 3 újrapróbán), 1 flaky (`tests/block-art.spec.ts:18`).

- **Tünet:** `page.waitForFunction 5000ms` a `waitForStable`-ben ← `settleIfPresent` ← `shot(…, "play")`. A #437 saját CI-ja és a
  helyi futás (valódi GPU) zöld volt.
- **Gyökérok:** a #437 a képernyőkép elé „beállt állapotra várást” tett, a `play` állapotban a `[data-game-hud]`-ra. Futó játékban a
  HUD jogosan mozog folyamatosan: másodpercenként új időérték → a `.game-hud-progress-fill` 0,25 s-os `transform`-átmenete és a
  változott stat rugós „pop”-animációja. A `waitForStable` 4 egymást követő, animációmentes rAF-képkockát kér; a szoftveres WebGL-es
  CI-gépen a 3D jelenet mellett kevés képkocka fut, így a tick-ek között ez nem jön össze. Valódi GPU-n (helyben) és a PR-futás
  időzítésében épp összejött — határeset, ezért nem a PR, hanem a main futása bukott.
- **Megelőzés:** stabilitásra csak olyan elemen szabad várni, amelynek van végállapota (belépő animáció: kezdőképernyő, szünet menü,
  eredmény; kvízben a válaszgombok doboza). Élő játékelemen (HUD, idősáv, vászon) soha. A `SETTLE_SELECTOR`-ból a `play` kikerült;
  a kvíz-mérés a `[data-correct]` gombokra vár, nem a teljes kvízrétegre (abban fut a kvízóra csíkja). Új stabilitás-várakozást a
  CI-vel azonos úton (`npm run test:e2e -- … -g <játék>`, buildelt szerver, szoftveres WebGL) is le kell futtatni, nem csak Vite-tal.

## C-34 — Játékszeletek (S6–S12) tanulságai: rétegek, időzítés, teszt-kampók (2026-11-16)

Forrás: #424–#436 review-jai és CI-körei, az S13 átfogó review (K1, K3, H1) és az S13 C-ellenőrzőlistája
(`docs/measurements/2026-11-16-jatekok-c-ellenorzolista.md`).

- **Fekvő tájolást kérő játék (Tornado):** a forgatási kérés (`game-rotate-hint`) álló nézetben eltakarja a játékot. **Megelőzés:**
  az e2e `playReady` kezelje (`game-rotate-continue`), és a játékóra álljon a kérés alatt (`halted`).
- **Késleltetett mentés elavult állapottal:** `setTimeout`-ból mentett React-állapot a bezárt (régi) értéket írta. **Megelőzés:**
  késleltetett írás csak funkcionális állapotfrissítéssel (`setX(prev => …)`) vagy ref-ből.
- **Teszt-kampó minden rendernél:** a `forceResult`-szerű teszt-API effekt minden renderben újra lefutott és újra kiváltotta az
  állapotot. **Megelőzés:** a kampó csak a kérés számlálójának változására fusson (`useEffect(…, [props.forceX])`), és csak
  `VITE_ENABLE_GAME_TEST_HOOKS=1` mellett.
- **`Button variant="secondary"`:** a változat színátmenete felülírja a `className`-ben adott `bg-*` színt. **Megelőzés:** egyedi
  színű gombhoz `variant="ghost"` / saját osztály, vagy a közös `.game-btn-*`.
- **`.hidden` felülírva:** a lap saját, rétegen kívüli CSS-e (`display: grid`) felülírta a Tailwind `.hidden`-t, a rejtett elem
  látszott. **Megelőzés:** állapotfüggő láthatóság feltételes rendereléssel vagy `:not(.hidden)` szelektorral (Kockavadász
  `.game-play-stack:not(.hidden)`); lásd C-32.
- **CDP kétujjas érintés:** a `Input.dispatchTouchEvent` két pontja „lefutott”, de a játék nem kapott két ujjat. **Megelőzés:** a
  többujjas gesztus hatását mutációval (állapotváltozás a DOM-ban / teszt-API-n) is igazolni kell, nem csak az esemény küldését.
- **`npm run test:e2e -- … --repeat-each N`:** a harness láncán a kapcsoló elveszik (egyszer fut). **Megelőzés:** ismételt
  futtatáshoz a közvetlen futtató (`npx playwright test -c <konfig> --repeat-each N`) kell.
- **Magyarázókártya (z 90) a szünet menü (z 80) fölött; a szünet háttere nem inert (review K1, K3):** a menü gombjai elérhetetlenek
  voltak, Tab-bal a háttér válaszgombjai szünetben is megválaszolhatók. **Megelőzés:** minden teljes képernyős játék-fedőréteg a
  közös `useModalLayer`-t használja (inert háttér, fókuszcsapda, fókusz vissza), a kártya szünetben rejtve (`usePauseMenuOpen`);
  a válaszkezelő szünetben nem fogad választ. Mérő: `game-mobile-quality` „K1 K3 szünet a magyarázókártya fölött”.
- **A szóbank-bekötés „sorrend-őre” a jelentést nem méri (review H1):** a `vocab-game-wiring` csak azt nézte, hogy a forrásban a
  tananyag-ág a szóbank-hívás ELŐTT áll; a Tornado feltétele a teljes tananyag-lista ürességét nézte, így tananyag mellett a szóbank
  sosem kérdezett. **Megelőzés:** bekötésnél szimulációs teszt (N húzás a valódi választóval: a tananyag egyszer, utána szóbank),
  nem csak forrásbeli sorrend (`tornado-material-unseen.test.ts`).

## C-35 — Regex a JS-sablonszövegben: a `\s` visszaperjele elveszett, a teszt a szűk bemenetre zöld volt (2026-11-16)

- **Tünet:** a `feedback.ts` megerősítő-előtag regexe `\s*` helyett `s*`-t tartalmazott (`persze)s*[!.:,;–—-]+s*`), így a
  „Helyes — …” és „Helyes: …” kezdetű magyarázat rossz válasznál is megerősítésként jelent meg; a vercel[bot] review fogta meg.
- **Gyökérok:** a fájlt `node -e` / heredoc JS-sablonszövegével (backtick) írtam: a sablonszövegben a `\s` escape-je eltűnik
  (`\s` → `s`), és a regex-szöveget nem olvastam vissza. A saját teszt csak a „Helyes!” alakot próbálta, ami szóköz nélkül is átment.
- **Megelőzés:** regexet tartalmazó kódot kizárólag Edit/Write eszközzel írj (nem JS-sablonszöveggel, nem inline `sed`-del);
  szerkesztés után `cat -A <fájl> | sed -n <sor>p`-vel olvasd vissza a tényleges bájtokat; a regexhez minden elválasztó-változatot
  (szóköz, gondolatjel, kettőspont, vessző) és egy „majdnem egyezik” ellenpéldát (itt: „Helyesírás”) tesztelj.

## C-36 — Hitstop a hurok szorzójával: felülírja a szünetet, és sorrendfüggő (2026-11-16)

Forrás: J0a (#442) review.

- **Tünet:** a szerződés szerint a `feel.hitstop` „a loop timeScale-jét állítja átmenetileg 0-ra”. A hitstop vége visszaírta a
  korábbi szorzót, így a hitstop alatt kért szünetet (vagy kérdés-lassítást) csendben felülírta; a lejárat pedig attól függött,
  hogy a képkockában a `feel.update` vagy a `loop.frame` fut-e előbb.
- **Gyökérok:** két tulajdonos ugyanazon az állapoton (a szorzó a játéké, a hitstop is írta).
- **Megelőzés:** a hitstop a hurok SAJÁT tartása (`loop.holdFor(ms)`, `holdRemainingMs()`): a hurok a képkocka valós idejéből
  előbb a tartást fogyasztja, a `timeScale()` a játék értéke marad. Teszt mindkét hívási sorrendre és „hitstop + szünet együtt”
  esetre (`game-loop.test.ts`, `game-feel.test.ts`).

## C-37 — Háromfázisú kapu: a végrehajtási fájl változása az első kódcommit után (2026-11-16)

Forrás: a játékélmény-szeletek (J0a–J0c) munkarendje; CI „Háromfázisú rend” (`scripts/qa/three-phase-check.mjs`).

- **Tünet:** a kapu piros, ha a PR saját diffjében nincs `docs/specs/*-vegrehajtas.md` változás, vagy az később érkezik, mint az
  első kódcommit (pl. az állapotsort a végén, a kóddal együtt vagy utána commitolták).
- **Megelőzés:** az ELSŐ commit a végrehajtási fájlban a saját szelet `**Állapot:**` sora (és csak az); a kód utána. Push előtt
  helyben: `node scripts/qa/three-phase-check.mjs --base origin/main`. Pusholt ágon a sorrend nem javítható (rebase / force-push
  tilos) — csak új ággal és új PR-ral, ezért a kaput a legelső push ELŐTT kell futtatni.

## C-38 — Friss munkafában `npm ci` a `better-sqlite3` buildjén elbukik (2026-11-16)

Forrás: J0a, J0b munkafák.

- **Tünet:** `npm ci --prefix source` a `better-sqlite3` node-gyp buildjén elbukik, és az egész telepítést visszagörgeti
  (nincs `node_modules`).
- **Megelőzés:** `npm ci --prefix source --ignore-scripts`. Ilyenkor a `native-arch.test.ts` / `doctor:arch` helyben ismert módon
  bukik (a natív kötés nem épül fel) — a CI-ban zöld; jelenteni kell, binárist másolni / megkerülni tilos.

## C-39 — Git Bash-ben nincs `jq`: a figyelő-hurok csendben végtelen (2026-11-16)

Forrás: J0b CI-figyelés.

- **Tünet:** `gh pr checks … --json … | jq …` figyelő-hurok sosem lép ki: a `jq` hiánya miatt a feltétel mindig üres, a hiba a
  csőben elnyelődik.
- **Megelőzés:** a `gh` beépített szűrője: `gh … --json <mezők> --jq '<kifejezés>'` (vagy `-q`). Figyelő-hurok előtt egyszer
  kézzel futtasd a lekérdezést, és nézd meg a kimenetét.

## C-40 — Sebességkorlát csak IP-kulccsal: közös IP mögötti diákok egymást zárják ki (2026-11-16)

Forrás: JM0 (#443) review.

- **Tünet:** a pontbeküldés korlátja IP-címre szólt; egy iskolai / otthoni hálózat (NAT, közös IP) mögött a gyerekek egymás
  kvótáját fogyasztották, a korlát a jóhiszemű felhasználót büntette.
- **Megelőzés:** az elsődleges korlát kulcsa a bejelentkezett felhasználó azonosítója (`createGameScoreUserLimiter`,
  `server/lib/game-score-limits.ts`: 60 / 15 perc), mellette csak laza IP-plafon az elárasztás ellen (600 / 15 perc, a valódi
  kliens-IP-vel). Új korlátnál a teszt két felhasználót ugyanarról az IP-ről is küldjön.

## C-41 — A közös ismétlési sor idegen tétele eltorlaszolta a sort (2026-11-16)

Forrás: J0b (#444) review.

- **Tünet:** az ismétlési sor (`websuli.gameReview.v1`) a hét játékban közös; egy másik játék / nyelv tételét az aktuális
  provider nem tudta visszaállítani, a director mégis újra és újra azt választotta, így a mögötte esedékes, visszaállítható
  tételek sem jöttek elő.
- **Megelőzés:** a vissza nem állítható kulcsot a director a menet végéig átugorja (`unrestorable` halmaz, `exclude` paraméter a
  `dueInRun` / `dueAcrossRuns`-ban) és a sorban HAGYJA (a saját játéka még visszahozza); elavult tétel `REVIEW_STALE_MS` után
  kikerül. Teszt: idegen kulcs a sor elején → a következő esedékes tétel jön.

## C-42 — Közös játék-UI: belépő `scale` animáció a mérő alatt, és a nem létező lint-szabály tiltása (2026-11-16)

Forrás: J0c (kérdés-sáv, `play-lab.spec.ts`).

- **Tünet 1:** az M2 mérő (`smallTargets`) a 48 px-es szünetgombot 47×47-nek mérte — csak a kérdés megnyitása utáni első
  ~180 ms-ban. **Gyökérok:** a kártya belépő animációja `scale(.98)`-ról indult; a `getBoundingClientRect` a transzformált dobozt
  adja. **Megelőzés:** mért (érintési célt tartalmazó) elem belépő animációja csak `opacity` / `translate` legyen, `scale` nem;
  vagy a mérés a beállt állapotra várjon (C-33: élő elemen soha).
- **Tünet 2:** `npm run lint` (max-warnings 0) bukott: „Unused eslint-disable directive (… 'react-hooks/exhaustive-deps')”.
  **Gyökérok:** a repóban a `react-hooks` ESLint-bővítmény nincs bekapcsolva; a megszokásból írt tiltó komment maga a
  figyelmeztetés. **Megelőzés:** `eslint-disable` csak arra a szabályra, amit a lint ténylegesen jelez; push előtt a módosított
  fájlokra `npx eslint <fájlok> --max-warnings 0`.
- **Tünet 3 (megelőzve):** a kérdés-sáv `[data-state="correct"]` gombjait a Szólétra lapszintű, `!important`-os
  `.game-shell-fixed[data-game="WordLadderHuEn"] [data-state="correct"]` szabálya átszínezte volna. **Megelőzés:** a közös
  fedőréteg portálon a `body`-ba kerül (nem a játék gyökerébe), így a lapok saját szelektorai nem érik el.
- **Tünet 4 (review #446):** (a) a megoldás-kijelzés alatt érkező `request()` / ütemezett kérdés azonnal felülírta a kijelzést
  (sérült a ≥ 1,8 mp); (b) a „Miért?” 4 mp-es határidejét az új kérdés megjelenése nullázta. A saját időzítési teszt `tick: false`-szal
  futott, ezért egyiket sem fogta meg. **Gyökérok:** egy változó (`shown`) jelentett „nyitott kérdést” ÉS „kijelzett kérdést”, és a
  „Miért?” állapota a megjelenítéshez volt kötve, nem a hibához. **Megelőzés:** explicit állapotgép (nyitott / kijelzés / függő kérés
  / a hibához kötött „Miért?”-határidő külön), és valódi időléptetéses teszt az ütemezővel együtt (`game-play-question-ui.test.ts`
  „review #446/…”), nem csak kézzel léptetett, ütemezés nélküli eset.

## C-43 — „Mutasd” gombos, két sorra vágott kérdés: a képernyőképen látszott, mégis átment (2026-11-16)

Forrás: J0c (#446) → J0c-b (kanban #46), orkesztrátori képátnézés.

- **Tünet:** a kérdés-sáv a hosszabb kérdést két sorra vágta („…a szén-dioxidból és…”), végigolvasni csak a „Mutasd” gombbal
  lehetett. Egy gyerek 9 mp-es ablakban, játék közben ezt nem nyomja meg → a kérdés megválaszolhatatlan.
- **Gyökérok:** a szerződés „line-clamp 2 + Mutasd” mondatát betű szerint vettem, és a saját képernyőképeimet a „szép,
  nem lóg ki” mércével néztem, nem azzal, hogy a gyerek el tudja-e olvasni a kérdést koppintás nélkül.
- **Megelőzés:** a tanulási felület mércéje a tanulási cél: a képátnézésnél minden szöveges elemre külön kérdés: „olvasható-e
  teljesen, koppintás nélkül, az ablakon belül?”. Mérés a bankok LEGHOSSZABB valódi tételével (`promptFit.ts` +
  `play-lab.spec.ts` „J0c-b …”), nem egy rövid mintával; a tartalék-mechanizmus (pl. „Mutasd”) csak mesterségesen túlhosszú
  bemenetre jelenhet meg.

## C-44 — Évfolyam-bank tartalom: emlékezetből írt tény, létező szó „hibás” opcióként, homonim alak (2026-11-16)

Forrás: #448 review (Codex, Vercel Agent), `docs/measurements/2026-11-16-evfolyam-bank-3-6-vakmegoldo.md` „Második audit”,
`docs/measurements/2026-11-16-evfolyam-bank-7-9-vakmegoldo.md`.

- **Tünet:** a vak megoldó (kanári 10/10) és egy kulcsos audit után is maradt három tartalmi hiba: a János vitéz-kulcs a
  griffmadarat mondta (a mű szerint az óriás viszi át Jánost); a „gólja” „hibás” opció létező szó (a gól birtokos alakja); a
  „rajzoltatok” múlt időnek szánva jelen idejű műveltető alakként is elemezhető. Egy meglévő (2026-09-es) tételben is ott volt a
  „gólja”.
- **Gyökérok:** a gyártó és az auditor is emlékezetből dolgozott; a vak megoldó egy tételt lát, és a „melyik a helyes” típusnál
  nem kérdőjelezi meg, hogy a rossz opció valóban nem szó-e.
- **Megelőzés:** (1) a gyártó forrásból dolgozik, tételenként forrás-megjegyzéssel (a validátor bukik nélküle), irodalmi tény
  csak a mű szövegéből; (2) a helyesírási „hibás” opciót a hunspell magyar szótár (`dictionary-hu` + `hunspell-asm`, a
  függőségek között) ellenőrzi — a gyártási validátorban ÉS a `tests/grade-quiz-bank-coverage.test.ts` őrben a 3–12. évfolyam
  minden tételén; (3) nyelvtani alakot mondatba ágyazva kérdezünk; (4) a forrásalapú audit az ELSŐ körben fut, és a javított
  tételt a vak megoldó újra megoldja.

## C-45 — Évfolyam-bank: a meglévő tesztek szűk mintái és a vak megoldó gyengeségei (2026-11-16)

Forrás: JBa / JBb futás (#448 és a JBb PR).

- **Tünet 1:** a `tests/grade-quiz-bank.test.ts` ORDINAL-mintája (`/i` kapcsolóval) a magyar „A válasz …” névelős szókapcsolatot is
  sorszám-hivatkozásnak méri; a számolója a `3/4 : 1/2` alakot balról jobbra olvassa ((3/4)/1)/2, és a „12, 18 és 30” közül csak a
  „18 és 30” párt veszi. **Megelőzés 1:** a gyártási validátor ugyanezekre bukik; a magyarázatban „A felelet”, törttel osztás
  zárójellel, több szám LKKT-ja névelős alakban; a meglévő tesztet nem lazítjuk.
- **Tünet 2:** a Sonnet-szintű vak megoldó gyors, de irodalmi és alaptény-kérdéseken tévedett (6. évf.: 7 tévedés; 7. évf.: 4
  irodalmi); egy megoldó a `chosen` mezőt szkripttel töltötte ki az indexből (a védelem üres). **Megelőzés 2:** az utasítás
  kimondja, hogy a `chosen`-t a megoldó kézzel másolja; minden megoldói eltérést a forrásból bírálunk el; a tartalmi
  bizonyítékot a forrásalapú audit adja, nem a vak kör.
- **Tünet 3:** a JS `\b` ASCII-alapú — az „ó” végű „szó” után nem illeszkedik, a helyesírási tételek felismerője így csendben
  kevés tételt talált. **Megelőzés 3:** szóköz-határ, és a teszt minimális darabszámot is ellenőriz.
- **Tünet 4:** a Write eszköz a `\u00A0` escape-et a tesztfájlban és a jegyzőkönyvben is nyers NBSP-vé írta (C-31/5 ismét).
  **Megelőzés 4:** írás után `grep -c \xc2\xa0'`.
- **Tünet 5:** a `git stash push` parancs a push-audit hookot is kiváltja (a „push” szó miatt). **Megelőzés 5:** `git stash -u`.
- **Tünet 6:** a Git Bash-es `node -e` szövegcsere CRLF-es forrásfájlon csendben nem illeszkedett (a fájl CRLF, a minta LF).
  **Megelőzés 6:** forrásfájlt Edit eszközzel módosítunk, és a csere után ellenőrizzük, hogy tényleg megtörtént.
- **Tünet 7:** a vak megoldó csak a kérdést és az opciókat látja, a magyarázatot nem; a forrásalapú audit a kulcsot igazolta,
  a magyarázat mellékállítását nem (Szondi két apródja: két jelenet összemosva; „a since is időtartamot vezet be”; Hannibál
  „30 elefántja”). **Megelőzés 7:** külön magyarázat-audit állításonként („igazolt – forrás” / „nem igazolható → törölve”), és a
  `source/scripts/grade-bank-keyword-groups.ts` kulcsszó-csoportjain a bankon belüli ellentmondás emberi átnézése.
- **Tünet 8:** a hosszkorlát-teszt a 9 mp-es felső határhoz mért, nem a játék tényleges olvasási szűrőjéhez; a 4. évfolyam 40%-a
  nem volt elolvasható. **Megelőzés 8:** a bank-őr ugyanazt a `fitsAllViewports`-ot hívja, mint a játék (`.ok`, ≥ 95% /
  évfolyam, cellánként ≥ 15); a szöveges duplikátum-ellenőrzés mellé tartalmi (azonos válasz + átfedés) jelölt-keresés kell.

## C-46 — A `\uXXXX` escape az eszközparaméterben dekódolódik: nyers sorelválasztó került a regexbe (2026-11-16)

- **Tünet (JM7b):** a becenév-szűrő `INVISIBLE` regexébe `(backslash-u)2028(backslash-u)2029`-et írtam (Write eszköz) — a fájlba a két NYERS
  Unicode-sorelválasztó került, a `tsc` „Unterminated regular expression literal” hibát adott. Ugyanez a `node -e "…(backslash-u)2028…"`
  parancsban is megtörtént (a parancsszöveg is dekódolódott).
- **Gyökérok:** az eszközparaméterek JSON-ként érkeznek: a négyjegyű `\uXXXX` escape a fájl / parancs megírása ELŐTT karakterré
  alakul (a `\p{…}`, `\s` nem érvényes JSON-escape, ezért azok megmaradnak — ezért nem tűnt fel korábban).
- **Megelőzés:** forrásban Unicode-tartományt kategóriával írj (`\p{Cf}`, `\p{Zl}`, `\p{Zp}`, `\p{Cc}`), ne `\uXXXX`-szel; tesztben
  a különleges karaktert `String.fromCodePoint(0x200b)`-vel állítsd elő; írás után `cat -A <fájl> | sed -n <sor>p` (a `M-bM-^@M-(`
  alak nyers U+2028-at jelez). Javítás csak karakterkóddal (`String.fromCharCode(0x2028)`) kereső szkripttel, nem escape-pel.
- **Tünet 2 (JM7b, #449 CI):** az új admin-fül miatt a `admin-korszerusites.test.ts` fülszámát (16 → 17) dokumentáltan átírtam,
  de az ugyanazt mérő e2e-párját (`admin-korszerusites.spec.ts`) nem — a helyben futtatott e2e-k között nem szerepelt, csak a CI
  ~40 perces Playwright-jobja fogta meg. **Megelőzés:** egy számlált / felsorolt elvárás (fülszám, végpontlista) módosításakor
  `grep -rn "<régi szám vagy kulcs>" tests/` a `*.test.ts` ÉS a `*.spec.ts` fájlokra, és a találatokat mind futtasd helyben.

## C-47 — Telepítés előtti „aktív gyártás” őr: pillanatfelvétel, sorozatos összevonás, üres összeg (2026-11-16)

Forrás: orkesztrátor (a 2026-11-16-i összevonási sor), független audit H4, kanban #63; megoldás: `scripts/qa/active-runs-guard.sh`,
runbook: `docs/telepites-elotti-or.md`.

- **Tünet 1:** a sorozatos összevonások (egy nap 39 PR, köztük ~15 percen belül három éles telepítés: #462, #469, #467) közben
  megszakadt a tulajdonos futó tananyaggyártása. A telepítés előtt futtatott őr csak pillanatfelvétel volt: az őr „nincs futás”
  után a következő összevonás már új telepítést indított, és a Render a futó folyamatot leállítja. **Gyökérok:** az őr az
  összevonás ELŐTTI időpontra mondott igazat, a telepítések viszont sorban jöttek, a graceful shutdown pedig felső korláttal vár.
  **Megelőzés:** az őrt KÖZVETLENÜL minden `gh pr merge` előtt futtasd; a zöld PR-okat egy ablakban vond össze (egy őr-ellenőrzés,
  egy telepítési ablak), és az ablakot előre jelezd a tulajdonosnak; kilépési kód 1 vagy 2 esetén nincs összevonás. `MP_MODE`
  bekapcsolása után a `/api/rt/status` `activeMatches` értékét is nézd.
- **Tünet 2:** a kézi őrszkript a Git Bash-ben `bc`-t hívott az összegzéshez — `bc` nincs, az `AKTIV=` üres maradt, és üres
  összeget nem nulla-ként, hanem hiányzó adatként kell kezelni. **Megelőzés:** az összeget a shell számolja (`$((…))`), a szkript
  ellenőrzi, hogy pontosan négy számláló érkezett, különben 2-es kilépési kóddal áll meg; Git Bash-ben a `bc`, a `jq` (C-39) és
  más „megszokott” eszközök hiányát első lépésként ellenőrizd (`command -v`).

## C-48 — Közös, hozzáfűzős dokumentum és közös sorszám-tér több párhuzamos PR-ban (2026-11-16)

Forrás: orkesztrátor; JM7b (#449), J4a (#451 / #457), a #471 és a terv migrációs sorszáma.

- **Tünet 1:** minden szelet-PR a `docs/agent-csapdak.md` végére fűzte a saját C-számú bejegyzését; minden összevonás után az
  összes többi nyitott PR ütközött (és a C-44 / C-47 számokat több szelet is magának szánta). **Gyökérok:** egy hozzáfűzős fájl
  és egy közös, növekvő sorszám minden párhuzamos PR-nak ugyanaz a konfliktuspont. **Megelőzés:** szelet-PR nem módosítja a
  katalógust; a zárójelentés „CSAPDA-JAVASLAT” része kész szöveggel (ideiglenes számmal) megy az orkesztrátornak, aki egy
  közös docs-PR-ban gyűjti és számozza (ez a bejegyzés is így született). Ellenőrzés: `git diff origin/main --stat -- docs/agent-csapdak.md` üres.
- **Tünet 2:** két párhuzamos PR a végrehajtási fájlban ugyanazon fejezet után szúrt be új szakaszt — a második biztosan ütközik.
  **Megelőzés:** az első (háromfázisú) commitban a saját fejezet horgonyát egyedi helyre tedd, vagy az összevonási sorrendet előre
  tervezd; az „Állapot” sort a saját PR viszi, a közös docs-PR csak a már összevontakét frissíti.
- **Tünet 3:** a terv a `0041` migrációs sorszámot a JM8a-nak osztotta, a nyitott #471 (tiltás-ujjlenyomat) viszont ugyanazt a
  fájlnevet foglalta — az audit (H6) találta meg. **Megelőzés:** a migrációs sorszám a PR megnyitásakor a végrehajtási fájl
  „migráció-számok foglalva” sorában is rögzüljön, és a JM8a indulásakor `ls source/migrations` a végső szó; a sorszám-változás
  minden későbbi migrációt eltol (JM8a 0042, JM9 0043, JM10 0044).

## C-49 — A PR saját zöld CI-ja nem garancia: közös réteg változása, ingadozó e2e, elavult futások (2026-11-16)

Forrás: orkesztrátor; main CI futások (ba9c666c a #458 után, 9bda1373 a #445 után, b5041240 a #437 után), #458, #470.

- **Tünet 1:** a PR zöld CI-val ment a mainre, a main CI mégis piros lett (mérve: 2026-11-16-án a main 39 CI-futásából 3 bukott, 4 még
  futott a lekérdezés pillanatában; mindhárom bukás Playwright E2E, ingadozó teszt: `block-craft-quiz` lejárati / mérő-állapot,
  `vocab-cross-game-log` A5, `block-art`, `block-craft-real-touch`, `joystick-response` Aszteroida). **Gyökérok:** (a) a PR CI-ja a
  PR saját alapján futott, nem a közös réteg későbbi változásával együtt; (b) az ingadozó tesztek egy kód-azonos fejen is
  bukhatnak (kanban #58). **Megelőzés:** közös réteg (mérő, `game-engine`, `index.css`) változása után a fogyasztó PR olvassza be a
  `main`-t, és fusson újra; ingadozó tesztet jegyre és külön PR-ra (#470), ne „újrafuttatással zöld” állapotra bízz; a véletlen
  választású e2e-t `--repeat-each 10`-zel mérd (a J2a tanulsága, lásd C-53).
- **Tünet 2:** a sorozatos összevonások és push-ok miatt a ~30 perces Playwright jobok elavult commitokon is futottak, a futtatók
  torlódtak, az új PR-ok CI-ja késett. **Megelőzés:** az elavult (felülírt fejű) commitokon futó CI-k megszakítása felszabadítja a
  futtatókat (`gh run cancel <id>`); a megszakítás előtt ellenőrizd, hogy a fej tényleg elavult.

## C-50 — Visszaperjeles szöveg shell-heredocban, Pythonban és az eszközparaméterben (C-35 ismét) (2026-11-16)

Forrás: J4a (#451 / #457), JM7b (#449), JM7c-1 (#462), JBc (#458), J2a (#454). Kiegészíti: C-35, C-46.

- **Tünet 1:** tesztfájlt Python-heredocban szerkesztve a nem nyers karakterláncban a `\b` (a megírt két karakterből a Pythonban
  backspace, 0x08 lett: `nextTask\b` helyett láthatatlan vezérlőkarakter), a teszt mégis zöld volt; ugyanígy bukott egy tsx-szonda
  és egy python-csere (`\1`, `\s`), JM7c-1-ben a `\x60` valódi backtickké alakult és eltörte a TS sablonszöveget, JBc-ben a `\b`
  szöveg helyére backspace-bájt került, és a python-os visszajavítás csendben hatástalan maradt. **Gyökérok:** a shell-heredoc `'EOF'`
  idézőjellel változatlanul hagyja a visszaperjelet, de a Python-karakterlánc (és az eszközparaméter, C-46) értelmezi.
  **Megelőzés:** regexet és visszaperjeles szöveget CSAK az Edit / Write eszközzel írj; utána bájtszintű visszaolvasás
  (`grep -cP "[\x00-\x08]" <fájl>` → 0, `od -c`, `cat -A`); javítás Write-tal írt node-szkripttel.
- **Tünet 2:** a Python-szkript `open()`-nel alapbeállításon olvasott, `newline=''`-vel írt: a CRLF-es munkapéldány LF-re váltott
  (a git figyelmeztetett); a Git Bash-es `node -e` szövegcsere CRLF-es forrásfájlon csendben nem illeszkedett (C-45/6).
  **Megelőzés:** forrásfájlt Edit eszközzel módosíts; ha mégis szkript, `open(p, newline='')` olvasáskor is, és a csere után
  ellenőrizd, hogy tényleg megtörtént (`git diff --stat`).
- **Tünet 3 (J2a):** Bash-ben egy elfelejtett `cat > fájl` (heredoc nélkül) a stdin-re várt, a parancs a háttérbe került és
  végtelenül futott. **Megelőzés:** fájlt csak a Write eszközzel vagy teljes heredoc-kal írj; a háttérbe került, gyanúsan néma
  parancsot nézd meg, mielőtt várnál rá.

## C-51 — Egymásra rakott holtsávok: a „lassú joystick” nem késés volt, hanem halott tárcsa-közép (2026-11-16)

Forrás: kanban #49, #456 (tulajdonosi hibajelentés valódi telefonról: „nagyon lassan reagál, nem lehet finoman vezérelni”).

- **Tünet:** mind a négy tárcsás játékban (Tornado, Kockavadász, Aszteroida, Szökőár) a kis kitérés semmit nem csinált, utána
  egyszerre jött a teljes sebesség / kormány.
- **Gyökérok (mérve, `tests/joystick-response.spec.ts`):** a tárcsa saját 0,15-ös holtsávja UTÁN a játékok még egy küszöböt tettek
  rá (`joystickToDirections` 0,35 → a sugár ~45%-áig semmi, utána digitális 100%; a Tornado kormánya 0,2-es tengely-holtsáv +
  négyzetes görbe → a sugár 30%-áig 0, 40%-nál 5%). Mellékokok: az Aszteroida állandó gyorsulása (90% 244 ms), a tárcsa gombja
  React-állapottal (egy képkockával a játék után rajzolódott), a Szökőár render-felülírása (minden renderben ≤ 42 ms mozgást vont vissza).
- **Megelőzés:** egy holtsáv (a tárcsáé), utána folytonos görbe (`shapeJoystick` / `joystickCurve`); a játék analóg értéket olvas
  ref-ből képkockánként, nem logikai irányokat. „Lassú vezérlés” jelentésnél ELŐBB a kitérés → mozgás görbét mérd (finomság-tábla),
  ne csak a késést; teszt-küszöböt csak dokumentált `SPEC-VÁLTOZÁS`-sal lazíts (a régi küszöböt épp a hibás holtsávos kormány teljesítette).
- **Mellék-csapda (CI):** a böngészős mérés ms-os ablaka a CI SwiftShaderén (Kockavadász ~6 fps) 3–4 képkocka: a mérés képkocka-számra
  várjon; a Vite fejlesztői szerver hosszú futás közepén „504 Outdated Optimize Dep” állapotba kerülhet (egy egész játék-csoport bukik
  betöltéskor) — friss szerverrel futtasd újra, ne kódhibát keress. Valódi telefonos próba nélkül a javítás UNVERIFIED.

## C-52 — Mozgó válaszcél két ujjal; a szimuláció más lépésmérettel fut, mint a lap (2026-11-16)

Forrás: J4a (#451) és review-körei, a közös utójavítás (#457).

- **Tünet 1:** a világban mozgó, `onClick`-es válaszgomb két ujjnál nem választott: a böngésző a NEM elsődleges mutatóra nem
  szintetizál `click`-et (a telefont tartó hüvelykujj a képernyőn). Érintésnél ráadásul implicit pointer capture van: a `pointerup` az
  elhúzott ujjnál is a lenyomott célra érkezik. **Megelőzés:** mozgó célra a közös `pointerTapHandlers` (`game-engine/play/pointerTap.ts`);
  teszt CDP-vel (két ujj, elhúzás), a mobil esetfájlban `quizMoving: true`.
- **Tünet 2:** a node-szimuláció `dt × timeScale` lépéssel futott, a lap fix 16,67 ms-os lépéssel; a `waves.ts` lépésenként fogyaszt
  RNG-t, így azonos seed mellett is más ellenfélsort mért a sim — az elfogadási számok más játékmenetről szóltak. **Megelőzés:** a lap és
  a sim UGYANAZT a meghajtót hívja (minta: `speedMath/core.ts` `createTowerDriver`), bizonyító teszt lépés-indexhez kötött bemenettel,
  eltérő képkocka-időkkel; a meghajtó javítása után minden szimulációs számot újra kell mérni.

## C-53 — Átírt játék: a régi `index.css`-szabály felülír; képkockánkénti kérés; forráskeverés és ingadozó e2e (2026-11-16)

Forrás: J2a (#454, Szólétra „Szikla-verseny”).

- **Tünet 1:** az új kapaszkodó-gombok kéken, 44 px magasan jelentek meg; a ≥ 48 px-es mérce egy hosszú kifejezésnél 46 px-re esett.
  **Gyökérok:** az `index.css` régi, a játék panelére írt szabálya (`.game-shell-fixed[data-game="…"] [data-testid="…"] button`)
  specifikusabb egy puszta osztálynál — a testid megmaradt, a szabály vele maradt. **Megelőzés:** átírt játéknál
  `grep -n "<játék-gyökér>\|<régi testid>" client/src/index.css` az első böngészős próba előtt; a saját szabály a régi hatókörrel
  kezdődjön, vagy ORKESZTRÁTOR-KÉRÉS a régi törlésére; mérés `getComputedStyle` + illeszkedő szabályok listájával.
- **Tünet 2 (megelőzve):** a játék minden képkockában kért kérdést; a megoldás-kijelzés alatt a közös vezérlő függő kérést jegyez és
  `emit(true)`-t hív — képkockánkénti React-frissítés. **Megelőzés:** kijelzés alatt csak akkor kérj, ha `q.view().pending === null`.
- **Tünet 3:** a gyorsabb tempó és a `promptFits`-szűrés után a `vocab-cross-game-log.spec.ts` 6 gyors válaszából 6/18 futásban egy sem
  volt szóbankos — a teszt 33%-ban bukott (ugyanez az A5 a main CI-ban is ingadozott, C-49). **Megelőzés:** forráskeverésnél a kis, de
  fő forrás (szóbank) kapjon garantált helyet (minden második új tétel); véletlen választós e2e-t `--repeat-each 10`-zel mérj, mielőtt zöldnek mondod.

## C-54 — Évfolyam-bank 10–12.: a `keyChanged` kulcs, az ASCII szóhatár, a részleges forrásaudit, két védhető válasz (2026-11-16)

Forrás: JBc (#458). Kiegészíti: C-31, C-44, C-45.

- **Tünet 1:** a rövidítő alügynök egy meglévő tételt (izomerek) „összegképlet / szerkezet” párokra írt át, a helyes opció szövege
  megváltozott (`keyChanged: true`), és a kulcs a FORDÍTOTT párra mutatott; a rövidítés-ellenőrző a `keyChanged` jelzésre a kulcs-egyezést
  nem nézi, csak az újra-vak kör fogta meg. **Megelőzés:** minden `keyChanged` tétel kötelezően újra-vak körbe megy, a kulcsát az integrátor
  kézzel is visszaolvassa; logikai előfeltételt a kérdésbe ne tegyünk (az elterelők kitalálhatóan kiesnek), az elnevezés ne visszhangozza a kérdést.
- **Tünet 2:** a `BANNED_OPTION` minta a szóhatár-jellel (`\b`) zárult: a „mindkettő” záró „ő”-je után az ASCII-alapú `\b` nem illeszkedik,
  így a „mindkettő azonos” opció átcsúszott. **Megelőzés:** `(?!\p{L})` + `u` kapcsoló; magyar szó végén `\b`-t nem használunk.
- **Tünet 3:** a forrásalapú auditorok a 117 tételes tárgycsomagokból csak a kétesnek látszó állításokhoz nyitottak forrást, a többit
  tankönyvi tudással fogadták el. **Megelőzés:** maradó kockázatként a jegyzőkönyvbe; nagyobb csomagnál tárgyanként két auditor.
- **Tünet 4:** a review két védhető választ talált egy szereplő-kérdésnél (Salamon király: Möbiusnak, de a végén von Zahndnak is); a vak
  megoldó, a forrásalapú audit és a magyarázat-audit is átengedte, mert mindhárom a kulcsot igazolta, nem az elterelőket. **Megelőzés:**
  irodalmi „melyik szereplő …?” tételnél az auditor MINDEN elterelő szereplőre külön ellenőrizze a szöveg alapján (a mű végét is beleértve),
  hogy rá nem igaz-e az állítás.

## C-55 — A Studio-lecke évfolyama három helyen él; futó munka keresése nem csak `lesson_id`-val (2026-11-16)

Forrás: #459, #465 (kanban #54).

- **Tünet 1:** a Studio-lecke (`content_type = lesson`) évfolyamát az admin csak a `html_files.classroom` oszlopban írta át — a
  `lessons.json.classroom` és a `knowledge_maps.classroom` is hordozza, a lecke nézete és az újrapublikálás onnan dolgozik, így
  ellentmondás maradt volna, és a javítás visszaíródott. **Megelőzés:** az évfolyam módosításakor mindhárom helyet kövesd; teszt: a
  három érték egyezik a módosítás után.
- **Tünet 2:** a „fut-e most munka ehhez az anyaghoz” ellenőrzés csak a `lesson_id`-t nézte; a `from-map` gyártás jobja
  publikálásig csak a `map_id`-t hordozza. **Megelőzés:** futó munka keresésekor az anyag, a lecke, a tudástérkép (`map_id`) és a
  forrásjegyzék azonosítóját is vizsgáld.

## C-56 — Próbabot „mindig a jó választ adja”: minden eltérés hibajel; a speciális kérdés esedékessége; átfedő válaszgombok (2026-11-16)

Forrás: J4b (#466).

- **Tünet 1:** a próba-bot mindig a helyes választ szándékozta adni, mégis 37/40 lett a 40/40 helyett; az eltérést a kimenet mutatta, de nem
  vizsgálták ki. A háttérben a főellenfél- és Hibagyár-kérdésnél négy válaszgomb két célpozícióra esett, a később renderelt gomb eltakarta az
  elsőt: ha a helyes válasz a 0. vagy 1. indexre került, érintéssel nem volt választható (a gyerek szemszögéből megoldhatatlan kérdés).
  **Megelőzés:** a „mindig helyes” szándékú botnál minden eltérés hibajel — addig nem zöld, amíg a miértje ki nem derül; a közös mobil mérő
  mérje a célpont–célpont átfedést (M2), minden indexen kiválasztható legyen a helyes válasz valódi érintéssel.
- **Tünet 2:** a bomba esedékessége kérdés nélkül elfogyott: a kérdés-ütemező az ismétlési tételt az új tétel ELŐTT választotta, a játék
  viszont minden sikeres kérés után „elhasználtnak” vette a bombát — a becslési feladat kimaradt, az időzítő újraindult. **Megelőzés:**
  speciális kérdés esedékessége csak akkor fogyjon, ha a feltett kérdés ténylegesen az volt; ugyanazt a mintát (speciális fajta kérése →
  ismétlés előzi → állapot elfogy) ellenőrizd a főellenfélnél és a láncnál is; a szimulációs táblát (kérdés/perc, ismétlési arány, bombák
  száma) a javítás előtt és után mérd.

## C-57 — Meta-képernyők mérése: `scrollIntoView`, rögzített keret, tizedes-tagolás, levágott felirat (2026-11-16)

Forrás: #467 (Vihargarázs, kanban #59), az orkesztrátor képernyőkép-olvasása.

- **Tünet 1:** a „nézetbe hozható-e” mérés (`scrollIntoViewIfNeeded`, `el.scrollIntoView`) ZÖLD lehet akkor is, ha a felhasználó nem tud
  görgetni: a böngésző programból az `overflow: hidden` dobozt is görgeti. A garázs Beállítás / Rekordok / Statisztika képernyőjének alja
  így maradt elérhetetlen. **Megelőzés:** a mérő az elgörgetés után ellenőrizze, hogy egy `overflow: hidden|clip` ős sem mozdult el
  (`tests/support/game-meta-quality.ts` X3); érintéses görgetéshez a CDP `Input.dispatchTouchEvent` sorozat (touchStart → touchMove… → touchEnd) kell, az
  `Input.synthesizeScrollGesture` touch módja az emulált Pixel profilban nem görget.
- **Tünet 2:** a rögzített játékkeret (`data-fixed-screen="true"`, 100dvh + `overflow: hidden`) tartalom-képernyőn (garázs, beállítás)
  levág, és a flex-oszlop a `min-h-0` görgető dobozt 0 px-re nyomja (a járműrács `clientHeight 0 / scrollHeight 8792`). **Megelőzés:**
  a `fixedScreen` csak a játéktérnek való; meta-képernyőn természetes lapgörgetés, vagy jelzett belső görgető (`ScrollPane`, mérő X8).
- **Tünet 3:** `toLocaleString("hu-HU")` a 4 jegyű számot nem tagolja („1410”, de „10 000”). **Megelőzés:** tesztben `1\s?410` mintával illessz.
- **Tünet 4 (orkesztrátori olvasási hiba):** a képernyőképen levágott „Mind (160)” feliratot az orkesztrátor „Mind (100)”-nak olvasta, és
  „adateltérést” jelzett belőle. **Megelőzés:** képernyőképről szám-állítást ne vezess le; a számot a DOM szövegéből (`textContent`) vagy
  a végpontból olvasd, a levágott feliratot jelezd mérési hibaként.

## C-58 — Szűrő-olvasat cseréje hozzáadás helyett regressziót okoz (2026-11-16)

Forrás: JM7b-utójavítás N1 / N1b (#461, #469).

- **Tünet:** a becenév-szűrő első javítása (az `l` / `I` / `1` csere kezelése) az olvasatok CSERÉJÉVEL készült, nem kiegészítésével, így a
  régi elutasítási halmaz egy része újra átment; a #461 után a 111 kísérletből 28 átjutott. **Gyökérok:** a szűrő „mit utasít el” halmaza
  nem volt rögzítve tesztben, a csere ezt észrevétlenül szűkítette. **Megelőzés:** szűrőt / normalizálót csak ÚJ olvasat hozzáadásával
  bővíts; a régi elutasítási halmazt tesztben rögzítsd; kötelező a differenciális próba: a régi szűrő elutasít → az új elfogad (elvárt: 0
  név), hamis tiltás (ártatlan nevek, ajánlott nevek: 0), a foglaltsági kulcs bitre azonos, legrosszabb esetű bemenet ideje. A #469 próbája:
  55 579 generált név, main elutasít → PR elfogad: 0, hamis tiltás: 0, a régi 111-ből 0 megy át; a régi elutasítási halmaz rögzítve: `tests/fixtures/nickname-main-rejected.json`, `tests/nickname-filter.test.ts`.
  Maradék: 3 számjegynél többnél csak két olvasat készül (`MAX_DIGIT_SITES`), és a szűrő elején belső `slice(0, 64)` hiányzik — az
  `MP_MODE` / `PLAYER_ACCOUNTS` bekapcsolása előtt kötelező.

## C-59 — Ágankénti védelem helyett közös pont: a tiltás kijátszása törléssel és alias-címmel (2026-11-16)

Forrás: JM7b-utójavítás N2 / K1 (#463, #471), független biztonsági review.

- **Tünet 1:** a tiltott játékos a fiókja törlésével és ugyanazzal a címmel újra belépve tiltás nélküli fiókot kapott (#463 maradó
  kockázata). A #471 első változata az ujjlenyomatot a TÖRLÉSKOR írta, ezért az ÉLŐ tiltott fióknál az alias-kijátszás működött: a
  tiltott cím pont-, plusz-jeles vagy `googlemail.com`-os változatával új, tiltatlan fiók keletkezett (futtatott próbával
  megerősítve). **Gyökérok:** a védelmet az egyes belépési / törlési ágakra tettük, nem egy közös pontra: a tiltásnak két igazságforrása
  lett (fiók és ujjlenyomat). **Megelőzés:** egy tiltásnak pontosan egy igazságforrása legyen — az ujjlenyomat már a TILTÁSKOR keletkezzen
  (feloldáskor törlődjön), és új fiók létrehozásakor a KANONIKUS cím ujjlenyomatának létezése jelentsen tiltást; a címenkénti zár (és a
  kódkérési korlát kulcsa) is a kanonikus címre szóljon. Teszt: minden címváltozat + a Google-út → tiltott.
- **Tünet 2:** a megőrzési idő és a kulcs-rotáció: az ujjlenyomatnak nem volt lejárata, és a `SESSION_SECRET` rotációja csendben
  érvénytelenítené a megőrzött tiltásokat. **Megelőzés:** egy helyen definiált megőrzési konstans (alap 12 hónap, a napi takarító törli a
  lejártakat, az élő tiltás nem jár le), külön stabil kulcs vagy runbook-lépés a rotációhoz; a felhasználói szöveg nevezze meg a megőrzést.

## C-60 — Admin-jog engedélylistából: worktree-ben abszolút út, átirányítás-célú kérés, fail-open negatív gyorsítótár (2026-11-16)

Forrás: JM7c-1 (#462), független biztonsági review.

- **Tünet 1:** worktree-ben dolgozva a `D:\repo\WEBSULI\render.yaml` abszolút úttal kiadott szerkesztés a FŐ checkoutot módosította.
  **Megelőzés:** worktree-ben minden abszolút út a `.claude/worktrees/<név>/` alatt legyen; a hibás szerkesztést patchként vidd át a
  munkafába, a fő checkoutot `git restore`-ral állítsd vissza (a fő checkoutban csak a `.audit-ok` push előtt írható).
- **Tünet 2:** a Playwright `page.route` nem kapja el az átirányítás célját (a 302-es választ követő kérést): az egyik e2e-próba valódi
  `accounts.google.com` kérést indított csonk kliensazonosítóval (titok nélkül). **Megelőzés:** a saját útvonalat kapd el
  (`route.fetch({ maxRedirects: 0 })`, a Location kiolvasása, `fulfill`), és biztonsági hálóként `context.route("https://accounts.google.com/**", r => r.abort())`.
- **Tünet 3:** egy induláskori „nincs listás admin” negatív eredmény öröklődött a következő kérésre, így az e2e-ben a listán kívüli jelzős
  fiók 3 másodpercig admin volt. **Megelőzés:** kizárás-ellenes (fail-open) döntés negatív eredményét minden kérés elején újra ellenőrizd,
  ne gyorsítótárazd.
- **Tünet 4:** az `ADMIN_EMAIL` változót a kód listaként bontotta: több cím esetén mind admin-listára került volna (és egy külső cím az első
  Google-belépéskor admin lehetett volna). **Megelőzés:** alapértékként csak a pontosan egy érvényes címet tartalmazó érték számít, különben
  `none` + hangos hibanapló + teszt; telepítés előtt a Renderen az `ADMIN_EMAIL` értékét ellenőrizni kell, és a második admin sorsát (az
  `ADMIN_ALLOWLIST`) külön tulajdonosi lépésként kezelni (audit H1).

## C-61 — Repó-szintű őr-teszt és párhuzamos PR-ok: az őr zöldje elavul, az előtag-kivétel lyukas (2026-11-16)

Forrás: #474 (címőr-teszt), #471, #479; retro: `docs/handoffs/2026-11-17-jatekok-utomunka-retro.md`.

- **Tünet:** a `main` Unit Tests jobja piros lett a #474 összevonása után (`38861d28`), mert az őr a közben összevont #471 szintetikus
  Gmail-tesztcímein bukott; a #474-et a #471 ELŐTTI CI-zöldjére vontuk össze. Minden nyitott PR Unit Tests + natív jobja piros lett.
  A #479 első változata előtag-egyezéssel adott kivételt — a review-bot jogosan kifogásolta (valódi cím is átcsúszhatott volna).
- **Gyökérok:** a repó-szintű őr minden fájlt néz, a PR zöldje csak az akkori fájlokra igaz; a kivétel módja túl tág volt.
- **Szabály:** az őr összevonása előtt a friss `origin/main`-en ÉS a nyitott PR-ok ágain is futtasd csak az őrt (`git worktree add
  --detach` + a tesztfájl bemásolása). Kivételt soha ne előtag-egyezéssel adj: fájlra szűkített, pontos lista, a fájlokból programmal
  gyűjtve, ellenpróbákkal (valódi alakú cím továbbra is bukik).

## C-62 — Zöld CI után ne tölts fel „még egy apró” commitot (2026-11-16)

Forrás: #477.

- **Tünet:** a zöld CI után feltöltött, csak doksit érintő commit (23:08Z) újraindította a ~1 órás kötelező Playwright E2E-t; az új
  futás már az aktuális (akkor piros) mainnel együtt tesztelt, a PR kiesett az összevonási ablakból (a végső E2E 23:54Z–00:54Z, 60 perc).
- **Szabály:** zöld CI után nincs további push (doksi sem). A mondanivaló a zárójelentésbe / a PR-leírásba megy; ha mégis kell a push,
  számolj újabb teljes E2E-körrel és a main közbeni változásával.

## C-63 — A kötelező ellenőrzés nem alku tárgya (2026-11-16)

Forrás: a #479 helyreállítása.

- **Tünet:** a javító alügynök azt javasolta, hogy a kötelező Playwright E2E-t ne várjuk meg („csak tesztfájl változott”).
  A főág védelme (`gh api repos/kosazoltan/WEBSULI/branches/main/protection`) szerint a kötelező ellenőrzések: Háromfázisú rend,
  Lint & Typecheck, Unit Tests, Playwright E2E. Megvártuk (~1 óra).
- **Szabály:** „csak tesztfájl változott” nem ok a kötelező E2E kihagyására; megkerülni tulajdonosi engedély nélkül nem szabad.
  Piros main helyreállítása így legalább ~1 óra — a megelőzés (C-61) olcsóbb.

## C-64 — `count()` után automatikusan várakozó `innerText()` egy poll-ban versenyhelyzet (2026-11-16)

Forrás: #477 (szóbank-napló e2e).

- **Tünet:** ha az elem a `count()` és az `innerText()` / `textContent()` hívás között eltűnik, a lokátor a KÖVETKEZŐ megjelenésre vár,
  és a poll lefagy vagy időtúllép.
- **Szabály:** poll-függvényben az állapotot egyetlen `page.evaluate` olvassa (lehet `null`), ne több automatikusan váró lokátorhívás.

## C-65 — „≥ X ms-ig látszik” mérése a lapon belül, képkockánként (2026-11-16)

Forrás: #480, #477.

- **Tünet:** a Playwright-oldali `waitForTimeout` + állítás nem méri a kijelzés időtartamát; állapotváltáskor elmozduló gombra koppintás
  ingadozik; a képkocka-órás időzítő az aktuális képkockától indítva rövidebb a névlegesnél. A szoftveres WebGL önmagában nem hozta elő a
  lassú CI-hibát.
- **Szabály:** időtartam-állítást a lapon belül, képkockánként mérj; ne koppints elmozduló gombra; a képkocka-órás időzítőt a KÖVETKEZŐ
  képkockától indítsd; a lassú CI-hibát CPU-lassítással (4–6×) reprodukáld.

## C-66 — Játékszintű megállítás közös úton; a szünet nem állítja le a 3D-rajzolást (2026-11-16)

Forrás: #477 (közös `GAME_HALT_EVENT` / `requestGameFrame`).

- **Tünet:** a lejárt kuponnál a játékokat laponként foltozva állítottuk meg; a szünet önmagában nem állítja le a 3D-rajzolást.
- **Szabály:** a fedőréteg (lejárat, eredmény) közös úton állítsa meg a játékot, ne laponként. A leállást WebGL-hívásszámlálóval mérd,
  ne a teljes `requestAnimationFrame`-számmal (a díszítő animációk azt is növelik).

## C-67 — Egy állapotnak egy igazságforrása: kétoldalú kérés / elfogadás (2026-11-16)

Forrás: #476 (visszavágó). Rokon: C-59.

- **Tünet:** a kérő saját jelzése elfogadásnak számított; lejáratkor egy kapcsolódó jelző megmaradt.
- **Szabály:** kétoldalú folyamatnál az állapot a szerveren legyen; a kérő saját jelzése nem elfogadás; lejáratkor minden kapcsolódó
  jelző törlődjön (teszt: lejárat utáni állapot minden mezőre).

## C-68 — Token-forgatás nyugta nélkül kizárja a jogos klienst; javításra állapottér-próba kell (2026-11-16)

Forrás: #476, független biztonsági kör.

- **Tünet:** ha az új token kézbesítése (üzenet) elvész, a forgatás kizárja a jogos klienst. A leletre adott első javítás két ÚJ hibát
  hozott be, amelyeket csak a visszaellenőrző kör futtatott próbája fogott meg; három review-kör kellett.
- **Szabály:** token-forgatás nyugta nélkül nem biztonságos; a régi token türelmi ideje kemény felső korláttal. Állapotgépes /
  token-protokoll javításnál push előtt véletlen sorrendű állapottér-próba kell (melyik tokent mutatja be a kliens × megjött-e az
  üzenet × megjött-e a nyugta), nem csak a jelentett forgatókönyv tesztje.

## C-69 — „Mindent beolvas kérésenként” végpont; szerver-teljesítmény mérése a célgépen (2026-11-17)

Forrás: #478 (kérdésbank), kanban #71, #72.

- **Tünet:** a listázó végpont kérésenként a teljes leckék JSON-ját olvasta be, verziószűkítés és gyorsítótár nélkül (memóriahiba). A
  javítás átfedő-építés hibáját a független review találta meg. Éles mérés (2026-11-17 01:21Z, Render-napló): hideg építés 12 677 ms a
  0,5 CPU-s példányon (a terv ≤ 2 s célja NEM teljesül; fejlesztői gépen 2,0–3,5 s), meleg 9–56 ms szerveroldalon, a válasz 2,86 MB gzip
  játékonként; memóriahiba-naplósor a telepítés óta 0.
- **Szabály:** listázó végpont ne válassza ki a teljes tartalmat verziószűkítés és gyorsítótár nélkül. Védőháló: DB-integrációs teszt
  lekérdezés-számlálóval + mérés `--max-old-space-size=200` mellett; gyorsítótárnál egyszerre legfeljebb egy építés. Teljesítmény-
  elfogadási pontot a célgép erőforrásaival (CPU-korlátozott konténer) mérj, különben becslés.

## C-70 — Mutációs ellenpróbát ne `git checkout <fájl>`-lal állíts vissza commitolatlan munkán (2026-11-16)

- **Tünet:** egy alügynök a mutációs ellenpróbát `git checkout <fájl>`-lal állította vissza; a nem commitolt javítás elveszett (egy
  véletlen mentés hozta vissza).
- **Szabály:** ellenpróba előtt commit vagy másolat; visszaállítás után `cmp` az eredetivel.

## C-71 — Kulcsfüggő zár / kulcsolt ujjlenyomat: titok nélküli kulcs, az adat az igazságforrás (2026-11-16)

Forrás: #475 (K1b). Rokon: C-59.

- **Tünet:** két eltérő titkú példány két külön zárat kap ugyanarra az erőforrásra, így a zár nem véd.
- **Szabály:** a zár kulcsa titok nélküli legyen, az élő állapot forrása pedig az adat maga (nem a titokból képzett kulcs).

## C-72 — Apróságok: időbélyeg-kerekítés, `Failed query`, `npx.cmd` Git Bashben, e2e-port-verseny (2026-11-16)

- Postgres időbélyeg JS `Date`-en át milliszekundumra kerekedik: pontos összevetés SQL-ben.
- A drizzle a hibát `Failed query: …`-be csomagolja; az eredeti a `cause`-ban van.
- Git Bashben az `npx.cmd` szóközös felhasználói útvonalon elhasalhat: Playwrightot PowerShellből futtasd.
- e2e-ben a „szabad port keresése, lezárás, újranyitás” versenyhelyzet (`EADDRINUSE`): a szerver válasszon portot.

## C-73 — Mutációs teszt megosztott fixtúra-objektumon: a mutáció a mércét is elrontja (2026-11-18)

Forrás: SK1 (forrás-fedettségi kapu), `tests/fixtures/source-coverage-hm.ts`.

- **Tünet:** a „döntési fa egy levéllel kevesebb” mutációt a kapu nem fogta meg. A fixtúra fája modulszinten EGYSZER jött létre,
  a lecke blokkja és a forrásleltár ugyanarra az objektumra mutatott — a blokk elrontása a forrást is elrontotta, a kettő így
  egyezett.
- **Szabály:** a fixtúra-gyár hívásonként friss példányt adjon (`structuredClone`), és a belőle képzett blokk se osszon
  hivatkozást a mércével. Ha egy mutációt a kapu „nem fog meg”, előbb azt ellenőrizd, hogy a mutáció nem szivárgott-e át a mércébe.
- Rokon apróság: a Bash eszköz heredocja aposztrófot / hármas idézőjelet tartalmazó tartalomnál elhasalhat — a tartalmat fájlba
  írd (Write), és azt futtasd vagy fűzd hozzá.

## C-74 — Unicode-escape a forrásban: az ügynök fájlíró eszköze literál karakterré alakíthatja (2026-11-18)

Forrás: SK1b (`shared/source-visual-render.ts`, a szöveg-normalizáló reguláris kifejezései).

- **Tünet:** a `\uXXXX` alakban megírt karakterosztály (nem törő szóköz, tipográfiai idézőjel, kétirányú vezérlő) a fájlba
  LITERÁL karakterként került: a kód működött, de a forrásban láthatatlan / összetéveszthető karakterek álltak, amelyeket sem a
  review, sem a diff nem mutat meg.
- **Szabály:** láthatatlan vagy tipográfiai karaktert a forrásban mindig escape-pel írj, és írás után ellenőrizd a fájl nyers
  tartalmát (`python -c "print(ascii(open(f, encoding='utf-8').read()))"` az érintett sorokra). Tesztben a karaktert kódpontból
  állítsd elő (`String.fromCharCode(0x2028)`), ne literálként.

## C-75 — A push-kapu `native-arch` bukása önmagában kivétel; állapotra várj, ne időre (2026-11-18)
- **Tünet:** a `gate:push` piros, a jelentésben a `native-arch.test.ts` (a `better-sqlite3` nincs lefordítva) és még egy teszt.
  Tévesen gépi akadálynak (Visual Studio Build Tools) jelentettem.
- **Tény:** a `pre-push-gate.mjs` (D10 / C-38) a `native-arch.test.ts`-t ismert helyi kivételként kezeli, ha CSAK az bukik és a
  `doctor:arch` is bukik. A piros oka a másik bukó teszt volt (`grade-quiz-bank-lazy`: kliensmodul olvasta a teljes évfolyam-bankot).
- **Teendő:** a push-kapu FAIL-sorában a native-arch MELLETTI fájlokat javítsd; Build Tools / `npm ci` nem kell.
- **Rokon:** a közös mérők (joystick, mobil mérő) kérdés-elhárítása a megoldás-kijelzés alatt lecserélődő gombra kattintott
  (#500 ingadozó) — a hatókör a nyitott, élesített kérdés (`[data-state="open"][data-armed="true"]`), így a segéd állapotra vár.

## C-76 — Takarás-döntés pontból: a rács hézagában „szabad”, közben takarva (2026-11-18)
- **Tünet:** Szökőár, 360×640: a kérdés-sáv a figurára ült, az elrendezés mégis „nyugalomban” volt; ha a kérdés ~0,8 mp-cel később
  nyílt, minden jó. Az előző kör órákig az időzítést, a React-felülírást és a 3D-vetítést gyanította — egyik sem volt.
- **Tény (a döntés bemeneteinek naplójából):** a menet elején a figura x = 50 % (180 px), a kétoszlopos válaszrács oszlopai
  8–176 és 184–352 px: a döntés a figurát EGY PONTNAK vette, a pont a 8 px-es hézagba esett → „nem takar”. A teszt
  `elementsFromPoint`-ja a rács-tárolót is látja → takarva. 0,8 mp múlva a sodrás kivitte a pontot a hézagból.
- **Második ok ugyanott:** a közös `.game-hud > * { pointer-events: auto }` a jelzősor ÜRES, tördelt második sorát láthatatlan
  kattintható réteggé tette a menedék-ház fölött (a Tailwind `pointer-events-none` osztály a rétegezetlen szabályt nem írja felül).
- **Teendő:** takarást testre (téglalapra) számolj, a mérce felületével egyezően; a jelölt elrendezéseket egy lépésben, a
  kirajzolás előtt mérd végig (ne render → mérés → render láncban); mozgó figuránál a nyitott kérdés alatt kövesd. Elakadásnál
  az első lépés a döntés bemeneteinek naplója a teszt pontos lépéseivel, nem újabb időzítés-hangolás.

## C-77 — A „lagg” oka egy lusta hangkontextus volt, nem a grafika (2026-11-18)
- **Tünet:** a Szökőárban menet közben 200–950 ms-os megakadások; a tulajdonos fő panasza a lagg. Korábban a grafikát / a
  kérdésbankot gyanítottuk.
- **Tény (profil: `long-animation-frame` + CDP-mintavételezés, 1× CPU):** egyetlen 2038 ms-os képkocka közvetlenül az első kérdés
  megjelenése előtt, 1823 ms a közös `audioEngine` `getOrCreateAudioContext`-jében. Lánc: kérdés-director `onShow` → `sfxWhoosh`
  → `beep` → első `new AudioContext()`. A konstruktor közvetlenül mérve friss böngészőben 380–2018 ms (a hangeszköz megnyitása).
- **Javítás:** `prewarmAudio()` a közös hangmotorban (hozzáadó), a játék a menü alatt, tétlen időben hívja. Minden, a közös
  directort használó játékot érint — a többi játékban is be kell kötni (kanban).
- **Második tanulság:** ha a hosszú képkocka alatt a főszál TÉTLEN, a késés a GPU-folyamatban van (shader-összefűzés, raszter);
  a főszál-profil ilyenkor semmit nem mutat — Chrome-nyomkövetés kell (`Program::MainLinkLoadEvent::wait`, `WebGL`), és
  ellenpróba egy üres WebGL-oldallal ugyanabban a környezetben (terhelt gépen az is megakad).
