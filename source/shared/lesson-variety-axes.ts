/**
 * V1 (docs/specs/2026-11-24-valtozatossag-12-tengely-vegrehajtas.md): a változatosság további tengelyei — témakontextus a példákban (6),
 * szöveges összefoglaló formák (8), fejezethossz-sáv (10) és a sorozatszabály (két egymás utáni lecke ugyanabban a tantárgy–évfolyam
 * sorozatban nem kap azonos kiosztást). A kiosztás determinisztikus (a térkép azonosítójából számolt mag). DOM-mentes, környezetet nem olvas.
 */
import { seedFrom, seededPick } from "./seeded";
import { OPENING_FORMS, openingFormGroup } from "./lesson-opener";

export type AxisOption = { id: string; label: string; description: string };

export const EXAMPLE_THEMES: readonly AxisOption[] = [
  { id: "sport", label: "Sport", description: "edzés, verseny, csapatjáték, eredmények, pálya" },
  { id: "urkutatas", label: "Űrkutatás", description: "űrhajó, bolygók, űrállomás, küldetés, csillagászat" },
  { id: "allatok", label: "Állatok", description: "háziállatok, állatkert, erdő, tenger élővilága, állatgondozás" },
  { id: "jatek", label: "Játék", description: "társasjáték, videojáték, kirakó, kincskeresés, pontszámok" },
  { id: "fozes", label: "Főzés", description: "recept, hozzávalók, adagolás, konyhai mérés, sütés" },
  { id: "utazas", label: "Utazás", description: "kirándulás, térkép, menetrend, útvonal, szállás" },
];

export const RECAP_FORMS: readonly AxisOption[] = [
  { id: "gondolatterkep", label: "Gondolattérkép", description: "a középső fogalomból ágak: minden pont egy ág (fogalom → kapcsolódó tudás), a kapcsolatot a pont szövege mondja ki" },
  { id: "3-2-1", label: "3–2–1", description: "3 dolog, amit megtanultál; 2 érdekesség vagy kapcsolat; 1 kérdés, amin érdemes továbbgondolkodni" },
  { id: "tanitsd-meg", label: "Tanítsd meg a barátodnak!", description: "a pontok úgy szólnak, mintha a tanuló egy barátjának magyarázná el a leckét, egyszerű szavakkal, egy-egy példával" },
  // V3b: villámkártyás összefoglaló.
  { id: "villamkartya", label: "Villámkártyák", description: "a záró recap ELŐTT, az utolsó fejezetben egy try blokk tryKind=flashcards, spec {\"cards\":[{\"front\":\"fogalom / kérdés\",\"back\":\"válasz\"}]} a lecke 4–8 kulcsfogalmával; a recap pontjai ezután röviden összegeznek" },
];

/**
 * V3b: kártyaforma-tengely — a lecke egy NEM első fejezetébe kerülő kártya (try keret, V3a megjelenítő). A `spec` a szerzőnek adott pontos alak.
 */
export type CardForm = AxisOption & { spec: string };
export const CARD_FORMS: readonly CardForm[] = [
  { id: "flipCard", label: "Fordítókártya", description: "elöl kérdés vagy fogalom, hátul a rövid válasz — gyors önellenőrzés", spec: '{"front":"kérdés / fogalom","back":"rövid válasz"}' },
  { id: "stepReveal", label: "Lépésenkénti felfedés", description: "egy eljárás vagy megoldás 2–8 lépése, egyenként felfedve", spec: '{"title":"Így oldd meg","steps":["1. lépés","2. lépés"]}' },
  { id: "didYouKnow", label: "Tudtad?", description: "egy meglepő, a fejezethez kapcsolódó, a forrásból / a tanításból következő tény", spec: '{"fact":"a tény egy-két mondatban"}' },
  { id: "decision", label: "Döntés és következmény", description: "élethelyzet 2–4 lehetőséggel, mindegyik következménnyel, pontosan egy legjobb", spec: '{"situation":"helyzet","options":[{"text":"lehetőség","consequence":"mi történik","best":true},{"text":"másik","consequence":"mi történik","best":false}]}' },
];
export const cardFormById = (id: unknown) => CARD_FORMS.find((c) => c.id === id);

