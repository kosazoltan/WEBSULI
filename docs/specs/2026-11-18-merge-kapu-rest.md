# A merge előtti kapu REST-en is fut (felhős munkamenet)

Állapot: terv, 2026-11-18. Kérés: a tulajdonos „az elmúlt 2 nap fejlesztéseiből minden legyen: lint, push, merge, deploy a main-re”
(felhős Claude Code munkamenetből). Kapcsolódik: `docs/minosegkapuk.md`, `scripts/qa/gates/pre-merge-gate.mjs`.

## Probléma (mérve)

A felhős (claude.ai/code) munkamenetben a `npm run gate:merge -- 506` az első lépésen bukik:

```
[pre-merge-gate] FAIL    adatgyűjtés (gh / hálózat) — gh repo view --json: HTTP 403: GitHub GraphQL is not available from
Claude Code sessions; use the REST API (gh api repos/{owner}/{repo}/...). For review threads ... GET /repos/{owner}/{repo}/pulls/{n}/ccr/review_threads
```

A kapu három GraphQL-hívást tesz (`gh repo view --json`, `gh pr view --json`, `gh api graphql` a review-szálakra). A felhős
munkamenet proxyja a GraphQL-t tiltja, a REST-et engedi. A kaput megkerülni tilos (AGENTS.md „Minőségkapuk” 5.), ezért felhőből
jelenleg egyetlen PR sem vonható össze szabályosan.

## Cél

- A kapu ugyanazokat az adatokat REST-ről gyűjti, lapozva és fail-closed alak- / teljesség-ellenőrzéssel; az adatgyűjtés a felhős
  munkamenetben is lefut (diagnosztika), de **felhőből összevonás szándékosan NEM lehetséges**: az ítélet kizárólag helyi, gépi
  bizonyítékból jön (V1, orkesztrátori döntés 2026-11-19), és a felhős munkamenetek nem töltenek fel, nem vonnak össze.
- A döntés (`decideMerge`) változatlan: ugyanazok a lépések, ugyanazok a mércék.

## Nem cél

- A döntési szabályok, a hook (`check-quality-gates.mjs`), a többi kapu módosítása.
- A `gh pr merge` hívása a kapuból (továbbra sem hívja).

## Megoldás

- Tároló: `gh api repos/{owner}/{repo}` → `full_name` (a `{owner}/{repo}` helyőrzőt a `gh` a helyi git-remote-ból oldja fel).
- PR: `gh api repos/R/pulls/N` + `…/pulls/N/files?per_page=100` + `…/issues/N/comments?per_page=100`, egy tiszta leképező
  (`prFromRest`) a `decideMerge` által várt alakra: `state` és `mergeable_state` nagybetűsítve (`open` → `OPEN`,
  `clean` → `CLEAN`), `draft` → `isDraft`, `head.sha` → `headRefOid`, `base.sha` → `baseRefOid`, `files[].filename` → `path`,
  `body`, `comments[].body`.
- Review-szálak: előbb a meglévő GraphQL-lekérdezés; ha az nem sikerül, a felhős REST-út
  `gh api repos/R/pulls/N/ccr/review_threads` (`resolved` → `isResolved`, leképező: `threadsFromCcr`). Ha mindkettő bukik: a
  lépés hibát dob → `FAIL` (fail-closed, mint eddig).

- Kötelező ellenőrzések: előbb a `branches/main/protection` végpont; ha az nem olvasható (felhős munkamenetben mérve:
  `HTTP 403 Resource not accessible by integration` — admin-jogot kér), ugyanez a lista a `branches/main` válasz
  `protection.required_status_checks.contexts` mezőjéből (ezt a hívást a `mainSha` miatt a kapu eddig is megtette). Üres lista →
  a meglévő szabály szerint FAIL.

## Edge case-ek

- `mergeable_state` `unknown` / `null` → `UNKNOWN` → a meglévő szabály szerint FAIL („várd meg az újraszámolást”).
- 100-nál több változott fájl vagy komment: a régi `gh pr view --json files,comments` a kommenteket lapozva hozta (a fájlokat
  `files(first: 100)`-zal). Az új út mindkettőt `gh api --paginate --slurp`-pal kéri (`flattenPages`), így a késői ítélet-komment
  sem vész el; ha a fájllista rövidebb a PR `changed_files` értékénél, kivétel → „adatgyűjtés” FAIL (a telepítés-jelzés és a
  C-61 a teljes listán dolgozik). (Független review K2, A1.)
- A CCR-útvonal válaszának hiányzó `resolved` mezője → nem lezárt szálnak számít; ha a válasz nem lista (üres törzs, burkolt
  objektum), kivétel → FAIL (fail-closed; független review K1).

## Elfogadás (EARS)

- AMIKOR a GraphQL tiltott, az adatgyűjtés AKKOR IS végigfut (lépéstábla); az ítélet-lépés helyi bizonyíték nélkül FAIL, ezért
  felhőből összevonás nem lehetséges (szándékos, V1).
