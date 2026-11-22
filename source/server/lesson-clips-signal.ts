import { AsyncLocalStorage } from "node:async_hooks";

/**
 * A kisfilm-kör megszakítási jele (tulajdonosi döntés 2026-11-22: „körönkénti megszakítási jel”). Minden kör saját `AbortController`-t
 * kap; a jelet a zár elvesztése, a leállítás és minden körhiba kiváltja. A szolgáltatói réteg a hívás pillanatában innen olvassa ki
 * (aszinkron kontextus), és a globális leállítási jellel kombinálja — egy forrás, nem két párhuzamos mechanizmus.
 */
const roundSignal = new AsyncLocalStorage<AbortSignal>();
/** Az aktuális kör jele (a körön kívül: undefined). */
export const currentClipRoundSignal = (): AbortSignal | undefined => roundSignal.getStore();
/** A `work` és minden belőle induló aszinkron lépés a kör jelét látja. */
export const runWithClipRoundSignal = <T>(signal: AbortSignal, work: () => Promise<T>): Promise<T> => roundSignal.run(signal, work);
