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

## Edge case-ek

- `mergeable_state` `unknown` / `null` → `UNKNOWN` → a meglévő szabály szerint FAIL („várd meg az újraszámolást”).
- 100-nál több változott fájl vagy komment: a GraphQL-változat is csak az első oldalt nézte a gyakorlatban; a fájllista a
  `telepítés` jelzéshez és a C-61-hez kell — 100 fölött a C-61 a compare-végpontból dolgozik tovább. Ítélet-komment a 100.
  után: a PR-leírásban vagy a helyi bizonyítékban is lehet. (Nem lazít: a hiányzó ítélet FAIL.)
- A CCR-útvonal válaszának hiányzó `resolved` mezője → nem lezárt szálnak számít (fail-closed).

## Elfogadás (EARS)

- AMIKOR a GraphQL tiltott, a kapu AKKOR IS végigfut, és a lépései ugyanazok, mint a fejlesztői gépen.
- AMIKOR a REST-válasz `mergeable_state: "clean"`, `state: "open"`, `draft: false`, a „PR állapota” lépés PASS.
- AMIKOR a CCR-szálak között `resolved: false` (vagy hiányzó) van, a „lezáratlan review-szálak” lépés FAIL.
- A leképezők egységtesztje a `pre-merge-gate.test.mjs`-ben; a meglévő tesztek változatlanul zöldek.
- Élő próba felhős munkamenetből: `npm run gate:merge -- <PR>` az adatgyűjtésen túljut (lépéstábla, valódi PASS/FAIL).

## Visszavonás

A változtatás visszavonása (`git revert`): a kapu újra csak GraphQL-lel fut.