/** V5b: szójáték-tengely (csak nyelvi leckénél) — V5a megjelenítő. */
export const WORD_GAMES = ["wordSearch", "crossword"] as const;
export type WordGame = (typeof WORD_GAMES)[number];
export const wordGameById = (id: unknown): WordGame | undefined => (WORD_GAMES as readonly unknown[]).includes(id) ? (id as WordGame) : undefined;
const WORD_GAME_SPEC: Record<WordGame, { label: string; spec: string }> = {
  wordSearch: { label: "szókereső", spec: '{"words":["szó1","szó2","szó3"]} (3–10 szó, 3–12 betű, szóköz nélkül)' },
  crossword: { label: "keresztrejtvény", spec: '{"entries":[{"answer":"szó","clue":"meghatározás"}]} (3–10 bejegyzés, a megfejtés 2–15 betű, szóköz nélkül)' },
};

export type LengthBand = "rövid" | "közepes" | "hosszabb";
const BANDS: readonly LengthBand[] = ["rövid", "közepes", "hosszabb"];
const BAND_WEIGHT: Record<LengthBand, number> = { rövid: 0.7, közepes: 1, hosszabb: 1.3 };

/** Fejezetenkénti hosszsáv: determinisztikus; ≥ 2 fejezetnél nem egyforma (ritmusváltás). */
export function lengthBands(seed: number, sections: number): LengthBand[] {
  const out = Array.from({ length: Math.max(0, sections) }, (_, i) => seededPick(BANDS, seedFrom(`hossz\u0001${seed}\u0001${i}`))!);
  if (out.length >= 2 && new Set(out).size === 1) out[seedFrom(`hossz-valt\u0001${seed}`) % out.length] = out[0] === "közepes" ? "rövid" : "közepes";
  return out;
}

/** `cardForm` (V3b) hiányozhat: régi, kártya nélküli checkpointból folytatott futás. */
export type VarietyAxes = { exampleTheme: AxisOption; recapForm: AxisOption; lengthBands: LengthBand[]; cardForm?: CardForm; wordGame?: WordGame };

export function pickVarietyAxes(seed: number, sections: number, opts: { language?: boolean } = {}): VarietyAxes & { cardForm: CardForm } {
  return {
    exampleTheme: seededPick(EXAMPLE_THEMES, seedFrom(`tema\u0001${seed}`))!,
    recapForm: seededPick(RECAP_FORMS, seedFrom(`osszefoglalo\u0001${seed}`))!,
    lengthBands: lengthBands(seed, sections),
    cardForm: seededPick(CARD_FORMS, seedFrom(`kartya\u0001${seed}`))!,
    ...(opts.language ? { wordGame: seededPick(WORD_GAMES, seedFrom(`szojatek\u0001${seed}`))! } : {}),
  };
}

/** Mentett azonosítóból (job-állapot) a tengely; ismeretlen → `undefined`. */
export const exampleThemeById = (id: unknown) => EXAMPLE_THEMES.find((t) => t.id === id);
export const recapFormById = (id: unknown) => RECAP_FORMS.find((t) => t.id === id);

export type SeriesPrevious = { openingForm?: string; exampleTheme?: string; recapForm?: string; cardForm?: string; wordGame?: string; shapeSignature?: string };

const nextOf = <T extends { id: string }>(items: readonly T[], current: T): T => items[(items.findIndex((i) => i.id === current.id) + 1) % items.length];

/**
 * Sorozatszabály: ha az előző (ugyanabban a tantárgy–évfolyam sorozatban kiosztott) lecke ugyanazt kapta, a kiosztás determinisztikusan a
 * következő elemre lép. Előzmény nélkül (vagy eltérő előzménynél) a mag kiosztása marad.
 */
