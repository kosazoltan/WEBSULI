# WEBSULI — ügynöki szabályok részletei

Az `AGENTS.md` innen hivatkozik (kontextus-diéta, `docs/specs/2026-11-28-kontextus-dieta.md`). A szöveg a 2026-11-28-i
`AGENTS.md` szó szerinti kivonata; hatályos szabály, csak nem töltődik be minden munkamenetben. Módosításkor az `AGENTS.md`
rövid szabálysorát is igazítsd.

## Alapelvek

- Tananyaggyártás vagy -javítás előtt olvasd el a `docs/lesson-improvement.md` folyamatot. Az évfolyamot a program a forrásból állapítja meg. A javításnál forrásellenőrzés, mentés, séma/fedettség, valódi böngészős próba és alkalmazás utáni visszaolvasás szükséges.

- A felhasználó konkrét feladatából és az érintett forrásfájlokból indulj ki.
- Kód, teszt, build és célzott ellenőrzés előnyt élvez a széles audittal szemben.
- **Háromfázisú munka kötelező** (tulajdonosi utasítás 2026-09-09): először terv (`docs/specs/`), utána mesterséges intelligencia számára olvasható végrehajtási utasítás (`*-vegrehajtas.md`), majd a javítás / módosítás / bővítés. A 1–2. fázis átugrása tilos. Ha a tulajdonos már kérte a munkát, a 2. fázis után azonnal a 3. következik — ne várj második „mehet” üzenetre. Részletek: `docs/agent-haromfazisu-munka.md`.
- Titkot (API-kulcs, jelszó, token) soha ne írj chatbe, kódba vagy commitba —
  csak környezeti változó / secret-store hivatkozást használj.

## Review guidelines (AI-reviewerek: Codex, Copilot, Vercel Agent)
Tulajdonosi kérés 2026-10-18 (`docs/specs/2026-10-18-atfogo-review.md`): a review ne csak a legutóbbi push diffjét nézze.
- **Kör:** a TELJES PR és a diff által érintett programrészek (hívók, hívottak, közös adatszerkezetek).
- **Szeletes funkciónál** (a PR leírásában „S1–Sn”): a funkció terve (`docs/specs/…`) és a már összevont szeletek is — a
  folyamatot végponttól végpontig vizsgáld.
- **Kötelező szempontok:**
  - adatszerződés a lépések között (mezőnevek, formátumok, típusok);
  - biztonság és adatvédelem: token / titok / személyes adat URL-ben, naplóban, linkben; CSRF / origin; mellékhatás GET-en;
  - regresszió a meglévő folyamatokban: névtelen látogató, bejelentkezett felhasználó, régi anyag, Stúdió-lecke;
  - időzóna és dátumhatár (Europe/Budapest);
  - migráció ↔ Drizzle-séma;
  - indítás / cron / leállítás és e2e-mód.
- **Evidencia:** finding csak fájl:sor hivatkozással és konkrét hibaforgatókönyvvel.
- **Szeletes funkció zárása:** az utolsó szelet összevonása ELŐTT az egész funkció átfogó reviewja kötelező; az eredménye
  PR-kommentként kerül be.
