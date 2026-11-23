---
name: taskstop-orphan-monitor
description: Windows-on a TaskStop a Monitor bash-gyerekfolyamatát nem öli meg — a merge-when-ready szkript tovább fut és összevonhat
metadata:
  node_type: memory
  type: project
  modified: 2026-11-17T13:49:07.990Z
---

2026-10-20: a #343 összevonó figyelőjét (`merge-when-ready.sh`) TaskStop-pal leállítottam, a bash-folyamat mégis tovább futott, és a
gyártás végén (AKTIV=0) összevonta a PR-t. Ez most nem okozott kárt (az őr már 0-t mutatott), de a leállítás nem volt valódi.

**Why:** Windows-on a Monitor/TaskStop a Git-bash gyerekfolyamatot nem mindig zárja le.

**How to apply:** ha egy figyelőt tényleg le kell állítani (pl. összevonót), a TaskStop után ellenőrizd és öld meg PowerShell-lel:
`Get-CimInstance Win32_Process | ? { $_.CommandLine -match 'merge-when-ready' }` → `Stop-Process -Id … -Force`. Összevonó figyelőt
inkább ne állíts le — hagyd az aktív-futás őrre ([[no-deploy-during-active-runs]]).

2026-11-17: ugyanez alügynököknél. 42 tegnapi `until grep … <napló>; do sleep; done` és `until gh pr checks …` hurok élte túl a
már befejezett alügynököket (a feltételük soha nem teljesült), ~29 000 mp processzoridőt égettek, és annyira lelassították a gépet,
hogy a futásőr 159 mp-ig futott (a merge-kapu 90 mp-et ad neki → a kapu bukott), a kapu-hook 3 mp-es git-hívása pedig
időtúllépésre futott.

**How to apply (2026-11-17):** (1) minden alügynök-briefbe: várakozó hurok csak felső korláttal (iterációszám / időkorlát), a
végén kilépéssel; (2) ha a gép lassú (egyszerű parancs timeoutol), ELSŐ lépés a folyamat-söprés: `Get-CimInstance Win32_Process
-Filter "Name='bash.exe'"` indulási nap és parancssor szerint — a korábbi napról maradt, lezárt munkára váró hurkokat pontos
mintaegyezéssel állítsd le, a maiakhoz ne nyúlj; (3) session végi higiéniánál ugyanez. Kapcsolódó: [[quality-gates-mandate]].
