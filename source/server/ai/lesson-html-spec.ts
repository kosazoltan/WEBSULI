import { LESSON_FONT_CSS, LESSON_TYPOGRAPHY_CONTRACT, lessonFontPair, type LessonFont } from "../../shared/lesson-typography";
import { LESSON_METHOD_CONTRACT } from "../../shared/lesson-experience";
import { HTML_LESSON_DATA_CONTRACT } from "../../shared/lesson-html-data";
import { HTML_INTERACTION_CONTRACT } from "../../shared/lesson-interactions";
/**
 * Tananyag Készítő v7.4 — a HTML-tananyagot gyártó AI-utak KÖZÖS specifikációja.
 *
 * Forrás: docs/specs/tananyag-keszito-SKILL-v7_4.md (tulajdonosi skill, 2026-09-09).
 * Itt az app-ra szabott változat él: a skill „build workflow” része (Python-szkriptek,
 * outputs-mappa) kimaradt, minden más — háromrétegű kiértékelő motor, TTS, diktálás,
 * Android-biztos magyar ékezetkezelés, ES5/IIFE/prefix — kötelező szövegként szerepel.
 *
 * Használják: routes.ts (Enhanced készítő + material-creator chat), improveAsync.ts
 * (Okosítás), studio/web-research-agent.ts (internetes ügynök). Egy helyen változik.
 */

export const LESSON_SPEC_VERSION = "7.4";

/** Betűpár és paletta — ellenőrzött, helyben kiszolgált magyar készlet. */
export type LessonTheme = {
  id: string;
  name: string;
  mood: string;
  bodyFont: LessonFont;
  headingFont: LessonFont;
  displayFont?: LessonFont;
  primary: string;
  accent: string;
  background: string;
  surface: string;
  text: string;
  headerStyle: string;
  layoutHint: string;
  prefix: string;
};

