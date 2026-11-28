# WEBSULI — Agent operating rules

Magyarul dolgozunk; a kód-azonosítók angolok. Csak hatályos szabály és mutató; részletek: [`docs/agent-szabalyok.md`](docs/agent-szabalyok.md).

## Alapelvek

- Tananyag gyártása / javítása előtt: `docs/lesson-improvement.md` (forrásellenőrzés, mentés, séma, böngészős próba, visszaolvasás).
- **Háromfázisú munka:** terv (`docs/specs/`) → `*-vegrehajtas.md` → kód; az 1–2. fázis nem ugorható, kért munkánál a 2. után
  azonnal a 3. jön ([`docs/agent-haromfazisu-munka.md`](docs/agent-haromfazisu-munka.md)).
- Titok soha chatbe, kódba, commitba — csak környezeti változó / secret-store hivatkozás.

<!-- agentic-qa-kit:begin v1.2 — NE szerkeszd kézzel a blokkon belül; frissítés: update-all.mjs -->
## Agentic QA szabályok (agentic-qa-kit v1.2)

### Eszkaláció — Stop and Ask
Állj meg és kérdezz (NE folytasd), ha:
1. a szükséges engedély/hozzáférés hiányzik;
2. explicit szabály tiltja a műveletet;
3. két követelmény ütközik, és nincs biztonságos default;
4. a spec kétértelmű, és a rossz értelmezés kárt okozna;
5. ugyanazt a tervet 3+ alkalommal strukturáltad át (oszcilláció);
6. egy eszköz ismételten hibázik, és emberi diagnózis kell;
7. a bemenet egyik specifikált esethez sem illik;
8. a feladat a kijelölt hatókörön kívüli fájlok módosítását igényelné.

### Nincs hallucináció
Csak verifikált állítást írj le. Fájl, sor, függvény, flag vagy konfig említése ELŐTT
verifikáld a forrásból (Read/Grep/Bash); a memória pont-in-time, minden hivatkozást újra
meg kell erősíteni a kódból. A bizonytalanságot jelöld (UNKNOWN / UNVERIFIED) — NE pótold
feltételezéssel. Zsákutcában (ismételt sikertelen próba) válts perspektívát, ne iterálj vakon.

### Terv-először, majd verifikált végrehajtás
Nem-triviális feladatnál a sorrend kötelező: (1) megértés (cél / nem-cél / érintett fájlok +
a legközelebbi vezérlőfájl beolvasása), (2) a feladat méretéhez illő terv, (3) végrehajtás,
(4) verifikáció a célhoz mérve. Kódolás CSAK a terv után indul.

### Teszt-integritás
Tesztet a bukás elkerülésére gyengíteni, törölni vagy kikommentezni TILOS — ilyenkor
az implementációt javítsd, amíg a tesztek zöldek. Jogos teszt-módosítás csak: új teszt,
kifejezetten tesztírási feladat, vagy valódi, dokumentált spec-változás.

### Stuck-state protokoll
Ha 5 iteráció eltelt érdemi haladás (commit/zöld teszt) nélkül, vagy 3× váltottál
megközelítést ugyanazon a ponton: állj meg, írd le tömören az akadályt, a kipróbált
utakat és 2-3 biztonságos opciót — NE iterálj tovább vakon.

### Spec-kötelezettség
3+ fájlt érintő vagy bizonytalan megközelítésű feladatnál ELŐBB spec a
`docs/specs/` sablon szerint (cél / nem-cél / edge case-ek / EARS-elfogadás),
emberi jóváhagyással — csak utána implementáció.

### Contract-first (pénzügyi/kritikus logika)
Pénzmozgást, egyenleget, díjat, számlát vagy visszavonhatatlan műveletet érintő új
funkciónál a kód ELŐTT írj szerződést (`docs/specs/contract-template.yaml` séma:
preconditions / postconditions / invariants / error_contracts / behavioral),
hagyasd jóvá, és a szerződésből vezesd le a teszteket.

### PR-méret és atomi munka
Irányelv: egy PR ~400 sor diff alatt; egy szelet = egy vertikálisan teljes egység.
Nagyobb munka: bontsd előre szeletekre a specben. Minden lezárt részfeladat után
atomi commit.

### Review-evidencia
Code-review findinget csak fájl:sor hivatkozással és konkrét evidenciával adj ki;
evidencia nélküli finding érvénytelen. Kritikus findingnál előbb próbáld megcáfolni
(refuter-kör), csak megerősítés után jelentsd.

