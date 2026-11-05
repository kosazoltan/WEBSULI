/**
 * Spec 2026-11-05-gyartas-reszletes-kovetes: a Készítés fül (`SourceUploadForm`) által követett egylépéses futás
 * tárolókulcsa — a draftlista „Vissza a készítéshez” gombja is ide írja a futást. Külön modul, hogy a draftlista ne húzza be
 * a teljes feltöltő űrlapot.
 */
export const ONE_STEP_RUN_STORAGE_KEY = "websuli.studio.oneStepRunId";

/** A követendő futás beírása; tároló nélkül (privát mód) csendben kimarad — a Készítés fül ilyenkor az aktív futást keresi. */
export function rememberOneStepRun(runId: string): void {
  try { sessionStorage.setItem(ONE_STEP_RUN_STORAGE_KEY, runId); }
  catch { /* storage unavailable: the studio tab falls back to /lessons/one-step/active */ }
}