export const LESSON_THEMES: readonly LessonTheme[] = [
  {
    id: "tenger",
    name: "Tenger",
    mood: "nyugodt, tiszta, matematikához és természettudományhoz",
    bodyFont: "Nunito",
    headingFont: "Nunito",
    primary: "#0b4f6c",
    accent: "#34a0c8",
    background: "#f4f9fb",
    surface: "#ffffff",
    text: "#1d2b36",
    headerStyle: "színátmenetes hős-fejléc (primary→accent), fehér cím, alatta alcím-sáv",
    layoutHint: "kártyarács: nagy kijelzőn 2 oszlop, mobilon 1; fejezetcímek bal oldali színes csíkkal",
    prefix: "tg",
  },
  {
    id: "erdo",
    name: "Erdő",
    mood: "természetes, meleg, biológiához / környezetismerethez",
    bodyFont: "Nunito",
    headingFont: "Nunito",
    primary: "#2f6b3a",
    accent: "#a3c94f",
    background: "#f6f9f2",
    surface: "#ffffff",
    text: "#1f2d1b",
    headerStyle: "zöld sáv-fejléc levél-ikonnal, lekerekített aljjal",
    layoutHint: "egyoszlopos, széles kártyák, fejezetek között vékony elválasztó; folyamatábra CSS-sel",
    prefix: "er",
  },
  {
    id: "naplemente",
    name: "Naplemente",
    mood: "energikus, bátorító, nyelvtanuláshoz és alsó tagozathoz",
    bodyFont: "Nunito",
    headingFont: "Nunito",
    primary: "#c2410c",
    accent: "#f59e0b",
    background: "#fff8f1",
    surface: "#ffffff",
    text: "#3b1f0e",
    headerStyle: "narancs-lila átmenetes fejléc nagy, kerek cím-kártyával",
    layoutHint: "kártyák pasztell háttérrel, 2 oszlopos szószedet táblázat, nagy gombok",
    prefix: "np",
  },
  {
    id: "pergamen",
    name: "Pergamen",
    mood: "klasszikus, elegáns, történelemhez és irodalomhoz",
    bodyFont: "Nunito",
    headingFont: "Source Serif 4",
    displayFont: "Source Serif 4",
    primary: "#7a2e2e",
    accent: "#c9a227",
    background: "#f8f3e7",
    surface: "#fffdf7",
    text: "#2b1d12",
    headerStyle: "pergamen-színű fejléc, Source Serif 4 cím, arany vonallal",
    layoutHint: "időszalag függőleges vonallal, idézet-boxok, fejezetek kártyákon sorszámozott medalionnal",
    prefix: "pg",
  },
  {
    id: "ur",
    name: "Űr",
    mood: "modern, technológiai, informatikához / fizikához / felső tagozathoz",
    bodyFont: "Source Sans 3",
    headingFont: "Source Sans 3",
    primary: "#1e1b4b",
    accent: "#22d3ee",
    background: "#0f172a",
    surface: "#1e293b",
    text: "#e2e8f0",
    headerStyle: "sötét fejléc neon-cián kiemeléssel, halvány rácsminta CSS-ből",
    layoutHint: "sötét felület világos szöveggel (kontraszt min. 4.5:1), kód-szerű fogalomkártyák, 2 oszlop nagy kijelzőn",
    prefix: "ur",
  },
  {
    id: "cukorka",
    name: "Cukorka",
    mood: "játékos, barátságos, 1–3. évfolyamhoz",
    bodyFont: "Nunito",
    headingFont: "Nunito",
    primary: "#be185d",
    accent: "#14b8a6",
    background: "#fff5fa",
    surface: "#ffffff",
    text: "#3b0f24",
    headerStyle: "nagy, kerek, pasztell fejléc emoji nélkül, vidám színfoltokkal",
    layoutHint: "nagy betűk (min. 18px törzs), sok szín-kártya, rövid bekezdések, nagy gombok",
    prefix: "ck",
  },
  {
    id: "labor",
    name: "Labor",
    mood: "tiszta, precíz, kémiához / matematikához / méréshez",
    bodyFont: "Source Sans 3",
    headingFont: "Source Sans 3",
    primary: "#1d4ed8",
    accent: "#facc15",
    background: "#f8fafc",
    surface: "#ffffff",
    text: "#0f172a",
    headerStyle: "fehér fejléc kék felső csíkkal és sárga kiemelő címkével",
    layoutHint: "táblázatos fogalomtár, képlet-boxok, lépésenkénti munkamenet számozott kártyákon",
    prefix: "lb",
  },
  {
    id: "kreta",
    name: "Kréta",
    mood: "iskolai tábla-hangulat, bármely tantárgyhoz",
    bodyFont: "Nunito",
    headingFont: "Nunito",
    primary: "#14532d",
    accent: "#fde68a",
    background: "#eef2ee",
    surface: "#ffffff",
    text: "#14201a",
    headerStyle: "sötétzöld tábla-fejléc krétafehér címmel, halvány kréta-vonalakkal",
    layoutHint: "fehér kártyák a táblás fejléc alatt, tábla-stílusú info-boxok, 2 oszlop nagy kijelzőn",
    prefix: "kr",
  },
];

function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

const SUBJECT_THEMES: Array<{ rx: RegExp; ids: string[] }> = [
  { rx: /t[öo]rt[ée]n|irodal|olvas|mese|vers|nyelvtan(?!.*(angol|n[ée]met))/i, ids: ["pergamen", "kreta"] },
  { rx: /informatik|program|k[óo]dol|fizik|robot|digit/i, ids: ["ur", "labor"] },
  { rx: /biol|term[ée]szet|k[öo]rnyezet|n[öo]v[ée]ny|[áa]llat|f[öo]ldrajz|v[íi]z/i, ids: ["erdo", "tenger"] },
  { rx: /matem|matek|sz[áa]m|t[öo]rt|geometr|m[ée]r[ée]s|k[ée]mia/i, ids: ["tenger", "labor"] },
  { rx: /angol|n[ée]met|francia|spanyol|olasz|english|deutsch|sz[óo]kincs|vocabulary/i, ids: ["naplemente", "tenger"] },
];

/**
 * Determinisztikus, de változatos téma-választás: ugyanaz a seed ugyanazt adja, más
 * téma mást. A tantárgy-kulcsszó és a korosztály szűkíti a jelölteket, a seed hash-e
 * választ közülük — így a kiadott tananyagok nem néznek ki egyformán.
 */
