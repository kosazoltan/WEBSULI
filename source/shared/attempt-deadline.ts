/**
 * Review #602 (B5b): egy kísérlet TELJES határideje — az előkészítéstől (pl. az ujjlenyomat lekérése) a küldésig. A `within` a lejáratkor
 * `undefined`-dal tér vissza (a függő ígéret nem tartja fel a kísérletet), a `left` a hátralévő időt adja a hálózati hívás határidejének.
 */
export type AttemptDeadline = { left(): number; within<T>(p: Promise<T>): Promise<T | undefined> };

export function attemptDeadline(ms: number, now: () => number = Date.now): AttemptDeadline {
  const at = now() + ms;
  // A lejárati időzítő lefutása végleges: a Node időzítője a Date.now-hoz képest ms-kerekítéssel korábban is tüzelhet, ezért
  // lejárat után a `left` akkor is 0, ha az óra még a határidő előtt áll (különben 1 ms-os POST indulna; CI #610).
  let lapsed = false;
  const left = () => (lapsed ? 0 : Math.max(0, at - now()));
  return {
    left,
    within<T>(p: Promise<T>): Promise<T | undefined> {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const expired = new Promise<undefined>(resolve => {
        timer = setTimeout(() => { lapsed = true; resolve(undefined); }, left());
      });
      return Promise.race([p, expired]).finally(() => clearTimeout(timer));
    },
  };
}
