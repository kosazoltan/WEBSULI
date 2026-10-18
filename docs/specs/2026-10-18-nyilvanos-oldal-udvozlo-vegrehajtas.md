# Nyilvános oldal: üdvözlő ajánló — végrehajtási utasítás (ügynöknek)

Terv: `docs/specs/2026-10-18-nyilvanos-oldal-udvozlo.md`. Munkakönyvtár: `source/`. Ág: `feat/nyilvanos-udvozlo`.

## 1. `client/src/lib/learner.ts` (új, tiszta függvények + `localStorage`)
- **Tárolás:**
  - `LEARNER_NAME_KEY = "websuli.learnerName"`;
  - `loadLearnerName(): string | null`;
  - `saveLearnerName(name: string): string | null` — trimmel, a belső szóközöket összevonja, 40 karakterre vág, üresnél `null`.
    `try/catch` a tárolásra.
  - `clearLearnerName()`.
- **`normalizeLearnerName(raw)`:** a tiszta logika, a fenti szabályokkal.
- **`MOTIVATION_LINES`:** 8 rövid, magyar, lelkesítő mondat.
- **`motivationFor(name, date)`:** a nap sorszáma és a név hossza szerint választ, így naponta determinisztikus.
- **`newestMaterials(files, grade, now, limit = 3)`:**
  - ha van `grade`, előbb az évfolyam anyagai, `createdAt` szerint csökkenő sorrendben;
  - előnyben a legfeljebb 30 naposak; ha nincs ilyen, a legfrissebbek;
  - ha az évfolyamon nincs anyag, az összes közül választ;
  - visszatérés: `{ files, isNew(file) }` — `isNew` a 30 napnál frissebbekre igaz.
- **Teszt:** `tests/learner.test.ts` — normalizálás (üres, szóközök, 40+ karakter), napi determinizmus, évfolyam-szűrés,
  évfolyam nélküli eset, tartalék az összes évfolyamra, 30 napos ablak.

## 2. `client/src/components/WelcomeCard.tsx` (új)
- **Props:** `files`, `onViewFile`.
- **Név forrása:** `useAuth().user?.firstName` → `loadLearnerName()`.
- **Évfolyam:** `useClassroomGrade` (classroomStore).
- **Állapotok:**
  - **`ask`:**
    - `<form data-testid="welcome-ask">` név-input (`data-testid="welcome-name"`, `maxLength=40`, `aria-label="Keresztneved"`);
    - évfolyam-select (`welcome-grade`; „Nem mondom meg”, 1–12, 0 = programozás);
    - „Mehet” (`welcome-save`) és „Most nem” (`welcome-dismiss`) gomb;
    - a „Most nem” a `sessionStorage` `websuli.welcomeDismissed` kulcsát írja.
  - **`greet`:**
    - `<section data-testid="welcome-greet">` „Szia, {név}!” (`h2`), a lelkesítő mondat (`welcome-motivation`);
    - a legújabb ≤3 anyag gombként: `data-testid="welcome-pick-<id>"`, kattintásra `onViewFile`; „Új” jelvény;
    - „Nem te vagy? Módosítás” link (`welcome-edit`) → `ask`, az előző értékekkel kitöltve.
  - **Rejtett:** ha a „Most nem” élő a munkamenetben, és nincs név.
- **Stílus:** a meglévő színek (`glass-card`, narancs gradiens gombok, `bg-white/20` mezők); minden gomb legalább 44 px.
- **Hely:** `UserFileList.tsx` — a `HeroSection` után, a szűrő előtt: `<WelcomeCard files={files} onViewFile={onViewFile} />`.

## 3. Átláthatóbb lista (`client/src/components/UserFileList.tsx`)
- Az évfolyam-jelvények csak a `availableClassrooms` elemeire renderelődnek; a „(0)” ág és az `aria-disabled` megszűnik.
- **Betűméret- és osztálycserék:**

  | Elem | Régi osztály | Új osztály |
  |---|---|---|
  | kártyacím | `text-xs` | `text-sm` |
  | leírás | `text-[10px]` | `text-xs` |
  | jelvény | `text-[9px] … h-4` | `text-[11px] … h-5` |
  | „Most tanuljuk” | `text-[10px]` | `text-[11px]` |
  | „Tananyagok” címsor | `text-xs sm:text-sm` | `text-base` |

- **A színosztályok nem változnak.**

## 4. Tesztek
- **`tests/learner.test.ts`:** az 1. pont esetei.
- **`tests/welcome-card.spec.ts`** (390 és 1366 px, a `curriculum-order.spec` mock-mintájával), a `localStorage` üresen indul:
  - látszik a `welcome-ask`, a lista kártyái kattinthatók;
  - név „Bence” + évfolyam 5 + „Mehet” → `welcome-greet` „Szia, Bence!”, a legújabb 5. évfolyamos anyag elöl, legfeljebb 3 kártya;
  - újratöltés után is üdvözöl;
  - „Módosítás” → ask;
  - másik kontextusban a „Most nem” → nincs `welcome-ask` újratöltés után sem, ugyanabban a munkamenetben;
  - bejelentkezett felhasználó (`/api/auth/user` → `{ firstName: "Anna" }`) → „Szia, Anna!” kérdés nélkül;
  - nincs vízszintes túlcsordulás.
- **Futtatandó meglévő tesztek** (változatlanul zöld): `tests/curriculum-order.spec.ts` és a `tests/websuli.spec.ts` szűrő-tesztjei.

## 5. Verifikáció
- `npx.cmd tsc --noEmit -p .`, `npm.cmd run check:test`, `npx.cmd eslint` (érintett fájlok), `npm.cmd test`, `npm.cmd run build`.
- `npx.cmd playwright test tests/welcome-card.spec.ts tests/curriculum-order.spec.ts tests/websuli.spec.ts`.
- Deploy után élesben (Chrome, Browser 2):
  - névkérés;
  - üdvözlés a legújabb anyagokkal;
  - képernyőkép 1366 és 390 px-en.
