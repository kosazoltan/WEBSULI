# 2. ciklus — a halott futás azonnali felismerése és a ragos alak pontos rubrikája

Állapot: tulajdonosi utasítás 2026-10-21. Önálló ciklusok 11 óráig; a mért hibák javítása, a költség csökkentése.

## Mérés (2026-10-21 reggel)
- **Árva futások:** a 06:54-es deploy után két sorelem futásának Stúdió-jobja `error` lett, a bérlete 05:02Z-kor lejárt. A sor
  ennek ellenére `running`-nak tartotta őket, mert az egyeztetés csak 45 perc csend (`STALE_MS`) után indít újra, és a deploy-őr
  (AKTIV) is számolta őket. Következmény: kb. 40 perc üresjárat, és a ciklus-PR összevonása is késett.
- **Ragos alak:** a „A főnév – Magyar nyelvtan 4. osztály” 2/2 kísérlettel hibára futott. A lektor jogosan kifogásolta, hogy a
  -val/-vel példára az „anyának” is teljes pontot kap. A „Javítás iránya” viszont `required`-et javasolt, ami toldaléktűrő. Mérve:
  `required: [["anyával","késsel","tollal"]]` mellett az „anyának” is `ok`, `requiredPhrases` mellett `partial`. A javítókör így nem
  javíthatott, és kb. $10 veszett el.

## Cél
1. **Halott futás:** az egyeztetés a futást leálltnak veszi, ha a Stúdió-job `error`, és a workflow-bérlet nem él. Ilyenkor nincs
   45 perces várakozás, azonnal jön a folytatás vagy az újrakezdés (a kísérletkereten belül).
2. **A lektor javítási iránya:** ha a hiba a toldalékos / ragozott alak (a tanított tartalom maga a rag), a javítás iránya a pontos
   alakok `requiredPhrases`-ben (a `required` toldaléktűrő), a tartalom a `required`-ben marad.

## Nem-cél
- **A pontozó toldaléktűrése:** változatlan (a tartalmi válaszoknál ez a helyes viselkedés).

## Elfogadás (EARS)
- HA a sorelem futásának jobja `error`, és a bérlet nem él, AKKOR az egyeztetés azonnal újrapróbál (vagy hibára zár, ha a keret elfogyott).
- A lektor-prompt a ragos alak hibájára `requiredPhrases` javítási irányt ír elő.
