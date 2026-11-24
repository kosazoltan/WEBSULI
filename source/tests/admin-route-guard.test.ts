/**
 * JM7a — regressziós őr (docs/specs/2026-11-16-jatekok-jatekelmeny.md 10.4 (d), JM-A12; tulajdonosi G11 / D12:
 * „Az admin felülethez senki nem férhet hozzá, csak az adminok.”).
 *
 * A szerver valódi útvonal-felcsatolását (`mountAppRoutes` — ugyanaz, amit az index.ts hív) építi fel adatbázis nélkül, és a
 * router-verem bejárásával ellenőrzi:
 *  (1) az admin előtagok (`/api/admin`, `/api/studio`) alatti MINDEN végpont láncában ott van az `isAuthenticatedAdmin`
 *      (a végső kezelő ELŐTT, a saját láncában — testvér-router őre nem számít);
 *  (2) az előtagon kívüli, név szerint rögzített adminvégpontok őre megmaradt;
 *  (3) a játékos-végpontok (`/api/player/*`) nem kerülhetnek admin előtag alá.
 * A dinamikus (HTTP) mátrix: tests/admin-authz-matrix-db.integration.ts (eldobható adatbázison).
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import express, { type RequestHandler } from "express";
import { ADMIN_PREFIXES, isUnderAdminPrefix, routeInventory, type Endpoint } from "./support/route-inventory";

// Adatbázishoz NEM kapcsolódunk: elérhetetlen loopback-cím (a pool csak naplóz, kérés nincs).
process.env.DATABASE_URL = "postgresql://authz:authz@127.0.0.1:1/authz_guard";
process.env.SESSION_SECRET ??= "admin-route-guard-test-secret-0123456789";
// A Google-utak is felcsatolódjanak (élesben be vannak állítva), így a leltár az éles útvonal-készlet.
process.env.GOOGLE_CLIENT_ID ??= "guard-test-client-id";
process.env.GOOGLE_CLIENT_SECRET ??= "guard-test-client-secret";

const { isAuthenticatedAdmin } = await import("../server/auth");
const { mountAppRoutes } = await import("../server/app-routes");
const { isOwnDataGuard, isPlayerGuard, requirePlayerAccountsFlag } = await import("../server/player/require-player");

function unguardedAdminEndpoints(endpoints: readonly Endpoint[], guard: RequestHandler): string[] {
  return endpoints.filter((e) => isUnderAdminPrefix(e.path) && !e.chain.includes(guard)).map((e) => `${e.method} ${e.path}`);
}

/** Az admin előtagon KÍVÜLI adminvégpontok (terv 10.4 végpont-felmérés, 2026-11-16). Új ilyen végpont ide kerül. */
const PINNED_ADMIN_ENDPOINTS = [
  "GET /api/static-audit",
  "POST /api/html-files",
  "PATCH /api/html-files/:id",
  "PUT /api/html-files/:id/tracks", // #1986: anyag csoporttagsága (kézi admin-írás)
  "POST /api/html-files/reorder",
  "DELETE /api/html-files/:id",
  "POST /api/html-files/:id/send-email",
  "GET /api/extra-emails",
  "PATCH /api/extra-emails/:id/classrooms",
  "PATCH /api/extra-emails/:id/student",
  "GET /download-source-static",
] as const;

/**
 * Biztonsági review #445 (A1): MINDEN nem admin-őrzött végpont tételesen, indoklással. Új, be nem sorolt végpont
 * (bármely metódus — az állapotváltoztató és az érzékeny GET is) → a teszt bukik: a szerzőnek döntenie kell, hogy
 * admin előtag / rögzített adminvégpont / szándékosan nyilvános (más őrrel). Elavult (már nem létező vagy azóta
 * admin-őrzött) tétel is bukás, így a lista mindig a valós állapot.
 */
/** N2 (tulajdonosi döntés 2026-11-16): a tiltott játékost is beengedő „saját adat” őr (`requireOwnData`) végpontjai — CSAK ezek. */
const OWN_DATA = new Set(["POST /api/player/export", "POST /api/player/account/delete/start", "POST /api/player/account/delete"]);

