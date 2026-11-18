# Végrehajtási utasítás — eredmény-e-mail S2: atomi foglalás + szerveres kvíz az utolsó válasznál

**Állapot:** kész, PR előtt – 2026-11-17, ág `fix/eredmeny-email-foglalas`
Terv: `docs/specs/2026-11-17-eredmeny-email-foglalas.md`

Útvonalak a `source/` alatt. Migráció és sémaváltozás NINCS; `npm run db:push` tilos. Valódi levél nem megy (a tesztek a
`setResultSender` küldőjét használják).

## T1 — atomi foglalás (`server/lesson-result-email.ts`, `sendLessonResult`)

A `missing` kiszámítása után, a levél összeállítása előtt:

1. `claimed`: a `missing` címzettjein sorban
   `db.update(lessonResultEmails).set({ delivered: sql\`array_append(${lessonResultEmails.delivered}, ${to})\` }).where(and(eq(id, claim.id), sql\`NOT (${to} = ANY(${lessonResultEmails.delivered}))\`)).returning({ id })`
   — akinél jött vissza sor, az a hívásé.
2. Ha `claimed` üres → `{ sent: 0, duplicate: true }` (más hívás küldi / küldte).
3. Küldés csak a `claimed` címzetteknek (`Promise.allSettled`).
4. A bukott címzettek foglalásának felszabadítása: `array_remove(delivered, to)` (címzettenként); a figyelmeztetés és a 60 s-os
   újrapróba változatlan.
5. Visszatérés: `{ sent: sikeresek száma, duplicate: false }`. A régi, küldés utáni `delivered`-visszaírás megszűnik.

## T2 — szerveres kvíz (`server/rewards/lesson-attempts.ts`, `answerPractice`)

A `withAttempt` visszahívásában az új válasz mentése után: ha `saved.status === "active"` és `saved.questions.every(q => saved.answers[q.id])`,
a mentett sor egy külső változóba kerül; a tranzakció UTÁN (a `finishPractice` mintájára)
`void import("../lesson-result-email").then(m => m.sendPracticeResult({ userId, attemptId, lessonId, questions, answers }))` naplózott
hibakezeléssel. A már megválaszolt kérdés ismételt (idempotens) hívása nem küld.

## T3 — tesztek (valódi, eldobható PostgreSQL: `npm run test:learning-db`)

`tests/lesson-result-email-db.integration.ts` ÚJ esetei (meglévő nem módosul):

- párhuzamos: lassú (150 ms) küldővel `Promise.all` két / öt azonos `sendLessonResult` → összesen 2 levél (admin-a, admin-b),
  pontosan egy hívás `sent: 2`, a többi `{ sent: 0, duplicate: true }`; a `delivered` két elemű, ismétlődés nélkül;
- bukás párhuzamosan: admin-b küldése elbukik → a `delivered` csak admin-a; újrahívás → csak admin-b kap; összesen címzettenként 1.

`tests/learning-db.integration.ts` ÚJ esete: küldő beállítva, `ADMIN_EMAILS` a teszt idejére; `beginPractice` → minden kérdés
megválaszolva → a levél lezárás NÉLKÜL megérkezik (címzettenként 1, „— Kvíz —” tárgy); az utolsó válasz ismételt hívása és a
`finishPractice` (6 egyidejű hívással) után is címzettenként 1. Hiányos kör: az utolsó előtti válasz után nincs levél.

Mutációs ellenpróba: (a) a foglalás feltétele (`NOT … = ANY`) elhagyva → a párhuzamos teszt bukik; (b) a felszabadítás elhagyva →
a pótlás-teszt bukik; (c) az `answerPractice` küldése elhagyva → az új kvíz-teszt bukik.

## T4 — kapuk

`npm run gate:stage`, `npm run test:learning-db` (sorompó előtte külön lépésben: saját eldobható konténert indít), `npm run gate:push`.
Push / PR nincs: fej-hash, utána a független ellenőr.
