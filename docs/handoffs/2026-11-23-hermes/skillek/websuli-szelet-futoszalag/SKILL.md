---
name: websuli-szelet-futoszalag
description: WEBSULI hosszú, többszeletes futás vezénylése — a főterv sorrendje, a szeletenkénti lépéssor (átvétel → hibaosztály-söprés → kapuk → vak kör → PR → botok → CI → merge → takarítás), a kapusor-zár, a hibajegyzék és a memória vezetése. Töltsd be minden WEBSULI-munkamenet elején, amikor több szelet / PR vár sorban, félkész ágakat kell befejezni, vagy a tulajdonos „folytasd / fejezd be / maratoni futás” jellegű kérést ad.
---

# WEBSULI szelet-futószalag

A repó kapui (`AGENTS.md`, `docs/minosegkapuk.md`) kötelezők és megkerülhetetlenek; ez a skill a SORRENDET és a vezénylést adja, nem
helyettesíti őket. Minden kommunikáció magyarul; kérdés a tulajdonosnak csak űrlapon.

## 1. Munkamenet eleje (5 perc)

1. Olvasd el: a projektmemória `foterv-2026-11-23.md`, `foszal-allapot.md` (az utolsó két bejegyzés) és a kanban
   `hosszu-futas-hibajegyzek.md` „Nyitott” oszlopa.
2. Tény-állapot: `git -C D:/repo/WEBSULI fetch --prune`, `gh pr list --state open`, `git worktree list`; a fő checkout legyen friss
   (`git pull --ff-only`) — a hookok onnan futnak.
3. A főterv (`docs/specs/2026-11-23-foterv.md` + `-vegrehajtas.md`) sorrendje az irányadó: a határidős hullám elöl.

## 2. Egy szelet lépéssora

1. **Munkafa** a főágból (`.claude/worktrees/<név>`), `npm.cmd ci` a `source/` alatt. Halmozott láncnál az előző szelet ágából.
2. **Átvétel** régi ágról: `cherry-pick` / `merge origin/main`. Ütköző fájlnál előbb `git diff <régi alap> origin/main -- <fájl>`:
   ha üres, a mienk marad. A terv-dokumentum szakasza a fájl megfelelő helyére kerül (nem a végére).
3. **Hibaosztály-söprés** teszttel — ezek ismétlődtek a 2026-11-22/23-i körökben:
   - futás közbeni környezet-olvasás → a futásra rögzített állapot (folytatásnál a mentett job-állapot);
   - amit a program kioszt (forma, blokksor, fajta, hang), megjelenik-e a modellnek küldött KÉRÉSBEN és a mentett állapotban —
     friss futásnál, a szerző ELŐTT megszakított folytatásnál és jóváhagyott tervnél is;
   - minden író hely (motor ÉS tároló) — `grep` az író függvény összes hívójára;
   - a szabály a VÉGLEGES kimeneten mérve, minden utólagos átalakítás (záró recap, try-beszúrás) után;
   - jelzés / küszöb a nyers darabszámból, nem kerekített értékből;
   - a teszt valódi viselkedést mér-e: mutációs próba (a javítás kivételével bukik-e).
4. **Kapusor** — egyszerre EGY helyi kapu fut. Minden sor-szkript így kezdődik:
   `source ~/.claude/scripts/websuli-kapusor.sh; kapusor_be "<szelet>"`. Sorrend: `gate:stage` → `gate:push` → vak kör → `record-review`
   → `gate:pr -- --body-file` → push → PR.
5. **Vak kör** csak akkor indul, ha (a) a közös fájlt (terv-dokumentum, `docs/agent-csapdak.md`) érintő előző PR már beolvadt, és
   (b) nyitott PR-nál a botok leletei beérkeztek és javítva vannak. Követő körnél `--previous`. Megállás: 3 egymást követő NEM, vagy
   2 NEM nem csökkenő blokkolószámmal → nincs új kör: követelmény egy mondatban, hibaosztály-leltár, kisebb szelet, végül űrlap.
6. **Botok**: minden lelet egy pushban; szálanként válasz (`_🤖 Addressed by [Claude Code](https://claude.com/claude-code)_` zárósorral)
   és lezárás. Új ellenőrzést kérő lelet külön jegy — kivéve, ha valódi hibát tár fel (akkor az a szelet része).
