---
name: stacked-pr-standalone-neutral
description: "WEBSULI halmozott PR-lánc — minden PR önállóan beolvadva is hagyja változatlanul az éles működést; funkciókapcsoló a lánc ALJÁN, alapból KI"
metadata:
  node_type: memory
  type: feedback
  modified: 2026-11-18T17:15:59.416Z
---

Halmozott (egymásra épülő) PR-láncnál a PR-ok egyenként olvadnak a főágra, minden beolvadás élesre telepít, és a köztes állapot
órákig élhet (a CI böngészős köre 86–115 perc PR-onként). Ezért minden szeletnél kötelező kérdés: „mi történik élesben, ha ez a PR a
ráépülők nélkül él?” — a lánc elejére, az ELSŐ viselkedést változtató commit elé funkciókapcsoló kell (alapból KI), és teszt rögzítse,
hogy KI állapotban a kimenet (pl. a modellnek küldött prompt) bájtra azonos a főágéval.

**Why:** 2026-11-18-án a tananyaggyártás-minőség láncban a forrásleltár (#501) és a promptokba vezetése (#505) az új megjelenítők
nélkül fizetős javítókört indított volna az éles gyártásban (a modell elé került a `table` / `ruleBox` alakja, a séma viszont még
elutasította). Három szeletenkénti, nem vak ellenőr nem vette észre; a vak hibakereső ellenőr találta meg a 4. szeletnél. Ára: a
kapcsoló utólagos bevezetése a lánc alján, három nyitott PR fejének cseréje és újraellenőrzése.

**How to apply:** a terv (spec) szeletlistájába írd be szeletenként az „önálló beolvaszthatóság” sort és a kapcsoló nevét; a vak
ellenőr megbízásában legyen kifejezett hibakereső pont a köztes állapotra; gyártó promptot érintő szeletnél a kapcsoló KI állapotára
prompt-lenyomat teszt a főághoz mérve. Kapcsolódik: [[blind-bug-hunting-reviewer]], [[orchestration-lessons-games]], [[no-deploy-during-active-runs]].
