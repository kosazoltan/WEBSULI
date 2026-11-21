import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { QueryClient } from "@tanstack/react-query";

import { adventNow } from "../shared/advent/calendar";
import * as busy from "../client/src/advent/busy";
import * as sync from "../client/src/advent/sync";

/**
 * Adventi naptár — a PR-C 2. vak körének (058986b7) leletei: L1–L5 tiszta logikája és forrás-őrei
 * (docs/specs/2026-11-18-adventi-naptar.md 22. 19–23.; végrehajtás: „2026-11-21 — a PR-C 2. vak köre (058986b7)”).
 * A versenyhelyzetek böngészős útja (késleltetett válasz, léptetett óra): tests/advent-calendar.spec.ts „PR-C 2. vak”.
 */
const read = (rel: string) => readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), "utf8").replace(/\r\n/g, "\n");
type Fn = (...args: never[]) => unknown;
const fnOf = <T extends Fn>(mod: unknown, name: string): T => {
  const f = (mod as Record<string, unknown>)[name];
  assert.equal(typeof f, "function", `${name} hiányzik`);
  return f as T;
};

test("2. kör L1: a 429 utáni újrapróba elmarad, ha a kérés indítása óta alanyváltás történt (nincs írás az új alany nevében)", async () => {
  let calls = 0;
  let stale = false;
  const run = async () => { calls++; throw Object.assign(new Error("HTTP 429"), { status: 429 }); };
  const waits: boolean[] = [];
  await assert.rejects(busy.retryWhenBusy(run, { onWait: (w: boolean) => waits.push(w), sleep: async () => { stale = true; }, cancelled: () => stale } as never), (e: unknown) => (e as { cancelled?: unknown }).cancelled === true);
  assert.equal(calls, 1, "nincs második kérés");
  const page = read("client/src/pages/AdventCalendar.tsx");
  // A nyitás minden állapotírása az indító generációhoz kötött.
  assert.match(page, /const openDoor = useCallback\(async \(day: number, opener: HTMLElement \| null, repair = false\) => \{\n\s+if \(writeBlocked\(\)\) \{ say\(CHOOSE_FIRST_TEXT\); return; \}\n\s+const started = generation;/);
  assert.match(page, /if \(!isCurrent\(started\)\) return;\n\s+if \(!res\.question\)/, "a késve érkező kérdés nem nyílik meg");
});

test("2. kör L2: a sikeres írás eredménye után a korábban indult (régi pillanatképet hozó) olvasás nem írhatja felül az állapotot", async () => {
  const apply = fnOf<(qc: QueryClient, g: number, update: (current: unknown) => unknown) => Promise<boolean>>(sync, "applyAdventWrite");
  const qc = new QueryClient();
  const g = sync.adventSubjectGeneration();
  const key = sync.adventStateKey(g);
  qc.setQueryData(key, { solved: 0 });
  let release!: (v: unknown) => void;
  const late = qc.fetchQuery({ queryKey: key, queryFn: () => new Promise((r) => { release = r; }), staleTime: 0 }).catch(() => undefined);
  assert.equal(await apply(qc, g, () => ({ solved: 1 })), true);
  release({ solved: 0, late: true });
  await late;
  assert.deepEqual(qc.getQueryData(key), { solved: 1 }, "a régi pillanatkép nem írta vissza a megoldott ablakot");
  // Régi generációval semmi nem íródik.
  assert.equal(await apply(qc, g - 1, () => ({ solved: 9 })), false);
  const page = read("client/src/pages/AdventCalendar.tsx");
  assert.match(page, /applyAdventWrite\(queryClient, generation, /);
  assert.doesNotMatch(page, /setAdventStateIfCurrent\(/, "minden írás a versenyhelyzet-álló úton megy");
});

test("2. kör L3: a szerver a következő ÁLLAPOTVÁLTÁSIG hátralévő időt is adja — január 6-án a január 7-i zárásig, december 24-én a karácsonyi pótlásig", () => {
  const ms = (iso: string) => (adventNow(new Date(iso)) as unknown as { refreshInMs?: number | null }).refreshInMs;
  assert.equal(ms("2027-01-06T22:59:00Z"), 60_000, "január 6., 23:59 → 1 perc múlva lezár");
  assert.equal(ms("2026-12-26T10:00:00Z"), Date.parse("2027-01-06T23:00:00Z") - Date.parse("2026-12-26T10:00:00Z"));
  assert.equal(ms("2026-12-24T22:00:00Z"), 60 * 60_000, "december 24. → 25. éjfél (fázisváltás)");
  assert.equal(ms("2026-12-04T22:59:00Z"), 60_000, "a napi nyitás változatlan");
  assert.equal(ms("2026-11-23T22:00:00Z"), 60 * 60_000, "november 23. → a „Hamarosan” kezdete");
  assert.equal(ms("2027-01-07T10:00:00Z"), null, "lezárva nincs több váltás");
  assert.match(read("server/advent/routes.ts"), /refreshInMs: at\.refreshInMs/);
  assert.match(read("client/src/advent/useAdvent.ts"), /const nextOpensInMs = query\.data\?\.refreshInMs \?\? query\.data\?\.nextOpensInMs \?\? null;/);
});

test("2. kör L4: az aktuális generáció igazolt `pairing: ok` válasza feloldja a lejárt link tiltását; a vendég gomb csak a figyelmeztetés generációjára hat", () => {
  const release = fnOf<(input: { pairing: string | null | undefined; mustChoose: boolean }) => boolean>(sync, "pairingRecovered");
  assert.equal(release({ pairing: "ok", mustChoose: true }), true);
  assert.equal(release({ pairing: "none", mustChoose: true }), false, "a törölt token (névtelen) nem igazolás");
  assert.equal(release({ pairing: "invalid", mustChoose: true }), false);
  assert.equal(release({ pairing: "ok", mustChoose: false }), false);
  const page = read("client/src/pages/AdventCalendar.tsx");
  assert.match(page, /if \(pairingRecovered\(\{ pairing: state\?\.pairing, mustChoose: mustChooseRef\.current \}\)\) \{/);
  assert.match(page, /if \(adventSubjectGeneration\(\) === warnedGeneration\.current\) forgetLearnerPairing\(\);/);
});

test("2. kör L5: a csillag a fejlécben önálló, nem zsugorodó helyen áll — a csonkolás csak a cím szövegét érinti", () => {
  const page = read("client/src/pages/AdventCalendar.tsx");
  assert.match(page, /<span className="advent-hud__name">Adventi naptár<\/span>/);
  const css = read("client/src/advent/advent.css");
  assert.match(css, /\.advent-hud__name \{[^}]*text-overflow: ellipsis;/);
  assert.match(css, /\.advent-tree-star \{[^}]*flex: 0 0 auto;/);
});
