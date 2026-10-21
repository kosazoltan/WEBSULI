---
name: websuli-gyartas-analitika
description: A Websuli tananyaggyártás / okosítás / javítás méréses felülvizsgálata — költség állomásonként, a javítókörök okai a Render-naplóból, minőségellenőrzés, 5-ös ciklusos javítás. Használd gyártási futások után, tömeges átalakításkor, vagy ha a gyártás drága / lassú / sok javítókört fut.
---

# Websuli gyártás-analitika (ciklusos felülvizsgálat)

Forrás: a régi anyagok éjszakai átalakítása (2026-10-20/21, 98 futás, ~$574), amelyet a tulajdonos „drága analitikaként” jelölt
ki. Minden mért hibát vissza kell vezetni a gyártóba. Tömeges, fizetős futás csak kifejezett, egyértelmű jóváhagyással indulhat,
5 anyagonként felülvizsgálattal (a `LEGACY_BATCH_LIMIT` ciklus-kapu: a tényleges sorelemszám + 5 / PR).

## 1. Költség és idő állomásonként (prod, csak olvasás)

A telemetria a `studio_jobs.output.telemetry.stations` mezőben van (input / cached / output / turns / fixTurns / ms). Ár (Opus 5.5):
$4 / MTok bemenet, $0,20 gyorsítótár-olvasás, $20 kimenet. A gyorsítótár-írás felára nincs benne, ezért a valós számla néhány
százalékkal magasabb.

```sql
with jobs as (select j.output->'telemetry' t from studio_jobs j where <szűrés: pl. a sor run-jai>)
select k allomas, count(*) n, round(avg((v->>'ms')::numeric)/1000) atl_mp,
  round(sum((v->>'input')::bigint - coalesce((v->>'cached')::bigint,0))*4/1e6 + sum(coalesce((v->>'cached')::bigint,0))*0.2/1e6
        + sum((v->>'output')::bigint)*20/1e6, 1) usd,
  round(avg((v->>'fixTurns')::numeric),2) atl_javito
from jobs, jsonb_each(t->'stations') e(k,v) group by 1 order by usd desc;
```

A kapuk: `t->'gates'` — `answerKeyFails`, `lektorRemoved`, `quizBlindRemoved`, `rubricTightened`, `outputTruncated`.

## 2. A javítókörök okai (Render-napló)

- A bank minden javítóköre naplósor: `[EGYFUTÁS] bankcsomag N. fejezet, K. kísérlet: <ok>`.
- Bányászat 10 perces ablakokban, lapozással: Render API `GET /v1/logs`, `text=kísérlet:`; a token a `RENDER_TOKEN` környezeti
  változóból, a chatbe és a kódba soha nem kerül.
- Kategóriák (a 98 futás mérése):

| Kód | Ok | Arány | Gyártói javítás |
|---|---|---|---|
| A1 | a válaszkulcs hibás próbája teljes pontot kap | 74% (207 „fordított”) | S3d csoportos szigorítás (1. ciklus) |
| F | számolós / referenciaérték | 9% | — |
| B | a minta nem teljes pont a saját rubrikán | 7% | — |
| C | kvíz (index / opciók / ismétlődés) | 3% | — |
| G | séma (üres `required`, ismétlődő `requiredDistinct`) | ~4% | — |

## 3. Minőségellenőrzés (csak olvasás)

Átalakított anyagonként ellenőrizd:
- `html_files.content_type = 'lesson'`, egy publikált `lessons` sor, és mentés (`material_improvement_backups.notes = 'legacy-studio-migration'`);
- legalább 2 fejezet, 45 feladat és 92 kvízkérdés;
- az évfolyam érvényes, és a 0-s kategória („Programozási alapismeretek”) megmarad;
- a nyilvános API: `GET /api/lessons/by-file/:id` **`X-Websuli-Scoring: 5`** fejléccel (nélküle 409 — ez a kliensverzió-kapu, nem hiba).

## 4. A ciklus menete

1. A sor a korlátnál megáll, a futók befejeződnek (AKTIV=0).
2. Az utolsó 5 anyag mérése: az 1–3. pont, összevetve az előző ciklussal.
3. A legnagyobb pazarlás vagy hiba javítása a háromfázisú rend szerint (terv → végrehajtás → kód), teszttel.
4. Kanban-jegy (Hermes kanban, `docs/kanban.md`) és memória-bejegyzés a tanulságról.
5. Egy PR: a javítás és a korlát (a tényleges sorelemszám + 5). Összevonás csak AKTIV=0 mellett.

## Csapdák

- **Analitikai archívum:** a válaszkulcs-esetek a 2026-10-21-i 1. ciklus előtt NEM maradtak meg. Azóta a `studio_jobs.output.answerKeyArchive`
  tárolja őket, így a futások offline visszajátszhatók.
- **Hibaüzenet:** a Drizzle `Failed query` üzenete nem tartalmazza a Postgres-okot. A hosszhibát a paraméterekből kell kikövetkeztetni
  (pl. `km_concepts.type` varchar(24)).
- **Deploy:** futás közben megszakítja a gyártást. A sor leállítása csak deployjal lehetséges, ezért a ciklus-kapu a megoldás.
