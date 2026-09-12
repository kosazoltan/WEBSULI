import { HTML_TEACHING_CONTRACT } from "./lesson-quality";
import { z } from "zod";
import { experienceSchema, LESSON_METHOD_VERSION } from "./lesson-experience";

/** The bank is embedded ONCE; standalone HTML reads this JSON, never a hidden second bank. */
export const HTML_LESSON_DATA_ID = "websuli-lesson-data";
export function hasHtmlLessonData(html: string): boolean {
  return /<script\b[^>]*\bid\s*=\s*["']websuli-lesson-data["']/i.test(html);
}
export const htmlLessonDataSchema = z.object({
  classroom: z.number().int().min(0).max(12), classroomEvidence: z.string().min(20),
  subject: z.string().min(1), experience: experienceSchema,
});
export const HTML_LESSON_DATA_CONTRACT = `HTML-fúzió adatszerződés (${LESSON_METHOD_VERSION}), a régebbi példakódnál ez az irányadó:
${HTML_TEACHING_CONTRACT}
A data-lesson-panel="quiz" panel kvízét a WebSuli közös futtatója jeleníti meg a JSON-bankból. A kérdéskör, első válaszok, pontozás és újratöltés utáni visszaállítás közös programfeladat; ne generálj hozzá saját pontozó vagy tároló JavaScriptet. A panel helyőrzője jelezze: „A gyakorlókvíz betöltése…”.
Az összes bankot EGYETLEN <script type="application/json" id="${HTML_LESSON_DATA_ID}"> elembe írd, szigorú JSON-ként. A WebSuli közös futtatója CSAK ebből olvassa és jeleníti meg a bankokat; külön szerzői JavaScript vagy második tömb nem szükséges. JSON-szövegben a < karaktert \\u003c alakban kódold.
Gyökér: {classroom: 0..12, classroomEvidence: "mely tanított fogalmak igazolják ezt az évfolyamot", subject: "tantárgy", experience:{version:"${LESSON_METHOD_VERSION}",theme:"ocean|forest|sunset|cosmos|paper|berry",bankPlan:{units:[{sectionIndex,conceptIds}],taskRound,quizRound},methods:[...],tasks:[...],quiz:[...],glossary:[],language?:"en-GB"}}.
Az évfolyamot a TANÍTOTT TARTALOM alapján önállóan állapítsd meg, a felhasználói évfolyam legfeljebb keresési támpont. Nem írhatja felül a forrás nehézségét.
Minden methods/tasks/quiz elem: id (bankon belül egyedi), sectionIndex (0-alapú tananyagfejezet), coversConceptIds (pl. area, altitude – ugyanott tanított fogalmak).
bankPlan: minden tanított fogalom fejezetenként rendezett ID-vel, legfeljebb 6 fogalom csomagonként. Egy fogalom egy fejezetben csak egy csomagba kerülhet. taskRound=15, quizRound=25 minden évfolyamon; a kérdések egyenként lapozhatók.
methods: csomagonként legalább két különböző, releváns kind (prediction,gate,myth,sorting,causeEffect,conflict,selfCheck,popup,timeline,analogy). Minden elem title,prompt,answer; gate/myth/popup: options (2–4 különböző),correctIndex; sorting/causeEffect/timeline: steps helyes sorrendben. A teljes anyagban mind a tíz típus és legalább két kapukérdés kötelező.
tasks: a teljes tananyagban MINIMUM 45 különböző, pontozott szöveges feladat; csomagonként legalább max(2,fogalomszám), az összes fogalomhoz legalább egy nyílt kérdés; legalább egy oral és egy written. Elemenként q,required:string[][] (legalább egy kötelező csoport),bonus:string[][],minWords (>=1),needsSentence:boolean,sample,mode:"written"|"oral". Felsorolásnál is legyen required. Nehézséget ne csökkents darabszámért.
quiz: a teljes tananyagban MINIMUM 75 különböző, pontozott kérdés; fogalmanként legalább két kérdés: intent:"recall" és intent:"apply", coversConceptIds egyetlen fogalom-ID. Elemenként question,options:string[] (3 vagy 4),correctIndex (érvényes index),feedbackPerOption:string[] (azonos hossz). Külön magyarázat minden opcióra, első válasz rögzített. Sem a feladat, sem a kvíz kérdésszövege nem ismétlődhet.
A tasks panel szöveges feladatait is a WebSuli közös futtatója pontozza és őrzi meg újratöltéskor. Ide se generálj saját pontozó vagy tároló JavaScriptet; adj betöltési helyőrzőt.
Nyelvi leckénél language és glossary kötelező; minden szóhoz {word,translation,partOfSpeech,example,exampleTranslation}.
A négy NAVIGÁCIÓS GOMB attribútuma data-lesson-tab="teaching|methods|tasks|quiz"; a négy tartalomé data-lesson-panel ugyanilyen értékkel. A gombváltó ténylegesen ezek láthatóságát állítja. A methods panel a JSON módszereit, tasks és quiz a bankPlan szerinti rövid kört jeleníti meg. Alapból egyesével lapozva, külön teljes áttekintéssel. Fülváltás nem töröl választ. Üres válasz0; minta1; részválasz0.5; számok előjelét és tizedesjelét ne veszítsd el és ne fogadj el fuzzy számegyezést. Eredmény helyi mentése és JSON-export.
A módszer szerinti teljes HTML elkészülte után gépi kapu ellenőrzi a JSON-sémát, darabszámokat, mintaválaszokat és a füleket; hiányos anyag nem menthető.`;

export function readRawHtmlLessonData(html: string): unknown {
  const blocks = html.match(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi) ?? [];
  const target = blocks.filter(b => new RegExp(`\\bid\\s*=\\s*["']${HTML_LESSON_DATA_ID}["']`, "i").test(b.slice(0, b.indexOf(">") + 1)));
  if (target.length !== 1) throw new Error("Pontosan egy websuli-lesson-data JSON-bank szükséges.");
  const raw = target[0].replace(/^<script\b[^>]*>/i, "").replace(/<\/script\s*>$/i, "");
  return JSON.parse(raw);
}
export function readHtmlLessonData(html: string) {
  return htmlLessonDataSchema.parse(readRawHtmlLessonData(html));
}
