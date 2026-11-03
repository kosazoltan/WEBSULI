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

- **Tünet:** `git commit` → „Author identity unknown … unable to auto-detect email address (got 'kosaz@Zenbook.(none)')”.
- **Gyökérok:** a gépen nincs `user.name` / `user.email` beállítva (gépenként eltér, mint az architektúra).
- **Megelőzés:** tartós config-módosítás helyett parancsonként:
  `git -c user.name="Kz" -c user.email="236001384+kosazoltan@users.noreply.github.com" commit …`
  (a korábbi commitok szerzője); a tartós beállítás a tulajdonos döntése.
