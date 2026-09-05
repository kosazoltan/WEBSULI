import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

/**
 * LS-4c (measured miss, 2026-09-05) — a /lesson/* oldalt a VERCEL szolgálja,
 * nem a Render. A szerveroldali CSP-middleware így sosem futott rajta. A
 * szigorú profil igazi otthona a `source/vercel.json` headers szekciója —
 * ez a teszt ezt a KONFIGURÁCIÓT ratchetheli, mert a korábbi (kódra mutáló)
 * teszt a tényleges kiszolgálási utat nem fogta.
 */

const VERCEL_JSON = new URL("../vercel.json", import.meta.url);
const cfg = JSON.parse(readFileSync(VERCEL_JSON, "utf8")) as {
  headers?: Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
};

function cspOf(sourcePattern: string): string {
  const entry = cfg.headers?.find((h) => h.source === sourcePattern);
  return entry?.headers.find((h) => h.key.toLowerCase() === "content-security-policy")?.value ?? "";
}

test("vercel.json: a /lesson(.*) útvonalnak saját CSP-fejléce van", () => {
  const csp = cspOf("/lesson/(.*)");
  assert.ok(csp.length > 0, "nincs CSP a Vercel /lesson útvonalon");
});

test("vercel.json: a /lesson CSP script-src szigorú (nincs unsafe-inline/eval)", () => {
  const csp = cspOf("/lesson/(.*)");
  const scriptSrc = csp.split(";").map((s) => s.trim()).find((s) => s.startsWith("script-src ")) ?? "";
  assert.ok(scriptSrc.includes("'self'"), "script-src nem tartalmazza a 'self'-et");
  assert.ok(!scriptSrc.includes("unsafe-inline"), "script-src-ben unsafe-inline van");
  assert.ok(!scriptSrc.includes("unsafe-eval"), "script-src-ben unsafe-eval van");
  const scriptSrcAttr = csp.split(";").map((s) => s.trim()).find((s) => s.startsWith("script-src-attr ")) ?? "";
  assert.ok(!scriptSrcAttr.includes("unsafe-inline"), "script-src-attr-ben unsafe-inline van");
});

test("vercel.json: a /dev(.*) útvonalon NEM a szigorú profil fut (örökölt HTML)", () => {
  // A /dev/* rewrite-olt a Renderre, ahol a legacy profil él — a Vercel-oldalon
  // nem szabad a szigorú fejlécet rátenni, mert a dev-HTML inline scriptekkel él.
  assert.equal(cspOf("/dev/(.*)"), "", "a /dev/* kapott CSP-t a Vercel-oldalon");
});
