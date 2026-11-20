/**
 * Spec 2026-11-17-eredmeny-email-kviz, R33 (review 4642333294): a pool lezárása előtti ürítések (régi anyagok eredményei, új-lecke
 * értesítők, „félbehagyva” eredménylevelek) EGYSZERRE indulnak; mindegyik a saját felső korlátja és a közös keret (a kényszerleállításig
 * hátralévő idő) közül a kisebbikig vár. A hiba nem akasztja meg a többit (`onError`); a függvény sosem dob.
 */
export type ShutdownFlush = { name: string; maxMs: number; run: () => Promise<unknown> };

export async function runShutdownFlushes(tasks: readonly ShutdownFlush[], budgetMs: number, onError: (name: string, error: unknown) => void): Promise<void> {
  const budget = Math.max(0, budgetMs);
  await Promise.all(tasks.map(async task => {
    const limitMs = Math.min(task.maxMs, budget);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const limit = new Promise<void>(resolve => { timer = setTimeout(resolve, limitMs); timer.unref?.(); });
    try { await Promise.race([Promise.resolve().then(task.run), limit]); }
    catch (error) { onError(task.name, error); }
    finally { clearTimeout(timer); }
  }));
}
