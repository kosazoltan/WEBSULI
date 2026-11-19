# A kapu-hook hibája / időtúllépése = tiltás (`onFailure: "block"`) + az audit-hook fail-closed időtúllépése

- Dátum: 2026-11-18
- Kanban: #100 (a hook hibája = tiltás), #126 (A7: `check-audit-ok`)
- Tulajdonosi döntés (2026-11-18): **IGEN, tiltson** — a kapu-hook saját hibája / időtúllépése is tiltás legyen.
- Előzmény: `docs/specs/2026-11-17-kulso-ellenor.md` 11.1 (2) pont; a korábbi, jóváhagyásra váró commit (`f1395360`, ág
  `chore/hook-onfailure-block`) tartalma ide kerül, a friss mainre építve.

## Cél

1. A `.claude/settings.json` kapu-hook bejegyzésein (Bash és PowerShell) `"onFailure": "block"`: ha maga a hook-folyamat nem indul,
   összeomlik, túllépi a 60 s-os külső korlátot vagy érvénytelen kimenetet ad, a Claude Code a parancsot TILTJA (a hivatalos
   hooks-dokumentáció szerint v2.1.295-től; a gépen futó Claude Code 2.1.325).
2. A kapu-hook saját „nem válaszolt” tiltása (időtúllépés, indítási hiba) megmondja a teendőt: néhány másodperc múlva ugyanaz az
   egyszerű parancs újra; ha tartós, a runbook szakaszára mutat.
3. A7: a `check-audit-ok` hook a git időtúllépésekor / indítási hibájakor és belső hibájakor a push-parancsra **tilt** (eddig
   átengedett); a gyors, nem nulla kilépés (nem git-repó) továbbra sem az ő dolga. Ezzel a `settings-hooks.test.mjs` terhelt gépen sem
   ingadozik (a várt döntés tiltás).
