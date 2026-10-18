import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Tanulói profil (docs/specs/2026-10-18-tanuloi-profil.md, S1): a személyes link tokenje `<azonosító>.<verzió>.<aláírás>`.
 * A token nevet nem tartalmaz; a verzió léptetése (learners.token_version) minden párosított eszközt érvénytelenít.
 */
const ID = /^[A-Za-z0-9-]{8,64}$/;
const SIG_LENGTH = 22;

function signature(id: string, version: number, secret: string): string {
  return createHmac("sha256", secret).update(`${id}.${version}`).digest("base64url").slice(0, SIG_LENGTH);
}

export function signLearnerToken(id: string, version: number, secret: string): string {
  return `${id}.${version}.${signature(id, version, secret)}`;
}

export function parseLearnerToken(token: unknown, secret: string): { id: string; version: number } | null {
  if (typeof token !== "string" || token.length > 120) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [id, rawVersion, sig] = parts;
  if (!ID.test(id) || !/^[1-9][0-9]{0,8}$/.test(rawVersion) || sig.length !== SIG_LENGTH) return null;
  const version = Number(rawVersion);
  const expected = Buffer.from(signature(id, version, secret));
  const given = Buffer.from(sig);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return { id, version };
}

/** LEARNER_LINK_SECRET, hiányában SESSION_SECRET; élesben titok nélkül a funkció kikapcsol (null), fejlesztésben fix kulcs. */
export function learnerLinkSecret(env: NodeJS.ProcessEnv = process.env): string | null {
  const secret = env.LEARNER_LINK_SECRET || env.SESSION_SECRET;
  if (secret) return secret;
  return env.NODE_ENV === "production" ? null : "websuli-dev-learner-link";
}
