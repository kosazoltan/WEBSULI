# Végrehajtás — limiten lazított fejezet-csomag

1. `shared/lesson-experience.ts`: `bankPlanSchema.trimmedSections?: number[]`; a csomag-ellenőrzésben a jelölt fejezet egységénél
   a nyílt feladat darab/pár-követelmény kimarad (a fogalmankénti „nincs nyílt feladat” ellenőrzés marad).
2. `server/studio/step-runner.ts` `resolveChoiceGate`: limit-eredetű kivételnél, ha a kivétel utáni bank hibás, a kivett nyílt
   feladatok fejezeteit `trimmedSections`-be téve egyszer újramér; ha így megfelel, ezt a leckét adja.
3. Ugyanez a #170 blokk-kivétel utáni bankigazításnál (`reconcileBankWithTeaching` után, a kapu limit-ágán).
4. Tesztek: séma (jelölt fejezet lazít, jelöletlen nem, fogalom feladat nélkül → hiba); futtató (limit-kivétel → publikál
   jelöléssel). Ellenőrzés: tsc, eslint, teljes unit; status-sor.
5. **1. kiterjesztés:** a jelölt fejezetben a fogalomnak 0 nyílt feladata is lehet (a felidéző+alkalmazó kvízpár kötelező); teszt: séma-eset.
6. **2. kiterjesztés:** a jelölt fejezetben a módszer-minimum is lazul; lazítható fejezet a limit-eredetű feladat- VAGY módszer-kivétel fejezete (`resolveChoiceGate`), ill. a blokk-kivétel utáni bankigazításban a kikerült nyílt feladat vagy módszer fejezete (`reconcileBankWithTeaching().trimSections`); a minőségi jegyzet (`bank_trimmed`) mindkettőt említi. Tesztek: séma-eset, limit-eredetű módszer-kivétel, `trimSections` módszerre; ingyenes kapu-visszajátszás a d280388a jobon.