export function avoidSeriesRepeat<T extends { openingForm: string } & Omit<VarietyAxes, "lengthBands"> & Partial<Pick<VarietyAxes, "lengthBands">>>(
  picked: T, previous: SeriesPrevious | undefined, classroom: number,
): T {
  if (!previous) return picked;
  const forms = OPENING_FORMS[openingFormGroup(classroom)];
  const form = forms.find((f) => f.id === picked.openingForm);
  return {
    ...picked,
    openingForm: form && previous.openingForm === picked.openingForm ? nextOf(forms, form).id : picked.openingForm,
    exampleTheme: previous.exampleTheme === picked.exampleTheme.id ? nextOf(EXAMPLE_THEMES, picked.exampleTheme) : picked.exampleTheme,
    recapForm: previous.recapForm === picked.recapForm.id ? nextOf(RECAP_FORMS, picked.recapForm) : picked.recapForm,
    cardForm: picked.cardForm && previous.cardForm === picked.cardForm.id ? nextOf(CARD_FORMS, picked.cardForm) : picked.cardForm,
    ...(picked.wordGame ? { wordGame: previous.wordGame === picked.wordGame ? WORD_GAMES[(WORD_GAMES.indexOf(picked.wordGame) + 1) % WORD_GAMES.length] : picked.wordGame } : {}),
  };
}

/** A lecke blokkváza: a fejezetek tervezett blokksora („>” a blokkok, „|” a fejezetek között). */
export function shapeSignature(sections: ReadonlyArray<{ plannedBlocks?: readonly string[] }>): string {
  return sections.map((s) => (s.plannedBlocks ?? []).join(">")).join("|");
}

/** A szerzői szerződés V1-sorai (csak BE változatossági kapcsolónál és kiosztásnál kerül a promptba). */
export function varietyAxesContract(axes: VarietyAxes, targetWords: number): string {
  const avg = axes.lengthBands.length ? targetWords / axes.lengthBands.length : targetWords;
  return [
    "VÁLTOZATOSSÁG (a program osztotta ki, kötelező):",
    `- PÉLDÁK TÉMAKÖRE: ${axes.exampleTheme.label} (${axes.exampleTheme.description}). Az example / try / check blokkok szituációi ebből a körből valók, ahol a tananyag engedi — a tantárgyi pontosság mindig elsőbb; ha a téma erőltetett lenne, a fejezet a saját, tárgyhoz illő helyzetét használja.`,
    `- ÖSSZEFOGLALÓ FORMÁJA: ${axes.recapForm.label} — ${axes.recapForm.description}. A lecke záró recap blokkja ezt a formát követi (a nyitás szerződésének visszatérő ELSŐ pontja után).`,
    // Review #612: a kártyakérés csak ott, ahol a kapu is méri (≥ 4 fejezet) — rövidebb leckénél nem teljesíthető a „nem első fejezet”.
    ...(axes.cardForm && axes.lengthBands.length >= CARD_MIN_SECTIONS ? [`- KÁRTYA: a lecke egy NEM első fejezetébe pontosan egy ${axes.cardForm.label} kerül (${axes.cardForm.description}) — try blokk: {"kind":"try","tryKind":"${axes.cardForm.id}","spec":${axes.cardForm.spec},"coversConceptIds":[…]}; tartalma a fejezet tanításából következik.`] : []),
    // V5b: boss-kérdés (mindig) és szójáték (nyelvi leckénél).
    "- BOSS-KÉRDÉS (legalább 3 fejezetnél): az utolsó, kérdést tartalmazó fejezet UTOLSÓ check blokkja \"boss\": true — a lecke legalább két tanított fogalmát összekötő, nehezebb, alkalmazó kérdés (coversConceptIds legalább 2 elem), csak a lecke anyagából; más check blokk nem boss.",
    ...(axes.wordGame ? [`- SZÓJÁTÉK: egy NEM első fejezetbe egy ${WORD_GAME_SPEC[axes.wordGame].label} a lecke idegen szavaival — try blokk: {"kind":"try","tryKind":"${axes.wordGame}","spec":${WORD_GAME_SPEC[axes.wordGame].spec},"coversConceptIds":[…]}.`] : []),
    `- FEJEZETHOSSZ (ritmus; a teljes szókereten belül): ${axes.lengthBands.map((b, i) => `${i + 1}. fejezet: ${b} (kb. ${Math.round(avg * BAND_WEIGHT[b])} szó)`).join("; ")}.`,
  ].join("\n");
}

