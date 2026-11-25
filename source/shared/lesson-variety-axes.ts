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
];

export type LengthBand = "rövid" | "közepes" | "hosszabb";
const BANDS: readonly LengthBand[] = ["rövid", "közepes", "hosszabb"];
const BAND_WEIGHT: Record<LengthBand, number> = { rövid: 0.7, közepes: 1, hosszabb: 1.3 };

/** Fejezetenkénti hosszsáv: determinisztikus; ≥ 2 fejezetnél nem egyforma (ritmusváltás). */
export function lengthBands(seed: number, sections: number): LengthBand[] {
  const out = Array.from({ length: Math.max(0, sections) }, (_, i) => seededPick(BANDS, seedFrom(`hossz\u0001${seed}\u0001${i}`))!);
  if (out.length >= 2 && new Set(out).size === 1) out[seedFrom(`hossz-valt\u0001${seed}`) % out.length] = out[0] === "közepes" ? "rövid" : "közepes";
  return out;
}

export type VarietyAxes = { exampleTheme: AxisOption; recapForm: AxisOption; lengthBands: LengthBand[] };

export function pickVarietyAxes(seed: number, sections: number): VarietyAxes {
  return {
    exampleTheme: seededPick(EXAMPLE_THEMES, seedFrom(`tema\u0001${seed}`))!,
    recapForm: seededPick(RECAP_FORMS, seedFrom(`osszefoglalo\u0001${seed}`))!,
    lengthBands: lengthBands(seed, sections),
  };
}

/** Mentett azonosítóból (job-állapot) a tengely; ismeretlen → `undefined`. */
export const exampleThemeById = (id: unknown) => EXAMPLE_THEMES.find((t) => t.id === id);
export const recapFormById = (id: unknown) => RECAP_FORMS.find((t) => t.id === id);

export type SeriesPrevious = { openingForm?: string; exampleTheme?: string; recapForm?: string; shapeSignature?: string };

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
    `- FEJEZETHOSSZ (ritmus; a teljes szókereten belül): ${axes.lengthBands.map((b, i) => `${i + 1}. fejezet: ${b} (kb. ${Math.round(avg * BAND_WEIGHT[b])} szó)`).join("; ")}.`,
  ].join("\n");
}

/** A lektori lista V1-sora: az összefoglaló a kiosztott formát követi-e. */
export function varietyAxesLektorLine(axes: Pick<VarietyAxes, "recapForm">): string {
  return `- VÁLTOZATOSSÁG: a záró recap a kiosztott összefoglaló formát követi-e (${axes.recapForm.label} — ${axes.recapForm.description})? Ha nem: [arc] jelzés a recap blokkra.`;
}
