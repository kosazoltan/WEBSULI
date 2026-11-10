/**
 * Számegyenes-feliratok (spec 2026-11-10-gyartas-meres, J3): a feliratok a „szép” lépés többszörösei, 0-ra
 * horgonyozva. Az osztásvonalak a szerzői lépést követik, csak a számfelirat ritkul.
 */

const TOL = 1e-9;

/** A [from, to] tartományba eső, c többszörösű értékek száma (lebegőpontos tűréssel). */
function multiplesInRange(from: number, to: number, c: number): number {
  return Math.max(0, Math.floor(to / c + TOL) - Math.ceil(from / c - TOL) + 1);
}

/**
 * A legkisebb {1, 2, 5} × 10^k lépés, amely ≥ `step`, a `step` egész számú többszöröse, és legfeljebb
 * `maxLabels + 1` feliratot ad. Ha nincs ilyen szép lépés (pl. step = 3), a `step` kisebb egész többszöröse lesz.
 */
export function numberLineLabelStep(from: number, to: number, step: number, maxLabels = 7): number {
  if (!Number.isFinite(from) || !Number.isFinite(to) || !Number.isFinite(step) || step <= 0 || to <= from) return step > 0 ? step : 1;
  const limit = maxLabels + 1;
  const k0 = Math.floor(Math.log10(step)) - 1;
  const k1 = Math.ceil(Math.log10(Math.max(Math.abs(from), Math.abs(to), step))) + 1;
  for (let k = k0; k <= k1; k++) {
    for (const m of [1, 2, 5]) {
      const c = m * Math.pow(10, k);
      if (c < step - TOL) continue;
      const ratio = c / step;
      if (Math.abs(ratio - Math.round(ratio)) > 1e-6) continue;
      if (multiplesInRange(from, to, c) <= limit) return c;
    }
  }
  // Tartalék: a szerzői lépés egész számú többszöröse.
  for (let j = 1; j < 10000; j++) {
    if (multiplesInRange(from, to, step * j) <= limit) return step * j;
  }
  return step;
}

/**
 * Az osztásokhoz (`ticks`, a szerzői lépéssel) tartozó felirat-jelzők. Ha az osztások nem a 0-hoz igazodó rácson állnak (pl. 1, 3, 5,
 * 7, 9 — a kezdőérték nem a lépés többszöröse), a „szép” többszörösök közül alig vagy semmi nem esne osztásra: ilyenkor a felirat a
 * korábbi, sorszám szerinti ritkítással kerül ki (az ábra nem maradhat számok nélkül).
 */
export function numberLineLabelFlags(ticks: readonly number[], step: number, maxLabels = 7): boolean[] {
  if (!ticks.length) return [];
  const labelStep = numberLineLabelStep(ticks[0], ticks[ticks.length - 1], step, maxLabels);
  const flags = ticks.map((v) => isNumberLineLabel(v, labelStep));
  if (flags.filter(Boolean).length >= Math.min(2, ticks.length)) return flags;
  const every = Math.ceil(ticks.length / maxLabels);
  return ticks.map((_, i) => i % every === 0);
}

/** A `value` a `labelStep` többszöröse (1e-9 tűréssel); a 0 mindig az. */
export function isNumberLineLabel(value: number, labelStep: number): boolean {
  if (Math.abs(value) < TOL) return true;
  if (!(labelStep > 0)) return false;
  const r = value / labelStep;
  return Math.abs(r - Math.round(r)) < TOL;
}
