/**
 * Adventi naptár — admin-előnézet (docs/specs/2026-11-18-adventi-naptar.md 16.5, A16; végrehajtás „S6”, „Kiegészítés 5”).
 *
 * Az `/api/admin/advent/preview` az `isAuthenticatedAdmin` őr mögött él (a felcsatolás a `server/routes.ts`-ben), és az
 * `ADVENT_CALENDAR` kapcsolótól FÜGGETLEN: a bekapcsolás előtti kipróbálásra való (tulajdonosi D-11). A naptár ugyanaz a router, mint a
 * nyilvános, csak (1) az órája a `?date=ÉÉÉÉ-HH-NN` budapesti napjának 12:00-ja, (2) az alanya az admin saját előnézeti sora
 * (`preview` fajta — levél soha nem megy róla), (3) `DELETE /` a saját előnézeti sorát törli (CSRF: a közös köztes réteg).
 * A naplóba azonosító nem kerül.
 */
import { Router, type Request } from "express";
import type { AdventBankItem, ChristmasItem } from "../../shared/advent/assignment";
import { budapestParts } from "../../shared/advent/calendar";
import { createAdventRouter } from "./routes";
import type { AdventStore } from "./store";

const PREVIEW_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Az előnézet órája: csak `ÉÉÉÉ-HH-NN` alakú, létező naptári nap (2000–2100) — a budapesti nap 12:00-ja (a napközepe, így a téli /
 * nyári idő és a napi nyitás határa nem téveszt). Minden más: `null` (a hívó 400-at ad).
 */
export function previewDateFrom(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const m = PREVIEW_DATE.exec(value);
  if (!m) return null;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1) return null;
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return null;
  // A zónabeli 12:00 közvetlenül (S5/S6 1. vak L6): óraátállítás napján az éjféltől eltelt 12 óra nem dél. Becslés a téli eltolással,
  // majd igazítás a budapesti óra szerint.
  let guess = Date.UTC(year, month - 1, day, 11);
  for (let i = 0; i < 2; i++) guess += (12 - budapestParts(new Date(guess)).hour) * 3_600_000;
  return new Date(guess);
}

const adminIdOf = (req: Request): string | null => {
  const id = (req.user as { id?: unknown } | undefined)?.id;
  return typeof id === "string" && id.length > 0 ? id : null;
};

export function createAdventPreviewRouter(deps: { store: AdventStore; bank: readonly AdventBankItem[]; christmas: readonly ChristmasItem[] }): Router {
  const router = Router();

  // A saját előnézeti sor törlése (minden évadé) — „Előnézet törlése”. A kérés CSRF-tokenes (a közös köztes réteg).
  router.delete("/", (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    const id = adminIdOf(req);
    if (!id) { res.status(401).json({ message: "Unauthorized" }); return; }
    deps.store.deletePreview(id).then((removed) => { res.json({ removed }); }, next);
  });

  router.use(createAdventRouter({
    store: deps.store,
    bank: deps.bank,
    christmas: deps.christmas,
    // A kapcsolótól független (terv 16.5): az előnézet a bekapcsolás ELŐTT is működik.
    enabled: () => true,
    clock: (req) => previewDateFrom(req.query.date),
    // Érvénytelen vagy hiányzó dátum: 400 (nem 404 — a kapcsoló itt nem számít).
    invalidClock: { status: 400, message: "Az előnézethez ÉÉÉÉ-HH-NN alakú dátum kell." },
    // Az admin saját előnézeti sora; tanulói link és eszközazonosító itt nem számít. Levélküldő nincs bekötve.
    resolve: async (req) => {
      const id = adminIdOf(req);
      // Az admin-őr mögött mindig van felhasználó; nélküle nincs alany (400), nem idegen sor.
      return { subject: id ? { kind: "preview", id, grade: null, firstName: null } : null, pairing: "none" };
    },
  }));
  return router;
}