7. **Merge**: zöld CI → `gate:merge -- <PR>` → `gh pr merge --squash --match-head-commit <teljes sha>` → fő checkout
   `pull --ff-only` → a munkafa és a helyi ág eltávolítása → a főterv állapotnaplója → hibajegyzék.

## 3. Eszköz-csapdák (mind megtörtént)

- A push / PR / merge parancs **önállóan** fusson, csővezeték, `;`, `cd`, `-C`, átirányítás nélkül; a hook a parancs SZÖVEGÉBEN
  szereplő kulcsszóra is illeszt (jegyzetbe se írd bele szó szerint a PR-nyitó parancsot).
- Visszaperjelet / regexet tartalmazó kódot csak fájlba írt szkript módosít (`chr(92)`); heredocban a dupla visszaperjel egyre esik.
- A PR-leírás kötelező szakaszai: `# Összefoglaló`, `## Elfogadás` (`- [x]`), `## Futtatott ellenőrzések`, `Nem futtatott + ok:`,
  `Független ellenőr ítélete: … (fej: <12 hex>)`, az agentic-qa-kit ellenőrzőlista, lábléc.
- Megszakított háttérsor után a `timeout … npm run gate:*` folyamatfa árván marad: `Get-CimInstance Win32_Process` szűrés a saját
  szkriptnévre, leállítás pontos PID-del (`taskkill /PID <pid> /T /F`), mintaillesztéssel soha.
- Háttérsor indítása előtt nézd meg, fut-e másik (a kapusor-zár ezt kikényszeríti); futó kapu alatt azt a munkafát ne szerkeszd.
- Fizetős modellfutás, env-kapcsoló élesítése, éles adat törlése: mindig a tulajdonos döntése, űrlapon.

## 4. Nyilvántartás (minden beolvasztás után, ne a futás végén)

- `…/kanban/hosszu-futas-hibajegyzek.md`: az új hiba a „Nyitott” oszlopba, a javított a „Javítva” alá (mivel, hol).
- `…/memory/foszal-allapot.md`: egy rövid bekezdés (dátum, szelet, PR, commit, vak körök, tanulság).
- A főterv végrehajtási fájljának állapotnaplója.
- Hullám végén a `futas-vegi-zaras` skill teljes hurka és a gépi ellenőrző.

## 5. Prompt-gyorsítótár (kötelező, tulajdonos 2026-11-23)

- Minden vak kör után: `grep "gyorsítótár-találat" <jelentés>.log` — a 2. hívástól mért arány legyen ≥ 80% (mért átlag 93,3%); alatta
  megállás és okkeresés, a lelet a hibajegyzékbe.
- Fölösleges kör = a legdrágább pazarlás: tartsd a 2.5 feltételeit, használd a `--previous` kapcsolót.
- Alügynök: a futót folytasd (`SendMessage`), ne indíts újat ugyanarra a témára; a megbízás eleje legyen stabil.
- Promptot érintő termék-szeletnél a közös előtag bájtra változatlan marad; a kapcsoló mögötti szöveg a kérés végére kerül. A PR
  leírásában szerepeljen, hogy a gyorsítótárazott előtag változott-e.
- A push-kapu háromfázisú ellenőre megköveteli, hogy a kódot érintő PR tartalmazzon `docs/specs/*-vegrehajtas.md` változást — meglévő terv szeletének megvalósításakor is (megvalósítási jegyzet a végrehajtási fájlba, az első kapu ELŐTT).
- **Merge-sorrend (C-61, kétszer megtörtént):** ha nyitva van olyan PR, amely repó-szintű őrt / kaput / CI-t érint (`scripts/qa/**`, `.github/workflows/**`, kapu-konfiguráció), az olvad be ELSŐKÉNT — addig semmi más nem megy a főágba, különben a merge-kapuja megbukik, és új kör kell.
- A commit-sorrend: a `-vegrehajtas.md` változása korábbi commitban legyen, mint a kód (a háromfázisú ellenőr a sorrendet is nézi).
- **`--owner-override` (vak futtató) CSAK a tulajdonos űrlapon adott, szó szerint idézett döntésével** — soha nem megelőzésből vagy feltételezett engedélyre. A kapu / őr megkerülése tilos (2026-11-23-án egyszer megtörtént, a rendszer megtagadta).
