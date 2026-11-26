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
export type VarietyAxes = { exampleTheme: AxisOption; recapForm: AxisOption; lengthBands: LengthBand[]; cardForm?: CardForm };

export function pickVarietyAxes(seed: number, sections: number): VarietyAxes & { cardForm: CardForm } {
  return {
    exampleTheme: seededPick(EXAMPLE_THEMES, seedFrom(`tema\u0001${seed}`))!,
    recapForm: seededPick(RECAP_FORMS, seedFrom(`osszefoglalo\u0001${seed}`))!,
    lengthBands: lengthBands(seed, sections),
    cardForm: seededPick(CARD_FORMS, seedFrom(`kartya\u0001${seed}`))!,
  };
}

/** Mentett azonosítóból (job-állapot) a tengely; ismeretlen → `undefined`. */
export const exampleThemeById = (id: unknown) => EXAMPLE_THEMES.find((t) => t.id === id);
export const recapFormById = (id: unknown) => RECAP_FORMS.find((t) => t.id === id);

export type SeriesPrevious = { openingForm?: string; exampleTheme?: string; recapForm?: string; cardForm?: string; shapeSignature?: string };

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

/** V3b kapu: ≥ 4 fejezetes leckében a kiosztott kártya egy NEM első fejezetben szerepel (különben javító kör). */
export function cardFormProblems(lesson: { sections: ReadonlyArray<{ blocks: ReadonlyArray<{ kind: string; tryKind?: string }> }> }, card: CardForm | undefined): string[] {
  if (!card || lesson.sections.length < CARD_MIN_SECTIONS) return [];
  if (lesson.sections.slice(1).some((s) => s.blocks.some((b) => b.kind === "try" && b.tryKind === card.id))) return [];
  return [`VÁLTOZATOSSÁG / KÁRTYA: a lecke egy nem első fejezetébe pontosan egy ${card.label} kell (try blokk, tryKind=${card.id}, spec: ${card.spec}).`];
}

/** A lektori lista V1-sora: az összefoglaló a kiosztott formát követi-e. */
export function varietyAxesLektorLine(axes: Pick<VarietyAxes, "recapForm">): string {
  return `- VÁLTOZATOSSÁG: a záró recap a kiosztott összefoglaló formát követi-e (${axes.recapForm.label} — ${axes.recapForm.description})? Ha nem: [arc] jelzés a recap blokkra.`;
}
