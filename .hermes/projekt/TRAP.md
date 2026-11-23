# TRAP — mért csapdák táblája (WEBSULI)

> Ez NEM a kanban. **kanban** = munkakártyák (`hermes kanban --board websuli`); **TRAP** = mért buktatók.
> Keresés: `node D:/repo/Hermes-agent/scripts/zaro-hurok.mjs trap search --repo . "<tünet>"` (a táblát ne olvasd végig).
> Új sor: `zaro-hurok.mjs trap add --repo . --tunet ... --gyokerok ... --megoldas ... [--forras <commit>] --skill <út | "nincs-skill: indok">`.
> APPEND-ONLY: új sor csak a fájl VÉGÉRE, törlés/átírás tilos; cellában nincs `|`. Titok tilos.
> „Nincs új csapda” jelölő (a fájl végére): `<!-- zaro-hurok: <ISO> nincs-uj -->`
> Témaspecifikus skill-TRAP-ok (`.hermes/skills/*/references/TRAP.md`) érvényben maradnak; a keresés azokat is nézi.

| dátum | tünet | gyökérok | megoldás | forrás/commit | skill-hivatkozás |
| --- | --- | --- | --- | --- | --- |
| 2026-11-23T12:47:59.377Z | Felhős vak kör (friss alügynök-review) minden javító pushra újra lefutott: 45 PR-ra 342 kör, token-égetés | A kapu fej-hashre kulcsolt ítéletet kért, és csak drága felhős alügynök adhatta; minden javítás új teljes kört indított | local-review.mjs: helyi GPU-modell (angol prompt) rögzíti a review-<fej>.json-t; felhős vélemény csak kockázatos fájlnál, egyszer | fcf033ee | .agents/skills/websuli-fejlesztesi-ellenor/SKILL.md |
| 2026-11-23T13:00:51.645Z | Zaro hurok vector: elavult index 8 s-mal a commit után | A teljes vector-újraépítés ~17 perc (33894 kód-chunk); a memória-commit a build vége után 8 s-mal készült, így a stamp régebbi | A vector-építést a záró hurok LEGVÉGÉN, az utolsó commit+push után indítsd, háttérben (notify); utána csak check | f507fd68 | nincs-skill: a sorrend a Hermes-agent zaro-hurok skill része |
