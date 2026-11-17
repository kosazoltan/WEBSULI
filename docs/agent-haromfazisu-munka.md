# Háromfázisú munka — kötelező (tulajdonosi utasítás 2026-09-09)

Minden nem-triviális javítás, módosítás vagy bővítés ebben a sorrendben történik.
A sorrend nem ajánlás. Kódolás a 3. fázis előtt tilos.

## A három fázis

1. **Terv** — `docs/specs/` sablon szerint: cél, nem-cél, érintett fájlok, rögzített döntések, edge case-ek, EARS-elfogadás. Csak a kódból ellenőrzött tények; UNKNOWN/UNVERIFIED jelöléssel, ha nincs bizonyíték.
2. **Mesterséges intelligencia számára olvasható végrehajtási utasítás** — külön fájl a spec mellett (`*-vegrehajtas.md`): feladatonként fájlútvonal, konkrét lépés, tesztparancs, elvárt kimenet. Nincs „stb.”, „hasonlóan a Task N-hez”, TBD.
3. **Javítás / módosítás / bővítés** — a végrehajtási utasítás sorrendjében, minimális diff. Utána a spechez mért verifikáció.

## Mikor kötelező a három fájl

- 3+ fájlt érint, vagy
- új végpont / adatmodell / auth / éles viselkedés, vagy
- a rossz értelmezés kárt okozna.

Egy soros, egy fájlos javításnál a terv lehet a commit-üzenet előtti 5–10 soros cél/nem-cél a chatben, de a kódolás akkor is a megértés után indul.

## Mit NEM szabad

- Spec nélkül kódolni, majd utólag „dokumentálni”.
- A tervet chatben hagyni, fájl nélkül, ha a feladat 3+ fájlt érint.
- A végrehajtási utasítást marketing-összefoglalónak írni kód, útvonal és teszt nélkül.
- A 2. fázis után megállni második „mehet” üzenetre, ha a tulajdonos már kérte a munkát. A 3. fázis a 2. után azonnal következik.
- A 1. és 2. fázist átugrani a „a feladat biztonságosan implementálható” indokkal.

## Befejezési mandátum (tulajdonosi utasítás 2026-11-01)

Egyik fázist sem szabad félbehagyni; félig elkészített spec leadása eljárási hiba. A teljes szabály (session végi
teljességellenőrzés, NOT DONE + ok + kockázat): `AGENTS.md` „Befejezési mandátum”.

## Minőségkapuk a 3. fázisban (tulajdonosi utasítás 2026-11-17)

A 3. fázis minden szakasza után `npm run gate:stage`, kibocsátás előtt a lint kapu és a push / PR / merge előtti kapu, a PR előtt
független alügynökös ellenőrzés — részletek: [`docs/minosegkapuk.md`](minosegkapuk.md). A sorrendet (végrehajtási fájl az első
kódcommit előtt) a `three-phase-check` gépiesen ellenőrzi: a `gate:push` része, és a CI „Háromfázisú rend” jobja is futtatja.

## Fájlnevek

- Terv: `docs/specs/YYYY-MM-DD-<rovid-nev>.md`
- Végrehajtás: `docs/specs/YYYY-MM-DD-<rovid-nev>-vegrehajtas.md`

A vezérlő fájlok (`AGENTS.md`, `.cursorrules`, `.cursor/rules/haromfazisu-munka.mdc`) erre a dokumentumra hivatkoznak.