/** V3b: a kártya-kiosztás (szerződés, kapu, tervbeli hely) legalább ennyi fejezetnél él. */
export const CARD_MIN_SECTIONS = 4;

type PlanSection = { plannedBlocks: readonly string[]; tryKind?: string };
/** A fejezet sorába (ha még nincs) egy `try` hely a `check` elé, ennek hiányában a záró `recap` elé, különben a végére. */
function withTrySlot<S extends PlanSection>(s: S, tryKind: string, beforeRecap = false): S {
  const blocks = [...s.plannedBlocks];
  const recap = blocks.lastIndexOf("recap"), existing = blocks.indexOf("try");
  // Meglévő try-hely: annak a fajtája változik (a recap elé kért helynél csak akkor, ha a recap előtt áll).
  if (existing >= 0 && (!beforeRecap || recap < 0 || existing < recap)) return { ...s, tryKind };
  const check = beforeRecap ? -1 : blocks.indexOf("check");
  blocks.splice(check >= 0 ? check : recap >= 0 ? recap : blocks.length, 0, "try");
  return { ...s, plannedBlocks: blocks, tryKind } as S;
}

/**
 * Review #612 (Codex, Vercel, Copilot): program által kiosztott (pontos blokksorú) tervnél a kiosztott kártya és a villámkártyás
 * összefoglaló HELYE a tervben van — különben a kötelező pontos sor és a kötelező plusz `try` blokk ellentmond egymásnak. A villámkártya
 * az utolsó fejezet recap-ja elé kerül; a kártya egy nem első (villámkártyánál nem is utolsó) fejezet try-helyére — ha van ilyen fejezet
 * try-hellyel, annak fajtája lesz, különben az elsőként szóba jövő fejezet kap try-helyet. Idempotens; < 4 fejezetnél nincs kártya.
 */
export function placeVarietyCards<S extends PlanSection>(sections: readonly S[], axes: { cardForm?: Pick<CardForm, "id">; recapForm: Pick<AxisOption, "id"> }): S[] {
  const out = [...sections];
  const last = out.length - 1;
  const flash = axes.recapForm.id === "villamkartya" && last >= 0;
  if (flash && out[last].tryKind !== "flashcards") out[last] = withTrySlot(out[last], "flashcards", true);
  const card = axes.cardForm;
  if (card && out.length >= CARD_MIN_SECTIONS && !out.slice(1).some((s) => s.tryKind === card.id)) {
    const candidates = out.map((_, i) => i).filter((i) => i >= 1 && !(flash && i === last));
    const at = candidates.find((i) => out[i].plannedBlocks.includes("try")) ?? candidates[0];
    if (at !== undefined) out[at] = withTrySlot(out[at], card.id);
  }
  return out;
}

/**
 * V3b kapu: ≥ 4 fejezetes (TERVEZETT) leckében a kiosztott kártya PONTOSAN egyszer, egy NEM első fejezetben szerepel (különben javító kör).
 * Review #647 (Sourcery): a duplikált / első fejezetbeli kártya is hiba; a tervezett fejezetszám dönt (rövidebb kimenet nem kerüli meg).
 */
export function cardFormProblems(lesson: { sections: ReadonlyArray<{ blocks: ReadonlyArray<{ kind: string; tryKind?: string }> }> }, card: CardForm | undefined, plannedSections?: number): string[] {
  if (!card || (plannedSections ?? lesson.sections.length) < CARD_MIN_SECTIONS) return [];
  const count = (secs: typeof lesson.sections) => secs.reduce((n, s) => n + s.blocks.filter((b) => b.kind === "try" && b.tryKind === card.id).length, 0);
  if (count(lesson.sections) === 1 && count(lesson.sections.slice(0, 1)) === 0) return [];
  return [`VÁLTOZATOSSÁG / KÁRTYA: a lecke egy nem első fejezetébe pontosan egy ${card.label} kell (try blokk, tryKind=${card.id}, spec: ${card.spec}) — se több, se az első fejezetben.`];
}

