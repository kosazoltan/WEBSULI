/**
 * Adventi naptár — a kliens és a szerver közös adatszerződése (docs/specs/2026-11-18-adventi-naptar.md R8).
 * A tanulói token és az eszközazonosító a kérés TÖRZSÉBEN megy (URL-be egyik sem kerül).
 */
import { z } from "zod";
import type { AdventPhase } from "./calendar";
import { ADVENT_DOORS, ADVENT_MAX_GRADE, ADVENT_MIN_GRADE, type AdventClosing, type AdventSummary, type DoorState } from "./rules";

/** Az eszköz véletlen azonosítója: UUID (a böngésző `crypto.randomUUID()` értéke). */
export const adventDeviceId = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);

export const adventIdentityBody = z.object({
  learner: z.string().max(120).optional(),
  device: adventDeviceId.optional(),
});

export const adventGradeBody = adventIdentityBody.extend({
  grade: z.number().int().min(ADVENT_MIN_GRADE).max(ADVENT_MAX_GRADE),
});

export const adventAnswerBody = adventIdentityBody.extend({
  questionId: z.string().min(1).max(32),
  pick: z.number().int().min(0).max(3),
});

/** A `:day` útvonal-paraméter: 1–24 egész, vezető nulla és egyéb karakter nélkül. */
export const adventDayParam = z
  .string()
  .regex(/^[1-9][0-9]?$/)
  .transform(Number)
  .refine((day) => day >= 1 && day <= ADVENT_DOORS);

export type AdventDoorView = {
  day: number;
  state: DoorState;
  /** A karácsonyi ablak tárgya `christmas`; bank-ablaknál a tárgy csak a megnyitás után ismert (addig null). */
  subject: string | null;
  /** Hány javítás maradt (csak `repairable` állapotban > 0). */
  repairsLeft: number;
};

/** A kliensnek adott kérdés: SOHA nincs benne a helyes válasz indexe és a magyarázat. */
export const adventQuestionSchema = z
  .object({
    id: z.string(),
    subject: z.string(),
    prompt: z.string(),
    options: z.array(z.string()).length(4),
  })
  .strict();
export type AdventQuestion = z.infer<typeof adventQuestionSchema>;

export type AdventState = {
  enabled: true;
  season: number;
  phase: AdventPhase;
  today: string;
  openDay: number;
  nextOpensAt: string | null;
  /** A következő nyitásig hátralévő idő a szerver órájából (ms), vagy null (élesítés előtti L4). */
  nextOpensInMs: number | null;
  /** A következő állapotváltásig (ablaknyitás vagy fázisváltás) hátralévő idő a szerver órájából (ms), vagy null (PR-C 2. vak L3). */
  refreshInMs: number | null;
  daysUntilStart: number;
  identity: "learner" | "player" | "device" | "preview" | null;
  /** `invalid`: a kérés tanulói tokent hozott, de az érvénytelen — a felület újrapárosítást kér (terv 16.5). */
  pairing: "ok" | "invalid" | "none";
  firstName: string | null;
  grade: number | null;
  needsGrade: boolean;
  round: number;
  maxRounds: number;
  layout: number[];
  doors: AdventDoorView[];
  summary: AdventSummary;
  closing: AdventClosing;
  /**
   * Párosított eszközön a nézet egy még NEM mentett átvétel előnézete (a vendégsor még létezik). A kliens a megtekintési útról
   * (összesítés, végigjátszott kör) a `POST /adopt` kéréssel menti el (PR-C vak L2); a GET mellékhatás nélkül marad.
   */
  adoptionPending: boolean;
  /**
   * Az állás szerververziója (a sor utolsó módosításának ideje, ms; nincs sor → 0). Az írások sorrendjében nő: a kliens a régebbi
   * verziójú, később kézbesített választ eldobja (PR-C 3. vak L1).
   */
  version: number;
  /** A válasz szerverpillanata (ms; S5/S6 1. vak L4): egyenlő `version` mellett a régebbi pillanatú állás a régebbi. */
  asOf: number;
};

export type AdventOpenResult = {
  day: number;
  /** `null`: a már megválaszolt kérdés közben kikerült a bankból — ilyenkor csak a tárolt eredmény látszik. */
  question: AdventQuestion | null;
  /** Megoldott / végleg hibás ablaknál az utolsó próba eredménye (csak olvasásra). */
  answered: AdventAnswerResult | null;
};

export type AdventAnswerResult = {
  correct: boolean;
  /** A helyes válasz indexe a kliensnek adott (kevert) sorrendben; -1, ha a kérdés már nem érhető el. */
  correctIndex: number;
  explanation: string;
  /** A rögzített próba választása a kliensnek adott sorrendben (a saját válasz jelöléséhez). */
  pick: number;
  /**
   * `false`: ez a kérdés már korábban meg volt válaszolva (másik lap / eszköz / újraküldés) — a TÁROLT eredmény jön vissza, a
   * mostani választás nem számít. A felület ilyenkor ezt mondja ki, nem a mostani koppintást minősíti.
   */
  recorded: boolean;
  door: AdventDoorView;
  /** A teljes, a válasszal azonos állapotú ablaklista (élesítés előtti L6: két eszköz, egy tanuló). */
  doors: AdventDoorView[];
  summary: AdventSummary;
  closing: AdventClosing;
  /** Az állás szerververziója a válasz után (lásd `AdventState.version`; PR-C 3. vak L1). */
  version: number;
  /** A válasz szerverpillanata (lásd `AdventState.asOf`). */
  asOf: number;
};