- AMIKOR a REST-válasz `mergeable_state: "clean"`, `state: "open"`, `draft: false`, a „PR állapota” lépés PASS.
- AMIKOR a CCR-szálak között `resolved: false` (vagy hiányzó) van, a „lezáratlan review-szálak” lépés FAIL.
- A leképezők egységtesztje a `pre-merge-gate.test.mjs`-ben; a meglévő tesztek változatlanul zöldek.
- Élő próba felhős munkamenetből: `npm run gate:merge -- <PR>` az adatgyűjtésen túljut (lépéstábla, valódi PASS/FAIL); az
  ítélet-lépés ott FAIL (szándékos).
- AMIKOR `blindReview.exclusive` BE, a `mergeSteps` sima `record-review` rekorddal FAIL, a futtató rekordjával (`reviewer:
  blind-review`, egyező modell) PASS (W1).

## Javítókör a vak, hibakereső ellenőrzés után (2026-11-19; ítélet a `c96e4801` fejre: IGEN, FELTÉTELLEL, K1–K6)

- **K1 — CCR-szálak:** a `ccr/review_threads` hívás is `--paginate --slurp` + `flattenPages`; nem lista, üres vagy ismeretlen alakú
  válasz (bármely elemnél hiányzó / nem logikai `resolved`) → kivétel → FAIL. Az üres lista csak a V3 szerint fogadható el. REST-keresztellenőrzés: a
  `pulls/N/comments` (lapozva) `in_reply_to_id` nélküli gyökérkommentjeinek száma ≤ a CCR-szálak száma, különben FAIL (csonka).
- **K2 → V1 (második vak kör, orkesztrátori döntés 2026-11-19):** a PR-leírás és a PR-kommentek SEMMILYEN módban nem
  ítéletforrások: minden ügynök (fejlesztő, ellenőr, orkesztrátor, felhős munkamenet) a tulajdonos fiókjával ír, így a szerző-szűrés
  (`author_association`) az önigazolást nem akadályozza, a leírás szerzője pedig mindig a fejlesztő. A merge-kapu ítéletet KIZÁRÓLAG
  helyi, gépi bizonyítékból fogad el. A korábbi szerző-szűrő kód kikerült (nincs halott út); a PR-kommenteket a kapu nem is kéri le.
- **Ítélet-módok:**

  | Mód | Mikor | Elfogadott ítéletforrás |
  |---|---|---|
  | alap | `gates.config.json` `blindReview.exclusive` KI (ma) | KIZÁRÓLAG a helyi `review-<fej>.json` (`record-review`) a jelenlegi fejre. Maradó kockázat: a fejlesztő munkamenet a `record-review`-val maga is írhat ilyen rekordot — az önigazolást ebben a módban csak a folyamat (vak, hibakereső alügynök) zárja ki, gép nem. |
  | szigorú („required”) | `blindReview.exclusive` BE (csak a küszöb és tulajdonosi jóváhagyás után) | KIZÁRÓLAG a futtató (`npm run gate:blind-review`) által igazolt helyi rekord (`reviewer: blind-review`, egyező modell). |

  Mindkét módban: felhős munkamenetből összevonás nem lehetséges (helyi bizonyíték nincs) — fail-closed, összhangban a tulajdonos
  döntésével, hogy a felhős munkamenetek nem töltenek fel és nem vonnak össze. A `mergeVerdict(pr, evidence, blind)` a `blind`
  paramétert a `resolveVerdict`-nek adja tovább; a lépés-összerakás (`mergeSteps`) tesztelt, a `main()` csak ezt hívja.
- **Ütközés-feloldás a két `vak` ággal (V2):** a `chore/vak-hibakereso-ellenor` és a `chore/vak-ellenor-deepseek` a
  `pre-merge-gate.mjs`-ben a `resolveVerdict({ head, blind: ctx.cfg.blindReview, evidence, texts: [pr.body, …] })` hívást és a külső
  (Gemini) lépés törlését hozza. Feloldás: (1) a #513 `mergeSteps` / `mergeVerdict` szerkezete marad; (2) a `blind` a
  `mergeSteps`-ben a `cfg.blindReview`-ból jön (ez már így van) — a szigorú mód így érvényesül; (3) a `texts` SOHA nem kapja meg a
  PR-leírást / kommenteket (V1) — a vak ág `texts: [pr.body, …]` része elvetendő; (4) a külső (Gemini) lépés törlése a `decideMerge`-
  ből átvehető, ez a #513-at nem érinti. Ellenőrzés a feloldás után (kötelező lépés, W1): a `pre-merge-gate.test.mjs` „V1”, „V2” és „W1” tesztje zöld — a W1 a `mergeSteps`-et
  szigorú módban (`exclusive: true`) hívja: sima `record-review` rekord → FAIL, futtató-rekord → PASS; ha a `blind` a
  továbbadás során elveszik (pl. `null` megy tovább), bukik —, és a vak ág saját szigorú módú tesztje is.