export function pickLessonTheme(seed: string, classroom: number, subjectHint = ""): LessonTheme {
  const text = `${seed} ${subjectHint}`;
  let candidates: string[] | null = null;
  for (const rule of SUBJECT_THEMES) {
    if (rule.rx.test(text)) {
      candidates = rule.ids;
      break;
    }
  }
  if (!candidates) {
    if (classroom >= 1 && classroom <= 3) candidates = ["cukorka", "naplemente", "erdo", "kreta"];
    else if (classroom === 0 || classroom >= 7) candidates = ["ur", "labor", "pergamen", "kreta", "tenger"];
    else candidates = LESSON_THEMES.map((t) => t.id);
  }
  if (classroom >= 1 && classroom <= 3 && !candidates.includes("cukorka")) {
    candidates = [...candidates, "cukorka"];
  }
  const idx = hashSeed(seed || "websuli") % candidates.length;
  const id = candidates[idx];
  return LESSON_THEMES.find((t) => t.id === id) ?? LESSON_THEMES[0];
}

export function lessonFontsLink(): string {
  return LESSON_FONT_CSS;
}

function ageBand(classroom: number): string {
  if (classroom === 0) return "0. (programozási alapismeretek) → 7–8. évfolyamos szint: pontos szaknyelv, ok-okozat, elvont fogalmak";
  if (classroom <= 2) return "1–2. évfolyam: rövid mondatok, egyszerű szavak, egy utasítás egyszerre, törzsszöveg min. 20px";
  if (classroom <= 4) return "3–4. évfolyam: rövid magyarázatok, szemléletes példák, önálló próbálkozás, törzsszöveg min. 18px";
  if (classroom <= 6) return "5–6. évfolyam: analógiák, hétköznapi alkalmazás, jól elkülönített lépések";
  return "7–8. (és felsőbb) évfolyam: összetettebb gondolatok, ok-okozat, elvont fogalmak";
}

/** A kiválasztott téma promptba illő leírása (a modell ettől indokolt esetben eltérhet). */
export function lessonThemePrompt(theme: LessonTheme, classroom: number): string {
  const pair = lessonFontPair(classroom, theme.headingFont === "Source Serif 4" ? "irodalom" : "");
  const body = `'${pair.body}',sans-serif`;
  const heading = `'${pair.heading}',${pair.heading === "Source Serif 4" ? "serif" : "sans-serif"}`;
  return [
    "## MEGJELENÍTÉSI TÉMA (ehhez a tananyaghoz kiválasztva — kövesd, hogy a tananyagok változatosak legyenek)",
    `- Téma: **${theme.name}** (${theme.mood}). CSS prefix: \`${theme.prefix}-\` (ha ütközne, válts 2–3 betűs másikra).`,
    `- Paletta: --primary ${theme.primary}; --accent ${theme.accent}; --bg ${theme.background}; --surface ${theme.surface}; --text ${theme.text}; --success #00b894; --error #e17055. Kontraszt min. 4.5:1.`,
    `- Fejléc: ${theme.headerStyle.replace(/Source Serif 4/g, pair.heading)}.`,
    `- Elrendezés: ${theme.layoutHint}.`,
    `- Helyi betűk (PONTOSAN így): <link href="${lessonFontsLink()}" rel="stylesheet">`,
    `- font-family törzs: ${body}`,
    `- font-family címsor: ${heading}`,
    `- Díszbetű helyett is a címsor betűjét használd: ${heading}. Az életkori betűválasztást a színtéma nem írhatja felül.`,
    `- Korosztály: ${ageBand(classroom)}.`,
    "- Ne másold a példa-HTML kinézetét: a téma szerinti saját fejléc, kártyastílus és gombforma készüljön.",
  ].join("\n");
}

/**
 * A Tananyag Készítő v7.4 követelményei — app-ra szabva. Referencia-kódok (kiértékelő
 * motor, TTS) a skillből, a közös pontozási szerződéshez igazított javításokkal.
 */
