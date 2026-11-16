/**
 * JM7c-1 forrás-őr (terv 10.4a): az admin-jogot a szerverkód CSAK az egyetlen képlettel (`isAdminUser`,
 * server/lib/admin-access.ts) döntheti el. A nyers `users.is_admin` jelző közvetlen olvasása (`.isAdmin`, `is_admin`,
 * `{ isAdmin }`, `["isAdmin"]`) csak az alábbi, tételesen indokolt sorokban lehet. Új találat → a teszt bukik: ilyenkor a
 * helyes javítás az `isAdminUser(...)` hívása, nem a lista bővítése.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const SERVER = fileURLToPath(new URL("../server", import.meta.url));
const FORBIDDEN = /\.isAdmin\b|\bis_admin\b|\{\s*isAdmin\s*[,}]|,\s*isAdmin\s*[,}]|\[\s*["'`]isAdmin["'`]\s*\]/;

/** Fájl → az engedélyezett sorok mintái (mindegyik indokkal). A képlet modulja egészében engedélyezett. */
const ALLOWED: Record<string, { line: RegExp; why: string }[] | "whole-file"> = {
  "lib/admin-access.ts": "whole-file",
  "auth.ts": [
    { line: /isAdmin: existingUser \? existingUser\.isAdmin : listed/, why: "Google-belépés: a meglévő sor jelzőjét változatlanul visszaírja (nem döntés)" },
    { line: /user\.isAdmin = isAdminUser\(user\);/, why: "deserializeUser: a req.user a SZÁMOLT jogot kapja (írás)" },
  ],
  "admin-users.ts": [
    { line: /const \{ isAdmin \} = \(req\.body \?\? \{\}\)/, why: "toggle-admin: a kérés törzsének kívánt állapota, nem jogosultság-olvasás" },
  ],
  "storage.ts": [
    { line: /if \(userData\.isAdmin !== undefined\)/, why: "upsertUser: a hívó által adott jelző átírása (írás)" },
    { line: /updateData\.isAdmin = userData\.isAdmin;/, why: "upsertUser: a hívó által adott jelző átírása (írás)" },
  ],
  "lib/return-to.ts": [
    { line: /return input\.isAdmin \? "\/admin" : "\/games";/, why: "a hívó (auth.ts) az isAdminUser eredményét adja át" },
  ],
  "studio/legacy-migration.ts": [
    { line: /isAdmin: users\.isAdmin, isBanned: users\.isBanned/, why: "oszlopkiválasztás az isAdminUser-hez" },
    { line: /where\(eq\(users\.isAdmin, true\)\)/, why: "előszűrés; a döntést utána az isAdminUser hozza" },
  ],
  "migrateFromNeon.ts": [
    { line: /is_admin: boolean; \}/, why: "egyszeri adatmigráció: a régi sor típusa" },
    { line: /isAdmin: u\.is_admin,/, why: "egyszeri adatmigráció: másolás" },
    { line: /INSERT INTO users \(.*is_admin\)/, why: "egyszeri adatmigráció: másolás" },
    { line: /user\.isAdmin \? 1 : 0/, why: "egyszeri adatmigráció: másolás" },
  ],
  "scripts/setAdmin.ts": [
    { line: /is_admin/, why: "kézi szkript: a jelző beállítása (figyelmeztet, ha a cím nincs a listán)" },
  ],
};

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.ts$/.test(name) && !/\.d\.ts$/.test(name) ? [full] : [];
  });
}