const PUBLIC_ENDPOINTS: Record<string, string> = {
  "GET /api/tracks/mine": "#1986: a bejelentkezett fiók saját csoportjai (vendégnek üres lista; csak a munkamenet saját fiókkulcsa)",
  "GET /auth/google": "Google-belépés indítása (OAuth)",
  "GET /auth/google/callback": "Google OAuth visszahívás (Passport, session-regenerate)",
  "POST /api/login": "helyi belépés — Origin-allowlist + login-korlát",
  "POST /api/logout": "kijelentkezés — Origin-allowlist",
  "POST /api/error-report": "szerver-szerver hibajelentés — HMAC-aláírás (verifyErrorReportSignature)",
  "POST /api/client-error": "böngészős hibajelentés — Origin-allowlist + IP-korlát + napi plafon",
  "GET /api/design-assets/:id/thumb": "nyilvános arculati kép (csak olvasás)",
  "GET /api/design-assets/:id": "nyilvános arculati kép (csak olvasás)",
  "POST /api/lessons/arbiter": "nyilvános döntőbíró — Origin-allowlist + IP-korlát, munkamenet-jog nélkül",
  "POST /api/lessons/:lessonId/results": "tanulói eredmény e-mail az adminoknak — CSRF + korlát",
  "GET /api/advent/status": "adventi naptár — a kártya láthatósága; mellékhatás nélkül, flag mögött",
  "GET /api/advent/state": "adventi naptár — saját állapot olvasása; mellékhatás nélkül (sort nem hoz létre), IP-korlát",
  "POST /api/advent/grade": "adventi naptár — saját sor (évfolyam), CSRF + alanyonkénti és IP-korlát",
  "POST /api/advent/doors/:day/open": "adventi naptár — saját sor (kérdés megnyitása), CSRF + alanyonkénti és IP-korlát",
  "POST /api/advent/doors/:day/answer": "adventi naptár — saját sor (válasz), CSRF + alanyonkénti és IP-korlát",
  "POST /api/advent/round": "adventi naptár — saját sor (új kör), CSRF + alanyonkénti és IP-korlát",
  "POST /api/advent/adopt": "adventi naptár — a saját vendégsor átvétele a tanulóhoz (idempotens), CSRF + alanyonkénti és IP-korlát",
  "POST /api/lessons/practice/:lessonId/start": "gyakorlás — bejelentkezett users-felhasználó (saját sor)",
  "GET /api/lessons/practice/:lessonId/review": "gyakorlás — saját adat",
  "GET /api/lessons/practice/:id": "gyakorlás — saját adat",
  "POST /api/lessons/practice/:id/answer": "gyakorlás — saját sor, CSRF",
  "POST /api/lessons/practice/:id/finish": "gyakorlás — saját sor, CSRF",
  "POST /api/lessons/practice/:id/hint": "gyakorlás — saját sor, CSRF",
  "GET /api/lessons/review/:lessonId": "ismétlés — saját adat",
  "POST /api/lessons/review/:lessonId/rate": "ismétlés — saját sor, CSRF",
  "GET /api/lessons/by-file/:htmlFileId": "publikált lecke olvasása",
  "GET /api/lessons": "publikált leckék listája",
  "GET /api/lessons/:id/clips": "publikált lecke kisfilmjei",
  "GET /api/lessons/:id/material": "publikált lecke anyaga",
  "POST /api/lessons/:id/proba": "Próba kiértékelése (nyilvános, CSRF)",
  "POST /api/lessons/coupons/:id/start": "kupon — bejelentkezett users-felhasználó, saját sor, CSRF",
  "GET /api/lessons/coupons/active": "kupon — saját adat",
  "POST /api/lessons/coupons/:id/bonus": "kupon — saját sor, CSRF",
  "GET /api/lesson-clips/media/:id": "tartalomcímzett kisfilm-média (nyilvános olvasás)",
  "GET /api/player/status": "JM7a: { enabled } — nyilvános, PII nélkül",
  "POST /api/player/auth/start": "JM7a: kódkérés — flag, Origin-allowlist, IP- és címenkénti korlát, globális levélplafon",
  "POST /api/player/auth/link-info": "JM7a: link-ellenőrzés beváltás nélkül — flag, Origin-allowlist, IP-korlát",
  "POST /api/player/auth/verify": "JM7a: beváltás — flag, Origin-allowlist, IP-korlát, fiókonkénti hibás-próba plafon",
  "POST /api/player/auth/logout": "JM7a: kijelentkezés — flag, Origin-allowlist",
  "GET /api/player/me": "JM7a: saját játékos (requirePlayer), e-mail nélkül",
  "GET /auth/player/google": "JM7b: játékos Google-út indítása — flag, külön stratégia, state + PKCE, élő fiók-munkamenet mellett nem indul",
  "GET /api/player/account": "JM7b: saját fiók — flag + requirePlayer, maszkolt cím",
  "GET /api/player/nickname-suggestions": "JM7b: becenév-ajánlás — flag + requirePlayer + korlát",
  "POST /api/player/profile": "JM7b: becenév / avatar — flag + requirePlayer + CSRF + Origin + korlát, szűrő",
  // Review #449 (K2): a link-learner csak a kapcsolatot rögzíti — a játékos-felületre tanulói adat (név, évfolyam, eredmény)
  // ebben a szeletben NEM kerül. Ha egy későbbi szelet ilyet hozna (a végpont válasza vagy egy új /api/player/* végpont), az
  // ÚJ független biztonsági review-t igényel (közös eszköz, testvér-forgatókönyv).
  "POST /api/player/link-learner": "JM7b: tanulói profil összekapcsolása — flag + requirePlayer + CSRF + Origin + aláírt tanulói token + megerősítés + friss belépés",
  "POST /api/player/unlink-learner": "JM7b: összekapcsolás bontása — flag + requirePlayer + CSRF + Origin",
  "POST /api/player/export": "JM7b: adatletöltés (csak saját) — flag + requireOwnData (N2: tiltott is) + CSRF + Origin + óránkénti korlát",
  "POST /api/player/account/delete/start": "JM7b: törlési kód a fiók címére — flag + requireOwnData (N2: tiltott is) + CSRF + Origin + korlát, a belépőkód-keret",
  "POST /api/player/account/delete": "JM7b: fióktörlés — flag + requireOwnData (N2: tiltott is) + CSRF + Origin + megerősítő szó + e-mailben küldött egyszeri kód",
  "POST /api/rt/ticket": "JM2/JM3a: valós idejű belépőjegy — MP_MODE (off → 404; admin → szobát csak admin nyit, csatlakozni bárki; on → nyitás fiók / tanulói profil / admin, ACCOUNT_REQUIRED), Origin-allowlist, IP-korlát; csatlakozó vendég generált becenévvel",
  "GET /api/rt/status": "JM2: { enabled, mode, szoba- és meccsszám } — nyilvános, PII nélkül (telepítés előtti őr)",
  "GET /api/auth/user": "saját felhasználó (vagy null)",
  "GET /api/csrf-token": "CSRF-token",
  "GET /api/health": "állapot",
  "GET /health": "állapot",
  "GET /api/config": "nyilvános kliens-beállítás",
  "POST /api/material-result": "tananyag-iframe eredmény — Origin-allowlist + korlátok",
  "GET /api/learner/me": "tanulói profil — aláírt tanulói token + korlát",
  "GET /api/learner/view/:materialId": "tanulói megtekintés — aláírt tanulói token + korlát",
  "GET /api/games/catalog": "játékkatalógus (nyilvános)",
  "GET /api/games/quiz-bank/:gameId": "játék kérdésbank (nyilvános)",
  "GET /api/games/material-quizzes": "tananyag-kvízek (nyilvános)",
  "GET /api/games/leaderboard": "ranglista — becenév, PII nélkül (JM0)",
  "GET /api/games/sync-eligibility": "saját jogosultság",
  "POST /api/games/score": "pontmentés — isAuthenticated + korlátok + runId-dedup (JM0)",
  "GET /api/push/vapid-public-key": "nyilvános VAPID-kulcs",
  "POST /api/subscribe-email": "feliratkozás — CSRF + feliratkozási korlát",
  "GET /api/html-files": "publikus tananyaglista",
  "GET /api/html-files/search": "publikus keresés",
  "GET /api/html-files/:id": "publikus tananyag",
  "GET /api/tts/audio": "felolvasás — korlát",
  "GET /api/tts/lesson-audio/:id": "S8b: előre gyártott leckehang — csak olvasás, tartalomcímzett, korlát",
  "GET /api/tts/lesson-audio/available": "S8b: a hangtár elérhetőségi jegyzéke — csak olvasás, csak kulcsformátum, darabszám-plafon, korlát",
  "POST /api/tts": "felolvasás — CSRF + korlát",
  "POST /api/push/subscribe": "push-feliratkozás — CSRF + korlát",
  "POST /api/push/unsubscribe": "push-leiratkozás — CSRF + korlát",
  "GET /dev/:id": "tananyag nyers HTML-je az iframe-nek (nyilvános olvasás)",
  "GET /api/pdf/:id": "publikus PDF",
  "GET /api/tags": "címkék (nyilvános)",
  "GET /api/materials/:id/tags": "címkék (nyilvános)",
  "GET /api/materials/:id/likes": "kedvelésszám (nyilvános)",
  "POST /api/materials/:id/likes/check": "kedvelés-állapot (nem ír) — Origin-allowlist",
  "POST /api/materials/:id/likes": "kedvelés — CSRF + korlát",
  "DELETE /api/materials/:id/likes": "kedvelés visszavonása — CSRF + korlát",
  "POST /api/materials/likes/batch": "kedvelés-állapot csomagban (nem ír) — Origin-allowlist",
  "GET /api/materials/:id/comments": "kommentek (nyilvános)",
  "POST /api/materials/:id/comments": "komment — CSRF + korlát",
  "GET /api/materials/:id/qr": "QR-kód (nyilvános)",
  "GET /sitemap.xml": "oldaltérkép",
  "GET /robots.txt": "robots",
};

