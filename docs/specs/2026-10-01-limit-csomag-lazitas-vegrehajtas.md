# Végrehajtás — limiten lazított fejezet-csomag

1. `shared/lesson-experience.ts`: `bankPlanSchema.trimmedSections?: number[]`; a csomag-ellenőrzésben a jelölt fejezet egységénél
   a nyílt feladat darab/pár-követelmény kimarad (a fogalmankénti „nincs nyílt feladat” ellenőrzés marad).
2. `server/studio/step-runner.ts` `resolveChoiceGate`: limit-eredetű kivételnél, ha a kivétel utáni bank hibás, a kivett nyílt
   feladatok fejezeteit `trimmedSections`-be téve egyszer újramér; ha így megfelel, ezt a leckét adja.
3. Ugyanez a #170 blokk-kivétel utáni bankigazításnál (`reconcileBankWithTeaching` után, a kapu limit-ágán).
4. Tesztek: séma (jelölt fejezet lazít, jelöletlen nem, fogalom feladat nélkül → hiba); futtató (limit-kivétel → publikál
   jelöléssel). Ellenőrzés: tsc, eslint, teljes unit; status-sor.
