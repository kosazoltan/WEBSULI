# Végrehajtás — NAT 2020 6. évfolyam tudásbázis

## Task 1 — Kivonatok a repóba

1. Másold a scratch `extracted/*.grade6.txt` fájlokat `docs/knowledge/nat2020-6/extracts/` alá.
2. Írd meg `docs/knowledge/nat2020-6/SOURCE.md`: OH URL-ek, letöltés dátuma, fájlnév, byte.

Ellenőrzés: `ls docs/knowledge/nat2020-6/extracts` ≥ 8 txt.

## Task 2 — Térkép-JSON + teszt

1. RED: `source/tests/nat2020-grade6-maps.test.ts` — `knowledgeMapSchema.safeParse` minden `docs/knowledge/nat2020-6/maps/*.json`-ra; `quote` részsztringje a `sourceRef.file` kivonatának.
2. Parancs: `cd source && npx tsx --test tests/nat2020-grade6-maps.test.ts` — FAIL fájlhiányra.
3. GREEN: `Témakör:` / `Fogalmak` bekezdésekből térkép JSON, idézet a kivonatból.

## Task 3 — Éles katalógus

1. `curl -sS -o NUL -w "%{http_code}" https://websuli.vip/api/studio/maps`
2. Ha 401: jegyezd BLOCKED, ne hamisíts publikálást.
3. Ha 200: `POST /api/studio/lessons/one-step` a Természettudomány + Matematika DOCX data-URL-lel; poll `GET /lessons/one-step/:runId` done-ig; `GET /api/html-files` classroom=6 új id.

## Task 4 — Kanban

`kanban note 1` a mért kimenettel; `review` ha a teszt GREEN.

## Állapot (2026-11-03, teljességellenőrzés)

- Task 1 — KÉSZ: 10 kivonat a `docs/knowledge/nat2020-6/extracts/` alatt, `SOURCE.md` megvan.
- Task 2 — KÉSZ: 8 térkép; `python -I docs/knowledge/nat2020-6/validate_maps.py` → `maps=8 errors=0`;
  `npx.cmd tsx --test tests/nat2020-grade6-maps.test.ts` → pass 1 (x64, `npm.cmd ci` után).
- Task 3 — NOT DONE (BLOCKED): `GET https://websuli.vip/api/studio/maps` → 401, admin-munkamenet nélkül éles
  publikálás tilos. Élő katalógus: 218 anyag, `classroom=6` → 14 (2026-09-29-én 7); hogy ezek közül melyik
  épül e térképekre, UNVERIFIED. Kockázat: a térképek a repóban vannak, de a Studióban még nem használtak.
  Feloldás: a tulajdonos admin-munkamenetében `POST /api/studio/lessons/one-step` a Task 3 szerint.
- Task 4 — KÉSZ: kanban #1 jegyzet a fenti mért kimenettel.
