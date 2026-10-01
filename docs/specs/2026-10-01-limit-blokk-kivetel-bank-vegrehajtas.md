# Végrehajtás — limit-blokk-kivétel után a bank igazítása

1. `server/studio/limit-policy.ts`: `reconcileBankWithTeaching(lesson)` — fejezetenként a tanított fogalmak (explain/example
   `coversConceptIds`); a methods/tasks/quiz tétel marad, ha a fejezete létezik és minden fogalmát tanítja; `bankPlan` →
   `planLessonBank(lesson, experience.version)` (ha volt bankterv); visszaadja a kivett tétel-azonosítókat.
2. `server/studio/step-runner.ts` (kapu, limit-ág): a blokk-kivétel után `reconcileBankWithTeaching`, utána a meglévő
   bankkapu; a kivett tételek száma a `gate_limit_accepted` jegyzetbe.
3. Teszt: a meglévő review #164 futtató-teszt (a bank a kivett blokkra épült) a spec-pontosítás szerint: a tétel kikerül, a
   lecke publikál; új eset: ha a kivétel után a bank minimuma sérül → elutasítás.
4. Ellenőrzés: tsc, eslint, teljes unit; status-sor.