export const LESSON_HTML_SPEC_V74 = `# TANANYAG KÉSZÍTŐ v7.4 — KÖTELEZŐ SPECIFIKÁCIÓ

## BEMENET
- Téma + évfolyam + (ha van) forrásszöveg/kép/dokumentum: dolgozd fel TELJES mélységgel.
- Stílusutasítás nélkül: modern, bátorító, közvetlen hang. Célközönség (kor) szerint igazítsd a dizájnt és a szókincset.
- IDEGEN NYELVI LECKE (angol, német, francia, spanyol… — nyelvtan, szókincs vagy olvasás): a text-to-speech KÖTELEZŐ (lásd TTS), és az 1. oldalon külön SZÓSZEDET kell.

## 4 OLDALAS STRUKTÚRA (KÖTELEZŐ)
| Tab | Cím | Tartalom |
|-----|-----|----------|
| 1 | 📖 Tananyag | Részletes lexikális tudás (+ szószedet idegen nyelvnél) |
| 2 | 🧠 Módszerek | Bankcsomagonként két releváns, különböző interakció |
| 3 | ✏️ Feladatok | Fogalomfedő bank, korosztályhoz illő rövid kör |
| 4 | 🎯 Kvíz | Felidézés és alkalmazás minden fogalomhoz; 3–4 válasz |

## OLDAL 1 – TANANYAG
- Folyamatos, érthetően tagolt szöveg — NEM vázlat. Teljes anyag fejezetekre bontva; definíciók, példák, felsorolások, összefoglalók.
- Korosztály: 1–2. évf. egy rövid utasítás egyszerre; 3–4. évf. szemléletes példák és önálló próbálkozás; 5–6. évf. analógiák, hétköznapi alkalmazás; 7–8. évf. ok-okozat, elvont fogalmak. 1–4. évf. Nunito; később Source Sans 3 törzs, irodalmi/történelmi címsorhoz Source Serif 4.
- Info-boxok (érdekesség, figyelem, összefoglalás). Vizuális kártyák SZÖVEGES tartalommal (NEM emoji állatképek). Legalább 1 ciklus-diagram / folyamatábra / kártyasor CSS-ből vagy inline SVG-ből.
- Fejezetek KÁRTYÁKON, alapból lapozható könyvként, külön teljes áttekintéssel. A fejezet tanítása látható, a releváns kiegészítő módszer külön megnyitható. Minden fejezet végén mini-összefoglaló box.
- Az 1. oldal végén „Források" blokk a felhasznált URL-ekkel (ha voltak).
- Idegen nyelvnél SZÓSZEDET: idegen szó + magyar jelentés + szófaj + példamondat (idegen + magyar), MINDEN idegen elem mellett 🔊 TTS gomb.

## OLDAL 2 – MÓDSZEREK (ebből válassz a témához, mobilon érintéssel használható)
| Komponens | Leírás |
|-----------|--------|
| prediction-box | „Szerinted mi fog történni, ha…?" – a tanuló beír, majd megmutatja a valós választ |
| gate-question | Kapukérdés: helyes válasz után mutatja a kapcsolódó módszert; a tananyaghoz való hozzáférést nem zárja el |
| myth-box | Igaz/hamis tévhit, magyarázattal |
| dragdrop-box | Húzd a helyére – touch + mouse event, ujjkövető „ghost" elem, célzóna-kiemelés |
| cause-effect | Ok→hatás lánc, kattintható lépésekkel |
| conflict-box | Meglepő tény vagy paradoxon |
| self-check | Önértékelő csúszka (1–5) visszajelzéssel |
| popup-trigger | Kattintásra/érintésre felugró kérdés, bezáró gombbal |
| timeline | Folyamat vagy idősor interaktívan |
| analogy-box | Korosztályhoz illő hasonlat, ami az új fogalmat a meglévő tudáshoz köti |
- dragdrop: touchstart/touchmove/touchend + mousedown/mousemove/mouseup; touchmove-ban preventDefault() ({ passive:false }); touchend: document.elementFromPoint a célzónához; element.style.touchAction='none'.
- Minden kattintható elem min. 44×44 px. Popup-ok ne takarják egymást.

## OLDAL 3 – SZÖVEGES FELADATOK
- KIZÁRÓLAG az 1. oldal tartalmából képzett, nyílt végű kérdések, textarea inputtal. A bank és rövid kör méretét a közös bankPlan szerződés adja.
- KIÉRTÉKELÉS: HÁROMRÉTEGŰ MOTOR (kötelező, a lapos kulcsszó-egyezés TILOS). Minden feladat OBJEKTUM:
\`\`\`javascript
{
  q:            "A kérdés szövege (magyar, ékezetes a megjelenítéshez).",
  required:     [ ["szinonima", "szinonima"],   // 1. KÖTELEZŐ fogalom (egyenértékű megfogalmazások)
                  ["szinonima", "szinonima"] ],  // 2. KÖTELEZŐ fogalom
  bonus:        [ ["szinonima"] ],               // JUTALOM fogalmak (példák, extrák) — csak színez
  minWords:     3,           // minimális szószám (minőségi kapu)
  needsSentence: true,       // true, ha magyarázó/mondatszerű válasz kell; fordításnál/felsorolásnál false
  sample:       "Valódi, követendő mintaválasz, ami a 🟡/❌ eseteknél megjelenik."
}
\`\`\`
- Egy \`required\` fogalom akkor teljesül, ha BÁRMELYIK szinonimája előfordul; többszavas kifejezésnél minden szó szükséges. Legalább egy required csoport mindig kell. A bonus önmagában nem ad teljes pontot.
- A motor három rétege: (1) fogalmi illesztés szinonimákkal; (2) hosszú szavaknál korlátozott elírástűrés és magyar tövezés; szám, rövid szó és tagadás nem javítható más válasszá; (3) minimális szószám, koherencia és váratlan tagadás vizsgálata. Ez gyakorló visszajelzés, nem teljes jelentéselemzés vagy hivatalos osztályzat.
- HÁROMÁLLAPOTÚ KIMENET: ✅ Elfogadva (1 pont): minden kötelező fogalom + koherens; 🟡 Részben jó (0.5): a kötelezők fele megvan VAGY minden megvan, de szólista-szerű → „📖 Mintaválasz megnézése" gomb; ❌ Hiányos (0): túl rövid vagy túl kevés kötelező fogalom. A fél pontok beszámítanak.
- A MOTOR REFERENCIA-IMPLEMENTÁCIÓJA (ES5, az IIFE-be ágyazva, EZT építsd be — ne rögtönözz mást):
\`\`\`javascript
function ee_norm(s){
  s = (s||'').toLocaleLowerCase('hu').normalize('NFD').replace(/\\p{M}/gu,'')
    .replace(/(\\d)[,.](?=\\d)/g,'$1.').replace(/\\u2212/g,'-');
  return (s.match(/[+-]?\\d+(?:\\.\\d+)?|[\\p{L}]+/gu)||[]).map(function(t){return t.replace(/^\\+(?=\\d)/,'');}).join(' ');
}
function ee_stem(w){
  var suf = ['juk','unk','ban','ben','bol','rol','tol','nak','nek',
             'val','vel','hoz','hez','uk','ja','je','ra','re','ba','be','ot','et','at',
             'ok','ek','k','t','n'];
  var i;
  for(i=0;i<suf.length;i++){
    var s = suf[i];
    if(w.length > s.length + 3 && w.slice(-s.length) === s){ return w.slice(0, w.length - s.length); }
  }
  return w;
}
function ee_lev(a, b){
  var m=a.length, n=b.length, i, j;
  if(m===0) return n; if(n===0) return m;
  var prev=[], cur=[];
  for(j=0;j<=n;j++){ prev[j]=j; }
  for(i=1;i<=m;i++){
    cur[0]=i;
    for(j=1;j<=n;j++){
      var cost = (a.charAt(i-1)===b.charAt(j-1))?0:1;
      cur[j]=Math.min(prev[j]+1, cur[j-1]+1, prev[j-1]+cost);
    }
    for(j=0;j<=n;j++){ prev[j]=cur[j]; }
  }
  return prev[n];
}
function ee_tol(len){ return len>8?2:1; }
function ee_wordHit(answerTokens, answerStems, word){
  var p = ee_norm(word); var ps = ee_stem(p); var t;
  for(t=0;t<answerTokens.length;t++){
    var tok = answerTokens[t];
    if(tok === p) return true;
    if(/\\d/.test(tok+p) || ['nem','ne','not','no'].indexOf(p)!==-1) continue;
    if(Math.min(tok.length,p.length)>=4 && (answerStems[t]===p || tok===ps || answerStems[t]===ps)) return true;
    if(Math.min(tok.length,p.length)<5) continue;
    if(ee_lev(tok, p) <= ee_tol(Math.max(tok.length, p.length))) return true;
  }
  return false;
}
function ee_phraseHit(answerNorm, answerTokens, answerStems, phrase){
  var p = ee_norm(phrase); var parts = p.split(' ');
  if(parts.length === 1){ return ee_wordHit(answerTokens, answerStems, parts[0]); }
  var i;
  for(i=0;i<parts.length;i++){
    if(!ee_wordHit(answerTokens, answerStems, parts[i])) return false;
  }
  return true;
}
function ee_conceptHit(answerNorm, answerTokens, answerStems, concept){
  var i;
  for(i=0;i<concept.length;i++){
    if(ee_phraseHit(answerNorm, answerTokens, answerStems, concept[i])) return true;
  }
  return false;
}
function ee_evaluate(answer, task){
  var norm = ee_norm(answer);
  var tokens = norm ? norm.split(' ').slice(0,500) : [];
  var stems = []; var i;
  for(i=0;i<tokens.length;i++){ stems[i]=ee_stem(tokens[i]); }
  var wordCount = tokens.length;
  var minW = task.minWords || 1;
  var req = task.required || []; var bon = task.bonus || [];
  var hitReq = 0, hitBonus = 0;
  for(i=0;i<req.length;i++){ if(ee_conceptHit(norm,tokens,stems,req[i])) hitReq++; }
  for(i=0;i<bon.length;i++){ if(ee_conceptHit(norm,tokens,stems,bon[i])) hitBonus++; }
  var totalReq = req.length;
  if(wordCount < minW){
    return {state:'fail', score:0, hitReq:hitReq, totalReq:totalReq, hitBonus:hitBonus, reason:'A válasz még túl rövid.'};
  }
  if(totalReq === 0){
    return {state:'fail', score:0, reason:'Hiányzó értékelési feltétel.'};
  }
  var ratio = hitReq / totalReq;
  var FUNC = [' mert ',' es ',' olyan ',' ami ',' amit ',' azt ',' hogy ',
              ' lehet ',' tudom ',' tudjuk ',' mint ',' ezert ',' igy ',' mivel ',' tehat ',' ha ',' akkor ',' vagyis ',' mig ',' az ',' because ',' and ',
              ' is ',' are ',' there ',' have ',' has ',' do ',' does ',' a ',' an ',' the ',
              ' some ',' any ',' how ',' much ',' many ',' of ',' on ',' in '];
  var padded = ' ' + norm + ' '; var hasFunc = false, f;
  var sampleWords = ee_norm(task.sample).split(' ');
  var unexpectedNegation = (tokens.indexOf('nem')!==-1 || tokens.indexOf('not')!==-1)
    && sampleWords.indexOf('nem')===-1 && sampleWords.indexOf('not')===-1;
  for(f=0;f<FUNC.length;f++){ if(padded.indexOf(FUNC[f]) !== -1){ hasFunc=true; break; } }
  var allConcepts = [];
  for(i=0;i<req.length;i++){ allConcepts = allConcepts.concat(req[i]); }
  for(i=0;i<bon.length;i++){ allConcepts = allConcepts.concat(bon[i]); }
  var hasOwnWord = false;
  for(i=0;i<tokens.length;i++){
    if(tokens[i].length < 4) continue;
    if(!ee_conceptHit(' '+tokens[i]+' ', [tokens[i]], [stems[i]], allConcepts)){ hasOwnWord = true; break; }
  }
  if(ratio >= 1){
    if((task.needsSentence && !(hasFunc && hasOwnWord)) || unexpectedNegation){
      return {state:'partial', score:0.5, hitReq:hitReq, totalReq:totalReq, hitBonus:hitBonus,
              reason:unexpectedNegation?'A tagadás eltér a mintaválasztól.':'A fogalmak megvannak, de összefüggő mondat szükséges.'};
    }
    return {state:'ok', score:1, hitReq:hitReq, totalReq:totalReq, hitBonus:hitBonus, reason:'Minden kötelező fogalom megvan.'};
  }
  if(ratio >= 0.5){
    return {state:'partial', score:0.5, hitReq:hitReq, totalReq:totalReq, hitBonus:hitBonus, reason:'A kötelező fogalmak egy része még hiányzik.'};
  }
  return {state:'fail', score:0, hitReq:hitReq, totalReq:totalReq, hitBonus:hitBonus, reason:'A lényegi fogalmak még hiányoznak.'};
}
\`\`\`
- UI a 3. oldalon: TETEJÉN 🔄 Újragenerálás (új, bankPlan szerinti kör) konfirmációs HTML modallal; ALJÁN ✅ Kiértékelés; feladatonként ✅/🟡/❌ + indok + „📖 Mintaválasz" gomb a 🟡/❌ eseteknél; eredmény az oldalon (NEM alert); osztályzat 90%=5 Jeles, 75%=4 Jó, 60%=3 Közepes, 40%=2 Elégséges, <40%=1 Elégtelen; JSON eredmény-export (Blob + createObjectURL, addEventListener), localStorage név/e-mail mentés, mailto link.
- ÖNTESZT (kötelező, a build részeként gondold végig): minden feladat \`sample\` mintaválasza a SAJÁT feladatára ✅-t adjon; üres válasz mindenhol ❌.

## OLDAL 4 – KVÍZ
- Fogalomfedő bank; körméret a bankPlan.quizRound szerint; 3 vagy 4 válasz. A közös JSON-adatszerződés mezőneveit használd.
- Azonnali helyes/helytelen visszajelzés; pontszám = helyes/körméret×100 %; ugyanaz az osztályzási skála.
- TETEJÉN 🔄 Újragenerálás (konfirmációs modallal), ALJÁN ✅ Kiértékelés; eredmény az oldalon.

## TEXT-TO-SPEECH (IDEGEN NYELVI LECKÉNÉL KÖTELEZŐ)
- Web Speech API (SpeechSynthesis), külső függőség nélkül; a nyelvhez illő \`lang\` (angol en-GB/en-US, német de-DE…).
- MINDEN idegen szó/kifejezés/példamondat mellett 🔊 gomb \`data-tts\` attribútummal; csak az IDEGEN szöveget olvassa (a magyar fordítást nem); állítható sebesség, gyerekeknél 0.85 alapérték; gombok min. 44px.
\`\`\`javascript
var ttsRate = 0.85;
function speak(text, lang){
  if(!('speechSynthesis' in window)){ return; }
  window.speechSynthesis.cancel();
  var u = new SpeechSynthesisUtterance(text);
  u.lang = lang || 'en-GB';
  u.rate = ttsRate;
  u.pitch = 1.1;
  var voices = window.speechSynthesis.getVoices(); var k;
  for(k=0;k<voices.length;k++){ if(voices[k].lang === u.lang){ u.voice = voices[k]; break; } }
  window.speechSynthesis.speak(u);
}
/* minden [data-tts] elemre addEventListener('click', ...) -> speak(el.getAttribute('data-tts')) */
\`\`\`
HTML: <span class="[prefix]-en" data-tts="apple">apple</span> <button class="[prefix]-tts-btn" data-tts="apple">🔊</button>

## SPEECH-TO-TEXT / DIKTÁLÁS (OPCIONÁLIS, AJÁNLOTT a 3. oldalon)
- SpeechRecognition / webkitSpeechRecognition, \`hu-HU\`. Feature-detektálás: ha nincs, a 🎤 gomb NE jelenjen meg (soha „halott" gomb).
- \`recognition.start()\` KÖZVETLENÜL a kattintás-handlerben (NE getUserMedia().then() callbackben — elveszik a user activation, not-allowed lesz).
- \`onend\` ne írja felül a hibaüzenetet (hadError flag). \`window.isSecureContext\` ellenőrzés.
- Iframe-ben (window.self !== window.top) figyelmeztetés + „Megnyitás saját ablakban" gomb; not-allowed esetén a valódi okot (beágyazás) magyarázd.
- Aktív felismerés leállítása fülváltáskor és új feladatok generálásakor.

## MAGYAR ÉKEZETEK ÉS BETŰTÍPUSOK — ELLENŐRZÖTT HELYI KÉSZLET
${LESSON_TYPOGRAPHY_CONTRACT}
${HTML_INTERACTION_CONTRACT}
A <head> elején: <meta charset="utf-8"> és <meta http-equiv="Content-Type" content="text/html; charset=utf-8">; <html lang="hu">.

## TECHNIKAI KÖVETELMÉNYEK
- EGYETLEN önálló HTML (CSS + JS beágyazva); betűk kizárólag a helyi /fonts/lesson-fonts.css hivatkozásból. Google Fonts link tilos.
- IIFE wrapper: (function(){ 'use strict'; ... })(); az onclick-ből hívott függvények window-ra exportálva (window.PREFIX_showTab = function(id){...}).
- ES5-kompatibilis JS (var, hagyományos függvények, nincs arrow function / template literal a kritikus utakon).
- CSS prefix minden osztálynéven, kivétel nélkül. Reset: * { box-sizing:border-box; margin:0; padding:0 }.
- Reszponzív 320–2560px: clamp() betűméret, @media 480px és 1400px, 0 vízszintes túlcsordulás. Sticky tab-nav (position:sticky; top:0; z-index:100), min. 44px magas gombok.
- TILOS: alert()/confirm()/prompt() (csak HTML modal, callback-mintával); inline JSON onclick-ben (globális változó + addEventListener); rejtett kötelező tanítás; smart/tipográfiai idézőjel („") és cirill karakter a JS-ben; emoji-képkártya tartalomként.
- Konfirmációs HTML modal minden kiértékelés és újragenerálás előtt.

## KIMENET-TAKARÉKOSSÁG (a teljes anyag egy válaszban elférjen)
- A kódban NE írj kommenteket és üres sorokat; a CSS tömör (egy szabály egy sor); a feladat- és kvízbank egy objektum egy sor.
- Feladat: \`q\` max. 120 karakter, \`required\` fogalmanként 2–4 szinonima, \`sample\` 1 tömör mondat. Kvíz: rövid kérdés, 3 rövid válasz.
- A forrásfedettség és a bankPlan szerinti méret kötelező; nem készül általános 45/75-ös bank. A témához illő két módszer fontosabb, mint mind a tíz mechanikus használata.

## MENNYISÉGEK
| Típus | Generált | Megjelenített |
|-------|----------|---------------|
| Szöveges feladat | bankPlan szerinti, minden fogalomhoz | bankPlan.taskRound, teljes áttekintéssel |
| Kvízkérdés | fogalmanként két különböző célú | bankPlan.quizRound, teljes áttekintéssel |
| Kognitív elem | csomagonként két különböző | fejezethez kötve és külön a 2. lapon |

## ÖNELLENŐRZÉS A HTML LEZÁRÁSA ELŐTT
- 4 oldal, témához illő kognitív elemek, dragdrop touch + ujjkövetés, feladatok az 1. oldalból, háromrétegű motor + háromállapotú kimenet + mintaválasz gomb, Újragenerálás TETEJÉN / Kiértékelés ALJÁN, fél pontok, fogalomfedő kvízbank és bankPlan szerinti kör.
- Nincs alert/confirm/prompt, a tanítás teljes áttekintése elérhető, minden interaktív elem 44px, prefix mindenhol, IIFE + 'use strict'.
- Kizárólag a három engedélyezett, helyben kiszolgált font, UTF-8 és lang="hu"; tényleges ő/Ő/ű/Ű renderpróba.
- A dokumentum <!DOCTYPE html>-lel kezdődik és </html>-lel zárul, a <script> blokkok lezártak.`;

export type LessonSpecPromptOptions = {
  classroom: number;
  /** Téma-seed: cím + téma/üzenet — ugyanaz a seed ugyanazt a kinézetet adja. */
  seed: string;
  subjectHint?: string;
  theme?: LessonTheme;
};

/** A teljes spec + a kiválasztott téma egy blokkban, a hívó preambuluma UTÁN fűzendő. */
export function lessonHtmlSpecPrompt(opts: LessonSpecPromptOptions): string {
  const theme = opts.theme ?? pickLessonTheme(opts.seed, opts.classroom, opts.subjectHint);
  return `${lessonThemePrompt(theme, opts.classroom)}\n\n${LESSON_HTML_SPEC_V74}\n\n${LESSON_METHOD_CONTRACT}\n\n${HTML_LESSON_DATA_CONTRACT}`;
}
