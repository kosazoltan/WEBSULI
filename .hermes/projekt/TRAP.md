# TRAP — mért csapdák táblája (WEBSULI)

> Ez NEM a kanban. **kanban** = munkakártyák (`hermes kanban --board websuli`); **TRAP** = mért buktatók.
> Keresés: `node D:/repo/Hermes-agent/scripts/zaro-hurok.mjs trap search --repo . "<tünet>"` (a táblát ne olvasd végig).
> Új sor: `zaro-hurok.mjs trap add --repo . --tunet ... --gyokerok ... --megoldas ... [--forras <commit>] --skill <út | "nincs-skill: indok">`.
> APPEND-ONLY: új sor csak a fájl VÉGÉRE, törlés/átírás tilos; cellában nincs `|`. Titok tilos.
> „Nincs új csapda” jelölő (a fájl végére): `<!-- zaro-hurok: <ISO> nincs-uj -->`
> Témaspecifikus skill-TRAP-ok (`.hermes/skills/*/references/TRAP.md`) érvényben maradnak; a keresés azokat is nézi.

| dátum | tünet | gyökérok | megoldás | forrás/commit | skill-hivatkozás |
| --- | --- | --- | --- | --- | --- |
