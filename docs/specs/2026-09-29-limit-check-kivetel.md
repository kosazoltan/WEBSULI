# Körlimiten maradt hibás ellenőrző kérdés (check blokk): a blokk esik ki, nem a lecke (2026-09-29)

## Kiváltó ok (3. élő újramérés)
„Oszthatóság 4-gyel és 25-tel”, job `e5c5df92…` / Studio `06f5e6ae…`, 944 s után `error`:
- A limitkör (`MAX_AUTHOR_ROUNDS` = 2) blokkolói banktételek, és EGY tanítási ellenőrző kérdés: `sections[10].blocks[3]`.
  - Az 1. körben két helyes opciója volt.
  - A szerzői átírás után egy opció hamis tényt állított („a 6 osztható 4-gyel”).
- A #139 (`limitBankFlags`) csak banktételt vesz ki. A `sections.*` blokkoló „tanítási” blokkolónak számít, ezért a teljes lecke elbukott.
- A check blokk nem tanító szöveg, hanem gyakorlókérdés a szakasz végén, ugyanolyan tétel-szintű elem, mint a kvízkérdés. Az ív-mérés (`shared/lesson-arc.ts`) nem követel meg check blokkot; a számukat csak a Próba-küszöb figyeli, azt pedig a #141 determinisztikusan kezeli.

## Cél
A körlimiten a lektor által blokkolt `check` blokk kikerül a leckéből (a lecke pedig publikálható, ha a kapu többi mérése
rendben van), ugyanúgy, mint a #139-es banktétel.

## Nem cél
- Tanító blokk (explain, example, animate, recap stb.) blokkolója a limiten továbbra is buktat (a meglévő „(r)” teszt változatlan).
- A #134 determinisztikus őrének szabálya nem változik: a kapu által talált check-hiba lektori limit-jelzés nélkül nem publikál (a meglévő E4 teszt változatlan).

## Rögzített döntések
1. `checkBlockRef(path)` (`shared/bank-item-ref.ts`): a `sections[10].blocks[3]` és a `sections.10.blocks.3` alakot
   (al-útvonallal is) `{ section, block }`-ra képezi; normalizált alak: `sections[10].blocks[3]`.
2. `limitBankFlags`: egy blokkoló kivehető, ha létező banktételre VAGY létező `check` blokkra mutat. A jelzés `origin: "limit"`.
3. `resolveChoiceGate`: a limit-eredetű jelzést a check blokkon is kivételként kezeli; egy szakaszon belül több blokk is
   kivehető. A limit-jelzés nélküli check-hiba továbbra is `error`. A 7.4 bizonyíték a kivett check blokkra mutató
   blokkolót is elfogadja.
4. A kivétel után a kapu újramér: bankminimum, Próba-küszöb (#141), fedettség, ív. Ha a mérés hibát ad, a meglévő
   szabály érvényes (célzott javítás csak kerettel, különben tiszta hiba).

## Elfogadás (EARS)
- **E1** A `checkBlockRef` SHALL a zárójeles, a pontozott és az al-útvonalas alakot ugyanarra a blokkra képezni; nem check útvonalra `null`.
- **E2** A limiten a banktételre és egy check blokkra mutató blokkolókkal a lektor-lépés SHALL a kapura lépni; a kapu SHALL mindkettőt kivenni és publikálni (teszt; a régi kódon a lektor buktat).
- **E3** Tanító blokkra mutató limit-blokkoló SHALL továbbra is buktatni (a meglévő „(r)” teszt).
- **E4** Kapuk zöldek; élő újramérés ugyanazzal a témával.

## Review-kör (PR #142)
- **A 32 karakteres `blockPath`-korlát (Copilot + Codex P2): javítva, migráció nélkül.** A lektor-jelentés sémája
  (`step-io.ts`) a validálás előtt a tétel szintjére normalizálja az útvonalat
  (`sections[10].blocks[3].options[1]` → `sections[10].blocks[3]`, `experience.quiz[65].correctIndex` → `experience.quiz[65]`),
  így a pontos al-útvonalas válasz nem buktatja a teljes jelentést, és a DB `varchar(32)` oszlopa is elég.
  Teszt: a javítás előtt bukott.
