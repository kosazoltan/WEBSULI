/**
 * Spec 2026-11-10-gyartas-meres (J5): újrapróbálható-e egy kérés hibája. Az `apiRequest` a hálózati hibát (`TypeError`) és az
 * időtúllépést (`AbortError`) magyar szövegű `Error`-ba csomagolja (`cause` az eredeti) — a korábbi feltétel csak a csomagolatlan
 * hibát ismerte fel, ezért bekapcsolt újrapróbálásnál épp a hálózati hiba nem próbálkozott újra. 4xx soha nem újrapróbálható.
 */
export function isRetryableRequestError(error: unknown): boolean {
  const seen = new Set<unknown>();
  for (let e: unknown = error; e instanceof Error && !seen.has(e); e = (e as { cause?: unknown }).cause) {
    seen.add(e);
    const status = (e as { status?: unknown }).status;
    if (typeof status === "number") return status >= 500;
    if (e instanceof TypeError || e.name === "AbortError") return true;
  }
  return false;
}
