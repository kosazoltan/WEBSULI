/**
 * Adventi naptár — a szülői levelek száraz összesítője (tulajdonosi P-056: „Levélküldés csak száraz összesítő után, külön
 * jóváhagyással”). `GET /api/admin/advent/mail-report` — az `isAuthenticatedAdmin` őr mögött (a felcsatolás a `server/routes.ts`-ben),
 * a naptár kapcsolójától FÜGGETLENÜL (a bekapcsolás előtt és után is megnézhető). Csak olvas; e-mail-címet nem ad ki (csak a
 * címzettek számát). A valódi küldést az `ADVENT_RESULT_EMAIL_MODE=send` kapcsolja be — tulajdonosi lépés az összesítő átnézése után.
 */
import { Router } from "express";
import { adventNow } from "../../shared/advent/calendar";
import { adventMailReport } from "./result-email";
import type { AdventStore } from "./store";

export function createAdventMailReportRouter(deps: { store: Pick<AdventStore, "mailCandidates">; now?: () => Date }): Router {
  const router = Router();
  router.get("/", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    const at = adventNow((deps.now ?? (() => new Date()))());
    adventMailReport(deps.store, { season: at.season, phase: at.phase }).then((report) => { res.json(report); }, next);
  });
  return router;
}
