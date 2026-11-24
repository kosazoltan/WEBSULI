---
name: websuli-kovetelmeny-revizio
description: Use when closing a WEBSULI work batch. Run full revision.
---

# WEBSULI záró működési revízió — elvárt ↔ valós összevetés

Cél: minden tulajdonosi elvárás (kérés, döntés, feladat) egy helyen; a munka végén a valós működést (main-kód, élő kapcsolók,
beolvadt PR-ok, tesztek) összevetjük vele, és az eltérést leletként visszaírjuk. Ebből lesz a szeletenkénti javítási terv.
Adatbázis: `%LOCALAPPDATA%\hermes\projekt-tudas\websuli\kovetelmenyek.db` (repón kívül). Eszközök: `scripts/kovetelmeny/`
(`gyujt.py`, `revizio.py`, `kovetelmenyek.json`, `README.md` — séma és források).

## Mikor

- Minden nagy feladatsor végén, a záró hurok higiéniája ELŐTT (záró revízió).
- Ha a tulajdonos „teljes működési revíziót” / „mi maradt ki, mi veszett el” kérdést tesz fel.
- Kis (≤30 soros) javítás után nem kell; ott elég az érintett tétel `tetel <code>` ellenőrzése.

## Lépések

1. **Új kérések felvétele**: a mostani munkamenet tulajdonosi kéréseit vedd fel a `kovetelmenyek.json`-ba (egy tétel = egy tesztelhető
   elvárás; név, e-mail, titok nélkül). Újabb utasítás a régit felülírja: a régi tétel `superseded_by` = az új kód.
2. **Gyűjtés**: `python scripts/kovetelmeny/gyujt.py --fetch -q` (idempotens, ~30 s). A `meta` „nem elérhető” listáját jelentsd.
3. **Lekérdezés**: `python scripts/kovetelmeny/revizio.py allapot`, majd
   `revizio.py lista --nyitott --limit 80` és `revizio.py felulirasok`.
4. **Automatikus összevetés**: `revizio.py ellenoriz` → kapcsoló (Render env vs. elvárt), félkész (nyitott PR, `reszben`), elfelejtett
   (régóta `elvart`, nincs commit/PR-nyom), kódjelenlét (`grep` a main-en), felülírt-de-nem-átvezetett.
5. **Kézi igazolás** minden nem `kesz` vagy `ismeretlen` tételnél, amit a mostani munka érintett vagy a lista elején áll:
   - kód: `git grep -n <minta> origin/main -- source/…` vagy a célzott teszt futtatása;
   - kapcsoló: `flags` tábla / Render env (csak on/off/hiányzik — értéket soha ne írj ki);
   - PR: `gh pr view <n> --json state,mergedAt,headRefOid`; élő viselkedés, ahol mérhető (csak olvasva).
   Igazolt állapot: `revizio.py allit <code> <status> --evidence "<commit/PR/fájl:sor/mérés>"`.
   Hiány: `revizio.py lelet-add --code <c> --kind hianyzo|felkesz|elfelejtett|kapcsolo_ki|regressziot|felulirt_de_nem_atvezetve
   --detail … --evidence … --severity magas|kozepes|alacsony --slice "<javasolt szelet>"`.
6. **Felülírások**: mindig a lánc legújabb eleme számít. Ha a régi megoldás még él, és az új nincs átvezetve → lelet
   (`felulirt_de_nem_atvezetve`). A régi, felülírt utasítást visszaállítani TILOS.
7. **Cél és terv**: `revizio.py lelet-lista` (súlyosság szerint) → cél + szeletlista a repó rendjében: spec → végrehajtási utasítás →
   bukó teszt → kód → kapulánc → PR (`.hermes/skills/websuli-szeletmenet/SKILL.md`). Minden szelet SQL-feladat is
   (`feladat.mjs add --source "kovetelmeny:<code>"`); tulajdonosi döntést igénylő tételek (élesítés, fizetős futás) egy űrlapba.
8. **Jelentés**: státuszeloszlás, nyitott leletek típusonként, a 10–15 legfontosabb nem kész tétel bizonyítékkal, felülírási láncok,
   nem elérhető források.

## Tilos

- Titok vagy valódi e-mail-cím kiírása (chat, commit, `kovetelmenyek.json`); a DB-be is csak maszkolva.
- Éles beállítás (Render env, Neon, Vercel) módosítása tulajdonosi döntés nélkül — a `kapcsolo_ki` lelet döntési javaslat, nem utasítás.
- A felülírt, régi utasítás visszaállítása; „kész” állítás bizonyíték (commit, PR, fájl:sor, mérés) nélkül.
- A teljes forrás-dump betöltése a kontextusba: mindig szűrt lekérdezés (`--limit`, `tetel`, `kereses`).

Részletes SQL-lekérdezések és a leletfajták szabályai: `references/lekerdezesek.md`.
