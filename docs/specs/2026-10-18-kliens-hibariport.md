# Böngészős hibajelentés — külön, titok nélküli végpont (kanban #127)

## Probléma
- **Szerver:** a `/api/error-report` élesben `X-Signature` HMAC-ot követel (`server/routes/error-report.ts`
  `verifyErrorReportSignature`); titok nélkül 503-at ad.
- **Böngésző:** a `client/src/components/ErrorReporter.tsx` `reportError`-ja nem tud aláírni, mert az
  `ERRORLOG_HMAC_SECRET` nem kerülhet a böngészőbe. Ezért élesben minden kliensoldali hiba (`window.onerror`, kezeletlen
  promise, React-renderhiba) 401-et kap. A jelentés elvész, a tulajdonos nem kap hibalevelet.

## Cél
- Új végpont: `POST /api/client-error`, kizárólag a saját böngészős kliensnek, titok nélkül.
- **Védelem az aláírás helyett:**
  1. **Eredet:** Origin/Referer allowlist + same-origin (`enforceOriginAllowlist`, fail-closed). Idegen oldal és fejléc
     nélküli kérés: 403.
  2. **IP-korlát:** 10 jelentés / perc / IP.
  3. **Napi plafon** a teljes végpontra (alap 200 jelentés / budapesti nap, folyamaton belül). Felette 429, és nem ír
     adatbázist, nem küld levelet.
  4. **Mezővágás és típusőr:**
     - az `errorType` csak `^[A-Za-z][A-Za-z0-9_]{0,49}$`, különben `ClientError`;
     - a hosszok a meglévő `MAX_LENGTHS` szerint;
     - a breadcrumbs legfeljebb 50 elem, elemenként legfeljebb 500 karakter (JSON).
  5. **Nem bízunk a kliensben:**
     - a `userId` / `userEmail` a munkamenetből jön (bejelentkezett felhasználó), a kérés törzséből soha;
     - a `requestBody` és a `commitSha` a kliensből nem jön át;
     - az `environment` a szerver `NODE_ENV`-je.
- **Kliens:** a `reportError` az új végpontra küld (`fetch`, `credentials: same-origin`, `keepalive`). Hibát sosem dob.
- **A meglévő `/api/error-report`** HMAC-os szerver–szerver végpont marad, változatlanul.

## Nem-cél
- Hibalevél-formátum, deduplikáció (a `sendErrorReport` ujjlenyomat szerint már dedupol).
- Külső hibakövető (Sentry) bekötése.

## Edge case-ek
- **Ismeretlen eredet:** idegen Origin, vagy Origin és Referer nélküli kérés → 403. A `sendErrorReport` nem fut.
- **Üres üzenet:** 400.
- **Plafon:** a 201. jelentés ugyanazon a budapesti napon 429-et kap. Éjfél (Europe/Budapest) után a számláló nullázódik.
- **Hamisított azonosság:** a kliens által küldött `userEmail` nem jut el a `sendErrorReport`-ig.
- **Sok breadcrumb:** 500 breadcrumb érkezik → legfeljebb 50 megy tovább.
- **Hiba a küldőben:** a válasz 500, a kliens csendben marad (nincs hurok: a `reportError` nem dob).

## Elfogadás (EARS)
- **Engedélyezett eredet:** HA egy engedélyezett eredetű kérés érkezik nem üres üzenettel, AKKOR 202 a válasz, és a
  `sendErrorReport` a megtisztított adattal fut.
- **Tiltott eredet:** HA az eredet nem engedélyezett vagy hiányzik, AKKOR 403 a válasz, és nincs mellékhatás.
- **Napi plafon:** HA a napi plafon elfogyott, AKKOR 429 a válasz, és nincs mellékhatás.
- **Böngésző:** a böngészős `reportError` a `/api/client-error`-t hívja, és nem küld `X-Signature`-t.
- **Teszt:** `tests/client-error-route.test.ts` (HTTP-szintű) lefedi a fenti eseteket; a meglévő
  `tests/error-report-hmac.test.ts` változatlanul zöld.
