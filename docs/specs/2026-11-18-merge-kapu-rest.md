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

- A kapu ugyanazokat az adatokat REST-ről gyűjti, így a fejlesztői gépen ÉS a felhős munkamenetben is lefut.
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

- AMIKOR a GraphQL tiltott, a kapu AKKOR IS végigfut, és a lépései ugyanazok, mint a fejlesztői gépen.
- AMIKOR a REST-válasz `mergeable_state: "clean"`, `state: "open"`, `draft: false`, a „PR állapota” lépés PASS.
- AMIKOR a CCR-szálak között `resolved: false` (vagy hiányzó) van, a „lezáratlan review-szálak” lépés FAIL.
- A leképezők egységtesztje a `pre-merge-gate.test.mjs`-ben; a meglévő tesztek változatlanul zöldek.
- Élő próba felhős munkamenetből: `npm run gate:merge -- <PR>` az adatgyűjtésen túljut (lépéstábla, valódi PASS/FAIL).

## Javítókör a vak, hibakereső ellenőrzés után (2026-11-19; ítélet a `c96e4801` fejre: IGEN, FELTÉTELLEL, K1–K6)

- **K1 — CCR-szálak:** a `ccr/review_threads` hívás is `--paginate --slurp` + `flattenPages`; nem lista, üres vagy ismeretlen alakú
  válasz (bármely elemnél hiányzó / nem logikai `resolved`) → kivétel → FAIL. Az üres lista sem igazol (amíg nincs mért CCR-minta,
  a felhős szál-út nem adhat PASS-t üres listára — ekkor a szálakat GraphQL-ről kell igazolni). REST-keresztellenőrzés: a
  `pulls/N/comments` (lapozva) `in_reply_to_id` nélküli gyökérkommentjeinek száma ≤ a CCR-szálak száma, különben FAIL (csonka).
- **K2 — ítélet csak megbízható szerzőtől:** a PR-leírás és a kommentek közül csak az számít ítéletforrásnak, amelynek szerzője a
  REST szerint `author_association` ∈ {OWNER, MEMBER, COLLABORATOR}, és nem bot (`user.type` ≠ `Bot`, a név nem `[bot]`-ra
  végződik). Más szerző ítélet-sora figyelmen kívül marad (nem írhat felül egy NEM ítéletet sem).
- **Ítélet-módok (összehangolás a vak ellenőr futtatójával, K5):**

  | Mód | Mikor | Elfogadott ítéletforrás |
  |---|---|---|
  | alap | `gates.config.json` `blindReview.exclusive` KI (ma) | a helyi `review-<fej>.json` (`record-review`), ennek hiányában a megbízható szerzőtől származó PR-szöveges sor (K2) |
  | szigorú („required”) | `blindReview.exclusive` BE (csak a küszöb és tulajdonosi jóváhagyás után) | KIZÁRÓLAG a futtató által igazolt helyi bizonyíték; PR-szöveg soha — felhős munkamenetből csak akkor vonható össze, ha a futtató ott futott és helyben rögzített |

  A szigorú mód kódja a vak ellenőr futtatójának ágán érkezik; ez a PR az alap mód szerzőszűrését adja, a kettő egymásra épül.
- **K3:** az adatgyűjtés (`collectMergeData`) injektált `exec`-kel tesztelt: a lapozó kapcsolók, a tartalékutak sorrendje (GraphQL →
  CCR; védelmi végpont → `branches/main`), a hiba-ágak.
- **K4:** a PR-válaszban hiányzó / nem szám `changed_files` → kivétel → FAIL (a csonkolás-ellenőrzés nem maradhat ki).
- **K6:** a check-run lista lapozva (`total_count`-tal egyeztetve, csonka → FAIL); a GraphQL-szálak lapozva (`pageInfo`,
  legfeljebb 50 oldal, túllépés → FAIL); a fájllista `previous_filename`-je is útvonal; `mergeable_state` `unknown` / hiányzó →
  legfeljebb 3 újrakérés (2 s, 4 s várakozással), utána a meglévő szabály szerint FAIL.

## Visszavonás

A változtatás visszavonása (`git revert`): a kapu újra csak GraphQL-lel fut.