### Evidence-before-completion
A „kész / javítva / zöld" állítás CSAK futtatott parancs valódi kimenetével érvényes — a
zöld teszt önmagában NEM bizonyíték. A megoldást a SPEC-hez mérd, ne a teszt szűk
bemenetéhez (gyanújel, ha a kód a teszt konkrét értékére van szabva). Sosem jelents sikert
parancseredmény nélkül; a nem-futtatott lépést jelöld: NOT RUN + ok + kockázat.

### Destruktív műveletek
A destruktív-parancs hook (check-destructive) döntéseit tartsd tiszteletben: a DENY
nem kerülhető meg parancs-átfogalmazással; ha a művelet valóban szükséges, az
embertől kérj kifejezett megerősítést.

### Kikényszerített tiltások (harness-szintű — enforce-repo-rules hook)
A repo „Mindig tilos" szabályai NEM csak ajánlások: a PreToolUse `enforce-repo-rules` hook
kikényszeríti őket (Bash/PowerShell + Edit/Write).
- **DENY (blokkolt):** `git --no-verify` (a QA-hookok megkerülése). Csak kifejezett emberi
  megerősítésre tehető meg a következő üzenetben.
- **WARN (jelez, nem blokkol):** hard-coded secret / private key / AWS-kulcs kódba; `eval()` /
  `new Function()` / unsafe deszerializáció (pickle, `yaml.load` Loader nélkül); néma
  `catch{}` / `except: pass`; teszt `skip`/`only`.
A DENY-t parancs-átfogalmazással megkerülni TILOS. Repo-specifikus bővítés: a
`scripts/qa/repo-rules.json`-ban további minták (deny/warn) definiálhatók a hook-kód
módosítása nélkül — így minden repo a saját AGENTS.md-tiltásait kódolhatja.
<!-- agentic-qa-kit:end -->

## Repó-szabályok (teljes szöveg: `docs/agent-szabalyok.md`)

- **Befejezési mandátum:** félbehagyás tilos; session végén tételes teljességellenőrzés; blokkolónál NOT DONE + ok + kockázat.
  Session elején `git status --short` + kanban `list`. Hibából azonnal csapda-sor: [`docs/agent-csapdak.md`](docs/agent-csapdak.md).
- **Minőségkapuk** ([`docs/minosegkapuk.md`](docs/minosegkapuk.md)): `npm run gate:stage` szakaszonként → `gate:push` →
  `node scripts/qa/gates/local-review.mjs` → `gate:pr -- --body-file <f>` → zöld CI → `gate:merge -- <PR>`. Megkerülés tilos,
  hibás kaput teszttel javítani; előbb az olcsó helyi ellenőrzés.
- **Windows: csak x64;** `source/`-ban gépenként `npm.cmd ci`, `node_modules` másolása tilos; gyanús natív hibánál `npm run doctor:arch`.
- **Verifikáció:** a legkisebb illő ellenőrzés; bukó parancsot változatlan bemenettel újrafuttatni tilos.
- **Git:** feature branch → PR → zöld CI → merge; push / merge csak kifejezett kérésre. **Zárás:** módosított fájlok, ellenőrzések
  pass/fail, kockázatok.
- **Aktív követés:** háttérmunka, CI, alügynök alatt passzív várakozás tilos.
- **Felejthető lépés = szkript** (`~/.claude/CLAUDE.md`); a méretkorlát őre: `source/tests/context-diet-guard.test.ts`.

## Review guidelines (AI-reviewerek: Codex, Copilot, Vercel Agent)

- Kör: a TELJES PR + érintett hívók, hívottak, közös adatszerkezetek; szeletes funkciónál („S1–Sn”) a terv és az összevont
  szeletek is, végponttól végpontig.
- Szempontok: adatszerződés; titok / személyes adat URL-ben, naplóban; CSRF / origin; mellékhatás GET-en; regresszió (névtelen,
  bejelentkezett, régi anyag, Stúdió-lecke); Europe/Budapest; migráció ↔ Drizzle; indítás / cron / leállítás, e2e-mód.
- Finding csak fájl:sor + hibaforgatókönyv; utolsó szelet előtt átfogó review PR-kommentben (`docs/specs/2026-10-18-atfogo-review.md`).

ChatGPT/Codex programozási protokoll: [`docs/agent-szabalyok-codex-protokoll.md`](docs/agent-szabalyok-codex-protokoll.md).

<!-- CODEX_SHARED_QUALITY_RULES_START v1 -->
## Kikényszerített közös Codex minőségkapu

Ez a blokk minden repo-ban kötelező minimumszabály Codex/AI-agent munkához. A
repo-specifikus szabályokat nem helyettesíti, hanem kikényszerített módon
kiegészíti. Repo-specifikus szabály csak szigoríthatja vagy pontosíthatja ezt a
blokkot; nem gyengítheti, nem kapcsolhatja ki és nem írhatja felül. Ütközésnél
mindig a szigorúbb, biztonságosabb, jobban verifikálható szabály érvényes. Ha a
repo-specifikus szöveg enyhébb mércét engedne, azt Codex-munkánál érvénytelen
kivételként kell kezelni.

