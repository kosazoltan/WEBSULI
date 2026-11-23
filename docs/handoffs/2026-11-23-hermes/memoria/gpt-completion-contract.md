---
name: gpt-completion-contract
description: "GPT (OpenAI) modellek korai megállása ellen kötelező teljesítési szerződés + gépi teljesség-ellenőrző + automatikus folytatás (tulajdonos, 2026-11-20)"
metadata:
  node_type: memory
  type: feedback
  modified: 2026-11-20T07:15:12.469Z
---

A tulajdonos 2026-11-20-án kérte: az OpenAI-modellek (GPT-6.2 Sol / Astra, Codex CLI) hajlamosak tervet adni vagy a találatok után
megállni („folytassam?”, „a következő lépésben…”), ahelyett hogy a teljes jelentést javaslatokkal leírnák. Ezt hookkal / szkripttel /
prompttal kell kizárni.

**Why:** a GPT-futások nem interaktívak; egy félbehagyott vagy javaslat nélküli jelentés elvesztegetett fizetős kör és hamis „kész”.

**How to apply:**
- Minden GPT-megbízásba teljesítési szerződés kerül (nem interaktív, egy kör; tiltott megállási fordulatok; minden lelethez fájl:sor +
  forgatókönyv + javaslat; zárósor `TELJESSÉG: x / y — HIÁNYZÓ: …`). Az Astra közös megbízásába (`astra/kozos.md`) 2026-11-20-án bekerült.
- A kimenetet gépi ellenőrző nézi; hiányosnál automatikus folytatás ugyanabban a beszélgetésben a hiánylistával (max 3), utána érvénytelen.
- Tartós megvalósítás: `feat/gpt-teljesitesi-or` (a vak futtató ágára halmozva). Amíg nincs a mainen, kézzel ellenőrizd a zárósort és a
  javaslatokat, mielőtt egy GPT-jelentést ítéletként rögzítesz.
Kapcsolódó: [[blind-review-runner]], [[blind-bug-hunting-reviewer]].

**Kiegészítés (2026-11-20 délelőtt, tulajdonos):** a GPT-6.2 „minden jelzés nélkül megáll” → díjmentes életjel-felügyelet kell
(folyamat él-e, nő-e a napló / a `~/.codex/sessions/…/rollout-*<id>.jsonl`), beragadásnál (STALL perc) a pontos PID leállítása és
`codex exec resume <id>` folytatás; csendes megállásnál (kérdés / terv / hiányzó `TELJESSÉG:` zárósor) automatikus folytatás.
Orkesztrátori előkép: scratchpad `gpt-or.sh` (az Astra futtatója már ezzel megy); a tartós változat a `feat/gpt-teljesitesi-or` ágon.
Hosszú futásokat leválasztott folyamatként indíts (`levalaszt.sh`, Start-Process) — MÉRVE (2026-11-20 12:36Z): ez az app újraindulását NEM éli túl (a futtatók és a futó kapu is leállt, a gépi zár gazdátlan maradt). Újraindulás után: halott futtatók újraindítása, gazdátlan zár törlése (a gazda PID-je él-e), a megszakadt Codex-szelet `--resume`-mal.