const stripComments = (line: string) => line.replace(/\/\/.*$/, "").replace(/\/\*.*?\*\//g, "");

describe("JM7c-1 forrás-őr — az admin-jog egyetlen forrása", () => {
  it("a nyers is_admin jelzőt csak a tételesen engedélyezett sorok olvassák", () => {
    const offenders: string[] = [];
    const used = new Set<string>();
    for (const file of walk(SERVER)) {
      const rel = relative(SERVER, file).split(sep).join("/");
      const allowed = ALLOWED[rel];
      if (allowed === "whole-file") continue;
      readFileSync(file, "utf8").split(/\r?\n/).forEach((raw, i) => {
        const line = stripComments(raw);
        if (/^\s*\*/.test(raw) || !FORBIDDEN.test(line)) return;
        const hit = Array.isArray(allowed) ? allowed.find((a) => a.line.test(line)) : undefined;
        if (hit) used.add(`${rel}:${hit.line.source}`);
        else offenders.push(`${rel}:${i + 1}: ${raw.trim()}`);
      });
    }
    assert.deepEqual(offenders, [], "közvetlen admin-jelző olvasás — használd az isAdminUser(...)-t (server/lib/admin-access.ts)");
    // Elavult engedély ne maradjon a listán (a lista csak szűkülhet).
    const stale = Object.entries(ALLOWED).flatMap(([f, a]) => (Array.isArray(a) ? a.filter((x) => !used.has(`${f}:${x.line.source}`)).map((x) => `${f}: ${x.line.source}`) : []));
    assert.deepEqual(stale, [], "a lista elavult bejegyzést tartalmaz");
  });

  it("minden admin-ellenőrző az isAdminUser-t hívja", () => {
    const read = (p: string) => readFileSync(join(SERVER, p), "utf8");
    const auth = read("auth.ts");
    const guard = auth.slice(auth.indexOf("export const isAuthenticatedAdmin"));
    assert.match(guard, /if \(!isAdminUser\(req\.user\)\)/, "isAuthenticatedAdmin");
    const deser = auth.slice(auth.indexOf("passport.deserializeUser"), auth.indexOf("app.post(\"/api/login\""));
    assert.match(deser, /await prepareAdminAccess\(user\);\s*user\.isAdmin = isAdminUser\(user\);/, "deserializeUser");
    assert.match(auth, /isAdmin: isAdminUser\(user\),\s*stored: storedReturnTo/, "Google-belépés utáni cél");
    assert.match(auth, /res\.json\(\{ \.\.\.safeUser, isAdmin: isAdminUser\(user\) \}\)/, "/api/login válasza");
    const routes = read("routes.ts");
    const me = routes.slice(routes.indexOf("app.get('/api/auth/user'"), routes.indexOf("app.get('/api/csrf-token'"));
    assert.match(me, /await prepareAdminAccess\(user\);[\s\S]*isAdmin: isAdminUser\(user\)/, "/api/auth/user");
    assert.match(read("routes/rt.ts"), /const isAdmin = isAdminUser\(user\);/, "valós idejű admin mód");
    assert.match(read("lib/web-lesson-quality-notice.ts"), /showQualityNotice = \(user: unknown\): boolean => isAdminUser\(/, "adminfelirat");
    const users = read("admin-users.ts");
    assert.match(users, /isAdmin: isAdminUser\(u\)/, "Felhasználók lista");
    assert.match(users, /users\.filter\(u => isAdminUser\(u\)\)/, "utolsó-admin őr");
    assert.match(users, /action === "grantAdmin" && !isAllowlistedAdminEmail\(target\.email\)/, "toggle: csak listás cím");
    // Az admin-routerek mind az isAuthenticatedAdmin-t használják (amely a képletet hívja).
    for (const f of ["studio/routes.ts", "studio/lesson-pipeline-routes.ts", "studio/web-research-routes.ts", "workflows/routes.ts", "catalog/admin-routes.ts", "memory/admin-routes.ts", "routes/static-audit.ts"]) {
      assert.match(read(f), /isAuthenticatedAdmin/, f);
    }
    assert.match(routes, /app\.use\('\/api\/admin', isAuthenticatedAdmin, adminRouter\)/);
  });

  it("a meglévő /auth/google stratégia state + PKCE-s (login-CSRF, review #449 K3), a játékos-ág előbb válik le", () => {
    const auth = readFileSync(join(SERVER, "auth.ts"), "utf8");
    const strategy = auth.slice(auth.indexOf("passport.use(new GoogleStrategy({"), auth.indexOf("googleVerify(profile, done)));"));
    assert.match(strategy, /state: true,/);
    assert.match(strategy, /pkce: true,/);
    assert.match(strategy, /store: new AdminStateStore\(\) as never,/);
    const cb = auth.slice(auth.indexOf("app.get('/auth/google/callback'"));
    assert.ok(cb.indexOf("isPlayerState(req.query.state)") < cb.indexOf("passport.authenticate('google'"));
    assert.match(cb, /if \(!user\) return res\.redirect\('\/login\?hiba=google'\);/);
  });

  it("az ADMIN_EMAILS értesítési lista nem jut el a jogosultsághoz", () => {
    const access = readFileSync(join(SERVER, "lib/admin-access.ts"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    assert.doesNotMatch(access, /ADMIN_EMAILS/);
    assert.match(access, /env\.ADMIN_ALLOWLIST/);
    assert.match(access, /env\.ADMIN_EMAIL\b/);
  });
});
