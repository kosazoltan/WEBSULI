/**
 * Review #602 (B5b): egy kísérlet TELJES határideje — az előkészítéstől (pl. az ujjlenyomat lekérése) a küldésig. A `within` a lejáratkor
 * `undefined`-dal tér vissza (a függő ígéret nem tartja fel a kísérletet), a `left` a hátralévő időt adja a hálózati hívás határidejének.
 */
export type AttemptDeadline = { left(): number; within<T>(p: Promise<T>): Promise<T | undefined> };

export function attemptDeadline(ms: number, now: () => number = Date.now): AttemptDeadline {
  const at = now() + ms;
  const left = () => Math.max(0, at - now());
  return {
    left,
    within<T>(p: Promise<T>): Promise<T | undefined> {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const expired = new Promise<undefined>(resolve => { timer = setTimeout(() => resolve(undefined), left()); });
      return Promise.race([p, expired]).finally(() => clearTimeout(timer));
    },
  };
}
