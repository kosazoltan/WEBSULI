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

/** Betűpár és paletta — Google Fonts, KÖTELEZŐ latin-ext alkészlettel. */
export type LessonTheme = {
  id: string;
  name: string;
  mood: string;
  bodyFont: string;
  headingFont: string;
  displayFont?: string;
  /** Google Fonts `family=` paraméterek (a css2 URL-hez). */
  fontsQuery: string;
  primary: string;
  accent: string;
  background: string;
  surface: string;
  text: string;
  headerStyle: string;
  layoutHint: string;
  prefix: string;
};

const FALLBACK_SANS = "'Noto Sans',Roboto,'Droid Sans','DejaVu Sans',Arial,sans-serif";
const FALLBACK_SERIF = "'Noto Serif',Roboto,Georgia,'DejaVu Serif',serif";

export const LESSON_THEMES: readonly LessonTheme[] = [
  {
    id: "tenger",
    name: "Tenger",
    mood: "nyugodt, tiszta, matematikához és természettudományhoz",
    bodyFont: "Nunito",
    headingFont: "Poppins",
    fontsQuery: "family=Nunito:wght@400;600;700;800&family=Poppins:wght@600;700;800",
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
    headingFont: "Quicksand",
    fontsQuery: "family=Nunito:wght@400;600;700&family=Quicksand:wght@600;700",
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
    headingFont: "Poppins",
    fontsQuery: "family=Nunito:wght@400;600;700;800&family=Poppins:wght@600;700;800",
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
    headingFont: "Cinzel",
    displayFont: "Noto Serif",
    fontsQuery: "family=Nunito:wght@400;600;700&family=Cinzel:wght@600;700&family=Noto+Serif:wght@400;700",
    primary: "#7a2e2e",
    accent: "#c9a227",
    background: "#f8f3e7",
    surface: "#fffdf7",
    text: "#2b1d12",
    headerStyle: "pergamen-színű fejléc, díszbetűs (Cinzel) cím, arany vonallal",
    layoutHint: "időszalag függőleges vonallal, idézet-boxok, fejezetek kártyákon sorszámozott medalionnal",
    prefix: "pg",
  },
  {
    id: "ur",
    name: "Űr",
    mood: "modern, technológiai, informatikához / fizikához / felső tagozathoz",
    bodyFont: "Inter",
    headingFont: "Orbitron",
    fontsQuery: "family=Inter:wght@400;600;700&family=Orbitron:wght@600;700",
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
    bodyFont: "Quicksand",
    headingFont: "Baloo 2",
    fontsQuery: "family=Quicksand:wght@500;600;700&family=Baloo+2:wght@600;700;800",
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
    bodyFont: "Roboto",
    headingFont: "Montserrat",
    fontsQuery: "family=Roboto:wght@400;500;700&family=Montserrat:wght@600;700;800",
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
    headingFont: "Poppins",
    fontsQuery: "family=Nunito:wght@400;600;700&family=Poppins:wght@600;700",
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

export function googleFontsLink(theme: LessonTheme): string {
  return `https://fonts.googleapis.com/css2?${theme.fontsQuery}&subset=latin,latin-ext&display=swap`;
}

function ageBand(classroom: number): string {
  if (classroom === 0) return "0. (programozási alapismeretek) → 7–8. évfolyamos szint: pontos szaknyelv, ok-okozat, elvont fogalmak";
  if (classroom <= 3) return "1–3. évfolyam: rövid mondatok, egyszerű szavak, sok vizuális elem, törzsszöveg min. 18px";
  if (classroom <= 6) return "4–6. évfolyam: közepes mondatok, analógiák, hétköznapi példák";
  return "7–8. (és felsőbb) évfolyam: összetettebb gondolatok, ok-okozat, elvont fogalmak";
}

/** A kiválasztott téma promptba illő leírása (a modell ettől indokolt esetben eltérhet). */
export function lessonThemePrompt(theme: LessonTheme, classroom: number): string {
  const body = `'${theme.bodyFont}',${FALLBACK_SANS}`;
  const heading = `'${theme.headingFont}',${FALLBACK_SANS}`;
  const display = theme.displayFont ? `'${theme.displayFont}',${FALLBACK_SERIF}` : heading;
  return [
    "## MEGJELENÍTÉSI TÉMA (ehhez a tananyaghoz kiválasztva — kövesd, hogy a tananyagok változatosak legyenek)",
    `- Téma: **${theme.name}** (${theme.mood}). CSS prefix: \`${theme.prefix}-\` (ha ütközne, válts 2–3 betűs másikra).`,
    `- Paletta: --primary ${theme.primary}; --accent ${theme.accent}; --bg ${theme.background}; --surface ${theme.surface}; --text ${theme.text}; --success #00b894; --error #e17055. Kontraszt min. 4.5:1.`,
    `- Fejléc: ${theme.headerStyle}.`,
    `- Elrendezés: ${theme.layoutHint}.`,
    `- Google Fonts link (PONTOSAN így, a latin-ext kötelező): <link href="${googleFontsLink(theme)}" rel="stylesheet">`,
    `- font-family törzs: ${body}`,
    `- font-family címsor: ${heading}`,
    `- font-family díszbetű: ${display}`,
    `- Korosztály: ${ageBand(classroom)}.`,
    "- Ne másold a példa-HTML kinézetét: a téma szerinti saját fejléc, kártyastílus és gombforma készüljön.",
  ].join("\n");
}

/**
 * A Tananyag Készítő v7.4 követelményei — app-ra szabva. Referencia-kódok (kiértékelő
 * motor, TTS) szó szerint a skillből, hogy a modell azokat építse be, ne rögtönözzön.
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
| 2 | 🧠 Módszerek | Min. 10 kognitív aktivációs elem (MIND a 10 típus) |
| 3 | ✏️ Feladatok | 45 feladatból 15 véletlenszerű |
| 4 | 🎯 Kvíz | 75 kérdésből 25 véletlenszerű, 3 válasz (A/B/C) |

## OLDAL 1 – TANANYAG
- Folyamatos, érthetően tagolt szöveg — NEM vázlat. Teljes anyag fejezetekre bontva; definíciók, példák, felsorolások, összefoglalók.
- Korosztály: 1–3. évf. rövid mondatok, egyszerű szavak, sok vizuális elem; 4–6. évf. közepes mondatok, analógiák, hétköznapi példák; 7–8. évf. összetettebb gondolatok, ok-okozat, elvont fogalmak.
- Info-boxok (érdekesség, figyelem, összefoglalás). Vizuális kártyák SZÖVEGES tartalommal (NEM emoji állatképek). Legalább 1 ciklus-diagram / folyamatábra / kártyasor CSS-ből vagy inline SVG-ből.
- Fejezetek KÁRTYÁKON (TILOS accordion / <details> / collapsible — minden tartalom mindig látszódjon). Minden fejezet végén mini-összefoglaló box.
- Az 1. oldal végén „Források" blokk a felhasznált URL-ekkel (ha voltak).
- Idegen nyelvnél SZÓSZEDET: idegen szó + magyar jelentés + szófaj + példamondat (idegen + magyar), MINDEN idegen elem mellett 🔊 TTS gomb.

## OLDAL 2 – MÓDSZEREK (mind a 10 szerepeljen, mobilon érintéssel használható)
| Komponens | Leírás |
|-----------|--------|
| prediction-box | „Szerinted mi fog történni, ha…?" – a tanuló beír, majd megmutatja a valós választ |
| gate-question | Kapukérdés (2–3 db): csak helyes válasz után mutatja a továbbit |
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
- KIZÁRÓLAG az 1. oldal tartalmából képzett, nyílt végű kérdések, textarea inputtal. 45 a bankban, 15 véletlenszerűen.
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
- Egy \`required\` fogalom akkor teljesül, ha BÁRMELYIK szinonimája előfordul; többszavas kifejezésnél minden szó valahol. Felsoroló feladatnál (\`írj 3 főnevet\`) a \`required\` üres, a helyes elemek \`bonus\`-ba mennek.
- A motor három rétege: (1) fogalmi illesztés szinonimákkal; (2) fuzzy egyezés — Levenshtein (rövid szó 0, közepes 1, hosszú 2 tűrés) + könnyű magyar tövezés + összetett szó résztring + ékezet-leszedés; (3) minőségi kapuk — minimális szószám és koherencia-kapu (needsSentence esetén kell egy kötőszó/funkciószó ÉS egy „saját" szó, ami egyik fogalomban sincs).
- HÁROMÁLLAPOTÚ KIMENET: ✅ Elfogadva (1 pont): minden kötelező fogalom + koherens; 🟡 Részben jó (0.5): a kötelezők fele megvan VAGY minden megvan, de szólista-szerű → „📖 Mintaválasz megnézése" gomb; ❌ Hiányos (0): túl rövid vagy túl kevés kötelező fogalom. A fél pontok beszámítanak.
- A MOTOR REFERENCIA-IMPLEMENTÁCIÓJA (ES5, az IIFE-be ágyazva, EZT építsd be — ne rögtönözz mást):
\`\`\`javascript
function ee_norm(s){
  s = (s||'').toLowerCase();
  s = s.replace(/[\\u00e1\\u00e0]/g,'a').replace(/[\\u00e9\\u00e8]/g,'e').replace(/\\u00ed/g,'i')
       .replace(/[\\u00f3\\u00f2\\u00f6\\u0151]/g,'o').replace(/[\\u00fa\\u00f9\\u00fc\\u0171]/g,'u');
  s = s.replace(/[.,!?;:"'()\\-\\/]/g,' ');
  s = s.replace(/\\s+/g,' ').replace(/^\\s+|\\s+$/g,'');
  return s;
}
function ee_stem(w){
  var suf = ['ban','ben','bol','bel','rol','rel','tol','tel','nak','nek',
             'val','vel','hoz','hez','ra','re','ba','be','ot','et','at',
             'ok','ek','k','t','n','i'];
  var i;
  for(i=0;i<suf.length;i++){
    var s = suf[i];
    if(w.length > s.length + 2 && w.slice(-s.length) === s){ return w.slice(0, w.length - s.length); }
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
function ee_tol(len){ if(len<=4) return 0; if(len<=7) return 1; return 2; }
function ee_wordHit(answerTokens, answerStems, word){
  var p = ee_norm(word); var ps = ee_stem(p); var t;
  for(t=0;t<answerTokens.length;t++){
    var tok = answerTokens[t];
    if(tok === p) return true;
    if(answerStems[t] === ps) return true;
    if(p.length >= 4 && tok.indexOf(p) !== -1) return true;
    if(p.length >= 4 && tok.length >= 4 && p.indexOf(tok) !== -1) return true;
    if(ee_lev(tok, p) <= ee_tol(Math.max(tok.length, p.length))) return true;
  }
  return false;
}
function ee_phraseHit(answerNorm, answerTokens, answerStems, phrase){
  var p = ee_norm(phrase); var parts = p.split(' ');
  if(parts.length === 1){ return ee_wordHit(answerTokens, answerStems, parts[0]); }
  var i;
  for(i=0;i<parts.length;i++){
    if(parts[i].length < 2) continue;
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
  var tokens = norm ? norm.split(' ') : [];
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
    return {state:'fail', score:0, hitReq:hitReq, totalReq:totalReq, hitBonus:hitBonus, reason:'tul rovid'};
  }
  if(totalReq === 0){
    var anyBonus = hitBonus > 0;
    return {state: anyBonus?'ok':'partial', score: anyBonus?1:0.5,
            hitReq:0, totalReq:0, hitBonus:hitBonus, reason:'bonusz-alapu'};
  }
  var ratio = hitReq / totalReq;
  var FUNC = [' mert ',' es ',' olyan ',' ami ',' amit ',' azt ',' hogy ',
              ' lehet ',' tudom ',' tudjuk ',' mint ',' ezert ',' igy ',' mivel ',' tehat ',
              ' is ',' are ',' there ',' have ',' has ',' do ',' does ',' a ',' an ',' the ',
              ' some ',' any ',' isn t ',' aren t ',' don t ',' how ',' much ',' many ',' of ',' on ',' in '];
  var padded = ' ' + norm + ' '; var hasFunc = false, f;
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
    if(task.needsSentence && !(hasFunc && hasOwnWord)){
      return {state:'partial', score:0.5, hitReq:hitReq, totalReq:totalReq, hitBonus:hitBonus,
              reason:'fogalmak megvannak, de inkabb szolista mint mondat'};
    }
    return {state:'ok', score:1, hitReq:hitReq, totalReq:totalReq, hitBonus:hitBonus, reason:'minden kotelezo fogalom megvan'};
  }
  if(ratio >= 0.5){
    return {state:'partial', score:0.5, hitReq:hitReq, totalReq:totalReq, hitBonus:hitBonus, reason:'kotelezo fogalmak resze hianyzik'};
  }
  return {state:'fail', score:0, hitReq:hitReq, totalReq:totalReq, hitBonus:hitBonus, reason:'tul keves kotelezo fogalom'};
}
\`\`\`
- UI a 3. oldalon: TETEJÉN 🔄 Újragenerálás (új 15 a 45-ből) konfirmációs HTML modallal; ALJÁN ✅ Kiértékelés; feladatonként ✅/🟡/❌ + indok + „📖 Mintaválasz" gomb a 🟡/❌ eseteknél; eredmény az oldalon (NEM alert); osztályzat 90%=5 Jeles, 75%=4 Jó, 60%=3 Közepes, 40%=2 Elégséges, <40%=1 Elégtelen; JSON eredmény-export (Blob + createObjectURL, addEventListener), localStorage név/e-mail mentés, mailto link.
- ÖNTESZT (kötelező, a build részeként gondold végig): minden feladat \`sample\` mintaválasza a SAJÁT feladatára ✅-t adjon; üres válasz mindenhol ❌.

## OLDAL 4 – KVÍZ
- 75 kérdés a bankban, 25 véletlenszerűen; 3 válasz (A/B/C) — NEM 4. Struktúra: { q:'...', opts:['A','B','C'], correct:0 }.
- Azonnali helyes/helytelen visszajelzés; pontszám = helyes/25×100 %; ugyanaz az osztályzási skála.
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

## MAGYAR ÉKEZETEK ÉS BETŰTÍPUSOK (ANDROID) — v7.4, KÖTELEZŐ, NÉGY RÉTEG
Az ő/Ő/ű/Ű a Google Fonts latin-ext alkészletében van; Android WebView enélkül ékezet nélkül mutatja őket, a \`system-ui\` kulcsszó pedig kiszámíthatatlan.
1. Google Fonts URL a <head>-ben \`&subset=latin,latin-ext&display=swap\` paraméterrel (a MEGJELENÍTÉSI TÉMA adja a pontos linket).
2. MINDEN font-family teljes fallback-lánccal: 'Betű','Noto Sans',Roboto,'Droid Sans','DejaVu Sans',Arial,sans-serif (díszbetűnél 'Noto Serif',Roboto,Georgia,'DejaVu Serif',serif). TILOS a \`system-ui\`, a \`Segoe UI\` és a csupasz \`sans-serif\` első fallbackként.
3. Glyph-warmup elem a <body> LEGELEJÉN, minden használt betűcsaládra külön sor:
\`\`\`html
<div class="[prefix]-gw" aria-hidden="true"><i class="[prefix]-gw1">ÁÉÍÓÖŐÚÜŰáéíóöőúüű</i><i class="[prefix]-gw2">ŐŰőűÖÜöü</i><i class="[prefix]-gw3">ŐŰőűÖÜöü</i></div>
\`\`\`
CSS: .[prefix]-gw{position:fixed;top:-300px;left:0;opacity:0;pointer-events:none;font-size:1px;line-height:1;user-select:none} .[prefix]-gw i{font-style:normal} és gw1/gw2/gw3 a törzs/címsor/díszbetű font-stackkel.
4. A <head> első két eleme: <meta charset="utf-8"> és <meta http-equiv="Content-Type" content="text/html; charset=utf-8">; <html lang="hu"> kötelező (idegen nyelvi elemeken lang="en" stb.).
- JS string-literálban \`\\uXXXX\` escape (\\u0151 = ő, \\u0171 = ű); kódazonosítók ASCII; a megjelenített HTML-szövegben valódi UTF-8 ékezet.

## TECHNIKAI KÖVETELMÉNYEK
- EGYETLEN önálló HTML (CSS + JS beágyazva); külső függőség CSAK a Google Fonts link.
- IIFE wrapper: (function(){ 'use strict'; ... })(); az onclick-ből hívott függvények window-ra exportálva (window.PREFIX_showTab = function(id){...}).
- ES5-kompatibilis JS (var, hagyományos függvények, nincs arrow function / template literal a kritikus utakon).
- CSS prefix minden osztálynéven, kivétel nélkül. Reset: * { box-sizing:border-box; margin:0; padding:0 }.
- Reszponzív 320–2560px: clamp() betűméret, @media 480px és 1400px, 0 vízszintes túlcsordulás. Sticky tab-nav (position:sticky; top:0; z-index:100), min. 44px magas gombok.
- TILOS: alert()/confirm()/prompt() (csak HTML modal, callback-mintával); inline JSON onclick-ben (globális változó + addEventListener); accordion/<details>; smart/tipográfiai idézőjel („") és cirill karakter a JS-ben; emoji-képkártya tartalomként.
- Konfirmációs HTML modal minden kiértékelés és újragenerálás előtt.

## KIMENET-TAKARÉKOSSÁG (a teljes anyag egy válaszban elférjen)
- A kódban NE írj kommenteket és üres sorokat; a CSS tömör (egy szabály egy sor); a feladat- és kvízbank egy objektum egy sor.
- Feladat: \`q\` max. 120 karakter, \`required\` fogalmanként 2–4 szinonima, \`sample\` 1 tömör mondat. Kvíz: rövid kérdés, 3 rövid válasz.
- A 45/75-ös bank és mind a 10 kognitív elem KÖTELEZŐ — a takarékosság a szövegezésen és a kódon spórol, nem a mennyiségen.

## MENNYISÉGEK
| Típus | Generált | Megjelenített |
|-------|----------|---------------|
| Szöveges feladat | 45 | 15 (véletlenszerű) |
| Kvízkérdés | 75 | 25 (véletlenszerű) |
| Kognitív elem | min. 10 | mind (2. oldalon) |

## ÖNELLENŐRZÉS A HTML LEZÁRÁSA ELŐTT
- 4 oldal, mind a 10 kognitív elem, dragdrop touch + ujjkövetés, feladatok az 1. oldalból, háromrétegű motor + háromállapotú kimenet + mintaválasz gomb, Újragenerálás TETEJÉN / Kiértékelés ALJÁN, fél pontok, kvíz 25/75 A-B-C.
- Nincs alert/confirm/prompt, nincs accordion, minden interaktív elem 44px, prefix mindenhol, IIFE + 'use strict'.
- Google Fonts latin-ext, teljes fallback-láncok, system-ui sehol, glyph-warmup a body elején, charset meták, lang="hu".
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
  return `${lessonThemePrompt(theme, opts.classroom)}\n\n${LESSON_HTML_SPEC_V74}`;
}