/** Review #647: villámkártyás összefoglalónál az utolsó fejezetben `flashcards` try blokk kell (különben javító kör). */
export function recapFlashcardProblems(lesson: { sections: ReadonlyArray<{ blocks: ReadonlyArray<{ kind: string; tryKind?: string }> }> }, recap: Pick<AxisOption, "id"> | undefined): string[] {
  if (recap?.id !== "villamkartya" || !lesson.sections.length) return [];
  const last = lesson.sections[lesson.sections.length - 1];
  return last.blocks.some((b) => b.kind === "try" && b.tryKind === "flashcards") ? []
    : ["VÁLTOZATOSSÁG / ÖSSZEFOGLALÓ: a villámkártyás összefoglalóhoz az utolsó fejezetben (a recap előtt) flashcards try blokk kell."];
}

/** Review #647: 4-nél rövidebb leckénél nincs kártya-kiosztás — a mentett érték sem fogyasztja a sorozat-forgást. */
export const cardFormForLength = <C>(sections: number, card: C | undefined): C | undefined => (sections >= CARD_MIN_SECTIONS ? card : undefined);

type GateLesson = { sections: ReadonlyArray<{ blocks: ReadonlyArray<{ kind: string; tryKind?: string; boss?: boolean; coversConceptIds?: readonly string[] }> }> };

/** V5b kapu: ≥ 3 fejezetnél pontosan egy boss-kérdés, az utolsó kérdéses fejezet utolsó check blokkja, legalább 2 fogalommal. */
export function bossProblems(lesson: GateLesson): string[] {
  if (lesson.sections.length < 3) return [];
  const all = lesson.sections.flatMap((s, si) => s.blocks.map((b, bi) => ({ b, si, bi })).filter((x) => x.b.kind === "check"));
  if (!all.length) return [];
  const last = all.at(-1)!;
  const bosses = all.filter((x) => x.b.boss === true);
  const want = "BOSS-KÉRDÉS: az utolsó, kérdést tartalmazó fejezet UTOLSÓ check blokkja \"boss\": true (legalább 2 tanított fogalom, nehezebb alkalmazó kérdés); más check nem boss.";
  if (bosses.length !== 1 || bosses[0] !== last) return [want];
  if ((last.b.coversConceptIds?.length ?? 0) < 2) return [`${want} A boss-kérdés coversConceptIds listája legalább 2 fogalom.`];
  return [];
}

/** V5b kapu: nyelvi leckénél (≥ 3 fejezet) a kiosztott szójáték egy nem első fejezetben. */
export function wordGameProblems(lesson: GateLesson, game: WordGame | undefined): string[] {
  if (!game || lesson.sections.length < 3) return [];
  if (lesson.sections.slice(1).some((s) => s.blocks.some((b) => b.kind === "try" && b.tryKind === game))) return [];
  return [`VÁLTOZATOSSÁG / SZÓJÁTÉK: egy nem első fejezetbe ${WORD_GAME_SPEC[game].label} kell (try blokk, tryKind=${game}, spec: ${WORD_GAME_SPEC[game].spec}).`];
}

/** A lektori lista V1-sora: az összefoglaló a kiosztott formát követi-e. */
export function varietyAxesLektorLine(axes: Pick<VarietyAxes, "recapForm">): string {
  return `- VÁLTOZATOSSÁG: a záró recap a kiosztott összefoglaló formát követi-e (${axes.recapForm.label} — ${axes.recapForm.description})? Ha nem: [arc] jelzés a recap blokkra. A boss-kérdés (check, "boss": true) a lecke tanított anyagából kérdez-e, és tényleg több fogalmat köt-e össze? Ha nem: [arc] jelzés rá.`;
}