Repo-specifikus szabályok betöltése kötelező. Minden munkamenetben azonosítsd
és olvasd el a legközelebbi repo-vezérlő fájlt (AGENTS.md, CLAUDE.md, CODEX.md,
GEMINI.md), valamint csomag/alrepo munka esetén a közelebbi vezérlő fájlokat is.
Csak a közös blokk alapján dolgozni tilos, ha a repo saját szabályt tartalmaz. A
telepített közös blokk a repo saját szövegét nem törölheti és nem írhatja át
kézzel; csak markerelt blokkban frissíthető.

- Magyarul kommunikálj a felhasználóval, kivéve ha a repo vagy a feladat más
  nyelvet kér a végtermékben.
- Tényből dolgozz: ne találj ki fájlt, API-t, route-ot, teszteredményt, logot,
  buildet, deployt, review-t vagy külső forrást. Ha nem ellenőrizted, írd le,
  hogy nem ellenőrzött.
- Munka előtt olvasd el a legközelebbi vezérlő fájlt (AGENTS.md, CLAUDE.md,
  CODEX.md, GEMINI.md), az adott repo/alrepo saját kiegészítő szabályait és az
  érintett forrás/teszt fájlokat. Nagy dokumentumot eleje-közepe-vége
  mintavétellel olvass, ne ess Lost in the Middle hibába.
- 3+ fájlt, architektúrát, adatmodellt, migrációt, authot, pénzügyi/üzleti
  logikát, deployt vagy agent/CI szabályt érintő munkánál előbb rövid contract:
  cél, nem-cél, érintett fájlok, edge case-ek, elfogadási feltételek.
- Minimális, célzott változtatást készíts. Ne overpolisholj, ne refaktorálj
  mellékesen, és ne keverd össze a feladatot más nyitott munkával.
- Tesztet gyengíteni, törölni, skipelni, snapshotot kozmetikázni vagy
  test-only kerülőutat betenni tilos. A bukó teszt okát javítsd, ne a mércét.
- Minden érdemi változtatás után futtasd a legszűkebb hasznos ellenőrzést:
  célzott teszt, lint, typecheck, build, smoke vagy diff-check. Kész állapotot
  csak valós parancskimenettel vagy pontosan dokumentált blockerrel állíts.
- UI/megjelenítési változásnál a renderer/unit teszt nem elég. Kötelező valós,
  teljes képernyős Browser/Playwright render ellenőrzés, amely nézi az átfedést,
  levágott szöveget, váratlan scrollbart, viewport overflow-t és a javított
  felhasználói állapotot.
- Titkot, tokent, privát kulcsot, személyes adatot vagy secret-like azonosítót
  ne írj chatbe, logba, commitba, dokumentációba vagy fájlnévbe. Használj
  placeholdert vagy secret-store/environment hivatkozást.
- Destruktív művelet, adatbázis-migráció, tömeges törlés, deploy, release,
  credential/cert kezelés vagy külső rendszer módosítása előtt legyen explicit
  kockázatkezelés és visszaállási pont; ha nincs biztonságos default, állj meg.
- Dirty worktree-ben ne revertáld és ne írd felül más munkáját. Státusz alapján
  különítsd el a saját szeletet, user/unknown munkát és generált zajt.
- Windows hoston parancsoknál preferáld az explicit futtatókat (npm.cmd,
  npx.cmd, pwsh/powershell -ExecutionPolicy Bypass), ne támaszkodj olyan
  shimre, amely szerkesztőben nyílhat meg.
- Záró válaszban sorold fel: módosított fájlok, futtatott ellenőrzések
  PASS/FAIL eredménnyel, nem futtatott ellenőrzések oka és maradó kockázat.
<!-- CODEX_SHARED_QUALITY_RULES_END v1 -->

## GPT goal contract (Hermes owner directive 2026-11-24)
<!-- hermes-gpt-cel:v1 -->
Applies to any GPT model working in this repo - orchestrator, sub-agent, or after a fallback switch:
1. Before acting, state the goal and a measurable DONE list (files, commands with expected exit codes, PR point).
2. Keep working until every DONE item is verified; do not stop with a plan or a "shall I continue?".
3. Loop plan -> act -> verify; a claim or a clean exit is not delivery.
4. Stop only for an owner decision, a forbidden bypass or safety/approval rule, or a real blocker after one tried in-scope alternative.
5. Report measured facts vs "not measured" and name every open item. No lies, no hallucination, no lost requirement, no over-polish.
