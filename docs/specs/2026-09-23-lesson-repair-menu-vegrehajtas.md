# Végrehajtás — „Tananyagjavító” menüpont
1. `server/studio/role-skills.ts`: `export function repairRoleSkills()` → `[{ role, version, text }]` az author, lektor, bank, ocr szerepre.
2. `server/workflows/routes.ts`: `GET /skills/tananyag-javito/roles` a `/skills/:skill` ELŐTT (különben a `:skill` útvonal elnyeli).
3. `client/src/components/LessonRepairPanel.tsx`: opcionális `presets?: Array<{ label; text }>` → gombok, amelyek a szöveget a mezőhöz fűzik; `title` prop.
4. Új `client/src/components/LessonRepairWorkbench.tsx`; `client/src/pages/admin.tsx` fül.
5. Teszt: `tests/owner-instructions-repair.test.ts` bővítés a `repairRoleSkills`-re.
6. Kapu: tsc, eslint, `node --test tests/*.test.ts`, build.
