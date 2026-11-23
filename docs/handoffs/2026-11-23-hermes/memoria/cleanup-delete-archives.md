---
name: cleanup-delete-archives
description: "Takarításnál a régi archívum / mentés / soha nem keresett adat TÖRLENDŐ, nem megőrzendő (tulajdonos, 2026-11-18)"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 99a9b29f-318a-40fe-a572-f8ecf28ad2ae
  modified: 2026-11-18T07:09:29.662Z
---

A tulajdonos 2026-11-18-án a WEBSULI teljes takarítását kérte, és kifejezetten pontosított: „a régi, archivált, soha újra nem
keresett adatok se maradjanak benne a rendszerben, mert csak teljesen feleslegesen a szervert, a számítógépet és az egész
rendszert terheli.”

**Why:** az archívumok halmozódása terheli a gépet, a repót és az adatbázist (Neon-keret); az „archiválunk, nem törlünk” szokás
miatt a szemét csak áthelyeződött.

**How to apply:** kifejezett takarítási kérésnél a régi archívumok, mentések, összevont ágak, lezárt munkafák, elavult
tudásanyagok és bizonyítottan nem olvasott adatbázis-sorok törlési jelöltek. A globális CLAUDE.md „archiválva (nem törölve)”
szabálya a napi futás végi rendrakásra szól — ott továbbra is archiválunk (az én értelmezésem; ütközésnél kérdezz). Sorrend:
csak olvasó leltár → helyi, visszaállítható tételek törlése → visszafordíthatatlan tételek (távoli ág, éles adat, index)
tételes listával, mentéssel, a tulajdonos megerősítése után. Élő munkához (nyitott PR ága) nem nyúlunk.
Kapcsolódó: [[completion-mandate]], [[quality-gates-mandate]].