const app = express();
await mountAppRoutes(app);
const inventory = routeInventory(app);
const key = (e: Endpoint) => `${e.method} ${e.path}`;

describe("JM7a — admin-útvonal regressziós őr", () => {
  it("a leltár nem üres és tartalmazza az ismert végpontokat (a bejárás nem csendesen üres)", () => {
    const keys = new Set(inventory.map(key));
    assert.ok(inventory.length >= 150, `legalább 150 végpont kell, ennyi lett: ${inventory.length}`);
    for (const k of ["GET /api/admin/users", "POST /api/studio/lessons/one-step", "GET /api/admin/catalog/summary", "GET /api/auth/user", "GET /auth/google/callback"]) {
      assert.ok(keys.has(k), `hiányzik a leltárból: ${k}`);
    }
    const adminCount = inventory.filter((e) => isUnderAdminPrefix(e.path)).length;
    assert.ok(adminCount >= 90, `legalább 90 admin-előtagú végpont várt, ennyi lett: ${adminCount}`);
  });

  it("adventi naptár S6 (A16): az admin-előnézet minden végpontja — az olvasás, az írások és a saját előnézeti sor törlése (DELETE), valamint a levelek száraz összesítője (P-056) — admin előtag alatt, isAuthenticatedAdmin-nal", () => {
    const byKey = new Map(inventory.map((e) => [key(e), e]));
    const expected = [
      "GET /api/admin/advent/preview/status", "GET /api/admin/advent/preview/state", "POST /api/admin/advent/preview/grade",
      "POST /api/admin/advent/preview/doors/:day/open", "POST /api/admin/advent/preview/doors/:day/answer",
      "POST /api/admin/advent/preview/round", "POST /api/admin/advent/preview/adopt", "DELETE /api/admin/advent/preview", "GET /api/admin/advent/mail-report",
    ];
    for (const k of expected) {
      const e = byKey.get(k);
      assert.ok(e, `hiányzik a leltárból: ${k}`);
      assert.ok(e.chain.includes(isAuthenticatedAdmin), `${k}: hiányzik az isAuthenticatedAdmin`);
    }
    // A nyilvános naptár és az előnézet külön útvonal: a nyilvános /api/advent/* nem kerül admin előtag alá (és fordítva).
    assert.ok(inventory.filter((e) => e.path.startsWith("/api/advent/")).every((e) => !e.chain.includes(isAuthenticatedAdmin)));
  });

  it("az admin előtagok alatt MINDEN végpont isAuthenticatedAdmin-nal védett", () => {
    assert.deepEqual(unguardedAdminEndpoints(inventory, isAuthenticatedAdmin), []);
  });

  it("az előtagon kívüli, rögzített adminvégpontok őre megvan", () => {
    const byKey = new Map(inventory.map((e) => [key(e), e]));
    for (const k of PINNED_ADMIN_ENDPOINTS) {
      const e = byKey.get(k);
      assert.ok(e, `a rögzített adminvégpont eltűnt a leltárból (ha átnevezték, a listát is frissítsd): ${k}`);
      assert.ok(e.chain.includes(isAuthenticatedAdmin), `${k}: hiányzik az isAuthenticatedAdmin`);
    }
  });

  it("minden admin-őrzött végpont vagy admin előtag alatt van, vagy a rögzített listán (új adminvégpont nem bújhat el)", () => {
    const pinned = new Set<string>(PINNED_ADMIN_ENDPOINTS);
    const stray = inventory
      .filter((e) => e.chain.includes(isAuthenticatedAdmin) && !isUnderAdminPrefix(e.path) && !pinned.has(key(e)))
      .map(key);
    assert.deepEqual(stray, []);
  });

  it("review #445 (A1): minden NEM admin-őrzött végpont tételesen, indoklással a nyilvános listán — új, be nem sorolt végpont bukás", () => {
    const unguarded = inventory.filter((e) => !e.chain.includes(isAuthenticatedAdmin)).map(key);
    const unlisted = unguarded.filter((k) => !(k in PUBLIC_ENDPOINTS));
    assert.deepEqual(unlisted, [], "új, admin-őr nélküli végpont: tedd admin előtag alá / őrizd, vagy indokold a PUBLIC_ENDPOINTS-ban");
    const stale = Object.keys(PUBLIC_ENDPOINTS).filter((k) => !unguarded.includes(k));
    assert.deepEqual(stale, [], "elavult nyilvános tétel (már nincs, vagy azóta admin-őrzött) — töröld a listából");
    for (const [k, why] of Object.entries(PUBLIC_ENDPOINTS)) assert.ok(why.trim().length >= 5, `${k}: hiányzó indoklás`);
  });

  it("a játékos-végpontok nem kerülnek admin előtag alá", () => {
    const misplaced = inventory.filter((e) => e.path.includes("/player") && isUnderAdminPrefix(e.path)).map(key);
    assert.deepEqual(misplaced, []);
  });

  it("JM7b: minden /api/player/* végpont requirePlayer mögött van — kivéve a belépés előtti, tételesen indokolt utakat", () => {
    // A belépés előtt hívottak (nincs még játékos-munkamenet), és a /me, amely munkamenet nélkül null-t ad (a kezelőben hívja az őrt).
    const PRE_LOGIN = new Set(["GET /api/player/status", "POST /api/player/auth/start", "POST /api/player/auth/link-info",
      "POST /api/player/auth/verify", "POST /api/player/auth/logout", "GET /api/player/me"]);
    const player = inventory.filter((e) => e.path.startsWith("/api/player/"));
    assert.ok(player.length >= 13, `legalább 13 játékos-végpont várt, ennyi lett: ${player.length}`);
    const guarded = (e: (typeof player)[number]) => e.chain.some(isPlayerGuard) || (OWN_DATA.has(key(e)) && e.chain.some(isOwnDataGuard));
    const unguarded = player.filter((e) => !PRE_LOGIN.has(key(e)) && !guarded(e)).map(key);
    assert.deepEqual(unguarded, []);
    // Az őr a flag-őr UTÁN áll (kikapcsolt flag mellett előbb a 404, DB-hívás nélkül).
    for (const e of player.filter((x) => x.chain.some(isPlayerGuard) || x.chain.some(isOwnDataGuard))) {
      const flagAt = e.chain.indexOf(requirePlayerAccountsFlag);
      const guardAt = e.chain.findIndex((fn) => isPlayerGuard(fn) || isOwnDataGuard(fn));
      assert.ok(flagAt >= 0 && flagAt < guardAt, `${key(e)}: a flag-őr a játékos-őr előtt kell`);
    }
  });

  it("N2: a tiltottat is beengedő „saját adat” őr PONTOSAN az export / törlési kód / törlés végponton van, máshol sehol", () => {
    const withOwnData = inventory.filter((e) => e.chain.some(isOwnDataGuard)).map(key).sort();
    assert.deepEqual(withOwnData, [...OWN_DATA].sort());
    // Ezeken nincs requirePlayer is (a tiltott különben 403-at kapna) — és a forrásban az őrt csak a fiók-router hozza létre.
    for (const e of inventory.filter((x) => x.chain.some(isOwnDataGuard))) assert.ok(!e.chain.some(isPlayerGuard), key(e));
    const serverDir = fileURLToPath(new URL("../server/", import.meta.url));
    const users = readdirSync(serverDir, { recursive: true, encoding: "utf8" })
      .filter((f) => f.endsWith(".ts") && readFileSync(`${serverDir}${f}`, "utf8").includes("createRequireOwnData("))
      .map((f) => f.split("\\").join("/")).sort();
    assert.deepEqual(users, ["player/account-routes.ts", "player/require-player.ts"]);
  });

  it("JM7b: az admin „Játékosok” végpontjai admin előtag alatt, isAuthenticatedAdmin-nal", () => {
    const admin = inventory.filter((e) => e.path.startsWith("/api/admin/game-accounts"));
    assert.deepEqual(admin.map(key).sort(), [
      "GET /api/admin/game-accounts", "GET /api/admin/game-accounts/:id/email", "GET /api/admin/game-accounts/deleted-bans",
      "GET /api/admin/game-accounts/email-collisions", // P-020: azonos postafiókú fiókok listája (csak olvasás)
      "POST /api/admin/game-accounts/:id/ban", "POST /api/admin/game-accounts/:id/delete", "POST /api/admin/game-accounts/:id/unban",
      "POST /api/admin/game-accounts/:id/unlink-learner", "POST /api/admin/game-accounts/deleted-bans/:ref/unban",
    ]);
    for (const e of admin) assert.ok(e.chain.includes(isAuthenticatedAdmin), `${key(e)}: hiányzik az admin-őr`);
  });
});

