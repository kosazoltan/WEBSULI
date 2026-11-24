# Lekérdezések és leletszabályok (websuli-kovetelmeny-revizio)

`sqlite3 "%LOCALAPPDATA%\hermes\projekt-tudas\websuli\kovetelmenyek.db"` vagy Python `sqlite3` (csak a szükséges oszlopokat kérd le).

## Gyakori SQL

```sql
-- nem kész, nem felülírt tulajdonosi elvárások (kurált + P-tételek + döntések), legújabb elöl
SELECT code,status,date,title,evidence FROM requirements
 WHERE status NOT IN ('kesz','felulirt','elvetve') AND category NOT IN ('spec') ORDER BY date DESC LIMIT 60;

-- egy elvárás összes forrása (kérés, döntés, megvalósítás)
SELECT l.relation,s.kind,s.ref,s.date,s.title FROM requirement_links l JOIN sources s ON s.id=l.source_id
 JOIN requirements r ON r.id=l.requirement_id WHERE r.code='W1' ORDER BY s.date;

-- kapcsolók: kód-alap vs. élő
SELECT name,code_default,live_value,code_ref FROM flags ORDER BY name;

-- nyitott leletek súlyosság szerint
SELECT f.kind,f.severity,r.code,f.detail,f.proposed_slice FROM findings f JOIN requirements r ON r.id=f.requirement_id
 WHERE f.status='nyitott' ORDER BY CASE f.severity WHEN 'magas' THEN 0 WHEN 'kozepes' THEN 1 ELSE 2 END;

-- teljes szöveges keresés (FTS5)
SELECT r.code,r.status,r.title FROM requirements_fts JOIN requirements r ON r.id=requirements_fts.rowid
 WHERE requirements_fts MATCH 'pdf OR ábra' LIMIT 20;
SELECT s.kind,s.ref,s.date,s.title FROM sources_fts JOIN sources s ON s.id=sources_fts.rowid
 WHERE sources_fts MATCH '"képként is"' ORDER BY s.date DESC LIMIT 20;

-- a tulajdonos szó szerinti kérései egy napra
SELECT date,substr(raw_excerpt,1,400) FROM sources WHERE kind='session' AND date='2026-11-24' ORDER BY json_extract(extra,'$.ts');
```

## Leletfajták (`revizio.py ellenoriz`)

| kind | szabály | tipikus szelet |
|---|---|---|
| kapcsolo_ki | a kurált tétel `rule.flag` élő értéke ≠ elvárt, és a kód kész (`kesz`/`kapcsolo_ki`); vagy kódban kész, élesben KI kapcsoló követelmény nélkül (K-077 alatt) | élesítési döntés űrlapon → élesítő szelet |
| felkesz | `reszben`/`felkesz` státusz, nyitott PR-ok listájával | PR beolvasztása / hátralévő szelet |
| elfelejtett | `elvart` és ≥3 napja (`--napok`) nincs commit/PR-link; vagy `ismeretlen` kurált/P-tétel ≥14 napja nyom nélkül (alacsony, igazolandó) | spec → végrehajtás → RED → kód |
| regressziot | `kesz` tétel `rule.grep` mintája eltűnt a main-ről | `git log -S` → visszaállító szelet |
| felulirt_de_nem_atvezetve | felülírt tétel, amelynek az új változata nem `kesz`; vagy `rule.old_grep` régi minta még él; vagy élő env-változó, amit a kód nem olvas | az új elvárás szeletei / docs-takarítás |
| hianyzo | csak kézi (`lelet-add`): igazoltan nincs meg a kódban | új szelet |

Az automatikus leletek kulcsa `auto:<req>:<kind>`: ismételt futás frissíti, a meg nem ismétlődő `megszunt` lesz. Kézi lelet: `kezi:…`,
a gyűjtő és az `ellenoriz` nem módosítja; javítás után `UPDATE findings SET status='javitva' WHERE id=…` (bizonyítékkal az `evidence`-ben).

## Státusz-becslés korlátai

- `SPEC:*` `kesz` „becslés” = beolvadt implementációs PR hivatkozik a tervre, de nincs `Állapot:` sor → szükség esetén kézzel igazold.
- P-tételek alapja a 2026-11-23-i hiányleltár pillanatképe; azóta beolvadt, a címben hivatkozott PR → `kesz`.
- Kurált `ismeretlen` = a kérés megvan, a teljesülést automatikusan nem lehet igazolni (UI/élő viselkedés) → kézi igazolás.
