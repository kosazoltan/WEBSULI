# NAT 2020 6. évfolyam — tudásbázis és tananyag

**Tier:** L  
**Dátum:** 2026-09-29  
**Forrás (mért):** Oktatási Hivatal, 2020-as NAT kerettanterv 5–8. évfolyam, letöltve 2026-09-29 `oktatas.hu/pub_bin/dload/kozoktatas/kerettanterv/`. Élő katalógus: `GET https://websuli.vip/api/html-files` 192 anyag, ebből `classroom=6` **7** tétel. `GET /api/studio/maps` **401** (adminőr él).

## Cél

1. A NAT 2020 **6. évfolyamra vonatkozó** hivatalos kerettantervi szöveget beolvasni (nem kitalálni).
2. Belőle forráshű **tudástérképeket** tenni a WEBSULI-ba (`docs/knowledge/nat2020-6/` + sémaellenőrzött JSON).
3. A fúzió 7.4 / Studio szabályai szerint **hatodikos tananyagot** készíteni, és a nyilvános tananyagok közé tenni.

## Nem cél

- 7–8. évfolyamos diszciplínák (kémia, fizika, biológia, földrajz, állampolgári ismeretek 8.).
- Meglévő 7 db 6. osztályos anyag felülírása.
- Kapu gyengítése (45/75 bank, D1 szó szerinti idézet, évfolyamot a program állapítja meg).
- Admin nélküli éles írás kitalált munkamenettel.

## Rögzített döntések

- Forrás mindig nyer (D1, `docs/lesson-improvement.md`). Idézet = a letöltött DOCX kivont bekezdése.
- A 5–6. sávos kerettanterv 6. évfolyamos térképe: `classroom: 6`; a program a feltöltéses gyártáskor a forrásból újra besorolhat.
- Első szelet (élő gyártás, ha van admin): Természettudomány 5–6, Matematika 5–6 + OH-MAT06TA tanmenet, Magyar 5–6, Történelem 5–6, Digitális kultúra 5–6, Angol 5–6.
- Éles `POST /api/studio/lessons/one-step` vagy web-research csak `isAuthenticatedAdmin` mögött. 401 = BLOCKED, a repo-tudásbázis ettől még szállítandó.

## Érintett fájlok

- `docs/knowledge/nat2020-6/` (kivonatok, SOURCE.md, maps/*.json)
- `source/tests/nat2020-grade6-maps.test.ts`
- `docs/specs/2026-09-29-nat2020-grade6-knowledge-vegrehajtas.md`

## Elfogadás (EARS)

- WHEN a teszt betölti a `maps/*.json` fájlokat, THEN mindegyik átmegy a `knowledgeMapSchema`-n, `classroom === 6`, legalább 1 `sourceFiles` és ≥ 5 fogalom, minden fogalom `quote` mezője benne van a hivatkozott kivonatban.
- WHEN az élő admin API elérhető, THEN legalább egy 6. osztályos fúziós tananyag `GET /api/html-files` listában `classroom=6` új `id`-val megjelenik, és a preview URL 200.
- IF `/api/studio/maps` 401, THEN az éles publikálás BLOCKED, a repo-térképek akkor is GREEN.

## Unverified

Éles admin-munkamenet, Render/Neon írás, a program által megállapított évfolyam a feltöltött 5–6. sávos DOCX-re.
