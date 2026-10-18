# A lista a tanuló évfolyamára szűrve nyílik — végrehajtási utasítás (ügynöknek)

Terv: `docs/specs/2026-10-18-tanulo-evfolyam-szuro.md`. Munkakönyvtár: `source/`.

1. **`client/src/components/UserFileList.tsx`:**
   - `const { grade } = useClassroomGrade();` (`@/lib/classroomStore`);
   - `selectedClassroom` kezdőértéke: a `grade`, ha van anyag azon az évfolyamon, különben `null`;
   - `useEffect` a `grade` változására: ha van anyag az évfolyamon, a szűrő `grade` lesz. A tárolt érték a kártyán módosul, a
     `websuli:grade-changed` eseményen át.
   - A „Mind” gomb `setSelectedClassroom(null)` (változatlan).
2. **Teszt** (`tests/welcome-card.spec.ts`, új eset):
   - előre beállított `websuli.classroomGrade=5` mellett a lista minden `link-file-*` eleme 5. osztályos, a
     `button-filter-classroom-5` `aria-pressed=true`;
   - a „Mind” után a 8. osztályos anyag is látszik;
   - a kártyán évfolyamot váltva (8) a lista a 8. osztályra szűr.
3. **Ellenőrzés:**
   - `npx.cmd tsc --noEmit -p .`, `npm.cmd test`;
   - `npx.cmd playwright test tests/welcome-card.spec.ts tests/curriculum-order.spec.ts tests/websuli.spec.ts`.