4. Runbook: elromlott hook-szkriptnél az ügynök KIZÁRÓLAG a hookot javíthatja (Edit / Write eszközzel, azon nincs `onFailure`,
   teszttel); a védelmet nem távolíthatja el, nem gyengítheti és kerülőútként sem javasolhatja. Ha a javításhoz nincs
   futtatókörnyezet, vagy az csak a tiltott úton menne: megáll, és a tulajdonostól kér segítséget. A védelem ideiglenes
   kikapcsolása (kézzel, a tulajdonos gépén) kizárólag a tulajdonos saját kezű lépése (Codex P1, #506).

## Nem cél

- A többi hook (`check-destructive`, `enforce-repo-rules`, `warn-test-edit`) `onFailure`-e — minden parancsra futnak, a hibájuk
  minden munkát megállítana; külön döntés.
- A tokenizáló (#499) — külön PR.

## Érintett fájlok

`.claude/settings.json`, `scripts/qa/hooks/check-quality-gates.mjs` (üzenet), `scripts/qa/hooks/check-audit-ok.mjs`,
`scripts/qa/hooks/hook-failure.test.mjs` (új), `docs/minosegkapuk.md`, ez a terv és a végrehajtási fájl.

## Edge case-ek

- A `check-audit-ok` a `.agentic-qa-kit` kezelt fájlja: egy kitfrissítés felülírhatja — a teszt ezt jelezné (fail-closed elvárás).
- Nem push parancs → az audit-hook semmit nem vizsgál (változatlan).
- Nem git-repó (gyors, nem nulla kilépés) → enged (változatlan).
- Elromlott kapu-hook szkript (`onFailure: block`) → minden Bash / PowerShell parancs tiltott; az Edit / Write eszközön nincs
  `onFailure`, azzal a HOOK javítható (a védelem eltávolítása nem út — lásd 4. pont).

## Elfogadás (EARS)

<!-- acceptance-checklist -->
- [x] F1 WHEN a kapu-hook bejegyzését (Bash, PowerShell) a settings-ben vizsgáljuk THEN mindkettőn SHALL `"onFailure": "block"` lenni
  (a többi hook-bejegyzésen nem).
- [x] F2 WHEN a kapu-hook nem kap választ a git-től a keretén belül THEN the hook folyamata SHALL tiltani, és az üzenet SHALL
  megmondani a teendőt (újrapróbálás; tartós hibánál a runbook szakasza).
- [x] F3 WHEN a `check-audit-ok` push-parancsnál a git-et nem tudja elindítani / időtúllép THEN SHALL tiltani, teendővel.
- [x] F4 WHEN a `check-audit-ok` nem push parancsot kap, vagy nem git-repóban fut THEN SHALL engedni (változatlan).
- [x] F5 WHEN a runbookot olvassuk THEN SHALL kimondani: elromlott kapu-hooknál az ügynök csak a hookot javíthatja; a védelem
  eltávolítását nem végezheti és nem javasolhatja; ha nem tudja javítani, megáll és a tulajdonostól kér segítséget; a kikapcsolás
  kizárólag a tulajdonos lépése. A runbook szakasza nem tartalmazhat ügynöknek szóló eltávolítási utasítást (szöveg-őr teszt).
- [x] F6 (visszaellenőrzés, 2026-11-18) WHEN a hook-bemenet nem értelmezhető JSON, de a nyers szövegben kapu-köteles művelet van THEN
  mindkét hook SHALL tiltani (enélkül, és üres bemenetnél enged).
- [x] F7 WHEN az audit-hook git-hívása fut THEN a korlátja SHALL 10 s lenni (csak `node --test` alatt felülírható, felülről
  korlátozva); a belső hiba ága, a valódi időtúllépés és a kapu-hook keret-üzenetének teendője teszttel fedett.

## Kiegészítés — a vak hibakereső ellenőr leletei (2026-11-18, fej `5786e83b`)

A push ELŐTT javítandók (mindegyik előbb bukó teszttel):

- **L1 (közepes, a PR hozta):** a kapu-köteles művelet felismerése (`detectGated`) két egymás utáni `[\s\S]*`-t tartalmazó mintával
  nagy, „gh … pr …” említésekkel teli szövegen szuperlineáris (20 KB → 24 s, 30 KB → 65 s+); az `onFailure: "block"` miatt ez hamis
  tiltás ártalmatlan parancsra. **Döntés:** egyszeri, visszalépés nélküli szkennelés — a parancs önálló szavait (`[\w./:-]` futamok)
  egyszer bejárva sorrend-állapotgép (`git` → `push`; `gh` → `pr` → `create|merge`), az útvonalas `git` / `gh` alaknál a minta első
  előfordulása után ugyanez; a `/pulls/<n>/merge` minta változatlan (lineáris). A régi és az új felismerő eredménye a próbatáblán és
  véletlen szövegeken azonos (ellenpróba).
- **L2 (közepes):** a „védelmet az ügynök nem távolíthatja el” szabály csak szövegben élt. **Döntés:** a repó meglévő
  mechanizmusa (`scripts/qa/repo-rules.json` + `enforce-repo-rules` hook) két opcionális mezővel bővül: `path` (a szabály csak az
  ilyen fájlútvonalú Edit / Write hívásra vonatkozik) és `removes` (tiltás, ha a minta előfordulásainak száma a régi tartalomban —
  Edit: `old_string`, Write: a lemezen lévő fájl — nagyobb, mint az újban). Szabályok: (1) `.claude/settings*.json`-ba a hookokat
  kikapcsoló beállítás írása → tilt; (2) a `.claude/settings*.json`-ból az `"onFailure": "block"` vagy a kapu-hook parancs-bejegyzés
  eltávolítása → tilt; (3) a `scripts/qa/hooks/check-quality-gates.mjs` belépési pontjának (a `main()` hívás) eltávolítása → tilt;
  (4) a hook-szkriptek `main()`-jének első utasításaként feltétel nélküli kilépés → tilt. **A hook javítása** (tartalmi szerkesztés,
  amely ezeket nem érinti) **továbbra is lehetséges.** Határ: tetszőleges szemantikai rongálást (pl. a tiltó ág „javítása”
  engedésre) szöveg-szabály nem ismer fel biztonságosan — ezt PR-szinten a CI-ben futó hook-tesztek fogják meg; a jogosultsági
  szintű védelem (`permissions.deny` az Edit / Write-ra a `.claude/settings*.json`-on) tulajdonosi javaslat, nem e PR része.
  Ismert korlát: az `enforce-repo-rules.mjs` a kit kezelt fájlja; egy kitfrissítés az új mezőket nem ismerné — a `removes`-szabályok
  mintája ezért soha nem illeszkedő kifejezés (a régi hook így nem tilt mindent), és a teszt jelzi a visszaírást.
- **L5 (kicsi, a PR hozta):** az audit-hook `null` / nem objektum bemenetre összeomlott. **Döntés:** a mezők olvasása biztonságos
  (nem objektum → üres); a külső hook-korlát 15 → 20 s, hogy a 10 s-os belső git-korlát mindig előbb járjon le érthető tiltással
  (teszt: a settings-korlát több, mint a belső korlát + 5 s); a runbook kimondja, hogy az audit-hookon nincs `onFailure` (minden Bash /
  PowerShell parancsra fut; a pusht a kapu-hook fedi).
- **L8:** teszt arra, hogy a git-korlát felülírása `NODE_TEST_CONTEXT` nélkül hatástalan.
- **L9:** az elfogadási lista és a végrehajtási fájl pipálása a tényleges állapot szerint.
- **L7:** a szöveg-őr a teljes runbookra, a kapu-skillekre (forrás + tükör), a csapdakatalógusra és a retróra kiterjed, a
  szinonimákra és a kikapcsoló mechanizmus nevére is; a runbook és ez a terv nem nevezi meg szó szerint a hookokat kikapcsoló beállítást.

Jegyre (külön szelet a #506 után): L3 (munkafán kívüli könyvtár + könyvtárváltás / `-C` → átengedés), L4 (a hook csak a Bash /
PowerShell eszközt figyeli; MCP-eszközök), L6 (szokatlan JSON-bemenetek), és a meglévő hamis tiltások (`git stash push`,
`git log --grep push`, commit-üzenet „push” szóval).

### Elfogadás (EARS) — kiegészítés

- [x] F8 WHEN egy ≥ 200 KB-os, ártalmatlan, „gh pr …” említésekkel teli parancs érkezik THEN a kapu-hook SHALL 1 s alatt ENGEDNI, és
  a kapu-köteles alakok változatlanul kapu-kötelesek / tiltottak.
- [x] F9 WHEN az Edit / Write a `.claude/settings*.json`-ba hook-kikapcsolást ír, onnan az `onFailure`-t vagy a kapu-hook bejegyzést
  eltávolítja, vagy a kapu-hook belépési pontját kiüríti THEN az `enforce-repo-rules` SHALL tiltani; a hook tartalmi javítása SHALL
  engedett maradni.
- [x] F10 WHEN az audit-hook `null` / nem objektum bemenetet kap THEN SHALL nem összeomlani; a külső korlát SHALL TÖBB lenni, mint a belső git-korlát
  + 5 s.

## Kiegészítés 2 — jogosultsági szintű tiltás a settings-fájlokra (tulajdonosi döntés, 2026-11-18)

Tulajdonosi döntés (kérdőíven): a `.claude/settings*.json` fájlokra jogosultsági szintű tiltás kerüljön — „Igen, tiltsuk meg”.

**Tények a hivatalos dokumentációból** (code.claude.com/docs/en/permissions, /settings, /permission-modes, 2026-11-19):
a szabály alakja `Tool(specifier)`; az `Edit(...)` szabály „all built-in tools that edit files” — a Write / NotebookEdit / MultiEdit
is — rá vonatkozik (`Write(...)` szabály nem illeszkedik); a `/path` a settings-forráshoz, projekt-settingsben a fő munkakönyvtárhoz
(projektgyökér) képest értendő; gitignore-mintázat. A tiltás minden módban érvényes („Deny rules block in every mode, including
bypassPermissions”); a listák a settings-szintek között összeadódnak, egy helyi / felhasználói fájl nem veheti el. Héjban az `Edit`
tiltás vonatkozik az átirányítás céljára (`>`, `>>`, `2>`), a `tee` célra és a felismert fájl-parancsokra (`cat`, `head`, `tail`,
`sed`); NEM vonatkozik a fájlt maga nyitó szkriptre (pl. `node -e`, Python) — ez a dokumentáció szerint is nyitva marad (teljes,
operációs-rendszer-szintű védelem csak a homokozóval).

**Döntés.**
1. `.claude/settings.json` `permissions.deny`: `Edit(/.claude/settings.json)`, `Edit(/.claude/settings.local.json)`. Ez az utolsó
   szerkesztés, amelyet ügynök ezen a fájlon végez; ezután a beállítás csak a tulajdonos kezével módosítható (runbook).
2. L2b: a runbook nem állítja, hogy a repó-szabály tiltja a hook gyengítését — a valódi védelem a jogosultsági tiltás (settings) és a
   CI-ben futó viselkedési hook-tesztek (hook-szkript). A repó-szabályok csak szűk, szó szerinti alakokat fognak (riasztó, nem határ).
   A hamis tiltások szűkítése: a belépési pont pontos szövegét számoló szabály megszűnik (jogos refaktort tiltott); a „kilépés a `main()`
   elején” szabály csak a kapu-hookra vonatkozik. A diff-szkennelés jele a modell által nem adható környezeti változó
   (`WEBSULI_DIFF_SCAN=1` a hook-folyamatnak), nem a bemenet mezője.
3. Jegyre: L10 (a többi hook regexe is lassú, kitöltéssel kijátszható — a következő hook-szelet első tétele az L3-mal), L11 (a teszt a
   forrásból regexszel olvassa a korlátot — export / import).

**Elfogadás (EARS).**
- [x] F11 WHEN a `.claude/settings.json`-t olvassuk THEN a `permissions.deny` SHALL tartalmazni az `Edit(/.claude/settings.json)` és
  az `Edit(/.claude/settings.local.json)` szabályt (teszt), és a runbook SHALL kimondani, hogy ezután csak a tulajdonos módosítja.
- [x] F12 WHEN az Edit / Write a belépési pontot jogosan átírja, vagy más hook-fájlban korai kilépés van THEN a repó-szabály SHALL nem
  tiltani; WHEN a bemenetben diff-szkennelés mező van, de a környezeti változó nincs THEN a `removes` szabály SHALL érvényes maradni.

## Kiegészítés 3 — a harmadik vak ellenőrzés feltételei (2026-11-19)

A harmadik vak ellenőrzés (fej `b5ab2de5`) ítélete: IGEN, FELTÉTELLEL. A feltételek és a további leletek ebben a PR-ben, mindegyik
előbb bukó teszttel.

**Tények a hivatalos dokumentációból** (code.claude.com/docs/en/hooks, „Disable or remove hooks”; /permissions, 2026-11-19):
- a projekt `.claude/settings.json`-jában a hookok kikapcsoló kulcsa `false` értékkel felülírja a felhasználói beállítás `true`
  értékét (a parancssori, egy futásra szóló beállítás ennél erősebb — azt repóból nem lehet lefedni);
- a `/path` alak a fő munkakönyvtárhoz (projektgyökér) horgonyzott, a `//path` a fájlrendszer gyökeréhez, a `~/path` a saját
  könyvtárhoz; a minta gitignore-szintaxisú (`**` tetszőleges mélység). A `//**` alak a felhasználói `~/.claude` mappát is lefedné
  — ezt nem vesszük fel (a tulajdonos saját beállítása, repó-PR-ból nem korlátozzuk).

**Döntés.**
1. L13: a projekt-settingsbe a kikapcsoló kulcs kifejezett `false` értékkel kerül; teszt `JSON.parse`-szal olvassa (a JSON-escape-pel
   írt kulcs is bukik), és a helyi settings-fájlban sem lehet `true`. A repó-szabály a kulcs `true` értékét fogja (a `false` nem
   hamis tiltás), és a `false` eltávolítását is (`removes`). A runbook a forrással együtt, a kulcs megnevezése nélkül írja le.
2. L12: a runbook pontosan kimondja a fedett kört (beépített fájlszerkesztő eszközök; a `/` a munkamenet fő munkakönyvtárához
   horgonyzott) és a nem fedettet (felhasználói settings, a repón kívüli munkafa, PowerShell-fájlírás, MCP-fájlírók, fájlt maga
   nyitó szkript). Új tiltás csak dokumentált alakkal: `Edit(/.claude/worktrees/**/.claude/settings.json)` és
   `Edit(/.claude/worktrees/**/.claude/settings.local.json)`. A `ConfigChange` hook kanbanra (a következő hook-szelet).
3. L14: a szöveg-őr szóhatára Unicode-tudatos (`(?<![\p{L}\p{N}_])…(?![\p{L}\p{N}_])`, `u` jelző); mintamondatos önteszt.
4. L15: teszt fogja, ha a lint-kapu a hook-folyamatnak nem adja át a `WEBSULI_DIFF_SCAN=1` jelet.

**Elfogadás (EARS).**
- [ ] F13 WHEN a `.claude/settings.json`-t `JSON.parse`-szal olvassuk THEN a kikapcsoló kulcs SHALL `false` lenni, és a helyi
  settings-fájlban (ha van) SHALL nem `true`; a runbook SHALL a forrást megnevezni.
- [ ] F14 WHEN a `.claude/settings.json`-t olvassuk THEN a `permissions.deny` SHALL tartalmazni a két munkafa-szabályt, és SHALL nem
  tartalmazni `//` vagy `~/` kezdetű szabályt; a runbook SHALL kimondani a fedett és a nem fedett kört.
- [ ] F15 WHEN a szöveg-őr ékezetes szóval kezdődő / végződő felszólítást vizsgál THEN SHALL felismerni (önteszt mintamondatokkal),
  és szó belsejében SHALL nem illeszkedni.
- [ ] F16 WHEN a lint-kapu diff-szkennelése a hookot hívja THEN a hook-folyamat környezetében SHALL `WEBSULI_DIFF_SCAN=1` lenni (teszt).
