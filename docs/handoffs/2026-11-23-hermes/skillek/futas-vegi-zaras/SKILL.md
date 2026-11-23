---
name: futas-vegi-zaras
description: Kötelező futás végi tanulási hurok és környezethigiénia MINDEN repóban, minden elvégzett feladat (fejlesztés, javítás, PR, merge, vizsgálat) után és minden session végén — retró, csapda, memória, tapasztalat-kanban, skill-döntés, mappa / worktree / ág higiénia, majd a gépi futás végi ellenőrző zöldje. Töltsd be automatikusan, amikor egy feladat elkészült, mielőtt a záró jelentést adnád, és amikor a tulajdonos higiéniát, rendrakást, retrót vagy öntanulást kér.
---

# Futás végi zárás (minden repó, a Claude Code saját munkakörnyezetében)

Tulajdonosi utasítás (2026-11-22): minden elvégzett feladat után repónként kell vezetni a csapdafájlt, a memóriát, a
tapasztalat-kanbant, el kell dönteni, kell-e új skill, majd teljes környezethigiéniát kell végezni, és tiszta fával kell
várni a következő feladatot. Az ügynök állítása nem bizonyíték — a lezárás a gépi ellenőrző zöldje.

## A hurok (ebben a sorrendben, minden feladat után)

1. **Retró** — mért tényekből: mi ment rosszul, mennyibe került (idő, kör, USD), mit javítottunk (fájl), mi került kanbanra.
   - A repó saját retró-helye (ha van, pl. `docs/handoffs/*-retro.md`) a részletes retró.
   - EGY bejegyzés a projektmemória `retro-naplo.md`-jébe, felülre: `ÉÉÉÉ-HH-NN – <feladat> – hiba/költség – javítás (fájl) – kanban`.
2. **Csapda** — minden hibából, lassulásból, rossz döntésből új bejegyzés a repó csapdafájljába (pl. `docs/agent-csapdak.md`),
   a repó számozása szerint. Ha nem volt tanulság: írásos indok (`--csapda "nincs új: <ok>"`).
3. **Memória** — a projektmemória (`~/.claude/projects/<proj>/memory/`): új / frissített memóriafájl YAML-fejléccel
   (`name`, `description`, `metadata.type` ∈ user / feedback / project / reference), egy sor a `MEMORY.md`-ben; elavult
   memória frissítése vagy törlése; nincs duplikátum. Szerkezetváltozásnál: `python -X utf8 ~/.claude/scripts/tudasterkep.py`.
4. **Tapasztalat-kanban** — `~/.claude/projects/<proj>/kanban/tapasztalat-kanban.md` (létrehozás: az ellenőrző
   `--kanban-letrehoz` kapcsolója). Minden munka közben tapasztalt hiba kártya a „Hibák” oszlopban; a megoldott a
   „Megoldva — tanulság”-ba kerül (ok, megoldás, hely); ami skillbe / szabályba / szkriptbe épült, a „Beépítve”-be.
   A kártya dátuma a mai nap: `- [ÉÉÉÉ-HH-NN] …`. Ez a tábla a repó munkájából szerzett tapasztalat tartós forrása:
   új feladat előtt olvasd el.
   A repó saját feladat-kanbanja (ha van) ettől független, azt a repó szabálya szerint vezesd.
4b. **Ismétlődő hiba-osztály ellenőrzés (TÖRVÉNY, 2026-11-22)** — nézd át a tapasztalat-kanbant és a csapdafájlt: volt-e ebben a
   futásban olyan hiba, amely már szerepelt (ugyanaz az osztály)? Ha igen, az eddigi rögzítés nem volt elég: tegyél gépi
   kényszerítést (szkript / hook / teszt / futtató-szabály), ne csak szöveget. Nem konvergáló ellenőri köröknél a
   `~/.claude/scripts/vak-kor-konvergencia.py` megállási szabálya kötelező (követelmény → hibaosztály-leltár → kis PR → internetes
   szakmai forrás → tulajdonosi döntés).
5. **Skill-döntés** — kell-e új skill, vagy meglévő bővítése? Új skill, ha ugyanaz a többlépéses eljárás legalább kétszer
   előfordult, vagy egy hiba eljárási okból ismétlődhet. Ha igen: hozd létre / frissítsd (a repó skill-helyén; repó-független
   eljárásnál `~/.claude/skills/`), és ha a repó tükröz (`.agents/skills` ↔ `.claude/skills`), mindkét helyen.
   Nyilatkozat: `--skill "létrehozva: <név>" | "frissítve: <név>" | "nem kell: <ok>"`.
6. **Higiénia** — a fő checkout tiszta és friss (`git pull --ff-only`); a lezárt (beolvasztott) munkafák `git worktree remove`,
   a beolvasztott helyi ágak (és gyermekágak) törlése; ideiglenes / leválasztott munkafák eltávolítása; laza fájl nincs a
   gyökérben (felesleges fájl archiválva, nem törölve — ha a repó szabálya mást nem mond); távoli ág törlése CSAK a
   tulajdonos jóváhagyásával. Futó munka munkafáját nem bántod.
7. **Gépi ellenőrzés** — `python -X utf8 ~/.claude/scripts/futas-vegi-ellenor.py --repo <repó> --csapda "…" --kanban "…" --skill "…"`.
   Csak ZÖLD után van zárás; FAIL esetén a hiányt pótold és futtasd újra. A bizonyíték: `~/.claude/futas-vegi/<repó>-<idő>.json`.
   A záró jelentés hivatkozza a bizonyíték útvonalát.

## Megjegyzések

- A Claude Code környezetemben a tartós tudás helyei: a projektmemória (Markdown + YAML-fejléc, `MEMORY.md` index,
  `retro-naplo.md`, `projekt-tudasterkep.md`), a tapasztalat-kanban, a repó csapdafájlja és a skillek. Vektoros memória
  ebben a környezetben nincs; ha egy utasítás ilyet kér, jelezd, ne állítsd, hogy vezetted.
- A Stop hook (`~/.claude/hooks/futas-vegi-emlekezteto.mjs`) gyors módban lefuttatja az ellenőrzőt, és figyelmeztet; nem tilt.
- Ha a repó saját, szigorúbb futás végi kapuja van (pl. retró-kapu, higiénia-szkript), az is kötelező; ez a hurok kiegészíti.
