import type { GradeQuizItem } from "./types";
import { MAX_GRADE, MIN_GRADE } from "./types";

/**
 * JBb — évfolyamonkénti LUSTA betöltés (terv D18; a szóbank-betöltő `data/vocabBank/loader.ts` mintájára).
 *
 * A böngészőben minden évfolyam külön darab (`import("./grade-NN")`): egy játék csak a játékos évfolyamát és a két
 * szomszédját tölti le (a választó `grade`, `grade − 1`, `grade + 1` sorrendben kérdez). A választó (`pickGradeQuiz`)
 * SZINKRON marad: a már betöltött évfolyamok pillanatképéből (`loadedGradeItems()`) dolgozik, és amíg a darab nem jött
 * meg, `null`-t ad — ilyenkor a játék a saját kézi bankjára esik vissza (a meglévő szerződés).
 *
 * Hiba: az ígéret elutasít, és KIESIK a gyorsítótárból (nem ragad be); a következő kérés legkorábban
 * `RETRY_AFTER_MS` múlva próbálja újra, hogy kérdésenként ne terhelje a hálózatot.
 *
 * Node-ban (szerver, egységtesztek) nincs darabolás: az első hozzáféréskor a teljes bank szinkron betöltődik
 * (`process.getBuiltinModule("node:module").createRequire`) — így a választó viselkedése Node-ban változatlan.
 */

const RETRY_AFTER_MS = 5000;

const pending = new Map<number, Promise<readonly GradeQuizItem[]>>();
const loaded = new Map<number, readonly GradeQuizItem[]>();
const failedAt = new Map<number, number>();
let snapshot: readonly GradeQuizItem[] = [];

function isGrade(grade: unknown): grade is number {
  return typeof grade === "number" && Number.isInteger(grade) && grade >= MIN_GRADE && grade <= MAX_GRADE;
}

/** Évfolyamonként külön dinamikus import — a Vite ebből évfolyamonként külön darabot készít. */
function importGrade(grade: number): Promise<readonly GradeQuizItem[]> {
  switch (grade) {
    case 3: return import("./grade-03").then((m) => m.GRADE_03);
    case 4: return import("./grade-04").then((m) => m.GRADE_04);
    case 5: return import("./grade-05").then((m) => m.GRADE_05);
    case 6: return import("./grade-06").then((m) => m.GRADE_06);
    case 7: return import("./grade-07").then((m) => m.GRADE_07);
    case 8: return import("./grade-08").then((m) => m.GRADE_08);
    case 9: return import("./grade-09").then((m) => m.GRADE_09);
    case 10: return import("./grade-10").then((m) => m.GRADE_10);
    case 11: return import("./grade-11").then((m) => m.GRADE_11);
    case 12: return import("./grade-12").then((m) => m.GRADE_12);
    default: return Promise.reject(new Error(`ismeretlen évfolyam: ${String(grade)}`));
  }
}

let importer: (grade: number) => Promise<readonly GradeQuizItem[]> = importGrade;

/** Teszthez: a dinamikus import kiváltása (hibás hálózat szimulálása); argumentum nélkül visszaállít. */
export function setGradeBankImporter(fn?: (grade: number) => Promise<readonly GradeQuizItem[]>): void {
  importer = fn ?? importGrade;
}

function rebuildSnapshot(): void {
  snapshot = [...loaded.keys()].sort((a, b) => a - b).flatMap((g) => loaded.get(g) ?? []);
}

/** Teszthez és a Node-homlokzathoz: egy évfolyam tételeinek közvetlen beírása. */
export function registerGradeBank(grade: number, items: readonly GradeQuizItem[]): void {
  if (!isGrade(grade)) return;
  loaded.set(grade, items);
  failedAt.delete(grade);
  rebuildSnapshot();
}

let nodeFacadeTried = false;
/** Node-ban (nincs `window`) a teljes bank szinkron betöltése egyszer; a böngészőben semmit nem csinál. */
function ensureNodeFacade(): void {
  if (nodeFacadeTried) return;
  nodeFacadeTried = true;
  if (typeof window !== "undefined") return;
  const proc = (globalThis as { process?: { getBuiltinModule?: (id: string) => unknown } }).process;
  const mod = proc?.getBuiltinModule?.("node:module") as
    | { createRequire: (url: string) => (id: string) => { GRADE_QUIZ_ITEMS?: readonly GradeQuizItem[] } }
    | undefined;
  if (!mod) return;
  try {
    const all = mod.createRequire(import.meta.url)("./index").GRADE_QUIZ_ITEMS ?? [];
    for (let g = MIN_GRADE; g <= MAX_GRADE; g++) loaded.set(g, all.filter((q) => q.grade === g));
    rebuildSnapshot();
  } catch {
    // Node-ban sem kötelező: részleges állapot helyett üres pillanatkép, és az aszinkron `loadGradeBank` út marad.
    loaded.clear();
    snapshot = [];
  }
}

/** A már betöltött évfolyamok tételei (szinkron pillanatkép, évfolyam szerint rendezve). */
export function loadedGradeItems(): readonly GradeQuizItem[] {
  ensureNodeFacade();
  return snapshot;
}

export function isGradeBankLoaded(grade: number): boolean {
  ensureNodeFacade();
  return loaded.has(grade);
}

/**
 * Egy évfolyam betöltése (gyorsítótárazott ígéret). Hibánál elutasít, és a gyorsítótárból kiesik; a következő hívás
 * újrapróbál (a `RETRY_AFTER_MS` csak a háttér-előtöltést fogja vissza, a közvetlen hívást nem).
 */
export function loadGradeBank(grade: number): Promise<readonly GradeQuizItem[]> {
  ensureNodeFacade();
  const ready = loaded.get(grade);
  if (ready) return Promise.resolve(ready);
  const hit = pending.get(grade);
  if (hit) return hit;
  const p = importer(grade).then(
    (items) => {
      pending.delete(grade);
      registerGradeBank(grade, items);
      return items;
    },
    (err: unknown) => {
      pending.delete(grade);
      failedAt.set(grade, Date.now());
      throw err;
    },
  );
  pending.set(grade, p);
  return p;
}

/**
 * Háttér-előtöltés: a játékos évfolyama és a két szomszédja (a választó sorrendje). Soha nem dob; a nemrég
 * elbukott évfolyamot `RETRY_AFTER_MS`-ig nem kéri újra.
 */
export function preloadGradeBanks(grade: number | null | undefined, now: number = Date.now()): Promise<void> {
  if (!isGrade(grade)) return Promise.resolve();
  const wanted = [grade, grade - 1, grade + 1].filter((g) => isGrade(g) && !loaded.has(g));
  const jobs = wanted
    .filter((g) => pending.has(g) || now - (failedAt.get(g) ?? -Infinity) >= RETRY_AFTER_MS)
    .map((g) => loadGradeBank(g).then(() => undefined, () => undefined));
  return Promise.all(jobs).then(() => undefined);
}

/** Teszthez: a betöltő állapotának ürítése (a Node-homlokzat is újra lefuthat). */
export function resetGradeBankLoader(options: { nodeFacade?: boolean } = {}): void {
  pending.clear();
  loaded.clear();
  failedAt.clear();
  snapshot = [];
  nodeFacadeTried = options.nodeFacade === false;
}

export const GRADE_BANK_RETRY_AFTER_MS = RETRY_AFTER_MS;
