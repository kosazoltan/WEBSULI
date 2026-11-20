# Terv — az audit-hook csak a valódi `git push`-ra vonatkozzon, és a valós lépést írja (2026-11-19)

Megbízás: az orkesztrátor, 2026-11-19 (a #506 összevonása után, `14c859ee`). Ág: `fix/audit-hook-kapuinditas` (a friss mainről).

## Cél

- A `scripts/qa/hooks/check-audit-ok.mjs` (agentic-qa-kit audit-hook) a push-kapu indítását (`npm run gate:push`,
  `npm.cmd run gate:push`) ne vegye `git push`-nak — friss `.audit-ok` nélkül is engedje. Ma a felismerő
  (`\bgit\b[^|;&]*\bpush\b`) a `gate:push` szövegben a `push` szót külön szónak látja (a `:` szóhatár), és ha előtte bárhol `git`
  szó áll elválasztó nélkül (pl. új sorral elválasztott parancsok, `git` a parancs korábbi részében), a kapu indítását tiltja.
- A tiltó üzenet a nem létező `npm run qa:audit` helyett a valós lépést írja: `npm run gate:push` zöld → az `.audit-ok` frissítése
  külön parancsban → `git push` külön, egyszerű parancsként (docs/minosegkapuk.md).

## Nem cél

- A kapu-hook (`check-quality-gates.mjs`) módosítása — a push / PR / merge bizonyíték-ellenőrzése ott marad.
- Git-álnevek (pl. egy `push`-ra mutató alias) vagy változóból összerakott parancsnév felismerése. Ismert korlát, és **a kapu-hook
  sem fedi**: az aliasokat ma egyik hook sem ismeri fel (javítva a #520 Sourcery-lelete alapján; a korábbi „a kapu-hook fedi” állítás
  téves volt). A felismerés a kapu-hookkal közös következő szelet tétele (kanban #192).
- Az `.audit-ok` jel írása szkriptből (külön kérdés; most a runbook szerinti kézi frissítés marad).

## Megoldás

- Lineáris, szó-futam alapú felismerés (a kapu-hook `detectGated` mintájára, önállóan — a kit-fájl ne függjön más hooktól): a
  parancsszövegben egy `git` futamot (`git`, `git.exe`, útvonallal: `…/git`, `…/git.exe`; kis-nagybetű mindegy) később egy pontosan
  `push` futam követ. A `gate:push`, `pre-push-gate`, `.git/` egyetlen futam, nem `push` / `git` szó.
- Álcázás ellen a felismerés két normalizált szövegen fut: (a) az idézőjelek (`'`, `"`), a PowerShell-escape (`` ` ``) és a
  cmd-escape (`^`) törölve, a visszaperjel `/`-re cserélve (Windows-útvonal); (b) ugyanez, de a visszaperjel törölve (Bash-escape a
  szó belsejében). Bármelyik találat → push-parancs.
- Ugyanez a felismerő a hibás / nem objektum hook-bemenet nyers szövegére (kanban #100, #126 — változatlan viselkedés).
- Konzervatív túlfelismerés megengedett (pl. `git stash push`, `git log && echo push` → push-parancsnak számít): biztonsági kapunál a
  téves tiltás olcsóbb, mint az átengedés.
- Üzenet: „A push előtti audit nem futott le az elmúlt N percben (hiányzik vagy régi a(z) `.audit-ok` jel). Teendő: `npm run gate:push`
  zöld → az `.audit-ok` frissítése külön parancsban → `git push` külön, egyszerű parancsként (docs/minosegkapuk.md).”

## Edge case-ek

- `npm run gate:push`, `npm.cmd run gate:push`, `npm run gate:push -- --base origin/main` → enged (nincs `git` + `push` futam).
- Új sorral / `;` / `&&` elválasztva `git fetch` + `npm run gate:push` → enged.
- `git push`, `git push --delete origin x`, `git push origin :x`, `git -C dir push`, `git -c k=v push` → push-parancs.
- Láncolt: `git status && git push`, `echo x; git push`, `git fetch\ngit push` → push-parancs.
- Álcázott: `"git" push`, `'git' push`, `GIT push`, `git.exe push`, `"C:\Program Files\Git\cmd\git.exe" push`, `/usr/bin/git push`,
  `g''it push`, `g\it push`, `` g`it push `` → push-parancs.
- Nem git-repó / nem push parancs / nem Bash-PowerShell eszköz → enged (változatlan).

## Elfogadás (EARS)

- [x] A1 WHEN a parancs `npm run gate:push` / `npm.cmd run gate:push` (önállóan vagy egy korábbi `git` paranccsal elválasztva) és az
  `.audit-ok` régi THEN a hook SHALL engedni.
- [x] A2 WHEN a parancs valódi `git push` (vagy `push --delete`) és az `.audit-ok` régi / hiányzik THEN a hook SHALL tiltani, az üzenet
  SHALL a `gate:push` → `.audit-ok` frissítése → `git push` lépést írni, és SHALL nem hivatkozni a `qa:audit`-ra.
- [x] A3 WHEN a `git push` láncolt vagy álcázott (a fenti edge case-ek) THEN a hook SHALL tiltani.
- [x] A4 WHEN az `.audit-ok` friss THEN a valódi `git push` SHALL engedett (változatlan).
- [x] A5 a meglévő hook-tesztek (`hook-failure.test.mjs`, F3 / F4 / F10 / #100) SHALL zöldek maradni.

## Kiegészítés — a vak ellenőr 1. köre (2026-11-19)

Ítélet (fej `5c86f260`): IGEN, FELTÉTELLEL. Ebben a PR-ben, előbb bukó teszttel:

- L2 (visszalépés): a push rokon alparancsai (`git http-push`, `git send-pack`) és önálló programjaik (`git-http-push`,
  `git-send-pack`, útvonallal is) push-parancsnak számítanak.
- L3: negatív teszt — `git` nélküli önálló „push” szó (`echo push`, jegyzet-szövegben) nem tilt (a sorrend-feltétel nélküli mutáns
  ellen).

Kanbanra (a kapu-hookkal közös következő szelet): L1 (további plumbing-alak, csővezetékből érkező „push”, ANSI-C idézés, előre
beállított alias), L4 (a commit-üzenet / idézett argumentum „push” szava miatti téves tiltás), L5 (PowerShell-specifikus alakok
tesztje).

- [x] A6 WHEN a parancs `git http-push` / `git send-pack` vagy `git-http-push` / `git-send-pack` program és az `.audit-ok` régi THEN a
  hook SHALL tiltani.
- [x] A7 WHEN a parancsban nincs `git`, csak önálló „push” szó THEN a hook SHALL engedni.

## Kiegészítés 2 — a #520 Sourcery-leletei (2026-11-19)

- S1 (alias): a terv „Nem cél” pontja tévesen állította, hogy a kapu-hook fedi az aliasokat — javítva: egyik hook sem ismeri fel;
  a felismerés a #192 jegyen (a kapu-hookkal közös szelet). Kódváltozás nincs.
- S2 (`.cmd` / `.bat`): a Windows git-indító `git.cmd` / `git.bat` (útvonallal, nagybetűvel is) git-futamnak számít — előbb bukó,
  folyamat-szintű teszttel.
- S3 (túlfelismerés: idézett szöveg, commit-üzenet, `echo push`): a tervben vállalt konzervatív túlfelismerés; szűkítés a #193 jegyen.
  Kódváltozás nincs.

- [x] A8 WHEN a parancs `git.cmd push` / `git.bat push` (útvonallal vagy nagybetűvel is) és az `.audit-ok` régi THEN a hook SHALL tiltani.
