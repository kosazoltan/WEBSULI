# Kanban-állapot pillanatképek (2026-10-05 … 2026-11-02) — archív

A `docs/kanban.md`-ből szó szerint áthelyezve 2026-11-17-én (vezérlés-diéta, `docs/specs/2026-11-17-vezerles-dieta.md`).
A hiteles állapot mindig a kanban CLI `list` kimenete; ezek történeti pillanatképek.

## Állapot — 2026-11-02 (élesből és a CLI-ból ellenőrizve)

Tulajdonosi döntések 2026-11-02 (javaslatra, rögzítve a Hermes-táblán is):

| Tétel | Döntés | Bizonyíték |
|---|---|---|
| #5 ellenőrzés-költség | **A/B mérés jóváhagyva** (~60–90 USD, 5+5 anyag eldobható DB-n) — `docs/specs/2026-11-02-ellenorzes-effort-ab.md` | in_progress a táblán |
| 1120 (S5/S6 A/B) | **lezárva okafogyottként** — az S4b óta az egyfutásos gyártás nem használja az útvonalakat | kódból ellenőrizve |
| 1118 („két függő fogalom", 13f2102b) | **lezárva okafogyottként** — a lecke sehol nincs élesben (html_files, lessons, knowledge_maps, mentések: üres); kiváltja a #13 | éles lekérdezés 2026-11-02 |
| #13 (új) | TANÁRI FELÜLVIZSGÁLAT: 62 függő (`review_state='pending'`) fogalom 6 térképen — tulajdonosi admin-munka | éles lekérdezés 2026-11-02 |
| #11 | STANDING: befejezési mandátum (2026-11-01) | AGENTS.md |
| #12 | done: pool-crash javítás — PR #371 → 50a5512b, éles deploy 19:27:38 | Render-napló |

## Állapot — 2026-10-18 (kódból ellenőrizve)

A CLI `list --repo WEBSULI` 2026-10-18-án üres táblát adott, ezért az alábbiak a kódból és a git-történetből ellenőrzött
állapotok. A 2026-10-05-i táblázat alatta történetként marad.

| # | Állapot | Bizonyíték |
|---|---|---|
| 560 | kész | A webes út tudásbázissal épül: e91b501a (#66), az egyfutásos `webStudio` `knowledge` lépése (#203), az S4b a különálló webes HTML-utat törölte (d9e9c8e9) |
| 187 | PR | #308: induló mentés csak 24 órán belüli mentés hiányában, budapesti cron |
| 127 | PR | #309: böngészős hibajelentés a titok nélküli `/api/client-error`-on (eredet-allowlist, IP-korlát, napi plafon) |
| 1119 | okafogyott | A PR #182 összevonva |
| 1120 | beolvadt, részben | S8 #201, S6 #202, S7 #203, S5 #204. Az S4b óta az S5/S6 (katalógus, tantárgyi memória) nem jut el az egyfutásos gyártásig, és a fizetős A/B mérés nem futott: tulajdonosi döntés kell |
| 1118 | nyitott | Tartalmi tétel; a „két függő fogalom” nincs leírva, a leckét az adminban kell megnézni |
| 152 | STANDING | Tartós szabály |

## Állapot — 2026-10-05

A CLI `list` a hiteles forrás; ez a pillanatkép a 2026-10-05-i higiéniai söprés után készült.

| # | Státusz | Tárgy |
|---|---|---|
| 1113 | done | TUDÁSBANK S2–S4 — PR #189, #193; éles import: 201 lecke, 17 bank, 23 209 sor |
| 1114 | done | S9/S10 orkesztrátor, streamelés, automatikus folytatás — PR #190–#192 |
| 1115 | done | S11 OCR: bizonytalanság, szótár-őr, két erős olvasó fúziója — PR #192, #194, #195, #197 |
| 1116 | done | BANK determinisztikus normalizálás + kapu-javítás adagolva — PR #196; élő lecke 13f2102b |
| 1117 | done | BUG(lecke-adat): „jeggyel” kvízkulcs — éles javítás |
| 1118 | backlog | TANÁRI JAVÍTÁS: lecke 13f2102b két függő fogalma |
| 1119 | backlog | DÖNTÉS: nyitott PR #182 |
| 1120 | backlog | TUDÁSBANK S6 → S5 → S7 → S8 |
| 560 | backlog | BUG(web-research): tudásbázis nélkül készülő internetes HTML |
| 187 | backlog | BUG(autoBackup): szerverindulásonkénti mentés |
| 152 | backlog | Gyenge-modell végrehajtási fegyelem (STANDING) |
| 127 | backlog | Kliens hibariport HMAC-rétege |

Higiénia 2026-10-05: a review-ban ragadt #189/#191/#196/#197 és a doing #999 bizonyítékkal lezárva, a #202 duplikátum zárva;
munkafák (s10, s11, s116, continuous-release) eltávolítva; 107 beolvasztott helyi és 121 távoli ág törölve, a nem beolvasztott
`backup/pr-128-*` ágak `archive/*` tagben; a gyökér- és `source/` naplók a `tmp/_archiv-2026-10-05/` alá kerültek.