describe("JM7a — az őr maga is bukik, ha kell (önellenőrzés)", () => {
  it("őrizetlen admin-útvonalat, későn felrakott router-őrt és testvér-router őrét NEM fogadja el", () => {
    const probe = express();
    probe.get("/api/admin/open", (_req, res) => res.end());
    probe.get("/api/admin/ok", isAuthenticatedAdmin, (_req, res) => res.end());
    const late = express.Router();
    late.get("/late", (_req, res) => res.end());
    late.use(isAuthenticatedAdmin); // az útvonal UTÁN: nem véd
    probe.use("/api/studio", late);
    const guarded = express.Router();
    guarded.use(isAuthenticatedAdmin);
    guarded.get("/guarded", (_req, res) => res.end());
    probe.use("/api/studio", guarded);
    const sibling = express.Router(); // a fenti testvér-router őre ide nem számít
    sibling.get("/sibling", (_req, res) => res.end());
    probe.use("/api/studio", sibling);
    const pathGuarded = express.Router();
    pathGuarded.get("/users", (_req, res) => res.end());
    probe.use("/api/admin/x", isAuthenticatedAdmin, pathGuarded);
    const found = unguardedAdminEndpoints(routeInventory(probe), isAuthenticatedAdmin);
    assert.deepEqual(found.sort(), ["GET /api/admin/open", "GET /api/studio/late", "GET /api/studio/sibling"]);
  });

  it("review #445 (A1): egy admin előtagon KÍVÜLI, őr nélküli új írás-végpontot a nyilvános lista-szabály elkap", () => {
    const probe = express();
    probe.post("/api/materials/:id/approve-comment", (_req, res) => res.end());
    const unlisted = routeInventory(probe).filter((e) => !e.chain.includes(isAuthenticatedAdmin)).map(key).filter((k) => !(k in PUBLIC_ENDPOINTS));
    assert.deepEqual(unlisted, ["POST /api/materials/:id/approve-comment"]);
  });

  it("az admin előtagok listája a terv szerinti", () => {
    assert.deepEqual([...ADMIN_PREFIXES], ["/api/admin", "/api/studio"]);
  });
});
