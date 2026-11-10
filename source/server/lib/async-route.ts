import type { NextFunction, Request, RequestHandler, Response } from "express";

/**
 * Hibavadászat B1: Express 4 nem fogja el az `async` kezelő elutasított ígéretét — kezeletlen marad, és a folyamat kilép.
 * A burkoló a hibát `next(err)`-be vezeti, így a közös hibakezelő JSON 500-at ad.
 */
export function asyncRoute<Req extends Request = Request>(
  handler: (req: Req, res: Response, next: NextFunction) => unknown,
): RequestHandler {
  return (req, res, next) => {
    new Promise(resolve => resolve(handler(req as Req, res, next))).catch(next);
  };
}
