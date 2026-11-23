---
name: no-deploy-during-active-runs
description: "WEBSULI — merge a main-be (= Render autodeploy, szerver-újraindítás) csak akkor, ha nincs futó tananyaggyártás/javítás/okosítás"
metadata:
  node_type: memory
  type: feedback
  originSessionId: cce0558c-83f4-47c2-beaa-003dce27b7c3
  modified: 2026-11-17T08:00:00.000Z
---

Tulajdonosi utasítás (2026-10-19): mielőtt bármit deployolsz, ellenőrizd, van-e aktív tananyagkészítés vagy -javítás;
deploy ne szakítson meg futást. A tulajdonos saját futását is ide értsd.

**Why:** a main-be merge automatikusan kitelepít, és az újraindítás megöli a folyamatban lévő AI-futást. 2026-10-19-én
a #318 összevonása 2 órára beragasztotta a „Week 6” okosítást; 2026-11-16-án a sorozatos játék-PR-összevonások (#449,
#455) közben megszakadt a tulajdonos gyártása („már sikeresen megszakítottad a tananyaggyártást”) — az őr
pillanatfelvétel, a merge után induló futást nem látja.

**How to apply:**
- A teljes szabály és az eszköz a repóban: `docs/telepites-elotti-or.md` + `scripts/qa/active-runs-guard.sh`
  (0 = összevonható, 1 = aktív futás → várni és újra ellenőrizni, 2 = hiba → nem vakon összevonni); csapda: C-47.
- Az őrt KÖZVETLENÜL minden egyes `gh pr merge` előtt futtasd; a zöld PR-okat egy ablakban, egymás után vond össze;
  ha a tulajdonos aznap gyárt, az ablakot előre jelezd, utána nézd meg, maradt-e árva futás-sor, és szólj, ha újra kell
  indítania. `MP_MODE` ≠ off esetén a `GET https://websuli.vip/api/rt/status` `activeMatches` is legyen 0.
- Mérve 2026-11-16: a Render gyökérmappája `source/` — csak a `source/` alatti változás indít telepítést; a csak
  `docs/` / `scripts/` / gyökérfájlos összevonás nem indít újra szervert. A build-parancs a `render.yaml` szerinti szigorú
  (`npm ci … && npm run db:migrate && npm run build`; elbukott migráció megállítja a telepítést). Merge-módszer: squash.
- Kézi lekérdezés esetén: Neon SQL-over-HTTP `curl -K -`-vel (a kapcsolati szöveg nem kerül parancssorba), a
  `lesson_workflow_runs` oszlopa `state` (nem `status`); Git Bashben nincs `bc`.

Kapcsolódó: [[websuli-push-audit-hook]], [[resolve-only-answered-threads]], [[taskstop-orphan-monitor]].