- **V3 → W2:** üres CCR-lista csak akkor fogadható el (nincs szál), ha a REST `pulls/N/comments` review-kommentlistája TELJESEN üres
  (a gyökérszám nem elég: a törölt gyökér válasza megmaradhat); különben FAIL.
- **W1:** a `mergeVerdict` a szigorú módot maga is érvényesíti (`exclusive: true` → csak a futtató rekordja, egyező modellel), így a
  `blind` továbbadása ezen az ágon is mérhető; a vak ág `resolveVerdict`-je ugyanezt a szabályt adja, a kettő nem ütközik.
- **W4 (jegyre):** a PR előtti kapu (`pre-pr-gate.mjs`) még elfogad PR-szöveges ítéletet (a `--body-file`-ból) — a két kapu
  ítélet-szabályának egységesítése külön jegy (SQL-feladat #399). **Megoldva (2026-11-24):** a `pre-pr-gate.mjs` `prVerdict()`-je csak a helyi
  `review-<fej>.json`-t fogadja el (`pre-pr-gate.test.mjs` „W4”).
- **V4:** hiányzó / nem egész `total_count` a check-run listában → FAIL.
- **V5 (maradó kockázat, jegyre):** a CCR keresztellenőrzése csak darabszámot véd; egy nyitott szál `resolved: true`-ként jelentését
  vagy kipárnázott listát semmi nem fogja meg — a CCR-válasz valós mintája a repóban nincs. A V1 miatt felhőből úgysem vonható össze
  PR, így ez ma nem kihasználható. Jegy: SQL-feladat #400.
- **K3:** az adatgyűjtés (`collectMergeData`) injektált `exec`-kel tesztelt: a lapozó kapcsolók, a tartalékutak sorrendje (GraphQL →
  CCR; védelmi végpont → `branches/main`), a hiba-ágak.
- **K4:** a PR-válaszban hiányzó / nem szám `changed_files` → kivétel → FAIL (a csonkolás-ellenőrzés nem maradhat ki).
- **K6:** a check-run lista lapozva (`total_count`-tal egyeztetve, csonka → FAIL); a GraphQL-szálak lapozva (`pageInfo`,
  legfeljebb 50 oldal, túllépés → FAIL); a fájllista `previous_filename`-je is útvonal; `mergeable_state` `unknown` / hiányzó →
  legfeljebb 3 újrakérés (2 s, 4 s várakozással), utána a meglévő szabály szerint FAIL.

## Negyedik és ötödik javítókör (2026-11-22; vak kör 1: L1–L6, vak kör 2: L1–L2)

- **Kör 1 / L1 (blokkoló):** minden futás az elején érvényteleníti a PR korábbi `merge-<n>-*.json` rekordjait; a validált fej a
  fájllista lekérése ELŐTT ismert, így egy későbbi gyűjtési hiba is erre a fejre ír `ok: false` bizonyítékot.
- **Kör 1 / L2:** a C-61 a lapozott hívások UTÁN újraolvasott main-csúcsot használja.
- **Kör 1 / L3–L5:** a GraphQL-lapozás csak explicit logikai `hasNextPage: false`-nál ér véget (ismeretlen alak → CCR-út); a
  fájllista minden rekordja nem üres, egyedi fájlnevű, a darabszám pontosan a `changed_files`; a `draft` csak logikai lehet.
- **Kör 1 / L6:** runbook-sor a W2-szabályhoz.
- **Kör 2 / L1:** a védelmi végpont 403-ánál a kötelező lista a késői `branches/main` válaszból jön (ugyanabból, mint a C-61 csúcsa).
- **Kör 2 / L2:** PR-enkénti zár és futásazonosító (`merge-run-<n>.json`): a végső közzététel csak a legutóbb indított futásé.
- EARS: AMIKOR egy korábban indult futás zöldre végez egy később indult, bukott futás után, a bizonyíték bukott marad (teszt).

- **Copilot (#513, `54a59dca`) — megszakított futás régi zöldje:** ha egy futás a zöld rekord kiírása után, a zár törlése előtt
  megszakad (beragadt zár), a következő futás az érvénytelenítés ELŐTT kilép; a futás-jelölő írása és az érvénytelenítés közti
  megszakítás vagy az érvénytelenítés I/O-hibája is megőrizheti a régi zöldet, amit a hook (csak `ok` + kor) elfogadna. Javítás: a
  közzétett merge-bizonyíték hordozza a `runId`-t; a hook (`check-quality-gates.mjs`, `gh pr merge`) csak akkor enged, ha a
  bizonyíték `runId`-je egyezik a `merge-run-<n>.json` jelölőével, és nincs fennálló `merge-lock-<n>.lock` zár. A jelölő az
  érvénytelenítés ELŐTT íródik, így egy félbeszakadt indulás után a régi zöld már nem egyezik.
- EARS: AMIKOR a merge-bizonyíték `runId`-je hiányzik vagy eltér a jelölőétől, VAGY a PR zárja fennáll, a hook a `gh pr merge`-et
  tiltja.

## Visszavonás

A változtatás visszavonása (`git revert`): a kapu újra csak GraphQL-lel fut.
