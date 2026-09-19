import { experienceSchema, lessonLanguage, publicationBankProblems } from "./lesson-experience";
import { evaluateOpenAnswer } from "./lesson-experience-score";

export const LESSON_SKILL_CHECK_VERSION = "tananyag-keszito-7.4-check-1";
/** Shared by runtime documentation and the publication validators; not learned/optional rules. */
export const LESSON_SKILL_CHECK_RUNBOOK = `KÖTELEZŐ TANANYAGKÉSZÍTŐ 7.4 ELLENŐRZŐ (${LESSON_SKILL_CHECK_VERSION}):
1. A teljes tanítás, forrás és program által megállapított évfolyam egyezzen; séma, fogalomfedettség, hogyan/miért, kidolgozott példa, fejezetenként összegzés és szemléltetés szükséges.
2. Négy lap: Tananyag, Módszerek, Feladatok, Kvíz. Legalább 45/75 bank, 15/25 kör, mind a tíz módszertípus, két különböző kapukérdés. Fogalomhoz kötött írásbeli/szóbeli feladat és felidéző/alkalmazó kvíz; duplikált vagy tanítatlan kérdés tilos.
3. A tényleges pontozó minden saját mintára 1, üres válaszra 0 pontot adjon. Nyelvleckénél teljes szószedet és helyes TTS-nyelv kell.
4. Független lektor ellenőrizze a teljes forráshűséget és pedagógiai minőséget, minden bankválaszt is. Hiányzó, elavult, csonkolt vagy blokkoló jelentés nem jogosít publikálásra. Javítás után új ellenőrzés kell, körlimit nem lazít kaput.
5. Valódi böngészős kiadási próba: négy lap, téves/részleges/helyes válasz, új kör és eredménymegőrzés, helyi magyar font, évfolyamszínek, 320 px/álló/fekvő/asztali nézet, 44 px vezérlők, átfedés és overflow. Statikus kapu nem bizonyít böngészős sikert.
6. Javítás külön jelölt; alkalmazás előtt mentés és frissességellenőrzés, utána tranzakciós írás és visszaolvasás. Csak mentett és visszaolvasott eredmény kész; modell-önértékelés nem bizonyíték.`;

export type LessonSkillCheck = { code: string; passed: boolean; problems: string[] };
export type LessonSkillCheckResult = { version: string; ok: boolean; checks: LessonSkillCheck[]; problems: string[] };

/** Executable data checks only. Source semantics and rendered behavior are separate mandatory gates. */
export function verifyLessonSkillBank(experience: unknown, subject: string): LessonSkillCheckResult {
  const checks: LessonSkillCheck[] = [];
  const add = (code: string, problems: string[]) => checks.push({ code, passed: problems.length === 0, problems });
  const parsed = experienceSchema.safeParse(experience);
  add("schema_and_concept_bank", parsed.success ? [] : parsed.error.issues.map(i => `${i.path.join(".") || "bank"}: ${i.message}`));
  if (parsed.success) {
    const bank = parsed.data;
    add("minimums_methods_rounds", publicationBankProblems(bank));
    add("sample_full_score", bank.tasks.flatMap(t => evaluateOpenAnswer(t.sample, t).score === 1 ? [] : [`${t.id}: a saját mintaválasz nem kap teljes pontot.`]));
    add("empty_zero_score", bank.tasks.flatMap(t => evaluateOpenAnswer("", t).score === 0 ? [] : [`${t.id}: az üres válasz nem nulla pont.`]));
    const language = lessonLanguage(subject);
    add("language_glossary_tts", language && (bank.language !== language || !bank.glossary.length) ? ["A nyelvlecke szószedete vagy TTS-nyelve hiányzik/eltér."] : []);
  }
  const problems = [...new Set(checks.flatMap(c => c.problems))];
  return { version: LESSON_SKILL_CHECK_VERSION, ok: problems.length === 0, checks, problems };
}