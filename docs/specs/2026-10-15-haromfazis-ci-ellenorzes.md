# A háromfázisú rend CI-kikényszerítése — terv (2026-10-15)

Tulajdonosi döntés (2026-10-15): „Kikényszerítés a CI-ban” — a #227 és a #232 PR-nél a háromfázisú rend (terv → végrehajtási utasítás →
kód, `docs/agent-haromfazisu-munka.md`) sérült; a pótlás utólagos volt.

## Cél
A CI piros, ha egy PR érdemi kódváltozást hoz terv és végrehajtási utasítás nélkül, vagy ha a kód korábbi commitban készült, mint a
végrehajtási utasítás.

## Nem-cél
- A dokumentumok tartalmi minőségének megítélése (azt a review végzi).
- A szabály lazítása: a kis, egyfájlos javítás kivétele a meglévő szabályból jön („Egy soros, egy fájlos javításnál a terv lehet a
  commit-üzenet előtti 5–10 soros cél/nem-cél a chatben”).

## Szabály (gépi)
- **Kód** = módosított fájl a `source/server/**`, `source/shared/**`, `source/client/src/**` alatt (tesztek, dokumentumok, szkriptek nem).
- **Kis javítás (kivétel):** 1 kódfájl, legfeljebb 1 hozzáadott és 1 törölt sor (a szabály „egy soros” kivétele) → átmegy (figyelmeztetéssel).
  (Review #236, 2026-10-15: a korábbi „≤ 20 sor” tágabb volt a szabálynál — `docs/specs/2026-10-15-review-236-237-javitas.md`.)
- A végrehajtási fájl tartalmát és a terv létezését az **első kódcommit** állapotán kell igazolni (nem a HEAD-en).
- Egyébként kötelező:
  1. a PR diffjében legalább egy `docs/specs/*-vegrehajtas.md` (új vagy módosított);
  2. az a végrehajtási fájl hivatkozik egy létező, nem végrehajtási tervfájlra (`docs/specs/<név>.md`);
  3. **sorrend:** az első kódot érintő commit nem lehet korábbi, mint az első, végrehajtási fájlt érintő commit (ugyanaz a commit megengedett).
- Kimenet: magyar nyelvű, pontos ok (melyik feltétel bukott, melyik fájl/commit).

## Határesetek
- Csak dokumentum / teszt / szkript / workflow változás → átmegy.
- Merge-commitok (a `main` átvezetése) a sorrendvizsgálatból kimaradnak (`--no-merges`).
- Squash előtti PR: a sorrend a PR commitjaiból számít.

## Elfogadás (EARS)
- E1: HA egy PR 3 kódfájlt módosít végrehajtási fájl nélkül, AKKOR a CI piros a pontos okkal.
- E2: HA a végrehajtási fájl a kód utáni commitban jön, AKKOR a CI piros („sorrend”).
- E3: HA egy PR 1 kódfájlban legfeljebb 1 sort cserél (1 hozzáadott + 1 törölt), AKKOR átmegy (figyelmeztetés); 2 hozzáadott sornál piros.
- E4: A szkript tiszta döntési része egységtesztelt (diff-lista és commit-lista bemenetből).
