import { createHmac } from "node:crypto";

/**
 * JM0: a nyilvános játék-ranglistán a gyerek valódi neve nem jelenhet meg. A megjelenített név a felhasználó-azonosítóból,
 * kulcsolt HMAC-cel (a SESSION_SECRET-ből levezetett kulcs) képzett „Játékos #xxxx” — stabil (ugyanaz a felhasználó mindig
 * ugyanazt kapja), de a számból a felhasználó nem fejthető vissza. Megjelenítéskor számoljuk, ezért a régi sorokra is érvényes.
 */
function handleKey(env: NodeJS.ProcessEnv = process.env): string {
  const secret = env.SESSION_SECRET;
  // Fejlesztésben / tesztben titok nélkül fix kulcs; élesben az auth.ts úgyis megköveteli a SESSION_SECRET-et.
  return `game-handle|${secret || "websuli-dev-handle-key"}`;
}

export function displayHandle(userId: string, env: NodeJS.ProcessEnv = process.env): string {
  const digest = createHmac("sha256", handleKey(env)).update(`player|${userId}`).digest();
  const n = digest.readUInt32BE(0) % 10000;
  return `Játékos #${String(n).padStart(4, "0")}`;
}
