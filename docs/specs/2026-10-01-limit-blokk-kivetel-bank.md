# Limit-blokk-kivétel után a bank igazítása (2026-10-01)

**Mért ok** (élő Egyiptom-mérés, run 4e7a4d7c, job f5c23de2, main e9e72e0): a limiten a kapu a teljesen megalapozatlan
címkéjű blokkokat kivette (U6/C15); a bank tételei ezekre a fejezet–fogalom párokra épültek, a bankkapu (review #164)
ezért elutasított („a hivatkozott fejezet nem tanítja a megadott fogalmat”, bankterv-eltérés) → 1456 s után nem publikált.

**Spec-pontosítás (U6/C15):** a blokk-kivétel után a bankból is kikerül minden tétel, amelynek fogalmát a megnevezett
fejezet már nem tanítja (explain/example címke); a bankterv a kivétel utáni leckéből újraszámolódik (`planLessonBank`);
a fúziós bankkapu (`experienceProblems` + `verifyLessonSkillBank`) ezután fut, és csak akkor utasít el, ha a bank így sem
felel meg. A kivett tételek a minőségi jegyzetbe kerülnek.

**Nem-cél:** a megalapozottság-mérés, a 95/80-as szabály, a bankgyártás módosítása.

**Elfogadás (EARS):** HA a limiten blokk-kivétel történt, AKKOR a tanítatlan fogalmú banktételek kikerülnek, a bankterv
újraszámolódik; HA a bank ezután megfelel, a lecke publikál (jegyzettel); EGYÉBKÉNT elutasítás a bankhibákkal.