- A kezelt `agentic-qa-kit` blokkon KÍVÜL áll (review #306), hogy egy kitfrissítés ne írja felül.
- A Sourcery nem ezt a szakaszt követi: a saját szabályai a Sourcery „Review Settings” felületén állíthatók (tulajdonosi teendő),
  ezért az átfogó review teljesítőjének nem számít.


## Háromfázisú munka (kötelező, tulajdonosi utasítás 2026-09-09)

A repo-ban rögzített sorrend: **terv → AI-olvasható végrehajtási utasítás → kód**.
A teljes szabály: `docs/agent-haromfazisu-munka.md`. A Cursor-szabály: `.cursor/rules/haromfazisu-munka.mdc`.

Ez szigorítja a fenti „Terv-először” és spec-kötelezettség blokkot: a terv mellett külön, ügynöknek szóló végrehajtási fájl is kell, mielőtt a kódolás elindul.

## Befejezési mandátum (kötelező, tulajdonosi utasítás 2026-11-01)

Spec, végrehajtási utasítás, javítás, fejlesztés vagy implementáció **félbehagyása tilos**.

- Megkezdett spec / `*-vegrehajtas.md` csak teljesen kidolgozva számít késznek; félig
  elkészített spec leadása eljárási hiba.
- Minden kiadott feladatot a teljes elkészültéig kell vinni: a javítás / módosítás /
  bővítés / implementáció nem állhat meg menet közben.
- **Minden session végén kötelező a teljességellenőrzés**: a beadott kérések tételes
  összevetése az elkészült munkával, és addig kell javítani / fejleszteni, amíg az
  összes kérés nem teljesült.
- Ami objektív blokkoló miatt nem készült el, azt NOT DONE + ok + kockázat jelöléssel
  kell jelenteni (ld. Evidence-before-completion) — de a cél a befejezés, nem a jelentés.
- **Session eleji söprés (2026-11-03):** `git status --short` + kanban `list`. Untracked spec /
  `-vegrehajtas.md` vagy `review`-ban ragadt jegy félbehagyott munka gyanúja: a saját
  végrehajtási utasítása szerint be kell fejezni.
- **Önfejlesztési hurok (tulajdonosi utasítás 2026-11-03):** minden hibából, tévedésből, rossz
  döntésből ugyanabban a körben csapda-bejegyzés lesz a [`docs/agent-csapdak.md`](docs/agent-csapdak.md)
  katalógusban, és ha kell, javul a skill / runbook / kanban-leírás / memória. Várakozás (háttérfolyamat,
  CI, alügynök) alatt ez a kitöltő munka — passzív várakozás helyett.
- **Windows fejlesztés: kizárólag x64.** A `source/` mappában gépenként `npm.cmd ci`; a `node_modules` másolása tilos. Gyanús natív hibánál `npm run doctor:arch`. A CI `native-arch` jobja x64-en ténylegesen betölti a natív kötéseket, tesztel és buildel.

A mandátum a háromfázisú rend mindhárom fázisára és a kanban-jegyekre is vonatkozik
(`docs/agent-haromfazisu-munka.md`, `docs/kanban.md`). A kezelt `agentic-qa-kit`
blokkon KÍVÜL áll, hogy egy kitfrissítés ne írja felül.

## Minőségkapuk (kötelező, tulajdonosi utasítás 2026-11-17)

> „Először is bármilyen kibocsátás előtt végig futtasd a saját lint kaput. Másrészt pedig minden fejlesztés után automatikusan egy
> független alügynök ellenőrizze az elkészült fejlesztést, hogy ne utólag derüljenek ki a hibák.” — a tulajdonos, 2026-11-17

1. **Lint kapu minden kibocsátás előtt** (commit-sorozat lezárása, push, PR, merge, telepítés): `npm run gate:lint`.
2. **Szakasz-kapu minden fejlesztési szakasz után:** `npm run gate:stage` (lint gyors mód + a változott fájlok egységtesztjei + minden
   őr-teszt). Csak zöld után lehet továbblépni; előbb a helyi hibát kell javítani.
3. **Független ellenőr = helyi GPU-ellenőr** (tulajdonosi döntés 2026-11-23, `docs/specs/2026-11-23-vak-kor-kivezetes.md`): a PR
   megnyitása ELŐTT és minden javító push után `node scripts/qa/gates/local-review.mjs` (helyi Ollama-modell, angol megbízás, felhős
   token nélkül) rögzíti az ítéletet. A felhős „vak kör” (friss alügynök minden fejre, újra-vak körök) **kivezetve**; felhős második
   vélemény csak a script által kockázatosnak jelölt fájloknál, egyszer / PR, ajánlásként. A `high` leletet a kódból ellenőrizd.
4. **A kapuk sorrendje:** `gate:stage` (szakaszonként) → `gate:push` → `local-review.mjs` →
   `gate:pr -- --body-file <leírás.md>` → push + PR → zöld CI → közvetlenül a merge előtt `gate:merge -- <PR>`. A `git push`,
   `gh pr create` és `gh pr merge` előtt a `check-quality-gates` hook a zöld bizonyítékot ellenőrzi.
5. **A kapu megkerülése tilos**, vészkijárat nincs; ha a kapu hibás, a kaput kell javítani (teszttel).
6. **API-költség elve:** előbb az olcsó helyi ellenőrzés; a független ellenőr (és a CI) csak zöld helyi kapuk után indul — ne a
   drága kör fogja meg az olcsó hibát.

Kockázatos fájloknál (migráció, auth, fizetés, e-mail, CI) második véleményként a külső (Gemini) ellenőr is futtatható
(`scripts/qa/gates/external-review.mjs`, kulcs csak `GEMINI_API_KEY`-ből); a jelentését az orkesztrátor a kódból visszaellenőrzi, a
hiánya nem bukás.

Skillek (`.agents/skills/` forrás, `.claude/skills/` tükör): `websuli-lint-ellenor`, `websuli-fejlesztesi-ellenor`,
`websuli-push-elotti-kapu`, `websuli-pr-elotti-kapu`, `websuli-merge-elotti-kapu`. Runbook: [`docs/minosegkapuk.md`](docs/minosegkapuk.md).
A kezelt `agentic-qa-kit` blokkon KÍVÜL áll, hogy egy kitfrissítés ne írja felül.

## Verifikáció

A változáshoz illő legkisebb ellenőrzési kört futtasd: célzott teszt/lint/typecheck
kódváltozásnál; teljes suite csak PR-kész állapotnál. Ha egy ellenőrzés elbukik,
javítsd az okot, vagy jelentsd a pontos blokkolót — ugyanazt a bukó parancsot
változatlan bemenettel újrafuttatni tilos.

## Git

- Feature branch → PR → zöld CI → merge; közbenső commitok lokálisak.
- Push/merge csak akkor, ha a feladat kifejezetten kéri.

## Zárás

A záró jelentés tartalmazza: módosított fájlok, futtatott ellenőrzések (pass/fail),
fennmaradó kockázatok.

## Aktív munkafázis-követés (kötelező, tulajdonosi utasítás 2026-09-05)

Alügynökök, háttérparancsok, python-szkriptek, CI-futások, deployok vagy bármely
kiadott munkafázis futása alatt PASSZÍV VÁRAKOZÁS TILOS. Az orkesztrátor
kötelessége aktívan és proaktívan ellenőrizni a folyamatokat, mert az autonóm
kész-jelzések általában NEM érkeznek meg:

- Háttérfolyamatra `process(action="wait", timeout=...)` vagy rendszeres
  `poll` — soha nem "majd szól magától".
- CI/deploy állapotra ütemezett újralekérdezés (`gh run list/watch`, curl
  próba), a leghosszabb várható futásidőhöz igazított, tokentakarékos
  időközökkel (nem másodpercenként, de nem is órákra magára hagyva).
- Alügynök (delegate/subagent) munkája alatt a transcript/részeredmény
  időszakos ellenőrzése; eltérülésnél azonnali steer.
- Elakadni, megállni, a munkát "várakozásra" hivatkozva felfüggeszteni tilos:
  amíg VAN futtatható következő lépés, azt kell csinálni, és a várakozási
  időt párhuzamos érdemi munkával kitölteni.
